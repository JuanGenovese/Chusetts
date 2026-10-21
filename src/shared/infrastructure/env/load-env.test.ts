import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { loadEnv } from "./load-env";

const KEYS = ["LOAD_ENV_TEST_SHARED", "LOAD_ENV_TEST_ONLY_BASE", "LOAD_ENV_TEST_PRESET"] as const;

describe("loadEnv", () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "load-env-"));
    for (const key of KEYS) delete process.env[key];
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
    for (const key of KEYS) delete process.env[key];
  });

  it("gives .env.local precedence over .env and fills the gaps from .env", () => {
    writeFileSync(join(dir, ".env.local"), "LOAD_ENV_TEST_SHARED=local\n");
    writeFileSync(join(dir, ".env"), "LOAD_ENV_TEST_SHARED=base\nLOAD_ENV_TEST_ONLY_BASE=base\n");

    loadEnv(dir);

    expect(process.env.LOAD_ENV_TEST_SHARED).toBe("local");
    expect(process.env.LOAD_ENV_TEST_ONLY_BASE).toBe("base");
  });

  it("never overrides a variable already set in the shell", () => {
    process.env.LOAD_ENV_TEST_PRESET = "shell";
    writeFileSync(join(dir, ".env.local"), "LOAD_ENV_TEST_PRESET=local\n");

    loadEnv(dir);

    expect(process.env.LOAD_ENV_TEST_PRESET).toBe("shell");
  });

  it("works when neither file exists", () => {
    expect(() => loadEnv(dir)).not.toThrow();
  });
});
