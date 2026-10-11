import { demoAnswer, demoCrew, demoInviter, demoLook } from "@/adda/demo";
import { clearAdda, loadAdda, saveAdda } from "@/adda/storage";
import type { AddaMember, AddaRef, AddaSave, MyAdda } from "@/adda/storage";
import type { MeetClock, MeetController } from "@/app/meet";
import type { AddaView, AppState, Store, Toast } from "@/app/store";
import { ADDA_MAX, ADDAS_MAX, cleanAddaName, defaultAddaName } from "@/data/adda";
import type { AddaLook, AddaSpot, PlotMode } from "@/data/adda";
import type { IconId, Person } from "@/data/types";
import type { AddaMapMember, AddaMapView, EngineApi } from "@/engine/types";

/** Most demo invites that arrive on their own per visit. */
const INVITE_DRIP_MAX = 2;
/** Demo invites wait a couple of minutes, so they never land on top of joining. */
const FIRST_INVITE_MS = 150_000;
const INVITE_SPREAD_MS = 120_000;

/** How an invite went. `failed`: the server couldn't be reached and you were already told why. */
export type InviteResult =
  | "invited"
  | "needs_adda"
  | "needs_wave"
  | "full"
  | "already"
  | "unavailable"
  | "failed";

/** Result of the drag-and-drop shortcut: wave (if needed) and add in one go. */
export type WaveAndAddResult = InviteResult | "quota";

/** What the UI may ask of adda. Creating and inviting resolve asynchronously in backend mode. */
export interface AddaActions {
  /** Builds a new adda (up to three); returns its id, or null when you already have three. */
  createAdda(look: AddaLook, name?: string): Promise<string | null>;
  /** Changes an adda's look and name. */
  editAdda(addaId: string, look: AddaLook, name: string): void;
  /** Takes the tent down; its people are silently let go. */
  deleteAdda(addaId: string): void;
  /** Invites someone you have waved at to one of your addas. They see it's you. */
  inviteToAdda(personId: string, addaId: string): Promise<InviteResult>;
  /** Waves at them if you haven't yet, then invites them; they drop into the tent. */
  waveAndAdd(personId: string, addaId: string): Promise<WaveAndAddResult>;
  /** Takes back an invite or removes a member, silently. */
  removeFromAdda(personId: string, addaId: string): void;
  /** Joins their adda: you wave back for free, which makes it a chai. */
  acceptAddaInvite(invite: AddaRef): void;
  /** Says "not now"; they are never told. */
  declineAddaInvite(invite: AddaRef): void;
  leaveAdda(adda: AddaRef): void;
  /** Shows an adda you joined on the map next to yours (null hides it) and flies there. */
  viewAdda(adda: AddaRef | null): void;
  /** Flies to one of the tents on the map. */
  focusAdda(addaId: string): void;
  /** Remembers where you dragged one of your tents. */
  moveAdda(addaId: string, mode: PlotMode, spot: AddaSpot): void;
  /** Closes the "wave + add first" popup. */
  dismissAddaDrop(): void;
  /** Opens the share card for one of your addas. */
  shareAdda(addaId: string): void;
}

/** Adda actions the demo decides on the spot. */
interface AddaNow {
  createAdda(look: AddaLook, name?: string): string | null;
  inviteToAdda(personId: string, addaId: string): InviteResult;
  waveAndAdd(personId: string, addaId: string): WaveAndAddResult;
}

/** The demo-mode adda loop. */
export interface AddaController extends Omit<AddaActions, keyof AddaNow>, AddaNow {
  /** Re-reads you; call after joining or leaving. */
  sync(): void;
  /** Forget everything adda stored for you (on leaving). */
  forget(): void;
  /** You dropped a bean on one of your tents. */
  beanDropped(personId: string, addaId: string): void;
}

type PushToast = (text: string, icon: IconId | null, tone: Toast["tone"]) => void;

export interface AddaDeps {
  readonly engine: EngineApi;
  readonly store: Store<AppState>;
  readonly meet: MeetController;
  readonly pushToast: PushToast;
  readonly clock: MeetClock;
}

export function firstName(person: Person): string {
  return person.name.split(" ")[0] ?? person.name;
}

function viewOf(save: AddaSave): AddaView {
  return { addas: save.addas, invites: save.invites, joined: save.joined, viewing: save.viewing };
}

