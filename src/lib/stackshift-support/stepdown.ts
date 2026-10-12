import { adminClient } from "@/lib/supabase/admin";
import { escapeLike } from "./like";
import { normSite } from "./parity-logic";

// Task 450 — read-only status for the Desk step-down page: per signed-off site, how many Desk-only tickets are
// still in flight (they still need the Desk poll, design D5) and how many correlated pairs the duplicate
// cleanup has not retired yet. Pages with .range() (CLAUDE.md rule) and never writes.

const PAGE = 1000;
const CHUNK = 100;

export type SiteStepdownStatus = {
  site: string;
  inFlight: number;
  inFlightSample: { id: string; ticketNumber: number }[];
  unretiredPairs: number;
};

export async function siteStepdownStatus(siteInput: string): Promise<SiteStepdownStatus> {
  const site = normSite(siteInput);
  const desk: { id: string; ticket_number: number; external_id: string; status: string }[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await adminClient
      .from("inbox")
      .select("id, ticket_number, external_id, status")
      .eq("source_meta->>source", "stackshift-desk-poll")
      .ilike("source_meta->>stackShiftSite", escapeLike(site))
      .is("source_meta->retiredInto", null)
      .order("created_at", { ascending: true })
      .range(from, from + PAGE - 1);
    if (error) throw new Error(`desk rows failed: ${error.message}`);
    for (const r of data) if (r.external_id) desk.push({ ...r, external_id: r.external_id });
    if (data.length < PAGE) break;
  }

  const twinned = new Set<string>();
  for (let i = 0; i < desk.length; i += CHUNK) {
    const { data, error } = await adminClient
      .from("inbox")
      .select("desk_ticket_id")
      .eq("channel", "stackshift")
      .in(
        "desk_ticket_id",
        desk.slice(i, i + CHUNK).map((d) => d.external_id),
      );
    if (error) throw new Error(`direct twins failed: ${error.message}`);
    for (const r of data) if (r.desk_ticket_id) twinned.add(r.desk_ticket_id);
  }

  const inFlight = desk.filter((d) => d.status !== "closed" && !twinned.has(d.external_id));
  return {
    site,
    inFlight: inFlight.length,
    inFlightSample: inFlight.slice(0, 10).map((d) => ({ id: d.id, ticketNumber: d.ticket_number })),
    unretiredPairs: desk.filter((d) => twinned.has(d.external_id)).length,
  };
}
