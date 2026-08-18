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
        // Official custom domain (centralhub.webriq.cloud) is now attached on Vercel;
        // permanently redirect the legacy *.vercel.app URL so old bookmarks/links land there.
        source: "/:path*",
        has: [
          {
            type: "host",
            value: "webriq-central-hub-lime.vercel.app",
          },
        ],
        destination: "https://centralhub.webriq.cloud/:path*",
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
    // and the route handler) and truncates past the cap by default. Task 106's attachments
    // uploader needed 50mb for its ~11MB/40-file dataset; task 114's Issue Attachments
    // uploader sends much larger batches (up to 1.29GB/351 files, individual files to 119MB),
    // so this needs a proportionally larger cap.
    proxyClientMaxBodySize: "2gb",
  },
};

export default withPWA(nextConfig);
