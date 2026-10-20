import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Lets a second instance (e.g. UI comparison on :3001) run next to the main dev server: NEXT_DIST_DIR=.next-compare.
  distDir: process.env.NEXT_DIST_DIR || ".next",
  // postgres.js is a Node-only driver; keep it out of the bundle.
  serverExternalPackages: ["postgres"],
  // Tailwind v4 is compiled by its Turbopack loader (there is no PostCSS config).
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
