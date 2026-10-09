import type { NextRequest } from "next/server";
import { verifySignature, signRequest, type AuthResult, type KeyId } from "./auth-logic";

export { signRequest };
export type { AuthResult, KeyId };

export const MAX_BODY_BYTES = 256 * 1024;

// Task 444 — verify an inbound StackShift → Hub request (contract §1). The caller reads the
// body once with `await req.text()` and passes it in: the signature covers the exact raw bytes,
// so the body must never be re-serialised before verification. Body-size (413) and the per-site
// rate limit (429) are route-level checks — they need the parsed actor — so they live in the
// endpoint tasks (445+), not here.
export function verifySignedRequest(req: NextRequest, rawBody: string): AuthResult {
  const url = new URL(req.url);
  return verifySignature({
    secrets: {
      current: process.env.STACKSHIFT_SUPPORT_SECRET || undefined,
      next: process.env.STACKSHIFT_SUPPORT_SECRET_NEXT || undefined,
    },
    keyId: req.headers.get("x-ss-key-id"),
    timestamp: req.headers.get("x-ss-timestamp"),
    signature: req.headers.get("x-ss-signature"),
    method: req.method,
    path: url.pathname + url.search,
    rawBody,
    nowSeconds: Math.floor(Date.now() / 1000),
  });
}
