import { NextRequest, NextResponse } from "next/server";
import { adminClient } from "@/lib/supabase/admin";
import type { Json } from "@/types/database";
import { assertOrderWebhookSecret } from "./_secret";
import { orderIntakeSchema, type OrderIntake } from "@/lib/stackshift-orders/schema";
import { mapServicesToClassifications } from "@/lib/stackshift-orders/service-map";
import { verifyIncomingObject } from "@/lib/stackshift-orders/uploads";
import { getOrderNotificationRecipients } from "@/lib/stackshift-orders/recipients";
import { sendStackShiftOrderNotification } from "@/lib/email/stackshift-order-notification";

// Task 347 — records a StackShift Order Form submission and notifies the review queue.
// Does NOT create customers/projects — that's a deliberate human action from
// /stackshift-orders (POST .../[orderId]/convert).
export async function POST(req: NextRequest) {
  const secretErr = assertOrderWebhookSecret(req);
  if (secretErr) return secretErr;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = orderIntakeSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload", details: parsed.error.flatten() }, { status: 400 });
  }
  const p: OrderIntake = parsed.data;

  // Idempotency — a proxy retry with the same key returns the existing row.
  if (p.idempotencyKey) {
    const { data: existing } = await adminClient
      .from("stackshift_orders")
      .select("id, status")
      .eq("dedupe_key", p.idempotencyKey)
      .maybeSingle();
    if (existing) {
      return NextResponse.json({ ok: true, orderId: existing.id, deduped: true });
    }
  }

  // Verify the referenced storage objects exist and aren't spoofed/corrupt.
  const proposalCheck = await verifyIncomingObject(p.proposalPath, p.proposalFilename);
  if (!proposalCheck.ok) {
    return NextResponse.json({ error: `Proposal document: ${proposalCheck.reason}` }, { status: 400 });
  }
  if (p.flowforgeSpecPath && p.flowforgeSpecFilename) {
    const specCheck = await verifyIncomingObject(p.flowforgeSpecPath, p.flowforgeSpecFilename);
    if (!specCheck.ok) {
      return NextResponse.json({ error: `FlowForge spec: ${specCheck.reason}` }, { status: 400 });
    }
  }

  const mapped = mapServicesToClassifications(p.services);
  const submittedAt = toIsoOrNull(p.orderDateTime);

  const { data: order, error } = await adminClient
    .from("stackshift_orders")
    .insert({
      status: "pending_review",
      submitted_at: submittedAt,
      contact_name: p.contact.name,
      company_name: p.company.name,
      website: p.company.website,
      business_email: p.contact.email,
      billing_name: p.contact.billingName || null,
      billing_email: p.contact.billingEmail || null,
      mobile_phone: p.contact.phone,
      company_address: p.company.address,
      services: p.services,
      mapped_classifications: mapped.classifications,
      proposal_path: p.proposalPath,
      proposal_filename: p.proposalFilename,
      flowforge_spec_path: p.flowforgeSpecPath || null,
      flowforge_spec_filename: p.flowforgeSpecFilename || null,
      approved_by: p.approval.approvedBy,
      approval_date: p.approval.approvalDate,
      terms_accepted: p.approval.termsAccepted,
      raw_payload: p as unknown as Json,
      dedupe_key: p.idempotencyKey ?? null,
    })
    .select("id")
    .single();

  if (error || !order) {
    console.error("[stackshift-order] insert failed:", error);
    return NextResponse.json({ error: "Failed to record submission" }, { status: 500 });
  }

  // Notification is best-effort — never fail the request over email.
  try {
    const recipients = await getOrderNotificationRecipients();
    await sendStackShiftOrderNotification(recipients, {
      orderId: order.id,
      companyName: p.company.name,
      contactName: p.contact.name,
      businessEmail: p.contact.email,
      mobilePhone: p.contact.phone,
      website: p.company.website,
      services: p.services,
      mappedClassifications: mapped.classifications,
      approvedBy: p.approval.approvedBy,
      submittedAt,
      proposalFilename: p.proposalFilename,
      flowforgeSpecFilename: p.flowforgeSpecFilename ?? null,
      needsReview: !mapped.validCombo,
    });
    await adminClient
      .from("stackshift_orders")
      .update({ notification_sent_at: new Date().toISOString() })
      .eq("id", order.id);
  } catch (err) {
    console.error("[stackshift-order] notification email failed:", err);
  }

  return NextResponse.json({ ok: true, orderId: order.id }, { status: 201 });
}

export function GET() {
  return NextResponse.json({ error: "Method not allowed" }, { status: 405 });
}

function toIsoOrNull(value: string | null | undefined): string | null {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}
