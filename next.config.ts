import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  agentRules: false,
  output: "standalone",
  // The app moved from / to /app when / became the landing page. Old links (the Mac app's saved URL,
  // the extension, sign-in returns) carry one of these query keys; send them on with the query intact.
  async redirects() {
    return ["repo", "board", "embed", "auth_error"].map((key) => ({
      source: "/",
      has: [{ type: "query" as const, key }],
      destination: "/app",
      permanent: false,
    }));
  },
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
