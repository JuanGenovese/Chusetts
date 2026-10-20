import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

/**
 * Architecture boundaries (hexagonal), enforced with no-restricted-imports.
 *
 *   app -> server (actions/queries/composition) -> module public API (index.ts)
 *   module: ui -> application -> domain ; infrastructure implements application ports
 */
const NEXT_REACT = ["next", "next/*", "react", "react-dom", "react/*", "react-dom/*"];
const DB = ["drizzle-orm", "drizzle-orm/*", "postgres", "drizzle-kit"];

const crossModule = {
  group: ["@/modules/*/*"],
  message: "Import other modules only through their public API: '@/modules/<name>' (index.ts).",
};
const noInfra = {
  group: ["@/shared/infrastructure/*", "@/modules/*/infrastructure", "**/infrastructure", "**/infrastructure/*"],
  message: "Domain/application/ui must not depend on infrastructure. Define a port and implement it in infrastructure.",
};
const noServer = { group: ["@/server", "@/server/*"], message: "Only src/app may depend on src/server." };
const noUi = { group: ["**/ui", "**/ui/*", "@/shared/ui", "@/shared/ui/*"], message: "Domain/application must not depend on UI." };
const noModules = { group: ["@/modules", "@/modules/*"], message: "Shared code must not depend on feature modules." };
const noApplication = { group: ["**/application", "**/application/*"], message: "Domain must not depend on the application layer." };

const rule = (paths, ...patterns) => ["error", { paths: paths.map((name) => ({ name, message: "Forbidden in this layer." })), patterns }];

export default defineConfig([
  ...nextVitals,
  ...nextTs,
  globalIgnores([".next/**", ".next-*/**", "out/**", "build/**", "next-env.d.ts", "drizzle/**", "docs/**"]),

  // Everywhere: no deep imports into other modules.
  { files: ["src/**/*.{ts,tsx}"], rules: { "no-restricted-imports": rule([], crossModule) } },

  // Domain: pure TypeScript.
  {
    files: ["src/modules/*/domain/**", "src/shared/domain/**"],
    ignores: ["**/*.test.ts"],
    rules: {
      "no-restricted-imports": rule(
        [...NEXT_REACT, ...DB, "zod", "zod/*"],
        crossModule, noInfra, noServer, noUi, noApplication,
      ),
    },
  },
  // Application: use cases + ports; no frameworks, no adapters. (Tests may use in-memory fakes under application/testing.)
  {
    files: ["src/modules/*/application/**", "src/shared/application/**"],
    rules: {
      "no-restricted-imports": rule([...NEXT_REACT, ...DB, "zod", "zod/*"], crossModule, noInfra, noServer, noUi),
    },
  },
  // Shared kernel (domain/application) must not depend on feature modules. Listed after the layer blocks, so it repeats their bans.
  {
    files: ["src/shared/domain/**", "src/shared/application/**"],
    ignores: ["**/*.test.ts"],
    rules: {
      "no-restricted-imports": rule(
        [...NEXT_REACT, ...DB, "zod", "zod/*"],
        crossModule, noInfra, noServer, noUi, noModules,
      ),
    },
  },
  // Module UI: presentational/containers; talk to the server only through injected actions.
  {
    files: ["src/modules/*/ui/**"],
    rules: { "no-restricted-imports": rule([...DB], crossModule, noInfra, noServer) },
  },
  // Module infrastructure: adapters only; never reach into UI or server.
  {
    files: ["src/modules/*/infrastructure/**"],
    rules: { "no-restricted-imports": rule([...NEXT_REACT], crossModule, noServer, noUi) },
  },
  // Shared infrastructure must stay feature-agnostic.
  {
    files: ["src/shared/infrastructure/**"],
    rules: { "no-restricted-imports": rule([], noModules, noServer) },
  },
  // Routing layer: thin; no direct DB / adapters.
  {
    files: ["src/app/**"],
    rules: { "no-restricted-imports": rule([...DB], crossModule, noInfra) },
  },
]);
