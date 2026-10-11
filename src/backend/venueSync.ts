import {
  applyChanges,
  diffStates,
  loadVenueCache,
  nextPollDelay,
  parseChanges,
  parseSnapshot,
  POLL_MS,
  saveVenueCache,
} from "@/backend/venue";
import type { VenueState, VenueUpdate } from "@/backend/venue";

/** Where the venue comes from: the full snapshot and the deltas since a cursor. */
export interface VenueSource {
  snapshot(): Promise<unknown>;
  changes(since: string): Promise<unknown>;
}

export interface VenueListener {
  /** A poll changed something after the first load. */
  readonly onUpdate: (update: VenueUpdate) => void;
  /** A poll failed; polling carries on. */
  readonly onError: (error: unknown) => void;
}

const INPUT_EVENTS = ["pointerdown", "keydown", "wheel", "touchstart"] as const;

/**
 * Keeps the venue fresh (docs/prd/database.md §13): the cached snapshot plus a delta on load,
 * then a delta every 60 s while the tab is visible, every 5 min after 5 min without input, none
 * while hidden, and one at once on coming back if the last was over 60 s ago.
 */
export class VenueSync {
  private state: VenueState | null = null;
  private timer: number | undefined;
  private lastPoll = 0;
  private lastInput = Date.now();
  private polling = false;
  private stopped = true;
  private listener: VenueListener | null = null;

  constructor(
    private readonly source: VenueSource,
    private readonly storage: Storage | null,
  ) {}

  /**
   * The venue as of now: the cache plus a delta, or a fresh snapshot. Offline with a cache, the
   * cache (the first poll tries again); offline without one, it throws.
   */
  async load(): Promise<VenueState> {
    const cached = loadVenueCache(this.storage);
    if (!cached) {
      const fresh = parseSnapshot(await this.source.snapshot());
      this.remember(fresh);
      return fresh;
    }
    this.state = cached;
    try {
      await this.catchUp(cached);
    } catch {
      this.lastPoll = 0;
    }
    return this.state;
  }

  /** Starts polling and reporting to `listener`; call after `load`. */
  start(listener: VenueListener): void {
    this.listener = listener;
    this.stopped = false;
    document.addEventListener("visibilitychange", this.onVisibility);
    for (const event of INPUT_EVENTS)
      window.addEventListener(event, this.onInput, { passive: true });
    this.schedule();
  }

  stop(): void {
    this.stopped = true;
    window.clearTimeout(this.timer);
    document.removeEventListener("visibilitychange", this.onVisibility);
    for (const event of INPUT_EVENTS) window.removeEventListener(event, this.onInput);
  }

  /** Polls right away (e.g. after joining, so your own bean's row arrives). */
  readonly pollNow = async (): Promise<void> => {
    if (this.polling) return;
    this.polling = true;
    window.clearTimeout(this.timer);
    try {
      const update = this.state ? await this.catchUp(this.state) : await this.reload();
      if (update?.changed) this.listener?.onUpdate(update);
    } catch (error) {
      this.listener?.onError(error);
    } finally {
      this.polling = false;
      this.schedule();
    }
  };

  private async catchUp(state: VenueState): Promise<VenueUpdate | null> {
    this.lastPoll = Date.now();
    const changes = parseChanges(await this.source.changes(state.cursor));
    if (changes.full) return this.reload();
    const update = applyChanges(state, changes);
    this.remember(update.state);
    return update;
  }

  /** The cursor was too old (or none yet): a full snapshot, reported as one big delta. */
  private async reload(): Promise<VenueUpdate> {
    this.lastPoll = Date.now();
    const before = this.state;
    const fresh = parseSnapshot(await this.source.snapshot());
    this.remember(fresh);
    return diffStates(before, fresh);
  }

  private remember(state: VenueState): void {
    this.state = state;
    saveVenueCache(this.storage, state);
  }

  private schedule(): void {
    window.clearTimeout(this.timer);
    if (this.stopped) return;
    const delay = nextPollDelay(document.hidden, Date.now() - this.lastInput);
    if (delay === null) return;
    const wait = Math.max(0, this.lastPoll + delay - Date.now());
    this.timer = window.setTimeout(() => void this.pollNow(), wait);
  }

  private readonly onVisibility = (): void => {
    if (document.hidden) {
      window.clearTimeout(this.timer);
      return;
    }
    if (Date.now() - this.lastPoll > POLL_MS) void this.pollNow();
    else this.schedule();
  };

  private readonly onInput = (): void => {
    const wasIdle = nextPollDelay(false, Date.now() - this.lastInput) !== POLL_MS;
    this.lastInput = Date.now();
    if (wasIdle) this.schedule();
  };
}
