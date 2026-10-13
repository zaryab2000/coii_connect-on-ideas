import type { Chai } from "@/match/storage";

export type ShownChai =
  | { readonly kind: "person"; readonly personId: string; readonly celebration: boolean }
  | { readonly kind: "batch"; readonly personIds: readonly string[] };

/** One explicitly opened chai wins; otherwise two or more unseen chais become one celebration. */
export function shownChai(
  viewing: string | null,
  chais: readonly Chai[],
  availablePeople: ReadonlySet<string>,
): ShownChai | null {
  if (viewing && chais.some((chai) => chai.personId === viewing) && availablePeople.has(viewing)) {
    return { kind: "person", personId: viewing, celebration: false };
  }
  const unseen = chais
    .filter((chai) => !chai.seen && availablePeople.has(chai.personId))
    .map((chai) => chai.personId);
  if (unseen.length === 0) return null;
  if (unseen.length === 1) {
    return { kind: "person", personId: unseen[0] ?? "", celebration: true };
  }
  return { kind: "batch", personIds: unseen };
}

export function chaiNames(names: readonly string[]): string {
  if (names.length <= 1) return names[0] ?? "";
  if (names.length === 2) return `${names[0]} & ${names[1]}`;
  return `${names.slice(0, -1).join(", ")} & ${names.at(-1)}`;
}
