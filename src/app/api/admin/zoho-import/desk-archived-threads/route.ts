// dev-only import endpoint (task 332) — reads _from_zoho/desk-archived-threads.json (from the
// Desk Archived Threads export) and upserts to ticket_messages via the same importDeskThreads()
// helper as the live import. Archived tickets already resolve via tickets.external_id (task
// 325), so there is no archived-specific matching logic. Run after the Desk Archived Tickets
// import; re-run the Ticket Attachments import afterwards to pull the archived files.
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { adminClient, readFromZoho } from "@/lib/migrate/zoho-import";
import { importDeskThreads, DeskThreadRaw } from "@/lib/migrate/desk-threads-import";

export async function POST() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: profile } = await adminClient.from("profiles").select("role").eq("id", user.id).maybeSingle();
  if (profile?.role !== "admin" && profile?.role !== "super_admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  let threads: DeskThreadRaw[];
  try {
    threads = readFromZoho<DeskThreadRaw>("desk-archived-threads.json");
  } catch {
    return NextResponse.json(
      { error: "Could not find _from_zoho/desk-archived-threads.json — export Desk Archived Threads first" },
      { status: 400 }
    );
  }

  console.log(`[desk-archived-threads] read ${threads.length} raw threads from desk-archived-threads.json`);
  if (threads.length === 0) {
    return NextResponse.json({ error: "No threads found in desk-archived-threads.json" }, { status: 400 });
  }

  try {
    return NextResponse.json(await importDeskThreads(threads));
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
