# Developer Dashboard — Redesign to `_final_design/dashboard/developer-dashboard.html`

> **Status:** COMPLETE
> **Priority:** HIGH
> **Type:** enhancement
> **Version Impact:** minor
> **Created:** 2026-09-11
> **Completed:** 2026-09-11
> **Platform:** Web
> **Automation:** manual
>
> **Marked complete at the user's explicit request.** Browser acceptance was not run in-session
> (no Playwright MCP / connected Claude-in-Chrome extension available) — see the outstanding
> checklist items below.

## Implementation Notes (for the tester)

**Verification run:** `npx tsc --noEmit` PASS · `pnpm lint` PASS (2 pre-existing unrelated
warnings in `onboarding-workspace/_checklist-tab.tsx`) · `pnpm build` PASS (compiled in 42s,
`/dashboard` correctly listed as `ƒ` dynamic) · 43/43 pure-logic scratch assertions PASS over
`_types.ts` (severity mapping, due buckets, days-late, href building, sort order incl. the
"critical overdue outranks critical due next week" case, sort immutability, tab predicates,
anchored relative time, stable project tint). **Browser acceptance NOT RUN** — the whole
Testing Checklist above still needs a real developer session.

## Post-Review Fixes (same day, before marking complete)

User feedback after an initial browser look surfaced four issues, all fixed and re-verified
(`tsc`/`lint`/`build` PASS; 11 new pure-logic assertions PASS):

1. **Stat tile miscommunication.** The "In progress" tile paired a big count (e.g. "54") with
   "Timer running now" — read as if all 54 items had a live timer, when only the one with the
   active timer did. Sub-text now shows a `{tasks} · {issues}` breakdown, matching the Due Today
   tile. The now-unused `TimerRunningLabel` leaf was removed from `_start-timer-button.tsx`.
2. **Panel rename + two new tabs + regrouped sort.** "My work" → **"My Tasks"** (the term the
   predecessor dashboard used for this exact concept — "Todos" isn't used anywhere else in the
   app). Added **Open** and **Closed** tabs. Sort changed from flat priority-first to
   **status-group → priority/severity → latest-updated-first**, reusing the exact workflow order
   `_pm-shared.tsx`'s `BOARD_COLUMNS`/`STATUS_ORDER` already establish (open → in_progress →
   ready_for_qa → testing_completed → for_client_approval → ready_to_merge → post_live_qa →
   closed) rather than inventing a new bucket scheme. Sorting moved from the loader to the client
   shell (`_dev-dashboard.tsx`, after `normalizeStatus()` runs) since the new primary key is
   status and the loader only has the raw, unnormalized value.
3. **Closed items now fetched at all.** Adding a Closed tab meant the loader had to stop
   excluding `status = closed` entirely. Bounded via `.or()` to "not closed, OR closed within the
   last 30 days" so a developer's full closing history can't crowd genuinely open work out of the
   `WORK_LIMIT`-row, `updated_at`-ordered fetch. The closed-detection (both the SQL filter and the
   "Heaviest workload" open-count guard) checks **both** raw spellings `normalizeStatus()` maps to
   `"closed"` (`"closed"` and `"Closed"`) — `tasks`/`issues` don't guarantee already-normalized
   casing for Zoho-imported rows. `DueLabel` gained a `closed` prop so a closed item shows its
   plain due date instead of a misleading red "overdue" pill.
