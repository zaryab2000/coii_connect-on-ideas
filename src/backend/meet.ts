import type { MeetActions, WaveResult } from "@/app/meet";
import type { AppState, MeetView, Store, Toast } from "@/app/store";
import { invoke, rpc } from "@/backend/api";
import type { Supabase } from "@/backend/client";
import { toBackendError } from "@/backend/errors";
import { contactOf, meetViewOf, parseContacts, parseMeetState } from "@/backend/meetState";
import type { Contact, MeetState } from "@/backend/meetState";
import type { ReportReason } from "@/data/report";
import type { IconId, Person } from "@/data/types";
import type { EngineApi } from "@/engine/types";
import type { ChaiStatus } from "@/match/storage";
import { tribeOf } from "@/match/tribe";

const WAVE_RESULTS: readonly WaveResult[] = ["waved", "chai", "already", "quota", "unavailable"];
/** `get_contacts()` takes at most 200 ids per call. */
const CONTACTS_BATCH = 200;

export interface BackendMeetDeps {
  readonly supabase: Supabase;
  readonly engine: EngineApi;
  readonly store: Store<AppState>;
  readonly pushToast: (text: string, icon: IconId | null, tone: Toast["tone"]) => void;
  /** Someone just earned a wave point (you waved at them): "+1" pop and crowns. */
  readonly onPoint: (personId: string) => void;
  /** Handles learned from waves, to show on profiles and chai cards. */
  readonly onContacts: (contacts: ReadonlyMap<string, Contact>) => void;
  /** People you blocked changed: they disappear from your map. */
  readonly onBlocked: (blocked: readonly string[]) => void;
  /** Your all-time and today points, as the server counts them. */
  readonly onYourPoints: (points: number, today: number) => void;
}

function firstName(person: Person | undefined): string {
  return person?.name.split(" ")[0] ?? "them";
}

/**
 * The Meet loop in backend mode: the same actions as the demo, answered by the database
 * (docs/prd/database.md §8.4–8.6). The UI updates at once where the outcome is certain and
 * catches up with the server's answer otherwise.
 */
export class BackendMeet implements MeetActions {
  private state: MeetState | null = null;
  private readonly contacts = new Map<string, Contact>();
  private readonly pending = new Set<string>();
  private cancelReset: (() => void) | null = null;
  private syncing: Promise<void> | null = null;

  constructor(private readonly deps: BackendMeetDeps) {}

  // ---- lifecycle -------------------------------------------------------------------------------

  /** Re-reads Meet from the server, dealing today's hand first when it's due. */
  readonly sync = (): Promise<void> => {
    this.syncing ??= this.load().finally(() => {
      this.syncing = null;
    });
    return this.syncing;
  };

  private async load(): Promise<void> {
    if (!this.deps.store.get().you) return;
    try {
      let state = parseMeetState(await rpc(this.deps.supabase, "get_meet_state", {}));
      if (state.dealNeeded) {
        await invoke(this.deps.supabase, "deal-hand");
        state = parseMeetState(await rpc(this.deps.supabase, "get_meet_state", {}));
      }
      this.state = state;
      this.publish();
      this.scheduleReset(state.resetAt);
      await this.fetchContacts(state.waved);
    } catch (error) {
      this.fail(error);
    }
  }

  /** You left or signed out: forget everything. */
  reset(): void {
    this.state = null;
    this.contacts.clear();
    this.pending.clear();
    this.cancelReset?.();
    this.cancelReset = null;
    this.deps.store.set({ meet: null, tribe: false });
    this.deps.engine.setPicks([]);
    this.deps.engine.highlightPeople([]);
    this.deps.onContacts(this.contacts);
    this.deps.onBlocked([]);
  }

  private scheduleReset(resetAt: number): void {
    this.cancelReset?.();
    const id = window.setTimeout(
      () => void this.sync(),
      Math.max(1000, resetAt - Date.now() + 1000),
    );
    this.cancelReset = () => window.clearTimeout(id);
  }

  private publish(): void {
    const state = this.state;
    if (!state) return;
    const view: MeetView = meetViewOf(state);
    this.deps.store.set({ meet: view });
    this.deps.engine.setPicks(
      view.hand.map((c) => c.personId).filter((id) => view.revealed.includes(id)),
    );
    this.deps.onBlocked(state.blocked);
    this.deps.onYourPoints(state.points, state.todayPoints);
  }

