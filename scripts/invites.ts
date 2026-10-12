/**
 * Invited beans from a CSV (docs-internal/prd/claim-your-bean.md §8.1). Pure: parses the owner's
 * CSV, checks every row with the app's own join validators, and builds one SQL statement for the
 * SQL editor. The server checks everything again (`private.invite_beans` is all or nothing), so
 * this is a fast first pass, not the last word. `scripts/invite-sql.ts` does the file work.
 *
 * Columns: name,telegram,x,topics,intents,one_liners
 * - topics and intents: ids separated by `;` (`privacy;core`)
 * - one_liners: separated by `|`
 * - at least one of telegram and x
 */
import { isIntentId, INTENTS_MAX } from "@/data/intents";
import { isTopicId } from "@/data/topics";
import type { IntentId, TopicId } from "@/data/types";
import { lineErrors, validateJoin } from "@/ui/joinDraft";

export const INVITE_COLUMNS = ["name", "telegram", "x", "topics", "intents", "one_liners"] as const;

/**
 * The default `private.blocked_terms`. The table can change, so the server has the final say; this
 * copy just catches the obvious ones before the whole batch is rejected.
 */
const BLOCKED_TERMS: readonly string[] = [
  "devcon",
  "support",
  "admin",
  "official",
  "ethereum foundation",
  "helpdesk",
  "airdrop",
  "coii",
  "moderator",
];

/** A row ready for `private.invite_beans` (keys match what the function reads). */
export interface InviteRow {
  readonly name: string;
  readonly telegram: string | null;
  readonly x: string | null;
  readonly topics: readonly TopicId[];
  readonly intents: readonly IntentId[];
  readonly one_liners: readonly string[];
}

/** A row left out, with why. `line` counts CSV records: the header is 1, a parse error is 0. */
export interface BadRow {
  readonly line: number;
  readonly name: string;
  readonly reasons: readonly string[];
}

export interface InvitePlan {
  readonly rows: readonly InviteRow[];
  readonly bad: readonly BadRow[];
}

/** One CSV cell and what ends it (a comma, a newline or the end of the text). */
const CELL = /("(?:[^"]|"")*"|[^,\n"]*)(,|\n|$)/y;

function unquote(cell: string): string {
  return cell.startsWith('"') ? cell.slice(1, -1).replaceAll('""', '"') : cell;
}

/**
 * Splits CSV text into records: quoted cells may hold commas, newlines and doubled quotes. Throws
 * on a stray or unclosed quote rather than guessing.
 */
export function parseCsv(text: string): string[][] {
  const source = text.replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n");
  const records: string[][] = [];
  let record: string[] = [];
  let at = 0;
  while (at < source.length) {
    CELL.lastIndex = at;
    const match = CELL.exec(source);
    if (!match) throw new Error(`Stray or unclosed quote near character ${at + 1}.`);
    record.push(unquote(match[1] ?? ""));
    at = CELL.lastIndex;
    if (match[2] !== ",") {
      records.push(record);
      record = [];
    }
  }
  // A comma at the very end leaves one empty cell to close.
  if (record.length > 0) records.push([...record, ""]);
  return records;
}

function list(value: string, separator: string): string[] {
  return value
    .split(separator)
    .map((v) => v.trim())
    .filter((v) => v.length > 0);
}

/** Checks the header names the columns this script expects, in order. */
export function headerError(header: readonly string[] | undefined): string | null {
  const got = (header ?? []).map((h) => h.trim().toLowerCase());
  const want = INVITE_COLUMNS.join(",");
  return got.join(",") === want ? null : `The first line must be exactly: ${want}`;
}

interface Fields {
  readonly name: string;
  readonly telegram: string;
  readonly x: string;
  readonly topics: string[];
  readonly intents: string[];
  readonly oneLiners: string[];
}

function fieldsOf(cells: readonly string[]): Fields {
  const cell = (i: number): string => cells[i] ?? "";
  return {
    name: cell(0),
    telegram: cell(1),
    x: cell(2),
    topics: list(cell(3), ";").map((t) => t.toLowerCase()),
    intents: list(cell(4), ";").map((t) => t.toLowerCase()),
    oneLiners: list(cell(5), "|"),
  };
}

/** Problems the join form can't have (it only offers valid picks), checked here. */
function pickProblems(fields: Fields, cells: readonly string[]): string[] {
  const problems: string[] = [];
  if (cells.length > INVITE_COLUMNS.length) problems.push("Too many columns (quote any commas).");
  const badTopics = fields.topics.filter((t) => !isTopicId(t));
  if (badTopics.length > 0) problems.push(`Unknown topics: ${badTopics.join(", ")}.`);
  const badIntents = fields.intents.filter((t) => !isIntentId(t));
  if (badIntents.length > 0) problems.push(`Unknown intents: ${badIntents.join(", ")}.`);
  if (fields.intents.length > INTENTS_MAX) problems.push(`Pick up to ${INTENTS_MAX} intents.`);
  if (fields.oneLiners.length > 3) problems.push("Up to 3 one-liners.");
  return problems;
}

