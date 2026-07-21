# 166: V2 Dashboard — WebriQ Design System v2.0 (Navy/Blue/Orange) + Real 120-Day Programme Data

**Created:** 2026-07-21
**Priority:** HIGH
**Type:** feature
**Recommended Tier:** deep
**Status:** Completed

---

## Overview

`_final_design/guide/central-hub-design-system.md` (+ its HTML style guide) defines **Design System v2.0** — a new light, navy/blue/orange brand system (`#071133` / `#007BFF` / `#FB914E`) that explicitly says it "Supersedes v1 (`#3358F4` / `#F97316` palette)" — the palette currently documented in `DESIGN.md` (a dark-first `oklch()` "Night Ops Console" system). `_final_design/dashboard/webriq-central-hub-dashboard.html` is the reference implementation: a full app shell + dashboard built on v2.0, but every number in it (client names, "42 active", "Day 34", "12 files uploaded") is **hand-authored example content**, not real data.

This task (a) replaces `DESIGN.md` with Design System v2.0, and (b) rebuilds the `/v2/dashboard` page's content to match the mockup's visual language and section types, wired to real Supabase data — never the mockup's literal numbers.

**Scope decisions made during planning (confirmed with the user):**
1. **Shell excluded.** `v2-hub-sidebar.tsx` and the topbar (`v2-hub-header.tsx`) are shared across every `/v2/*` page and are **not** restyled in this task — only the dashboard page's own content area changes. (The current sidebar already uses a navy dark chrome and already violates one v2.0 rule — a `border-l-[3px]` active-item accent stripe, which v2.0 explicitly bans — but fixing that is out of scope here.)
2. **All four role dashboards** (PM, Dev, Admin, Marketing) adopt the v2.0 visual language (colors, type, chips, cards, tables), but each keeps its **own role-appropriate content** — this is not a literal copy-paste of the mockup's all-clients programme board into every role.
3. **No fabricated data, anywhere** — including the mockup's own "12 files uploaded, shared with 4 people" line and the per-page "Publishing waves" breakdown, neither of which has a real backing source (confirmed by research below). Where a mockup section's *exact* granularity isn't backed by real data, use the design system's own "empty states teach" convention (Section 6) instead of a fabricated number.

### RLS check, corrected during implementation: PM (and Developer) CAN read full programme data

Planning-stage research cited migration `060_onboarding_project_scoping.sql:99-110`, which had restricted `customer_phases`/`customer_deliverables` to `admin|super_admin|marketing` only. That finding was **stale** — migration `070_onboarding_pm_developer_read_access.sql` (task 146, applied after 060) re-widened `SELECT` on all three tables:

```sql
-- 070_onboarding_pm_developer_read_access.sql
create policy "onboarding_internal_deliverables_pm_developer_read"
  on onboarding_internal_deliverables for select to authenticated
  using (get_my_role() in ('admin', 'super_admin', 'marketing', 'pm', 'developer'));
create policy "customer_phases_pm_developer_read"
  on customer_phases for select to authenticated
  using (get_my_role() in ('admin', 'super_admin', 'marketing', 'pm', 'developer'));
create policy "customer_deliverables_pm_developer_read"
  on customer_deliverables for select to authenticated
  using (get_my_role() in ('admin', 'super_admin', 'marketing', 'pm', 'developer'));
```

Write access (insert/update/delete) on all three tables stays `admin|super_admin|marketing`-only — unchanged. So `pm` and `developer` sessions get real, non-null `current_phase_number`/`current_phase_name` back from `GET /api/onboarding/projects`, and can read `customer_deliverables`/`onboarding_internal_deliverables` directly.

**Consequence (revised):** the mockup's phase-colored "120-Day Programme" track, Developer queue (Phase 2 deliverables), Phase 1 intake checklist, and Publish-phase progress (Phase 3 deliverables) **can** all be built with real data on `PMDashboard` itself — the admin-only split originally planned in Requirement D is unnecessary and has been removed. `AdminDashboard` embeds `PMDashboard` unchanged, so it inherits all of this automatically; its own "Admin-only extras" stay scoped to genuinely admin-only data (LLM spend, event bus health).

**Flag for reviewer (unchanged):** the user's instruction says "replace all the current existing sections." Read literally for `pm-dashboard.tsx`, this removes `DecisionCard` ("Needs your decision" — pending plan approvals), `TasksTable` ("Priority tasks today"), `DeskPulse`, and `DailyDigestCard` from PM's default landing view (all real, currently-working data) in favor of the new programme-focused sections. That data remains reachable elsewhere (`/v2/orchestration`, `/v2/dashboard/tasks`) — nothing is deleted from the app, just off PM's dashboard front page.

## Requirements

### A. `DESIGN.md` — replace with Design System v2.0

