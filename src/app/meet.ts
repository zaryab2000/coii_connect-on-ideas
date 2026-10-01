import type { AppState, MeetView, Store, Toast } from "@/app/store";
import type { IconId, Person } from "@/data/types";
import type { EngineApi } from "@/engine/types";
import { daysBetween, meetDay, nextResetAt } from "@/match/day";
import { demoInboundWaves, demoReply } from "@/match/demoBots";
import { buildHand } from "@/match/hand";
import type { Card } from "@/match/hand";
import type { Eligibility, ScoreContext } from "@/match/score";
import { clearMeet, loadMeet, saveMeet } from "@/match/storage";
import type { Chai, ChaiStatus, DayHand, MeetSave } from "@/match/storage";
import { tribeOf } from "@/match/tribe";

export const WAVES_PER_DAY = 20;
const HAND_SIZE = 3;
const BONUS_MAX = 3;
const SKIP_DAYS = 7;
const DAY_MS = 86_400_000;

export type WaveResult = "waved" | "chai" | "already" | "quota" | "unavailable";

/** Time, randomness and timers, injectable so the Meet loop is testable. */
export interface MeetClock {
  now(): number;
  random(): number;
  /** Runs `fn` after `ms`; returns a function that cancels it. */
  schedule(fn: () => void, ms: number): () => void;
}

export const realClock: MeetClock = {
  now: () => Date.now(),
  random: () => Math.random(),
  schedule(fn, ms) {
    const id = globalThis.setTimeout(fn, ms);
    return () => globalThis.clearTimeout(id);
  },
};

export interface MeetActions {
  /** Flip one of today's cards. */
  revealCard(personId: string): void;
  wave(personId: string): WaveResult;
  /** Take a wave back (only before it became a chai). */
  unwave(personId: string): void;
  /** Hide someone from your hands for a week. */
  skip(personId: string): void;
  /** Close the "Chai's on!" moment. */
  dismissChai(): void;
  markMessaged(personId: string): void;
  /** You met in person: the chai is done and today's hand grows by a bonus card. */
  confirmMet(personId: string): void;
  toggleTribe(): void;
}

export interface MeetController extends MeetActions {
  /** Re-reads you and today's hand; call after joining, leaving or at a new day. */
  sync(): void;
  /** Forget everything Meet stored for you (on leaving). */
  forget(): void;
}

type PushToast = (text: string, icon: IconId | null, tone: Toast["tone"]) => void;

function addDays(day: string, days: number): string {
  return new Date(Date.parse(day) + days * DAY_MS).toISOString().slice(0, 10);
}

function firstName(person: Person): string {
  return person.name.split(" ")[0] ?? person.name;
}

function todayHand(save: MeetSave): DayHand | undefined {
  return save.hands[save.hands.length - 1];
}

/** People seen in hands over the last 3 days fade back in (PRD §6.3 `shownBefore`). */
function contextFor(save: MeetSave, day: string, now: number): ScoreContext {
  const shown = new Map<string, number>();
  for (const hand of save.hands) {
    const ago = daysBetween(hand.day, day);
    if (ago < 1 || ago > 3) continue;
    for (const card of hand.cards) {
      shown.set(card.personId, Math.max(shown.get(card.personId) ?? 0, 1 - (ago - 1) / 3));
    }
  }
  return { now, shownBefore: shown, wavedAtViewer: new Set(save.inbound), inbound: new Map() };
}

function eligibilityFor(save: MeetSave, day: string): Eligibility {
  const excluded = new Set<string>();
  for (const wave of save.waves) excluded.add(wave.to);
  for (const chai of save.chais) excluded.add(chai.personId);
  for (const skip of save.skips) if (skip.until > day) excluded.add(skip.id);
  return { excluded, allowDemo: true };
}

function viewOf(save: MeetSave, day: string, now: number): MeetView {
  const hand = todayHand(save);
  const chaiIds = new Set(save.chais.map((c) => c.personId));
  const wavesToday = save.waves.filter((w) => w.day === day).length;
  return {
    day,
    resetAt: nextResetAt(now),
    hand: hand?.cards ?? [],
    revealed: hand?.revealed ?? [],
    waved: save.waves.map((w) => w.to),
    wavesLeft: Math.max(0, WAVES_PER_DAY - wavesToday),
    skipped: save.skips.filter((s) => s.until > day).map((s) => s.id),
    chais: save.chais,
    inbound: save.inbound.filter((id) => !chaiIds.has(id)).length,
    celebrate: save.chais.find((c) => !c.seen)?.personId ?? null,
  };
}

