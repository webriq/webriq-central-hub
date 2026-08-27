import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Inline (cid-referenced) image serving route (task 321) — mirrors
// .../attachments/[attachmentId]/file-url/route.ts's auth/RLS pattern (session-bound client,
// ticket->message->attachment chain lookup) but differs in two ways an <img src> requires:
// no `download:` option on the signed URL (that forces a Content-Disposition download — wrong
// for something that must render inline), and a 302 redirect instead of a JSON { url } body,
// since <img> needs a directly-loadable URL, not a fetch-then-open step.
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ ticketNumber: string; messageId: string; attachmentId: string }> }
) {
  const { ticketNumber: ticketNumberParam, messageId, attachmentId } = await params;
  const ticketNumber = Number(ticketNumberParam);
  if (!Number.isInteger(ticketNumber)) {
    return NextResponse.json({ error: "Invalid ticket number" }, { status: 400 });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: ticket } = await supabase.from("tickets").select("id").eq("ticket_number", ticketNumber).maybeSingle();
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
    .select("storage_path")
    .eq("id", attachmentId)
    .eq("entity_type", "ticket_message")
    .eq("entity_id", message.id)
    .not("cid", "is", null)
    .maybeSingle();
  if (!attachment) return NextResponse.json({ error: "Inline image not found" }, { status: 404 });

  const { data: signed, error: signError } = await supabase.storage
    .from("ticket-attachments")
    .createSignedUrl(attachment.storage_path, 60);

  if (signError || !signed) {
    console.error("[api/desk/tickets/[ticketNumber]/messages/.../inline-images] sign failed:", signError?.message);
    return NextResponse.json({ error: "Failed to generate inline image URL" }, { status: 500 });
  }

  return NextResponse.redirect(signed.signedUrl);
}
