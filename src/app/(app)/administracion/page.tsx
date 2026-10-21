import { AdministrationScreen } from "@/modules/administration";
import { createUserAction, resetPasswordAction } from "@/server/actions/admin";
import { guardedPage } from "@/server/auth";
import { loadAdministrationData } from "@/server/queries/admin";

export default async function Page() {
  return guardedPage("admin_access", async (user) => (
    <AdministrationScreen data={await loadAdministrationData(user)} actions={{ createUser: createUserAction, resetPassword: resetPasswordAction }} />
  ));
}