- [ ] Rewrite `DESIGN.md` end to end using `_final_design/guide/central-hub-design-system.md` as source of truth, translated into `DESIGN.md`'s existing frontmatter + prose structure (keep the `name`/`description`/`colors`/`typography`/`rounded`/`spacing`/`components` YAML frontmatter shape; replace values).
- [ ] Frontmatter `colors`: replace all `oklch(...)` entries with the v2.0 hex tokens — `navy: "#071133"`, `navy-800: "#0C1B4A"`, `navy-700: "#122459"`, `navy-active: "#16296B"`, `blue: "#007BFF"`, `blue-700: "#0063D6"`, `blue-100: "#E5F1FF"`, `blue-50: "#F0F7FF"`, `orange: "#FB914E"`, `orange-600: "#E2762F"`, `orange-700: "#B85512"`, `orange-100: "#FFEFE3"`, `bg: "#F4F6FB"`, `surface: "#FFFFFF"`, `line: "#E2E7F2"`, `line-soft: "#EDF0F7"`, `ink: "#0B1533"`, `body: "#3A4565"`, `muted: "#5F6A88"`, `ok: "#177E48"`, `warn: "#8A5A00"`, `late: "#C0392B"`, plus the 5 phase-hue pairs (`ph-onboard` `#E2762F`/`#FFEFE3`, `ph-migrate` `#0063D6`/`#E5F1FF`, `ph-publish` `#6A48E0`/`#EFEAFD`, `ph-ai` `#0B8A93`/`#E2F6F7`, `ph-optimize` `#177E48`/`#E3F5EA`).
- [ ] Frontmatter `typography`: display/metric → Space Grotesk (already the app's `font-heading`, confirmed live in `src/app/layout.tsx:2,12` — no change needed there), body/label → Inter, data → JetBrains Mono, matching the v2.0 scale in Section 2 of the source doc (page title 22px/700, panel title 15px/600, stat number 28px/700, body 13px/400-600, small label 11px/600, table header 9.5px/700 caps, mono data 9-11px/500-600).
- [ ] Prose sections: replace `## 1. Overview` through `## 6. Do's and Don'ts` with v2.0's 7 sections (Color, Typography, Spacing/radius/elevation, Components, Motion & interaction, Voice & tone, Do's & don'ts) — keep `DESIGN.md`'s own heading numbering/style, not the source doc's.
- [ ] Add an explicit **Adoption status** callout near the top (new content, not in the source doc — needed because this doc governs the whole Hub but only one page is migrated today): state that `/v2/dashboard`'s content area is the first page migrated to v2.0 (this task); `v2-hub-sidebar.tsx`, the topbar, and every other `/v2/*` page still follow the prior dark-first `oklch`/`isDark`-prop system pending future migration tasks — do not treat this file as describing the *current* state of the whole app, only the target and what's actually shipped so far.
- [ ] Preserve the still-true, codebase-wide conventions from the current `DESIGN.md` that v2.0's source doc doesn't contradict and that remain real: the `isDark`-prop pattern (Section 6 "Do's" in the current file) stays documented as the pattern for any *not-yet-migrated* v2 surface; v2.0-migrated surfaces use v2.0's fixed light tokens directly instead (v2.0 has no dark mode).

### B. `customer-phases.ts` — no data-model changes, read-only reference

- [ ] No requirement here — `PROGRAMME_PHASES`, `INTERNAL_DELIVERABLES`, and `CLASSIFICATIONS` (`src/config/customer-phases.ts`) already match the mockup's phase names, day ranges, and (for `INTERNAL_DELIVERABLES`) intake-checklist item names almost verbatim. Listed for the implementer's awareness — do not add a "Legacy" classification (mockup has one, real `CLASSIFICATIONS` doesn't; the client-table/roster rendering must handle a project whose `classification` is `null` gracefully instead of inventing "Legacy").

### C. PM Dashboard (`pm-dashboard.tsx`) — v2.0 visual system + the mockup's full section set, all real data

PM (and Developer) can read `customer_phases`/`customer_deliverables`/`onboarding_internal_deliverables` (migration 070) — so PM's dashboard gets the mockup's full section set, not a stripped-down version.

- [ ] Remove `DecisionCard`, `TasksTable`, `DeskPulse`, `DailyDigestCard` and their backing state/queries (`classification_records`, `implementation_plans`, `digest_logs`) — see the flagged trade-off above.
- [ ] Replace the KPI row (4 tiles) with real stats:
  - **Clients in programme** = count of `/api/onboarding/projects` items with `status === "in_progress"`; subtext `of {customersCount} total customers`.
  - **Running late** = count of `in_progress` items where `current_phase_number != null && current_day > getPhaseByNumber(current_phase_number).dayEnd` (reuse the exported helper, do not re-derive phase day-ranges inline).
  - **Handover due this week** = count of items where `target_handover_date` falls within the next 7 days.
  - **In Publish phase** = count of items with `current_phase_number === 3` (real substitute for the mockup's page-count-based "Publishing this week" — no per-page data exists, see Requirement G).
- [ ] **120-Day Programme board** (the mockup's signature element, design doc Section 4 "Programme track"): render each `in_progress` project from `/api/onboarding/projects` as a row with a Day-1–120 pill track (phase-boundary ticks at days 15/30/60/90, phase-hue gradient fill sized `current_day/120`, navy day-marker pill), classification chip, owner avatars (`members[]`), and a status chip — `late` (per the KPI formula above), `warn` ("Due soon" — within the last 2 days of the current phase window), else `ok` ("On track").
- [ ] **Clients table**: same project list, tabular form — Client (company_name + avatar), Classification, Phase (`current_phase_name`), Day (`{current_day} / 120` mono), Status chip (draft/scheduled/in_progress — reuse/extend `marketing-dashboard.tsx:14-27`'s `STATUS_STYLE`/`StatusPill` pattern, moved into `dashboard-shared.tsx` per Requirement B, not reinvented). Row links to `${V2_ROUTES.PORTFOLIO_TRACKER}/${item.project_id}`.
- [ ] **Reminders** `SectionCard` sourced from `GET /api/notifications?limit=5` (title/body/created_at/url) — list style per v2.0 Section 4 ("Panels").
- [ ] **Developer queue**: Phase 2 ("Migrate & Rebrand") deliverables across projects currently in that phase — one row per project's current/next incomplete `customer_deliverables` row (queried directly, `.eq("phase_number", 2)`, joined against the project list), showing project name, the static `owner` label from `PROGRAMME_PHASES[1].deliverables`, a due-day chip (`over`/`soon`/`ok` per `dayEnd` vs `current_day`), and real completion state from `customer_deliverables.status`.
- [ ] **Phase 1 intake checklist**: for the Phase-1 project with the soonest Day-15 gate (smallest `15 - current_day` among `current_phase_number === 1` projects), render `INTERNAL_DELIVERABLES` items with real per-item `onboarding_internal_deliverables.status` (done/pending), DAY tag from the mapped sub-phase's `dayEnd`. **Omit** the mockup's "12 files uploaded, shared with 4 people" line — no confirmed real source (Requirement G) — never fabricate it.
- [ ] **Publish-phase progress** (substitute for "Publishing waves" — no per-page/weekly data exists, Requirement G): Phase 3 deliverables for projects currently in Phase 3, each row showing deliverable name, owner label, day range, real `customer_deliverables.status` — no fabricated page counts or percentages.
- [ ] Keep `WorkspaceCard` (Active projects, Tracker in-progress) — restyle only, unchanged structure.
- [ ] Restyle the greeting block, KPI tiles, and every card to v2.0: `--ink`/`--body`/`--muted` text colors, `--line`/`--line-soft` borders, `--r-lg`/`--r-md` radii, `--sh-sm` shadow, Space Grotesk stat numbers, JetBrains Mono for `Day X/120` and IDs — implemented as literal Tailwind arbitrary-value classes / inline hex (matching this file's existing convention — do **not** introduce a new global CSS-variable token layer; see Code Context for the exact hex-to-usage mapping).

### D. Admin Dashboard (`admin-dashboard.tsx`) — inherits everything via embed; own extras restyled only

`AdminDashboard` already renders `<PMDashboard displayName={displayName} />` unchanged, so it automatically inherits every section from Requirement C with no extra work.

- [ ] Restyle the existing "LLM Spend by Customer" / "Event Bus Health" admin-only cards to v2.0 tokens (structure unchanged, real data unchanged). No new cards.

### E. Dev Dashboard (`dev-dashboard.tsx`) — visual reskin only

- [ ] No new sections or data sources (Dev has no elevated access relevant to the programme tables and the mockup's Developer Queue is already covered under Admin, Requirement D). Restyle existing real content — greeting, 3 KPI tiles, "My Tasks" kanban, "Team Pool", `WorkspaceCard` — to v2.0 tokens (chip styles, table/card radii, Space Grotesk stat numbers, JetBrains Mono IDs). Keep the existing `isDark`/`--c-*` CSS-variable pattern this file already uses (`bg-(--c-card)`, `text-(--c-text)`, etc., defined in `globals.css:229-248`'s `.pm-light`/`.pm-dark`) — do not rip out dark-mode support; update the **light-mode** (`.pm-light`) values of `--c-blue`/`--c-orange`/etc. in `globals.css` to the v2.0 hex values so this file's existing tokens resolve to the new brand colors in light mode, leaving `.pm-dark` untouched (v2.0 has no dark-mode spec to migrate to).

### F. Marketing Dashboard (`marketing-dashboard.tsx`) — visual reskin only

- [ ] Same treatment as Dev: restyle existing real content (greeting, 4 KPI tiles, "Needs your attention" list, `WorkspaceCard`) to v2.0 tokens via the same `.pm-light` variable updates from Requirement E. No new sections this task (Marketing already owns the Tracker-first view the mockup's programme board approximates; duplicating Admin's full board here is deferred — see Deferred/Follow-up).

### G. Confirmed no-real-data gaps (handle per Section 6 "empty states teach", never fabricate)

- **Phase 1 intake "12 files uploaded, shared with 4 people"**: no confirmed table/query in this codebase ties a file count or share-recipient count to a specific onboarding project's deliverables in this pass of research. Omit or use honest empty-state copy (Requirement C).
- **"Publishing waves"** weekly per-page breakdown and progress percentages: no page-level or Sanity-content-status tracking exists anywhere in the codebase. Phase 3 `customer_deliverables` (Requirement C) is the closest real substitute — coarser (5 deliverables over 30 days vs. weekly per-page waves) and must be presented as what it actually is, not relabeled to look like the mockup's granularity.

## Out of Scope / Must-Not-Change

- `v2-hub-sidebar.tsx` / topbar (`v2-hub-header.tsx`) visual restyle — shared across all `/v2/*` pages, not touched by this task (scope decision 1).
- Fixing the sidebar's existing `border-l-[3px]` active-stripe (a real, pre-existing violation of both the old and new design system's "no accent stripe" rule) — noted, not fixed here.
- Adding nav-count badges ("Clients=42", "Onboarding=7 hot") to the sidebar — no such badges exist today; out of scope since the sidebar itself is out of scope.
- Any change to `customer_phases`/`customer_deliverables`/`onboarding_internal_deliverables` RLS policies — the plan works within the existing (migration 070) read policy, does not request or imply any further widening.
- Any change to `GET /api/onboarding/projects` response shape, `GET /api/notifications`, or any onboarding-wizard/portfolio-tracker page implementation — consumed read-only, as-is.
- `.pm-dark` CSS-variable values in `globals.css` — untouched (v2.0 has no dark-mode spec).
- Any Sanity/content-publishing integration work to build real "Publishing waves" data — flagged as a future task, not started here.
- Space Grotesk / Inter / JetBrains Mono font wiring in `layout.tsx` — already done (confirmed live in the current tree, not a Sora/Geist-Mono setup as an earlier task doc described mid-implementation).

## Proposed File Changes

| File | Action | Purpose |
|------|--------|---------|
| `DESIGN.md` | Modify | Replace v1 oklch dark-first system with Design System v2.0 |
| `src/app/v2/(hub)/dashboard/_components/pm-dashboard.tsx` | Modify | Remove ticket/plan cards; add v2.0-styled stat tiles, 120-Day Programme board, Clients table, Reminders, Developer queue, Phase 1 intake checklist, Publish-phase progress; restyle kept `WorkspaceCard` |
| `src/app/v2/(hub)/dashboard/_components/dashboard-shared.tsx` | Modify | Add/extend chip components needed by new cards (status pill ok/warn/late, phase-track primitives) |
| `src/app/v2/(hub)/dashboard/_components/admin-dashboard.tsx` | Modify | Restyle existing admin-only extras to v2.0 tokens (no new cards — inherits PM's sections via embed) |
| `src/app/v2/(hub)/dashboard/_components/dev-dashboard.tsx` | Modify | Visual reskin only |
| `src/app/v2/(hub)/dashboard/_components/marketing-dashboard.tsx` | Modify | Visual reskin only |
| `src/app/globals.css` | Modify | Update `.pm-light` `--c-*` values to v2.0 hex tokens |

## Code Context

### `_final_design/guide/central-hub-design-system.md` — token source (already in context, Section 1-4)

Exact hex values are quoted in Requirement A above — implement from that list, not by eyeballing the HTML mockup's inline `<style>` block (they match, but the `.md` is the declared source of truth per its own header: "Source of truth for all Hub UI").

### File: `src/config/customer-phases.ts` (read-only reference — already fully real, no changes)

```ts
export const PROGRAMME_PHASES: PhaseConfig[] = [
  { number: 1, name: "Onboard", dayStart: 1, dayEnd: 15, owner: "Bert", deliverables: [...] },
  { number: 2, name: "Migrate & Rebrand", dayStart: 16, dayEnd: 30, owner: "PM + Dev", deliverables: [...] },
  { number: 3, name: "Publish", dayStart: 31, dayEnd: 60, owner: "Erica + April", deliverables: [...] },
  { number: 4, name: "AI Visibility", dayStart: 61, dayEnd: 90, owner: "April + Eri", deliverables: [...] },
  { number: 5, name: "Optimize", dayStart: 91, dayEnd: 120, owner: "PM + Strategy", deliverables: [...] },
];
export function getPhaseByNumber(n: number): PhaseConfig { ... } // use this, never inline the ranges
export const INTERNAL_DELIVERABLES: InternalDeliverableConfig[] = [ /* matches mockup's checklist items */ ];
export const CLASSIFICATIONS = ["StackShift I","StackShift II","StackShift Access","StackShift Access Plus","PipelineForge","Discrete Development"] as const;
```

### File: `src/app/api/onboarding/projects/route.ts:36-151` (read-only reference)

Response item shape (per Requirement C) — all fields real for `pm`/`developer`/`admin`/`super_admin`/`marketing` (the only roles `STAFF_ROLES` allows to call this route at all):
```ts
{
  id, project_id, project_name, company_name, customer_id,
  classification: string | null,
  current_phase_number: number | null,
  current_phase_name: string | null,
  current_day: number | null,
  progress_pct: number,
  target_handover_date: string | null,
  status: "draft" | "scheduled" | "in_progress",// never re-derive client-side
  members: { id: string; full_name: string | null }[],
}
```

### File: `supabase/migrations/070_onboarding_pm_developer_read_access.sql` (read-only reference — current, live RLS state)

```sql
create policy "customer_phases_pm_developer_read" on customer_phases for select to authenticated
  using (get_my_role() in ('admin', 'super_admin', 'marketing', 'pm', 'developer'));
create policy "customer_deliverables_pm_developer_read" on customer_deliverables for select to authenticated
  using (get_my_role() in ('admin', 'super_admin', 'marketing', 'pm', 'developer'));
create policy "onboarding_internal_deliverables_pm_developer_read" on onboarding_internal_deliverables for select to authenticated
  using (get_my_role() in ('admin', 'super_admin', 'marketing', 'pm', 'developer'));
```
Table columns (from `059_customer_programme_phases.sql`, `060_onboarding_project_scoping.sql`): `customer_phases(id, customer_id, project_id, phase_number, status, actual_start_date, actual_completed_date, ...)`; `customer_deliverables(id, customer_id, project_id, phase_number, deliverable_key, status, completed_at, ...)`; `onboarding_internal_deliverables(id, project_id, deliverable_key, status, ...)` — `status` values are `'pending' | 'in_progress' | 'done'` on both deliverable tables, `'not_started' | 'active' | 'completed' | 'skipped'` on `customer_phases`. All three query by `project_id`, not `customer_id`, for this task's use (matches `projects.id`).

### File: `src/app/api/notifications/route.ts:17-29` (read-only reference — Reminders source)

```ts
supabase.from("notifications")
  .select("id, type:event_type, title, body, url:link, read_at, created_at, actor:profiles!notifications_actor_id_fkey(full_name, avatar_url)")
  .eq("recipient_id", user.id)
  .order("created_at", { ascending: false })
  .limit(limit)
// + a separate unread head-count query — reuse both for the KPI tile and the Reminders card
```

### File: `src/app/v2/(hub)/dashboard/_components/marketing-dashboard.tsx:14-27` (existing pattern to extend, not duplicate)

```tsx
const STATUS_STYLE: Record<string, { label: string; lightBg: string; lightText: string; darkBg: string; darkText: string }> = {
  draft:       { label: "Draft", ... },
  scheduled:   { label: "Scheduled", ... },
  in_progress: { label: "In Progress", ... },
};
function StatusPill({ status, isDark }: { status: string; isDark: boolean }) { ... }
```
Move this (or an equivalent using v2.0's `ok`/`warn`/`neutral` chip colors instead of blue/amber/slate) into `dashboard-shared.tsx` so `pm-dashboard.tsx`'s new Client roster and `admin-dashboard.tsx`'s new Programme board can both use it instead of each re-declaring their own copy.

### File: `src/app/globals.css:229-248` (current `.pm-light`/`.pm-dark` tokens — Requirement E/F target)

```css
.pm-light {
  --c-card: #ffffff; --c-border: rgba(0,0,0,0.08);
  --c-blue: #3358F4; --c-orange: #d45e09; --c-sky: #1565c0;
  --c-track: rgba(0,0,0,0.06); --c-seg-bg: rgba(0,0,0,0.05);
  /* ...remaining vars */
}
.pm-dark { /* untouched */ }
```
Target: `--c-blue: #007BFF; --c-orange: #FB914E;` (and any other v2.0-mapped tokens) inside `.pm-light` only.

### File: `src/app/v2/(hub)/dashboard/_components/pm-dashboard.tsx` (current — see full read earlier this session)

Full current file is 445 lines: `DecisionCard` (lines 41-106), `TasksTable` (108-177), `DeskPulse` (179-246), `DailyDigestCard` (248-293) — all four removed per Requirement C. `WorkspaceCard` (295-321) kept, restyled only. Main export's `Promise.all` (340-359) drops the `classification_records`/`implementation_plans`/`digest_logs` queries, adds fetches for `/api/onboarding/projects` (kept, already present), `GET /api/notifications?limit=5`, and direct `customer_deliverables`/`onboarding_internal_deliverables` queries scoped to the relevant `project_id`s for the Developer queue / intake checklist / publish-progress cards.

### File: `src/app/v2/(hub)/dashboard/_components/admin-dashboard.tsx` (current — see full read earlier this session)

Current "Admin-only extras" block is `<div className="px-8 pb-8 flex flex-col gap-5 mt-2">...</div>` (lines 61-113) holding a `grid-cols-2` of two `SectionCard`s ("LLM Spend by Customer", "Event Bus Health") plus the embedded `<PMDashboard displayName={displayName} />` (line 58) above it. Requirement D only restyles these two existing cards to v2.0 tokens — no structural change, no new cards (Admin already gets Requirement C's full section set via the embed).

## Implementation Steps

1. Rewrite `DESIGN.md` per Requirement A. Verify no other file references specific old-palette hex/oklch values that would now be inconsistent with the doc (grep for `oklch(0.75 0.18 215)` / `signal-blue` usage outside already-out-of-scope files, just to confirm no surprise coupling — expect none since `DESIGN.md` is documentation-only).
2. Add the shared status-pill/chip primitives to `dashboard-shared.tsx` (Code Context) using v2.0's `ok`/`warn`/`late`/`neutral` + 5 phase-hue color pairs.
3. Rewrite `pm-dashboard.tsx` per Requirement C — stat tiles, 120-Day Programme board, Clients table, Reminders, Developer queue, Phase 1 intake checklist, Publish-phase progress, kept `WorkspaceCard`.
4. Update `.pm-light` tokens in `globals.css` per Requirement E/F.
5. Restyle `dev-dashboard.tsx` and `marketing-dashboard.tsx` per Requirements E/F (visual only — diff should show class/hex changes, not logic/query changes).
6. Restyle `admin-dashboard.tsx`'s two existing extras cards per Requirement D (visual only).
7. Run `npx tsc --noEmit` and `pnpm lint`.
8. `pnpm dev` — sign in as (or switch `profiles.role` for a test account to) each of `pm`, `admin`/`super_admin`, `developer`, `marketing` and visually verify: v2.0 colors/type/chips render correctly in each; PM's 120-Day Programme board, Clients table, Developer queue, Phase 1 intake checklist, and Publish-phase progress all show real, non-fabricated data; Admin sees the same via the embed plus its own two restyled cards.

## Acceptance Criteria

- [ ] `DESIGN.md` fully reflects Design System v2.0's tokens, type scale, components, and do's/don'ts, with an explicit adoption-status note scoping what's actually shipped vs. aspirational.
- [ ] No literal hex/oklch value from the old v1 palette (`#3358F4`, `#F97316`, `oklch(0.75 0.18 215)`, etc.) remains in any file touched by this task.
- [ ] `/v2/dashboard` for a `pm`-role user shows: 4 real stat tiles, a real phase-colored 120-Day Programme board, a real Clients table, real Reminders, a real Developer queue (Phase 2 deliverables), a real Phase 1 intake checklist (no fabricated file/share counts), real Publish-phase progress (Phase 3 deliverables, honestly labeled as coarser than "weekly waves"), and the kept `WorkspaceCard` — zero fabricated numbers, zero "Legacy" classification, zero `"—"` outside genuine loading states.
- [ ] `/v2/dashboard` for an `admin`/`super_admin`-role user shows the same content (via the `PMDashboard` embed) plus the two restyled admin-only extras cards.
- [ ] Dev and Marketing dashboards render their existing real content with v2.0 colors/type/chips; no content or query changes beyond styling.
- [ ] A `developer`-role session (also granted read access by migration 070) loading `/v2/dashboard` hits its own unchanged `DevDashboard` — no regression from touching the shared RLS-backed tables.
- [ ] Every interactive element in touched files has a visible hover state; every async section has a loading (skeleton) state — per CLAUDE.md's UI Polish Conventions.
- [ ] `npx tsc --noEmit` and `pnpm lint` both pass with no new errors.

## Verification

```bash
npx tsc --noEmit
pnpm lint
# Manual: pnpm dev
#   - Visit /v2/dashboard as pm, admin (or super_admin), developer, marketing
#     (swap profiles.role in Supabase for a test account per role)
#   - Confirm v2.0 colors (navy/blue/orange, not the old blue-600/orange-500 Tailwind defaults
#     or oklch signal-blue) render in DevTools computed styles
#   - Confirm PM's and Admin's dashboards show the SAME underlying projects/deliverables data
#     (Admin = PM's content + 2 extra cards, not a separate data set)
#   - Confirm no fabricated numbers: cross-check a stat tile or chip value against a direct
#     Supabase query for that same aggregate
#   - Confirm no console/network errors on the pm-role session against customer_phases/
#     customer_deliverables/onboarding_internal_deliverables (should return real rows, not empty)
```

## Compatibility Touchpoints

- `DESIGN.md` is documentation-only — no code/API/schema impact from Requirement A beyond the file itself.
- `.pm-light` token changes in `globals.css` affect every component using `--c-blue`/`--c-orange`/etc. in light mode, not just the dashboard — confirmed acceptable since those tokens are only consumed today by `dev-dashboard.tsx`/`marketing-dashboard.tsx`/`admin-dashboard.tsx` (all touched by this task anyway); grep for other `.pm-light`/`--c-` consumers before merging to confirm no untouched page changes color unexpectedly.
- No schema, RLS, or API contract changes — all read-only consumption of existing tables/endpoints/policies.

## Deferred / Follow-up (explicitly out of scope here, noted for a future task)

- Restyling `v2-hub-sidebar.tsx` / topbar to v2.0 (including fixing the existing `border-l-[3px]` accent-stripe violation) and rolling v2.0 out to the rest of `/v2/*`.
- Adding PM's new programme-board/dev-queue/intake-checklist/publish-progress cards to the Dev/Marketing dashboards too (both already have RLS read access; deferred purely to bound this task's scope per the confirmed "each keeps its own role-appropriate content" decision).
- Real page-level/weekly "Publishing waves" data — would require a new Sanity-content-status or publishing-schedule data model; no such model exists today.
- A real file-count/sharing figure for the Phase 1 intake checklist — would require confirming/building a query against Supabase Storage or an asset-sharing table (tasks 137/138/140 territory), not confirmed to exist in the shape needed during this task's research.

## Implementation Notes

### What Changed
- **`DESIGN.md`** rewritten end to end: v2.0 navy/blue/orange frontmatter tokens (colors/typography/rounded/spacing/components), an "Adoption status" callout scoping what's actually migrated (`/v2/dashboard` content only) vs. target, all 8 prose sections (Color, Typography, Spacing/Radius/Elevation, Components, Motion & Interaction, Voice & Tone, Do's/Don'ts), and a "Superseded v1 system" closing note pointing to git history instead of duplicating the old spec inline.
- **`dashboard-shared.tsx`**: added a `cva`-based `Chip` component (9 tones: ok/warn/late/neutral + 5 phase hues), `PHASE_TONE`/`PHASE_GRADIENT` lookup maps, `PhaseChip`, `OnboardingStatusPill` (relocated from `marketing-dashboard.tsx`, kept its `isDark` param for Dev/Marketing's continued dark-mode support), and `ProgrammeTrack` (the Day-1–120 phase-colored pill track with tick marks and a navy day-marker pill). Also updated the pre-existing `StatusChip`/`PriorityDot` hex maps (used by Dev's kanban) from ad hoc Tailwind-named colors to v2.0-mapped hex, since Requirement E called for restyling "chip styles" there too.
- **`pm-dashboard.tsx`**: full rewrite. Removed `DecisionCard`, `TasksTable`, `DeskPulse`, `DailyDigestCard` and their `classification_records`/`implementation_plans`/`digest_logs` queries (the flagged trade-off — see Overview). Added: 4 real stat tiles (Clients in programme, Running late, Handover due this week, In Publish phase), the 120-Day Programme board, a Clients table, a Reminders card (`GET /api/notifications`), a Developer queue (Phase 2 deliverables), a Phase 1 intake checklist (spotlighting the soonest-Day-15-gate client), and Publish-phase progress (Phase 3 deliverables, honestly labeled as coarser than "weekly waves," with the file-count/sharing line omitted per Requirement G). Kept `WorkspaceCard` restyled only.
- **`globals.css`**: `.pm-light`'s `--c-*` values updated to v2.0 hex (`--c-blue: #007BFF`, `--c-orange: #FB914E`, etc.); `.pm-dark` left untouched.
- **`marketing-dashboard.tsx`**: removed its local `STATUS_STYLE`/`StatusPill`, now imports and uses the shared `OnboardingStatusPill`. No other changes — it and `dev-dashboard.tsx`/`admin-dashboard.tsx` already colored every brand element via the `--c-*` token system, so they inherit v2.0's palette automatically from the `globals.css` change with zero further edits (confirmed by reading all three files for any hardcoded non-token brand hex — none found).

### Files Changed
- `DESIGN.md` — full rewrite to Design System v2.0
- `src/app/v2/(hub)/dashboard/_components/dashboard-shared.tsx` — new `Chip`/`PhaseChip`/`ProgrammeTrack`/`OnboardingStatusPill` primitives; v2.0-mapped `StatusChip`/`PriorityDot` hex
- `src/app/v2/(hub)/dashboard/_components/pm-dashboard.tsx` — full rewrite per Requirement C
- `src/app/globals.css` — `.pm-light` token values updated to v2.0 hex
- `src/app/v2/(hub)/dashboard/_components/marketing-dashboard.tsx` — relocated `StatusPill` to the shared `OnboardingStatusPill`
- `src/app/v2/(hub)/dashboard/_components/dev-dashboard.tsx`, `admin-dashboard.tsx` — **not edited**; both already theme every brand-colored element via `--c-*` CSS variables and inherit v2.0 automatically from the `globals.css` change (verified by reading both files in full — no hardcoded non-token brand hex present)

### Post-review fix (user caught in the rendered page head)
- The rewrite dropped the mockup's page-head structure — the greeting's stats subline ("7 clients in the 120-day programme · 2 running late") and the "Export weekly report" action button — neither was in the original task doc's per-section breakdown, so it was missed in the first pass. Fixed: the greeting subline now reports real `inProgress.length`/`lateProjects.length` (the same values driving the stat tiles, in mono per DESIGN.md's data-face rule) instead of a generic "PM workspace" label; a ghost-style "Export weekly report" button was added, wired to a real (not fabricated) client-side CSV export of the currently-loaded in-progress programme roster (company, classification, phase, day, status, target handover date) — no new API, disabled while loading or when there's nothing to export.

### Deviations From Plan
- **RLS premise corrected mid-implementation.** The task doc as originally planned cited migration 060 and split work between a "PM-limited" dashboard and an "Admin-only full-fidelity" dashboard. Before writing code, I found migration `070_onboarding_pm_developer_read_access.sql` (applied after 060) re-widened `SELECT` on `customer_phases`/`customer_deliverables`/`onboarding_internal_deliverables` to include `pm` and `developer`. I corrected the task doc's Overview and Requirements C/D in place (documented inline, with the superseded migration 060 citation kept for the record) before implementing, so `pm-dashboard.tsx` now carries the full section set and `admin-dashboard.tsx` needed no new cards. This was a factual correction to the plan's premise, not a scope expansion the user hadn't already asked for — flagged here per the task's own "deviations" convention rather than silently absorbed.
- **Design-token/font-size lint findings not individually resolved.** The `impeccable` design hook flagged ~40 findings across the touched files (`design-system-font-size`, `design-system-color`) after every edit. On inspection, all were either (a) font sizes matching `DESIGN.md`'s own documented type scale, expressed as Tailwind arbitrary-value brackets (`text-[13px]` etc.) per this codebase's established convention rather than named classes, or (b) hex values sourced faithfully from the reference mockup (`_final_design/dashboard/webriq-central-hub-dashboard.html`) that aren't spelled out verbatim in `DESIGN.md`'s prose (e.g. the programme-track gradient's lighter "from" stops, or a chip's mid-tone border color) — the hook's own message repeatedly noted `.impeccable/design.json` is stale relative to the rewritten `DESIGN.md`. None were fabricated or arbitrary; none were changed. Not suppressed via `ignore-value`/`ignore-file` since that requires explicit user confirmation this session didn't include — left for the user or a `/impeccable document` refresh to adjudicate.
- **No `Chip` `className` prop type check for `DeveloperQueueCard`'s `font-mono` override** — verified via `tsc`/`lint` clean, not called out further; mentioned only because it's the one place `Chip`'s optional `className` prop is exercised.

### Verification Run
- `npx tsc --noEmit` — PASS on all touched files (pre-existing, unrelated failures remain in the untracked `_design (OLD)/` folder — confirmed out of scope, not touched by this task)
- `pnpm lint` — PASS on all touched files after fixing 2 unused imports (`Circle`, `KpiCard` in `pm-dashboard.tsx`) and 1 `react-hooks/set-state-in-effect` error (moved `setIntakeProject`/`setPublishProject` into the existing `Promise.all().then()` callback instead of calling them synchronously before it). Total problem count dropped from 1372→1369 (78→77 errors), matching exactly the fixes made; all remaining errors/warnings are pre-existing and outside this task's touched files (confirmed via `grep` against `_design (OLD)/`, `_onboarding-wizard.tsx:607`, and `_onboarding-list.tsx:170` — the latter two already documented as pre-existing in task 162's implementation notes).
- Manual in-browser role-switching QA (sign in as pm/admin/developer/marketing, verify real data, check computed colors) — **SKIPPED** initially (no test credentials/session available; a user's own dev server was already running live and wasn't driven via browser automation to avoid disrupting it). **Completed by the user directly** in the second and third rounds below — confirmed working on their own live session.

### Round 2 (user live-testing feedback)
- User reported the greeting and the "Export weekly report" button/stats subline missing. The button/subline gap was a real miss (see "Post-review fix" above, already folded into the main diff). The greeting itself was investigated by reading `use-greeting.ts`: `SESSION_KEY = "hub_greeting_ts"` is a single app-wide `sessionStorage` key written on first mount of *any* v2 dashboard and self-hides 3 minutes later — since the user had already loaded `/v2/dashboard` earlier in the same browser tab while testing round 1, the fade timer had already elapsed by the time they reloaded to check round 2, making it look permanently hidden rather than working-as-designed. No code change made without evidence; the user was given a one-line `sessionStorage.removeItem("hub_greeting_ts"); location.reload();` console command to isolate whether it was the timer or a real bug.
- User also asked to remove, "for now": the `WorkspaceCard` ("Your workspace" — Active projects / Tracker in-progress) and Admin's "Admin-only extras" block (LLM Spend by Customer / Event Bus Health). Both removed:
  - `pm-dashboard.tsx`: deleted the `WorkspaceCard` component, its render call, the now-orphaned `activeProjects` state + `projects` count query (the base-data `Promise.all` dropped from 4 legs to 3), and the now-unused `FolderKanban`/`ChevronRight` icon imports (both were exclusively used by `WorkspaceCard`; `ChartGantt` stays, still used by `ProgrammeBoard`'s empty state).
  - `admin-dashboard.tsx`: reduced to a 10-line pass-through (`export default function AdminDashboard({ displayName }) { return <PMDashboard displayName={displayName} />; }`), dropping the `llm_invocation_logs`/`classification_records` status-count queries, the `usePMSettings`/`isDark` wrapper (no longer needed — `PMDashboard` is fixed-light, doesn't consume `--c-*` tokens), and the `SectionCard` import. `userId` stays in the `Props` interface (unused internally) to match `dashboard-view.tsx`'s existing call signature without touching that file.
- `npx tsc --noEmit`/`pnpm lint` re-run after each change — clean, same pre-existing-only baseline as the initial round (1369 problems, 77 errors, all outside this task's files).

### Round 3 (user confirmation)
- User ran the `sessionStorage.removeItem` command and confirmed the greeting renders correctly — round 2's diagnosis (session-timer, not a bug) was correct; no code change was needed for it.
- User confirmed the round-2 removals are as wanted and asked to mark the task complete.
