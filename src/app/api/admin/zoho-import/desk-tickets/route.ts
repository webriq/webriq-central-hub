// dev-only import endpoint — reads _from_zoho/desk-tickets.json, upserts to the native
// tickets table (merged, not a separate archival table — task 296). The import body lives
// in the shared importDeskTickets() helper (task 325) so the desk-archived-tickets import
// can reuse it verbatim. Matches a customer via the ticket's Desk contact
// (contacts.customer_id, already vetted by task 117's import) with a fallback via
// ticket.accountId resolved through desk-accounts.json (task 302). Unmatched tickets import
// anyway with customer_id: null. Task 326: Zoho's ticketNumber IS written to
// tickets.ticket_number, ticket_id is set to TKT-<ticketNumber>, and the serial sequence is
// bumped past the max after the upsert — see importDeskTickets() / migration 124.
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
    tickets = readFromZoho<DeskTicketRaw>("desk-tickets.json");
  } catch {
    return NextResponse.json(
      { error: "Could not read _from_zoho/desk-tickets.json — run the Desk Tickets export first" },
      { status: 400 }
    );
  }

  if (tickets.length === 0) {
    return NextResponse.json({ error: "No tickets found in desk-tickets.json" }, { status: 400 });
  }

  const result = await importDeskTickets(tickets);
  return NextResponse.json(result);
}
