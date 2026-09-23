// Backfill route for StackShift/Desk-poll tickets synced before task 389's fixes landed (task
// 390). Manually triggered, admin-only, bounded, re-runnable — mirrors
// src/app/api/admin/desk/backfill-inline-images/route.ts's shape.
//
// Why this exists: desk-ticket-poll (task 388) is a purely incremental cron — a ticket only
// gets reprocessed when its Desk modifiedTime advances past the stored cursor. A closed/dormant
// StackShift ticket never gets touched again, so it never benefits from task 389's fixes on its
// own. This route forces a reprocess of already-synced tickets (bypassing the cursor) with
// repairExistingContentType enabled, which the live cron never opts into.
//
// Query params:
//   ?dryRun=1        — report what would happen, write nothing
//   ?limit=N         — cap tickets processed this call (default 25)
//   ?offset=N        — skip the first N matching tickets (paginate a wider run across calls)
//   ?ticketNumber=N  — restrict to a single ticket (use this to verify before a wider run)
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { adminClient } from "@/lib/supabase/admin";
import { getZohoAccessToken } from "@/lib/zoho";
import { syncTicketMessages } from "@/lib/desk/stackshift-message-sync";

const DEFAULT_LIMIT = 25;

type TargetTicket = { id: string; external_id: string; ticket_number: number | null };

type TicketResult = {
  ticketId: string;
  ticketNumber: number | null;
  externalId: string;
  messagesInserted: number;
  contentTypeRepaired: number;
  attachmentsAdded: number;
};

type TicketError = { ticketId: string; externalId: string; error: string };

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: profile } = await adminClient.from("profiles").select("role").eq("id", user.id).maybeSingle();
  if (profile?.role !== "admin" && profile?.role !== "super_admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const token = await getZohoAccessToken();
  if (!token) return NextResponse.json({ error: "Zoho OAuth is not configured" }, { status: 500 });

  const url = new URL(req.url);
  const dryRun = url.searchParams.get("dryRun") === "1" || url.searchParams.get("dryRun") === "true";
  const limitParam = Number(url.searchParams.get("limit"));
  const limit = Number.isInteger(limitParam) && limitParam > 0 ? limitParam : DEFAULT_LIMIT;
  const offsetParam = Number(url.searchParams.get("offset"));
  const offset = Number.isInteger(offsetParam) && offsetParam > 0 ? offsetParam : 0;
  const ticketNumberParam = url.searchParams.get("ticketNumber");

  let targets: TargetTicket[];
  if (ticketNumberParam != null) {
    const n = Number(ticketNumberParam);
    if (!Number.isInteger(n)) return NextResponse.json({ error: "Invalid ticketNumber" }, { status: 400 });
    const { data: ticket } = await adminClient
      .from("inbox")
      .select("id, external_id, ticket_number, channel")
      .eq("ticket_number", n)
      .maybeSingle();
    if (!ticket) return NextResponse.json({ error: "Ticket not found" }, { status: 404 });
    if (ticket.channel !== "api" || !ticket.external_id) {
      return NextResponse.json(
        { error: `Ticket #${n} is channel "${ticket.channel}", not a StackShift/Desk-poll ticket — out of scope for this route` },
        { status: 400 }
      );
    }
    targets = [{ id: ticket.id, external_id: ticket.external_id, ticket_number: ticket.ticket_number }];
  } else {
    const { data, error } = await adminClient
      .from("inbox")
      .select("id, external_id, ticket_number")
      .eq("channel", "api")
      .not("external_id", "is", null)
      .order("id", { ascending: true })
      .range(offset, offset + limit - 1);
    if (error) return NextResponse.json({ error: `ticket query failed: ${error.message}` }, { status: 500 });
    targets = (data ?? []) as TargetTicket[];
  }

  if (dryRun) {
    return NextResponse.json({
      dryRun: true,
      ticketsMatched: targets.length,
      tickets: targets.map((t) => ({ ticketId: t.id, ticketNumber: t.ticket_number, externalId: t.external_id })),
    });
  }

  const results: TicketResult[] = [];
  const errors: TicketError[] = [];
  let currentToken = token;

  for (const ticket of targets) {
    try {
      const summary = await syncTicketMessages(currentToken, ticket.external_id, ticket.id, {
        repairExistingContentType: true,
      });
      currentToken = summary.token;
      results.push({
        ticketId: ticket.id,
        ticketNumber: ticket.ticket_number,
        externalId: ticket.external_id,
        messagesInserted: summary.messagesInserted,
        contentTypeRepaired: summary.contentTypeRepaired,
        attachmentsAdded: summary.attachmentsAdded,
      });
    } catch (e) {
      errors.push({
        ticketId: ticket.id,
        externalId: ticket.external_id,
        error: e instanceof Error ? e.message : String(e),
      });
      console.error(`[backfill-stackshift-messages] failed to process ticket ${ticket.id}`, e);
    }
  }

  return NextResponse.json({
    dryRun: false,
    ticketsProcessed: results.length,
    messagesInserted: results.reduce((sum, r) => sum + r.messagesInserted, 0),
    contentTypeRepaired: results.reduce((sum, r) => sum + r.contentTypeRepaired, 0),
    attachmentsAdded: results.reduce((sum, r) => sum + r.attachmentsAdded, 0),
    errors,
    results,
  });
}
