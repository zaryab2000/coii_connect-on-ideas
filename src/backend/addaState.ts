import type { AddaInvite, AddaMember, AddaRef, JoinedAdda, MyAdda } from "@/adda/storage";
import { isAddaLook, isAddaSpot } from "@/data/adda";
import type { AddaLook, AddaPlaces } from "@/data/adda";

/** What `get_adda_state()` returns, read into the shapes the adda UI already uses. */
export interface AddaState {
  readonly addas: readonly MyAdda[];
  readonly invites: readonly AddaInvite[];
  readonly joined: readonly JoinedAdda[];
}

type Raw = Record<string, unknown>;

function raw(value: unknown): Raw {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? (value as Raw) : {};
}

function list(value: unknown): Raw[] {
  return Array.isArray(value) ? value.map(raw) : [];
}

function text(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function time(value: unknown): number {
  const at = Date.parse(text(value) ?? "");
  return Number.isNaN(at) ? 0 : at;
}

function lookOf(r: Raw): AddaLook | null {
  const look = { style: r["style"], color: r["color"] };
  return isAddaLook(look) ? look : null;
}

function placesOf(value: unknown): AddaPlaces {
  const v = raw(value);
  return {
    ...(isAddaSpot(v["landscape"]) ? { landscape: v["landscape"] } : {}),
    ...(isAddaSpot(v["portrait"]) ? { portrait: v["portrait"] } : {}),
  };
}

function memberOf(r: Raw): AddaMember | null {
  const personId = text(r["id"]);
  if (!personId) return null;
  return {
    personId,
    status: r["status"] === "joined" ? "joined" : "invited",
    invitedAt: time(r["invited_at"]),
  };
}

function myAddaOf(r: Raw): MyAdda | null {
  const id = text(r["id"]);
  const name = text(r["name"]);
  const look = lookOf(r);
  if (!id || !name || !look) return null;
  return {
    id,
    name,
    look,
    members: list(r["members"]).flatMap((m) => memberOf(m) ?? []),
    // The server already reports a "no" as invited, so nothing is ever marked declined here.
    declined: [],
    places: placesOf(r["places"]),
  };
}

function refOf(r: Raw): AddaRef | null {
  const ownerId = text(r["owner_id"]);
  const addaId = text(r["adda_id"]);
  return ownerId && addaId ? { ownerId, addaId } : null;
}

function inviteOf(r: Raw): AddaInvite | null {
  const ref = refOf(r);
  const name = text(r["name"]);
  return ref && name ? { ...ref, name, at: time(r["at"]) } : null;
}

function joinedOf(r: Raw): JoinedAdda | null {
  const ref = refOf(r);
  const name = text(r["name"]);
  const look = lookOf(r);
  if (!ref || !name || !look) return null;
  const memberIds = Array.isArray(r["member_ids"])
    ? r["member_ids"].filter((id): id is string => typeof id === "string")
    : [];
  return { ...ref, name, look, memberIds };
}

/** Reads a `get_adda_state()` result; malformed rows are skipped, never fatal. */
export function parseAddaState(value: unknown): AddaState {
  const s = raw(value);
  return {
    addas: list(s["addas"]).flatMap((a) => myAddaOf(a) ?? []),
    invites: list(s["invites"]).flatMap((i) => inviteOf(i) ?? []),
    joined: list(s["joined"]).flatMap((j) => joinedOf(j) ?? []),
  };
}
