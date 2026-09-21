import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { adminClient } from "@/lib/supabase/admin";
import { notifyCustomerTicketCreated } from "@/lib/desk/customer-view-access";

// Task 380 — manual resend of task 379's "ticket created" customer email. Same staff-only
// auth/param shape as the sibling status route; the send itself reuses notifyCustomerTicketCreated
// unchanged (new password, fresh email, clears any lockout — see customer-view-access.ts).
export async function POST(request: NextRequest, { params }: { params: Promise<{ ticketId: string }> }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: profile } = await adminClient.from("profiles").select("role").eq("id", user.id).maybeSingle();
  if (!["admin", "super_admin", "pm"].includes(profile?.role ?? "")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Task 382 — routes by inbox.id (UUID), not the "TKT-<n>" display key. See _resolve.ts.
  const { ticketId } = await params;
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(ticketId)) {
    return NextResponse.json({ error: "Invalid ticket id" }, { status: 400 });
  }

  const { data: ticket, error } = await adminClient
    .from("inbox")
    .select("id, ticket_number, subject, requester_email")
    .eq("id", ticketId)
    .maybeSingle();

  if (error) {
    console.error("[api/desk/tickets/[ticketId]/resend-notification] lookup failed:", error.message);
    return NextResponse.json({ error: "Failed to look up ticket" }, { status: 500 });
  }
  if (!ticket) {
    return NextResponse.json({ error: "Ticket not found" }, { status: 404 });
  }
  if (!ticket.requester_email) {
    return NextResponse.json({ error: "This ticket has no requester email to notify." }, { status: 400 });
  }

  const sent = await notifyCustomerTicketCreated({
    ticketId: ticket.id,
    ticketNumber: ticket.ticket_number,
    subject: ticket.subject,
    requesterEmail: ticket.requester_email,
  });

  if (!sent) {
    return NextResponse.json({ error: "Failed to send the notification email." }, { status: 502 });
  }
  return NextResponse.json({ ok: true });
}
