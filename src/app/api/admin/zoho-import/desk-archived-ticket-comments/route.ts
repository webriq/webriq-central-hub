// dev-only import endpoint (task 332) — reads _from_zoho/desk-archived-ticket-comments.json
// (from the Desk Archived Ticket Comments export) and upserts to ticket_messages via the same
// importDeskComments() helper as the live import. Archived tickets already resolve via
// tickets.external_id (task 325). Run after the Desk Archived Tickets import; re-run the
// Ticket Attachments import afterwards.
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { adminClient, readFromZoho } from "@/lib/migrate/zoho-import";
import { importDeskComments, DeskTicketCommentRaw } from "@/lib/migrate/desk-comments-import";

export async function POST() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: profile } = await adminClient.from("profiles").select("role").eq("id", user.id).maybeSingle();
  if (profile?.role !== "admin" && profile?.role !== "super_admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  let comments: DeskTicketCommentRaw[];
  try {
    comments = readFromZoho<DeskTicketCommentRaw>("desk-archived-ticket-comments.json");
  } catch {
    return NextResponse.json(
      { error: "Could not find _from_zoho/desk-archived-ticket-comments.json — export Desk Archived Ticket Comments first" },
      { status: 400 }
    );
  }

  console.log(`[desk-archived-ticket-comments] read ${comments.length} raw comments from desk-archived-ticket-comments.json`);
  if (comments.length === 0) {
    return NextResponse.json({ error: "No comments found in desk-archived-ticket-comments.json" }, { status: 400 });
  }

  try {
    return NextResponse.json(await importDeskComments(comments));
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
