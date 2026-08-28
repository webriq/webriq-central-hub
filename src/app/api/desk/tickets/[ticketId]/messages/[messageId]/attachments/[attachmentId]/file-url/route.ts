import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// On-demand signed URL for one ticket-message attachment (task 303) — mirrors
// src/app/api/v2/projects/[projectId]/tasks/[taskId]/attachments/[attachmentId]/file-url/route.ts:
// uses the session-bound client, not adminClient. ticket-attachments' storage RLS (migration
// 117) already grants admin/super_admin/pm/developer `select` directly, and the attachments
// table's own staff-read RLS (migration 048) gates the metadata lookup below — so the session
// client's own createSignedUrl is correctly scoped without a bypass.
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ ticketId: string; messageId: string; attachmentId: string }> }
) {
  const { ticketId, messageId, attachmentId } = await params;
  if (!/^TKT-\d+$/.test(ticketId)) {
    return NextResponse.json({ error: "Invalid ticket id" }, { status: 400 });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: ticket } = await supabase.from("tickets").select("id").eq("ticket_id", ticketId).maybeSingle();
  if (!ticket) return NextResponse.json({ error: "Ticket not found" }, { status: 404 });

  const { data: message } = await supabase
    .from("ticket_messages")
    .select("id")
    .eq("id", messageId)
    .eq("ticket_id", ticket.id)
    .maybeSingle();
  if (!message) return NextResponse.json({ error: "Message not found" }, { status: 404 });

  const { data: attachment } = await supabase
    .from("attachments")
    .select("storage_path, filename")
    .eq("id", attachmentId)
    .eq("entity_type", "ticket_message")
    .eq("entity_id", message.id)
    .maybeSingle();
  if (!attachment) return NextResponse.json({ error: "Attachment not found" }, { status: 404 });

  const { data: signed, error: signError } = await supabase.storage
    .from("ticket-attachments")
    .createSignedUrl(attachment.storage_path, 60, { download: attachment.filename });

  if (signError || !signed) {
    console.error("[api/desk/tickets/[ticketId]/messages/.../file-url] sign failed:", signError?.message);
    return NextResponse.json({ error: "Failed to generate file URL" }, { status: 500 });
  }

  return NextResponse.json({ url: signed.signedUrl });
}
