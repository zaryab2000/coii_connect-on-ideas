import { useActions, useApp } from "@/app/context";
import type { Person } from "@/data/types";
import { Icon } from "@/ui/Icon";
import { firstName, QUOTA_TEXT } from "@/ui/meet";
import { useOpenChai, useWave } from "@/ui/meetHooks";

type WaveStatus = "guest" | "chai" | "waved" | "quota" | "ready";

function useWaveStatus(personId: string): WaveStatus {
  return useApp((s) => {
    const meet = s.meet;
    if (!meet) return "guest";
    if (meet.chais.some((c) => c.personId === personId)) return "chai";
    if (meet.waved.includes(personId)) return "waved";
    return meet.wavesLeft > 0 ? "ready" : "quota";
  });
}

/**
 * Wave at someone from their profile: it gives them a wave point and unlocks their contact.
 * Moves through Wave → Waved → Chai's on; before you join it invites you in.
 */
export function WaveButton({ person }: { readonly person: Person }) {
  const actions = useActions();
  const wave = useWave();
  const openChai = useOpenChai();
  const status = useWaveStatus(person.id);
  switch (status) {
    case "guest":
      return (
        <button type="button" className="btn btn--wave" onClick={() => actions.startJoin(null)}>
          <Icon id="waving_hand" size={22} />
          Join to wave
        </button>
      );
    case "chai":
      return (
        <button type="button" className="btn btn--wave" onClick={() => openChai(person.id)}>
          <Icon id="hot_beverage" size={22} />
          Chai's on
        </button>
      );
    case "waved":
      return (
        <p className="wave-done" role="status">
          <Icon id="waving_hand" size={22} />
          <span className="wave-done__text">
            Waved! +1 wave point for {firstName(person.name)}. They only find out it was you if they
            wave back.
          </span>
        </p>
      );
    case "quota":
      return <p className="wave-done wave-done--quota">{QUOTA_TEXT}</p>;
    case "ready":
      return (
        <button type="button" className="btn btn--wave" onClick={() => wave(person)}>
          <Icon id="waving_hand" size={22} />
          Wave to connect
        </button>
      );
  }
}
