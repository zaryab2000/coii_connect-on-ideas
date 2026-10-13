/** `window.__coii`, the dev-build debug hook both e2e suites drive the app through. */
interface DebugHook {
  engine: {
    stats(): { beans: number; fps: number };
    pause(): void;
    focusBooth(topic: string): void;
    resume(): void;
    screenPositionOf(id: string): { x: number; y: number } | null;
    screenPositionOfAdda(id: string): { x: number; y: number } | null;
    personAtScreen(x: number, y: number): string | null;
  };
  controller: {
    store: {
      get(): {
        mode: string;
        people: {
          id: string;
          name: string;
          isDemo: boolean;
          isNpc?: boolean;
          isInvited?: boolean;
          telegram: string | null;
          x: string | null;
        }[];
        npcs: { id: string; name: string; isNpc?: boolean }[];
        selectedId: string | null;
        you: { id: string; name: string; avatar: { hair: number } } | null;
        account: { google: boolean; hidden: boolean } | null;
        tribe: boolean;
        meet: {
          hand: { personId: string }[];
          waved: string[];
          wavesLeft: number;
          inbound: number;
          celebrate: string | null;
          chais: { personId: string }[];
        } | null;
        adda: {
          addas: { id: string; name: string; members: { personId: string; status: string }[] }[];
          joined: { ownerId: string }[];
          invites: { addaId: string }[];
        } | null;
      };
    };
    actions: {
      join(
        input: unknown,
        captchaToken: null,
      ): Promise<{ ok: true; person: { id: string } } | { ok: false }>;
      locate(id: string): void;
      selectPerson(id: string | null): void;
      openPanel(panel: string): void;
      createAdda(look: { style: string; color: string }, name?: string): Promise<string | null>;
      fit(): void;
      focusAdda(id: string): void;
      wave(id: string): Promise<string>;
      unmatch(id: string): void;
    };
  };
}

declare global {
  interface Window {
    __coii?: DebugHook;
  }
}

export type { DebugHook };
