import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  experimental: {
    agentFeedback: true,
  },
  cacheComponents: true,
  partialPrefetching: true,
  // pg opens this CA from DATABASE_URL. Nothing imports it, so the tracer
  // would otherwise leave it out of the serverless bundle.
  outputFileTracingIncludes: {
    "/*": ["./certs/rds-global-bundle.pem"],
  },
  // The sidebar's account menu sits in the bottom-left corner.
  devIndicators: { position: "bottom-right" },
  async headers() {
    return [
      {
        // Shared links carry their secret in the URL: keep it out of Referer headers and search engines.
        source: "/s/:token",
        headers: [
          { key: "Referrer-Policy", value: "no-referrer" },
          { key: "X-Robots-Tag", value: "noindex, nofollow" },
        ],
      },
    ];
  },
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
