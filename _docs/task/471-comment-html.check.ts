// Run: npx tsx _docs/task/471-comment-html.check.ts
import assert from "node:assert/strict";
import { normalizeCommentHtml, normalizeZohoDescriptionHtml } from "../../src/app/(hub)/projects-old/_pm-shared";

// trailing hard break in a paragraph gets ProseMirror's companion break
assert.equal(normalizeCommentHtml("<p>Hi,<br></p><p>Next</p>"), "<p>Hi,<br><br></p><p>Next</p>");
assert.equal(normalizeCommentHtml("<p>a<br />\n</p>"), "<p>a<br /><br>\n</p>");
assert.equal(normalizeCommentHtml("<p><br></p>"), "<p><br><br></p>");
// mid-paragraph breaks and empty paragraphs untouched
assert.equal(normalizeCommentHtml("<p>a<br>b</p><p></p>"), "<p>a<br>b</p><p></p>");
// Zoho <div> trailing-br collapse still applies; description normalizer unchanged
assert.equal(normalizeCommentHtml("<div>x<br/></div>"), "<div>x</div>");
assert.equal(normalizeZohoDescriptionHtml("<p>a<br></p>"), "<p>a<br></p>");
console.log("471 comment html: ok");
