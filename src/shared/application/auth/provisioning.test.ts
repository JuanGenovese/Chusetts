import { describe, expect, it } from "vitest";
import type { ProvisioningItem } from "../../domain/auth/provisioning-plan";
import { executeProvisioning, type ProvisioningGateway } from "./provisioning";

const items: ProvisioningItem[] = [
  { username: "admin", email: "admin@users.chusetts.local", action: "create-and-link", appUserId: "u1" },
  { username: "caja1", email: "caja1@users.chusetts.local", action: "link-existing", appUserId: "u2", authUserId: "a2" },
  { username: "old", email: "old@users.chusetts.local", action: "skip-already-linked", appUserId: "u3", authUserId: "a3" },
  { username: "ghost", email: "ghost@users.chusetts.local", action: "error-missing-app-user" },
];
const hashes = new Map([["admin", "HASH-ADMIN"]]);

function gateway(over: Partial<ProvisioningGateway> = {}) {
  const calls: string[] = [];
  const gw: ProvisioningGateway = {
    createAuthUser: async (email, hash) => {
      calls.push(`create:${email}:${hash}`);
      return "a1";
    },
    linkAppUser: async (appUserId, authUserId) => {
      calls.push(`link:${appUserId}:${authUserId}`);
    },
    ...over,
  };
  return { gw, calls };
}

describe("executeProvisioning", () => {
  it("dry-run performs no writes and reports what would happen", async () => {
    const { gw, calls } = gateway();
    const outcomes = await executeProvisioning(items, hashes, gw, { commit: false });
    expect(calls).toEqual([]);
    expect(outcomes.map((o) => [o.username, o.outcome])).toEqual([
      ["admin", "would-create-and-link"],
      ["caja1", "would-link-existing"],
      ["old", "skipped-already-linked"],
      ["ghost", "error"],
    ]);
  });

  it("commit creates the auth user with the legacy hash and links it", async () => {
    const { gw, calls } = gateway();
    const outcomes = await executeProvisioning(items, hashes, gw, { commit: true });
    expect(calls).toEqual(["create:admin@users.chusetts.local:HASH-ADMIN", "link:u1:a1", "link:u2:a2"]);
    expect(outcomes.map((o) => o.outcome)).toEqual(["created-and-linked", "linked-existing", "skipped-already-linked", "error"]);
  });

  it("keeps going after a failure, never links a failed creation and never leaks the hash", async () => {
    const { gw, calls } = gateway({
      createAuthUser: async (_email, hash) => {
        throw new Error(`boom ${hash}`);
      },
    });
    const outcomes = await executeProvisioning(items, hashes, gw, { commit: true });
    expect(calls).toEqual(["link:u2:a2"]);
    expect(outcomes[0]).toMatchObject({ username: "admin", outcome: "error" });
    expect(JSON.stringify(outcomes)).not.toContain("HASH-ADMIN");
    expect(outcomes[1].outcome).toBe("linked-existing");
  });

  it("flags a link failure after creation so a re-run can recover", async () => {
    const { gw } = gateway({
      linkAppUser: async () => {
        throw new Error("db down");
      },
    });
    const outcomes = await executeProvisioning([items[0]], hashes, gw, { commit: true });
    expect(outcomes[0]).toMatchObject({ outcome: "error" });
    expect(outcomes[0].detail).toMatch(/re-run/i);
  });
});
