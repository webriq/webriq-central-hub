// Task 452 (H1/H2) — assertions for the events transport config. Run: npx tsx _docs/task/452-events-config.check.ts
import assert from "node:assert/strict";
import { resolveEventsConfig } from "../../src/lib/stackshift-support/events-config-logic";

const base = { url: "https://app.stackshift.example/api/hub/events", secret: "s", production: true };
const r = (o: Partial<Parameters<typeof resolveEventsConfig>[0]>) => resolveEventsConfig({ ...base, ...o });
const reason = (o: Partial<Parameters<typeof resolveEventsConfig>[0]>) => { const c = r(o); return c.ok ? "ok" : c.reason; };

// happy path
const ok = r({});
assert.ok(ok.ok && ok.keyId === "current" && ok.secret === "s" && ok.url.pathname === "/api/hub/events");

// unset url or secret => not configured (silent off)
assert.equal(reason({ url: undefined }), "not_configured");
assert.equal(reason({ secret: "" }), "not_configured");

// insecure / malformed URLs fail closed
assert.equal(reason({ url: "http://app.stackshift.example/e" }), "insecure_url");
assert.equal(reason({ url: "ftp://app.stackshift.example/e" }), "insecure_url");
assert.equal(reason({ url: "https://user:pw@app.stackshift.example/e" }), "insecure_url");
assert.equal(reason({ url: "https://app.stackshift.example/e?token=1" }), "insecure_url");
assert.equal(reason({ url: "https://app.stackshift.example/e#x" }), "insecure_url");
assert.equal(reason({ url: "not a url" }), "invalid_url");

// http only for loopback and only outside production
assert.equal(reason({ url: "http://localhost:4010/events", production: false }), "ok");
assert.equal(reason({ url: "http://127.0.0.1:4010/events", production: false }), "ok");
assert.equal(reason({ url: "http://localhost:4010/events", production: true }), "insecure_url");
assert.equal(reason({ url: "http://evil.example/events", production: false }), "insecure_url");

// rotation: next key signs with the NEXT secret; missing next secret / bad id fail closed
const n = r({ keyId: "next", secretNext: "s2" });
assert.ok(n.ok && n.keyId === "next" && n.secret === "s2");
assert.equal(reason({ keyId: "next" }), "missing_next_secret");
assert.equal(reason({ keyId: "other" }), "invalid_key_id");
const blank = r({ keyId: "  " });
assert.ok(blank.ok && blank.keyId === "current");

console.log("452-events-config.check: all assertions passed");
