// telegram-link: verifies a Telegram Login Widget payload and links that account to the caller's
// bean, proving their handle and adding the ✓ badge (docs/prd/database.md §9.2).
import { codeOf, fail, json, serve } from "../_shared/http.ts";
import { checkTelegram } from "../_shared/telegram.ts";
import type { TelegramPayload } from "../_shared/telegram.ts";

serve(async (req, { user, admin, origin }) => {
  const token = Deno.env.get("TELEGRAM_BOT_TOKEN");
  if (!token) throw new Error("TELEGRAM_BOT_TOKEN is not set for this project");
  let payload: TelegramPayload;
  try {
    payload = (await req.json()) as TelegramPayload;
  } catch {
    return fail("telegram_bad_signature", 400, origin);
  }
  const check = await checkTelegram(payload, token, Math.floor(Date.now() / 1000));
  if (!check.ok) return fail(check.code, 400, origin);
  const linked = await admin.rpc("link_telegram", {
    user_id: user.id,
    tg_id: check.id,
    username: check.username,
  });
  if (linked.error) return fail(codeOf(linked.error.message), 400, origin);
  return json(linked.data, 200, origin);
});
