// Task 445 — signed-request harness for the StackShift support inbound API (contract v1 §3), so the
// Hub side can be verified without the StackShift app.
//
//   STACKSHIFT_SUPPORT_SECRET=<same throwaway secret the dev server runs with> \
//     npx tsx _docs/task/445-support-harness.ts --base http://localhost:3000
//
// Flags: --base <url>  --secret <s> (default $STACKSHIFT_SUPPORT_SECRET)  --site <name> (default a random
//        throwaway site)  --skip-ratelimit  --expect-unconfigured (run ONLY the 503 case against a server
//        started WITHOUT STACKSHIFT_SUPPORT_SECRET).
// Needs migrations 169 + 170 applied. It writes real rows (tagged with a throwaway harness-* site) into
// whatever database the target server points at — use a dev/preview database.
import { signRequest } from "../../src/lib/stackshift-support/auth-logic";

const args = process.argv.slice(2);
const flag = (n: string) => args.includes(`--${n}`);
const opt = (n: string) => {
  const i = args.indexOf(`--${n}`);
  return i >= 0 ? args[i + 1] : undefined;
};

const BASE = (opt("base") ?? "http://localhost:3000").replace(/\/$/, "");
const SECRET = opt("secret") ?? process.env.STACKSHIFT_SUPPORT_SECRET ?? "";
const RUN = Math.random().toString(36).slice(2, 8);
const SITE = opt("site") ?? `harness-${RUN}`;
const OTHER_SITE = `harness-other-${RUN}`;
const API = "/api/webhooks/stackshift-support/v1";

const actor = (site = SITE) => ({ site, userRef: "usr_harness", email: `harness+${RUN}@example.com`, name: "Harness User" });

type Sign = { secret?: string; keyId?: string; timestamp?: number; badSignature?: boolean };
async function call(method: string, path: string, body?: unknown, s: Sign = {}) {
  const raw = body === undefined ? "" : typeof body === "string" ? body : JSON.stringify(body);
  const url = new URL(BASE + path);
  const timestamp = s.timestamp ?? Math.floor(Date.now() / 1000);
  const keyId = (s.keyId ?? "current") as "current" | "next";
  let signature = signRequest({ secret: s.secret ?? SECRET, keyId, timestamp, method, path: url.pathname + url.search, body: raw });
  if (s.badSignature) signature = signature.replace(/.$/, signature.endsWith("0") ? "1" : "0");
  const res = await fetch(url, {
    method,
    headers: {
      "content-type": "application/json",
      "x-ss-key-id": s.keyId ?? "current",
      "x-ss-timestamp": String(timestamp),
      "x-ss-signature": signature,
    },
    body: method === "GET" ? undefined : raw,
  });
  const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  return { status: res.status, json, headers: res.headers };
}

