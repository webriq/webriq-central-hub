// Shared ticket display-resolution helpers (task 303) — extracted from page.tsx so the new
// detail page (`[ticketId]/page.tsx`) reuses this logic instead of reimplementing it.

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

// The displayed ticket number. Since task 326 `ticket_number` holds Zoho's real ticketNumber
// for imported rows (and a serial above the imported max for Hub-native ones). Routing is by
// `ticket_id` (`TKT-<ticket_number>`), so the `#<n>` badge and the `TKT-<n>` URL agree.
export function resolveDisplayId(ticket: { ticket_number: number }): string {
  return `#${ticket.ticket_number}`;
}

export function isOverdue(status: string, dueAt: string | null): boolean {
  if (!dueAt || status === "closed") return false;
  return new Date(dueAt).getTime() < Date.now();
}

// --- Conversation author / avatar helpers (task 328) ---------------------------------------
// Shared by [ticketId]/page.tsx (server — name/avatar resolution against profiles +
// desk_agents) and [ticketId]/_conversation-thread.tsx (client — the initials monogram
// fallback). All pure, no imports.

// Deterministic avatar background palette — mirrors _v2-listing/_avatar-stack.tsx and
// _pm-shared.tsx's OwnerChip so the ticket feed's monograms match assignee chips elsewhere.
export const AVATAR_COLORS = ["#0063D6", "#6A48E0", "#0B8A93", "#B85512", "#177E48", "#44508A"];

// Fold to a comparable key: strip diacritics ("Niña" -> "nina"), lowercase, collapse spaces.
// Used to bridge a Zoho-recorded display name to profiles.full_name / desk_agents.full_name
// when no email is available (every NON_DESK_USER comment commenter — task 328 doc).
export function normalizeName(s: string): string {
  return s
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "") // strip combining diacritical marks
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

// Two-character monogram: first letter of the first two words, or the first two letters of a
// single-word name ("WebriQ" -> "WE", not "W"). Falls back to "?" for an empty name.
export function initialsFrom(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

// One of AVATAR_COLORS, keyed off the first character — stable per name.
export function colorForName(name: string): string {
  if (!name) return "#5F6A88";
  return AVATAR_COLORS[name.charCodeAt(0) % AVATAR_COLORS.length];
}
