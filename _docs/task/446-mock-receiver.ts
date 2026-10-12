// Task 446 — mock StackShift events receiver, to test the Hub outbox without the StackShift app.
//
//   npx tsx _docs/task/446-mock-receiver.ts --secret <same as STACKSHIFT_EVENTS_SECRET> [--port 4010]
//   # then run the Hub with: STACKSHIFT_EVENTS_URL=http://localhost:4010/events  STACKSHIFT_EVENTS_SECRET=<secret>
//
// It verifies the Hub's HMAC signature (same scheme as the inbound API), dedupes by eventId (like the real
// receiver must), and prints/records events in arrival order, flagging per-ticket sequence regressions.
// Failure injection (local control endpoints, unauthenticated — keep this on localhost):
//   POST /_control?mode=ok|fail|timeout        every POST /events returns 200 | 503 | hangs 15 s
//   POST /_control?failNext=3                  fail the next 3 deliveries, then behave per `mode`
//   GET  /_state                               JSON: mode, failNext, received events (arrival order)
//   POST /_control?reset=1                     clear recorded events and counters
import { createServer } from "node:http";
import { verifySignature } from "../../src/lib/stackshift-support/auth-logic";

const args = process.argv.slice(2);
const opt = (n: string) => {
  const i = args.indexOf(`--${n}`);
  return i >= 0 ? args[i + 1] : undefined;
};
const PORT = Number(opt("port") ?? 4010);
const SECRET = opt("secret") ?? process.env.STACKSHIFT_EVENTS_SECRET ?? "";
if (!SECRET) {
  console.error("Pass --secret <STACKSHIFT_EVENTS_SECRET>");
  process.exit(1);
}

type Received = { at: string; eventId: string; type: string; sequence: number; ticketRef: string; duplicate: boolean; attemptsSeen: number; data: unknown };
let mode: "ok" | "fail" | "timeout" = "ok";
let failNext = 0;
let received: Received[] = [];
const seen = new Map<string, number>(); // eventId -> deliveries seen (including failed ones)
const lastSeqByTicket = new Map<string, number>();

function readBody(req: import("node:http").IncomingMessage): Promise<string> {
  return new Promise((resolve) => {
    const chunks: Buffer[] = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
  });
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", `http://localhost:${PORT}`);
  const send = (status: number, body: unknown) => {
    res.writeHead(status, { "content-type": "application/json" });
    res.end(JSON.stringify(body));
  };

  if (url.pathname === "/_state") return send(200, { mode, failNext, count: received.length, received });
  if (url.pathname === "/_control") {
    const m = url.searchParams.get("mode");
    if (m === "ok" || m === "fail" || m === "timeout") mode = m;
    if (url.searchParams.get("failNext")) failNext = Number(url.searchParams.get("failNext")) || 0;
    if (url.searchParams.get("reset")) {
      received = [];
      seen.clear();
      lastSeqByTicket.clear();
      failNext = 0;
      mode = "ok";
    }
    return send(200, { mode, failNext });
  }

  if (req.method !== "POST" || url.pathname !== "/events") return send(404, { error: "not_found" });

  const raw = await readBody(req);
  const auth = verifySignature({
    secrets: { current: SECRET },
    keyId: String(req.headers["x-ss-key-id"] ?? ""),
    timestamp: String(req.headers["x-ss-timestamp"] ?? ""),
    signature: String(req.headers["x-ss-signature"] ?? ""),
    method: "POST",
    path: url.pathname + url.search,
    rawBody: raw,
    nowSeconds: Math.floor(Date.now() / 1000),
  });
  if (!auth.ok) {
    console.log(`REJECT  ${auth.error}`);
    return send(auth.status, { error: auth.error });
  }

  let ev: { eventId?: string; type?: string; sequence?: number; ticket?: { ticketRef?: string }; data?: unknown };
  try {
    ev = JSON.parse(raw);
  } catch {
    return send(400, { error: "invalid_json" });
  }
  const eventId = ev.eventId ?? "?";
  const deliveries = (seen.get(eventId) ?? 0) + 1;
  seen.set(eventId, deliveries);

  if (failNext > 0) {
    failNext--;
    console.log(`FAIL    ${eventId} (injected, ${failNext} more) delivery #${deliveries}`);
    return send(503, { error: "injected_failure" });
  }
  if (mode === "fail") {
    console.log(`FAIL    ${eventId} (mode=fail) delivery #${deliveries}`);
    return send(503, { error: "mode_fail" });
  }
  if (mode === "timeout") {
    console.log(`HANG    ${eventId} (mode=timeout) delivery #${deliveries}`);
    setTimeout(() => send(200, { ok: true }), 15_000);
    return;
  }

  const ticketRef = ev.ticket?.ticketRef ?? "?";
  const sequence = ev.sequence ?? -1;
  const duplicate = received.some((r) => r.eventId === eventId);
  const last = lastSeqByTicket.get(ticketRef) ?? -1;
  const regression = !duplicate && sequence < last;
  if (!duplicate) lastSeqByTicket.set(ticketRef, Math.max(last, sequence));
  received.push({ at: new Date().toISOString(), eventId, type: ev.type ?? "?", sequence, ticketRef, duplicate, attemptsSeen: deliveries, data: ev.data });
  console.log(`OK      seq ${sequence} ${ev.type} ${eventId} ticket ${ticketRef}${duplicate ? "  [DUPLICATE - deduped]" : ""}${regression ? `  [OUT OF ORDER: after seq ${last} — expected for a replay; apply by sequence]` : ""}`);
  return send(200, { ok: true, duplicate });
});

server.listen(PORT, () => console.log(`Mock StackShift receiver on http://localhost:${PORT}/events  (mode=${mode})`));
