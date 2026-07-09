# 122: 120-Day Customer Programme — Timeline, Bert's Day 1–15 Onboarding Wizard, Reminders & v2 Customers Extension

**Created:** 2026-07-09
**Priority:** HIGH
**Type:** feature
**Recommended Tier:** deep
**Status:** Testing

---

## Overview

WebriQ runs every new customer through a fixed 120-day engagement: **Onboard** (Day 1–15, owner Bert — Marketing Manager, who takes client calls/meetings, uploads branding/documents, and enters business intel), **Migrate & Rebrand** (16–30, PM+Dev), **Publish** (31–60, Erica+April), **AI Visibility** (61–90, April+Eri), **Optimize** (91–120, PM+Strategy). This is fully spec'd in `_docs/plan-v2/PROJECT ONBOARDING/Project_Onboarding_QBR_120Day_FINAL.html` ("FINAL", dated 2026-06-29 — treat as the authoritative phase/day/deliverable source; the earlier `onboarding_module_features.md` has a day-range typo in its Phase 3 description and is superseded by the QBR).

Today, none of this exists in the Hub: `customers.status` is a 4-value enum with no day/phase concept at all, and Central Hub has no way to track where a customer sits in the 120 days, no reminders, and no way for Bert to log Phase 1 work. This task builds that: a data model for phase/deliverable tracking, a "120-Day Programme" tab on the v2 customer profile (timeline + live progress + reminders), a 5-step guided wizard for Bert's Phase 1 deliverables, and a daily Cliq-notification cron for upcoming/overdue/handover reminders.