  private update(change: (state: MeetState) => MeetState): void {
    if (!this.state) return;
    this.state = change(this.state);
    this.publish();
  }

  /** Tells you what went wrong; nothing fails silently (§15). */
  private fail(error: unknown): void {
    this.deps.pushToast(toBackendError(error).copy.text, null, "info");
  }

  /** Runs a call; on failure says why and re-reads the server's state. */
  private async attempt(call: () => Promise<unknown>): Promise<boolean> {
    try {
      await call();
      return true;
    } catch (error) {
      this.fail(error);
      await this.sync();
      return false;
    }
  }

  private async fetchContacts(waved: readonly string[]): Promise<void> {
    const missing = waved.filter((id) => !this.contacts.has(id));
    for (let start = 0; start < missing.length; start += CONTACTS_BATCH) {
      const ids = missing.slice(start, start + CONTACTS_BATCH);
      // Batches in order: each is one small request, and there are rarely more than one.
      // oxlint-disable-next-line eslint/no-await-in-loop
      const found = parseContacts(await rpc(this.deps.supabase, "get_contacts", { ids }));
      for (const [id, contact] of found) this.contacts.set(id, contact);
    }
    if (missing.length > 0) this.deps.onContacts(this.contacts);
  }

  private personById(id: string): Person | undefined {
    return this.deps.store.get().people.find((p) => p.id === id);
  }

  // ---- waves -------------------------------------------------------------------------------------

  readonly hasWaved = (personId: string): boolean => this.state?.waved.includes(personId) ?? false;

  /** Why a wave can't go out right now (decided here, before asking the server), or null. */
  private waveBlocker(me: Person | null, personId: string): WaveResult | null {
    if (!this.state || !me || personId === me.id) return "unavailable";
    if (this.hasWaved(personId) || this.pending.has(personId)) return "already";
    return this.state.wavesLeft <= 0 ? "quota" : null;
  }

  readonly wave = async (personId: string): Promise<WaveResult> => {
    // Right after joining, Meet may still be loading; wave once it knows your allowance.
    if (!this.state) await this.sync();
    const me = this.deps.store.get().you;
    const blocked = this.waveBlocker(me, personId);
    if (blocked || !me) return blocked ?? "unavailable";
    this.pending.add(personId);
    this.update((s) => ({ ...s, waved: [...s.waved, personId], wavesLeft: s.wavesLeft - 1 }));
    this.deps.engine.greet(personId);
    try {
      const answer = (await rpc(this.deps.supabase, "wave", { target: personId })) as Record<
        string,
        unknown
      >;
      const result = WAVE_RESULTS.find((r) => r === answer["result"]) ?? "unavailable";
      this.afterWave(me, personId, result, answer);
      return result;
    } catch (error) {
      this.fail(error);
      await this.sync();
      return "failed";
    } finally {
      this.pending.delete(personId);
    }
  };

  private afterWave(
    me: Person,
    personId: string,
    result: WaveResult,
    answer: Record<string, unknown>,
  ): void {
    const contact = contactOf(answer["contacts"]);
    if (contact) {
      this.contacts.set(personId, contact);
      this.deps.onContacts(this.contacts);
    }
    if (typeof answer["waves_left"] === "number") {
      const left = answer["waves_left"];
      this.update((s) => ({ ...s, wavesLeft: left }));
    }
    if (result === "waved" || result === "chai") this.deps.onPoint(personId);
    if (result === "chai") this.deps.engine.chaiMoment(me.id, personId);
    // A chai, a refusal or a surprise: the server's state tells the rest (celebration, quota).
    if (result !== "waved") void this.sync();
  }

  /** Realtime `wave_in`: someone waved at you. A count only, never who. */
  readonly someoneWaved = (points: number): void => {
    const me = this.deps.store.get().you;
    if (!me) return;
    this.update((s) => ({ ...s, points: Math.max(s.points, points) }));
    this.deps.onPoint(me.id);
    void this.sync();
  };