/**
 * The tents on the map: yours (with everyone invited or in) plus one adda you joined, if you
 * chose to show it. People who aren't in the venue (left, hidden, blocked) are left out.
 */
export function addaMapViews(
  view: AddaView,
  me: Person,
  personById: (id: string) => Person | undefined,
): AddaMapView[] {
  const member = (id: string, pending: boolean): AddaMapMember[] => {
    const person = personById(id);
    return person ? [{ person, pending }] : [];
  };
  const mine: AddaMapView[] = view.addas.map((adda) => ({
    id: adda.id,
    ownerId: me.id,
    mine: true,
    places: adda.places,
    label: adda.name,
    look: adda.look,
    members: [
      ...member(me.id, false),
      ...adda.members.flatMap((m) => member(m.personId, m.status === "invited")),
    ],
  }));
  const shown = view.joined.find((j) => sameRef(j, view.viewing));
  const owner = shown && personById(shown.ownerId);
  if (!shown || !owner) return mine;
  const ids = [owner.id, me.id, ...shown.memberIds.filter((id) => id !== me.id)];
  const theirs: AddaMapView = {
    id: shown.addaId,
    ownerId: owner.id,
    mine: false,
    places: {},
    label: shown.name,
    look: shown.look,
    members: ids.flatMap((id) => member(id, false)),
  };
  return [...mine, theirs];
}

export function sameRef(a: AddaRef, b: AddaRef | null): boolean {
  return b !== null && a.ownerId === b.ownerId && a.addaId === b.addaId;
}

function changeAdda(save: AddaSave, addaId: string, change: (adda: MyAdda) => MyAdda): AddaSave {
  return { ...save, addas: save.addas.map((a) => (a.id === addaId ? change(a) : a)) };
}

function withStatus(adda: MyAdda, personId: string, status: AddaMember["status"]): MyAdda {
  return {
    ...adda,
    members: adda.members.map((m) => (m.personId === personId ? { ...m, status } : m)),
  };
}

/**
 * Adda game loop for the demo phase: up to three tents of your own, invites both ways and demo
 * answers, persisted in this browser. The map shows your tents plus one you joined, if chosen.
 */
class Adda implements AddaController {
  private save: AddaSave | null = null;
  private readonly answers = new Map<string, () => void>();
  private cancelDrip: (() => void) | null = null;
  private drips = 0;
  private nextId = 0;

  constructor(private readonly deps: AddaDeps) {}

  // ---- lifecycle -------------------------------------------------------------------------------

  readonly sync = (): void => {
    const me = this.you();
    if (!me) return this.reset();
    if (this.save?.personId !== me.id) this.save = loadAdda(me.id);
    this.publish();
    if (!this.cancelDrip) this.scheduleDrip();
  };

  readonly forget = (): void => {
    clearAdda();
    this.reset();
  };

  private reset(): void {
    this.save = null;
    for (const cancel of this.answers.values()) cancel();
    this.answers.clear();
    this.cancelDrip?.();
    this.cancelDrip = null;
    this.deps.store.set({ adda: null, addaDrop: null });
    this.deps.engine.setAddas([]);
  }

  // ---- helpers ---------------------------------------------------------------------------------

  private you(): Person | null {
    return this.deps.store.get().you;
  }

  private personById(id: string): Person | undefined {
    return this.deps.store.get().people.find((p) => p.id === id);
  }

  private addaById(addaId: string): MyAdda | undefined {
    return this.save?.addas.find((a) => a.id === addaId);
  }

  private update(change: (save: AddaSave) => AddaSave): void {
    if (!this.save) return;
    this.save = change(this.save);
    this.publish();
  }

  private publish(): void {
    if (!this.save) return;
    saveAdda(this.save);
    this.deps.store.set({ adda: viewOf(this.save) });
    this.deps.engine.setAddas(this.mapViews(this.save));
  }

  private mapViews(save: AddaSave): AddaMapView[] {
    const me = this.you();
    return me ? addaMapViews(viewOf(save), me, (id) => this.personById(id)) : [];
  }

  // ---- your addas ------------------------------------------------------------------------------

