import { adminClient } from "@/lib/supabase/admin";
import type { Json } from "@/types/database";
import { statusData } from "./outbox-logic";

// Task 446 — enqueue a staff-initiated status change for StackShift. Staff replies are enqueued by the
// stackshift_enqueue_staff_reply trigger (migration 171), not here. Only channel='stackshift' tickets
// ever produce events; Mail/Desk tickets return false and behave exactly as before.
//
// Throws on a failed insert so the route returns 500 and staff retry — safe because the event carries
// state (from/to), not a delta.
export async function enqueueStatusChanged(
  ticketId: string,
  change: { from: string; to: string; resolvedAt: string | null },
): Promise<boolean> {
  const { data: ticket } = await adminClient.from("inbox").select("channel").eq("id", ticketId).maybeSingle();
  if (ticket?.channel !== "stackshift") return false;

  const { error } = await adminClient.from("stackshift_outbox").insert({
    ticket_id: ticketId,
    event_type: "ticket.status_changed",
    payload: { ticketStatus: change.to, data: statusData(change) } as Json,
  });
  if (error) throw new Error(`outbox enqueue failed: ${error.message}`);
  return true;
}