  /** Realtime `chai`: a wave of yours just became mutual. */
  readonly chaiStarted = (personId: string): void => {
    const me = this.deps.store.get().you;
    if (me) this.deps.engine.chaiMoment(me.id, personId);
    void this.sync();
  };

  // ---- cards and chais ---------------------------------------------------------------------------

  readonly revealCard = (personId: string): void => {
    if (!this.state || this.state.hand.revealed.includes(personId)) return;
    this.update((s) => ({ ...s, hand: { ...s.hand, revealed: [...s.hand.revealed, personId] } }));
    void this.attempt(() => rpc(this.deps.supabase, "reveal_card", { person: personId }));
  };

  readonly skip = (personId: string): void => {
    if (!this.state) return;
    this.update((s) => ({ ...s, skipped: [...new Set([...s.skipped, personId])] }));
    void this.attempt(() => rpc(this.deps.supabase, "skip", { person: personId }));
  };

  readonly dismissChai = (personId: string): void => {
    if (!this.state?.chais.some((c) => c.personId === personId && !c.seen)) return;
    this.setChai(personId, (c) => ({ ...c, seen: true }));
    void this.attempt(() => rpc(this.deps.supabase, "dismiss_chai", { person: personId }));
  };

  readonly markMessaged = (personId: string): void => {
    if (this.state?.chais.find((c) => c.personId === personId)?.status !== "new") return;
    void this.setStatus(personId, "messaged");
  };

  readonly confirmMet = (personId: string): void => {
    const chai = this.state?.chais.find((c) => c.personId === personId);
    if (!chai || chai.status === "met") return;
    void this.setStatus(personId, "met").then((bonus) => {
      const name = firstName(this.personById(personId));
      this.deps.pushToast(
        bonus ? `You met ${name}! +1 card in today's picks.` : `Nice! You met ${name}.`,
        "handshake",
        "success",
      );
      if (bonus) void this.sync();
    });
  };

  private async setStatus(personId: string, status: ChaiStatus): Promise<boolean> {
    this.setChai(personId, (c) => ({ ...c, status }));
    try {
      const answer = await rpc(this.deps.supabase, "set_chai_status", { person: personId, status });
      return (answer as { bonus_awarded?: unknown } | null)?.bonus_awarded === true;
    } catch (error) {
      this.fail(error);
      await this.sync();
      return false;
    }
  }

  private setChai(
    personId: string,
    change: (chai: MeetState["chais"][number]) => MeetState["chais"][number],
  ): void {
    this.update((s) => ({
      ...s,
      chais: s.chais.map((c) => (c.personId === personId ? change(c) : c)),
    }));
  }

  /** Unmatch removes both waves of the pair (both points go) and skips them for a week. */
  readonly unmatch = (personId: string): void => {
    if (!this.state?.chais.some((c) => c.personId === personId)) return;
    this.dropTies(personId);
    void this.attempt(() => rpc(this.deps.supabase, "unmatch", { person: personId })).then(
      () => void this.sync(),
    );
  };

  private dropTies(personId: string): void {
    this.update((s) => ({
      ...s,
      chais: s.chais.filter((c) => c.personId !== personId),
      waved: s.waved.filter((id) => id !== personId),
    }));
  }

  readonly toggleTribe = (): void => {
    const { you, tribe, people } = this.deps.store.get();
    if (!you) return;
    this.deps.store.set({ tribe: !tribe });
    this.deps.engine.highlightPeople(tribe ? [] : tribeOf(you, people));
  };

  // ---- safety ------------------------------------------------------------------------------------

  /** Blocks someone: their waves, chais and addas with you go, and they leave your map. */
  readonly block = async (personId: string): Promise<boolean> => {
    if (!this.state) return false;
    this.dropTies(personId);
    this.update((s) => ({ ...s, blocked: [...new Set([...s.blocked, personId])] }));
    const ok = await this.attempt(() => rpc(this.deps.supabase, "block", { person: personId }));
    void this.sync();
    return ok;
  };

  readonly report = async (personId: string, reason: ReportReason): Promise<boolean> => {
    try {
      await rpc(this.deps.supabase, "report", { person: personId, reason });
      return true;
    } catch (error) {
      this.fail(error);
      return false;
    }
  };
}
