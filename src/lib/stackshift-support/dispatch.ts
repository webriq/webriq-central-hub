import { adminClient } from "@/lib/supabase/admin";
import { sendCliqNotification } from "@/lib/zoho";
import { signRequest } from "./auth-logic";
import { mintDownloadUrls } from "./attachments";
import {
  LEASE_MS,
  SEND_TIMEOUT_MS,
  buildEnvelope,
  isEventType,
  outcomeAfterFailure,
  selectDeliverable,
  type OutboxRow,
} from "./outbox-logic";

// Task 446 — outbox dispatcher (contract §6). At-least-once, strictly ordered per ticket (see
// selectDeliverable), receiver dedupes by eventId. Cron-driven every minute; staff actions also trigger one
// immediate best-effort pass for their ticket.

export type DispatchSummary = {
  skipped?: "not_configured";
  sent: number;
  failed: number;
  dead: number;
  claimedElsewhere: number;
};

function eventsConfig(): { url: URL; secret: string } | null {
  const raw = process.env.STACKSHIFT_EVENTS_URL;
  const secret = process.env.STACKSHIFT_EVENTS_SECRET;
  if (!raw || !secret) return null;
  try {
    return { url: new URL(raw), secret };
  } catch {
    console.error("[stackshift-outbox] STACKSHIFT_EVENTS_URL is not a valid URL");
    return null;
  }
}

async function postEvent(cfg: { url: URL; secret: string }, envelope: unknown) {
  const body = JSON.stringify(envelope);
  const timestamp = Math.floor(Date.now() / 1000);
  const signature = signRequest({
    secret: cfg.secret,
    keyId: "current",
    timestamp,
    method: "POST",
    path: cfg.url.pathname + cfg.url.search,
    body,
  });
  try {
    const res = await fetch(cfg.url, {
      method: "POST",
      redirect: "manual", // a 3xx is a failed delivery, never silently followed
      headers: {
        "content-type": "application/json",
        "x-ss-key-id": "current",
        "x-ss-timestamp": String(timestamp),
        "x-ss-signature": signature,
      },
      body,
      signal: AbortSignal.timeout(SEND_TIMEOUT_MS),
    });
    return res.status >= 200 && res.status < 300
      ? { ok: true as const, status: res.status }
      : { ok: false as const, status: res.status, error: `receiver responded ${res.status}` };
  } catch (err) {
    const message = err instanceof Error ? (err.name === "TimeoutError" ? `timed out after ${SEND_TIMEOUT_MS} ms` : err.message) : String(err);
    return { ok: false as const, status: null, error: message };
  }
}

type PendingRow = OutboxRow & { event_type: string; payload: unknown; attempts: number; created_at: string };

async function loadPending(ticketId?: string): Promise<PendingRow[]> {
  const PAGE = 1000;
  const rows: PendingRow[] = [];
  for (let from = 0; ; from += PAGE) {
    let q = adminClient
      .from("stackshift_outbox")
      .select("id, ticket_id, sequence, status, next_attempt_at, event_type, payload, attempts, created_at")
      .eq("status", "pending")
      .order("sequence", { ascending: true })
      .range(from, from + PAGE - 1);
    if (ticketId) q = q.eq("ticket_id", ticketId);
    const { data, error } = await q;
    if (error) throw new Error(`outbox load failed: ${error.message}`);
    rows.push(...(data as PendingRow[]));
    if ((data?.length ?? 0) < PAGE) return rows;
  }
}

export async function dispatchDue(opts: { budgetMs: number; ticketId?: string }): Promise<DispatchSummary> {
  const summary: DispatchSummary = { sent: 0, failed: 0, dead: 0, claimedElsewhere: 0 };
  const cfg = eventsConfig();
  if (!cfg) return { ...summary, skipped: "not_configured" };

  const deadline = Date.now() + opts.budgetMs;
  // Rounds: after a head is delivered the ticket's next event becomes the head, so loop until a round
  // delivers nothing (or the time budget is spent).
  while (Date.now() < deadline) {
    const due = selectDeliverable(await loadPending(opts.ticketId), Date.now());
    if (due.length === 0) break;
    let progressed = false;

    for (const row of due) {
      if (Date.now() >= deadline) break;

      // Optimistic claim: only one runner wins the lease on this exact next_attempt_at value.
      const { data: claimed } = await adminClient
        .from("stackshift_outbox")
        .update({ next_attempt_at: new Date(Date.now() + LEASE_MS).toISOString() })
        .eq("id", row.id)
        .eq("status", "pending")
        .eq("next_attempt_at", row.next_attempt_at)
        .select("id")
        .maybeSingle();
      if (!claimed) {
        summary.claimedElsewhere++;
        continue;
      }

      const outcome = await deliver(cfg, row);
      progressed = true;
      if (outcome === "sent") summary.sent++;
      else if (outcome === "dead") summary.dead++;
      else summary.failed++;
    }
    if (!progressed) break;
  }
  return summary;
}

