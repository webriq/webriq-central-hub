import { NextRequest, NextResponse } from "next/server";
import { adminClient } from "@/lib/supabase/admin";
import { INBOX_ID_RE, requireInboxStaff } from "@/lib/desk/inbox-staff-gate";
import { isMissingUnreadColumn } from "@/lib/desk/inbox-unread";

// POST /api/desk/tickets/[ticketId]/read — task 490: mark a Desk Inbox thread read for the whole team (D1). Resets
// unread_count and records seen_at/seen_by; customer messages older than seen_at never count again. Idempotent.
// adminClient for the write (same pattern as the status route). 503 until migration 186 — the client ignores it.
export async function POST(_request: NextRequest, { params }: { params: Promise<{ ticketId: string }> }) {
  const gate = await requireInboxStaff();
  if (gate instanceof NextResponse) return gate;

  const { ticketId } = await params;
  if (!INBOX_ID_RE.test(ticketId)) return NextResponse.json({ error: "Invalid ticket id" }, { status: 400 });

  const { data, error } = await adminClient
    .from("inbox")
    .update({ unread_count: 0, seen_at: new Date().toISOString(), seen_by: gate.userId })
    .eq("id", ticketId)
    .select("id")
    .maybeSingle();
  if (isMissingUnreadColumn(error)) {
    return NextResponse.json({ error: "Unread tracking is not available yet (migration 186 not applied)" }, { status: 503 });
  }
  if (error) {
    console.error("[api/desk/tickets/[ticketId]/read] update failed:", error.message);
    return NextResponse.json({ error: "Failed to mark thread read" }, { status: 500 });
  }
  if (!data) return NextResponse.json({ error: "Ticket not found" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
