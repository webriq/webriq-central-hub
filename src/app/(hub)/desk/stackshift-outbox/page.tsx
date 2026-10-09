import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { adminClient } from "@/lib/supabase/admin";
import { V2_ROUTES } from "@/config/constants";
import OutboxIndex, { type OutboxEvent, type OutboxStatusFilter } from "./_outbox-index";

// Desk > StackShift outbox (task 446) — Hub → StackShift events with delivery state and a Replay action
// for dead ones. admin / super_admin only (matches the replay API route). The outbox table has staff-read
// RLS, but the ticket join and counts use adminClient after the explicit role gate below, like the other
// admin-only Desk surfaces.
export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Desk · StackShift outbox" };

const FILTERS: OutboxStatusFilter[] = ["all", "pending", "sent", "dead"];

export default async function StackShiftOutboxPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; page?: string; pageSize?: string }>;
}) {
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  if (!claims?.claims) redirect(V2_ROUTES.AUTH_LOGIN);

  const userId = claims.claims.sub as string;
  const { data: profile } = await supabase.from("profiles").select("role").eq("id", userId).maybeSingle();
  if (profile?.role !== "admin" && profile?.role !== "super_admin") redirect(V2_ROUTES.DASHBOARD);

  const params = await searchParams;
  const status = (FILTERS as string[]).includes(params.status ?? "") ? (params.status as OutboxStatusFilter) : "all";
  const page = Math.max(1, parseInt(params.page ?? "1", 10) || 1);
  const pageSize = [20, 50, 100].includes(Number(params.pageSize)) ? Number(params.pageSize) : 20;
  const from = (page - 1) * pageSize;

  let query = adminClient
    .from("stackshift_outbox")
    .select(
      "id, event_type, sequence, status, attempts, next_attempt_at, last_error, last_status_code, last_attempt_at, sent_at, created_at, payload, inbox(id, ticket_number, external_ref, stackshift_site)",
      { count: "exact" },
    )
    .order("sequence", { ascending: false })
    .range(from, from + pageSize - 1);
  if (status !== "all") query = query.eq("status", status);

  const { data, count, error } = await query;

  // Setup note instead of a raw PostgREST error while migrations 169/171 are unapplied.
  const setupNeeded = !!error && (error.code === "42P01" || error.code === "PGRST205" || error.code === "42703" || error.code === "PGRST200");
  if (error && !setupNeeded) console.error("[desk/stackshift-outbox] query failed:", error.message);

  const events: OutboxEvent[] = (data ?? []).map((row) => {
    const t = (Array.isArray(row.inbox) ? row.inbox[0] : row.inbox) as
      | { id: string; ticket_number: number; external_ref: string | null; stackshift_site: string | null }
      | null;
    return {
      id: row.id,
      eventType: row.event_type,
      sequence: row.sequence,
      status: row.status,
      attempts: row.attempts,
      nextAttemptAt: row.next_attempt_at,
      lastError: row.last_error,
      lastStatusCode: row.last_status_code,
      lastAttemptAt: row.last_attempt_at,
      sentAt: row.sent_at,
      createdAt: row.created_at,
      payloadJson: JSON.stringify(row.payload ?? {}, null, 2),
      ticketId: t?.id ?? null,
      ticketNumber: t?.ticket_number ?? null,
      ticketRef: t?.external_ref ?? null,
      site: t?.stackshift_site ?? null,
    };
  });

  return (
    <OutboxIndex
      events={events}
      status={status}
      pagination={{ page, pageSize, total: count ?? 0 }}
      setupNeeded={setupNeeded}
      deliveryConfigured={!!process.env.STACKSHIFT_EVENTS_URL && !!process.env.STACKSHIFT_EVENTS_SECRET}
    />
  );
}
