import { NextResponse } from "next/server";
import { adminClient } from "@/lib/supabase/admin";
import { isMissingDeletedColumn, MESSAGE_DELETE_UNAVAILABLE_MESSAGE } from "@/lib/desk/inbox-deleted";
import { INBOX_ID_RE, requireInboxStaff } from "@/lib/desk/inbox-staff-gate";

// Task 497 — shared body of DELETE /api/desk/tickets/[ticketId]/messages/[messageId] (soft delete) and POST .../restore.
// Admin/super_admin/pm only (`requireInboxStaff`), adminClient for the write. Both directions are idempotent.
export async function setMessageDeleted(ticketId: string, messageId: string, deleted: boolean): Promise<NextResponse> {
  const gate = await requireInboxStaff();
  if (gate instanceof NextResponse) return gate;

  if (!INBOX_ID_RE.test(ticketId) || !INBOX_ID_RE.test(messageId)) {
    return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  }

  // The message must belong to the thread in the URL.
  const { data: message, error: readError } = await adminClient
    .from("inbox_messages")
    .select("id, deleted_at")
    .eq("id", messageId)
    .eq("inbox_id", ticketId)
    .maybeSingle();
  if (isMissingDeletedColumn(readError)) {
    return NextResponse.json({ error: MESSAGE_DELETE_UNAVAILABLE_MESSAGE }, { status: 503 });
  }
  if (readError) {
    console.error("[api/desk/tickets/[ticketId]/messages/[messageId]] soft-delete read failed:", readError.message);
    return NextResponse.json({ error: "Failed to load message" }, { status: 500 });
  }
  if (!message) return NextResponse.json({ error: "Message not found" }, { status: 404 });

  // D2 — StackShift-direct threads mirror a ticket in the StackShift app; deleting would desync it. Restore stays open.
  if (deleted) {
    const { data: thread, error: threadError } = await adminClient
      .from("inbox")
      .select("channel")
      .eq("id", ticketId)
      .maybeSingle();
    if (threadError) {
      console.error("[api/desk/tickets/[ticketId]/messages/[messageId]] thread read failed:", threadError.message);
      return NextResponse.json({ error: "Failed to load thread" }, { status: 500 });
    }
    if (thread?.channel === "stackshift") {
      return NextResponse.json({ error: "StackShift messages can't be deleted." }, { status: 409 });
    }
  }

  // Idempotent: already in the requested state.
  if ((message.deleted_at !== null) === deleted) return NextResponse.json({ ok: true });

  const patch = deleted
    ? { deleted_at: new Date().toISOString(), deleted_by: gate.userId }
    : { deleted_at: null, deleted_by: null };
  const { error } = await adminClient.from("inbox_messages").update(patch).eq("id", messageId);
  if (error) {
    console.error("[api/desk/tickets/[ticketId]/messages/[messageId]] soft-delete write failed:", error.message);
    return NextResponse.json({ error: deleted ? "Failed to delete message" : "Failed to restore message" }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
