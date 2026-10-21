import { DomainError } from "@/shared/domain/errors";
import { normalizeUsername, validatePassword } from "@/shared/domain/auth/username";
import {
  PASSWORD_EVENTS_LIMIT,
  RESET_TARGET_MISSING_MESSAGE,
  assertCanResetPasswordOf,
  assertCanResetPasswords,
  buildDataExport,
  exportFileName,
  prepareNewUser,
  type AdminUserRow,
  type DataExport,
  type NewUserInput,
  type PasswordEventRow,
} from "../domain";
import type { AdministrationDeps } from "./ports/repositories";

export interface ResetPasswordInput {
  targetUsername: string;
  newPassword: string;
  /** Username of the admin performing the reset (the logged-in user). */
  actorUsername: string;
}

/** Use cases of the /administracion screen: user list / creation, password reset + audit, data export. */
export function administrationUseCases(deps: AdministrationDeps) {
  return {
    listUsers: (): Promise<AdminUserRow[]> => deps.users.listUsers(),

    listPasswordEvents: (): Promise<PasswordEventRow[]> => deps.events.listRecent(PASSWORD_EVENTS_LIMIT),

    /**
     * Legacy `create_user`, on Supabase: the auth account first (it owns the credential), then the `users` row linked by
     * `auth_user_id`. If the row cannot be written the auth account is deleted again, so no orphan login remains.
     */
    async createUser(input: NewUserInput): Promise<{ username: string }> {
      const user = prepareNewUser(input);
      if (await deps.users.findByUsername(user.username)) throw new DomainError("USERNAME_TAKEN", "Ese nombre de usuario ya existe.");

      const authUserId = await deps.accounts.createAuthUserWithPassword(user.authEmail, user.password);
      try {
        await deps.users.insertUser({ username: user.username, displayName: user.displayName, role: user.role, authUserId });
      } catch (error) {
        await deps.accounts.deleteAuthUser(authUserId).catch((cleanupError: unknown) => {
          console.error("Could not delete the auth user after a failed users insert", cleanupError);
        });
        throw error;
      }
      return { username: user.username };
    },

    /**
     * Legacy `reset_user_password`, same check order: password rule, active admin, target exists, then the developer-target check. The credential changes in
     * Supabase Auth (which also revokes the target's sessions); the audit event is written only after that succeeded.
     */
    async resetPassword(input: ResetPasswordInput): Promise<{ username: string }> {
      const targetUsername = normalizeUsername(input.targetUsername);
      const actorUsername = normalizeUsername(input.actorUsername);
      validatePassword(input.newPassword);
      const actor = await deps.users.findByUsername(actorUsername);
      assertCanResetPasswords(actor);

      const target = await deps.users.findByUsername(targetUsername);
      if (!target) throw new DomainError("USER_NOT_FOUND", RESET_TARGET_MISSING_MESSAGE);
      assertCanResetPasswordOf(actor.role, target.role);
      if (!target.authUserId) throw new DomainError("NO_AUTH_ACCOUNT", "El usuario no tiene una cuenta de acceso vinculada.");

      await deps.accounts.setAuthUserPassword(target.authUserId, input.newPassword);
      await deps.events.record({ username: targetUsername, type: "RESTABLECIMIENTO_ADMIN", performedBy: actorUsername, occurredAt: deps.clock.now() });
      return { username: targetUsername };
    },

    /** "Exportar datos": every application table, minus anything credential-like. */
    async exportData(): Promise<{ fileName: string; data: DataExport }> {
      const { schemaVersion, tables } = await deps.exports.readAllTables();
      return {
        fileName: exportFileName(deps.clock.businessDate()),
        data: buildDataExport({ exportedAt: deps.clock.now(), schemaVersion, tables }),
      };
    },
  };
}

export type AdministrationUseCases = ReturnType<typeof administrationUseCases>;
