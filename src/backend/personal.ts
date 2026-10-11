import type { RealtimeChannel } from "@supabase/supabase-js";

import type { Supabase } from "@/backend/client";

/** Personal events the database sends to `user:<auth uid>` (docs/prd/database.md §11). */
export interface PersonalHandlers {
  /** Someone waved at you; `points` is your new total. Never who. */
  readonly waveIn: (points: number) => void;
  /** A wave of yours just became mutual. */
  readonly chai: (personId: string) => void;
  readonly addaInvite: (addaId: string, ownerId: string) => void;
  readonly addaJoined: (addaId: string, personId: string) => void;
  /** No live channel: re-read your state (every 60 s while the tab is visible). */
  readonly poll: () => void;
}

export const FALLBACK_POLL_MS = 60_000;

type Payload = Record<string, unknown>;

function field(payload: Payload, name: string): string | null {
  const value = payload[name];
  return typeof value === "string" ? value : null;
}

/**
 * Listens on your private topic. If the channel can't join (more than 200 connections on the
 * free plan) or drops, polls instead until it's back.
 */
export class PersonalChannel {
  private channel: RealtimeChannel | null = null;
  private live = false;
  private timer: number | undefined;

  constructor(
    private readonly supabase: Supabase,
    private readonly handlers: PersonalHandlers,
  ) {}

  async open(userId: string): Promise<void> {
    await this.close();
    document.addEventListener("visibilitychange", this.onVisibility);
    this.schedulePoll();
    // Private channels authorize with the session's token (RLS on realtime.messages).
    await this.supabase.realtime.setAuth();
    const channel = this.supabase.channel(`user:${userId}`, { config: { private: true } });
    const on = (event: string, handle: (payload: Payload) => void): void => {
      channel.on("broadcast", { event }, (message: { payload?: Payload }) =>
        handle(message.payload ?? {}),
      );
    };
    on("wave_in", (p) => this.handlers.waveIn(typeof p["points"] === "number" ? p["points"] : 0));
    on("chai", (p) => {
      const id = field(p, "person_id");
      if (id) this.handlers.chai(id);
    });
    on("adda_invite", (p) => {
      const adda = field(p, "adda_id");
      const owner = field(p, "owner_id");
      if (adda && owner) this.handlers.addaInvite(adda, owner);
    });
    on("adda_joined", (p) => {
      const adda = field(p, "adda_id");
      const person = field(p, "person_id");
      if (adda && person) this.handlers.addaJoined(adda, person);
    });
    this.channel = channel;
    channel.subscribe((status) => {
      this.live = status === "SUBSCRIBED";
      this.schedulePoll();
    });
  }

  async close(): Promise<void> {
    window.clearTimeout(this.timer);
    document.removeEventListener("visibilitychange", this.onVisibility);
    this.live = false;
    const channel = this.channel;
    this.channel = null;
    if (channel) await this.supabase.removeChannel(channel);
  }

  /** Whether events arrive live right now (for tests and the debug overlay). */
  get isLive(): boolean {
    return this.live;
  }

  private schedulePoll(): void {
    window.clearTimeout(this.timer);
    if (this.live || document.hidden) return;
    this.timer = window.setTimeout(() => {
      this.handlers.poll();
      this.schedulePoll();
    }, FALLBACK_POLL_MS);
  }

  private readonly onVisibility = (): void => {
    if (!document.hidden && !this.live) this.handlers.poll();
    this.schedulePoll();
  };
}