  readonly createAdda = (look: AddaLook, name?: string): string | null => {
    const me = this.you();
    if (!this.save || !me || this.save.addas.length >= ADDAS_MAX) return null;
    this.nextId++;
    const id = `adda-${this.deps.clock.now().toString(36)}-${this.nextId}`;
    const fallback = defaultAddaName(firstName(me), this.save.addas.length);
    const adda: MyAdda = {
      id,
      name: cleanAddaName(name ?? "") ?? fallback,
      look,
      members: [],
      declined: [],
      places: {},
    };
    const first = this.save.addas.length === 0;
    this.update((s) => ({ ...s, addas: [...s.addas, adda] }));
    this.deps.pushToast(
      first ? "Your adda is up! Drag it anywhere outside the ring." : `${adda.name} is up!`,
      "party_popper",
      "success",
    );
    return id;
  };

  readonly editAdda = (addaId: string, look: AddaLook, name: string): void => {
    this.update((s) =>
      changeAdda(s, addaId, (a) => ({ ...a, look, name: cleanAddaName(name) ?? a.name })),
    );
  };

  readonly deleteAdda = (addaId: string): void => {
    const adda = this.addaById(addaId);
    for (const m of adda?.members ?? []) this.cancelAnswer(addaId, m.personId);
    this.update((s) => ({ ...s, addas: s.addas.filter((a) => a.id !== addaId) }));
  };

  private inviteRule(adda: MyAdda | undefined, personId: string): InviteResult | null {
    if (!adda) return "needs_adda";
    if (adda.members.some((m) => m.personId === personId)) return "already";
    if (!this.deps.meet.hasWaved(personId)) return "needs_wave";
    return adda.members.length >= ADDA_MAX ? "full" : null;
  }

  readonly inviteToAdda = (personId: string, addaId: string): InviteResult => {
    const me = this.you();
    const target = this.personById(personId);
    if (!this.save || !me || !target || target.id === me.id) return "unavailable";
    const blocked = this.inviteRule(this.addaById(addaId), personId);
    if (blocked) return blocked;
    const member: AddaMember = { personId, status: "invited", invitedAt: this.deps.clock.now() };
    this.update((s) => changeAdda(s, addaId, (a) => ({ ...a, members: [...a.members, member] })));
    if (target.isDemo) this.scheduleAnswer(me, target, addaId);
    return "invited";
  };

  readonly waveAndAdd = (personId: string, addaId: string): WaveAndAddResult => {
    if (!this.deps.meet.hasWaved(personId)) {
      const waved = this.deps.meet.waveForAdda(personId);
      if (waved === "quota" || waved === "unavailable") return waved;
    }
    const result = this.inviteToAdda(personId, addaId);
    if (result === "invited") this.deps.engine.dropIn(addaId, personId);
    this.deps.store.set({ addaDrop: null, overlay: "none" });
    return result;
  };

  private answerKey(addaId: string, personId: string): string {
    return `${addaId}:${personId}`;
  }

  private cancelAnswer(addaId: string, personId: string): void {
    const key = this.answerKey(addaId, personId);
    this.answers.get(key)?.();
    this.answers.delete(key);
  }

  private scheduleAnswer(me: Person, target: Person, addaId: string): void {
    const answer = demoAnswer(me, target, this.deps.clock.random);
    const key = this.answerKey(addaId, target.id);
    const cancel = this.deps.clock.schedule(() => {
      this.answers.delete(key);
      const member = this.addaById(addaId)?.members.find((m) => m.personId === target.id);
      if (member?.status !== "invited") return;
      if (answer.joins) this.memberJoined(target, addaId);
      else
        this.update((s) =>
          changeAdda(s, addaId, (a) => ({ ...a, declined: [...a.declined, target.id] })),
        );
    }, answer.delayMs);
    this.answers.set(key, cancel);
  }

  private memberJoined(person: Person, addaId: string): void {
    this.update((s) => changeAdda(s, addaId, (a) => withStatus(a, person.id, "joined")));
    this.deps.meet.theyWaved(person.id);
    const name = this.addaById(addaId)?.name ?? "your adda";
    this.deps.pushToast(
      `${firstName(person)} joined ${name}! You're meeting at Devcon.`,
      "handshake",
      "success",
    );
  }

  readonly removeFromAdda = (personId: string, addaId: string): void => {
    this.cancelAnswer(addaId, personId);
    this.update((s) =>
      changeAdda(s, addaId, (a) => ({
        ...a,
        members: a.members.filter((m) => m.personId !== personId),
        declined: a.declined.filter((id) => id !== personId),
      })),
    );
  };

  readonly moveAdda = (addaId: string, mode: PlotMode, spot: AddaSpot): void => {
    this.update((s) =>
      changeAdda(s, addaId, (a) => ({ ...a, places: { ...a.places, [mode]: spot } })),
    );
  };