function withChaiStatus(save: MeetSave, personId: string, status: ChaiStatus): MeetSave {
  return {
    ...save,
    chais: save.chais.map((c) => (c.personId === personId ? { ...c, status } : c)),
  };
}

/**
 * Who-should-I-meet game loop for the demo phase (PRD Phase 0): hands, waves, chais and tribe
 * mode, persisted in this browser. Demo people answer waves through `demoReply`.
 */
class Meet implements MeetController {
  private save: MeetSave | null = null;
  private cancelReset: (() => void) | null = null;
  private readonly replies = new Map<string, () => void>();

  constructor(
    private readonly engine: EngineApi,
    private readonly store: Store<AppState>,
    private readonly pushToast: PushToast,
    private readonly clock: MeetClock,
  ) {}

  // ---- lifecycle -------------------------------------------------------------------------------

  readonly sync = (): void => {
    const me = this.you();
    if (!me) {
      this.reset();
      return;
    }
    if (this.save?.personId !== me.id) this.save = loadMeet(me.id);
    this.save = this.dealToday(me, this.save);
    this.publish();
    this.scheduleReset();
  };

  readonly forget = (): void => {
    clearMeet();
    this.reset();
  };

  private reset(): void {
    this.save = null;
    this.cancelReset?.();
    this.cancelReset = null;
    for (const cancel of this.replies.values()) cancel();
    this.replies.clear();
    this.store.set({ meet: null, tribe: false });
    this.engine.setPicks([]);
    this.engine.highlightPeople([]);
  }

  private scheduleReset(): void {
    this.cancelReset?.();
    const wait = nextResetAt(this.clock.now()) - this.clock.now() + 1000;
    this.cancelReset = this.clock.schedule(this.sync, wait);
  }

  // ---- helpers -----------------------------------------------------------------------------

  private you(): Person | null {
    return this.store.get().you;
  }

  private day(): string {
    return meetDay(this.clock.now());
  }

  private personById(id: string): Person | undefined {
    return this.store.get().people.find((p) => p.id === id);
  }

  private publish(): void {
    if (!this.save) return;
    saveMeet(this.save);
    const view = viewOf(this.save, this.day(), this.clock.now());
    this.store.set({ meet: view });
    this.engine.setPicks(
      view.hand.map((c) => c.personId).filter((id) => view.revealed.includes(id)),
    );
  }

  private deal(
    me: Person,
    save: MeetSave,
    day: string,
    size: number,
    keep?: readonly Card[],
  ): Card[] {
    return buildHand({
      viewer: me,
      people: this.store.get().people,
      day,
      size,
      context: contextFor(save, day, this.clock.now()),
      eligibility: eligibilityFor(save, day),
      ...(keep ? { keep } : {}),
    });
  }

  private dealToday(me: Person, current: MeetSave): MeetSave {
    const today = this.day();
    if (todayHand(current)?.day === today) return current;
    let next = current;
    if (next.inboundDay !== today) {
      const fresh = demoInboundWaves(me, this.store.get().people, this.clock.random);
      next = { ...next, inbound: [...new Set([...next.inbound, ...fresh])], inboundDay: today };
    }
    const cards = this.deal(me, next, today, HAND_SIZE);
    return { ...next, hands: [...next.hands, { day: today, cards, revealed: [], bonus: 0 }] };
  }

  private updateToday(change: (hand: DayHand) => DayHand): void {
    const hand = this.save && todayHand(this.save);
    if (!this.save || !hand) return;
    this.save = { ...this.save, hands: [...this.save.hands.slice(0, -1), change(hand)] };
    this.publish();
  }

  // ---- waves and chais -------------------------------------------------------------------------

  /** Why a wave can't happen right now, or null when it can. */
  private waveBlocker(personId: string): WaveResult | null {
    const me = this.you();
    const target = this.personById(personId);
    if (!this.save || !me || !target || target.id === me.id) return "unavailable";
    if (this.save.waves.some((w) => w.to === personId)) return "already";
    const today = this.day();
    const wavesToday = this.save.waves.filter((w) => w.day === today).length;
    return wavesToday >= WAVES_PER_DAY ? "quota" : null;
  }

