import { NextRequest, NextResponse } from "next/server";
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

async function parseBody(req: NextRequest): Promise<ZohoPayload> {
  const contentType = req.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) {
    return req.json().catch(() => ({}));
  }
  // Zoho Projects sends form-encoded parameters when using the "Append Task Parameters" UI
  const text = await req.text().catch(() => "");
  const params = new URLSearchParams(text);
  return {
    taskId: params.get("taskId") ?? undefined,
    taskName: params.get("taskName") ?? undefined,
    projectId: params.get("projectId") ?? undefined,
    description: params.get("description") ?? undefined,
    ticketId: params.get("ticketId") ?? undefined,
    subject: params.get("subject") ?? undefined,
    accountId: params.get("accountId") ?? undefined,
  };
}

export async function POST(req: NextRequest) {
  const body: ZohoPayload = await parseBody(req);

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
