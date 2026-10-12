import "@/ui/adda.css";
import { useId, useState } from "react";
import type { CSSProperties } from "react";

import type { AddaInvite, AddaMember, AddaRef, JoinedAdda, MyAdda } from "@/adda/storage";
import { useActions, useApp } from "@/app/context";
import type { AddaView } from "@/app/store";
import { addaColor, ADDAS_MAX, DEFAULT_LOOK, defaultAddaName } from "@/data/adda";
import type { Person } from "@/data/types";
import { addaCounts, crewText } from "@/ui/adda";
import { AddaLookPicker } from "@/ui/AddaLookPicker";
import { BeanAvatar } from "@/ui/BeanAvatar";
import { Glyph, Icon } from "@/ui/Icon";
import { firstName } from "@/ui/meet";
import { Awning, PanelNav } from "@/ui/PanelChrome";
import type { PanelChrome } from "@/ui/PanelChrome";
import { TentPreview } from "@/ui/TentPreview";

function usePerson(id: string): Person | null {
  return useApp((s) => s.people.find((p) => p.id === id) ?? null);
}

function Avatar({ person, size = 44 }: { readonly person: Person; readonly size?: number }) {
  return (
    <BeanAvatar
      className="adda-row__bean"
      avatar={person.avatar}
      topic={person.topics[0] ?? "ai"}
      size={size}
      face="happy"
    />
  );
}

/** Flies to a tent and gets the panel out of the way. */
function useShowOnMap(): (addaId: string) => void {
  const actions = useActions();
  return (addaId) => {
    actions.focusAdda(addaId);
    actions.closePanel();
  };
}

function AddaHeader({
  adda,
  chrome,
  titleId,
}: {
  readonly adda: AddaView | null;
  readonly chrome: PanelChrome;
  readonly titleId: string;
}) {
  const color = addaColor(adda?.addas[0]?.look.color ?? DEFAULT_LOOK.color).css;
  const count = adda?.addas.length ?? 0;
  return (
    <header
      className="panel__head adda__band"
      style={{ "--adda": color } as CSSProperties}
      data-sheet-grab
    >
      <Awning color={color} />
      <PanelNav chrome={chrome} />
      <h2 id={titleId} className="adda__title">
        Your addas
      </h2>
      <p className="adda__blurb">
        {count > 0
          ? `${count} of ${ADDAS_MAX}. Drag a tent anywhere outside the ring, and drag people onto it to add them.`
          : "Your crews for Devcon, each in a tent of its own. Up to three."}
      </p>
    </header>
  );
}

function LockedAdda() {
  const actions = useActions();
  return (
    <div className="adda-empty">
      <TentPreview kind="shamiana" color="var(--rani)" size={120} />
      <p className="adda-empty__title">Build your own adda</p>
      <p className="adda-empty__hint">
        Gather the people you want to meet at Devcon into one tent. When they say yes, you're both
        meeting there.
      </p>
      <button
        type="button"
        className="btn btn--primary btn--big"
        onClick={() => actions.startJoin(null)}
      >
        Join to build your adda
      </button>
    </div>
  );
}

// ---- invites to you ------------------------------------------------------------------------------

function InviteRow({ invite }: { readonly invite: AddaInvite }) {
  const actions = useActions();
  const owner = usePerson(invite.ownerId);
  if (!owner) return null;
  return (
    <li className="adda-invite">
      <div className="adda-invite__who">
        <Avatar person={owner} />
        <p>
          <strong>{owner.name}</strong> invited you to <strong>{invite.name}</strong>. Say yes and
          you're both meeting at Devcon (chai's on).
        </p>
      </div>
      <div className="adda-invite__actions">
        <button
          type="button"
          className="btn btn--wave"
          onClick={() => actions.acceptAddaInvite(invite)}
        >
          Join {invite.name}
        </button>
        <button
          type="button"
          className="btn btn--quiet"
          onClick={() => actions.declineAddaInvite(invite)}
        >
          Not now
        </button>
      </div>
    </li>
  );
}

function Invites({ invites }: { readonly invites: readonly AddaInvite[] }) {
  const headingId = useId();
  if (invites.length === 0) return null;
  return (
    <section className="adda-section" aria-labelledby={headingId}>
      <h3 id={headingId} className="list-heading">
        Invites for you
      </h3>
      <ul className="adda-rows">
        {invites.map((invite) => (
          <InviteRow key={`${invite.ownerId}:${invite.addaId}`} invite={invite} />
        ))}
      </ul>
      <p className="adda-note">Not now is private: they never find out.</p>
    </section>
  );
}

