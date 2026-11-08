import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The dashboard has no landing page: "/" opens the (password-protected) moderator area.
  async redirects() {
    return [{ source: "/", destination: "/mod", permanent: false }];
  },
  cacheComponents: true,
  partialPrefetching: true,
  turbopack: {
    // Pin the project root to frontend/ so a stray package-lock.json elsewhere in the
    // repo can't change what Turbopack resolves and watches. process.cwd() rather than
    // __dirname: Node >= 22.10 loads this file as native ESM, where __dirname is undefined.
    // npm scripts always run from frontend/, so cwd is this folder.
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
