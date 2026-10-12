import { FunctionsHttpError } from "@supabase/supabase-js";

import type { Supabase } from "@/backend/client";
import type { Database } from "@/backend/database.types";
import { BackendError, coiiCode, toBackendError } from "@/backend/errors";

type Functions = Database["public"]["Functions"];
export type RpcName = keyof Functions;

/**
 * Calls one database function (docs/prd/database.md §8) and returns its result, or throws a
 * `BackendError` carrying the `coii:<code>` the server raised.
 */
export async function rpc<F extends RpcName>(
  supabase: Supabase,
  fn: F,
  args: Functions[F]["Args"],
): Promise<unknown> {
  let result: { data: unknown; error: unknown };
  try {
    result = await supabase.rpc(fn, args);
  } catch (error) {
    throw toBackendError(error);
  }
  if (result.error) throw toBackendError(result.error);
  return result.data;
}

export type EdgeFunction = "deal-hand" | "delete-account" | "telegram-link";

/** Reads `{ error: "coii:<code>" }` from a failed Edge Function response. */
async function edgeError(error: unknown): Promise<BackendError> {
  if (!(error instanceof FunctionsHttpError)) return toBackendError(error);
  const response = error.context as Response;
  try {
    const body = (await response.json()) as { error?: string };
    return new BackendError(coiiCode(body.error), body.error ?? `HTTP ${response.status}`);
  } catch {
    return new BackendError(null, `HTTP ${response.status}`);
  }
}

/** Calls one of the three Edge Functions (§9) as the signed-in user. */
export async function invoke(
  supabase: Supabase,
  fn: EdgeFunction,
  body?: Record<string, unknown>,
): Promise<unknown> {
  let result: { data: unknown; error: unknown };
  try {
    result = await supabase.functions.invoke(fn, { method: "POST", body: body ?? {} });
  } catch (error) {
    throw toBackendError(error);
  }
  if (result.error) throw await edgeError(result.error);
  return result.data;
}
