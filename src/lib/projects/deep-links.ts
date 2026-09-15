// Task 369 — moved out of `dashboard/_dev/_types.ts` (task 360) so more than one feature area
// (Dev Dashboard, Desk Inbox, Desk Tickets) can share the same legacy/v2 routing decision instead
// of re-implementing it per page.

/**
 * A project carrying `external_project_id` is Zoho-imported and lives under the Legacy tab —
 * the same discriminator `_legacy-listing/_load-list-data.ts` filters on. Both URL segments are
 * *display* ids, not UUIDs (the documented CLAUDE.md exception for these two routes).
 * Returns null when either id is missing, so the caller renders an unlinked row rather than a
 * href that 404s.
 */
export function buildProjectHref(project: {
  projectDisplayId: string | null;
  isLegacy: boolean;
}): string | null {
  if (!project.projectDisplayId) return null;
  const tab = project.isLegacy ? "legacy" : "v2";
  return `/projects/${tab}/${project.projectDisplayId}`;
}

export function buildItemHref(
  projectHref: string | null,
  kind: "task" | "ticket",
  displayId: string | null
): string | null {
  if (!projectHref || !displayId) return null;
  return `${projectHref}/${kind === "task" ? "tasks" : "tickets"}/${displayId}`;
}
