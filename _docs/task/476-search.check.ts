// Task 476 — run: npx tsx _docs/task/476-search.check.ts
import assert from "node:assert/strict";
import { orIlike } from "../../src/lib/postgrest-search";

assert.equal(orIlike(["name"], "   "), null);
assert.equal(orIlike(["name"], "*"), null);
assert.equal(orIlike(["name", "email"], "acme"), 'name.ilike."%acme%",email.ilike."%acme%"');
// LIKE wildcards are literal: `%` → `\%`, then doubled for PostgREST quoting → `\\%`
assert.equal(orIlike(["name"], "50%_off"), 'name.ilike."%50\\\\%\\\\_off%"');
// filter-syntax characters stay inside the quotes
assert.equal(orIlike(["name"], "a,b(c).d"), 'name.ilike."%a,b(c).d%"');
// quotes and backslashes are escaped
assert.equal(orIlike(["name"], 'say "hi"'), 'name.ilike."%say \\"hi\\"%"');
assert.equal(orIlike(["name"], "a\\b"), 'name.ilike."%a\\\\\\\\b%"');
assert.equal(orIlike(["name"], "a*b"), 'name.ilike."%ab%"');
console.log("476-search.check: all assertions passed");
