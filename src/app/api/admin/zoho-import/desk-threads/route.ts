// dev-only import endpoint — reads _from_zoho/desk-threads.json, upserts to ticket_messages
// via the shared importDeskThreads() helper (src/lib/migrate/desk-threads-import.ts), also
// used by the archived-ticket threads import (task 332).
import { NextResponse } from "next/server";
import path from "path";
import fs from "fs";
import { createClient } from "@/lib/supabase/server";
import { adminClient } from "@/lib/migrate/zoho-import";
import { importDeskThreads, DeskThreadRaw } from "@/lib/migrate/desk-threads-import";

export async function POST() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: profile } = await adminClient.from("profiles").select("role").eq("id", user.id).maybeSingle();
  if (profile?.role !== "admin" && profile?.role !== "super_admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const filePath = path.join(process.cwd(), "_from_zoho", "desk-threads.json");
  if (!fs.existsSync(filePath)) {
    return NextResponse.json({ error: "Could not find _from_zoho/desk-threads.json — export Desk Threads first" }, { status: 400 });
  }

  const threads = JSON.parse(fs.readFileSync(filePath, "utf-8")) as DeskThreadRaw[];
  console.log(`[desk-threads] read ${threads.length} raw threads from desk-threads.json`);

  if (threads.length === 0) {
    return NextResponse.json({ error: "No threads found in desk-threads.json" }, { status: 400 });
  }

  try {
    return NextResponse.json(await importDeskThreads(threads));
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
