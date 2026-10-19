import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // postgres.js is a Node-only driver; keep it out of the bundle.
  serverExternalPackages: ["postgres"],
};

export default nextConfig;
