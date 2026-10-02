// deal-hand: makes sure the caller has today's hand with 3 + bonus cards, built with the same
// buildHand as the demo (docs/prd/database.md §9.1). When the hand is already current,
// hand_inputs says so and this returns it without any matching work.
import { dealFromInputs } from "../_shared/deal.ts";
import type { HandInputsResult } from "../_shared/deal.ts";
import { codeOf, fail, json, serve } from "../_shared/http.ts";

serve(async (_req, { user, admin, origin }) => {
  const inputs = await admin.rpc("hand_inputs", { user_id: user.id });
  if (inputs.error) return fail(codeOf(inputs.error.message), 400, origin);
  const result = inputs.data as HandInputsResult;
  if (result.ready) return json(result.hand, 200, origin);
  const saved = await admin.rpc("save_hand", {
    user_id: user.id,
    day: result.day,
    cards: dealFromInputs(result),
    // The bonus these cards were dealt for; if it grew meanwhile, the hand stays due.
    dealt_bonus: result.hand?.bonus ?? 0,
  });
  if (saved.error) return fail(codeOf(saved.error.message), 400, origin);
  return json(saved.data, 200, origin);
});
