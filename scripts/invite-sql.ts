// `pnpm invite:sql docs-internal/invites/friends.csv`: checks every row of an invite CSV with the
// app's own validators and writes `friends.sql` next to it, ready to paste into the Supabase SQL
// editor (docs-internal/prd/claim-your-bean.md §8.1, runbook: docs-internal/runbooks/database.md).
// Bad rows are listed with the reason and left out. Real people's details stay in docs-internal/,
// which is gitignored: the script refuses files anywhere else.
// Deno resolves the app's `@/` imports through scripts/deno.json.
import { describeBad, INVITE_COLUMNS, inviteSql, planInvites } from "./invites.ts";

const PRIVATE_DIR = "docs-internal/";

function inputPath(): string {
  const path = Deno.args[0];
  if (!path) {
    throw new Error(`Usage: pnpm invite:sql ${PRIVATE_DIR}invites/<name>.csv
Columns: ${INVITE_COLUMNS.join(",")}`);
  }
  const normalized = path.replace(/^\.\//, "");
  if (!normalized.startsWith(PRIVATE_DIR) || normalized.includes("..") || !path.endsWith(".csv")) {
    throw new Error(`The CSV must be a .csv file under ${PRIVATE_DIR} (gitignored), got "${path}".`);
  }
  return normalized;
}

const input = inputPath();
const plan = planInvites(await Deno.readTextFile(input));
if (plan.bad.length > 0) {
  console.error(`Left out ${plan.bad.length} bad row(s):\n${describeBad(plan.bad)}`);
}
if (plan.rows.length === 0) {
  console.error("No good rows, so no SQL was written.");
  Deno.exit(1);
}
const output = input.replace(/\.csv$/, ".sql");
await Deno.writeTextFile(output, inviteSql(plan.rows, input));
console.log(`Wrote ${output} with ${plan.rows.length} row(s). Paste it into the SQL editor.`);
