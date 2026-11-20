// Task 488 — assertions for the MCP consent rules (no test runner in this repo).
// Run: npx tsx _docs/task/488-mcp-authorize.check.ts
import assert from "node:assert/strict";
import {
  clientRedirectUrl, grantableScopes, isValidCodeChallenge, splitScopes,
} from "../../src/lib/mcp/authorize-rules";

// 1. developer posting staff scopes → only their two read scopes survive
assert.deepEqual(
  grantableScopes(splitScopes("projects:read tasks:delete orchestration:run tasks:read tasks:manage"), "developer"),
  ["projects:read", "tasks:read"]
);

// 2. unknown / junk scopes dropped, duplicates collapsed, order kept
assert.deepEqual(grantableScopes(["tasks:read", "admin:*", "tasks:read", "projects:read"], "pm"), ["tasks:read", "projects:read"]);

// 3. roles with no grant get nothing
assert.deepEqual(grantableScopes(["projects:read"], "client"), []);
assert.deepEqual(grantableScopes(["projects:read"], "hr"), []);

// 4. staff keep everything they asked for
assert.deepEqual(grantableScopes(["tasks:delete", "orchestration:run"], "admin"), ["tasks:delete", "orchestration:run"]);

// 5. splitScopes tolerates empty / extra spaces
assert.deepEqual(splitScopes(""), []);
assert.deepEqual(splitScopes(null), []);
assert.deepEqual(splitScopes(" a  b "), ["a", "b"]);

// 6. PKCE challenge format (base64url, 43–128)
assert.equal(isValidCodeChallenge("a".repeat(43)), true);
assert.equal(isValidCodeChallenge("A-_z9".repeat(20) + "abcdefgh"), true); // 108 chars
assert.equal(isValidCodeChallenge("a".repeat(42)), false);
assert.equal(isValidCodeChallenge("a".repeat(129)), false);
assert.equal(isValidCodeChallenge("a".repeat(42) + "+"), false);
assert.equal(isValidCodeChallenge("a".repeat(42) + "/"), false);
assert.equal(isValidCodeChallenge(""), false);
assert.equal(isValidCodeChallenge(undefined), false);

// 7. redirect building keeps an existing query and encodes values
assert.equal(
  clientRedirectUrl("https://claude.ai/api/mcp/auth_callback?a=1", { code: "xyz", state: "s t&u" }),
  "https://claude.ai/api/mcp/auth_callback?a=1&code=xyz&state=s+t%26u"
);
assert.equal(clientRedirectUrl("http://localhost:6274/cb", { error: "access_denied", state: "" }), "http://localhost:6274/cb?error=access_denied&state=");

console.log("488 MCP authorize rules: all checks passed");
