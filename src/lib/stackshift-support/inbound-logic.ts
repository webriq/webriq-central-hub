import { createHash } from "crypto";

// Task 445 — pure decision helpers for the inbound endpoints (no DB / env imports so the checks in
// _docs/task/445-support-inbound.check.ts run under plain tsx).

export type InboxPriority = "low" | "normal" | "high" | "critical";

// The contract says `urgent`; inbox.priority's enum says `critical`.
export function mapPriority(p: "low" | "normal" | "high" | "urgent"): InboxPriority {
  return p === "urgent" ? "critical" : p;
}

export function hashBody(rawBody: string): string {
  return createHash("sha256").update(rawBody).digest("hex");
}

export type IdempotencyDecision =
  | { kind: "new" }
  | { kind: "replay"; response: Record<string, unknown> }
  | { kind: "conflict" };

export function decideIdempotency(
  existing: { route: string; body_hash: string; response: Record<string, unknown> } | null,
  route: string,
  bodyHash: string,
): IdempotencyDecision {
  if (!existing) return { kind: "new" };
  // The same key reused on another route is a client bug, never a replay.
  if (existing.route !== route || existing.body_hash !== bodyHash) return { kind: "conflict" };
  return { kind: "replay", response: existing.response };
}

// A createdAt in the future is clamped to "now"; an absent/unparseable one is "now".
export function clampCreatedAt(createdAt: string | undefined, nowMs: number): string {
  const t = createdAt ? Date.parse(createdAt) : NaN;
  return new Date(Number.isFinite(t) && t <= nowMs ? t : nowMs).toISOString();
}

export type DuplicateRef = { inboxId: string; ticketNumber: number; via: string };

// Exact Desk-id correlation beats the task-441 heuristic; the heuristic is only kept when no exact match.
export function pickDuplicateOf(
  exact: { id: string; ticket_number: number } | null,
  heuristic: { inboxId: string; ticketNumber: number; via?: string | null } | null,
): DuplicateRef | null {
  if (exact) return { inboxId: exact.id, ticketNumber: exact.ticket_number, via: "desk_ticket_id" };
  if (heuristic) return { inboxId: heuristic.inboxId, ticketNumber: heuristic.ticketNumber, via: heuristic.via ?? "heuristic" };
  return null;
}

// A create whose ticketRef already exists is a RETRY of the same request — not a conflict — when it comes from the
// same site with the same subject (the idempotency row can be missing: the store failed after the write, or the
// table isn't migrated yet). Answering 409 there would tell StackShift "bug, don't retry" about a ticket that
// was created fine (task 445 review). Anything else sharing a ticketRef stays a genuine 409.
export function isSameCreateRetry(
  existing: { stackshift_site: string | null; subject: string },
  actorSite: string,
  subject: string,
): boolean {
  return existing.stackshift_site === actorSite && existing.subject === subject;
}

// Customers may only move open <-> closed; "resolved_at" follows the status.
export function statusPatch(
  status: "open" | "closed",
  nowIso: string,
): { status: "open" | "closed"; resolved_at: string | null } {
  return { status, resolved_at: status === "closed" ? nowIso : null };
}
