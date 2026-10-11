import { createClient } from "@supabase/supabase-js";
import type { SupabaseClient } from "@supabase/supabase-js";

import type { BackendConfig } from "@/backend/config";
import type { Database } from "@/backend/database.types";

export type Supabase = SupabaseClient<Database>;

/** The one Supabase client (docs/prd/database.md §10.2): PKCE, persisted and refreshed session. */
export function createSupabase(config: BackendConfig): Supabase {
  return createClient<Database>(config.url, config.publishableKey, {
    auth: {
      flowType: "pkce",
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  });
}
