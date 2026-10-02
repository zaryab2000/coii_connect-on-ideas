// Copies the app modules that Edge Functions reuse into supabase/functions/_shared/.
// Run with `pnpm sync:shared` (Node 24 runs TypeScript directly).
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

import { SHARED_MODULES, sharedCopy, sharedPath } from "./shared-copy.ts";

for (const module of SHARED_MODULES) {
  const source = readFileSync(`src/${module}.ts`, "utf8");
  const target = sharedPath(module);
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, sharedCopy(module, source));
  console.log(`synced ${target}`);
}