// ---- your addas ----------------------------------------------------------------------------------

function MemberRow({ member, addaId }: { readonly member: AddaMember; readonly addaId: string }) {
  const actions = useActions();
  const person = usePerson(member.personId);
  if (!person) return null;
  const joined = member.status === "joined";
  return (
    <li className="adda-member">
      <button type="button" className="adda-row" onClick={() => actions.locate(person.id)}>
        <Avatar person={person} />
        <span className="adda-row__name">{person.name}</span>
        <span className="adda-pill" data-status={member.status}>
          {joined ? "In" : "Waiting"}
          {joined ? <Glyph name="check" size={14} /> : null}
        </span>
      </button>
      <button
        type="button"
        className="nav-btn adda-member__remove"
        aria-label={`Remove ${person.name} from your adda`}
        onClick={() => actions.removeFromAdda(person.id, addaId)}
      >
        <Glyph name="close" size={16} />
      </button>
    </li>
  );
}

function Members({ adda }: { readonly adda: MyAdda }) {
  const sorted = adda.members.toSorted((a, b) => {
    if (a.status === b.status) return 0;
    return a.status === "joined" ? -1 : 1;
  });
  if (sorted.length === 0) {
    return (
      <p className="empty-note">
        Wave at someone and tap <strong>Add to {adda.name}</strong> on their profile, or drag their
        bean onto this tent. Waiting people stand see-through until they say yes.
      </p>
    );
  }
  return (
    <ul className="adda-rows">
      {sorted.map((m) => (
        <MemberRow key={m.personId} member={m} addaId={adda.id} />
      ))}
    </ul>
  );
}

/** Take the tent down, with an inline confirm step. */
function DeleteAdda({ adda }: { readonly adda: MyAdda }) {
  const actions = useActions();
  const [confirming, setConfirming] = useState(false);
  if (!confirming) {
    return (
      <button type="button" className="btn btn--quiet" onClick={() => setConfirming(true)}>
        Take down
      </button>
    );
  }
  return (
    <span className="adda-confirm">
      Take down {adda.name}?
      <button
        type="button"
        className="btn btn--danger btn--small"
        onClick={() => actions.deleteAdda(adda.id)}
      >
        Yes
      </button>
      <button
        type="button"
        className="btn btn--secondary btn--small"
        onClick={() => setConfirming(false)}
      >
        Keep it
      </button>
    </span>
  );
}

function AddaActionsRow({ adda, onEdit }: { readonly adda: MyAdda; readonly onEdit: () => void }) {
  const actions = useActions();
  const showOnMap = useShowOnMap();
  const ready = addaCounts(adda).joined > 0;
  return (
    <div className="adda-tent__actions">
      <button
        type="button"
        className="btn btn--wave btn--small"
        disabled={!ready}
        onClick={() => actions.shareAdda(adda.id)}
      >
        <Icon id="circus_tent" size={20} />
        Share
      </button>
      <button
        type="button"
        className="btn btn--secondary btn--small"
        onClick={() => showOnMap(adda.id)}
      >
        <Glyph name="pin" size={18} />
        On map
      </button>
      <button type="button" className="btn btn--secondary btn--small" onClick={onEdit}>
        Edit
      </button>
      <DeleteAdda adda={adda} />
      {ready ? null : <p className="adda-note">You can share once someone says yes.</p>}
    </div>
  );
}

function AddaCard({ adda }: { readonly adda: MyAdda }) {
  const actions = useActions();
  const [editing, setEditing] = useState(false);
  const counts = addaCounts(adda);
  const headingId = useId();
  return (
    <section className="adda-card" aria-labelledby={headingId}>
      {editing ? (
        <AddaLookPicker
          initial={adda.look}
          initialName={adda.name}
          submitLabel="Save"
          onSubmit={(look, name) => {
            actions.editAdda(adda.id, look, name);
            setEditing(false);
          }}
          onCancel={() => setEditing(false)}
        />
      ) : (
        <div className="adda-tent">
          <TentPreview kind={adda.look.style} color={addaColor(adda.look.color).css} size={84} />
          <div className="adda-tent__who">
            <h3 id={headingId} className="adda-card__name">
              {adda.name}
            </h3>
            <p className="adda-stat">
              {crewText(counts.joined)} in · {counts.waiting} waiting
            </p>
          </div>
        </div>
      )}
      {editing ? null : <AddaActionsRow adda={adda} onEdit={() => setEditing(true)} />}
      <Members adda={adda} />
    </section>
  );
}

