// dev-only import endpoint — reads _from_zoho/desk-archived-tickets.json (task 325's
// archived-ticket export) and upserts into the same `tickets` table as the live
// desk-tickets import, reusing importDeskTickets() verbatim. Archived rows are
// distinguished by source_meta.isArchived (set from the ticket payload's isArchived: true).
import { NextResponse } from "next/server";
import { readFromZoho } from "@/lib/migrate/zoho-import";
import { adminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { importDeskTickets, DeskTicketRaw } from "@/lib/migrate/desk-tickets-import";

export async function POST() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: profile } = await adminClient.from("profiles").select("role").eq("id", user.id).maybeSingle();
  if (profile?.role !== "admin" && profile?.role !== "super_admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  let tickets: DeskTicketRaw[];
  try {
    tickets = readFromZoho<DeskTicketRaw>("desk-archived-tickets.json");
  } catch {
    return NextResponse.json(
      { error: "Could not read _from_zoho/desk-archived-tickets.json — run the Desk Archived Tickets export first" },
      { status: 400 }
    );
  }

  if (tickets.length === 0) {
    return NextResponse.json({ error: "No tickets found in desk-archived-tickets.json" }, { status: 400 });
  }

  const result = await importDeskTickets(tickets);
  return NextResponse.json(result);
}
