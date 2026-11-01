import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  cacheComponents: true,
  partialPrefetching: true,
  // Always defined, so the build inlines it: off ("0") outside the test build, which drops the test pages and the
  // test-only overrides (lib/testOverrides) from the live site's code instead of checking them at runtime.
  env: { NEXT_PUBLIC_CHART_HARNESS: process.env.NEXT_PUBLIC_CHART_HARNESS ?? "0" },
  turbopack: {
    // Pin the workspace root; a stray lockfile in the home directory confuses inference.
    root: process.cwd(),
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
