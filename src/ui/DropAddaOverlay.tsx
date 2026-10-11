import "@/ui/adda.css";
import { useId } from "react";

import { useActions, useApp } from "@/app/context";
import { inviteToast } from "@/ui/adda";
import { BeanAvatar } from "@/ui/BeanAvatar";
import { Icon } from "@/ui/Icon";
import { firstName } from "@/ui/meet";
import { CloseButton, Overlay } from "@/ui/Overlay";

/** Who was dropped on which of your addas, and whether you've waved at them already. */
function useDrop() {
  const drop = useApp((s) => s.addaDrop);
  const person = useApp((s) => s.people.find((p) => p.id === drop?.personId) ?? null);
  const adda = useApp((s) => s.adda?.addas.find((a) => a.id === drop?.addaId) ?? null);
  const waved = useApp((s) => (person ? (s.meet?.waved.includes(person.id) ?? false) : false));
  return { person, adda, waved };
}

/**
 * You dropped someone on one of your tents before waving at and adding them: wave + add first.
 * One tap does both, and they drop into the tent.
 */
export function DropAddaOverlay({
  leaving,
  onClose,
}: {
  readonly leaving: boolean;
  readonly onClose: () => void;
}) {
  const actions = useActions();
  const titleId = useId();
  const { person, adda, waved } = useDrop();
  const close = (): void => {
    actions.dismissAddaDrop();
    onClose();
  };
  if (!person || !adda) return null;
  const name = firstName(person.name);
  const go = (): void => {
    void actions.waveAndAdd(person.id, adda.id).then((result) => {
      const text = inviteToast(result, name, adda.name);
      if (text) actions.pushToast(text, "circus_tent", result === "invited" ? "success" : "info");
    });
  };
  return (
    <Overlay kind="drop" labelledBy={titleId} leaving={leaving} onClose={close}>
      <div className="overlay__scroll drop">
        <CloseButton onClose={close} />
        <div className="drop__who">
          <BeanAvatar
            className="adda-row__bean"
            avatar={person.avatar}
            topic={person.topics[0] ?? "ai"}
            size={88}
            face="happy"
          />
        </div>
        <h2 id={titleId} className="drop__title">
          {waved ? `Add ${name} to ${adda.name}?` : `Wave + add ${name} first`}
        </h2>
        <p className="drop__text">
          {waved
            ? `${name} drops into your tent and waits there until they say yes.`
            : `To bring ${name} into ${adda.name}, wave at them and add them. Your wave gives them a point and shows you their handles; the invite shows it's from you.`}
        </p>
        <div className="drop__actions">
          <button type="button" className="btn btn--wave btn--big" onClick={go}>
            <Icon id={waved ? "circus_tent" : "waving_hand"} size={24} />
            {waved ? `Add to ${adda.name}` : "Wave + add"}
          </button>
          <button type="button" className="btn btn--quiet" onClick={close}>
            Not now
          </button>
        </div>
      </div>
    </Overlay>
  );
}
