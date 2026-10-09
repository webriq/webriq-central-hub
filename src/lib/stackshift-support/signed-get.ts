import { after, NextResponse, type NextRequest } from "next/server";
import { verifySignedRequest } from "./auth";
import { recordAudit } from "./audit";
import { checkRateLimit } from "./rate-limit";
import { fail, type InboundResult } from "./inbound";

// Task 446 — shared pipeline for SIGNED GETs (events re-sync here; the Support Center reads in task 448).
// Identity travels in the query string (`site`, required) and is covered by the signature because the sorted
// query is part of the signed path (contract §5). Order: signature -> site -> rate limit -> handler -> audit.
export async function handleSignedGet(opts: {
  req: NextRequest;
  route: string;
  run: (ctx: { site: string; params: URLSearchParams }) => Promise<InboundResult>;
}): Promise<NextResponse> {
  const started = Date.now();
  const ip = opts.req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || null;
  const keyHeader = opts.req.headers.get("x-ss-key-id");
  let site: string | null = null;

  const respond = (r: InboundResult, headers?: Record<string, string>) => {
    const latencyMs = Date.now() - started;
    after(() =>
      recordAudit({ route: opts.route, keyId: keyHeader, site, ticketRef: r.ticketRef ?? null, outcome: r.outcome, statusCode: r.status, latencyMs, ip }),
    );
    return NextResponse.json(r.body, { status: r.status, headers });
  };

  const auth = verifySignedRequest(opts.req, "");
  if (!auth.ok) {
    if (auth.error === "not_configured") console.error("[stackshift-support] STACKSHIFT_SUPPORT_SECRET is not configured");
    return respond(fail(auth.status, auth.error, auth.error === "not_configured" ? "Support API is not configured" : "Request authentication failed"));
  }

  const params = new URL(opts.req.url).searchParams;
  site = params.get("site")?.trim() || null;
  if (!site || site.length > 200) return respond(fail(400, "invalid_payload", "`site` query parameter is required"));

  const limit = await checkRateLimit(site);
  if (!limit.allowed) {
    return respond(fail(429, "rate_limited", "Per-site rate limit exceeded"), { "Retry-After": String(limit.retryAfter) });
  }

  try {
    return respond(await opts.run({ site, params }));
  } catch (err) {
    console.error(`[stackshift-support] ${opts.route} failed:`, err);
    return respond(fail(500, "internal_error", "Unexpected error"));
  }
}
