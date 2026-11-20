import { NextResponse } from "next/server";
import { adminClient } from "@/lib/supabase/admin";
import { DELETE_UNAVAILABLE_MESSAGE, isMissingDeletedColumn } from "@/lib/desk/inbox-deleted";
import { INBOX_ID_RE, requireInboxStaff } from "@/lib/desk/inbox-staff-gate";

// Task 489 — shared body of DELETE /api/desk/tickets/[ticketId] (soft delete) and POST .../restore. Admin/super_admin/pm
// only (`requireInboxStaff`), adminClient for the write. Both directions are idempotent.
export async function setThreadDeleted(ticketId: string, deleted: boolean): Promise<NextResponse> {
  const gate = await requireInboxStaff();
  if (gate instanceof NextResponse) return gate;

  if (!INBOX_ID_RE.test(ticketId)) return NextResponse.json({ error: "Invalid ticket id" }, { status: 400 });

  const { data: thread, error: readError } = await adminClient
    .from("inbox")
    .select("id, channel, deleted_at")
    .eq("id", ticketId)
    .maybeSingle();
  if (isMissingDeletedColumn(readError)) return NextResponse.json({ error: DELETE_UNAVAILABLE_MESSAGE }, { status: 503 });
  if (readError) {
    console.error("[api/desk/tickets/[ticketId]] soft-delete read failed:", readError.message);
    return NextResponse.json({ error: "Failed to load thread" }, { status: 500 });
  }
  if (!thread) return NextResponse.json({ error: "Ticket not found" }, { status: 404 });

  // D3 — StackShift-direct threads mirror a ticket in the StackShift app; deleting would desync it. Close instead.
  if (deleted && thread.channel === "stackshift") {
    return NextResponse.json(
      { error: "StackShift tickets can't be deleted — close this ticket instead." },
      { status: 409 }
    );
  }

  // Idempotent: already in the requested state.
  if ((thread.deleted_at !== null) === deleted) return NextResponse.json({ ok: true });

  const patch = deleted
    ? { deleted_at: new Date().toISOString(), deleted_by: gate.userId }
    : { deleted_at: null, deleted_by: null };
  const { error } = await adminClient.from("inbox").update(patch).eq("id", ticketId);
  if (error) {
    console.error("[api/desk/tickets/[ticketId]] soft-delete write failed:", error.message);
    return NextResponse.json({ error: deleted ? "Failed to delete thread" : "Failed to restore thread" }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
