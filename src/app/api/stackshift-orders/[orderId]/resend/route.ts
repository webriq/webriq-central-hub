import { NextRequest, NextResponse } from "next/server";
import { adminClient } from "@/lib/supabase/admin";
import { requireOrderMutator } from "../../_auth";
import { getOrderNotificationRecipients } from "@/lib/stackshift-orders/recipients";
import { sendStackShiftOrderNotification } from "@/lib/email/stackshift-order-notification";
import { mapServicesToClassifications } from "@/lib/stackshift-orders/service-map";

// Task 375 — manual resend of the staff notification email for an existing order (e.g. the
// original send failed silently, or a reviewer needs to loop someone back in). Unlike the
// inbound webhook's best-effort send, this returns an error status on failure — the point of
// a manual resend button is telling the reviewer whether it actually worked.
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ orderId: string }> }
) {
  const auth = await requireOrderMutator();
  if (auth instanceof NextResponse) return auth;

  const { orderId } = await params;

  const { data: order, error } = await adminClient
    .from("stackshift_orders")
    .select("*")
    .eq("id", orderId)
    .maybeSingle();
  if (error) {
    console.error("[stackshift-order] resend lookup error:", error);
    return NextResponse.json({ error: "Lookup failed" }, { status: 500 });
  }
  if (!order) return NextResponse.json({ error: "Order not found" }, { status: 404 });

  const mapped = mapServicesToClassifications(order.services);
  const recipients = await getOrderNotificationRecipients();

  try {
    await sendStackShiftOrderNotification(recipients, {
      orderId: order.id,
      companyName: order.company_name,
      contactName: order.contact_name,
      businessEmail: order.business_email,
      mobilePhone: order.mobile_phone,
      website: order.website,
      services: order.services,
      mappedClassifications: order.mapped_classifications,
      approvedBy: order.approved_by,
      submittedAt: order.submitted_at,
      proposalFilename: order.proposal_filename,
      flowforgeSpecFilename: order.flowforge_spec_filename,
      needsReview: !mapped.validCombo,
    });
  } catch (err) {
    console.error("[stackshift-order] resend failed:", err);
    return NextResponse.json({ error: "Failed to send notification email" }, { status: 500 });
  }

  const sentAt = new Date().toISOString();
  const { error: updateError } = await adminClient
    .from("stackshift_orders")
    .update({ notification_sent_at: sentAt })
    .eq("id", orderId);
  if (updateError) console.warn("[stackshift-order] notification_sent_at not stored:", updateError.message);

  return NextResponse.json({ ok: true, notificationSentAt: sentAt, recipientCount: recipients.length });
}
