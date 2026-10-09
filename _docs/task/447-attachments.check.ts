// Task 447 — assertions for the attachment manifest / path-ownership / download-shape logic
// (no test runner in this repo). Run: npx tsx _docs/task/447-attachments.check.ts
import assert from "node:assert/strict";
import {
  validateManifest, buildPath, ownsPath, pathPrefix, safeName, slug, checkRegistered,
  toDownloadAttachment, contentTypeFor, MAX_ATTACHMENTS, MAX_ATTACHMENT_BYTES, UPLOAD_URL_TTL_SECONDS,
} from "../../src/lib/stackshift-support/attachments-logic";
import { redactData, buildEnvelope } from "../../src/lib/stackshift-support/outbox-logic";

const png = { filename: "shot.png", contentType: "image/png", size: 1234 };

// 1. manifest: happy path + count/size/type rules
assert.deepEqual(validateManifest([png]), { ok: true });
assert.equal(validateManifest([]).ok, false);
assert.equal(validateManifest(Array.from({ length: MAX_ATTACHMENTS + 1 }, () => png)).ok, false);
assert.equal(validateManifest(Array.from({ length: MAX_ATTACHMENTS }, () => png)).ok, true);
let r = validateManifest([{ ...png, size: MAX_ATTACHMENT_BYTES + 1 }]);
assert.ok(!r.ok && r.status === 413 && r.error === "payload_too_large");
assert.equal(validateManifest([{ ...png, size: MAX_ATTACHMENT_BYTES }]).ok, true);
r = validateManifest([{ ...png, size: 0 }]);
assert.ok(!r.ok && r.status === 400);
r = validateManifest([{ filename: "run.exe", contentType: "application/x-msdownload", size: 10 }]);
assert.ok(!r.ok && r.status === 422 && r.error === "unsupported_file_type");
r = validateManifest([{ filename: "weird.xyz", contentType: "application/octet-stream", size: 10 }]);
assert.ok(!r.ok && r.status === 422);
r = validateManifest([{ filename: "payload.exe.png", contentType: "image/png", size: 10 }]);
assert.equal(r.ok, true); // extension is the last segment; byte-level spoof check happens at register time
r = validateManifest([{ filename: "doc.pdf", contentType: "image/png", size: 10 }]);
assert.ok(!r.ok && r.status === 422, "declared MIME of another category is rejected");
assert.equal(validateManifest([{ filename: "doc.pdf", contentType: "application/octet-stream", size: 10 }]).ok, true);
assert.equal(validateManifest([{ filename: "doc.pdf", contentType: "", size: 10 }]).ok, true);
assert.equal(validateManifest([{ filename: "a.jpg", contentType: "image/png", size: 10 }]).ok, true, "same category, different image MIME");

// 2. naming + path scheme
assert.equal(safeName("my file (1).png"), "my_file__1_.png");
assert.equal(safeName("../../etc/passwd"), "passwd");
assert.equal(safeName(""), "file");
assert.equal(slug("mcgregor wealth/mnc1"), "mcgregor_wealth_mnc1");
assert.match(pathPrefix("acme", "t1"), /^stackshift-support\/acme-[0-9a-f]{10}\/t1-[0-9a-f]{10}\/$/);
assert.equal(pathPrefix("acme", "t1"), pathPrefix("acme", "t1"), "deterministic");
// review fix #6: names that differ only by punctuation must NOT share a prefix
assert.notEqual(pathPrefix("a/b", "t"), pathPrefix("a_b", "t"));
assert.notEqual(pathPrefix("a.com", "t"), pathPrefix("a_com", "t"));
assert.notEqual(pathPrefix("acme", "x/y"), pathPrefix("acme", "x_y"));
assert.equal(slug("a/b"), slug("a_b"), "the readable slug itself is still lossy — the hash is what separates them");
const p = buildPath("acme", "t1", "a b.png", 1700000000000, "xyz");
assert.equal(p, `${pathPrefix("acme", "t1")}1700000000000_xyz_a_b.png`);

