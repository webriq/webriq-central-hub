// Shared ticket display-resolution helpers (task 303) — extracted from page.tsx so the new
// detail page (`[ticketNumber]/page.tsx`) reuses this logic instead of reimplementing it.

export type ContactRow = {
  external_id: string | null;
  full_name: string | null;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
};

export type DeskAgentRow = {
  external_id: string;
  full_name: string | null;
  email: string | null;
};

export function resolveContactName(
  ticket: { requester_email: string | null },
  contact: ContactRow | undefined
): string {
  if (contact?.full_name) return contact.full_name;
  const composed = [contact?.first_name, contact?.last_name].filter(Boolean).join(" ").trim();
  if (composed) return composed;
  if (contact?.email) return contact.email;
  if (ticket.requester_email) return ticket.requester_email;
  return "Guest";
}

export function resolveOwnerName(agent: DeskAgentRow | undefined): string {
  return agent?.full_name ?? agent?.email ?? "Unassigned";
}

// Always the native ticket_number (task 303) — matches the /desk/tickets/{ticket_number}
// route, so the badge and the URL never disagree. Zoho's original historical number (where
// imported) surfaces separately on the detail page, not here.
export function resolveDisplayId(ticket: { ticket_number: number }): string {
  return `#${ticket.ticket_number}`;
}

export function isOverdue(status: string, dueAt: string | null): boolean {
  if (!dueAt || status === "resolved" || status === "closed") return false;
  return new Date(dueAt).getTime() < Date.now();
}
