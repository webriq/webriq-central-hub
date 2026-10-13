// Task 451 — pure checks for src/config/font-types.ts. Run: npx tsx _docs/task/451-font-types.check.ts
import assert from "node:assert/strict";
import { FONT_MIME_TYPES } from "../../src/config/font-types";
import { DESIGN_MIME_TYPES, isBrowserImage } from "../../src/config/design-file-types";
import { resolveUploadMime, extensionMimeForName } from "../../src/config/upload-mime";

const f = (name: string, type = "") => ({ name, type });
const cases: [string, string, string][] = [
  ["PPEiko-Medium.eot", "", "application/vnd.ms-fontobject"],
  ["PPEiko-Medium.otf", "application/x-font-opentype", "font/otf"],
  ["PPEiko-Medium.ttf", "application/octet-stream", "font/ttf"],
  ["PPEiko-Medium.woff", "font/woff", "font/woff"],
  ["PPEiko-Medium.WOFF2", "", "font/woff2"],
  ["x.ttc", "", "font/collection"],
  ["x.otc", "", "font/collection"],
  ["logo.EPS", "application/postscript", "application/postscript"],
  ["logo.eps", "", "application/postscript"],
  ["art.psd", "", "image/vnd.adobe.photoshop"],
  ["art.psd", "application/x-photoshop", "image/vnd.adobe.photoshop"],
  ["mark.ai", "application/postscript", "application/illustrator"],
  ["ui.fig", "application/octet-stream", "application/x-figma"],
];
for (const [name, type, want] of cases) {
  assert.equal(resolveUploadMime(f(name, type)), want, name);
  assert.ok(FONT_MIME_TYPES.includes(want) || DESIGN_MIME_TYPES.includes(want), `${want} allowlisted`);
}
// non-fonts: file.type unchanged — empty stays empty (still rejected by the whitelist)
assert.equal(resolveUploadMime(f("x.ts", "")), "");
assert.equal(resolveUploadMime(f("x.ico", "")), "");
assert.equal(resolveUploadMime(f("logo.png", "image/png")), "image/png");
assert.equal(resolveUploadMime(f("noext", "text/plain")), "text/plain");
assert.equal(extensionMimeForName("a.exe"), null);
assert.equal(extensionMimeForName("constructor"), null);
assert.equal(extensionMimeForName("a.constructor"), null);
// Photoshop is image/* but must not be fed to <img>; real images still are
assert.equal(isBrowserImage("image/vnd.adobe.photoshop"), false);
assert.equal(isBrowserImage("image/psd"), false);
assert.equal(isBrowserImage("image/png"), true);
assert.equal(isBrowserImage("image/svg+xml"), true);
assert.equal(isBrowserImage("application/pdf"), false);
console.log("font-types checks passed");
