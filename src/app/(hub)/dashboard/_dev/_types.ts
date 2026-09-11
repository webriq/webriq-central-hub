// Task 360 — shapes + pure helpers for the developer dashboard. No DB, no React, no Supabase
// imports: everything here is a plain function over plain data so the loader and the panels can
// both use it, and so the ordering/bucketing rules are testable in isolation.
//
// The shapes below are deliberately *projections*, not raw table rows — they cross the RSC
// boundary, where every property is serialized into the HTML payload, so they carry only the
// fields the client panels actually render (vercel-react-best-practices `server-serialization`).

export type DevWorkKind = "task" | "issue";
export type DevPriority = "critical" | "high" | "normal" | "low";
type DevDueBucket = "overdue" | "today" | "future" | "none";

export type DevWorkItem = {
  id: string;
  kind: DevWorkKind;
  /**
   * Raw from the DB in the loader's output; run through `decodeHtmlEntities()` by the client
   * shell (Zoho-imported titles carry literal `&amp;`). See the note on `status`.
   */
  title: string;
  /**
   * Raw from the DB in the loader's output, normalized by the client shell before any panel
   * sees it. `normalizeStatus()`/`decodeHtmlEntities()` live in `_pm-shared.tsx`, which is
   * `"use client"` — a server module cannot call them (it would be a client reference), and
   * this codebase's server loaders only ever type-import from that file. Rather than duplicate
   * the status map here, `_dev-dashboard.tsx` does both transforms once in a `useMemo`.
   */
  status: string;
  priority: DevPriority;
  /** Issues only — Zoho's own severity vocabulary, kept for the row label. */
  rawSeverity: string | null;
  /** `yyyy-mm-dd` or null. */
  dueDate: string | null;
  displayId: string | null;
  updatedAt: string;
  projectId: string;
  projectName: string;
  /** Null when the project has no `display_id` yet — the row then renders unlinked. */
  href: string | null;
};

export type DevProjectSummary = {
  projectId: string;
  name: string;
  companyName: string | null;
  href: string | null;
  /** ISO timestamp of the developer's own most recent activity on this project. */
  lastActivityAt: string | null;
  /** Open tasks + issues assigned to this developer in this project. */
  openCount: number;
};

export type DevHoursByProject = { name: string; hours: number };

export type DevDashboardData = {
  items: DevWorkItem[];
  hoursToday: number;
  hoursTodayItemCount: number;
  hoursTodayByProject: DevHoursByProject[];
  projects: DevProjectSummary[];
  /** Server-local `yyyy-mm-dd` captured once at load, so every due-date comparison agrees. */
  today: string;
  /** ISO timestamp of the load, used as the 24h "recently moved" cutoff anchor. */
  generatedAt: string;
};

// ─── Priority ─────────────────────────────────────────────────────────────────

const PRIORITY_RANK: Record<DevPriority, number> = {
  critical: 0,
  high: 1,
  normal: 2,
  low: 3,
};

function priorityRank(p: DevPriority): number {
  return PRIORITY_RANK[p];
}

/** `tasks.priority` is already the four-value enum, just lowercase-normalized. */
export function normalizeTaskPriority(p: string | null | undefined): DevPriority {
  const k = (p ?? "").toLowerCase();
  return k === "critical" || k === "high" || k === "normal" || k === "low" ? k : "normal";
}

/**
 * `issues.severity` is Zoho's own vocabulary (migration 051) — NOT the task priority enum.
 * Mapped onto the four priority buckets for sorting and dot colour only; the row still shows
 * the real severity label via `SEVERITY_STYLE`.
 */
export function severityToPriority(severity: string | null | undefined): DevPriority {
  switch ((severity ?? "").toLowerCase()) {
    case "show stopper":
    case "critical":
      return "critical";
    case "major":
      return "high";
    case "minor":
      return "normal";
    default:
      return "low";
  }
}

// ─── Due dates ────────────────────────────────────────────────────────────────

/** Both arguments are `yyyy-mm-dd`, so a lexicographic compare is also a chronological one. */
export function dueBucket(due: string | null, today: string): DevDueBucket {
  if (!due) return "none";
  if (due < today) return "overdue";
  if (due === today) return "today";
  return "future";
}

/** Whole days between a past due date and today. Both `yyyy-mm-dd`. */
export function daysLate(due: string | null, today: string): number {
  if (!due || due >= today) return 0;
  const ms = Date.parse(`${today}T00:00:00`) - Date.parse(`${due}T00:00:00`);
  return Math.max(0, Math.round(ms / 86_400_000));
}

/**
 * Relative label measured against an explicit anchor instead of `Date.now()`.
 *
 * `formatRelativeTime()` in `@/lib/utils` reads the clock during render, which in an SSR'd
 * client component can produce one string on the server and a different one on hydration (e.g.
 * "59m ago" → "1h ago" across the minute boundary). Anchoring to the loader's `generatedAt`
 * makes both passes agree, and keeps this page's "never call `new Date()` at render time" rule.
 */
