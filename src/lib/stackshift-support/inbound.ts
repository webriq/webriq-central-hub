import { after, NextResponse, type NextRequest } from "next/server";
import type { ZodType } from "zod";
import { adminClient } from "@/lib/supabase/admin";
import type { Json } from "@/types/database";
import { MAX_BODY_BYTES, verifySignedRequest } from "./auth";
import { recordAudit } from "./audit";
import { checkRateLimit } from "./rate-limit";
import { decideIdempotency, hashBody } from "./inbound-logic";

// Task 445 — the shared request pipeline for every inbound endpoint (contract §1 + §3):
//   raw body -> signature -> size -> JSON -> zod -> rate limit -> [handler: site auth, idempotency, write] -> audit.
// Real 4xx/5xx with the contract's `error` codes (the StackShift server is ours and should see failures).
// Writes use adminClient: the caller is a signed server, not a Supabase user, so there is no session/RLS
// context — this is the same documented exception the stackshift-order webhook takes.

export type InboundResult = {
  status: number;
  body: Record<string, unknown>;
  outcome: string;
  ticketRef?: string | null;
};

export function fail(status: number, error: string, message: string, details?: unknown, ticketRef?: string | null): InboundResult {
  return { status, body: { error, message, ...(details !== undefined ? { details } : {}) }, outcome: error, ticketRef };
}

type Actor = { site: string };
// The key is optional: pure-mint calls such as uploads/sign (task 447) carry no write to dedupe.
type WithKey = { idempotencyKey?: string; actor: Actor };

export async function handleInbound<T extends WithKey>(opts: {
  req: NextRequest;
  route: string;
  schema: ZodType<T>;
  // Path-scoped ticket ref (comments/status); undefined for create.
  pathTicketRef?: string;
  run: (ctx: { data: T; bodyHash: string }) => Promise<InboundResult>;
}): Promise<NextResponse> {
  const started = Date.now();
  const ip = opts.req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || null;
  const keyHeader = opts.req.headers.get("x-ss-key-id");
  let site: string | null = null;
  const ticketRef: string | null = opts.pathTicketRef ?? null;

  const respond = (r: InboundResult, headers?: Record<string, string>) => {
    const latencyMs = Date.now() - started;
    after(() =>
      recordAudit({
        route: opts.route,
        keyId: keyHeader,
        site,
        ticketRef: r.ticketRef ?? ticketRef,
        outcome: r.outcome,
        statusCode: r.status,
        latencyMs,
        ip,
      }),
    );
    return NextResponse.json(r.body, { status: r.status, headers });
  };

  const rawBody = await opts.req.text();

  const auth = verifySignedRequest(opts.req, rawBody);
  if (!auth.ok) {
    if (auth.error === "not_configured") console.error("[stackshift-support] STACKSHIFT_SUPPORT_SECRET is not configured");
    return respond(fail(auth.status, auth.error, authMessage(auth.error)));
  }

  if (Buffer.byteLength(rawBody, "utf8") > MAX_BODY_BYTES) {
    return respond(fail(413, "payload_too_large", `Body exceeds ${MAX_BODY_BYTES} bytes`));
  }

  let json: unknown;
  try {
    json = JSON.parse(rawBody);
  } catch {
    return respond(fail(400, "invalid_payload", "Body is not valid JSON"));
  }
  const parsed = opts.schema.safeParse(json);
  if (!parsed.success) {
    return respond(fail(400, "invalid_payload", "Payload failed validation", parsed.error.flatten()));
  }
  const data = parsed.data;
  site = data.actor.site;

  const limit = await checkRateLimit(site);
  if (!limit.allowed) {
    return respond(fail(429, "rate_limited", "Per-site rate limit exceeded"), { "Retry-After": String(limit.retryAfter) });
  }

  const bodyHash = hashBody(rawBody);
  const idem = data.idempotencyKey ? await lookupIdempotency(data.idempotencyKey) : null;
  const decision = decideIdempotency(idem, opts.route, bodyHash);
  if (decision.kind === "conflict") {
    return respond(fail(409, "idempotency_conflict", "Idempotency key was already used with a different request"));
  }
  if (decision.kind === "replay") {
    return respond({ status: 200, body: { ...decision.response, deduped: true }, outcome: "deduped", ticketRef });
  }

  let result: InboundResult;
  try {
    result = await opts.run({ data, bodyHash });
  } catch (err) {
    console.error(`[stackshift-support] ${opts.route} failed:`, err);
    return respond(fail(500, "internal_error", "Unexpected error"));
  }

  if (result.status < 300 && data.idempotencyKey) await storeIdempotency(data.idempotencyKey, opts.route, bodyHash, result.body);
  return respond(result);
}

function authMessage(code: string): string {
  switch (code) {
    case "not_configured":
      return "Support API is not configured";
    case "stale_timestamp":
      return "Timestamp missing, malformed or outside the allowed skew";
    case "unknown_key":
      return "Unknown or missing key id";
    default:
      return "Signature verification failed";
  }
}

// Pre-migration-170 safety: a missing table degrades to "no dedupe" (a replayed create then hits the
// unique ticketRef and returns 409) instead of failing every request.
async function lookupIdempotency(key: string) {
  const { data, error } = await adminClient
    .from("stackshift_idempotency")
    .select("route, body_hash, response")
    .eq("key", key)
    .maybeSingle();
  if (error) {
    console.warn("[stackshift-support] idempotency lookup unavailable:", error.message);
    return null;
  }
  return data ? { route: data.route, body_hash: data.body_hash, response: data.response as Record<string, unknown> } : null;
}

async function storeIdempotency(key: string, route: string, bodyHash: string, response: Record<string, unknown>) {
  const { error } = await adminClient
    .from("stackshift_idempotency")
    .upsert({ key, route, body_hash: bodyHash, response: response as Json }, { onConflict: "key", ignoreDuplicates: true });
  if (error) console.warn("[stackshift-support] idempotency store failed:", error.message);
}

// Ticket-scoped calls: 404 for an unknown ref, 403 when the ticket belongs to another site (contract §1 rule 7).
export async function loadTicketForSite(ticketRef: string, site: string) {
  const { data } = await adminClient
    .from("inbox")
    .select("id, ticket_number, status, stackshift_site")
    .eq("external_ref", ticketRef)
    .maybeSingle();
  if (!data) return { error: fail(404, "ticket_not_found", "Unknown ticketRef", undefined, ticketRef) };
  if (data.stackshift_site !== site) return { error: fail(403, "site_forbidden", "Ticket belongs to another site", undefined, ticketRef) };
  return { ticket: data };
}
