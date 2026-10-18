import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  experimental: {
    agentFeedback: true,
  },
  cacheComponents: true,
  partialPrefetching: true,
  // The sidebar's account menu sits in the bottom-left corner.
  devIndicators: { position: "bottom-right" },
  async redirects() {
    return [
      { source: "/", destination: "/projects", permanent: false },
      {
        source: "/projects/:projectId",
        destination: "/projects/:projectId/script",
        permanent: false,
      },
      { source: "/settings", destination: "/settings/profile", permanent: false },
    ];
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
