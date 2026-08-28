// dev-only import endpoint — reads _from_zoho/desk-ticket-comments.json, upserts to
// ticket_messages via the shared importDeskComments() helper
// (src/lib/migrate/desk-comments-import.ts), also used by the archived-ticket comments
// import (task 332).
import { NextResponse } from "next/server";
import path from "path";
import fs from "fs";
import { createClient } from "@/lib/supabase/server";
import { adminClient } from "@/lib/migrate/zoho-import";
import { importDeskComments, DeskTicketCommentRaw } from "@/lib/migrate/desk-comments-import";

export async function POST() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: profile } = await adminClient.from("profiles").select("role").eq("id", user.id).maybeSingle();
  if (profile?.role !== "admin" && profile?.role !== "super_admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const filePath = path.join(process.cwd(), "_from_zoho", "desk-ticket-comments.json");
  if (!fs.existsSync(filePath)) {
    return NextResponse.json({ error: "Could not find _from_zoho/desk-ticket-comments.json — export Desk Ticket Comments first" }, { status: 400 });
  }

  const comments = JSON.parse(fs.readFileSync(filePath, "utf-8")) as DeskTicketCommentRaw[];
  console.log(`[desk-ticket-comments] read ${comments.length} raw comments from desk-ticket-comments.json`);

  if (comments.length === 0) {
    return NextResponse.json({ error: "No comments found in desk-ticket-comments.json" }, { status: 400 });
  }

  try {
    return NextResponse.json(await importDeskComments(comments));
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
