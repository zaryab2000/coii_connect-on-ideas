import type { AddaRef } from "@/adda/storage";
import { addaMapViews, firstName, sameRef } from "@/app/adda";
import type { AddaActions, InviteResult, WaveAndAddResult } from "@/app/adda";
import type { AppState, AddaView, Store, Toast } from "@/app/store";
import { parseAddaState } from "@/backend/addaState";
import type { AddaState } from "@/backend/addaState";
import { rpc } from "@/backend/api";
import type { Supabase } from "@/backend/client";
import { toBackendError } from "@/backend/errors";
import type { BackendMeet } from "@/backend/meet";
import { CLAIM } from "@/content/claim";
import { ADDAS_MAX, cleanAddaName, defaultAddaName } from "@/data/adda";
import type { AddaLook, AddaSpot, PlotMode } from "@/data/adda";
import type { IconId, Person } from "@/data/types";
import type { EngineApi } from "@/engine/types";

const INVITE_RESULTS: readonly InviteResult[] = [
  "invited",
  "needs_adda",
  "needs_wave",
  "full",
  "already",
  "unavailable",
];

/** Which joined adda you chose to show on the map: a display choice, kept in this browser. */
const VIEWING_KEY = "coii:adda-viewing:v1";

function loadViewing(personId: string): AddaRef | null {
  try {
    const saved = JSON.parse(window.localStorage.getItem(VIEWING_KEY) ?? "null") as {
      personId?: unknown;
      ref?: AddaRef | null;
    } | null;
    return saved?.personId === personId && saved.ref ? saved.ref : null;
  } catch {
    return null;
  }
}

function saveViewing(personId: string, ref: AddaRef | null): void {
  try {
    window.localStorage.setItem(VIEWING_KEY, JSON.stringify({ personId, ref }));
  } catch {
    // Storage blocked: the choice lasts for this visit only.
  }
}

export interface BackendAddaDeps {
  readonly supabase: Supabase;
  readonly engine: EngineApi;
  readonly store: Store<AppState>;
  readonly meet: BackendMeet;
  readonly pushToast: (text: string, icon: IconId | null, tone: Toast["tone"]) => void;
}

/**
 * Adda in backend mode (docs/prd/iteration_v2_feature.md §6): your tents, invites both ways and
 * the addas you're in, read from and written to the database.
 */
export class BackendAdda implements AddaActions {
  private state: AddaState | null = null;
  private viewing: AddaRef | null = null;
  private syncing: Promise<void> | null = null;

  constructor(private readonly deps: BackendAddaDeps) {}

  // ---- lifecycle -------------------------------------------------------------------------------

  readonly sync = (): Promise<void> => {
    this.syncing ??= this.load().finally(() => {
      this.syncing = null;
    });
    return this.syncing;
  };

  private async load(): Promise<void> {
    const me = this.you();
    if (!me) return;
    try {
      this.state = parseAddaState(await rpc(this.deps.supabase, "get_adda_state", {}));
      this.viewing = loadViewing(me.id);
      this.publish();
    } catch (error) {
      this.fail(error);
    }
  }

  reset(): void {
    this.state = null;
    this.viewing = null;
    this.deps.store.set({ adda: null, addaDrop: null });
    this.deps.engine.setAddas([]);
  }

  /** People in the venue changed: redraw the tents (someone may have left or arrived). */
  redraw(): void {
    this.publish();
  }

  private addaCount(): number {
    return this.state?.addas.length ?? 0;
  }

  private you(): Person | null {
    return this.deps.store.get().you;
  }

  private personById(id: string): Person | undefined {
    return this.deps.store.get().people.find((p) => p.id === id);
  }

  private view(): AddaView | null {
    if (!this.state) return null;
    const viewing = this.state.joined.some((j) => sameRef(j, this.viewing)) ? this.viewing : null;
    return { ...this.state, viewing };
  }

  private publish(): void {
    const view = this.view();
    const me = this.you();
    if (!view || !me) return;
    this.deps.store.set({ adda: view });
    this.deps.engine.setAddas(addaMapViews(view, me, (id) => this.personById(id)));
  }

  private fail(error: unknown): void {
    this.deps.pushToast(toBackendError(error).copy.text, null, "info");
  }

  /** Runs a write, then re-reads the server's state either way. */
  private async write(call: () => Promise<unknown>): Promise<unknown> {
    try {
      return await call();
    } catch (error) {
      this.fail(error);
      return null;
    } finally {
      await this.sync();
    }
  }

  // ---- your addas ------------------------------------------------------------------------------

  readonly createAdda = async (look: AddaLook, name?: string): Promise<string | null> => {
    const me = this.you();
    const count = this.addaCount();
    if (!me || count >= ADDAS_MAX) return null;
    const chosen = cleanAddaName(name ?? "") ?? defaultAddaName(firstName(me), count);
    const id = await this.write(() =>
      rpc(this.deps.supabase, "create_adda", {
        name: chosen,
        style: look.style,
        color: look.color,
      }),
    );
    if (typeof id !== "string") return null;
    this.deps.pushToast(
      count === 0 ? "Your adda is up! Drag it anywhere outside the ring." : `${chosen} is up!`,
      "party_popper",
      "success",
    );
    return id;
  };

  readonly editAdda = (addaId: string, look: AddaLook, name: string): void => {
    const current = this.state?.addas.find((a) => a.id === addaId);
    if (!current) return;
    const chosen = cleanAddaName(name) ?? current.name;
    void this.write(() =>
      rpc(this.deps.supabase, "update_adda", {
        adda: addaId,
        name: chosen,
        style: look.style,
        color: look.color,
      }),
    );
  };

