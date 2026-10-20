import { LOGIN_ERROR_MESSAGE, normalizeUsername, usernameToAuthEmail } from "../../domain/auth/username";
import type { CurrentUser } from "../current-user";
import type { AppUserRecord, PasswordAuthenticator, UserDirectory } from "./ports";

export type LoginResult = { ok: true; user: CurrentUser; authUserId: string } | { ok: false; message: string };

export interface LoginDeps {
  directory: UserDirectory;
  authenticator: PasswordAuthenticator;
}

const toCurrentUser = (record: AppUserRecord): CurrentUser => ({
  id: record.id,
  username: record.username,
  displayName: record.displayName,
  role: record.role,
});

const FAILED: LoginResult = { ok: false, message: LOGIN_ERROR_MESSAGE };

/**
 * Legacy `auth.authenticate`: username (strip + lower) + password; unknown, inactive and wrong-password all return the
 * SAME message. The provider is always asked (even for unknown users) so the answer does not depend on the username;
 * a provider session opened for an inactive / unlinked user is closed immediately.
 */
export const loginWithPassword =
  ({ directory, authenticator }: LoginDeps) =>
  async (input: { username: string; password: string }): Promise<LoginResult> => {
    const username = normalizeUsername(input.username);
    if (!username || !input.password) return FAILED;

    const [record, signedIn] = await Promise.all([
      directory.findByUsername(username),
      authenticator.signIn(usernameToAuthEmail(username), input.password),
    ]);
    if (!signedIn) return FAILED;

    if (!record || !record.isActive || record.authUserId !== signedIn.authUserId) {
      await authenticator.signOut();
      return FAILED;
    }
    return { ok: true, user: toCurrentUser(record), authUserId: signedIn.authUserId };
  };

/** Resolves who a verified provider identity is in our model. Inactive or unlinked identities are "logged out". */
export const resolveSessionUser =
  (directory: UserDirectory) =>
  async (authUserId: string): Promise<CurrentUser | null> => {
    const record = await directory.findByAuthUserId(authUserId);
    return record && record.isActive ? toCurrentUser(record) : null;
  };