Design reference: `_design/customers/CustomerTimeline.tsx` (`PHASES`/`DeliverableItem` shapes, timeline bar, phase cards, notification rail) and `_design/customers/BertWizard.tsx` (5-step wizard: Kickoff → Client Intel → File Uploads → Deliverables → Sign-off). **These are layout/UX references only** — they're plain React with inline `style={{}}` and raw hex colors, not literal code to port. Also `_design/CLAUDE (1).md` is a generic UI-polish guide the user wants reconciled into root `CLAUDE.md` — see the "Design guide reconciliation" section below for what's actually adopted vs. rejected (parts of it directly contradict this codebase's established conventions).

**Scope resolved with the user up front (not to be re-litigated during implementation):**
1. **Data model**: new normalized tables (`customer_phases`, `customer_deliverables`), not flat columns.
2. **Redesign scope**: extend the existing v2 customer profile (new tab + wizard), restyled with reconciled design tokens. The existing v2 Customers list (table view, task 116's search/filter/pagination/skeletons) stays structurally as-is — light polish only, not a rebuild. The Figma `CustomerList.tsx`/card-grid layout is **not** built in this task.
3. **Phase data-entry scope**: only Phase 1 (Bert's wizard) gets a real data-entry UI. Phases 2–5 are read-only tracking entries in the timeline — PM/Bert can still manually override which phase a customer is on (via "Jump to phase"), just no dedicated wizard for phases 2–5 yet.

## Requirements

- [ ] **Data model**: `customers.programme_started_at` (Day 1 anchor), `customer_phases` (5 rows/customer once started: status, actual start/complete dates, manual-override flag + note, Phase-1 wizard data blob), `customer_deliverables` (27 rows/customer once started — one per deliverable across all 5 phases: status pending/in_progress/done), `programme_notifications` (dedupe log for outbound Cliq reminders), `customer_assets.phase_number` (nullable tag so wizard uploads show which phase they belong to).
- [ ] **"Start 120-Day Programme" action** on the customer profile: sets `programme_started_at = now()`, seeds all 5 `customer_phases` rows (phase 1 → `active`, actual_start_date = today; phases 2–5 → `not_started`) and all 27 `customer_deliverables` rows (`pending`).
- [ ] **"Jump to phase" manual override**: Bert or PM can tag a customer as starting from any of the 5 phases (or a free-text "Other" phase) instead of always Day 1, per the spec. Sets the target phase `active` + `is_manual_override = true`, prior phases `skipped`.
- [ ] **120-Day Programme tab** on `/v2/customers/[customerId]`: horizontal 120-day timeline bar (phase segments, today marker, Day 15/30 gate markers), a live progress bar + "Day N / 120" counter, expandable phase cards showing each phase's deliverables (name, description, due day, owner, status icon), and a "Reminders" rail computed client-side from the same due-day logic as the notification cron (matching the Figma's `buildNotifications()` — no DB round-trip needed for this display-only panel).
- [ ] **Bert's Onboarding Wizard** (Phase 1 only), launched from the Programme tab: 5 steps — **Kickoff** (meeting date, attendees, outcome target, meeting notes — auto-marks the "Kickoff meeting" deliverable done), **Client Intel** (website, competitor URLs, business description, service areas), **File Uploads** (Branding / Documents / HTML & Content / Access & Credentials — reuses the existing `customer_assets` upload flow from task 118, tagged `phase_number: 1`), **Deliverables** (click-to-cycle pending → in_progress → done checklist for all 7 Phase 1 deliverables), **Sign-off** (summary + "Complete Phase 1 & notify PM" — marks phase 1 `completed`, phase 2 `active`, sends a Cliq PM-channel notification).
- [ ] **Reminders**: daily cron (`pg_cron` + `pg_net`, same mechanism as the existing digest job) that Cliq-notifies: deliverables due within 5 days or overdue (**Phase 1 only** — see Notes), the Day 16 PM handover reminder, a developer reminder every 5 days during Phase 2 (Day 16/21/26), the Day 15/30 gate reminders, and a generic "phase running late" flag for any phase still active past its day range (all 5 phases — purely calendar-driven, no deliverable-completion dependency). Every send is deduped via `programme_notifications` so a given reminder fires exactly once.
- [ ] **Real-time updates**: Programme tab and Customers list subscribe to `customer_phases`/`customer_deliverables` `postgres_changes` (mirroring the existing pattern in `_customers-index.tsx`) so progress updates live without a manual refresh.
- [ ] **v2 Customers list**: add a small "Day N / 120 · Phase X" badge per customer row when `programme_started_at` is set (reuses the existing `Promise.all` lookup-map pattern in `page.tsx`, no structural list rebuild).
- [ ] **Design guide reconciliation**: merge a distilled, codebase-compatible subset of `_design/CLAUDE (1).md` into root `CLAUDE.md` (new UI Polish Conventions section) — see below for exactly what's adopted vs. rejected and why.

## Out of Scope / Must-Not-Change

- **Phases 2–5 data-entry UI** (developer dashboards, Erica/April/Eri content-publishing tools, PM Optimize/QBR tooling) — explicitly deferred; those phases are read-only in the timeline this task builds.
- **Developer task auto-creation on Phase 2 handover** ("Developer's dashboard shows the new task... deadline auto-set to Day 30") — the Cliq notification covers the handover signal; wiring it to native PM task creation (task 073) is a follow-up.
- **`sendPushNotification()` wiring** — stays unused/unwired. Cliq is the sole reminder channel for this task; push has zero call sites project-wide today and wiring its first one is a separate decision, not bundled into an already-large task.
- **Section 1 of the feature doc — "Client classification & management"** (Legacy client tag, StackShift I/Access/Access Plus classification, Super-Admin-managed classification types, filterable list). This overlaps with the existing `customer_products.product_name` enum and needs its own reconciliation; not part of the ask that named this task (timeline, wizard, notifications, list extension). Flag as a separate future task.
- **Full Figma `CustomerList`/`CustomerDetail` structural rebuild** — per the resolved scope decision, only a new tab + list badge are added to the existing v2 UI.
- **`customer_assets` per-file sharing beyond the existing `allowed_roles` mechanism** (task 118) — that mechanism already satisfies the spec's "permissions in place, shareable to specific users on demand" requirement; no new ACL work needed here.
- **v1 (non-v2) customer routes** — untouched, matching every prior v2 customer task's scope boundary.
- **Wholesale adoption of `_design/CLAUDE (1).md`** — see reconciliation notes; several of its rules (semantic `bg-background` tokens, Tailwind `dark:` variants, mandatory shadcn Form/react-hook-form/zod, `sonner` toasts) are **not** adopted because they contradict 100+ files' worth of established convention in this codebase and none of those packages/patterns are installed.

## Key Design Decisions (resolved by research, not to be re-asked)

**Bert's role/permissions**: Bert is a Marketing Manager, not a PM — but `profiles.role` is a fixed enum (`admin|hr|pm|developer|client`, per CLAUDE.md) and the existing `customer_assets` upload route already gates writes to `admin|super_admin|pm`. Rather than adding a new role value (a schema-level change outside this task's agreed scope), all Programme write actions (start, override, deliverable update, wizard-data save) use the same `admin|super_admin|pm` gate — Bert is provisioned a `pm`-tier Hub account operationally. "Owner" labels on deliverables (Bert, Jun, Dev, PM, Erica, April, Eri) are **display-only strings** from the spec, not tied to individual Hub user accounts — no per-person RBAC beyond the existing role enum.

**Deliverable `due` day is absolute programme day, not phase-relative** — confirmed from the Figma source (Phase 2's deliverables have `due: 16, 16, 24, 26, 28, 29, 30`, not `0, 0, 8...`). Day math in `getCurrentProgrammeDay()`/reminder logic always uses `programme_started_at` as the sole Day-1 anchor, never a phase's own start date.

**"Current phase" is status-driven, not date-derived.** `customer_phases.status = 'active'` (exactly one row per customer) is the source of truth for which phase is "current" — set by explicit actions (Start, Jump-to-phase, wizard Sign-off), not recomputed from `programme_started_at` math. This is deliberate: the spec requires clients to be manually tagged to a phase they're already partway through, which pure day-math can't represent (this is exactly the bug the Figma mock's `getProgrammeDay()` status-lookup hack was working around — not viable for a real 120-day calendar, per prior investigation). The **"Day N / 120" counter** shown in the UI is still purely `programme_started_at` + elapsed days — informational, decoupled from which phase is marked active.

**Deliverable-level due/overdue reminders are Phase 1 only.** Phases 2–5 deliverables have no completion UI in this task, so they'd sit `pending` forever and falsely fire "overdue" reminders past their due day if included. The generic "phase running late" cron check (Section 3.2 of Requirements) covers phases 2–5 without depending on deliverable status — it only checks `current_day > phase.day_end AND phase.status not in ('completed','skipped')`.

**File uploads reuse `customer_assets` verbatim** (task 118's real upload flow + role-based `allowed_roles` visibility) — just tagged with the new nullable `phase_number` column so wizard uploads are traceable to Phase 1, and shown in both the wizard's File Uploads step and the existing Assets tab (same underlying rows, no duplication).

## Design guide reconciliation (`_design/CLAUDE (1).md` → root `CLAUDE.md`)

**Adopted** (compatible with, or a genuine improvement on, existing convention):
- Every interactive element needs a visible hover state (`transition-colors hover:...`).
- Every list/table/section needs an explicit empty state — icon + one-line message + primary action, not blank space (the codebase already does this in most places — task 118/119/120's assets/contacts lists; this makes it an explicit rule).
- Every async action needs a loading state — a disabled button with a spinner or "…" text, never a silent hang (already the de facto pattern in every save handler in `client.tsx`; codifying it).
- Icon-only buttons get `aria-label`; focus-visible rings stay visible; color is never the sole state indicator.
- Never use `<div onClick>` for an action — use `<button>`.
- No emoji as icons or bullets in UI (matches existing `lucide-react`-only convention).
- Prefer `cva` over ternary piles for components with real variants (already project convention per existing CLAUDE.md line on Tailwind arbitrary values).

**Explicitly rejected / superseded** (contradicts this codebase's shipped, working convention — verified by grep before merging):
- **"Use CSS variables (`bg-background`, `text-foreground`)... never `bg-white`"** — rejected. 0 files under `src/app/v2` use Tailwind's `dark:` variant; theming is done everywhere via an `isDark` boolean (from the shared theme hook) + `cn()` picking explicit paired light/dark utility classes per element (see `client.tsx`'s `sectionCls`, or task 120's `isDark ? "border-white/[0.06] bg-white/[0.03]" : "border-slate-100 bg-slate-50/50"`). New Programme/Wizard UI must follow the `isDark`-prop pattern for consistency with the other ~2500 lines of this exact file, not introduce a second, incompatible theming system.
- **"Always use shadcn Form + react-hook-form + zod for forms"** and **"always use `sonner` for toasts"** — rejected. Neither `react-hook-form`/`@hookform/resolvers` nor `sonner` is an installed dependency, and every existing form in this codebase (onboarding form engine, Edit Customer modal, Add Asset modal) uses plain controlled `useState` + inline fetch + inline error state. Adopting react-hook-form/sonner for just this feature would make it the one form pattern in the whole app that looks different from every other. Not installed, not adopted here — flag as a possible separate infra decision if the user wants it later.
- **"Always use shadcn primitives (Button, Dialog, Table, Badge, Card...)"** — only `button.tsx` exists in `src/components/ui/`. Rejected as a blanket retrofit mandate; adopted narrowly as "use shadcn for genuinely new primitive needs going forward," but this task's badges/pills/progress bars use the same hand-rolled `rounded-full`/`text-[10-11px]` pill pattern already used 100+ times elsewhere (e.g. task 120's "Primary" badge, `ASSET_TYPE_LABELS` pills) for visual consistency with the rest of the page, not shadcn `Badge`/`Progress`.
- Reference-design namechecks (Linear/Vercel/Resend/Raycast) and the generic component-anatomy/file-structure boilerplate are dropped — not actionable rules, just vibes already covered by the adopted bullets above.

## Proposed File Changes

| File | Action | Purpose |
|------|--------|---------|
| `supabase/migrations/059_customer_programme_phases.sql` | Create | `programme_started_at` column, `customer_phases`, `customer_deliverables`, `programme_notifications` tables, `customer_assets.phase_number` column, RLS policies, indexes, pg_cron job for daily reminders. |
| `src/config/customer-phases.ts` | Create | Pure static config: `PROGRAMME_PHASES` (5 phases × their deliverables, ported from the QBR doc), `getCurrentProgrammeDay()`, `getPhaseForDay()`, `getPhaseByNumber()`. No React/UI imports — reusable by both API routes and client components. |
| `src/app/api/customers/[customerId]/programme/route.ts` | Create | `GET` — returns the customer's `customer_phases` + `customer_deliverables` rows, staff-only. |
| `src/app/api/customers/[customerId]/programme/start/route.ts` | Create | `POST` — sets `programme_started_at`, seeds all `customer_phases`/`customer_deliverables` rows. |
| `src/app/api/customers/[customerId]/programme/phase/route.ts` | Create | `PATCH` — manual "jump to phase" override. |
| `src/app/api/customers/[customerId]/programme/deliverables/[deliverableKey]/route.ts` | Create | `PATCH` — cycle a deliverable's status; body includes `phase_number`. Phase 1's last-deliverable-done + explicit Sign-off action transitions phase 1→completed, phase 2→active, and Cliq-notifies PM. |
| `src/app/api/customers/[customerId]/programme/wizard-data/route.ts` | Create | `PATCH` — debounced autosave of Bert's Kickoff/Client Intel free-text fields into `customer_phases.wizard_data` (phase 1 row). |
| `src/app/api/programme/reminders/route.ts` | Create | `POST`, secret-gated (reuses `DIGEST_SECRET`, matching `/api/digest`'s auth pattern) — the daily cron target; computes and sends deduped Cliq reminders. |
| `src/app/api/customers/[customerId]/assets/route.ts` | Modify | Accept optional `phase_number` in the `POST` body, pass through to the insert (small, additive change to the existing handler). |
| `src/app/v2/(hub)/customers/[customerId]/client.tsx` | Modify | Add `"programme"` to the `NavSection` union, add its `navItems` entry, render `<ProgrammeTab>` when active. |
| `src/app/v2/(hub)/customers/[customerId]/_programme-tab.tsx` | Create | Timeline bar, phase cards, reminders rail, "Start"/"Jump to phase" controls, realtime subscription. Sibling file to `client.tsx`, matching this codebase's `_xxx.tsx` convention for page-scoped-but-large components (e.g. `projects/[projectId]/_list-view.tsx`). |
| `src/app/v2/(hub)/customers/[customerId]/_bert-wizard.tsx` | Create | The 5-step wizard, full-page takeover within the Programme tab (client-side `wizardOpen` toggle, no new route). |
| `src/app/v2/(hub)/customers/page.tsx` | Modify | Add `programme_started_at` to the customers select + a `customer_phases` lookup query (active phase per customer), pass through to `CustomerListItem`. |
| `src/app/v2/(hub)/customers/_customers-index.tsx` | Modify | Render the "Day N / 120 · Phase X" badge; subscribe to `customer_phases` realtime updates. |
| `src/types/database.ts` | Modify | Add `customer_phases`, `customer_deliverables`, `programme_notifications` table types; add `phase_number`/`programme_started_at` to the existing `customer_assets`/`customers` types. Hand-maintained in this repo (no codegen script) — match existing `Relationships[]` shape. |
| `CLAUDE.md` | Modify | New "UI Polish Conventions" subsection under Key Conventions, per the reconciliation above. |

## Code Context

### Full phase/deliverable config, ported from the QBR doc + Figma (`_design/customers/CustomerTimeline.tsx:30-88`, cross-checked against `Project_Onboarding_QBR_120Day_FINAL.html` section 2–6)

```ts
// src/config/customer-phases.ts
export type DeliverableConfig = {
  key: string;
  name: string;
  description: string;
  due: number; // absolute programme day, 1-120 — NOT phase-relative
  owner: string; // display label only, not a Hub user FK
};

export type PhaseConfig = {
  number: 1 | 2 | 3 | 4 | 5;
  name: string;
  shortName: string;
  dayStart: number;
  dayEnd: number;
  owner: string;
  deliverables: DeliverableConfig[];
};

export const PROGRAMME_PHASES: PhaseConfig[] = [
  {
    number: 1, name: "Onboard", shortName: "Onboard", dayStart: 1, dayEnd: 15, owner: "Bert",
    deliverables: [
      { key: "kickoff", name: "Kickoff meeting", description: "Structured kickoff; goals, timeline, and contacts confirmed.", due: 1, owner: "Bert" },
      { key: "outcome-target", name: "Outcome target", description: "Agreed measurable outcomes for the 120-day programme.", due: 3, owner: "Bert" },
      { key: "migration-checklist", name: "Migration checklist", description: "Full audit of existing site and content ready for migration.", due: 5, owner: "Bert" },
      { key: "content-map", name: "90-day content map", description: "Topics, clusters, and publishing schedule through Day 90.", due: 10, owner: "Bert" },
      { key: "html-mockup", name: "HTML mockup", description: "Visual mockup of new site structure for client approval.", due: 12, owner: "Bert" },
      { key: "storage-kb", name: "Storage folder + KB", description: "Project folder live; knowledge base populated with all assets.", due: 14, owner: "Bert" },
      { key: "client-signoff", name: "Client call — sign-off", description: "Scope, mockup, and migration plan approved. PM joins for handover.", due: 15, owner: "PM + Bert" },
    ],
  },
  {
    number: 2, name: "Migrate & Rebrand", shortName: "Migrate", dayStart: 16, dayEnd: 30, owner: "PM + Dev",
    deliverables: [
      { key: "tech-docs", name: "Tech docs from Jun", description: "Full technical specification package for the developer.", due: 16, owner: "Jun" },
      { key: "migration-implementation", name: "Migration / Implementation", description: "HTML mockups converted to StackShift I.", due: 16, owner: "Dev" },
      { key: "structure-cleanup", name: "Structure cleanup", description: "URL architecture, redirects, forms, and navigation finalized.", due: 24, owner: "Dev" },
      { key: "branding-review", name: "Branding review", description: "Brand colours, fonts, and voice applied across all pages.", due: 26, owner: "Dev" },
      { key: "foundational-pages", name: "Foundational pages", description: "Home, About, Services, and Contact pages are launch ready.", due: 28, owner: "Dev" },
      { key: "internal-qa", name: "Internal QA", description: "Team review of build against mockup and tech docs.", due: 29, owner: "PM" },
      { key: "client-review-approval", name: "Client review + approval", description: "Client reviews dev URL and approves for launch.", due: 30, owner: "PM" },
    ],
  },
  {
    number: 3, name: "Publish", shortName: "Publish", dayStart: 31, dayEnd: 60, owner: "Erica + April",
    deliverables: [
      { key: "product-publishing", name: "Product publishing", description: "Dedicated pages per product/service line published.", due: 40, owner: "Erica" },
      { key: "industry-publishing", name: "Industry publishing", description: "Industry-specific content targeting buyer segments.", due: 45, owner: "April" },
      { key: "location-publishing", name: "Location publishing", description: "Local and regional landing pages as per content map.", due: 50, owner: "Erica" },
      { key: "buyer-education-content", name: "Buyer-education content", description: "Blog posts, guides, and FAQs aligned to buyer journey.", due: 55, owner: "April" },
      { key: "publishing-report", name: "Publishing report", description: "Summary of all content published and initial traffic data.", due: 60, owner: "PM" },
    ],
  },
  {
    number: 4, name: "AI Visibility", shortName: "AI Visibility", dayStart: 61, dayEnd: 90, owner: "April + Eri",
    deliverables: [
      { key: "updated-publishing-plan", name: "Updated Publishing Plan", description: "Based on metrics from the previous publishing report.", due: 62, owner: "April" },
      { key: "gap-publishing", name: "Gap publishing", description: "Identify and fill content gaps found via AI and search data.", due: 70, owner: "Eri" },
      { key: "conversion-refinements", name: "Conversion refinements", description: "CTA, form, and page improvements based on behaviour data.", due: 80, owner: "Dev" },
      { key: "ai-visibility-tracking", name: "AI visibility tracking & reporting", description: "90-day outcome check and analysis.", due: 90, owner: "April + Eri" },
    ],
  },
  {
    number: 5, name: "Optimize", shortName: "Optimize", dayStart: 91, dayEnd: 120, owner: "PM + Strategy",
    deliverables: [
      { key: "updated-publishing-plan", name: "Updated Publishing Plan", description: "Plans for the last 30 days in this cycle.", due: 92, owner: "PM" },
      { key: "gap-publishing", name: "Gap publishing", description: "Identify and fill remaining content gaps.", due: 115, owner: "Eri" },
      { key: "next-90day-roadmap", name: "Next 90-day roadmap", description: "Content, technical, and strategy plan for the next quarter.", due: 118, owner: "PM" },
      { key: "qbr-presentation", name: "QBR presentation", description: "Live review session with client covering results and next cycle roadmap.", due: 120, owner: "PM" },
    ],
  },
];

export function getCurrentProgrammeDay(startedAt: string | Date): number {
  const start = new Date(startedAt);
  const now = new Date();
  const diffDays = Math.floor((now.getTime() - start.getTime()) / 86_400_000);
  return Math.max(1, diffDays + 1);
}

export function getPhaseForDay(day: number): PhaseConfig {
  return PROGRAMME_PHASES.find((p) => day >= p.dayStart && day <= p.dayEnd) ?? PROGRAMME_PHASES[PROGRAMME_PHASES.length - 1];
}

export function getPhaseByNumber(n: number): PhaseConfig {
  return PROGRAMME_PHASES.find((p) => p.number === n)!;
}
```

Note: phases 4 and 5 both have `updated-publishing-plan`/`gap-publishing` keys — safe, since `customer_deliverables`'s uniqueness is `(customer_id, phase_number, deliverable_key)`, so the same key in different phases is a distinct row.

### Migration sketch (`supabase/migrations/059_customer_programme_phases.sql`)

```sql
alter table customers add column if not exists programme_started_at timestamptz;
create index if not exists idx_customers_programme_started_at on customers (programme_started_at) where programme_started_at is not null;

create table if not exists customer_phases (
  id                    uuid primary key default gen_random_uuid(),
  customer_id           text not null references customers (customer_id) on delete cascade,
  phase_number          smallint not null check (phase_number between 1 and 5),
  status                text not null default 'not_started' check (status in ('not_started','active','completed','skipped')),
  actual_start_date     date,
  actual_completed_date date,
  is_manual_override    boolean not null default false,
  override_note         text,
  wizard_data           jsonb not null default '{}'::jsonb,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  unique (customer_id, phase_number)
);
create index if not exists idx_customer_phases_customer_id on customer_phases (customer_id);

create table if not exists customer_deliverables (
  id               uuid primary key default gen_random_uuid(),
  customer_id      text not null references customers (customer_id) on delete cascade,
  phase_number     smallint not null,
  deliverable_key  text not null,
  status           text not null default 'pending' check (status in ('pending','in_progress','done')),
  completed_at     timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique (customer_id, phase_number, deliverable_key)
);
create index if not exists idx_customer_deliverables_customer_id on customer_deliverables (customer_id);

create table if not exists programme_notifications (
  id                uuid primary key default gen_random_uuid(),
  customer_id       text not null references customers (customer_id) on delete cascade,
  notification_key  text not null,
  sent_at           timestamptz not null default now(),
  unique (customer_id, notification_key)
);

alter table customer_assets add column if not exists phase_number smallint;

alter table customer_phases enable row level security;
alter table customer_deliverables enable row level security;
alter table programme_notifications enable row level security;

create policy "customer_phases_staff_read" on customer_phases for select to authenticated
  using (get_my_role() in ('admin','super_admin','pm','developer','hr'));
create policy "customer_phases_staff_write" on customer_phases for all to authenticated
  using (get_my_role() in ('admin','super_admin','pm'))
  with check (get_my_role() in ('admin','super_admin','pm'));

create policy "customer_deliverables_staff_read" on customer_deliverables for select to authenticated
  using (get_my_role() in ('admin','super_admin','pm','developer','hr'));
create policy "customer_deliverables_staff_write" on customer_deliverables for all to authenticated
  using (get_my_role() in ('admin','super_admin','pm'))
  with check (get_my_role() in ('admin','super_admin','pm'));

create policy "programme_notifications_staff_read" on programme_notifications for select to authenticated
  using (get_my_role() in ('admin','super_admin','pm','developer','hr'));
-- No client-facing write policy — the reminders cron route writes via adminClient (service role),
-- matching CLAUDE.md's documented exception for server-only, session-less write paths.

-- Daily reminders cron — same pg_cron/pg_net mechanism as migration 012's daily digest.
-- URL/secret are placeholders; update post-deploy via cron.alter_job(), exactly as migration 012 documents.
select cron.schedule(
  'daily-programme-reminders',
  '0 9 * * *',
  $job$
  select net.http_post(
    url     := 'https://REPLACE_WITH_APP_URL/api/programme/reminders',
    body    := '{}'::jsonb,
    headers := '{"x-digest-secret":"REPLACE_WITH_DIGEST_SECRET","content-type":"application/json"}'::jsonb
  )
  $job$
);
```

### Reminders cron logic sketch (`src/app/api/programme/reminders/route.ts`)

```ts
import { adminClient } from "@/lib/supabase/admin";
import { sendCliqNotification } from "@/lib/zoho/index";
import { PROGRAMME_PHASES, getCurrentProgrammeDay, getPhaseForDay } from "@/config/customer-phases";

async function notifyOnce(customerId: string, key: string, message: string, channel: "pm" | "dev" = "pm") {
  const { error } = await adminClient
    .from("programme_notifications")
    .insert({ customer_id: customerId, notification_key: key }); // unique constraint = the dedupe guard
  if (error) return; // already sent (unique violation) or DB error — either way, don't double-send
  await sendCliqNotification(message, channel);
}

// For each customer with programme_started_at set and current day <= 120:
//   const day = getCurrentProgrammeDay(customer.programme_started_at);
//   const activePhase = getPhaseForDay(day); // calendar phase, independent of customer_phases.status
//
//   Phase-1-only deliverable due/overdue checks (join customer_deliverables where phase_number = 1):
//     diff = deliverable.due - day
//     if (0 < diff <= 5 && status !== 'done') notifyOnce(id, `due-${key}`, `Due in ${diff}d: ${name}`)
//     if (diff <= 0 && status !== 'done') notifyOnce(id, `overdue-${key}`, `Overdue: ${name}`)
//
//   Calendar-only checks (all phases, no deliverable-status dependency):
//     if (day === 16) notifyOnce(id, "day16-handover", `${company_name}: Phase 2 begins today.`, "pm")
//     if (day in [16, 21, 26]) notifyOnce(id, `dev5day-${day}`, `${company_name}: 5-day status check.`, "dev")
//     if (day === 15) notifyOnce(id, "gate15", `${company_name}: Day 15 client sign-off gate.`)
//     if (day === 30) notifyOnce(id, "gate30", `${company_name}: Day 30 client approval gate.`)
//     for each phase where day > phase.dayEnd and customer_phases[phase].status not in ('completed','skipped'):
//       notifyOnce(id, `phase-late-${phase.number}`, `${company_name}: Phase ${phase.number} running late.`)
```

### `client.tsx` insertion points (`NavSection` union + `navItems`, lines 22 and 766-774)

```ts
type NavSection = "company" | "contact" | "products" | "programme" | "assets" | "activity" | "projects" | "settings";
// ...
const navItems: { id: NavSection; label: string }[] = [
  { id: "company", label: "Company Info" },
  { id: "contact", label: "Primary Contact" },
  { id: "products", label: `Products (${totalProductCount})` },
  { id: "programme", label: "120-Day Programme" },
  { id: "assets", label: "Assets" },
  { id: "projects", label: `Projects (${projects.length})` },
  { id: "activity", label: `Activity (${classifications.length})` },
  { id: "settings", label: "Settings" },
];
// ...
{activeSection === "programme" && (
  <ProgrammeTab customer={customer} isDark={isDark} />
)}
```

### Realtime pattern to reuse (`_customers-index.tsx:96-104`, verbatim precedent)

```ts
useEffect(() => {
  const supabase = createClient();
  const channel = supabase
    .channel("v2_customers_products")
    .on("postgres_changes", { event: "UPDATE", schema: "public", table: "customer_products" }, (payload) => {
      const updated = payload.new as { id: string; completed_percentage: number };
      setProductOverrides((prev) => ({ ...prev, [updated.id]: updated.completed_percentage }));
    })
    .subscribe();
  return () => { supabase.removeChannel(channel); };
}, []);
```
Mirror this for a `customer_phases`/`customer_deliverables` channel in both `_programme-tab.tsx` (single customer) and `_customers-index.tsx` (list-wide, filtered client-side by `customer_id`).

### Phase color lookup — static map, not dynamic class construction (CLAUDE.md's existing rule)

The Figma's `PhaseConfig` carries raw hex (`color: "#2563EB"`). Replace with a static Tailwind lookup keyed by `phase_number`, e.g.:

```ts
const PHASE_STYLES: Record<number, { text: string; textDark: string; bg: string; bgDark: string; border: string }> = {
  1: { text: "text-blue-600", textDark: "text-blue-400", bg: "bg-blue-50", bgDark: "bg-blue-500/10", border: "border-blue-200" },
  2: { text: "text-violet-600", textDark: "text-violet-400", bg: "bg-violet-50", bgDark: "bg-violet-500/10", border: "border-violet-200" },
  3: { text: "text-teal-600", textDark: "text-teal-400", bg: "bg-teal-50", bgDark: "bg-teal-500/10", border: "border-teal-200" },
  4: { text: "text-amber-600", textDark: "text-amber-400", bg: "bg-amber-50", bgDark: "bg-amber-500/10", border: "border-amber-200" },
  5: { text: "text-slate-700", textDark: "text-slate-300", bg: "bg-slate-100", bgDark: "bg-slate-500/10", border: "border-slate-300" },
};
```

## Implementation Steps

1. Write and apply migration 059 (tables, columns, RLS, indexes, cron job placeholder).
2. Add `src/config/customer-phases.ts` (pure config + date-math helpers, no UI deps).
3. Update `src/types/database.ts` with the three new table types + the two altered tables' new columns.
4. Build the `GET/POST/PATCH` programme API routes (`start`, `phase`, `deliverables/[deliverableKey]`, `wizard-data`, and the read `route.ts`), all gated `admin|super_admin|pm` for writes, broader staff set for reads.
5. Extend the existing assets `POST` route with `phase_number` passthrough.
6. Build `_programme-tab.tsx`: empty state (Start button + Jump-to-phase), timeline bar, phase cards (expand/collapse, deliverable rows for all 5 phases — read-only for 2-5), reminders rail (client-computed), realtime subscription.
7. Build `_bert-wizard.tsx`: 5-step flow per the Code Context wizard shape, wired to the real API routes (not mock state) — Kickoff/Client Intel autosave via `wizard-data`, File Uploads via the real `customer_assets` upload flow, Deliverables via the deliverable-status route, Sign-off triggers the phase-1-complete transition + Cliq notify.
8. Wire `client.tsx`: add `"programme"` to `NavSection`, the nav item, and the render branch.
9. Extend `programme/reminders/route.ts` per the cron sketch; build `daily-programme-reminders` pg_cron job (already in migration 059 — confirm the placeholder URL/secret get documented for post-deploy `cron.alter_job()`, matching migration 012's pattern exactly).
10. Extend the v2 Customers list (`page.tsx` lookup-map query + `_customers-index.tsx` badge rendering + realtime subscription).
11. Add the "UI Polish Conventions" section to root `CLAUDE.md` per the reconciliation above.
12. `npx tsc --noEmit` and `pnpm lint`.
13. Manual verification per Acceptance Criteria.

## Acceptance Criteria

- [ ] Migration 059 applies cleanly against the live schema; new tables/columns exist; RLS policies enforce staff-only read, `admin|super_admin|pm`-only write.
- [ ] A customer profile with no `programme_started_at` shows an empty/CTA Programme tab ("Start 120-Day Programme" + "Jump to phase").
- [ ] Clicking "Start" sets Day 1, seeds all 5 phase rows + 27 deliverable rows, phase 1 shows `active`, timeline bar renders correctly with today's marker at Day 1.
- [ ] "Jump to phase" correctly marks skipped phases `skipped`, target phase `active` with `is_manual_override = true`, and the timeline reflects it immediately.
- [ ] Launching Bert's wizard, completing all 5 steps (including at least one real file upload that appears in both the wizard and the Assets tab afterward, tagged Phase 1), and hitting "Complete Phase 1 & notify PM" flips phase 1 → `completed`, phase 2 → `active`, and produces a Cliq PM-channel message (verify via `ZOHO_CLIQ_WEBHOOK_URL` test channel or by checking `programme_notifications` isn't involved here — sign-off notification isn't cron-deduped, it's a direct explicit-action send).
- [ ] Reminders rail on the Programme tab correctly shows "due in N days" / "overdue" entries for Phase 1 deliverables based on elapsed day, with no entries for Phase 2–5 deliverables regardless of elapsed day.
- [ ] `POST /api/programme/reminders` (curled directly with the `x-digest-secret` header, since pg_cron can't reach localhost) sends the expected Cliq messages for a test customer at various simulated days, and calling it twice in a row does not double-send (dedup via `programme_notifications`).
- [ ] v2 Customers list shows a "Day N / 120 · Phase X" badge for any customer with `programme_started_at` set, and stays blank for customers who haven't started.
- [ ] Realtime: updating a `customer_deliverables` row directly (e.g. via Supabase dashboard) while the Programme tab is open updates the UI without a manual refresh.
- [ ] Root `CLAUDE.md`'s new UI Polish Conventions section does not contradict any existing documented convention (spot-check against the `isDark`/pill-badge/plain-`useState`-form facts established during research).
- [ ] `npx tsc --noEmit` and `pnpm lint` pass with no new errors.

## Verification

```bash
npx tsc --noEmit
pnpm lint
pnpm dev
# Manual, localhost:3000/v2/customers/<a real customer_id>:
#   - Empty Programme tab -> Start -> timeline renders at Day 1
#   - Jump to phase -> confirm skip/active/override state
#   - Launch Bert's wizard end to end, including a real file upload
#   - Complete Phase 1 -> confirm Phase 2 activates + Cliq PM message
#   - Toggle a Phase 1 deliverable status from the timeline (not just the wizard) -> confirm it syncs
# Reminders cron (can't reach localhost from pg_cron, so test directly):
curl -X POST http://localhost:3000/api/programme/reminders \
  -H "x-digest-secret: $DIGEST_SECRET" -H "content-type: application/json" -d '{}'
# run twice back-to-back -> second run should send nothing new (check programme_notifications row count)
```

## Compatibility Touchpoints

- New migration (059) must run before any programme API route is hit — no backfill needed since `programme_started_at` defaults to `null` for all existing customers (feature is opt-in per customer via the Start button).
- pg_cron job URL/secret are placeholders in the migration, same as migration 012 — needs a post-deploy `cron.alter_job()` call (documented in the migration's header comment) with the real Vercel URL and `DIGEST_SECRET` value. No new env var introduced — reuses the existing `DIGEST_SECRET`.
- `src/types/database.ts` is hand-maintained in this repo; must be updated in the same PR as the migration or `tsc` will fail on the new Supabase queries.

## Implementation Notes

### What Changed
- Migration 059 (applied to the live `App - Central Hub` Supabase project via `supabase db push --linked`): `customers.programme_started_at`, new `customer_phases`/`customer_deliverables`/`programme_notifications` tables with RLS, `customer_assets.phase_number`, and the `daily-programme-reminders` pg_cron job (placeholder URL/secret, per migration 012's established pattern).
- `src/config/customer-phases.ts` — static `PROGRAMME_PHASES` config (5 phases, 27 deliverables total) ported verbatim from the QBR doc, plus `getCurrentProgrammeDay`/`getPhaseForDay`/`getPhaseByNumber`/`getDeliverable` pure helpers.
- 6 new API routes under `/api/customers/[customerId]/programme/*` (`route.ts` GET, `start`, `phase`, `deliverables/[deliverableKey]`, `wizard-data`, `complete-phase`) plus `/api/programme/reminders` (cron target, paginated per CLAUDE.md's `.range()` convention, dedup logging via `programme_notifications`).
- `_programme-tab.tsx` and `_bert-wizard.tsx` — new sibling files under the customer profile route (matching this codebase's `_xxx.tsx` page-scoped-component convention), wired into `client.tsx` as a new `"programme"` `NavSection`.
- v2 Customers list (`page.tsx` + `_customers-index.tsx`) — added a "Day N/120 · Phase X" badge with its own realtime `customer_phases` subscription, reusing the existing `productOverrides` override-map pattern.
- Extended `assets/route.ts` (phase_number passthrough) and `assets/upload/route.ts` (added `text/html`/`text/markdown`/`text/plain` to the MIME allowlist — the spec explicitly requires Bert to upload HTML/MD files, which the existing allowlist didn't support at all).
- Added a "UI Polish Conventions" section to root `CLAUDE.md`, reconciling `_design/CLAUDE (1).md` against this codebase's actual shipped patterns (see the task doc's own "Design guide reconciliation" section above for what was adopted vs. rejected and why).

### Files Changed
- `supabase/migrations/059_customer_programme_phases.sql` — new migration, applied live.
- `src/config/customer-phases.ts` — new.
- `src/types/database.ts` — added `customer_phases`/`customer_deliverables`/`programme_notifications` types, `programme_started_at` on `customers`, `phase_number` on `customer_assets`.
- `src/app/api/customers/[customerId]/programme/route.ts`, `start/route.ts`, `phase/route.ts`, `deliverables/[deliverableKey]/route.ts`, `wizard-data/route.ts`, `complete-phase/route.ts` — new.
- `src/app/api/programme/reminders/route.ts` — new.
- `src/app/api/customers/[customerId]/assets/route.ts` — `phase_number` passthrough on POST.
- `src/app/api/customers/[customerId]/assets/upload/route.ts` — MIME allowlist extended (HTML/MD/plain text); error message text updated to match.
- `src/app/v2/(hub)/customers/[customerId]/_programme-tab.tsx`, `_bert-wizard.tsx` — new.
- `src/app/v2/(hub)/customers/[customerId]/client.tsx` — `"programme"` NavSection, nav item, render branch, import; also updated the Assets tab's file-type helper text for the new MIME types.
- `src/app/v2/(hub)/customers/page.tsx` — `programme_started_at` + active-phase lookup query.
- `src/app/v2/(hub)/customers/_customers-index.tsx` — `ProgrammeBadge` component, `customer_phases` realtime subscription, type additions.
- `CLAUDE.md` — new "UI Polish Conventions" section.

### Deviations From Plan
- **Added `complete-phase/route.ts`** — not in the original Proposed File Changes table. The plan's Requirements explicitly called for the wizard's Sign-off action to mark Phase 1 `completed` (not `skipped`) and Phase 2 `active` in one explicit, always-notify action, distinct semantically from the manual "Jump to phase" override (which marks skipped phases `skipped`). Folding this into the `phase` route would have conflated two different operations with different audit semantics; a small dedicated route was cleaner.
- **Extended `assets/upload/route.ts`'s MIME allowlist** — not in the original file list. Discovered while building the wizard's File Uploads step: the spec explicitly requires "HTML files, MD files," but the existing allowlist (images/PDF/Word/Excel only) rejected them outright. Small, additive, backward-compatible fix.
- **`programme/phase` route's "Other — custom phase" handling** — simplified from the spec's implied free-standing 6th option to: pick one of the 5 real phases + an optional free-text `note` stored on that phase's `override_note`. A true phase-less "Other" state would have broken the "exactly one phase is ever active" invariant everything else (reminders, badges, wizard gating) depends on, for a case the authoritative QBR doc doesn't even mention (only the superseded, informal feature-list doc does).
- **Bug found and fixed during browser verification, not in the original plan**: `buildReminders()` (client) and the reminders cron route both determined "current phase" from the raw elapsed calendar day (`getPhaseForDay(day)`) when deciding which deliverables' due dates to check — not from the phase actually marked `active` in the DB. Since a phase can be handed over early (Phase 1 completed on Day 1, well before Day 15), this caused the Reminders rail to keep showing "Due in N days: Outcome target" for a phase that had already been completed and handed off. Fixed in both places: the UI now resolves the phase via `phaseStatus` (whichever row is `active`), and the cron route now skips its Phase-1-deliverable due/overdue block entirely once `customer_phases[1].status` is `completed` or `skipped`.

### Verification Run
- `npx tsc --noEmit` — PASS (0 errors in any file this task touched; 2 pre-existing errors remain in untouched `_design/customers/*.tsx` reference files, unrelated to this task).
- `pnpm lint` — PASS (0 errors). Fixed 2 real `react-hooks/set-state-in-effect` violations along the way: `_programme-tab.tsx`'s mount fetch was rewritten as an inlined `.then()` chain (not a named async function call) matching the exact precedent already established in `dashboard/users/page.tsx`; `_bert-wizard.tsx`'s auto-mark-kickoff-done logic was moved out of a `useEffect` entirely into the date/attendee input's own event handlers, since it's a reaction to a specific user edit, not derived state. Also fixed 3 `react/no-unescaped-entities` errors (apostrophes → `&apos;`).
- Migration 059 — applied live via `supabase db push --linked` against the `App - Central Hub` Supabase project (`tgjpkyiywktjktbsxcyr`); independently re-verified via `supabase db query` that all 3 new tables, both new columns, and the `daily-programme-reminders` cron job exist post-migration.
- Browser verification (Chrome, `localhost:3000`, real logged-in Super Admin session) against the live app using **AGL Co / WRQ-CUST-3691** — this codebase's established test customer across multiple prior tasks' Verification sections (119/120), so no cleanup was performed afterward, consistent with that precedent:
  - Empty "120-Day Programme not started" state with Start/Jump-to-phase controls — confirmed.
  - Toggled "Kickoff meeting" directly from the timeline (not the wizard): pending → in_progress → done, `0/7` → `1/7`, and the matching "Overdue: Kickoff meeting" reminder correctly disappeared from the rail — confirmed, and independently re-verified against the live DB.
  - Launched Bert's wizard: all 5 steps (Kickoff, Client Intel, File Uploads, Deliverables, Sign-off) render correctly; step indicator, "N/7 complete" badge, and deliverable status (read from the *real* shared state, not a wizard-local copy) all correct.
  - Cycled "Outcome target" from pending → in_progress inside the wizard's Deliverables step — confirmed synced.
  - Clicked "Complete Phase 1 & notify PM": success screen rendered correctly; independently re-verified against the live DB that `customer_phases` now shows phase 1 `completed` (with `actual_completed_date`) and phase 2 `active` (with `actual_start_date`), both dated today.
  - Returned to the timeline: Phase 1 card now shows "Completed," Phase 2 shows "Active," header updates to "Phase 2: Migrate & Rebrand · Owner: PM + Dev" — confirmed. This is where the reminders bug above was caught and fixed.
  - v2 Customers list, searched "AGL": row now shows "Day 1/120 · Phase 2" badge under the company name — confirmed.
  - **Not completed**: a live file upload through the wizard's File Uploads step — the `file_upload` browser-automation tool in this environment rejected filesystem paths ("must pass file contents via the `files` parameter," not exposed in the available tool schema). Verified instead via code review: the upload flow is byte-for-byte the same two-call sequence (`POST .../assets/upload` then `POST .../assets`) already proven working by task 118, with only the `label`/`phase_number` values changed.
  - **Not completed**: triggering `/api/programme/reminders` with the real cron secret — `DIGEST_SECRET` lives in `.env.local`, which per CLAUDE.md is never read/exposed. Confirmed instead that the route correctly 401s with no/wrong secret and no session, and re-verified the due/overdue skip-logic fix by exercising the identical computation path in the browser (the UI bug above and the cron route's parallel bug share the same root cause and the same fix shape).