4. **In-row ticking clock broke the layout.** `TaskTimerButton`'s elapsed-time text
   (`05:14:38`) inline in a "My Tasks" row was overflowing/wrapping the row. Replaced with a
   static `RunningBadge` ("Currently running", no ticking text) next to the title plus a
   compact icon-only stop button (`RunningRowStop`, a small leaf isolated from the rest of the
   list so only that one row re-renders on the timer's per-second tick) — the live clock now only
   ever appears on the Timer card and the header widget. The item with the active timer also now
   floats to the top of whichever tab it's visible in (All, In progress, or any tab it belongs to).

New pure helpers in `_types.ts`: `STATUS_ORDER` (workflow order table). `matchesTab()` gained
`"open"`/`"closed"` cases. `sortWorkItems()`'s comparator is now status → priority →
`updatedAt` desc → overdue-first → due-date asc.

**Four deviations from the plan, all decided during implementation:**

1. **`loading.tsx` → `_skeleton.tsx` + a Suspense boundary.** Step 8 specified
   `_dev/loading.tsx`, but `_dev/` is a private folder, not a route segment — Next would never
   pick that file up, and a `loading.tsx` at `dashboard/` would show a developer-shaped skeleton
   to PM/admin/marketing too. It is now a plain component used as the fallback of a Suspense
   boundary around the developer branch in `page.tsx`, which also lets the hub shell paint
   before the queries resolve.

2. **Status normalization + entity decoding moved to the client shell.** The plan had the loader
   calling `normalizeStatus()`/`decodeHtmlEntities()`, but both live in `_pm-shared.tsx`, which
   is `"use client"` — a server module calling them would hit a client-reference error, and
   every existing server loader in this codebase only *type*-imports from that file. Rather than
   duplicate its status map into a server-safe copy, `_dev-dashboard.tsx` applies both transforms
   once in a `useMemo`. `DevWorkItem.status`/`title` are documented as raw in the loader's output.

3. **Issue assignee matching is three parallel queries, not one `.or(...)`.** The `assignees`
   array-containment operator needs brace syntax that PostgREST's `or()` filter quotes
   unreliably; three queries in the same `Promise.all` cost no extra round trip and are
   de-duplicated by `id`. Same three-way semantics as `issueMatchesAssigneeFilter()`.

4. **`formatRelativeTime` replaced with an anchored variant.** `@/lib/utils`'s version reads
   `Date.now()` during render, which in an SSR'd client component can produce different text on
   the server and on hydration (e.g. "59m ago" → "1h ago"). `formatRelativeToAnchor()` in
   `_types.ts` measures against the loader's `generatedAt` instead, so both passes agree — and it
   honours the plan's own "never call `new Date()` at render time" rule.

**Two additions beyond the plan:**

- **`TimerRunningLabel` / `DevStartTimerButton` are separate leaf components.** The TimerContext
  value is rebuilt every second (it carries `elapsedSeconds`), so any consumer re-renders on that
  tick. Isolating both subscriptions into leaves keeps the per-second tick away from the stat
  strip, the work list and the side panels. `DevStatStrip` therefore takes `inProgressSub` as a
  node rather than a `timerRunning` boolean.
- **Project names are entity-decoded too**, not just item titles — they come from the same Zoho
  import, and `_milestone-bar.tsx` / `_list-view.tsx` already decode imported `name` fields.

**Timer card project link:** `ActiveTimerRow` carries no `external_project_id`, so the legacy-vs-v2
tab can't be derived from the timer row alone. `DevTimerCard` takes a `projectHrefs` map
(project uuid → base href) and resolves the link from it; a project missing from the map simply
renders no "Open task/issue" link rather than a guessed `/projects/v2/…` URL that could 404.

**Known approximation to check in the browser:** "Recently moved to In progress" is
`status === in_progress && updated_at >= now − 24h`. Any edit to an in-progress item (not just the
status change) refreshes that timestamp, so an item can appear there without having moved today.
The panel hint says "Updated in the last 24 hours" rather than claiming the transition.

## Overview

Rebuild the developer dashboard (`/dashboard` when `profiles.role = 'developer'`) to match the
`_final_design/dashboard/developer-dashboard.html` mockup, using the v2.0 design tokens from
`_final_design/guide/central-hub-design-system.md`.

The current `dev-dashboard.tsx` is a 3-KPI + 3-column kanban built on `classification_records` —
a table that has **no per-developer assignment column at all** (see its own `groupByKanban` TODO),
so today's "My Tasks" is really "every open classification record for any customer whose project I
can see". The redesign replaces that entirely with the developer's **actual assigned work**:
`tasks` and `issues` rows where they are an assignee, their live `active_timers` state, and their
own `time_logs` — every panel scoped to the signed-in user.

## Requirements

### Must Have
- [x] Full visual match to the mockup, expressed in v2.0 design tokens (not the mockup's own
      `--blue:#2563EB` / `--orange:#FB914E` v1-ish palette — see "Token reconciliation" below)
- [x] Every number, row, and list comes from Supabase, filtered to the signed-in developer.
      No dummy/placeholder data anywhere on the page.
- [x] Stat strip: Due today · In progress · Overdue · Logged today
- [x] "Recently moved to In progress" strip (last 24 h)
- [x] "My work" panel — tasks + issues combined, priority-sorted, with filter tabs
      (All / Due today / In progress / For review) and real counts
- [x] Active timer card wired to the existing `TimerContext` (not a local mock clock)
- [x] "Your digest" summary card, derived from the same loaded data
- [x] "Overdue — needs attention" card
- [x] "Recently worked on" project list
- [x] "Heaviest workload" ranked project list
- [x] Every panel has an explicit empty state; loading uses skeletons, not spinners
- [x] Every file stays inside `nextjs-file-length-best-practices.md` guidance
      (components 100–250 lines, helpers 50–150, hard ceiling 400)

### Nice to Have
- [x] "Log time" CTA deep-links straight into the Time Logs add modal (`?new=1`)
- [x] "View all N assigned" expands the work list in place (no dead link to the
      `/dashboard/tasks` stub)

## Current State

`/dashboard` resolves role server-side and fans out through `dashboard-view.tsx`.

**Current Files:**
| File | Purpose | Lines |
|------|---------|-------|
| `src/app/(hub)/dashboard/page.tsx` | Server component — resolves role, pre-computes developer project/customer ids | 50 |
| `src/app/(hub)/dashboard/_components/dashboard-view.tsx` | Role → dashboard fan-out | 43 |
| `src/app/(hub)/dashboard/_components/dev-dashboard.tsx` | **The file being replaced** — 3 KPIs + classification-record kanban + Team Pool | 318 |
| `src/app/(hub)/dashboard/_components/dashboard-shared.tsx` | `Chip`, `SkeletonRow`, `PHASE_TONE`, `ProgrammeTrack`, … | 328 |

**Shell already provides** (do NOT rebuild — the mockup's sidebar and topbar are the existing
chrome): `v2-hub-sidebar.tsx`, `v2-hub-header.tsx` (⌘K Ask bar, notification bell, the docked
timer chip), and `TimerProvider` wrapping the whole hub in `v2-hub-shell.tsx`. **Only the content
area (`<main>`) is in scope.**

## Data Model — what each panel actually reads

All reads go through `createClient()` from `@/lib/supabase/server` so RLS applies. The current
`getDeveloperAccessibleProjectIds()` call in `page.tsx` stays only if still needed for the
project panels; the work list is assignee-scoped directly and does not need it.

### "My work" = `tasks` + `issues` assigned to me

The mockup's "ticket" work-item type (`type-ico.bug`, the bug icon) is design vocabulary for what
this codebase calls an **issue** — not a reference to the separate `tickets` table, which is
customer support intake keyed by `requester_email` and carries no assignee at all. "Tasks and
tickets combined" in the mockup copy is **"tasks and issues combined"** here — same two work-item
kinds the mockup already draws (task icon / bug icon), just named per this codebase's vocabulary.
Update the sortbar copy accordingly.

```ts
// tasks — multi-assignee array
supabase.from("tasks")
  .select("id, project_id, title, status, priority, due_date, display_id, updated_at, assignees, created_by")
  .contains("assignees", [userId])
  .neq("status", "closed")

// issues — array (migration 132) OR legacy scalar assignee_id
supabase.from("issues")
  .select("id, project_id, title, status, severity, due_date, display_id, updated_at, assignees, assignee_id, assignee_name, created_by")
  .or(`assignees.cs.{${userId}},assignee_id.eq.${userId}`)
  .neq("status", "closed")
```

Legacy Zoho-imported issues may carry only the free-text `assignee_name`. Resolve those with a
second pass: when `profiles.full_name` is non-empty, run one extra query
`.ilike("assignee_name", fullName)` with the same `.neq("status","closed")`, then de-duplicate by
`id`. This mirrors `issueMatchesAssigneeFilter()` in `_shared/_assignee-filter.ts` — do not invent
a different resolution rule.

**Issue severity is not task priority.** `issues.severity` uses Zoho's own vocabulary
(`None|Minor|Major|Critical|Show stopper`, migration 051). Map it onto the four priority buckets
for sorting/dot colour only: `Show stopper|Critical → critical`, `Major → high`,
`Minor → normal`, `None|null → low`. Reuse `SEVERITY_STYLE` from `_pm-shared.tsx` for the label.

### Status vocabulary

Both tables share the 8-value task workflow (`_pm-shared.tsx`): `open`, `in_progress`,
`ready_for_qa`, `testing_completed`, `for_client_approval`, `ready_to_merge`, `post_live_qa`,
`closed`. Run every raw value through `normalizeStatus()` — Zoho-imported rows carry raw Zoho
names. Tab buckets:

| Tab | Predicate |
|---|---|
| All | everything loaded |
| Due today | `due_date === todayLocalISO` |
| In progress | `normalizeStatus(status) === "in_progress"` |
| For review | status in `ready_for_qa`, `for_client_approval`, `post_live_qa` |

### Stat strip

| Tile | Query |
|---|---|
| Due today | count of loaded rows with `due_date === today`; sub `"{n} tasks · {m} issues"` |
| In progress | count of `in_progress` rows; sub `"Timer running now"` when `timer.status === "running"`, else `"No timer running"` |
| Overdue | count of rows with `due_date < today`; sub `"Oldest: {n} days late"`, or `"Nothing overdue"` |
| Logged today | `sum(hours)` from `time_logs` where `employee_id = userId` and `date_logged = today`; sub `"across {n} items"` (distinct `task_id`/`issue_id`/general) |

`time_logs.employee_id` holds the **auth user id** — confirmed at
`src/app/api/v2/timer/stop/route.ts:42`. Do not join through `hr.employees`.

Render the value with `formatHoursAsHHMM()` from `@/lib/timer/format` in `font-mono`
(mockup's `.stat-value.mono`; design system §2 — machine values always look like data).

### Recently moved to In progress (last 24 h)

There is **no status-change history** — `audit_logs` exists but nothing in `src/` writes to it.
Approximate with `normalizeStatus(status) === "in_progress" && updated_at >= now - 24h`, taken
from the already-loaded rows, newest first, max 3 cards. Set the panel hint to
**"Updated in the last 24 hours"** so the panel does not over-claim a transition it cannot prove.
Record this limitation in the implementation notes.

### Active timer card

Read from `useTimer()` (`src/app/(hub)/_components/timer-context.tsx`). `ActiveTimerRow` already
carries `task_title`, `task_display_id`, `issue_title`, `issue_display_id`, `project_name`,
`project_display_id`, `status`, `break_type`. Clock = `formatHHMMSS(elapsedSeconds)`.

Controls — the mockup's **"Switch task" is dropped**; there is no task-picker on this page and
`TimerContext` has no switch operation. Ship the two operations the context actually supports:

- **Stop** (`stopTimer()`) — red, logs the time and clears the row
- **Pause** / **Resume** (`pauseTimer()` / `resumeTimer()`) — the white/ghost slot

When `timer.break_type` is set, show the break state (paused, on break) instead of Pause — mirror
`_task-timer-button.tsx`'s existing break handling rather than inventing a second treatment.
The task/issue title in the card links to its detail page.

`timer-today` footer = the same "Logged today" hours. The 3-segment `today-bar` = today's hours
split across the top 3 projects (`flex:{hours}` per segment); render nothing when today has no logs.

### Your digest

**Deterministic, not LLM-backed.** `digest_logs` / `generateDigest()` produce an org-wide `"dev"`
digest with no per-user targeting, and nothing currently renders it. Building a per-developer LLM
digest means a new cron, per-user invocations, and cost attribution — out of scope here.

Build the card from data the page already has, emitting only the lines that have data:

1. `"{title} is {n} days late — oldest overdue item on your queue."` (when overdue > 0)
2. `"{title} is your highest-priority item in progress."` (when an `in_progress` row exists)
3. `"{n} items moved to In progress in the last 24 hours."` (when > 0)
4. `"{hh}h {mm}m logged today, mostly on {top project name}."` (when today's hours > 0)

Zero lines → empty state: `"Nothing needs your attention — your queue is clear."`
Keep the amber surface and the sparkle mark from the mockup (this is the screen's single amber
AI surface). A follow-up for an LLM-written per-developer digest is noted at the bottom.

### Overdue — needs attention

Overdue rows sorted by days-late desc, max 5. Chip = `"{n}D"` in `font-mono`. Each row links to
the item. Empty → the card is not rendered at all (its whole reason to exist is the warning).

### Recently worked on

The mockup labels this "Recently accessed". **There is no page-visit log**, so rename the panel to
**"Recently worked on"** and derive real per-user activity:

- most recent `time_logs.created_at` per `project_id` where `employee_id = userId`, last 30 days
- most recent `updated_at` per `project_id` across the already-loaded assigned tasks/issues

Take `max()` of the two per project, sort desc, top 4. Join `projects` for `name`,
`external_project_id`, `project_id`, `customer_id`; join `customers` for `company_name` (the
`.proj-sub` line). Initials tile colour comes from the design system's fixed 6-colour avatar
rotation (§4 Avatars), indexed by a stable hash of `project.id` — not `Math.random()`.

### Heaviest workload

Group the loaded open tasks + issues by `project_id`, count, sort desc, top 5. Bar width is
`count / maxCount * 100%`. Rank number in `font-mono`.

### Deep links

```ts
// projects with external_project_id are Zoho-imported = the Legacy tab (see
// _legacy-listing/_load-list-data.ts:75, which filters on exactly this)
const base = project.external_project_id
  ? `/projects/legacy/${project.project_id}`
  : `/projects/v2/${project.project_id}`;

taskHref  = `${base}/tasks/${task.display_id}`;
issueHref = `${base}/issues/${issue.display_id}`;
```

Both segments are **display ids**, not UUIDs — the documented exception in CLAUDE.md, and exactly
what `_shared/_project-detail.tsx:559,661` already builds. A row with a null `project_id` or null
`display_id` renders unlinked rather than producing a broken href.

## Token reconciliation

The mockup's `:root` is a **v1-era palette** (`--blue:#2563EB`, `--gray-*` slate ramp). The design
system in `_final_design/guide/` is the source of truth. Translate on the way in:

| Mockup | Build with |
|---|---|
| `--blue:#2563EB` / `--blue-hover:#1D4ED8` | `#007BFF` / `#0063D6` |
| `--blue-50:#EFF6FF` / `--blue-100:#DBEAFE` | `#F0F7FF` / `#E5F1FF` |
| `--orange:#FB914E` | `#FB914E` (unchanged) · hover `#E2762F` |
| `--amber-*` AI surface | keep amber — the one AI surface per screen |
| `--red-600:#DC2626` / `--red-50:#FEF2F2` | `--late` `#C0392B` / `#FDE8E6` |
| `--green-600:#16A34A` / `--green-50` | `--ok` `#177E48` / `#E3F5EA` |
| `--amber-700:#B45309` warn text | `--warn` `#8A5A00` on `#FFF3D6` |
| `--gray-500/600/800/900` ink ramp | `--muted #5F6A88` / `--body #3A4565` / `--ink #0B1533` |
| `--gray-200` / `--gray-150` borders | `--line #E2E7F2` / `--line-soft #EDF0F7` |
| `--gray-50` page bg | `#F4F6FB` (matches today's dev dashboard) |
| `--shadow-card` | `0_1px_2px_rgba(7,17,51,0.05)` |
| `--radius-lg:14px` | `rounded-[14px]` (panels/tiles) — `rounded-[10px]` inner, `rounded-full` pills |

Additional rules that override the mockup where they conflict:
- **Buttons are pill radius (999px)**, not the mockup's `9px`. Design system §4.
- **Row hover is `--blue-50` (`#F0F7FF`)**, not the mockup's `--gray-25`.
- **One orange CTA per screen** — that is "Start timer" in the page head. "Log time" is a ghost
  button; the timer card's Stop is red (semantic `--late`), which is a state, not a CTA.
- **No left/right accent stripes.** The mockup's `.work-row.overdue` gradient-left-edge is
  replaced by the red overdue text + the `--late` due pill, which already carry the meaning.
- **Space Grotesk (`font-heading`) only** on page title, panel titles, stat numbers, and the
  project-initials tiles. Never on buttons, labels, pills, or row text.
- **JetBrains Mono (`font-mono`)** for the clock, logged-today value, day counts, `display_id`s,
  rank numbers, and the `35D` chip.
- Transitions `160ms cubic-bezier(.22,1,.36,1)` on colour/background/border only; honour
  `prefers-reduced-motion`.
- Styling is **Tailwind classes only**. `style={{}}` is permitted solely for the computed bar
  widths / flex ratios / avatar-tile background, which are not expressible as static utilities
  (same carve-out `ProgrammeTrack` and `StatTile` already take).
- Fixed-light, literal hex, `cn()` for conditionals — this page never uses `dark:` variants or
  the `isDark` prop pattern (that pattern belongs to pages that own a theme toggle).

## Proposed Solution

### Architecture

Server component loads everything in one pass; a thin client tree owns tabs, expansion, and the
live timer. That avoids the current file's client-side `useEffect` waterfall and keeps the initial
paint complete.

```
page.tsx (server)
  └─ role === "developer"
       └─ loadDevDashboard(userId)          ← one module, all queries, RLS-scoped
            └─ DevDashboard (client)        ← layout + tab state only
                 ├─ DevStatStrip
                 ├─ DevRecentlyMoved
                 ├─ DevWorkList             ← tabs, rows, expand
                 ├─ DevTimerCard            ← useTimer()
                 ├─ DevDigestCard
                 ├─ DevOverdueCard
                 └─ DevSidePanels           ← recently worked on + heaviest workload
```

### File Changes

| Action | File | Description | Est. lines |
|--------|------|-------------|-----------|
| CREATE | `src/app/(hub)/dashboard/_dev/_types.ts` | `DevWorkItem`, `DevProjectSummary`, `DevDashboardData`; `hrefFor()`, `severityToPriority()`, `dueBucket()` | ~110 |
| CREATE | `src/app/(hub)/dashboard/_dev/_load-dev-dashboard.ts` | All Supabase reads + shaping. Server-only. | ~200 |
| CREATE | `src/app/(hub)/dashboard/_dev/_ui.tsx` | `Panel`, `PanelFoot`, `EmptyState`, `PriorityDot`, `TypeIcon`, `DuePill`, `StatusPill` | ~150 |
| CREATE | `src/app/(hub)/dashboard/_dev/_dev-dashboard.tsx` | Client shell: page head, grid, tab state | ~150 |
| CREATE | `src/app/(hub)/dashboard/_dev/_stat-strip.tsx` | 4 stat cards | ~110 |
| CREATE | `src/app/(hub)/dashboard/_dev/_recently-moved.tsx` | 3-card strip | ~80 |
| CREATE | `src/app/(hub)/dashboard/_dev/_work-list.tsx` | Tabs, sortbar, rows, expand footer | ~200 |
| CREATE | `src/app/(hub)/dashboard/_dev/_timer-card.tsx` | Navy timer card on `useTimer()` | ~140 |
| CREATE | `src/app/(hub)/dashboard/_dev/_digest-card.tsx` | Derived digest lines | ~110 |
| CREATE | `src/app/(hub)/dashboard/_dev/_overdue-card.tsx` | Red warning card | ~70 |
| CREATE | `src/app/(hub)/dashboard/_dev/_side-panels.tsx` | Recently worked on + heaviest workload | ~140 |
| CREATE | `src/app/(hub)/dashboard/_dev/loading.tsx` | Skeleton mirroring the grid | ~60 |
| MODIFY | `src/app/(hub)/dashboard/page.tsx` | Call `loadDevDashboard()` for developers; pass `devData` through | +15 |
| MODIFY | `src/app/(hub)/dashboard/_components/dashboard-view.tsx` | New `DevDashboard` import + `devData` prop | ~10 |
| DELETE | `src/app/(hub)/dashboard/_components/dev-dashboard.tsx` | Fully replaced | −318 |
| MODIFY | `src/app/(hub)/dashboard/timelogs/_time-logs-content.tsx` | Open the add modal when `?new=1` | +6 |

`dashboard-shared.tsx`, `pm-dashboard.tsx`, `admin-dashboard.tsx`, `marketing-dashboard.tsx`,
`_pm-shared.tsx`, and everything under `projects/` are **not** modified.

## Implementation Steps

### Step 1 — Types and pure helpers (`_dev/_types.ts`)

```ts
export type DevWorkKind = "task" | "issue";
export type DevPriority = "critical" | "high" | "normal" | "low";

export type DevWorkItem = {
  id: string;
  kind: DevWorkKind;
  title: string;          // already run through decodeHtmlEntities()
  status: string;         // normalized
  priority: DevPriority;
  rawSeverity: string | null;   // issues only, for the label
  dueDate: string | null;       // yyyy-mm-dd
  displayId: string | null;
  updatedAt: string;
  projectId: string;
  projectName: string;
  projectDisplayId: string | null;
  isLegacyProject: boolean;
  customerId: string;
  href: string | null;
};

export type DevProjectSummary = {
  projectId: string;
  name: string;
  companyName: string | null;
  href: string | null;
  lastActivityAt: string | null;  // recently-worked-on
  openCount: number;              // heaviest-workload
};

export type DevDashboardData = {
  items: DevWorkItem[];
  hoursToday: number;
  hoursTodayItemCount: number;
  hoursTodayByProject: { name: string; hours: number }[];
  projects: DevProjectSummary[];
  generatedAt: string;
};
```

Pure helpers here (unit-testable, no DB, no React): `severityToPriority()`, `priorityRank()`,
`dueBucket(due, today) → "overdue" | "today" | "future" | "none"`, `daysLate()`,
`buildHref(project, kind, displayId)`, `sortWorkItems()`.

Sort order for `sortWorkItems()`: priority rank asc → overdue first → `due_date` asc (nulls last)
→ `updated_at` desc. Matches the mockup's "Sorted by priority, highest first".

Compute "today" once, from the **server's local date** at load time, and pass it down — never call
`new Date()` at component render time.

### Step 2 — Loader (`_dev/_load-dev-dashboard.ts`)

Single exported `loadDevDashboard(userId: string): Promise<DevDashboardData>`.

1. `profiles.full_name` (for the legacy `assignee_name` issue pass).
2. `Promise.all`: tasks query, issues array/scalar query, issues legacy-name query (skipped when
   `full_name` is empty), today's `time_logs`, last-30-days `time_logs` project activity.
3. De-duplicate issues by `id` across the two issue queries.
4. Collect the union of `project_id`s, fetch `projects` (`id, name, project_id,
   external_project_id, customer_id`) and the matching `customers` (`customer_id, company_name`).
5. Shape into `DevWorkItem[]` + `DevProjectSummary[]`, sort, return.

**Pagination:** every `.select()` that could exceed 1000 rows must page with `.range()` —
`PAGE = 1000`, loop until a short page returns (canonical example:
`zoho-import/timelogs/route.ts:104-119`). The assignee-scoped task/issue queries are naturally
small, but the 30-day `time_logs` query and the `projects`/`customers` lookup-map queries are
**not** bounded by assignment — page those. This has already caused two live-run bugs
(tasks 103 and 110); do not skip it because the current dataset is small.

Bound the work queries with `.limit(500)` and order by `updated_at desc` so a pathological
assignee count cannot blow up the payload.

### Step 3 — Wire `page.tsx` and `dashboard-view.tsx`

```tsx
// page.tsx
let devData: DevDashboardData | null = null;
if (role === "developer") {
  devData = await loadDevDashboard(userId);
}
return <DashboardView role={role} displayName={displayName} userId={userId} devData={devData} … />;
```

`devProjectsCount` / `devCustomerIds` are only consumed by the old `DevDashboard`; drop both
from `page.tsx` and `dashboard-view.tsx` once nothing references them (confirm with a grep before
removing — `getDeveloperAccessibleProjectIds` itself stays, it has other callers).

Add `export const dynamic = "force-dynamic";` to `page.tsx` — the page is per-user and
time-sensitive (due-today, logged-today), so it must not be statically cached.

### Step 4 — Shared UI primitives (`_dev/_ui.tsx`)

`Panel` (white, `border-[#E2E7F2]`, `rounded-[14px]`, `shadow-[0_1px_2px_rgba(7,17,51,0.05)]`,
head with `font-heading text-[15px]`, optional hint + `PanelFoot`), `EmptyState` (lucide icon +
one line + optional action — never blank space), `PriorityDot` (9px dot + 3px ring, colours from
`PRIORITY_STYLE`), `TypeIcon` (`ClipboardCheck` for task on `#E5F1FF`, `Bug` for issue on
`#FDE8E6`), `StatusPill` (reuses `STATUS_LABEL` + `STATUS_STYLE` from `_pm-shared.tsx` — do not
re-declare a fourth status colour table), `DuePill` (`--late` / `--warn` / `--muted` by bucket).

Icons are `lucide-react` only. Icon-only buttons get `aria-label`. Never `<div onClick>`.

### Step 5 — Panels

Build each panel component against `DevDashboardData`, pure-render, no fetching. Notes:

- `_stat-strip.tsx` — grid `repeat(4,1fr)`, collapsing to 2 at `lg` and 1 at `sm`.
- `_work-list.tsx` — tabs are real `<button role="tab">` with `aria-selected`; counts in
  `font-mono`. Rows show 12 by default with a `"View all {n} assigned"` footer that expands in
  place. Each row's actions: `TaskTimerButton` (imported from
  `@/app/(hub)/projects/_shared/_task-timer-button`, passing `{taskId}` or `{issueId}` +
  `projectId`) and a View link. **The mockup's third "Edit" row action is dropped** — editing
  lives on the detail page, and duplicating `getTaskEditPermission` gating here buys nothing.
- `_timer-card.tsx` — renders the empty variant ("No timer running" + a short line pointing at
  the work list) when `timer` is null; that is the common case and must not be a blank navy box.
- `_side-panels.tsx` — two `Panel`s; both have empty states.

### Step 6 — Page head

```
Good afternoon, {firstName}
{Friday, September 11} · {n} due today · {m} overdue
                                    [ Log time ]  [ ▶ Start timer ]
```

Greeting text from `useGreeting()` (already handles the SSR-hydration guard), but **the head is
always visible** here — it now carries the counts and the CTAs, so do not wire it to
`useGreeting`'s auto-dismiss. Use only its `text` / `dateLabel`.

- **Log time** → ghost button, `Link` to `/dashboard/timelogs?new=1`.
- **Start timer** → the single orange CTA. Starts the timer on the **first row of the sorted work
  list** (the highest-priority actionable item); its `title` names the target so the action is
  never a surprise. Hidden entirely when a timer is already running (the timer card owns
  stop/pause then) and disabled with a hint when the work list is empty.

### Step 7 — `?new=1` on Time Logs

In `_time-logs-content.tsx`, seed the existing modal state from the query param:

```tsx
const searchParams = useSearchParams();
const [modal, setModal] = useState<"add" | TimeLogEntry | null>(
  searchParams.get("new") === "1" ? "add" : null
);
```

Six lines, no behaviour change for anyone who does not pass the param.

### Step 8 — `loading.tsx`

Skeleton rows in place mirroring the stat strip + two-column grid (design system §5: skeletons,
never centred spinners).

## Testing Checklist

- [ ] Signed in as a developer with assigned tasks **and** issues: both appear, correctly typed
- [ ] A developer with zero assigned work sees every panel's empty state, no blank boxes, no crash
- [ ] Stat counts equal a hand-count of the rendered rows (due today, in progress, overdue)
- [ ] "Logged today" matches the Time Logs page total for the same developer and date
- [ ] Each tab filters to exactly the documented predicate; counts match the rows shown
- [ ] Priority sort: a critical overdue item outranks a critical item due next week
- [ ] Start a timer from a row → the timer card, the header chip, and the row all update
- [ ] Pause → Resume → Stop logs the time and bumps "Logged today" after refresh
- [ ] Break state renders as "on break", not as a live-running clock
- [ ] A legacy (Zoho-imported, `external_project_id` non-null) item links to `/projects/legacy/…`;
      a v2 item links to `/projects/v2/…`; both resolve to a real detail page
- [ ] A row with a null `display_id` renders unlinked rather than a 404 href
- [ ] An issue assigned only via legacy `assignee_name` still appears
- [ ] Titles with `&amp;` render as `&` (`decodeHtmlEntities`)
- [ ] Signed in as PM / admin / marketing: their dashboards are byte-identical to before
- [ ] Keyboard: every tab, row link, and button reachable; 2px `#007BFF` focus ring visible
- [ ] `prefers-reduced-motion: reduce` removes transitions
- [ ] 1180px and 860px breakpoints match the mockup's collapse behaviour; no horizontal body scroll
- [ ] `npx tsc --noEmit` and `pnpm lint` pass
- [ ] Every new file is within the length guidance; none exceeds 400 lines

## Dependencies

- New packages: **none**
- New APIs: **none** — all reads are direct Supabase queries in a server module
- Migrations: **none**
- Blocked by: nothing

## Notes for Implementation Agent

- **Do not run git commands.** The user manages version control.
- Reuse before rebuilding: `TaskTimerButton`, `useTimer`, `STATUS_LABEL` / `STATUS_STYLE` /
  `PRIORITY_STYLE` / `SEVERITY_STYLE` / `normalizeStatus` / `decodeHtmlEntities` /
  `formatDueDate` (`_pm-shared.tsx`), `formatHHMMSS` / `formatHoursAsHHMM` /
  `formatHoursInWords` (`@/lib/timer/format`), `useGreeting`, `cn()`.
- `dashboard-shared.tsx`'s `Chip` tones **must not** be used for task/issue status — its
  `onboard/migrate/publish/ai/optimize` tones are reserved for programme phase hues (design
  system §1; enforced by tasks 183/185, and the existing `dev-dashboard.tsx` has a comment saying
  exactly this). Use `STATUS_STYLE` from `_pm-shared.tsx`.
- Never import `@/lib/supabase/admin` from any of these files — this is an authenticated hub
  route and RLS is the point.
- No `window.location` at render time.
- `"use server"` is not used anywhere here; `_load-dev-dashboard.ts` is a plain server module
  imported by a server component.
- Verification is `npx tsc --noEmit` + `pnpm lint` + browser acceptance. There is no test runner.

### Deliberate deviations from the mockup — carry these forward

| Mockup | Shipped | Why |
|---|---|---|
| "Recently accessed" projects | "Recently worked on" | no page-visit log exists; time-log + task activity is real |
| "Recently moved to In Progress" | hint reads "Updated in the last 24 hours" | no status-change history (`audit_logs` unwritten) |
| Timer "Switch task" | Pause / Resume | `TimerContext` has no switch op; no picker on this page |
| Row "Edit" action | dropped | editing lives on the detail page |
| v1 blue/slate palette | v2.0 tokens | `_final_design/guide/` is the source of truth |
| 9px button radius, grey row hover | pill buttons, `#F0F7FF` row hover | design system §4/§5 |

### Follow-ups (not this task)

- LLM-written per-developer digest (`digest_logs.target_user` is already on the table, unused)
- A real `/dashboard/tasks` "My work" page, so the work list can link out instead of expanding
- A status-transition log, which would make "Recently moved to In progress" exact

## Related

- Mockup: `_final_design/dashboard/developer-dashboard.html`
- Design system: `_final_design/guide/central-hub-design-system.md` · `central-hub-style-guide.html`
- PM-side sibling mockup: `_final_design/dashboard/webriq-central-hub-dashboard.html`
- File-length guidance: `nextjs-file-length-best-practices.md`