  // ---- dropping people on a tent -----------------------------------------------------------------

  readonly beanDropped = (personId: string, addaId: string): void => {
    const me = this.you();
    const adda = this.addaById(addaId);
    const person = this.personById(personId);
    if (!me || !adda || !person || person.id === me.id) return;
    if (adda.members.some((m) => m.personId === personId)) {
      this.deps.pushToast(
        `${firstName(person)} is already in ${adda.name}.`,
        "circus_tent",
        "info",
      );
      return;
    }
    this.deps.store.set({ addaDrop: { personId, addaId }, overlay: "drop" });
  };

  readonly dismissAddaDrop = (): void => {
    this.deps.store.set({ addaDrop: null, overlay: "none" });
  };

  readonly shareAdda = (addaId: string): void => {
    if (!this.addaById(addaId)) return;
    this.deps.store.set({ shareAddaId: addaId, overlay: "share" });
  };

  // ---- other people's addas --------------------------------------------------------------------

  readonly acceptAddaInvite = (invite: AddaRef): void => {
    const found = this.save?.invites.find((i) => sameRef(i, invite));
    const owner = this.personById(invite.ownerId);
    const me = this.you();
    if (!found || !owner || !me) return;
    const joined = {
      ownerId: owner.id,
      addaId: found.addaId,
      name: found.name,
      look: demoLook(owner.id),
      memberIds: demoCrew(owner, this.deps.store.get().people, me.id),
    };
    this.update((s) => ({
      ...s,
      invites: s.invites.filter((i) => !sameRef(i, invite)),
      joined: [...s.joined.filter((j) => !sameRef(j, invite)), joined],
    }));
    this.deps.meet.theyWaved(owner.id);
    this.deps.meet.waveFree(owner.id);
    this.deps.pushToast(
      `You're in ${found.name}! You and ${firstName(owner)} are meeting at Devcon.`,
      "handshake",
      "success",
    );
  };

  readonly declineAddaInvite = (invite: AddaRef): void => {
    this.update((s) => ({ ...s, invites: s.invites.filter((i) => !sameRef(i, invite)) }));
  };

  readonly leaveAdda = (adda: AddaRef): void => {
    this.update((s) => ({
      ...s,
      joined: s.joined.filter((j) => !sameRef(j, adda)),
      viewing: sameRef(adda, s.viewing) ? null : s.viewing,
    }));
  };

  readonly viewAdda = (adda: AddaRef | null): void => {
    if (!this.save) return;
    if (adda && !this.save.joined.some((j) => sameRef(j, adda))) return;
    this.update((s) => ({ ...s, viewing: adda }));
    if (adda) this.deps.engine.focusAdda(adda.addaId);
  };

  readonly focusAdda = (addaId: string): void => {
    this.deps.engine.focusAdda(addaId);
  };

  /** Now and then a demo person who shares your topics invites you to their adda. */
  private scheduleDrip(): void {
    if (this.drips >= INVITE_DRIP_MAX) return;
    this.cancelDrip = this.deps.clock.schedule(
      () => {
        this.cancelDrip = null;
        this.drip();
        this.scheduleDrip();
      },
      FIRST_INVITE_MS + this.deps.clock.random() * INVITE_SPREAD_MS,
    );
  }

  private drip(): void {
    const me = this.you();
    const save = this.save;
    if (!me || !save) return;
    const taken = new Set([
      me.id,
      ...save.addas.flatMap((a) => a.members.map((m) => m.personId)),
      ...save.invites.map((i) => i.ownerId),
      ...save.joined.map((j) => j.ownerId),
    ]);
    const inviter = demoInviter(me, this.deps.store.get().people, taken, this.deps.clock.random);
    if (!inviter) return;
    this.drips++;
    const name = defaultAddaName(firstName(inviter), 0);
    const invite = {
      ownerId: inviter.id,
      addaId: `${inviter.id}:adda`,
      name,
      at: this.deps.clock.now(),
    };
    this.update((s) => ({ ...s, invites: [...s.invites, invite] }));
    this.deps.pushToast(
      `${firstName(inviter)} invited you to ${name}! Answer in the Adda tab.`,
      "handshake",
      "info",
    );
  }
}

export function createAdda(deps: AddaDeps): AddaController {
  return new Adda(deps);
}