export function formatRelativeToAnchor(iso: string, anchorIso: string): string {
  const diff = Date.parse(anchorIso) - Date.parse(iso);
  if (!Number.isFinite(diff)) return "—";

  const minutes = Math.floor(diff / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;

  const days = Math.floor(hours / 24);
  if (days === 1) return "yesterday";
  if (days < 7) return `${days}d ago`;

  const weeks = Math.floor(days / 7);
  if (weeks < 5) return `${weeks}w ago`;
  return `${Math.floor(days / 30)}mo ago`;
}

/** `yyyy-mm-dd` in the server's local timezone — never `toISOString()`, which is UTC. */
export function localDateKey(d: Date): string {
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

// ─── Deep links ───────────────────────────────────────────────────────────────

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
  kind: DevWorkKind,
  displayId: string | null
): string | null {
  if (!projectHref || !displayId) return null;
  return `${projectHref}/${kind === "task" ? "tasks" : "issues"}/${displayId}`;
}

// ─── Sorting ──────────────────────────────────────────────────────────────────

/**
 * The canonical dev workflow order — same sequence `_pm-shared.tsx`'s `BOARD_COLUMNS`/
 * `_list-view.tsx`'s `STATUS_ORDER` already establish for this exact 8-value status enum, reused
 * here (not re-derived) so "All" groups the same way the project task board does: every Open
 * item, then every In progress item, then the review-ish middle statuses in workflow order, then
 * Closed last. `status` must already be normalized (see the note on `DevWorkItem.status`) — this
 * table has no raw-Zoho-name keys.
 */
const STATUS_ORDER: Record<string, number> = {
  open: 0,
  in_progress: 1,
  ready_for_qa: 2,
  testing_completed: 3,
  for_client_approval: 4,
  ready_to_merge: 5,
  post_live_qa: 6,
  closed: 7,
};

/**
 * Workflow stage first (Open → In progress → review-ish stages → Closed — see `STATUS_ORDER`),
 * then priority/severity within a stage, then most recently touched first (latest to oldest),
 * then — for the rare case two items tie on all of that — overdue ahead of on-time, then soonest
 * due date (undated last). Returns a new array — never sorts the caller's in place.
 *
 * Callers must pass already-normalized items (`status` run through `normalizeStatus()`) — that
 * happens once in `_dev-dashboard.tsx`'s `items` memo, which is also where this is called from
 * (not the server loader — see the note on `DevWorkItem.status` for why).
 */
export function sortWorkItems(items: DevWorkItem[], today: string): DevWorkItem[] {
  return items.toSorted((a, b) => {
    const byStatus = (STATUS_ORDER[a.status] ?? STATUS_ORDER.open) - (STATUS_ORDER[b.status] ?? STATUS_ORDER.open);
    if (byStatus !== 0) return byStatus;

    const byPriority = priorityRank(a.priority) - priorityRank(b.priority);
    if (byPriority !== 0) return byPriority;

    // Latest to oldest — `updatedAt` is an ISO timestamp, distinct almost always, so this is the
    // criterion that actually decides order within a status+priority tier in practice.
    if (a.updatedAt !== b.updatedAt) return a.updatedAt < b.updatedAt ? 1 : -1;

    const aOverdue = dueBucket(a.dueDate, today) === "overdue";
    const bOverdue = dueBucket(b.dueDate, today) === "overdue";
    if (aOverdue !== bOverdue) return aOverdue ? -1 : 1;

    if (!a.dueDate) return 1;
    if (!b.dueDate) return -1;
    return a.dueDate < b.dueDate ? -1 : 1;
  });
}

// ─── Tab filtering ────────────────────────────────────────────────────────────

export type DevWorkTab = "all" | "today" | "open" | "progress" | "review" | "closed";

const REVIEW_STATUSES = new Set(["ready_for_qa", "for_client_approval", "post_live_qa"]);

export function matchesTab(item: DevWorkItem, tab: DevWorkTab, today: string): boolean {
  switch (tab) {
    case "today":
      // A closed item due "today" isn't work still due — same guard the stat strip's due-today
      // count and the overdue bucket use.
      return item.dueDate === today && item.status !== "closed";
    case "open":
      return item.status === "open";
    case "progress":
      return item.status === "in_progress";
    case "review":
      return REVIEW_STATUSES.has(item.status);
    case "closed":
      return item.status === "closed";
    default:
      return true;
  }
}

// ─── Avatar tint ──────────────────────────────────────────────────────────────

/**
 * Design system §4 — a fixed 6-colour rotation, assigned per entity and stable across screens.
 * Indexed by a deterministic hash of the project id so the same project keeps its colour on
 * every render and every reload (never `Math.random()`).
 *
 * This palette is also declared in `_pm-shared.tsx` (`OwnerChip`/`AssigneeChip`, hashed by
 * person) and `_v2-listing/_avatar-stack.tsx` (its own copy, documented there as needed for
 * overlap/"+N" stacking that `OwnerChip` doesn't support). A third copy here is deliberate, not
 * accidental drift: `_pm-shared.tsx` is `"use client"` (this module isn't, and is imported by
 * the server loader too — see the file header), so importing its array would force a client
 * boundary onto every server-side consumer of this file. Hashing by project id here rather than
 * by name is intentional too — these tiles tint *projects*, not people.
 */
const AVATAR_COLORS = ["#0063D6", "#6A48E0", "#0B8A93", "#B85512", "#177E48", "#44508A"] as const;

export function projectTint(projectId: string): string {
  let hash = 0;
  for (let i = 0; i < projectId.length; i++) {
    hash = (hash * 31 + projectId.charCodeAt(i)) >>> 0;
  }
  return AVATAR_COLORS[hash % AVATAR_COLORS.length];
}

// ─── HTML-entity decoding ───────────────────────────────────────────────────

/**
 * Decodes every row's `.name` field with the given decoder, without mutating the input array.
 * `decodeHtmlEntities` itself lives in `_pm-shared.tsx` ("use client" — see the note on
 * `DevWorkItem.status`), so the caller passes it in rather than this module importing it.
 */
export function decodeNames<T extends { name: string }>(rows: T[], decode: (s: string) => string): T[] {
  return rows.map((row) => ({ ...row, name: decode(row.name) }));
}

export function projectInitials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "??";
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[1][0]).toUpperCase();
}