  readonly wave = (personId: string): WaveResult => {
    const blocked = this.waveBlocker(personId);
    const me = this.you();
    const target = this.personById(personId);
    if (blocked || !this.save || !me || !target) return blocked ?? "unavailable";
    const wave = { to: personId, at: this.clock.now(), day: this.day() };
    this.save = { ...this.save, waves: [...this.save.waves, wave] };
    this.engine.greet(personId);
    if (this.save.inbound.includes(personId)) {
      this.addChai(personId, target.isDemo);
      return "chai";
    }
    if (target.isDemo) this.scheduleDemoReply(me, target);
    this.publish();
    return "waved";
  };

  private addChai(personId: string, demo: boolean): void {
    const me = this.you();
    if (!this.save || !me || this.save.chais.some((c) => c.personId === personId)) return;
    const chai: Chai = { personId, at: this.clock.now(), status: "new", demo, seen: false };
    this.save = { ...this.save, chais: [...this.save.chais, chai] };
    this.publish();
    this.engine.chaiMoment(me.id, personId);
  }

  private scheduleDemoReply(me: Person, target: Person): void {
    const reply = demoReply(me, target, this.clock.random);
    if (!reply.wavesBack) return;
    const cancel = this.clock.schedule(() => {
      this.replies.delete(target.id);
      if (this.save?.waves.some((w) => w.to === target.id)) this.addChai(target.id, true);
    }, reply.delayMs);
    this.replies.set(target.id, cancel);
  }

  readonly unwave = (personId: string): void => {
    if (!this.save || this.save.chais.some((c) => c.personId === personId)) return;
    this.replies.get(personId)?.();
    this.replies.delete(personId);
    this.save = { ...this.save, waves: this.save.waves.filter((w) => w.to !== personId) };
    this.publish();
  };

  readonly dismissChai = (): void => {
    const first = this.save?.chais.find((c) => !c.seen);
    if (!this.save || !first) return;
    const chais = this.save.chais.map((c) => (c === first ? { ...c, seen: true } : c));
    this.save = { ...this.save, chais };
    this.publish();
  };

  readonly markMessaged = (personId: string): void => {
    const chai = this.save?.chais.find((c) => c.personId === personId);
    if (!this.save || chai?.status !== "new") return;
    this.save = withChaiStatus(this.save, personId, "messaged");
    this.publish();
  };

  readonly confirmMet = (personId: string): void => {
    const me = this.you();
    const met = this.personById(personId);
    const chai = this.save?.chais.find((c) => c.personId === personId);
    if (!this.save || !me || !met || !chai || chai.status === "met") return;
    this.save = withChaiStatus(this.save, personId, "met");
    this.publish();
    this.awardBonus(me, met);
  };

  private awardBonus(me: Person, met: Person): void {
    const hand = this.save && todayHand(this.save);
    if (!this.save || !hand || hand.bonus >= BONUS_MAX) {
      this.pushToast(`Nice! You met ${firstName(met)}.`, "handshake", "success");
      return;
    }
    const cards = this.deal(me, this.save, hand.day, HAND_SIZE + hand.bonus + 1, hand.cards);
    this.updateToday((h) => ({ ...h, cards, bonus: h.bonus + 1 }));
    this.pushToast(`You met ${firstName(met)}! +1 card in today's Adda 3.`, "handshake", "success");
  }

  // ---- cards and map ---------------------------------------------------------------------------

  readonly revealCard = (personId: string): void => {
    this.updateToday((h) =>
      h.revealed.includes(personId) ? h : { ...h, revealed: [...h.revealed, personId] },
    );
  };

  readonly skip = (personId: string): void => {
    if (!this.save) return;
    const until = addDays(this.day(), SKIP_DAYS);
    const skips = [...this.save.skips.filter((s) => s.id !== personId), { id: personId, until }];
    this.save = { ...this.save, skips };
    this.publish();
  };

  readonly toggleTribe = (): void => {
    const me = this.you();
    if (!me) return;
    const tribe = !this.store.get().tribe;
    this.store.set({ tribe });
    this.engine.highlightPeople(tribe ? tribeOf(me, this.store.get().people) : []);
  };
}

export function createMeet(
  engine: EngineApi,
  store: Store<AppState>,
  pushToast: PushToast,
  clock: MeetClock,
): MeetController {
  return new Meet(engine, store, pushToast, clock);
}
