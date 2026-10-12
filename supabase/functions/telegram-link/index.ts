// telegram-link: verifies a Telegram Login Widget payload and links that account to the caller's
// bean, proving their handle and adding the ✓ badge (docs/prd/database.md §9.2). A caller without
// a bean whose Telegram username matches an invited bean claims it instead; that needs their
// consent, sent as `consent: true` next to the payload (docs-internal/prd/claim-your-bean.md §6.4).
import { codeOf, fail, json, serve } from "../_shared/http.ts";
import { checkTelegram, splitLogin } from "../_shared/telegram.ts";

serve(async (req, { user, admin, origin }) => {
  const token = Deno.env.get("TELEGRAM_BOT_TOKEN");
  if (!token) throw new Error("TELEGRAM_BOT_TOKEN is not set for this project");
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return fail("telegram_bad_signature", 400, origin);
  }
  // Telegram signs every field it sends, so `consent` (ours) must come off before the check.
  const { payload, consent } = splitLogin(body);
  const check = await checkTelegram(payload, token, Math.floor(Date.now() / 1000));
  if (!check.ok) return fail(check.code, 400, origin);
  const linked = await admin.rpc("link_telegram", {
    user_id: user.id,
    tg_id: check.id,
    username: check.username,
    consent,
  });
  if (linked.error) return fail(codeOf(linked.error.message), 400, origin);
  return json(linked.data, 200, origin);
});
