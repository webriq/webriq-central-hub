// Task 457 — correctedContentType() cases, taken from the live ticket-attachments bucket query.
// Run: npx tsx _docs/task/457-content-type.check.ts
import assert from "node:assert/strict";
import { correctedContentType as c } from "../../src/config/attachment-types";

// Trusted specific types are kept (charset suffix included).
assert.equal(c("application/pdf;charset=UTF-8", "a.pdf"), null);
assert.equal(c("image/png", "a.png"), null);
assert.equal(c("image/jpg", "a.jpg"), null); // equivalent spelling: no re-upload noise
// Zoho's text/html label for types it doesn't know.
assert.equal(c("text/html;charset=UTF-8", "IMG_1.heic"), "application/octet-stream");
assert.equal(c("text/html;charset=UTF-8", "a.webp"), "image/webp");
assert.equal(c("text/html;charset=UTF-8", "clip.mp4"), "video/mp4");
assert.equal(c("text/html;charset=UTF-8", "data.csv"), "text/csv");
assert.equal(c("text/html;charset=UTF-8", "logo.ai"), "application/octet-stream");
// Real HTML stays HTML.
assert.equal(c("text/html;charset=UTF-8", "page.htm"), null);
assert.equal(c("text/html;charset=UTF-8", "page.HTML"), null);
// Real text stays text; generic labels on known types are corrected.
assert.equal(c("text/plain;charset=UTF-8", "notes.txt"), null);
assert.equal(c("text/plain;charset=UTF-8", "Logo.JPG"), "image/jpeg");
assert.equal(c("application/octet-stream", "a.png"), "image/png");
// Unknown extension already stored as octet-stream: nothing to do.
assert.equal(c("application/octet-stream", "noext"), null);
// Missing type.
assert.equal(c(null, "a.pdf"), "application/pdf");
assert.equal(c("", "mystery.xyz"), "application/octet-stream");

console.log("457 content-type checks: all passed");