async function deliver(cfg: { url: URL; secret: string }, row: PendingRow): Promise<"sent" | "failed" | "dead"> {
  const now = new Date().toISOString();
  const { data: ticket } = await adminClient
    .from("inbox")
    .select("id, ticket_number, status, external_ref, stackshift_site")
    .eq("id", row.ticket_id)
    .maybeSingle();

  // Malformed rows cannot be delivered no matter how often we retry: park them as dead for an admin.
  if (!ticket || !ticket.external_ref || !ticket.stackshift_site || !isEventType(row.event_type)) {
    await markDead(row, "ticket or event type is not deliverable", null, row.attempts + 1);
    return "dead";
  }

  const payload = (row.payload ?? {}) as { ticketStatus?: string; data?: { messageId?: unknown } };
  // Task 447 — download URLs are minted fresh on every attempt (15 min TTL) and never stored in the outbox,
  // so a retry hours later still carries working links.
  const messageId = row.event_type === "ticket.reply" && typeof payload.data?.messageId === "string" ? payload.data.messageId : null;
  const attachments = messageId ? (await mintDownloadUrls([messageId])).get(messageId) : undefined;

  const envelope = buildEnvelope({
    eventId: row.id,
    type: row.event_type,
    sequence: row.sequence,
    occurredAt: row.created_at,
    ticket: {
      ticketRef: ticket.external_ref,
      hubTicketId: ticket.id,
      ticketNumber: ticket.ticket_number,
      status: payload.ticketStatus ?? ticket.status,
      site: ticket.stackshift_site,
    },
    data: payload.data,
    attachments,
  });

  const result = await postEvent(cfg, envelope);
  const attempts = row.attempts + 1;

  if (result.ok) {
    await adminClient
      .from("stackshift_outbox")
      .update({ status: "sent", attempts, sent_at: now, last_attempt_at: now, last_status_code: result.status, last_error: null })
      .eq("id", row.id);
    return "sent";
  }

  const next = outcomeAfterFailure(attempts, Date.now());
  const error = (result.error ?? "delivery failed").slice(0, 500);
  if (next.status === "dead") {
    await markDead(row, error, result.status, attempts);
    return "dead";
  }
  await adminClient
    .from("stackshift_outbox")
    .update({ attempts, next_attempt_at: next.nextAttemptAt, last_attempt_at: now, last_status_code: result.status, last_error: error })
    .eq("id", row.id);
  return "failed";
}

async function markDead(row: PendingRow, error: string, statusCode: number | null, attempts: number) {
  await adminClient
    .from("stackshift_outbox")
    .update({ status: "dead", attempts, last_attempt_at: new Date().toISOString(), last_status_code: statusCode, last_error: error })
    .eq("id", row.id);
  console.error(`[stackshift-outbox] event ${row.id} (${row.event_type}, seq ${row.sequence}) is dead: ${error}`);
  await sendCliqNotification(
    `StackShift outbox event is dead after ${attempts} attempts: ${row.event_type} (sequence ${row.sequence}, ticket ${row.ticket_id}). Last error: ${error}. Replay it from Desk → StackShift outbox.`,
    "dev",
  );
}

// One immediate, bounded pass for a ticket that just got a new event. Never throws — the staff action that
// triggered it already succeeded and the cron will pick the event up regardless.
export async function dispatchTicketSoon(ticketId: string): Promise<void> {
  try {
    await dispatchDue({ budgetMs: 8000, ticketId });
  } catch (err) {
    console.warn("[stackshift-outbox] immediate dispatch failed:", err);
  }
}
