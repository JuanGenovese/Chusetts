/**
 * Public API of the administration module: the /administracion screen (system users, user creation, password reset
 * with its audit trail, data export). Other modules and `src/server` import ONLY from here.
 *
 * - `administrationUseCases(deps)`: list users, create user, reset password, list password events, export data.
 * - Credentials live in Supabase Auth behind the `AccountGateway` port; this module never stores a password or hash.
 */
export * from "./domain";
export * from "./application";
export * from "./infrastructure";
export * from "./ui";
