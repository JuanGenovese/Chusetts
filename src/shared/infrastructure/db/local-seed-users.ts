import type { AppRole } from "@/shared/domain/auth/username";

/**
 * Accounts created by `pnpm db:seed:dev` on the LOCAL stack only (the script refuses any other target).
 * The passwords are public on purpose: they only exist in a developer's local Supabase.
 * The admin id is fixed because the demo seed and the integration tests use it as the acting user.
 */
export interface LocalSeedUser {
  id: string;
  username: string;
  displayName: string;
  role: AppRole;
  password: string;
}

export const LOCAL_SEED_ADMIN: LocalSeedUser = {
  id: "00000000-0000-4000-8000-000000000001",
  username: "admin",
  displayName: "Administrador (local)",
  role: "admin",
  password: "admin-local-1234",
};

export const LOCAL_SEED_CASHIER: LocalSeedUser = {
  id: "00000000-0000-4000-8000-000000000002",
  username: "cajero",
  displayName: "Cajero (local)",
  role: "cashier",
  password: "cajero-local-1234",
};

export const LOCAL_SEED_USERS: readonly LocalSeedUser[] = [LOCAL_SEED_ADMIN, LOCAL_SEED_CASHIER];
