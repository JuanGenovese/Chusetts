import { defineConfig } from "vitest/config";
import path from "node:path";

const alias = { "@": path.resolve(import.meta.dirname, "src") };

export default defineConfig({
  test: {
    projects: [
      {
        resolve: { alias },
        test: {
          name: "unit",
          include: ["src/**/*.test.ts"],
          exclude: ["src/**/*.integration.test.ts", "node_modules/**"],
        },
      },
      {
        resolve: { alias },
        test: {
          name: "integration",
          include: ["src/**/*.integration.test.ts"],
          setupFiles: ["./vitest.integration.setup.ts"],
          fileParallelism: false,
          testTimeout: 20000,
        },
      },
    ],
  },
});