let failed = 0;
function report(name: string, ok: boolean, detail = "") {
  if (!ok) failed++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${ok ? "" : `  -> ${detail}`}`);
}
const expect = (name: string, r: { status: number; json: Record<string, unknown> }, status: number, extra?: (j: Record<string, unknown>) => boolean) =>
  report(name, r.status === status && (extra ? extra(r.json) : true), `got ${r.status} ${JSON.stringify(r.json).slice(0, 200)}`);

// Task 447 — upload round trip: sign -> PUT bytes straight to Storage -> register on create. Run with
// `--suite attachments`. Needs the ticket-attachments bucket (migration 117) and migrations 169-170.
const PNG_1X1 = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==",
  "base64",
);

async function signFiles(ticketRef: string, files: { filename: string; contentType: string; size: number }[], site = SITE) {
  return call("POST", `${API}/uploads/sign`, { actor: actor(site), ticketRef, files });
}

async function putBytes(uploadUrl: string, bytes: Buffer, contentType: string) {
  const res = await fetch(uploadUrl, { method: "PUT", headers: { "content-type": contentType, "x-upsert": "false" }, body: new Uint8Array(bytes) });
  return res.status;
}

async function attachmentsSuite() {
  const ref = `harness_att_${RUN}`;
  const png = { filename: "pixel.png", contentType: "image/png", size: PNG_1X1.length };

  const signed = await signFiles(ref, [png]);
  const upload = (signed.json.uploads as { path: string; uploadUrl: string }[] | undefined)?.[0];
  expect("sign allowed png => 200 with a signed upload URL", signed, 200, () => !!upload?.uploadUrl && upload.path.startsWith("stackshift-support/"));
  if (!upload) return;

  report("PUT bytes straight to Storage => 2xx", (await putBytes(upload.uploadUrl, PNG_1X1, "image/png")) < 300);

  const createWith = (key: string, tRef: string, attachments: unknown[], site = SITE) =>
    call("POST", `${API}/tickets`, {
      idempotencyKey: key, ticketRef: tRef, actor: actor(site), subject: `Attachment harness ${RUN}`, bodyHtml: "<p>with a file</p>", attachments,
    });
  const reg = { path: upload.path, filename: png.filename, contentType: png.contentType, size: png.size };

  expect("create with registered attachment => 201", await createWith(`harness-att-${RUN}`, ref, [reg]), 201, (j) => j.ok === true);

  expect("another site cannot register that path => 400", await createWith(`harness-att-x-${RUN}`, `harness_att_x_${RUN}`, [reg], OTHER_SITE), 400, (j) => j.error === "invalid_payload");
  expect("same path on another ticketRef => 400", await createWith(`harness-att-y-${RUN}`, `harness_att_y_${RUN}`, [reg]), 400, (j) => j.error === "invalid_payload");

  expect("disallowed type (.exe) => 422", await signFiles(ref, [{ filename: "run.exe", contentType: "application/x-msdownload", size: 10 }]), 422, (j) => j.error === "unsupported_file_type");
  expect("oversize file (26 MB) => 413", await signFiles(ref, [{ filename: "big.png", contentType: "image/png", size: 26 * 1024 * 1024 }]), 413, (j) => j.error === "payload_too_large");
  expect("more than 10 files => 400", await signFiles(ref, Array.from({ length: 11 }, () => png)), 400, (j) => j.error === "invalid_payload");

  // Spoof: text bytes uploaded under a .png name must be rejected at register time, and no ticket created.
  const spoofRef = `harness_spoof_${RUN}`;
  const spoofSigned = await signFiles(spoofRef, [{ filename: "fake.png", contentType: "image/png", size: 20 }]);
  const spoof = (spoofSigned.json.uploads as { path: string; uploadUrl: string }[])?.[0];
  if (spoof) {
    await putBytes(spoof.uploadUrl, Buffer.from("this is not really a png"), "image/png");
    const r = await createWith(`harness-spoof-${RUN}`, spoofRef, [{ path: spoof.path, filename: "fake.png", contentType: "image/png", size: 20 }]);
    expect("spoofed file rejected at register => 400 naming the path", r, 400, (j) => (j.details as { path?: string } | undefined)?.path === spoof.path);
    const retry = await call("POST", `${API}/tickets/${spoofRef}/status`, { idempotencyKey: `harness-spoof-st-${RUN}`, actor: actor(), status: "closed" });
    expect("no ticket was created for the rejected request => 404", retry, 404, (j) => j.error === "ticket_not_found");
  }

  console.log(failed === 0 ? "\nAll attachment cases passed." : `\n${failed} case(s) FAILED.`);
  console.log("Outbound download URLs need a staff reply with attachment rows: check ticket.reply events via the mock receiver (446) or GET /events.");
}

// Task 448 — Support Center reads: list (keyset paging, filters), detail, redaction, cross-site 404. Run with
// `--suite reads`. Needs migrations 169-172 applied (172 only affects messageCount / lastMessageAt).
async function readsSuite() {
  const get = (query: string, site = SITE) => call("GET", `${API}/tickets?${query}${query ? "&" : ""}site=${encodeURIComponent(site)}`);
  const refA = `harness_rd_a_${RUN}`;
  const refB = `harness_rd_b_${RUN}`;
  const mkTicket = (ref: string, userRef: string) =>
    call("POST", `${API}/tickets`, {
      idempotencyKey: `harness-rd-${ref}`, ticketRef: ref, actor: { ...actor(), userRef }, subject: `Reads harness ${ref}`, bodyHtml: "<p>first message</p>",
    });

  expect("create ticket A (user u1) => 201", await mkTicket(refA, "u1"), 201);
  expect("create ticket B (user u2) => 201", await mkTicket(refB, "u2"), 201);

  type Listed = { tickets: { ticketRef: string; messageCount: number }[]; nextCursor: string | null };
  const page1 = await get("limit=1");
  const l1 = page1.json as unknown as Listed;
  expect("list limit=1 => 1 ticket, newest first (B), with a nextCursor", page1, 200, () => l1.tickets.length === 1 && l1.tickets[0].ticketRef === refB && !!l1.nextCursor);
  const page2 = await get(`limit=1&cursor=${encodeURIComponent(l1.nextCursor ?? "")}`);
  const l2 = page2.json as unknown as Listed;
  expect("cursor => next page is A, and the end has nextCursor null", page2, 200, () => l2.tickets[0]?.ticketRef === refA && l2.nextCursor === null);

  const userOnly = (await get("userRef=u1")).json as unknown as Listed;
  report("userRef narrows to that requester's tickets", userOnly.tickets.length === 1 && userOnly.tickets[0].ticketRef === refA);
  const closedOnly = (await get("status=closed")).json as unknown as Listed;
  report("status=closed excludes open tickets", closedOnly.tickets.length === 0);
  const all = (await get("limit=50")).json as unknown as Listed;
  report("messageCount reflects the opening message (needs migration 172)", all.tickets.find((t) => t.ticketRef === refA)?.messageCount === 1, "messageCount !== 1 — is migration 172 applied?");

  expect("bad status => 400", await get("status=deleted"), 400, (j) => j.error === "invalid_payload");
  expect("limit=0 => 400", await get("limit=0"), 400, (j) => j.error === "invalid_payload");
  expect("limit=51 => 400", await get("limit=51"), 400, (j) => j.error === "invalid_payload");
  expect("garbage cursor => 400", await get("cursor=%25%25garbage"), 400, (j) => j.error === "invalid_payload");
  expect("missing site => 400", await call("GET", `${API}/tickets`), 400, (j) => j.error === "invalid_payload");
  expect("tampered GET signature => 401", await call("GET", `${API}/tickets?site=${SITE}`, undefined, { badSignature: true }), 401, (j) => j.error === "bad_signature");

  // Detail: shape, redaction, activity
  const detail = await call("GET", `${API}/tickets/${refA}?site=${SITE}`);
  expect("detail => 200 with the public message and a 'created' activity entry", detail, 200, (j) => {
    const m = j.messages as { bodyHtml: string; authorType: string }[];
    const a = j.activity as { type: string }[];
    return m.length === 1 && m[0].bodyHtml.includes("first message") && m[0].authorType === "client" && a[0].type === "created";
  });
  const raw = JSON.stringify(detail.json);
  report("detail never exposes source_meta / emails / ids of staff", !/source_meta|requester_email|customer_view|author_id|@example\.com/.test(raw), "a forbidden field appeared in the response");

  await call("POST", `${API}/tickets/${refA}/comments`, { idempotencyKey: `harness-rd-c-${RUN}`, commentRef: `rd_c_${RUN}`, actor: { ...actor(), userRef: "u1" }, bodyHtml: "<p>more</p>" });
  await call("POST", `${API}/tickets/${refA}/status`, { idempotencyKey: `harness-rd-s-${RUN}`, actor: { ...actor(), userRef: "u1" }, status: "closed" });
  const after = (await call("GET", `${API}/tickets/${refA}?site=${SITE}`)).json as { status: string; messages: unknown[]; activity: { type: string; summary: string }[] };
  report("after a comment + close: 2 messages, status closed", after.messages.length === 2 && after.status === "closed");
  report("activity lists the comment and the customer's close", after.activity.some((a) => a.type === "customer_comment") && after.activity.some((a) => a.summary === "You closed the ticket"));

  // Isolation: another site sees nothing, and cannot tell "other site's ticket" from "no such ticket"
  const otherList = (await get("", OTHER_SITE)).json as unknown as Listed;
  report("another site's list is empty", otherList.tickets.length === 0);
  const crossSite = await call("GET", `${API}/tickets/${refA}?site=${OTHER_SITE}`);
  const unknown = await call("GET", `${API}/tickets/does_not_exist_${RUN}?site=${OTHER_SITE}`);
  expect("other site's ticket => 404", crossSite, 404, (j) => j.error === "ticket_not_found");
  report("...identical to an unknown ticketRef (existence does not leak)", crossSite.status === unknown.status && JSON.stringify(crossSite.json).replace(refA, "X") === JSON.stringify(unknown.json).replace(`does_not_exist_${RUN}`, "X"));

  console.log(failed === 0 ? "\nAll read cases passed." : `\n${failed} case(s) FAILED.`);
}

async function main() {
  if (opt("suite") === "reads") {
    if (!SECRET) throw new Error("Set STACKSHIFT_SUPPORT_SECRET or pass --secret");
    await readsSuite();
    return;
  }
  if (opt("suite") === "attachments") {
    if (!SECRET) throw new Error("Set STACKSHIFT_SUPPORT_SECRET or pass --secret");
    await attachmentsSuite();
    return;
  }
  if (flag("expect-unconfigured")) {
    const r = await call("POST", `${API}/tickets`, {}, { secret: "irrelevant" });
    expect("unset secret => 503 not_configured", r, 503, (j) => j.error === "not_configured");
    return;
  }
  if (!SECRET) throw new Error("Set STACKSHIFT_SUPPORT_SECRET or pass --secret");

  const ticketRef = `harness_tkt_${RUN}`;
  const createBody = {
    idempotencyKey: `harness-create-${RUN}`,
    ticketRef,
    actor: actor(),
    subject: `Harness ticket ${RUN}`,
    bodyHtml: "<p>Created by the task 445 harness</p>",
    priority: "high",
  };

  const created = await call("POST", `${API}/tickets`, createBody);
  expect("create => 201", created, 201, (j) => j.ok === true && typeof j.hubTicketId === "string" && typeof j.ticketNumber === "number");

  const replay = await call("POST", `${API}/tickets`, createBody);
  expect("replay same key+body => 200 deduped", replay, 200, (j) => j.deduped === true && j.hubTicketId === created.json.hubTicketId);

  expect("same key, different body => 409", await call("POST", `${API}/tickets`, { ...createBody, subject: "changed" }), 409, (j) => j.error === "idempotency_conflict");
  // A lost-response retry arrives with a NEW key but the same site + subject: it is answered with the existing ticket.
  expect("same ticketRef + subject, new key => 200 deduped (lost-response retry)", await call("POST", `${API}/tickets`, { ...createBody, idempotencyKey: `harness-create2-${RUN}` }), 200, (j) => j.deduped === true && j.hubTicketId === created.json.hubTicketId);
  expect("same ticketRef, different subject => 409", await call("POST", `${API}/tickets`, { ...createBody, idempotencyKey: `harness-create3-${RUN}`, subject: "a different request" }), 409, (j) => j.error === "idempotency_conflict");

  const cBody = { idempotencyKey: `harness-cmt-${RUN}`, commentRef: `harness_cmt_${RUN}`, actor: actor(), bodyHtml: "<p>A follow-up</p>" };
  expect("comment => 201", await call("POST", `${API}/tickets/${ticketRef}/comments`, cBody), 201, (j) => j.ok === true && typeof j.messageId === "string");
  expect("comment replay => 200 deduped", await call("POST", `${API}/tickets/${ticketRef}/comments`, cBody), 200, (j) => j.deduped === true);
  expect("comment on unknown ticket => 404", await call("POST", `${API}/tickets/nope_${RUN}/comments`, { ...cBody, idempotencyKey: `harness-cmt404-${RUN}`, commentRef: `c404_${RUN}` }), 404, (j) => j.error === "ticket_not_found");

  expect("status closed => 200", await call("POST", `${API}/tickets/${ticketRef}/status`, { idempotencyKey: `harness-st1-${RUN}`, actor: actor(), status: "closed" }), 200, (j) => j.status === "closed");
  expect("status reopened => 200", await call("POST", `${API}/tickets/${ticketRef}/status`, { idempotencyKey: `harness-st2-${RUN}`, actor: actor(), status: "open" }), 200, (j) => j.status === "open");
  expect("status 'escalated' rejected => 400", await call("POST", `${API}/tickets/${ticketRef}/status`, { idempotencyKey: `harness-st3-${RUN}`, actor: actor(), status: "escalated" }), 400, (j) => j.error === "invalid_payload");

  expect("wrong site => 403", await call("POST", `${API}/tickets/${ticketRef}/comments`, { ...cBody, idempotencyKey: `harness-cmt403-${RUN}`, commentRef: `c403_${RUN}`, actor: actor(OTHER_SITE) }), 403, (j) => j.error === "site_forbidden");

  const probe = { ...createBody, idempotencyKey: `harness-auth-${RUN}`, ticketRef: `harness_auth_${RUN}` };
  expect("bad signature => 401", await call("POST", `${API}/tickets`, probe, { badSignature: true }), 401, (j) => j.error === "bad_signature");
  expect("wrong secret => 401", await call("POST", `${API}/tickets`, probe, { secret: "not-the-secret" }), 401, (j) => j.error === "bad_signature");
  expect("stale timestamp => 401", await call("POST", `${API}/tickets`, probe, { timestamp: Math.floor(Date.now() / 1000) - 3600 }), 401, (j) => j.error === "stale_timestamp");
  expect("unknown key id => 401", await call("POST", `${API}/tickets`, probe, { keyId: "bogus" }), 401, (j) => j.error === "unknown_key");

  expect("unknown field => 400", await call("POST", `${API}/tickets`, { ...probe, surprise: true }), 400, (j) => j.error === "invalid_payload");
  expect("non-empty attachments => 400 (task 447)", await call("POST", `${API}/tickets`, { ...probe, attachments: [{ path: "x" }] }), 400, (j) => j.error === "invalid_payload");
  expect("malformed JSON => 400", await call("POST", `${API}/tickets`, "{not json"), 400, (j) => j.error === "invalid_payload");
  expect("oversize body => 413", await call("POST", `${API}/tickets`, { ...probe, bodyHtml: "x".repeat(300 * 1024) }), 413, (j) => j.error === "payload_too_large");

  if (!flag("skip-ratelimit")) {
    const rlSite = `harness-rl-${RUN}`;
    const statuses: number[] = [];
    let retryAfter: string | null = null;
    for (let batch = 0; batch < 5; batch++) {
      const rs = await Promise.all(
        Array.from({ length: 25 }, (_, i) =>
          call("POST", `${API}/tickets/rl_${RUN}/status`, { idempotencyKey: `harness-rl-${RUN}-${batch}-${i}`, actor: actor(rlSite), status: "closed" }),
        ),
      );
      for (const r of rs) {
        statuses.push(r.status);
        retryAfter ??= r.headers.get("retry-after");
      }
    }
    // 125 requests in <1 min against a 120/min limit: the tail must be 429 (unless the minute rolled over).
    const limited = statuses.filter((s) => s === 429).length;
    report("rate limit => 429 with Retry-After", limited > 0 && !!retryAfter, `429s=${limited} retry-after=${retryAfter} (re-run if the minute window rolled mid-test)`);
  }

  console.log(failed === 0 ? "\nAll cases passed." : `\n${failed} case(s) FAILED.`);
  console.log(`Test data: site=${SITE} ticketRef=${ticketRef} (remove manually if needed). Check /desk/inbox and stackshift_support_audit for the audit rows.`);
}

main()
  .catch((e) => {
    console.error(e);
    failed++;
  })
  .finally(() => process.exit(failed === 0 ? 0 : 1));
