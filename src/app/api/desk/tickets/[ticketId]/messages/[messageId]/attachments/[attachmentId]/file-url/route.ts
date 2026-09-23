import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { extensionInfoFor } from "@/config/attachment-types";

// On-demand signed URL for one ticket-message attachment (task 303) — mirrors
// src/app/api/v2/projects/[projectId]/tasks/[taskId]/attachments/[attachmentId]/file-url/route.ts:
// uses the session-bound client, not adminClient. ticket-attachments' storage RLS (migration
// 117) already grants admin/super_admin/pm/developer `select` directly, and the attachments
// table's own staff-read RLS (migration 048) gates the metadata lookup below — so the session
// client's own createSignedUrl is correctly scoped without a bypass.
//
// Task 393 — same `?download=1` + inline-safe-category default as the Task attachments route:
// this route used to force `Content-Disposition: attachment` unconditionally, which silently
// broke the "View" preview modal's inline rendering (the browser downloads the file instead of
// rendering it). image/pdf/word/excel/video stay inline-viewable by default; everything else,
// or an explicit `?download=1` (the kebab's "Download" action), forces a real download.
const INLINE_SAFE_CATEGORIES = new Set(["image", "pdf", "word", "excel", "video"]);

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ ticketId: string; messageId: string; attachmentId: string }> }
) {
  // Task 382 — routes by inbox.id (UUID), not the "TKT-<n>" display key. See _resolve.ts.
  const { ticketId, messageId, attachmentId } = await params;
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(ticketId)) {
    return NextResponse.json({ error: "Invalid ticket id" }, { status: 400 });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: ticket } = await supabase.from("inbox").select("id").eq("id", ticketId).maybeSingle();
  if (!ticket) return NextResponse.json({ error: "Ticket not found" }, { status: 404 });

  const { data: message } = await supabase
    .from("inbox_messages")
    .select("id")
    .eq("id", messageId)
    .eq("inbox_id", ticket.id)
    .maybeSingle();
  if (!message) return NextResponse.json({ error: "Message not found" }, { status: 404 });

  const { data: attachment } = await supabase
    .from("attachments")
    .select("storage_path, filename")
    .eq("id", attachmentId)
    .eq("entity_type", "inbox_message")
    .eq("entity_id", message.id)
    .maybeSingle();
  if (!attachment) return NextResponse.json({ error: "Attachment not found" }, { status: 404 });

  const downloadParam = new URL(req.url).searchParams.get("download") === "1";
  const category = extensionInfoFor(attachment.filename)?.category;
  const forceDownload = downloadParam || !category || !INLINE_SAFE_CATEGORIES.has(category);

  const { data: signed, error: signError } = await supabase.storage
    .from("ticket-attachments")
    .createSignedUrl(attachment.storage_path, 60, forceDownload ? { download: attachment.filename } : undefined);

  if (signError || !signed) {
    console.error("[api/desk/tickets/[ticketId]/messages/.../file-url] sign failed:", signError?.message);
    return NextResponse.json({ error: "Failed to generate file URL" }, { status: 500 });
  }

  return NextResponse.json({ url: signed.signedUrl });
}
