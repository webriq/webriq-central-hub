import { after, NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { adminClient } from "@/lib/supabase/admin";
import { enqueueStatusChanged } from "@/lib/stackshift-support/outbox";
import { dispatchTicketSoon } from "@/lib/stackshift-support/dispatch";

// Staff-only ticket status update (task 303 detail page). Follows the established pattern
// (see PATCH /api/customers/[customerId]) — session auth + explicit adminClient role check as
// the primary gate, adminClient for the write. RLS (tickets_staff_all) is a backstop, not
// bypassed in spirit: the explicit role check enforces the same admin/pm allowlist.
const VALID_STATUSES = ["open", "on_hold", "escalated", "closed"] as const;
type TicketStatus = (typeof VALID_STATUSES)[number];

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ ticketId: string }> }) {
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

  const body = await request.json().catch(() => ({}));
  const status = body.status as TicketStatus | undefined;
  if (!status || !VALID_STATUSES.includes(status)) {
    return NextResponse.json({ error: "Invalid status" }, { status: 400 });
  }

  // Task 446 — previous status, for the StackShift `ticket.status_changed` event's from/to.
  const { data: before } = await adminClient.from("inbox").select("status").eq("id", ticketId).maybeSingle();

  const isClosed = status === "closed";
  const resolvedAt = isClosed ? new Date().toISOString() : null;
  const { data, error } = await adminClient
    .from("inbox")
    .update({ status, resolved_at: resolvedAt })
    .eq("id", ticketId)
    .select("id")
    .maybeSingle();

  if (error) {
    console.error("[api/desk/tickets/[ticketId]/status] update failed:", error.message);
    return NextResponse.json({ error: "Failed to update status" }, { status: 500 });
  }
  if (!data) {
    return NextResponse.json({ error: "Ticket not found" }, { status: 404 });
  }

  // Task 446 — direct StackShift tickets only (no-op for Mail/Desk tickets). The event carries state, so
  // if this fails staff can safely re-apply the status and the next event corrects StackShift.
  if (before && before.status !== status) {
    try {
      if (await enqueueStatusChanged(ticketId, { from: before.status, to: status, resolvedAt })) {
        after(() => dispatchTicketSoon(ticketId));
      }
    } catch (err) {
      console.error("[api/desk/tickets/[ticketId]/status] outbox enqueue failed:", err);
      return NextResponse.json({ error: "Status saved, but notifying StackShift failed — re-apply the status to retry." }, { status: 500 });
    }
  }

  return NextResponse.json({ ok: true });
}
