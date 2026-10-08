// Task 441/443 — `inbox.source_meta.duplicateOf` marks a ticket that is the same conversation as
// another Hub ticket (Desk copy of a Mail ticket today; direct StackShift ↔ Desk copy later).
// `via` is optional: absent on task-441 data (heuristic requester + subject + time match),
// "desk_ticket_id" once an exact Desk ticket id correlated the pair.
export type DuplicateOf = { inboxId: string; ticketNumber: number; via: string | null };

// Accepts the raw JSON value from the DB; anything malformed — or a pointer back at the row
// itself — is treated as "not a duplicate" rather than rendering a broken link.
export function parseDuplicateOf(raw: unknown, ownInboxId: string): DuplicateOf | null {
  if (!raw || typeof raw !== "object") return null;
  const d = raw as { inboxId?: unknown; ticketNumber?: unknown; via?: unknown };
  if (typeof d.inboxId !== "string" || typeof d.ticketNumber !== "number" || d.inboxId === ownInboxId) return null;
  return { inboxId: d.inboxId, ticketNumber: d.ticketNumber, via: typeof d.via === "string" ? d.via : null };
}

export function duplicateQualifier(via: string | null): string {
  return via === "desk_ticket_id" ? "same StackShift ticket" : "same email conversation";
}
