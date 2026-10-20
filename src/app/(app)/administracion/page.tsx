import { AdministrationScreen } from "@/modules/administration";
import { createUserAction, resetPasswordAction } from "@/server/actions/admin";
import { guardedPage } from "@/server/auth";
import { loadAdministrationData } from "@/server/queries/admin";

export default async function Page() {
  return guardedPage("admin_access", async () => (
    <AdministrationScreen data={await loadAdministrationData()} actions={{ createUser: createUserAction, resetPassword: resetPasswordAction }} />
  ));
}
