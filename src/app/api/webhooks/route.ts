import { NextRequest, NextResponse } from "next/server";
import { createHmac, timingSafeEqual } from "crypto";
import { adminClient } from "@/lib/supabase/admin";
import { classifyTask } from "@/lib/ai/classify";
import type { WebhookSource } from "@/types/hub";

type ZohoPayload = {
  // Zoho Desk fields
  ticketId?: string;
  subject?: string;
  accountId?: string;
  // Zoho Projects fields
  taskId?: string;
  taskName?: string;
  projectId?: string;
  // Shared
  description?: string;
  webhookToken?: string;
};

async function resolveCustomerId(
  source: WebhookSource,
  payload: ZohoPayload
): Promise<string | null> {
  // adminClient used for reads here — Zoho server-to-server webhooks have no user session,
  // same exception as (public) onboarding routes per CLAUDE.md.
  if (source === "zoho_desk") {
    // zoho_account_id column was removed — Zoho Desk ticket → customer linking not yet implemented
    return null;
  }

  if (source === "zoho_projects" && payload.projectId) {
    const { data } = await adminClient
      .from("customer_products")
      .select("customer_id")
      .eq("zoho_project_id", payload.projectId)
      .maybeSingle();
    return data?.customer_id ?? null;
  }

  return null;
}

function parseParams(params: URLSearchParams): ZohoPayload {
  return {
    taskId: params.get("taskId") ?? undefined,
    taskName: params.get("taskName") ?? undefined,
    projectId: params.get("projectId") ?? undefined,
    description: params.get("description") ?? undefined,
    ticketId: params.get("ticketId") ?? undefined,
    subject: params.get("subject") ?? undefined,
    accountId: params.get("accountId") ?? undefined,
    webhookToken: params.get("x-webhook-token") ?? undefined,
  };
}

function parsePayload(contentType: string, rawText: string, url: string): ZohoPayload {
  if (contentType.includes("application/json")) {
    try { return JSON.parse(rawText); } catch { return {}; }
  }
  // Zoho may append params to the query string even for POST requests (visible in Preview URL)
  const queryParams = new URL(url).searchParams;
  if (queryParams.has("taskId") || queryParams.has("projectId")) {
    return parseParams(queryParams);
  }
  // Otherwise params are in the POST body as form-encoded
  return parseParams(new URLSearchParams(rawText));
}

export async function POST(req: NextRequest) {
  const contentType = req.headers.get("content-type") ?? "";
  const rawText = await req.text().catch(() => "");
  console.log("[webhook] incoming request", { contentType, rawText });
  const body: ZohoPayload = parsePayload(contentType, rawText, req.url);

  const hmacSecret = process.env.ZOHO_WEBHOOK_SECRET;
  if (hmacSecret) {
    const signature = req.headers.get("x-zp-webhook-signature") ?? "";
    const expected = createHmac("sha256", hmacSecret).update(rawText).digest("base64");
    const sigBuf = Buffer.from(signature);
    const expBuf = Buffer.from(expected);
    const valid = sigBuf.length === expBuf.length && timingSafeEqual(sigBuf, expBuf);
    if (!valid) {
      console.warn("[webhook] unauthorized — HMAC mismatch");
      return NextResponse.json({ received: true }); // 200 so Zoho doesn't retry
    }
  }

  const source: WebhookSource = body.ticketId ? "zoho_desk" : "zoho_projects";
  const title = body.subject ?? body.taskName ?? "(no title)";
  const description = body.description ?? null;
  const zoho_ticket_id = body.ticketId ?? null;
  const zoho_task_id = body.taskId ?? null;

  const customerId = await resolveCustomerId(source, body);
  if (!customerId) {
    // Return 200 — Zoho retries on non-2xx responses
    console.warn("[webhook] could not resolve customer_id", { source, ticketId: body.ticketId, taskId: body.taskId });
    return NextResponse.json({ received: true });
  }

  // Await classification so the record exists before the webhook response returns.
  // Haiku latency (~1–2s) is well within Zoho's 30s webhook timeout.
  await classifyTask({ customerId, title, description, source, zoho_ticket_id, zoho_task_id });

  return NextResponse.json({ received: true });
}
