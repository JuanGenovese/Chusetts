import type { ProvisioningItem } from "../../domain/auth/provisioning-plan";

/** Side effects of provisioning (Supabase Auth admin API + the `users` table). */
export interface ProvisioningGateway {
  /** Creates a confirmed auth user whose password is the given (legacy bcrypt) hash. Returns its id. */
  createAuthUser(email: string, passwordHash: string): Promise<string>;
  /** `users.auth_user_id = authUserId` for the app user (only while it is still unlinked). */
  linkAppUser(appUserId: string, authUserId: string): Promise<void>;
}

/** Side effects of day-to-day account administration (Supabase Auth admin API), as opposed to the one-off legacy import. */
export interface AccountGateway {
  /** Creates a confirmed auth user with a plain-text initial password. Returns its id. */
  createAuthUserWithPassword(email: string, password: string): Promise<string>;
  /** Removes an auth user (compensation when the matching `users` row could not be written). */
  deleteAuthUser(authUserId: string): Promise<void>;
  /** Replaces the password. The identity provider revokes the user's existing sessions as part of the change. */
  setAuthUserPassword(authUserId: string, password: string): Promise<void>;
}

export type ProvisioningOutcomeKind =
  | "would-create-and-link"
  | "would-link-existing"
  | "created-and-linked"
  | "linked-existing"
  | "skipped-already-linked"
  | "skipped-inactive"
  | "error";

export interface ProvisioningOutcome {
  username: string;
  outcome: ProvisioningOutcomeKind;
  detail?: string;
}

const ERROR_DETAIL: Record<string, string> = {
  "error-missing-app-user": "no row in users for this username (run db:import-legacy first)",
  "error-invalid-hash": "password hash is not a bcrypt hash",
};

/** Hashes must never reach logs, even through an upstream error message. */
const scrub = (message: string, secrets: readonly string[]) => secrets.reduce((text, secret) => (secret ? text.split(secret).join("[hash]") : text), message);

/** Applies the plan. Without `commit` nothing is written. A failure on one user never stops the others. */
export async function executeProvisioning(
  items: readonly ProvisioningItem[],
  hashesByUsername: ReadonlyMap<string, string>,
  gateway: ProvisioningGateway,
  options: { commit: boolean },
): Promise<ProvisioningOutcome[]> {
  const outcomes: ProvisioningOutcome[] = [];
  for (const item of items) {
    const hash = hashesByUsername.get(item.username) ?? "";
    try {
      switch (item.action) {
        case "skip-already-linked":
          outcomes.push({ username: item.username, outcome: "skipped-already-linked" });
          break;
        case "skip-inactive":
          outcomes.push({ username: item.username, outcome: "skipped-inactive" });
          break;
        case "error-missing-app-user":
        case "error-invalid-hash":
          outcomes.push({ username: item.username, outcome: "error", detail: ERROR_DETAIL[item.action] });
          break;
        case "link-existing":
          if (options.commit) await gateway.linkAppUser(item.appUserId!, item.authUserId!);
          outcomes.push({ username: item.username, outcome: options.commit ? "linked-existing" : "would-link-existing" });
          break;
        case "create-and-link": {
          if (!options.commit) {
            outcomes.push({ username: item.username, outcome: "would-create-and-link" });
            break;
          }
          const authUserId = await gateway.createAuthUser(item.email, hash);
          try {
            await gateway.linkAppUser(item.appUserId!, authUserId);
          } catch (error) {
            const reason = scrub(error instanceof Error ? error.message : String(error), [hash]);
            outcomes.push({ username: item.username, outcome: "error", detail: `auth user created but not linked (${reason}); re-run to link it` });
            break;
          }
          outcomes.push({ username: item.username, outcome: "created-and-linked" });
          break;
        }
      }
    } catch (error) {
      outcomes.push({ username: item.username, outcome: "error", detail: scrub(error instanceof Error ? error.message : String(error), [hash]) });
    }
  }
  return outcomes;
}
