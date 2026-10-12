import "@/ui/profile.css";
import { useId } from "react";

import type { Person } from "@/data/types";
import { css, NPC_OUTFIT } from "@/engine/palette";
import { BeanAvatar } from "@/ui/BeanAvatar";
import { Awning, PanelNav } from "@/ui/PanelChrome";
import type { PanelChrome } from "@/ui/PanelChrome";

/**
 * A grey background NPC (npc-beans.md §6.3): not a person, so no wave, handles, menu, points or
 * topics. Just what it is.
 */
export function NpcCard({
  person,
  chrome,
}: {
  readonly person: Person;
  readonly chrome: PanelChrome;
}) {
  const nameId = useId();
  const grey = css(NPC_OUTFIT);
  return (
    <article className="panel profile profile--npc" aria-labelledby={nameId}>
      <header className="panel__head profile__head" data-sheet-grab>
        <Awning color={grey} />
        <PanelNav chrome={chrome} />
        <div className="profile__id">
          <div className="profile__bean rangoli-disc">
            <BeanAvatar avatar={person.avatar} topic="npc" size={64} face="happy" />
          </div>
          <div className="profile__who">
            <h2 id={nameId} className="profile__name">
              {person.name}
            </h2>
            <ul className="badges" aria-label="Badges">
              <li className="badge badge--demo">NPC</li>
            </ul>
          </div>
        </div>
      </header>
      <div className="panel__scroll profile__body">
        <p className="npc-card__line">Hey, I'm just an NPC here 👋</p>
        <p className="npc-card__sub">
          I'm not a real person. I just wander between the booths and the chai hub to keep the venue
          lively. Find real people by their colourful shirts!
        </p>
      </div>
    </article>
  );
}
