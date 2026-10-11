import "@/ui/adda.css";
import { useState } from "react";

import type { MyAdda } from "@/adda/storage";
import { useActions, useApp } from "@/app/context";
import { DEFAULT_LOOK, defaultAddaName } from "@/data/adda";
import type { AddaLook } from "@/data/adda";
import type { Person } from "@/data/types";
import { addaFull, addaRelation, inviteToast } from "@/ui/adda";
import { AddaLookPicker } from "@/ui/AddaLookPicker";
import { Glyph, Icon } from "@/ui/Icon";
import { firstName } from "@/ui/meet";

function useInvite(person: Person): (adda: { id: string; name: string }) => void {
  const actions = useActions();
  return (adda) => {
    void actions.inviteToAdda(person.id, adda.id).then((result) => {
      const text = inviteToast(result, firstName(person.name), adda.name);
      if (text) actions.pushToast(text, "circus_tent", "success");
    });
  };
}

/** First invite with no adda yet: name it, pick a look, build it and invite in one go. */
function BuildAndInvite({ person }: { readonly person: Person }) {
  const actions = useActions();
  const you = useApp((s) => s.you);
  const invite = useInvite(person);
  const [open, setOpen] = useState(false);
  if (!open) {
    return (
      <button type="button" className="btn btn--adda" onClick={() => setOpen(true)}>
        <Icon id="circus_tent" size={22} />
        Add to my adda
      </button>
    );
  }
  const build = (look: AddaLook, name: string): void => {
    setOpen(false);
    void actions.createAdda(look, name).then((id) => {
      if (id) invite({ id, name });
    });
  };
  return (
    <div className="adda-build">
      <p className="adda-build__title">Build your adda first</p>
      <p className="adda-build__hint">
        Your crew's tent outside the ring. Pick a look; it grows as people join.
      </p>
      <AddaLookPicker
        initial={DEFAULT_LOOK}
        initialName={defaultAddaName(firstName(you?.name ?? "My"), 0)}
        submitLabel={`Build it and add ${firstName(person.name)}`}
        onSubmit={build}
        onCancel={() => setOpen(false)}
      />
    </div>
  );
}

/** One line per adda: add them, or where they stand with it. */
function AddaLine({ adda, person }: { readonly adda: MyAdda; readonly person: Person }) {
  const invite = useInvite(person);
  const relation = addaRelation(adda, person.id);
  if (relation === "member") {
    return (
      <li className="adda-status adda-status--in" role="status">
        <Glyph name="check" size={18} />
        <span>In {adda.name}. You're meeting at Devcon.</span>
      </li>
    );
  }
  if (relation === "invited") {
    return (
      <li className="adda-status" role="status">
        <Icon id="circus_tent" size={22} />
        <span>
          Invited to {adda.name} · waiting for {firstName(person.name)}
        </span>
      </li>
    );
  }
  return (
    <li>
      <button
        type="button"
        className="btn btn--adda"
        disabled={addaFull(adda)}
        onClick={() => invite(adda)}
      >
        <Icon id="circus_tent" size={22} />
        Add to {adda.name}
      </button>
    </li>
  );
}

/**
 * After a wave: add them to one of your addas. Each adda reads Add → Invited (waiting) → In.
 * The invite tells them who it's from, unlike a wave. Nothing shows until you've waved.
 */
export function AddaButton({ person }: { readonly person: Person }) {
  const addas = useApp((s) => s.adda?.addas ?? null);
  const waved = useApp((s) => s.meet?.waved.includes(person.id) ?? false);
  if (!addas || !waved) return null;
  if (addas.length === 0) return <BuildAndInvite person={person} />;
  return (
    <ul className="adda-lines">
      {addas.map((adda) => (
        <AddaLine key={adda.id} adda={adda} person={person} />
      ))}
    </ul>
  );
}
