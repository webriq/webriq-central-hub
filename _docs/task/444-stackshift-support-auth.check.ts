// Task 444 — assertions for the StackShift support signing/rate-limit/SLA pure logic
// (no test runner in this repo). Run: npx tsx _docs/task/444-stackshift-support-auth.check.ts
import assert from "node:assert/strict";
import {
  buildCanonical,
  canonicalPath,
  sha256Hex,
  signRequest,
  verifySignature,
  MAX_SKEW_SECONDS,
} from "../../src/lib/stackshift-support/auth-logic";
import { windowStart, retryAfterSeconds, isOverLimit } from "../../src/lib/stackshift-support/rate-limit-logic";
import { resolveHours, DEFAULT_SLA_HOURS, addHours } from "../../src/lib/stackshift-support/sla-logic";

const BASE = "/api/webhooks/stackshift-support/v1";
const NOW = 1_800_000_000; // unix seconds
const env = (cur?: string, next?: string) => ({ current: cur, next });
const body = JSON.stringify({ subject: "Hi", actor: { site: "acme" } });

const sign = (over: Partial<Parameters<typeof signRequest>[0]> = {}) =>
  signRequest({
    secret: "s3cret", keyId: "current", timestamp: NOW, method: "POST",
    path: `${BASE}/tickets`, body, ...over,
  });
const verify = (
  h: { keyId?: string | null; timestamp?: string | null; signature?: string | null },
  over: Partial<Parameters<typeof verifySignature>[0]> = {},
) =>
  verifySignature({
    secrets: env("s3cret", "n3xt"), keyId: h.keyId ?? "current",
    timestamp: h.timestamp ?? String(NOW), signature: h.signature ?? "",
    method: "POST", path: `${BASE}/tickets`, rawBody: body, nowSeconds: NOW, ...over,
  });

// 1. canonicalisation: sorted keys, encoded values, query order irrelevant
assert.equal(canonicalPath("/a/b?b=2&a=1"), "/a/b?a=1&b=2");
assert.equal(canonicalPath("/a/b?a=1&b=2"), canonicalPath("/a/b?b=2&a=1"));
assert.equal(canonicalPath("/a?q=x y&z=1"), "/a?q=x%20y&z=1");
assert.equal(canonicalPath("/a"), "/a");
assert.equal(canonicalPath("/a?"), "/a");
// repeated keys keep value order stable (sorted by key then value)
assert.equal(canonicalPath("/a?k=2&k=1"), "/a?k=1&k=2");

// 2. empty body hash is the SHA-256 of the empty string
assert.equal(sha256Hex(""), "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855");
assert.equal(
  buildCanonical({ timestamp: NOW, method: "get", path: "/x?b=1&a=2", body: "" }),
  `${NOW}\nGET\n/x?a=2&b=1\n${sha256Hex("")}`,
);

// 3. valid signature (current key)
const sig = sign();
assert.deepEqual(verify({ signature: sig }), { ok: true, keyId: "current" });

// 4. tampered body / method / path / secret
assert.deepEqual(verify({ signature: sig }, { rawBody: body + " " }), { ok: false, status: 401, error: "bad_signature" });
assert.deepEqual(verify({ signature: sig }, { method: "PUT" }), { ok: false, status: 401, error: "bad_signature" });
assert.deepEqual(verify({ signature: sig }, { path: `${BASE}/tickets/x` }), { ok: false, status: 401, error: "bad_signature" });
assert.deepEqual(verify({ signature: sign({ secret: "other" }) }), { ok: false, status: 401, error: "bad_signature" });
// signature of the wrong length never throws
assert.deepEqual(verify({ signature: "abc" }), { ok: false, status: 401, error: "bad_signature" });
assert.deepEqual(verify({ signature: "" }), { ok: false, status: 401, error: "bad_signature" });
assert.deepEqual(verify({ signature: "zz".repeat(32) }), { ok: false, status: 401, error: "bad_signature" });

// 5. query order does not change validity
const qSig = sign({ path: `${BASE}/tickets?b=2&a=1` });
assert.equal(verify({ signature: qSig }, { path: `${BASE}/tickets?a=1&b=2` }).ok, true);