  readonly deleteAdda = (addaId: string): void => {
    void this.write(() => rpc(this.deps.supabase, "delete_adda", { adda: addaId }));
  };

  readonly moveAdda = (addaId: string, mode: PlotMode, spot: AddaSpot): void => {
    if (this.state) {
      this.state = {
        ...this.state,
        addas: this.state.addas.map((a) =>
          a.id === addaId ? { ...a, places: { ...a.places, [mode]: spot } } : a,
        ),
      };
      this.publish();
    }
    void this.write(() =>
      rpc(this.deps.supabase, "move_adda", { adda: addaId, mode, x: spot.x, y: spot.y }),
    );
  };

  readonly inviteToAdda = async (personId: string, addaId: string): Promise<InviteResult> => {
    const answer = await this.write(() =>
      rpc(this.deps.supabase, "invite_to_adda", { adda: addaId, person: personId }),
    );
    if (answer === null) return "failed";
    return INVITE_RESULTS.find((r) => r === answer) ?? "unavailable";
  };

  readonly waveAndAdd = async (personId: string, addaId: string): Promise<WaveAndAddResult> => {
    this.deps.store.set({ addaDrop: null, overlay: "none" });
    if (!this.deps.meet.hasWaved(personId)) {
      const waved = await this.deps.meet.wave(personId);
      if (waved === "quota" || waved === "unavailable" || waved === "failed") return waved;
      if (waved === "unclaimed") return "unavailable";
    }
    const result = await this.inviteToAdda(personId, addaId);
    if (result === "invited") this.deps.engine.dropIn(addaId, personId);
    return result;
  };

  readonly removeFromAdda = (personId: string, addaId: string): void => {
    void this.write(() =>
      rpc(this.deps.supabase, "remove_from_adda", { adda: addaId, person: personId }),
    );
  };

  // ---- dropping people on a tent -----------------------------------------------------------------

  readonly beanDropped = (personId: string, addaId: string): void => {
    const me = this.you();
    const adda = this.state?.addas.find((a) => a.id === addaId);
    const person = this.personById(personId);
    if (!me || !adda || !person || person.id === me.id) return;
    // Nobody owns an invited bean yet, so it can't be waved at or added (no drop target).
    if (person.isInvited) {
      this.deps.pushToast(CLAIM.unclaimed(firstName(person)), "circus_tent", "info");
      return;
    }
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
    if (!this.state?.addas.some((a) => a.id === addaId)) return;
    this.deps.store.set({ shareAddaId: addaId, overlay: "share" });
  };

  // ---- other people's addas --------------------------------------------------------------------

  /** Joining waves back for free (a chai) and gives the owner a point. */
  readonly acceptAddaInvite = (invite: AddaRef): void => {
    const found = this.state?.invites.find((i) => sameRef(i, invite));
    if (!found) return;
    void this.respond(found.addaId, true).then(async (answer) => {
      if (answer !== "joined") return;
      const owner = this.personById(found.ownerId);
      await this.celebrated(found.ownerId);
      this.deps.pushToast(
        `You're in ${found.name}! You and ${owner ? firstName(owner) : "the host"} are meeting at Devcon.`,
        "handshake",
        "success",
      );
    });
  };

  readonly declineAddaInvite = (invite: AddaRef): void => {
    void this.respond(invite.addaId, false);
  };

  private async respond(addaId: string, accept: boolean): Promise<unknown> {
    return this.write(() =>
      rpc(this.deps.supabase, "respond_to_adda_invite", { adda: addaId, accept }),
    );
  }

  readonly leaveAdda = (adda: AddaRef): void => {
    if (sameRef(adda, this.viewing)) this.viewAdda(null);
    void this.write(() => rpc(this.deps.supabase, "leave_adda", { adda: adda.addaId }));
  };

  readonly viewAdda = (adda: AddaRef | null): void => {
    const me = this.you();
    if (!me || !this.state) return;
    if (adda && !this.state.joined.some((j) => sameRef(j, adda))) return;
    this.viewing = adda;
    saveViewing(me.id, adda);
    this.publish();
    if (adda) this.deps.engine.focusAdda(adda.addaId);
  };

  readonly focusAdda = (addaId: string): void => {
    this.deps.engine.focusAdda(addaId);
  };

  // ---- realtime ----------------------------------------------------------------------------------

  /** Realtime `adda_invite`: someone wants you in their adda. */
  readonly invited = (addaId: string, ownerId: string): void => {
    void this.sync().then(() => {
      const invite = this.state?.invites.find((i) => i.addaId === addaId);
      const owner = this.personById(ownerId);
      if (!invite || !owner) return;
      this.deps.pushToast(
        `${firstName(owner)} invited you to ${invite.name}! Answer in the Adda tab.`,
        "handshake",
        "info",
      );
    });
  };

  /** Realtime `adda_joined`: someone said yes to your invite (that's a chai, celebrated here). */
  readonly memberJoined = (addaId: string, personId: string): void => {
    void Promise.all([this.celebrated(personId), this.sync()]).then(() => {
      const adda = this.state?.addas.find((a) => a.id === addaId);
      const person = this.personById(personId);
      if (!adda || !person) return;
      this.deps.pushToast(
        `${firstName(person)} joined ${adda.name}! You're meeting at Devcon.`,
        "handshake",
        "success",
      );
    });
  };

  /**
   * Joining an adda makes a chai, but the adda celebrates it (toast and confetti), so the big
   * "Chai's on!" card is marked seen before Meet catches up.
   */
  private async celebrated(personId: string): Promise<void> {
    try {
      await rpc(this.deps.supabase, "dismiss_chai", { person: personId });
    } catch (error) {
      this.fail(error);
    }
    await this.deps.meet.sync();
  }
}