// 3. ownership guard
assert.equal(ownsPath(p, "acme", "t1"), true);
assert.equal(ownsPath(p, "other", "t1"), false, "another site cannot register it");
assert.equal(ownsPath(p, "acme", "t2"), false, "nor under another ticketRef");
assert.equal(ownsPath(pathPrefix("acme", "t1"), "acme", "t1"), false, "bare prefix is not a file");
const colliding = buildPath("a/b", "t", "x.png", 1, "r");
assert.equal(ownsPath(colliding, "a/b", "t"), true);
assert.equal(ownsPath(colliding, "a_b", "t"), false, "a punctuation-colliding site cannot claim it (review fix #6)");
assert.equal(ownsPath(buildPath("acme", "x/y", "x.png", 1, "r"), "acme", "x_y"), false, "nor a colliding ticketRef");
assert.equal(ownsPath(`${pathPrefix("acme", "t1")}../t2/x.png`, "acme", "t1"), false, "traversal rejected");
assert.equal(ownsPath(`${pathPrefix("acme", "t1")}/x.png`, "acme", "t1"), false);
assert.equal(ownsPath("other-bucket-path/x.png", "acme", "t1"), false);

// 4. register-time check
const reg = (path: string, filename = "shot.png") => ({ path, filename, contentType: "image/png", size: 10 });
assert.deepEqual(checkRegistered([reg(p)], "acme", "t1"), { ok: true });
// regression (first live harness run): a create/comment WITHOUT attachments must pass, not crash on an empty list
assert.deepEqual(checkRegistered([], "acme", "t1"), { ok: true });
let c = checkRegistered([reg(p), reg(p)], "acme", "t1");
assert.ok(!c.ok && c.message.includes("Duplicate"));
c = checkRegistered([reg(buildPath("other", "t1", "x.png", 1, "r"))], "acme", "t1");
assert.ok(!c.ok && c.path === buildPath("other", "t1", "x.png", 1, "r"));
c = checkRegistered([reg(p, "run.exe")], "acme", "t1");
assert.ok(!c.ok && c.path === p);

// 5. download shape + outbound redaction
assert.equal(contentTypeFor("a.png"), "image/png");
assert.equal(contentTypeFor("a.unknownext"), "application/octet-stream");
assert.deepEqual(toDownloadAttachment({ filename: "a.png", size: 5 }, "https://signed"), {
  filename: "a.png", size: 5, contentType: "image/png", downloadUrl: "https://signed", expiresInSeconds: UPLOAD_URL_TTL_SECONDS,
});
assert.equal(UPLOAD_URL_TTL_SECONDS, 900);

// stored payloads never carry download URLs: redactData still forces attachments empty...
assert.deepEqual(redactData("ticket.reply", { messageId: "m", attachments: [{ downloadUrl: "https://stale" }] }).attachments, []);
// ...and the dispatcher injects freshly minted ones into the envelope only, each item re-filtered to the allowlist
const env = buildEnvelope({
  eventId: "e1", type: "ticket.reply", sequence: 1, occurredAt: "T",
  ticket: { ticketRef: "t1", hubTicketId: "h", ticketNumber: 1, status: "open", site: "acme" },
  data: { messageId: "m", bodyHtml: "<p>x</p>", authorName: "S", createdAt: "T" },
  attachments: [{ filename: "a.png", size: 5, contentType: "image/png", downloadUrl: "https://signed", expiresInSeconds: 900, storage_path: "secret/path" } as never],
});
assert.deepEqual(env.data.attachments, [{ filename: "a.png", size: 5, contentType: "image/png", downloadUrl: "https://signed", expiresInSeconds: 900 }]);
// non-reply events never carry attachments
const env2 = buildEnvelope({
  eventId: "e2", type: "ticket.status_changed", sequence: 2, occurredAt: "T",
  ticket: { ticketRef: "t1", hubTicketId: "h", ticketNumber: 1, status: "closed", site: "acme" },
  data: { from: "open", to: "closed" },
  attachments: [{ filename: "a.png", size: 5, contentType: "image/png", downloadUrl: "https://signed", expiresInSeconds: 900 }],
});
assert.equal("attachments" in env2.data, false);

console.log("447 attachment checks: all passed");