// 6. timestamp skew: ±300 s accepted, 301 s rejected (past and future), garbage rejected
assert.equal(MAX_SKEW_SECONDS, 300);
for (const d of [-300, 0, 300]) {
  assert.equal(verify({ signature: sign({ timestamp: NOW + d }), timestamp: String(NOW + d) }).ok, true, `skew ${d}`);
}
for (const d of [-301, 301]) {
  assert.deepEqual(
    verify({ signature: sign({ timestamp: NOW + d }), timestamp: String(NOW + d) }),
    { ok: false, status: 401, error: "stale_timestamp" },
    `skew ${d}`,
  );
}
assert.deepEqual(verify({ signature: sig, timestamp: "not-a-number" }), { ok: false, status: 401, error: "stale_timestamp" });
assert.deepEqual(verify({ signature: sig, timestamp: "" }), { ok: false, status: 401, error: "stale_timestamp" });
assert.deepEqual(verify({ signature: sig, timestamp: "1.5" }), { ok: false, status: 401, error: "stale_timestamp" });
assert.deepEqual(verify({ signature: sig }, { timestamp: null }), { ok: false, status: 401, error: "stale_timestamp" });

// 7. key rotation: next key verifies; current still verifies; they never cross-verify
const nextSig = sign({ secret: "n3xt", keyId: "next" });
assert.deepEqual(verify({ keyId: "next", signature: nextSig }), { ok: true, keyId: "next" });
assert.equal(verify({ keyId: "current", signature: nextSig }).ok, false);
assert.equal(verify({ keyId: "next", signature: sig }).ok, false);

// 8. unknown / missing key id, and `next` selected while unset
assert.deepEqual(verify({ keyId: "bogus", signature: sig }), { ok: false, status: 401, error: "unknown_key" });
assert.deepEqual(verify({ signature: sig }, { keyId: null }), { ok: false, status: 401, error: "unknown_key" });
assert.deepEqual(
  verify({ keyId: "next", signature: nextSig }, { secrets: env("s3cret", undefined) }),
  { ok: false, status: 401, error: "unknown_key" },
);

// 9. no current secret configured ⇒ fail closed with 503 (even if `next` exists)
assert.deepEqual(verify({ signature: sig }, { secrets: env(undefined, "n3xt") }), { ok: false, status: 503, error: "not_configured" });
assert.deepEqual(verify({ signature: sig }, { secrets: env("", "") }), { ok: false, status: 503, error: "not_configured" });
assert.deepEqual(verify({ signature: sig }, { secrets: env(undefined, undefined) }), { ok: false, status: 503, error: "not_configured" });

// 10. rate-limit window maths
const t0 = Date.parse("2026-10-08T01:02:03.456Z");
assert.equal(windowStart(t0).toISOString(), "2026-10-08T01:02:00.000Z");
assert.equal(windowStart(Date.parse("2026-10-08T01:02:00.000Z")).toISOString(), "2026-10-08T01:02:00.000Z");
assert.equal(retryAfterSeconds(Date.parse("2026-10-08T01:02:00.000Z")), 60);
assert.equal(retryAfterSeconds(Date.parse("2026-10-08T01:02:59.999Z")), 1);
assert.equal(retryAfterSeconds(Date.parse("2026-10-08T01:02:30.000Z")), 30);
assert.equal(isOverLimit(120, 120), false);
assert.equal(isOverLimit(121, 120), true);
assert.equal(isOverLimit(1, 120), false);

// 11. SLA: config wins; fallback for missing/invalid/unknown; date maths
assert.deepEqual(DEFAULT_SLA_HOURS, { critical: 4, high: 8, normal: 24, low: 72 });
assert.equal(resolveHours("high", { high: 6 }), 6);
assert.equal(resolveHours("high", {}), 8);
assert.equal(resolveHours("high", null), 8);
assert.equal(resolveHours("high", { high: -1 }), 8);
assert.equal(resolveHours("high", { high: Number.NaN }), 8);
assert.equal(resolveHours("high", { high: 0 }), 8);
assert.equal(resolveHours("bogus", null), DEFAULT_SLA_HOURS.normal);
assert.equal(resolveHours(undefined, null), DEFAULT_SLA_HOURS.normal);
assert.equal(addHours(new Date("2026-10-08T00:00:00.000Z"), 4).toISOString(), "2026-10-08T04:00:00.000Z");
assert.equal(addHours(new Date("2026-10-08T00:00:00.000Z"), 1.5).toISOString(), "2026-10-08T01:30:00.000Z");

console.log("444 checks: all passed");
