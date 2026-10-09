import { createHash, createHmac, timingSafeEqual } from "crypto";

// Task 444 — pure HMAC request signing for the StackShift ↔ Hub support API
// (contract §1, _docs/plan/stackshift-hub-support-api-contract.md). No env/Next imports so the
// checks in _docs/task/444-stackshift-support-auth.check.ts can run it under plain `tsx`.

export const MAX_SKEW_SECONDS = 300;

export type KeyId = "current" | "next";
export type AuthErrorCode = "not_configured" | "unknown_key" | "stale_timestamp" | "bad_signature";
export type AuthResult =
  | { ok: true; keyId: KeyId }
  | { ok: false; status: 401 | 503; error: AuthErrorCode };

export function sha256Hex(data: string): string {
  return createHash("sha256").update(data).digest("hex");
}

// Query params sorted by key (then value) and re-encoded, so signer and verifier agree
// regardless of the order a client happened to emit them in.
export function canonicalPath(pathWithQuery: string): string {
  const qIdx = pathWithQuery.indexOf("?");
  if (qIdx === -1) return pathWithQuery;
  const path = pathWithQuery.slice(0, qIdx);
  const pairs = [...new URLSearchParams(pathWithQuery.slice(qIdx + 1))];
  if (pairs.length === 0) return path;
  pairs.sort(([ak, av], [bk, bv]) => (ak === bk ? (av < bv ? -1 : av > bv ? 1 : 0) : ak < bk ? -1 : 1));
  return `${path}?${pairs.map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`).join("&")}`;
}

export function buildCanonical(p: { timestamp: number | string; method: string; path: string; body: string }): string {
  return `${p.timestamp}\n${p.method.toUpperCase()}\n${canonicalPath(p.path)}\n${sha256Hex(p.body)}`;
}

export function signRequest(p: {
  secret: string;
  keyId: KeyId;
  timestamp: number;
  method: string;
  path: string;
  body: string;
}): string {
  return createHmac("sha256", p.secret).update(buildCanonical(p)).digest("hex");
}

export function verifySignature(p: {
  secrets: { current?: string; next?: string };
  keyId: string | null;
  timestamp: string | null;
  signature: string | null;
  method: string;
  path: string;
  rawBody: string;
  nowSeconds: number;
}): AuthResult {
  // Fail closed: without the primary secret the whole surface is off (same as the order webhook).
  if (!p.secrets.current) return { ok: false, status: 503, error: "not_configured" };

  const secret = p.keyId === "current" ? p.secrets.current : p.keyId === "next" ? p.secrets.next : undefined;
  if (!secret) return { ok: false, status: 401, error: "unknown_key" };

  if (!p.timestamp || !/^\d+$/.test(p.timestamp)) return { ok: false, status: 401, error: "stale_timestamp" };
  if (Math.abs(p.nowSeconds - Number(p.timestamp)) > MAX_SKEW_SECONDS) {
    return { ok: false, status: 401, error: "stale_timestamp" };
  }

  if (!p.signature || !/^[0-9a-f]{64}$/i.test(p.signature)) return { ok: false, status: 401, error: "bad_signature" };
  const expected = createHmac("sha256", secret)
    .update(buildCanonical({ timestamp: p.timestamp, method: p.method, path: p.path, body: p.rawBody }))
    .digest();
  if (!timingSafeEqual(expected, Buffer.from(p.signature, "hex"))) {
    return { ok: false, status: 401, error: "bad_signature" };
  }
  return { ok: true, keyId: p.keyId as KeyId };
}
