import type { NextConfig } from "next";

/**
 * The browser only ever talks to this origin. `/api/v1/*` is forwarded to the Hono API Worker:
 *  - local dev: rewritten to API_BASE_URL (default http://localhost:8787)
 *  - Cloudflare: a zone route (`app.example.com/api/*`) sends /api/* straight to the API Worker, so
 *    cookies stay first-party and no CORS is needed. See docs/deployment.md.
 */
const config: NextConfig = {
  transpilePackages: ["@tripweave/shared"],
  reactStrictMode: true,
  poweredByHeader: false,
  async rewrites() {
    // Dev (or an explicit API_BASE_URL at build time) proxies /api to the API Worker. In production the zone
    // route sends /api/* to the API Worker directly, so no proxy (and no credential forwarding) is configured.
    const api = process.env.API_BASE_URL ?? (process.env.NODE_ENV === "production" ? undefined : "http://localhost:8787");
    return api ? [{ source: "/api/:path*", destination: `${api}/api/:path*` }] : [];
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
        ],
      },
    ];
  },
};
export default config;
