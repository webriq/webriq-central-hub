import type { SharePerson, ShareRoleOption, ShareSelection } from "./types";

// Task 438 — the pure rules behind the Share Picker (no React, no I/O) so they can be checked with
// a plain script and reasoned about in one place.

const norm = (s: string) => s.trim().toLowerCase();

export function roleLabelOf(person: SharePerson, roles: ShareRoleOption[]): string {
  return person.roleLabel ?? roles.find((r) => r.value === person.role)?.label ?? person.role;
}

/** Role toggle chips: not already excluded, and matching the search text. */
export function filterRoles(roles: ShareRoleOption[], query: string, excludeRoles: string[] = []): ShareRoleOption[] {
  const q = norm(query);
  return roles.filter((r) => !excludeRoles.includes(r.value) && (!q || norm(r.label).includes(q)));
}

/**
 * People shown in the list. Hidden: deactivated (`inactive`) people, excluded ids, and — the headline rule — anyone whose role is
 * currently selected (the role chip already covers them). People who ARE individually selected stay
 * listed (with a check) so they can be toggled off. Search matches name or role label.
 */
export function filterPeople(
  people: SharePerson[], roles: ShareRoleOption[], selection: ShareSelection, query: string, excludeUserIds: string[] = [],
): SharePerson[] {
  const q = norm(query);
  return people.filter((p) => {
    if (p.inactive || excludeUserIds.includes(p.id)) return false;
    if (selection.roles.includes(p.role)) return false;
    return !q || norm(p.name).includes(q) || norm(roleLabelOf(p, roles)).includes(q);
  });
}

/** True when the list is empty only because selected roles swallowed everyone. */
export function allCoveredByRoles(
  people: SharePerson[], selection: ShareSelection, excludeUserIds: string[] = [],
): boolean {
  const candidates = people.filter((p) => !p.inactive && !excludeUserIds.includes(p.id));
  return candidates.length > 0 && candidates.every((p) => selection.roles.includes(p.role));
}

/** Selecting a role drops already-picked people it now covers; deselecting just removes the role. */
export function toggleRole(selection: ShareSelection, role: string, people: SharePerson[]): ShareSelection {
  if (selection.roles.includes(role)) return { ...selection, roles: selection.roles.filter((r) => r !== role) };
  const covered = new Set(people.filter((p) => p.role === role).map((p) => p.id));
  return { roles: [...selection.roles, role], userIds: selection.userIds.filter((id) => !covered.has(id)) };
}

export function toggleUser(selection: ShareSelection, userId: string): ShareSelection {
  const has = selection.userIds.includes(userId);
  return { ...selection, userIds: has ? selection.userIds.filter((id) => id !== userId) : [...selection.userIds, userId] };
}

export const selectionCount = (s: ShareSelection) => s.roles.length + s.userIds.length;
