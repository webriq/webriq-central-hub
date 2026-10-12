// Task 451 — pure checks for src/config/font-types.ts. Run: npx tsx _docs/task/451-font-types.check.ts
import assert from "node:assert/strict";
import { resolveUploadMime, fontMimeForName, FONT_MIME_TYPES } from "../../src/config/font-types";

const f = (name: string, type = "") => ({ name, type });
const cases: [string, string, string][] = [
  ["PPEiko-Medium.eot", "", "application/vnd.ms-fontobject"],
  ["PPEiko-Medium.otf", "application/x-font-opentype", "font/otf"],
  ["PPEiko-Medium.ttf", "application/octet-stream", "font/ttf"],
  ["PPEiko-Medium.woff", "font/woff", "font/woff"],
  ["PPEiko-Medium.WOFF2", "", "font/woff2"],
  ["x.ttc", "", "font/collection"],
  ["x.otc", "", "font/collection"],
];
for (const [name, type, want] of cases) {
  assert.equal(resolveUploadMime(f(name, type)), want, name);
  assert.ok(FONT_MIME_TYPES.includes(want), `${want} allowlisted`);
}
// non-fonts: file.type unchanged — empty stays empty (still rejected by the whitelist)
assert.equal(resolveUploadMime(f("x.ts", "")), "");
assert.equal(resolveUploadMime(f("x.ico", "")), "");
assert.equal(resolveUploadMime(f("logo.png", "image/png")), "image/png");
assert.equal(resolveUploadMime(f("noext", "text/plain")), "text/plain");
assert.equal(fontMimeForName("a.exe"), null);
assert.equal(fontMimeForName("constructor"), null);
assert.equal(fontMimeForName("a.constructor"), null);
console.log("font-types checks passed");
