# 165: v2 Dashboard — Real Active-Feature Data, Ported Greeting, Marketing Dashboard, Space Grotesk/JetBrains Mono

**Created:** 2026-07-21
**Priority:** HIGH
**Type:** feature
**Recommended Tier:** deep
**Status:** Planned

---

## Overview

`/v2/dashboard` is live and already being used by real PM/Dev/Admin users, but several cards still render fabricated placeholder data (`STUB_ASSIGNEES`, `TEAM_CLOCKED_IN`, `LEAVE_PEOPLE`, fake `PLAN-041`-style IDs in `pm-dashboard.tsx`; `"—"` KPIs and a labeled "Stub data" chart in `dev-dashboard.tsx`) sitting right next to real Supabase-backed data in the same components — this is confusing for users who can't tell which numbers are real. This task:

1. Removes all fabricated/stub data from `pm-dashboard.tsx` and `dev-dashboard.tsx` and replaces the freed space with real cards for the app's actually-active features — **Customers, Projects, Tracker (Portfolio Tracker)** — scoped per role to match what each role's sidebar nav actually shows them (`v2-hub-sidebar.tsx`).
2. Ports the v1 dashboard's animated, time-of-day, session-scoped **Greeting** (`home-tab.tsx`) into all v2 dashboards, replacing each dashboard's current static header.
3. Adds a **Marketing** role dashboard — `profiles.role` includes `marketing` (confirmed in `src/types/database.ts:506`, not documented in this file's role list, which is stale), but `dashboard-view.tsx` has no branch for it today and silently falls back to `PMDashboard`, a PM/task-focused view that doesn't match Marketing's actual workflow (Portfolio Tracker phase management — see `role === "marketing"` checks throughout `src/app/v2/(hub)/portfolio-tracker/`).
4. Swaps the app's font family from Sora + Geist Mono to **Space Grotesk + JetBrains Mono**, and fixes a pre-existing, unrelated bug found while touching this: `globals.css:11` maps `--font-mono: var(--font-geist-mono)`, but no Google font in this codebase ever sets a CSS variable named `--font-geist-mono` (the current `Geist_Mono` import sets `--font-mono` directly) — so the `font-mono` Tailwind utility class currently silently falls back to the browser default monospace font everywhere it's used. Must not be propagated into the new font setup.
5. Applies a visual-polish pass to every touched file using the `frontend-design` and `impeccable` skills (per explicit user request), constrained by CLAUDE.md's "UI Polish Conventions" section — i.e. no `dark:` variants or CSS-var/`text-foreground` tokens in `src/app/v2`, no shadcn `Form`/`sonner`, hand-rolled pills not shadcn `Badge`/`Progress`, `cva` for real variants.

## Requirements

### A. Typography
- [ ] `src/app/layout.tsx`: replace `Sora` import/usage with `Space_Grotesk` (`variable: "--font-sans"`, weights `["300","400","500","600","700"]` — Space Grotesk has no 800 weight, unlike Sora), and replace `Geist_Mono` with `JetBrains_Mono` (`variable: "--font-mono"`, no explicit weight array, matching how `Geist_Mono` was set up).
- [ ] `src/app/globals.css:11`: fix `--font-mono: var(--font-geist-mono)` → `--font-mono: var(--font-mono)` (self-referential, matching the already-working `--font-sans` line directly above it) so the `font-mono` utility class actually resolves to the configured mono font once JetBrains Mono is wired.

### B. Greeting (ported from v1, shared across all v2 dashboards)
- [ ] New `src/hooks/use-greeting.ts` — extracts the *behavior* (time-bucketed random phrase pool, 3-minute `sessionStorage`-scoped auto-fade, click-to-dismiss, SSR-hydration-safe deferred phrase/date) from `src/components/hub/pm-tabs/home-tab.tsx:14-46,229-247` into a reusable `useGreeting(displayName: string | null)` hook. Exact same timing/logic (`TIME_GREETINGS` pool, `FADE_DELAY_MS = 3 * 60 * 1000`, `SESSION_KEY = "hub_greeting_ts"`) — this is a behavior-only extraction, not a rewrite.
- [ ] Each dashboard (PM, Dev, Admin via PM, Marketing) renders its own `AnimatePresence`/`motion.div` greeting block using the hook's returned `{ visible, text, dateLabel, dismiss }`, styled to match **that file's own existing color convention** (see Requirement C/D/F below — do not force a single shared themed component across files that currently use different theming systems).
- [ ] The ported greeting **replaces** each dashboard's current static header block (PM's `<h1>Today</h1>` + date line; Dev's `<h1>Developer Dashboard</h1>` + "Welcome back" line) rather than being added above/alongside it — avoids two redundant identity headers stacked on one page.

### C. PM Dashboard (`pm-dashboard.tsx`) — remove mock, add real feature cards
- [ ] Delete `STUB_ASSIGNEES`, `TEAM_CLOCKED_IN`, `LEAVE_DAYS`, `LEAVE_PEOPLE`, `planLabel()`, `LeaveCalendar`, `formatCurrentDate`/`subscribeNoop`/`getDateServerSnapshot` (superseded by the greeting hook).
- [ ] `TasksTable`: drop the "Who" column (avatar was `STUB_ASSIGNEES[idx % STUB_ASSIGNEES.length]` — rotates by row index, not tied to any real assignee; there is no `assigned_developer_id` column yet per `dev-dashboard.tsx:23-24`). Grid template goes from `"28px 1fr 110px 52px 90px 100px"` to `"28px 1fr 110px 90px 100px"`; column header array drops `"Who"`.
- [ ] `DecisionCard`: replace the fake `planLabel(idx)` (`PLAN-041`, `PLAN-042`...) with a real-derived label from `plan.id`, e.g. `` `PLAN-${plan.id.slice(0, 6).toUpperCase()}` `` — same derivation pattern `TasksTable` already uses for `task.customer_id.slice(-8).toUpperCase()`. Drop the now-unused `idx` param from the `.map()` callback.
- [ ] KPI row: replace the 4th tile ("Team clocked in", fully fake) with a real **Customers** KPI — total row count from `customers`, wrapped in `<Link href={V2_ROUTES.CUSTOMERS}>` (block-level, matching the `Link`-wrapping pattern already used elsewhere in this file).
- [ ] Right rail: replace `LeaveCalendar` with a new inline `WorkspaceCard` component (page-scoped, not shared — see Code Context) showing two real, role-relevant rows: **Projects** (count where `status = 'active'`) → `V2_ROUTES.PROJECTS`, and **Tracker** (count of onboarding projects with `status === "in_progress"`, sourced from `GET /api/onboarding/projects`, the same endpoint `_onboarding-list.tsx` already uses — do not re-derive the draft/scheduled/in_progress status logic inline, reuse the endpoint's own computed `status` field). Customers is already covered by the KPI tile above, so it is not repeated here.
- [ ] Add `displayName: string | null` to `PMDashboard`'s props (currently takes none) — needed for the greeting.

### D. Dev Dashboard (`dev-dashboard.tsx`) — remove mock, add real feature cards
- [ ] Remove the `"Due Today"` and `"Hours Billed"` KPI tiles (both hardcoded `"—"`, no backing data source at all, not even indirectly) — KPI grid goes from `grid-cols-5` (5 tiles) to `grid-cols-3` (Open / In Progress / For Review only, unchanged).
- [ ] Remove the `WeeklyHoursChart` `SectionCard` (explicitly labeled `"Stub data — HR timesheets integration pending"`) and its `next/dynamic` import.
- [ ] Replace it with an inline `WorkspaceCard` (Dev's own copy, themed via the existing `isDark`/CSS-var-token pattern already used by this file — not a copy-paste of PM's light-hardcoded version) showing **Tracker** (in-progress onboarding count, same `/api/onboarding/projects` source as PM) and **Projects** (total `projects` count) — no Customers row, matching this role's own sidebar nav which excludes Customers for developers (`v2-hub-sidebar.tsx:36`, gated by `!isDev`).
- [ ] Keep `"My Tasks"` kanban and `"Team Pool"` unchanged — both are already real data.

### E. Admin Dashboard (`admin-dashboard.tsx`)
- [ ] Add `displayName: string | null` to `Props` and forward it to `<PMDashboard displayName={displayName} />` (currently called with no props).
- [ ] No other required changes — Admin already renders its own real `SectionCard`s (LLM Spend, Event Bus Health) below the embedded `PMDashboard`; those already use real data and the `isDark`/CSS-var pattern correctly.

### F. Marketing Dashboard (new)
- [ ] New `src/app/v2/(hub)/dashboard/_components/marketing-dashboard.tsx`. Marketing's real active workflow is Portfolio Tracker phase management (`role === "marketing"` is checked throughout `src/app/v2/(hub)/portfolio-tracker/`, e.g. `_onboarding-list.tsx:186`, `[projectId]/_load-detail-data.ts:8`), not PM's classification/task queue — so this dashboard is Tracker-first, not a copy of `PMDashboard`.
- [ ] Fetch `GET /api/onboarding/projects` client-side (same call `_onboarding-list.tsx` makes — already role-filters to the marketing user's own project memberships server-side, see `route.ts`'s `isRoleGatedByMembership` check). Reuse the exported `OnboardingProjectListItem` type from `../../portfolio-tracker/_onboarding-list` rather than re-declaring it.
- [ ] Ported Greeting at top (themed via `isDark`/CSS-var tokens, same convention as Dev — Marketing has no pre-existing hardcoded-light convention to match).
- [ ] KPI row (4 tiles, all derived from the fetched list, no fabrication): **Total tracked**, **In progress** (`status === "in_progress"`), **Scheduled** (`status === "scheduled"`), **Draft** (`status === "draft"`).
- [ ] A `SectionCard` "Needs your attention" listing draft/scheduled projects (not yet started), each row linking to `` `${V2_ROUTES.PORTFOLIO_TRACKER}/${item.project_id}` `` — this is the documented, deliberate exception in CLAUDE.md where the `[projectId]` route segment holds `project_id` (human-readable), not the UUID.
- [ ] Right rail `WorkspaceCard` (Marketing's own copy): **Customers** total count → `V2_ROUTES.CUSTOMERS`, **Projects** total count → `V2_ROUTES.PROJECTS` (Tracker is already the page's main focus, not repeated here).

### G. Role routing
- [ ] `dashboard-view.tsx`: add a `role === "marketing"` branch (before the final `PMDashboard` fallback) that renders `<MarketingDashboard userId={userId} displayName={displayName} />`.

## Out of Scope / Must-Not-Change

- **No full dark-mode re-theme of PM's pre-existing cards.** `DecisionCard`, `TasksTable`, `DeskPulse`, `DailyDigestCard`, and the shared `KpiCard`/`SectionCard` in `dashboard-shared.tsx` are hardcoded light-theme (`bg-white`, `text-slate-*`) and ignore `usePMSettings()`/dark mode entirely — a real, pre-existing inconsistency (confirmed: this is *why* `AdminDashboard` currently shows a jarring white `PMDashboard` section inside its otherwise dark-mode-aware page). Fixing that fully is a separate, larger task. This task's new/touched PM elements (Greeting, `Customers` KPI, `WorkspaceCard`) match PM's **existing hardcoded light-slate convention** for visual consistency with their untouched neighbors, per CLAUDE.md's "match neighboring UI on the same page" rule — they do not introduce `--c-*` tokens into `pm-dashboard.tsx`.
- **No `hr.*` schema integration.** Team-clocked-in / leave-calendar are dropped outright, not replaced with real `hr.attendance_days`/`hr.leave_requests` data (explicit user decision — out of scope, candidate for a future task).
- **No new detail/task routes.** `TasksTable`'s "Task" cell keeps linking to `V2_ROUTES.DASHBOARD_TASKS` (unchanged from task 162) — this task does not add a task-detail page.
- **No changes to `/v2/projects`, `/v2/customers`, `/v2/portfolio-tracker` page implementations** — only new dashboard-side read queries against the same tables/endpoint they already expose.
- **No changes to `GET /api/onboarding/projects`** — consumed as-is (Marketing dashboard and PM's Tracker `WorkspaceCard` row both call it unmodified).
- **Do not touch `role-access.ts`/`require-role.ts` route permission tables** — this task only adds a dashboard *view* branch for `marketing`, not new route access rules.
- **`v2-hub-sidebar.tsx` nav items are unchanged** — they already correctly show Tracker/Projects/Customers/Desk/Orchestration/Wiki per role; this task makes the dashboard *content* match what the sidebar already promises, not the other way around.

## Proposed File Changes

| File | Action | Purpose |
|------|--------|---------|
| `src/app/layout.tsx` | Modify | Swap `Sora`/`Geist_Mono` → `Space_Grotesk`/`JetBrains_Mono` |
| `src/app/globals.css` | Modify | Fix broken `--font-mono: var(--font-geist-mono)` → `var(--font-mono)` |
| `src/hooks/use-greeting.ts` | Create | Shared greeting behavior hook (ported from v1 `home-tab.tsx`) |
| `src/app/v2/(hub)/dashboard/_components/pm-dashboard.tsx` | Modify | Remove mock data; add greeting, `Customers` KPI, `WorkspaceCard` (Projects/Tracker) |
| `src/app/v2/(hub)/dashboard/_components/dev-dashboard.tsx` | Modify | Remove mock KPIs + stub chart; add greeting, `WorkspaceCard` (Tracker/Projects) |
| `src/app/v2/(hub)/dashboard/_components/admin-dashboard.tsx` | Modify | Thread `displayName` prop into embedded `PMDashboard` |
| `src/app/v2/(hub)/dashboard/_components/marketing-dashboard.tsx` | Create | New Tracker-first dashboard for the `marketing` role |
| `src/app/v2/(hub)/dashboard/_components/dashboard-view.tsx` | Modify | Add `role === "marketing"` branch |

## Code Context

### File: `src/app/layout.tsx` (current)

```tsx
import { Sora, Geist_Mono } from "next/font/google";
...
const sora = Sora({ subsets: ["latin"], variable: "--font-sans", weight: ["300","400","500","600","700","800"] });
const geistMono = Geist_Mono({ subsets: ["latin"], variable: "--font-mono" });
...
<html lang="en" className={cn("h-full dark", sora.variable, geistMono.variable)}>
```

Target:

```tsx
import { Space_Grotesk, JetBrains_Mono } from "next/font/google";
...
const spaceGrotesk = Space_Grotesk({ subsets: ["latin"], variable: "--font-sans", weight: ["300","400","500","600","700"] });
const jetbrainsMono = JetBrains_Mono({ subsets: ["latin"], variable: "--font-mono" });
...
<html lang="en" className={cn("h-full dark", spaceGrotesk.variable, jetbrainsMono.variable)}>
```

### File: `src/app/globals.css` (current, line 7-12)

```css
@theme inline {
  --color-background: var(--background);
  --color-foreground: var(--foreground);
  --font-sans: var(--font-sans);
  --font-mono: var(--font-geist-mono);
  --font-heading: var(--font-sans);
```

Target line 11: `--font-mono: var(--font-mono);` (self-referential, mirrors the working `--font-sans` line above it).

### File: `src/hooks/use-greeting.ts` (new — ported from `src/components/hub/pm-tabs/home-tab.tsx:14-46,225-247`)

Source behavior being ported verbatim:

```tsx
const TIME_GREETINGS: Record<string, string[]> = {
  morning:   ["Good morning", "Morning!", "Rise and shine", "Hey, good morning"],
  noon:      ["Good noon", "Hey there", "Happy lunch hour"],
  afternoon: ["Good afternoon", "Afternoon!", "Hey, good afternoon"],
  evening:   ["Good evening", "Evening!", "Hey, good evening"],
  night:     ["Still at it?", "Burning the midnight oil", "Working late"],
};
function getTimeBucket(): string { /* hour buckets, see home-tab.tsx:24-31 */ }
function pickGreeting(bucket: string): string { /* random from pool, home-tab.tsx:33-36 */ }
const FADE_DELAY_MS = 3 * 60 * 1000;
const SESSION_KEY = "hub_greeting_ts";

// home-tab.tsx:229-244 — deferred setTimeout to avoid direct-setState-in-effect lint rule,
// sessionStorage-scoped 3-minute auto-fade that doesn't re-trigger within the same tab session
useEffect(() => {
  const phraseTimer = setTimeout(() => setGreetingPhrase(pickGreeting(getTimeBucket())), 0);
  const now = Date.now();
  const stored = sessionStorage.getItem(SESSION_KEY);
  const shownAt = stored ? parseInt(stored, 10) : now;
  if (!stored) sessionStorage.setItem(SESSION_KEY, String(now));
  const remaining = FADE_DELAY_MS - (now - shownAt);
  const fadeTimer = setTimeout(() => setGreetingVisible(false), remaining <= 0 ? 0 : remaining);
  return () => { clearTimeout(phraseTimer); clearTimeout(fadeTimer); };
}, []);
```

New hook shape:

```tsx
"use client";
import { useEffect, useState } from "react";

export function useGreeting(displayName: string | null) {
  const firstName = displayName?.split(" ")[0] ?? "there";
  const [visible, setVisible] = useState(true);
  const [phrase, setPhrase] = useState<string | null>(null);   // null on server + initial client render — avoids hydration mismatch
  const [dateLabel, setDateLabel] = useState<string | null>(null);

  useEffect(() => {
    const phraseTimer = setTimeout(() => {
      setPhrase(pickGreeting(getTimeBucket()));
      setDateLabel(formatCurrentDate()); // "Weekday, Month D · YYYY" — home-tab.tsx:38-43
    }, 0);
    const now = Date.now();
    const stored = sessionStorage.getItem(SESSION_KEY);
    const shownAt = stored ? parseInt(stored, 10) : now;
    if (!stored) sessionStorage.setItem(SESSION_KEY, String(now));
    const remaining = FADE_DELAY_MS - (now - shownAt);
    const fadeTimer = setTimeout(() => setVisible(false), remaining <= 0 ? 0 : remaining);
    return () => { clearTimeout(phraseTimer); clearTimeout(fadeTimer); };
  }, []);

  return {
    visible,
    text: phrase ? `${phrase}, ${firstName} ✦` : null,
    dateLabel,
    dismiss: () => setVisible(false),
  };
}
```

Each dashboard renders it like (PM's light-hardcoded variant shown; Dev/Marketing swap classes for `isDark`/`--c-*` tokens per their existing convention):

```tsx
const { visible, text, dateLabel, dismiss } = useGreeting(displayName);
...
<AnimatePresence>
  {visible && text && (
    <motion.div
      className="cursor-pointer select-none"
      initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }}
      transition={{ duration: 0.35 }}
      onClick={dismiss}
      title="Click to dismiss"
    >
      <h1 className="text-[22px] font-bold text-slate-900 tracking-[-0.02em]">{text}</h1>
      <p className="text-[13px] text-slate-400 mt-0.5">{dateLabel} · PM workspace</p>
    </motion.div>
  )}
</AnimatePresence>
```

`framer-motion` is already a project dependency (used by v1's `home-tab.tsx`); `AnimatePresence`/`motion` need importing fresh in each dashboard file that doesn't already import them.

### File: `src/app/v2/(hub)/dashboard/_components/pm-dashboard.tsx`

Delete (lines 39-51 in current file):

```tsx
const STUB_ASSIGNEES = ["KL", "TM", "RJ", "SK", "AM", "BG"];
const TEAM_CLOCKED_IN = { count: 9, total: 12, avatars: ["KL", "TM", "RJ", "SK"] };
const LEAVE_DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri"];
const LEAVE_PEOPLE = [
  { name: "Kate", days: [false, false, true, true, true] },
  { name: "Mike",  days: [false, false, false, true, false] },
];
```

Also delete `formatCurrentDate`/`subscribeNoop`/`getDateServerSnapshot`/`planLabel` helpers (lines 55-70) and the `LeaveCalendar` component (lines 332-375) — all superseded per Requirements C.

`DecisionCard` label change (was `planLabel(idx)` at line 111):

```tsx
plans.map((plan) => (   // idx param dropped
  ...
  <span className="text-[10px] font-mono text-slate-400">{`PLAN-${plan.id.slice(0, 6).toUpperCase()}`}</span>
```

`TasksTable` — drop the "Who" column entirely (grid template + header array + the `<div className="px-3 py-2.5"><Avatar .../></div>` cell using `STUB_ASSIGNEES`).

New `WorkspaceCard` (page-scoped, added to this file, not `dashboard-shared.tsx` — theming doesn't match Dev/Marketing's version):

```tsx
function WorkspaceCard({ activeProjects, trackerInProgress, loading }: { activeProjects: number; trackerInProgress: number; loading: boolean }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white shadow-[0_1px_3px_rgba(0,0,0,0.05)] overflow-hidden">
      <div className="px-5 py-3.5 border-b border-slate-100">
        <span className="text-[13px] font-semibold text-slate-900">Your workspace</span>
      </div>
      <div className="divide-y divide-slate-50">
        <Link href={V2_ROUTES.PROJECTS} className="flex items-center justify-between px-5 py-3 hover:bg-slate-50 transition-colors">
          <span className="text-[12px] text-slate-600">Active projects</span>
          <span className="text-[13px] font-semibold text-slate-900">{loading ? "—" : activeProjects}</span>
        </Link>
        <Link href={V2_ROUTES.PORTFOLIO_TRACKER} className="flex items-center justify-between px-5 py-3 hover:bg-slate-50 transition-colors">
          <span className="text-[12px] text-slate-600">Tracker · in progress</span>
          <span className="text-[13px] font-semibold text-slate-900">{loading ? "—" : trackerInProgress}</span>
        </Link>
      </div>
    </div>
  );
}
```

Main export data-fetch addition (extend the existing `Promise.all` at lines 386-398):

```tsx
Promise.all([
  supabase.from("classification_records").select(...).order(...),
  supabase.from("implementation_plans").select(...).eq(...).limit(5),
  supabase.from("digest_logs").select(...).eq(...).order(...).limit(1).maybeSingle(),
  supabase.from("customers").select("customer_id", { count: "exact", head: true }),
  supabase.from("projects").select("id", { count: "exact", head: true }).eq("status", "active"),
  fetch("/api/onboarding/projects").then(r => r.json()).catch(() => ({ projects: [] })),
]).then(([classResult, plansResult, digestResult, customersResult, projectsResult, trackerResult]) => {
  ...
  setCustomersCount(customersResult.count ?? 0);
  setActiveProjects(projectsResult.count ?? 0);
  setTrackerInProgress((trackerResult.projects ?? []).filter((p: { status: string }) => p.status === "in_progress").length);
});
```

Confirm the exact response shape of `GET /api/onboarding/projects` (array vs `{ projects: [...] }` wrapper) by reading `route.ts`'s final `NextResponse.json(...)` call before wiring this — the snippet above is illustrative, not verbatim.

### File: `src/app/v2/(hub)/dashboard/_components/dev-dashboard.tsx`

Current KPI array (line 70-76) and stub chart section (lines 154-158) to remove:

```tsx
const kpis = [
  { label: "Open",       value: todo.length,       accentClass: "" },
  { label: "In Progress", value: inProgress.length, accentClass: "text-(--c-blue)" },
  { label: "For Review",  value: forReview.length,  accentClass: "text-(--c-amber)" },
  { label: "Due Today",   value: "—",               accentClass: "" },
  { label: "Hours Billed", value: "—",              accentClass: "text-(--c-green)" },
];
...
<SectionCard title="Weekly Hours">
  <WeeklyHoursChart isDark={isDark} />
  <p className="text-[10px] text-(--c-muted) mt-2 text-center">Stub data — HR timesheets integration pending</p>
</SectionCard>
```

Target: `kpis` array keeps only the first 3 entries (Open/In Progress/For Review), `grid-cols-5` → `grid-cols-3`. The `WeeklyHoursChart` `SectionCard` (and its `next/dynamic` import at the top of the file) is replaced with a `WorkspaceCard` using this file's existing `isDark` boolean + `--c-*` token pattern (see `dev-dashboard.tsx:129` `bg-(--c-card) border-(--c-border)` for the exact token names already in use in this file).

### File: `src/app/v2/(hub)/dashboard/_components/admin-dashboard.tsx`

```tsx
// current
interface Props { userId: string; }
export default function AdminDashboard(_props: Props) {
  ...
  <PMDashboard />

// target
interface Props { userId: string; displayName: string | null; }
export default function AdminDashboard({ displayName }: Props) {
  ...
  <PMDashboard displayName={displayName} />
```

### File: `src/app/v2/(hub)/dashboard/_components/dashboard-view.tsx` (current, full file already short)

```tsx
export default function DashboardView({ role, displayName, userId }: DashboardViewProps) {
  if (role === "developer") {
    return <DevDashboard userId={userId} displayName={displayName} />;
  }
  if (role === "admin" || role === "super_admin") {
    return <AdminDashboard userId={userId} />;   // → needs displayName too, see Requirement E
  }
  return <PMDashboard />;                        // → needs displayName too, see Requirement C
}
```

Target: add before the final fallback —

```tsx
  if (role === "marketing") {
    return <MarketingDashboard userId={userId} displayName={displayName} />;
  }
  return <PMDashboard displayName={displayName} />;
```

And update the `AdminDashboard` call to `<AdminDashboard userId={userId} displayName={displayName} />`.

### File: `src/app/v2/(hub)/portfolio-tracker/_onboarding-list.tsx` (reference only — do not modify)

```tsx
export type OnboardingProjectListItem = {
  id: string;
  project_id: string | null;
  project_name: string;
  company_name: string;
  customer_id: string;
  classification: string | null;
  current_phase_number: number | null;
  current_phase_name: string | null;
  current_day: number | null;
  progress_pct: number;
  programme_started_at: string | null;
  scheduled_onboarding_start_at: string | null;
  target_handover_date: string | null;
  status: "draft" | "scheduled" | "in_progress";
  members: { id: string; full_name: string | null }[];
};
...
fetch("/api/onboarding/projects")
```

Import this type directly in `marketing-dashboard.tsx` (`import type { OnboardingProjectListItem } from "../../portfolio-tracker/_onboarding-list";`) rather than re-declaring it.

### File: `src/app/api/onboarding/projects/route.ts` (reference only — do not modify)

```ts
status: p.programme_started_at ? "in_progress" : p.scheduled_onboarding_start_at ? "scheduled" : "draft",
```

This is the single source of truth for onboarding status — both the PM `WorkspaceCard`'s "Tracker · in progress" count and the whole Marketing dashboard must consume this field from the API response, never re-derive it from raw `programme_started_at`/`scheduled_onboarding_start_at` columns client-side.

### `projects.status` / `customers.status` enums (confirmed via `_projects-index.tsx:46` / `_customers-index.tsx:34`)

```ts
// projects.status
["all", "active", "on_hold", "completed", "archived"]
// customers.status
["all", "active", "onboarding", "completed_onboarding", "inactive"]
```

Use `.eq("status", "active")` for the PM/Dev "Active projects" count; use an unfiltered total count for the "Customers" KPI (matches the simple total-count framing of the tile, not a status-filtered subset).

## Implementation Steps

1. Font swap: update `layout.tsx` (Space Grotesk + JetBrains Mono) and fix the `--font-mono` mapping in `globals.css`. Verify visually that monospace text (ticket IDs, customer IDs throughout the dashboards) actually renders in JetBrains Mono, not a browser fallback — this confirms the bug fix took effect.
2. Create `src/hooks/use-greeting.ts` per Code Context above.
3. Rewrite `pm-dashboard.tsx`: delete stub consts/helpers, fix `TasksTable`'s dropped "Who" column, fix `DecisionCard`'s real-derived label, add the greeting block, add the `Customers` KPI tile, add the `WorkspaceCard` component + its data fetch, add `displayName` prop.
4. Rewrite `dev-dashboard.tsx`: drop the 2 fake KPIs + `WeeklyHoursChart` section, add the greeting block, add `WorkspaceCard` (Tracker/Projects) with its own `isDark`-aware styling and data fetch.
5. Update `admin-dashboard.tsx` to thread `displayName`.
6. Create `marketing-dashboard.tsx` per Requirement F.
7. Update `dashboard-view.tsx`: add the `marketing` branch, pass `displayName` into `AdminDashboard`/`PMDashboard`.
8. Invoke the `frontend-design` and `impeccable` skills against the full set of touched dashboard files for the visual-polish pass (hover states, loading states, spacing, motion, hierarchy) — constrained by CLAUDE.md's UI Polish Conventions (no `dark:`, no CSS-var tokens inside `pm-dashboard.tsx` specifically per the Out-of-Scope boundary above, hand-rolled pills, `cva` only for real variants).
9. Run `npx tsc --noEmit` and `pnpm lint`.
10. `pnpm dev`, sign in as each role (or verify via the DB `profiles.role` value) and check: PM, Dev, Admin, and Marketing dashboards each render real data with no `"—"`/fake numbers anywhere except genuine loading skeletons; greeting appears once per session per dashboard and fades/dismisses correctly; font is visibly Space Grotesk/JetBrains Mono; dark mode toggle (`usePMSettings`) doesn't break Dev/Marketing/Admin's `WorkspaceCard`/greeting rendering.

## Acceptance Criteria

- [ ] No fabricated data (`STUB_ASSIGNEES`, `TEAM_CLOCKED_IN`, `LEAVE_PEOPLE`, fake `PLAN-0xx` IDs, hardcoded `"—"` KPIs, "Stub data" chart) remains anywhere in `pm-dashboard.tsx` or `dev-dashboard.tsx`.
- [ ] PM dashboard shows a real `Customers` KPI and a `WorkspaceCard` with real `Projects`/`Tracker` counts, both linking to their respective `V2_ROUTES`.
- [ ] Dev dashboard's KPI row has 3 (not 5) tiles, all real; its right rail shows a real `WorkspaceCard` (Tracker/Projects), no Customers row.
- [ ] A time-of-day, session-scoped, dismissible greeting (matching v1's exact `TIME_GREETINGS`/fade/dismiss behavior) renders at the top of PM, Dev, Admin, and Marketing dashboards, replacing each dashboard's prior static header.
- [ ] Signing in as a `marketing`-role user lands on a dedicated dashboard (not the PM fallback) showing real onboarding-project KPIs and a "Needs your attention" list linking to correct `project_id`-based Tracker detail routes.
- [ ] `dashboard-view.tsx` routes `marketing` → `MarketingDashboard`; `admin`/`super_admin` still → `AdminDashboard`; `developer` → `DevDashboard`; everything else (pm/hr/client) → `PMDashboard`.
- [ ] The app renders in Space Grotesk (body/sans) and JetBrains Mono (`font-mono` elements) — verified in-browser, not just import-level.
- [ ] `--font-mono` in `globals.css` no longer references the dead `--font-geist-mono` variable.
- [ ] Every touched interactive element has a visible hover state and (where async) a loading state, per CLAUDE.md's UI Polish Conventions.
- [ ] `npx tsc --noEmit` and `pnpm lint` both pass with no new errors.

## Verification

```bash
npx tsc --noEmit
pnpm lint
# Manual: pnpm dev
#   - Visit /v2/dashboard as pm, developer, admin/super_admin, and marketing roles
#     (swap profiles.role in Supabase or use existing test accounts per role)
#   - Confirm greeting shows once, fades after ~3 min (or force via sessionStorage.removeItem("hub_greeting_ts") + reload), dismiss-on-click works
#   - Confirm every KPI/card number matches what's actually in the customers/projects/
#     classification_records tables and the /api/onboarding/projects response for that account
#   - Toggle dark mode (PM settings) — Dev/Admin/Marketing WorkspaceCard + greeting must remain legible in both themes
#   - Inspect a monospace element (e.g. a customer ID chip) in DevTools — computed font-family
#     should resolve to JetBrains Mono, not a fallback
```

## Compatibility Touchpoints

- Font swap is a global, cross-cutting visual change (`layout.tsx` is the single point where fonts are wired, per CLAUDE.md) — affects every page in the app, not just `/v2/dashboard`. Expected and intended per the user's explicit "set as official font" request.
- No schema, API contract, or route changes beyond the new dashboard-side read queries (all against existing tables/endpoints).

## Deferred / Follow-up (explicitly out of scope here, noted for a future task)

- Full dark-mode re-theme of `pm-dashboard.tsx`'s pre-existing cards (`DecisionCard`, `TasksTable`, `DeskPulse`, `DailyDigestCard`) and the shared `KpiCard`/`SectionCard` primitives in `dashboard-shared.tsx`.
- Real `hr.*` schema-backed team-clocked-in / leave-calendar cards.
- Real dev timesheet/hours-billed data source to replace the removed `WeeklyHoursChart`.

## Implementation Notes

### What Changed
- Fonts swapped app-wide: `Sora`/`Geist_Mono` → `Space_Grotesk`/`JetBrains_Mono` in `layout.tsx`; fixed the pre-existing dead `--font-mono: var(--font-geist-mono)` mapping in `globals.css` (now self-referential `var(--font-mono)`, matching the working `--font-sans` line).
- New `src/hooks/use-greeting.ts` — behavior-only extraction of v1's time-bucketed, session-scoped, dismissible greeting (`TIME_GREETINGS`, `FADE_DELAY_MS`, `SESSION_KEY` all identical). Returns `{ visible, text, dateLabel, dismiss }`; each dashboard renders its own themed `AnimatePresence`/`motion.div` markup around it.
- `pm-dashboard.tsx`: removed `STUB_ASSIGNEES`, `TEAM_CLOCKED_IN`, `LEAVE_DAYS`, `LEAVE_PEOPLE`, `planLabel()`, `LeaveCalendar`, and the old `formatCurrentDate`/`subscribeNoop`/`getDateServerSnapshot` date helpers. `TasksTable` lost the fake "Who" avatar column (grid template `28px 1fr 110px 52px 90px 100px` → `28px 1fr 110px 90px 100px`). `DecisionCard`'s fake `PLAN-041`-style ID replaced with a real-derived `PLAN-{plan.id.slice(0,6).toUpperCase()}`. Added the ported greeting, a real `Customers` KPI (4th tile, replacing "Team clocked in"), and a new `WorkspaceCard` (Projects active count + Tracker in-progress count, both real, both `Link`-wrapped) replacing `LeaveCalendar` in the right rail. `PMDashboard` now accepts an optional `displayName` prop.
- `dev-dashboard.tsx`: removed the "Due Today"/"Hours Billed" fake KPIs (grid `grid-cols-5` → `grid-cols-3`) and the `WeeklyHoursChart` stub section + its `next/dynamic` import. Added the ported greeting (isDark/`--c-*`-token themed) and a `WorkspaceCard` (Tracker in-progress + total Projects, no Customers row — matches this role's own sidebar nav gating).
- `admin-dashboard.tsx`: `Props` now includes `displayName`, forwarded into the embedded `<PMDashboard displayName={displayName} />` (previously called with no props, so PM's greeting had no name to render even structurally).
- New `marketing-dashboard.tsx`: Tracker-first dashboard for the `marketing` role (previously silently fell back to `PMDashboard`). Fetches `GET /api/onboarding/projects` (reusing its role-filtered membership logic and computed `status` field, per the doc's explicit "never re-derive status client-side" instruction) and the exported `OnboardingProjectListItem` type from `_onboarding-list.tsx`. KPI row (Total tracked / In progress / Scheduled / Draft), a "Needs your attention" list linking to `` `${V2_ROUTES.PORTFOLIO_TRACKER}/${item.project_id}` ``, and a `WorkspaceCard` (Customers + Projects totals).
- `dashboard-view.tsx`: added the `role === "marketing"` branch (before the `PMDashboard` fallback); `AdminDashboard`/`PMDashboard` calls now both receive `displayName`.
- Frontend-design polish pass (invoked per the task's explicit requirement): added a subtle `ChevronRight` affordance with a `group-hover:translate-x-0.5` micro-shift to every new `WorkspaceCard` row and the Marketing "Needs your attention" rows — the one thing those rows were missing (they're click-to-navigate `Link`s with no directional cue beyond a background tint). Left everything else as-is; the pre-existing cards they sit next to (`DecisionCard`, `TasksTable`, `DeskPulse`, `DailyDigestCard`, kanban, Team Pool) were correctly out of scope and untouched.

### Files Changed
- `src/app/layout.tsx` - font swap (Space Grotesk + JetBrains Mono)
- `src/app/globals.css` - fixed dead `--font-mono` variable mapping
- `src/hooks/use-greeting.ts` (new) - shared greeting behavior hook
- `src/app/v2/(hub)/dashboard/_components/pm-dashboard.tsx` - removed mock data, added greeting/Customers KPI/WorkspaceCard, added `displayName` prop
- `src/app/v2/(hub)/dashboard/_components/dev-dashboard.tsx` - removed mock KPIs + stub chart, added greeting/WorkspaceCard
- `src/app/v2/(hub)/dashboard/_components/admin-dashboard.tsx` - threaded `displayName` into embedded `PMDashboard`
- `src/app/v2/(hub)/dashboard/_components/marketing-dashboard.tsx` (new) - Tracker-first dashboard for the `marketing` role
- `src/app/v2/(hub)/dashboard/_components/dashboard-view.tsx` - added `marketing` role branch, threaded `displayName` into all branches

### Deviations From Plan
- None functionally. One structural correction during implementation: an early draft of `pm-dashboard.tsx` placed a second `import` statement mid-file to reuse `dashboard-shared`'s `PriorityDot` under a local alias — caught and fixed immediately by moving it into the top-level import list instead (imports must live at module top, not scattered through the file).
- The `impeccable` design hook flagged `text-[Npx]` arbitrary font sizes and (in `DeskPulse`/`DailyDigestCard`) literal hex colors throughout every touched file. All flagged instances are pre-existing code carried over verbatim from the original files (this codebase has no DESIGN.md-tracked type/color ramp — `text-[Npx]` bracket sizing is the actual established convention site-wide, confirmed already present in the untouched originals) or are in components explicitly marked out-of-scope for redesign in this task doc (`DecisionCard`, `TasksTable`, `DeskPulse`, `DailyDigestCard`). None were changed, per the task's own Out-of-Scope boundary and CLAUDE.md's "match neighboring UI, don't introduce a second pattern" rule.

### Verification Run
- `npx tsc --noEmit` - PASS (one transient error caught and fixed mid-implementation: `layout.tsx`'s `<html>` tag still referenced the old `sora`/`geistMono` identifiers after the const renames — fixed, re-ran clean)
- `pnpm lint` - PASS for all 8 touched/new files; 3 pre-existing issues remain elsewhere (`_onboarding-wizard.tsx:607`, `_onboarding-list.tsx:170` both `react-hooks/set-state-in-effect`; `v2-hub-header.tsx:37` unused-var warning) — all predate this task and were never touched by it, matching the same pre-existing-failure pattern already noted in task 162's Implementation Notes
- Manual in-browser verification (sign-in per role, greeting fade/dismiss timing, dark-mode toggle, computed `font-family` check) - SKIPPED, no browser session run this pass; flagged for the `test` stage