function blockedTerm(name: string): string | null {
  const lower = name.toLowerCase();
  return BLOCKED_TERMS.find((term) => lower.includes(term)) ?? null;
}

/** One row through the app's own validators: the cleaned row, or what's wrong with it. */
export function checkRow(cells: readonly string[]): InviteRow | string[] {
  const fields = fieldsOf(cells);
  const problems = pickProblems(fields, cells);
  const result = validateJoin({
    name: fields.name,
    telegram: fields.telegram,
    x: fields.x,
    topics: fields.topics.filter(isTopicId),
    intent: fields.intents.filter(isIntentId),
    oneLiners: fields.oneLiners,
    avatar: { skin: 0, hair: 0, hairColor: 0, accessory: 0 },
    consent: true,
  });
  if (!result.ok) problems.push(...Object.values(result.errors));
  problems.push(...lineErrors(fields.oneLiners).filter((e): e is string => e !== undefined));
  const term = blockedTerm(fields.name);
  if (term !== null) problems.push(`Names can't contain "${term}".`);
  if (!result.ok || problems.length > 0) return [...new Set(problems)];
  const input = result.input;
  return {
    name: input.name,
    telegram: input.telegram,
    x: input.x,
    topics: input.topics,
    intents: input.intent,
    one_liners: input.oneLiners,
  };
}

function handleKeys(row: InviteRow): string[] {
  const keys: string[] = [];
  if (row.telegram !== null) keys.push(`Telegram @${row.telegram.toLowerCase()}`);
  if (row.x !== null) keys.push(`X @${row.x.toLowerCase()}`);
  return keys;
}

/** Leaves out later rows that reuse a handle an earlier good row already has. */
function dropRepeats(checked: readonly { line: number; row: InviteRow }[]): InvitePlan {
  const seen = new Map<string, number>();
  const rows: InviteRow[] = [];
  const bad: BadRow[] = [];
  for (const { line, row } of checked) {
    const repeats = handleKeys(row).filter((key) => seen.has(key));
    if (repeats.length > 0) {
      const reasons = repeats.map((key) => `${key} is already on row ${seen.get(key)}.`);
      bad.push({ line, name: row.name, reasons });
      continue;
    }
    for (const key of handleKeys(row)) seen.set(key, line);
    rows.push(row);
  }
  return { rows, bad };
}

/** The whole CSV: good rows in order, and every bad row with its reasons. */
export function planInvites(csv: string): InvitePlan {
  let parsed: string[][];
  try {
    parsed = parseCsv(csv);
  } catch (error) {
    return { rows: [], bad: [{ line: 0, name: "", reasons: [(error as Error).message] }] };
  }
  const [header, ...records] = parsed;
  const problem = headerError(header);
  if (problem !== null) return { rows: [], bad: [{ line: 1, name: "", reasons: [problem] }] };
  const good: { line: number; row: InviteRow }[] = [];
  const bad: BadRow[] = [];
  records.forEach((cells, index) => {
    const line = index + 2;
    if (cells.every((c) => c.trim() === "")) return;
    const checked = checkRow(cells);
    if (Array.isArray(checked)) bad.push({ line, name: (cells[0] ?? "").trim(), reasons: checked });
    else good.push({ line, row: checked });
  });
  const unique = dropRepeats(good);
  return { rows: unique.rows, bad: [...bad, ...unique.bad].sort((a, b) => a.line - b.line) };
}

/** Dollar-quote tag around the JSON, so quotes in names and one-liners need no escaping. */
const TAG = "$coii_invites$";

/** The SQL to paste into the Supabase SQL editor. Runs as one statement: all rows or none. */
export function inviteSql(rows: readonly InviteRow[], source: string): string {
  const json = JSON.stringify(rows, null, 2);
  if (json.includes(TAG)) throw new Error("A row contains the SQL quote tag; remove it.");
  return [
    `-- Invited beans from ${source} (${rows.length} ${rows.length === 1 ? "row" : "rows"}).`,
    "-- Paste into the Supabase SQL editor and run once. The server checks every row again; if any",
    "-- row fails, nothing is added and the error says which row (counting from 1).",
    "-- The claim links appear ONLY in the result below. Copy them now; only their hashes are",
    "-- stored. Lost one? select private.reissue_claim('<person id>');",
    "select p.name,",
    "       coalesce('@' || c.telegram, 'X @' || c.x) as handle,",
    "       r.claim_url",
    `from private.invite_beans(${TAG}${json}${TAG}::jsonb) r`,
    "join private.people p on p.id = r.person_id",
    "join private.contacts c on c.person_id = r.person_id",
    "order by p.name;",
    "",
  ].join("\n");
}

/** What the runner prints about rows it left out. */
export function describeBad(bad: readonly BadRow[]): string {
  return bad
    .map((row) => `  row ${row.line}${row.name ? ` (${row.name})` : ""}: ${row.reasons.join(" ")}`)
    .join("\n");
}
