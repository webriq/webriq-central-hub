import type { NextConfig } from "next";
import withPWAInit from "@ducanh2912/next-pwa";

const withPWA = withPWAInit({
  dest: "public",
  disable: process.env.NODE_ENV === "development",
  cacheOnFrontEndNav: true,
  aggressiveFrontEndNavCaching: true,
  reloadOnOnline: true,
  fallbacks: {
    document: "/offline",
  },
  customWorkerSrc: "worker",
});

const nextConfig: NextConfig = {
  // turbopack: {} silences the webpack-config conflict warning in Next.js 16 dev mode.
  // @ducanh2912/next-pwa injects webpack config but PWA is disabled in dev — no conflict at runtime.
  turbopack: {},
  async redirects() {
    // Task 255 — v2 tree promoted to app root; keep bookmarked/shared /v2/* links
    // (and cached MCP OAuth authorization_endpoint metadata) resolving correctly.
    return [
      {
        // Final custom domain is hub.webriqs.com — permanently redirect the legacy
        // *.vercel.app URL straight there (was chained through centralhub.webriq.cloud,
        // now also legacy, before that domain was renamed again).
        source: "/:path*",
        has: [
          {
            type: "host",
            value: "webriq-central-hub-lime.vercel.app",
          },
        ],
        destination: "https://hub.webriqs.com/:path*",
        permanent: true,
      },
      {
        // centralhub.webriq.cloud was the custom domain before it was renamed to
        // hub.webriqs.com — keep old bookmarks/links resolving correctly.
        source: "/:path*",
        has: [
          {
            type: "host",
            value: "centralhub.webriq.cloud",
          },
        ],
        destination: "https://hub.webriqs.com/:path*",
        permanent: true,
      },
      {
        source: "/v2",
        destination: "/",
        permanent: false,
      },
      {
        source: "/v2/:path*",
        destination: "/:path*",
        permanent: false,
      },
    ];
  },
  experimental: {
    serverActions: {
      bodySizeLimit: "10mb",
    },
    // Next.js 16 proxy.ts buffers the request body in memory (for re-reads in both proxy
    // and the route handler) and truncates past the cap by default. Kept high for the bulk
    // Zoho-import multipart routes that still stream large payloads through a handler.
    //
    // NOTE: this does NOT govern production. On Vercel the platform gateway rejects any Route
    // Handler request body over ~4.5 MB with HTTP 413 before the handler runs, and no
    // next.config value raises that. Task/issue *attachment* uploads therefore no longer go
    // through a handler at all — the browser uploads straight to Supabase Storage via a signed
    // URL (task 339, src/lib/uploads/attachment-storage.ts).
    proxyClientMaxBodySize: "2gb",
  },
};

export default withPWA(nextConfig);
