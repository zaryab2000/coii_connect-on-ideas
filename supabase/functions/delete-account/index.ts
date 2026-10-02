// delete-account: "Leave coii". Deleting the auth user cascades to the bean, handles, waves (other
// people's points drop), chais, hands, skips, blocks and reports, and a tombstone tells every
// map to remove the bean (docs/prd/database.md §9.3).
import { fail, noContent, serve } from "../_shared/http.ts";

serve(async (_req, { user, admin, origin }) => {
  const { error } = await admin.auth.admin.deleteUser(user.id);
  if (error) return fail("server_error", 500, origin);
  return noContent(origin);
});
