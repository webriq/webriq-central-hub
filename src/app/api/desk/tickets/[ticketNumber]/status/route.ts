import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { adminClient } from "@/lib/supabase/admin";

// Staff-only ticket status update (task 303 detail page). Follows the established pattern
// (see PATCH /api/customers/[customerId]) — session auth + explicit adminClient role check as
// the primary gate, adminClient for the write. RLS (tickets_staff_all) is a backstop, not
// bypassed in spirit: the explicit role check enforces the same admin/pm allowlist.
const VALID_STATUSES = ["new", "open", "waiting_on_client", "waiting_on_us", "resolved", "closed"] as const;
type TicketStatus = (typeof VALID_STATUSES)[number];

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ ticketNumber: string }> }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: profile } = await adminClient.from("profiles").select("role").eq("id", user.id).maybeSingle();
  if (!["admin", "super_admin", "pm"].includes(profile?.role ?? "")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { ticketNumber: ticketNumberParam } = await params;
  const ticketNumber = Number(ticketNumberParam);
  if (!Number.isInteger(ticketNumber)) {
    return NextResponse.json({ error: "Invalid ticket number" }, { status: 400 });
  }

  const body = await request.json().catch(() => ({}));
  const status = body.status as TicketStatus | undefined;
  if (!status || !VALID_STATUSES.includes(status)) {
    return NextResponse.json({ error: "Invalid status" }, { status: 400 });
  }

  const isResolvedOrClosed = status === "resolved" || status === "closed";
  const { data, error } = await adminClient
    .from("tickets")
    .update({ status, resolved_at: isResolvedOrClosed ? new Date().toISOString() : null })
    .eq("ticket_number", ticketNumber)
    .select("id")
    .maybeSingle();

  if (error) {
    console.error("[api/desk/tickets/[ticketNumber]/status] update failed:", error.message);
    return NextResponse.json({ error: "Failed to update status" }, { status: 500 });
  }
  if (!data) {
    return NextResponse.json({ error: "Ticket not found" }, { status: 404 });
  }

  return NextResponse.json({ ok: true });
}
