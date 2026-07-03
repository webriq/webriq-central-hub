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
  experimental: {
    serverActions: {
      bodySizeLimit: "10mb",
    },
    // Next.js 16 proxy.ts buffers the request body in memory (for re-reads in both proxy
    // and the route handler) and truncates at 10MB by default — the attachments bulk
    // uploader (task 106) sends up to ~40 files as multipart/form-data, easily over that.
    proxyClientMaxBodySize: "50mb",
  },
};

export default withPWA(nextConfig);