function NewAdda({ count }: { readonly count: number }) {
  const actions = useActions();
  const you = useApp((s) => s.you);
  const [open, setOpen] = useState(false);
  if (count >= ADDAS_MAX) return null;
  const fallback = defaultAddaName(firstName(you?.name ?? "My"), count);
  if (!open && count > 0) {
    return (
      <button
        type="button"
        className="btn btn--secondary adda-new-btn"
        onClick={() => setOpen(true)}
      >
        <Icon id="circus_tent" size={22} />
        New adda ({count} of {ADDAS_MAX})
      </button>
    );
  }
  return (
    <section className="adda-card adda-new">
      <p className="adda-empty__title">{count === 0 ? "Build your adda" : "Another adda"}</p>
      <p className="adda-empty__hint">
        Say, one for the ZK crowd and one for founders. It goes up outside the ring; drag it
        wherever you like.
      </p>
      <AddaLookPicker
        initial={DEFAULT_LOOK}
        initialName={fallback}
        submitLabel="Build it"
        onSubmit={(look, name) => {
          actions.createAdda(look, name);
          setOpen(false);
        }}
        {...(count > 0 ? { onCancel: () => setOpen(false) } : {})}
      />
    </section>
  );
}

// ---- other people's addas ------------------------------------------------------------------------

function JoinedRow({
  joined,
  viewing,
}: {
  readonly joined: JoinedAdda;
  readonly viewing: boolean;
}) {
  const actions = useActions();
  const owner = usePerson(joined.ownerId);
  if (!owner) return null;
  const ref: AddaRef = { ownerId: joined.ownerId, addaId: joined.addaId };
  return (
    <li className="adda-joined">
      <Avatar person={owner} />
      <span className="adda-row__name">
        {joined.name}
        <small>{crewText(joined.memberIds.length + 2)}</small>
      </span>
      <button
        type="button"
        className="btn btn--secondary btn--small"
        aria-pressed={viewing}
        onClick={() => {
          actions.viewAdda(viewing ? null : ref);
          if (!viewing) actions.closePanel();
        }}
      >
        {viewing ? "Hide from map" : "Show on map"}
      </button>
      <button type="button" className="btn btn--quiet" onClick={() => actions.leaveAdda(ref)}>
        Leave
      </button>
    </li>
  );
}

function JoinedAddas({ adda }: { readonly adda: AddaView }) {
  const headingId = useId();
  if (adda.joined.length === 0) return null;
  const isViewing = (j: JoinedAdda): boolean =>
    adda.viewing?.ownerId === j.ownerId && adda.viewing.addaId === j.addaId;
  return (
    <section className="adda-section" aria-labelledby={headingId}>
      <h3 id={headingId} className="list-heading">
        Addas you're in
      </h3>
      <ul className="adda-rows">
        {adda.joined.map((j) => (
          <JoinedRow key={`${j.ownerId}:${j.addaId}`} joined={j} viewing={isViewing(j)} />
        ))}
      </ul>
    </section>
  );
}

function AddaBody({ adda }: { readonly adda: AddaView }) {
  return (
    <>
      <Invites invites={adda.invites} />
      {adda.addas.map((a) => (
        <AddaCard key={a.id} adda={a} />
      ))}
      <NewAdda count={adda.addas.length} />
      <JoinedAddas adda={adda} />
      <p className="adda-note">
        <Icon id="shield" size={18} />
        Your people stay at their booths too; a tent shows a crew in one place.
      </p>
    </>
  );
}

/** Adda tab: your tents and crews, invites for you, and other addas you're in. */
export function AddaPanel({ chrome }: { readonly chrome: PanelChrome }) {
  const adda = useApp((s) => s.adda);
  const titleId = useId();
  return (
    <section className="panel adda" aria-labelledby={titleId}>
      <AddaHeader adda={adda} chrome={chrome} titleId={titleId} />
      <div className="panel__scroll adda__body">
        {adda ? <AddaBody adda={adda} /> : <LockedAdda />}
      </div>
    </section>
  );
}
