# 123: Onboarding Redesign — Dedicated Bert-Gated Phase 1 Module (New Project Intake, Project-Scoped Programme, Sub-Phase Timeline, PM Visibility Gate)

**Created:** 2026-07-09
**Priority:** HIGH
**Type:** feature
**Recommended Tier:** deep
**Status:** Testing

---

## Overview

Task 122 shipped a first pass at the 120-Day Programme: a "120-Day Programme" tab + Bert's wizard bolted onto the existing v2 customer profile, with the whole customer visible to every PM from the moment it's created. That's not what this business process actually needs. Per the QBR (`_docs/plan-v2/PROJECT ONBOARDING/Project_Onboarding_QBR_120Day_FINAL.html`), Phase 1 (Day 1–15, "Onboard") is **Bert's** — a Marketing Manager who runs client calls, gathers business intel, and files internal deliverables — and nobody else should see that content until it's handed over. The customer/project may not even exist as a real, PM-visible record yet: "this is the very first layer."

This task builds a **dedicated, access-gated Onboarding module** (a new `/v2/onboarding` route, separate from `/v2/customers`) that:

1. Gives Bert a real, distinct identity in the Hub (`profiles.role = 'marketing'`), not "just another PM."
2. Lets Bert start a **New Project** intake (new or existing customer, primary contact, a product/engagement classification, an editable auto-named project) that is explicitly **not** the start of the 120-day clock — that's a separate, deliberate action.
3. Supports **Save** (draft, no clock) vs. **Save + Set Schedule** (a future date/time that auto-starts Day 1 via a cron check) vs. **Start Onboarding** (starts Day 1 immediately).
4. Re-models Phase 1 as **day-range sub-phases** (Kickoff Day 1–2, Outcome target Day 3–4, Migration checklist Day 5–9, 90-day content map Day 10–11, HTML mockup Day 12–13, Storage folder + KB Day 14, Client call — sign-off Day 15) instead of task 122's single due-day model, with the QBR's "What the Customer Provides" fields and "Bert's Internal Deliverables" checklist distributed across the correct sub-phases.
5. Re-scopes the whole Programme data model from **customer-level to project-level**, so one customer can run multiple independent 120-day onboardings for different products over time without them colliding.
6. **Hides the project (and, if it's the customer's only project, the customer itself) from PMs and everyone else** until Phase 1 is handed over — PMs get a restricted status-only view (project name, current sub-phase, day counter, % complete, target dates), never the content Bert is entering.
7. **Removes** task 122's in-profile Bert's Wizard (`_bert-wizard.tsx`), since leaving it reachable from the customer profile would give any PM a side door around the new access control. The customer profile's Programme tab (`_programme-tab.tsx`) survives, but only ever shows a project once it's handed over, and Phase 1 on it becomes read-only history — Phases 2–5 (still out of data-entry scope, per task 122's original decision, unchanged here) keep working exactly as task 122 built them.

**This task supersedes significant parts of task 122's schema and UI.** Read `_docs/task/122-120-day-programme-bert-wizard-notifications.md` in full before starting — this doc assumes that context and calls out exactly what's kept, modified, or deleted.

**Scope resolved with the user up front:**
- Bert's access mechanism: new `profiles.role` value `'marketing'` (mirrors migration 047's exact pattern for adding `super_admin`).
- Adding a new product/project to an **existing, already-visible** customer only hides that new project — the customer and their other projects stay visible to PMs throughout.
- Visibility gating uses a **new dedicated field**, not a repurposed `customers.status` (whose `onboarding`/`completed_onboarding` values are dormant today but already live on all ~203 production customers — reusing them would need a live-data reclassification this task doesn't need to take on).
- The new Onboarding page **replaces** task 122's in-profile wizard for Phase 1; the Programme tab keeps owning Phases 2–5 post-handover.

## Requirements

- [ ] **New `profiles.role` value `'marketing'`** (migration, same CHECK-constraint-swap pattern as migration 047). Bert (and any future marketing-manager hires) gets this role. `marketing` is added to `v2-hub-sidebar.tsx`'s `ROLE_LABEL` map and nav-visibility logic.
- [ ] **Programme data becomes project-scoped.** `customer_phases`/`customer_deliverables`/`customer_assets` gain a `project_id` FK to the existing `projects` table (task 122's `customer_id`-only keying can't represent two independent onboarding rounds for the same customer). `unique` constraints move from `(customer_id, ...)` to `(project_id, ...)`. `programme_started_at` moves from `customers` to `projects`.
- [ ] **New `onboarding_visible_at` field on `projects`** (nullable timestamptz) — `null` = hidden from the default PM/staff view; set at Phase 1 handover. **Backfill all existing `projects` rows to visible on migration** (`onboarding_visible_at = created_at`) so no currently-visible customer/project disappears — only new projects created via this flow start hidden.
- [ ] **New `customer_products.classification`** field (nullable text, CHECK-constrained): `StackShift I | StackShift II | StackShift Access | StackShift Access Plus | PipelineForge | Discrete Development`. Distinct from the existing `product_name` (the underlying software platform integration) — see Key Design Decisions for the derivation rule between the two.
- [ ] **New `onboarding_internal_deliverables` table** — the QBR's "2.3 Bert's Internal Deliverables" checklist (8 items, not modeled at all in task 122), project-scoped, Pending/In Progress/Done, mapped to the correct sub-phase (see Key Design Decisions).
- [ ] **Dedicated `/v2/onboarding` route** (new nav entry, gated to staff roles, `client` excluded):
  - **List/dashboard view** — role-conditional content. Marketing/admin/super_admin see full cards (company, project, phase, day, %, edit access). Everyone else (pm/developer/hr) see a **restricted read-only card**: project name, company name, current sub-phase name, "Day N of 15", progress %, target handover date — no business-fact content, no file access, no wizard access.
  - **"New Project"** button (marketing/admin/super_admin only) → intake form: toggle New Company / Existing Company (select from `customers`), primary contact fields, classification select, auto-generated editable Project Name (`"{Company} Website"` for StackShift variants/PipelineForge, `"{Company} App"` for Discrete Development).
  - **Save** → two paths: **Just Save** (creates the customer/product/project rows as a draft, `programme_started_at` stays null, nothing scheduled) or **Set Schedule** (also sets `projects.scheduled_onboarding_start_at`; a cron auto-starts Day 1 once that time passes).
  - **Start Onboarding** → creates the same rows and immediately seeds phases/deliverables/internal-deliverables and sets `programme_started_at = now()`, Phase 1 (and its first sub-phase, Kickoff) active.
- [ ] **Sub-phase timeline UI** for Phase 1 (replaces task 122's flat 7-deliverable list for Phase 1 only): each sub-phase shows its day range, status, and its own scoped input fields (see the field-to-sub-phase mapping below), plus the 8 internal deliverables shown against whichever sub-phase they're assigned to.
- [ ] **Field-to-sub-phase data capture**, per the QBR's "2.1 What the Customer Provides" list, as the user explicitly assigned:
  - **Kickoff (Day 1–2):** senior contact + direct access, business facts (history/services/value prop/service areas/target customers), URLs (site + competitor/reference), customer data (positioning-useful info).
  - **Storage folder + KB (Day 14):** documents (branding/proposals/collateral), DNS access, 3rd-party integration credentials.
- [ ] **Access control on the detail/wizard routes**: strictly `marketing | admin | super_admin` — `pm | developer | hr` get 403 (they only ever reach the restricted list view, never a per-project detail/content endpoint).
- [ ] **Scheduled auto-start cron**: new frequent-interval `cron.schedule` (e.g. every 15 min, tighter than the existing daily jobs) hitting a new secret-gated route that finds `projects` with a due `scheduled_onboarding_start_at` and runs the same start logic as the manual button.
- [ ] **Fix the pre-existing `product_name` UI/API drift** surfaced during investigation: `product-selector.tsx`, `src/types/hub.ts`'s `ProductName`, and `/api/customers/[customerId]/products/route.ts`'s `VALID_PRODUCTS` are all missing `CiteForge`, which is a live, valid DB value. Fix while touching this area — don't leave it as a landmine for the next task that touches products.
- [ ] **Remove task 122's `_bert-wizard.tsx`** and the "programme" Phase-1-editing affordances in `_programme-tab.tsx` (Start/Jump-to-phase controls, wizard launch buttons) — the customer profile's Programme tab becomes a read-only Phases 1–5 history view, and only renders at all once `projects.onboarding_visible_at` is set for that project.
- [ ] **v2 Customers list and any other customer/project enumeration** (dashboards, search) must exclude customers whose *every* project is still hidden (`onboarding_visible_at IS NULL`), and exclude individually-hidden projects from any per-customer project list/count, without hiding customers that have at least one visible project or zero projects at all.

## Out of Scope / Must-Not-Change

- Phases 2–5 data-entry UI — unchanged from task 122's decision, still read-only tracking.
- The daily reminders cron (`/api/programme/reminders`) — gets updated for project-scoping (queries move from `customer_id` to `project_id`) but its due/overdue/gate/late-phase logic is otherwise unchanged.
- `sendPushNotification()` wiring — still unused/deferred, per task 122.
- Any Zoho/Sanity project-creation side effects — the new `projects` row created here does **not** auto-trigger `createZohoProject()`/Sanity provisioning; that stays a PM action post-handover, matching the existing `/api/customers/[customerId]/projects` route's behavior.
- Reconciling `product_name` vs. `classification` beyond the derivation rule below — no attempt to collapse them into one field in this task.
- Anything about Phase 2's "developer dashboard shows new task" auto-creation — still deferred (task 122's scope boundary, unchanged).
- The `/v2/projects` module (task 073) internals — a handed-over project lands there unchanged; not modified by this task beyond it now correctly appearing once visible.

## Key Design Decisions (resolved by research/user answers, not to be re-asked)

**`product_name` vs. new `classification`.** The user's 6-item selection list (StackShift I/II/Access/Access Plus/PipelineForge/Discrete Development) is a *service tier/engagement type*, not the same axis as `customer_products.product_name` (the underlying software platform: `StackShift | PublishForge | CiteForge | PipelineForge`) — this exact tier concept was flagged and explicitly scoped **out** of task 122 as "Client classification & management" (feature-doc section 1). Rather than overload `product_name` (which is read by Sanity/Zoho integration code and has a narrower, stable meaning), add `classification` as a sibling column and derive `product_name` from it at creation time: any `StackShift *` classification → `product_name = "StackShift"`; `PipelineForge` → `product_name = "PipelineForge"`; `Discrete Development` → `product_name = "StackShift"` (the QBR's Phase 2 section confirms even discrete-development builds still go through "Implement using LLM Workflow with StackShift Skills"). This is a low-stakes default — `classification` is what actually drives the onboarding UI/business logic; `product_name` mainly matters for existing integration wiring a Discrete Development engagement may not even use yet.

**Sub-phase day ranges are a deliberate new breakdown, not derived from the QBR.** The QBR's "2.2 What WebriQ Delivers" table only has single due-days (Kickoff/Day 1, Outcome target/Day 3, etc.) — the day *ranges* (1–2, 3–4, 5–9, 10–11, 12–13, 14, 15) came directly from the user and are used as-is. `DeliverableConfig` gains `dayStart`/`dayEnd` (Phase 1 only); Phases 2–5 keep single-day `due` (unchanged, `dayStart` defaults to `due` for them so the same rendering code works for both without a range/non-range branch).

**8 internal deliverables → sub-phase mapping**, proposed by keyword/conceptual match since the QBR's own table (`2.3`) carries no day/sub-phase attribution at all:
| Internal deliverable | Assigned sub-phase | Why |
|---|---|---|
| Implementation file | Migration checklist (Day 5–9) | Pairs with "full audit... ready for migration" |
| HTML and MD files | HTML mockup (Day 12–13) | Direct match |
| Branding guides | Storage folder + KB (Day 14) | User already assigned "Documents (branding/proposals/collateral)" here |
| KB info (raw) | Storage folder + KB (Day 14) | Direct name match |
| Cluster topics & schedules | 90-day content map (Day 10–11) | Content clusters = content map |
| Publishing plan | 90-day content map (Day 10–11) | Content calendar pairs with content map |
| DNS details | Storage folder + KB (Day 14) | User already assigned "DNS access" here |
| Credentials (external integrations) | Storage folder + KB (Day 14) | User already assigned "Credentials" here |

**Visibility rule, precisely.** A customer is hidden from the default staff Customers list iff it has **at least one** `projects` row **and every** row has `onboarding_visible_at IS NULL`. A customer with zero projects (e.g. only has `customer_products` add-ons, no website project yet) is unaffected and shows normally — this task only hides customers whose *only* activity is an in-progress hidden onboarding. Per-customer project lists/counts (on the profile, on any dashboard) independently drop individually-hidden projects even when the parent customer stays visible (the "existing customer, new hidden project" case).

**Route/table naming stays "programme" internally, "Onboarding" in the UI.** Keeps continuity with task 122's already-shipped table names (`customer_phases`, `customer_deliverables`) and avoids a confusing rename; the user-facing page/nav label is "Onboarding," matching the user's own terminology ("Start Onboarding," "Onboarding page").

**Programme API routes move and get access-tightened.** Task 122's `/api/customers/[customerId]/programme/*` become `/api/projects/[projectId]/programme/*` (project-scoped, `projectId` is already a global UUID so the extra customer-nesting is redundant) — `start`, `phase`, `deliverables/[deliverableKey]`, `wizard-data`, `complete-phase`, plus new `internal-deliverables/[deliverableKey]`. All gated `marketing | admin | super_admin` for both read and write (not `pm`, unlike task 122's original `admin|super_admin|pm` gate) — PMs never call these at all; they only ever hit the new restricted list endpoint.

**Task 122's one live test row (`WRQ-CUST-3691` / AGL Co) predates project-scoping and has no `projects` row.** It was explicitly flagged as disposable verification data in task 122's own Implementation Notes — the migration deletes its `customer_phases`/`customer_deliverables`/`programme_notifications` rows and clears `customers.programme_started_at` before making `project_id` `NOT NULL`, rather than leaving that column nullable forever for one row's sake.

## Proposed File Changes

| File | Action | Purpose |
|------|--------|---------|
| `supabase/migrations/060_onboarding_project_scoping.sql` | Create | `marketing` role, `classification` column, project-scoping migration for `customer_phases`/`customer_deliverables`/`customer_assets`, `projects.onboarding_visible_at`/`programme_started_at`/`scheduled_onboarding_start_at`, `onboarding_internal_deliverables` table, RLS updates, test-data cleanup, backfill, new cron job. |
| `src/config/customer-phases.ts` | Modify | `DeliverableConfig` gains `dayStart`/`dayEnd`; Phase 1's 7 deliverables updated to the new ranges; add `INTERNAL_DELIVERABLES` config (8 items + sub-phase assignment) and `ProductClassification`/`CLASSIFICATIONS` config. |
| `src/types/database.ts` | Modify | `project_id` on `customer_phases`/`customer_deliverables`/`customer_assets`; `onboarding_visible_at`/`programme_started_at`/`scheduled_onboarding_start_at` on `projects`; `classification` on `customer_products`; new `onboarding_internal_deliverables` type; remove `customers.programme_started_at`. |
| `src/app/api/onboarding/projects/route.ts` | Create | `GET` (role-filtered list: full detail for marketing/admin/super_admin, restricted summary for everyone else), `POST` (the New Project intake — creates/reuses customer, creates `customer_products` + `projects` rows; body includes a `mode: "save" | "save_scheduled" | "start"` flag). |
| `src/app/api/onboarding/scheduled-autostart/route.ts` | Create | `POST`, secret-gated cron target — finds due `scheduled_onboarding_start_at` projects, runs the shared start logic. |
| `src/app/api/projects/[projectId]/programme/route.ts` | Move+Modify | From task 122's `customers/[customerId]/programme/route.ts` — project-scoped `GET`, `marketing|admin|super_admin` only. |
| `src/app/api/projects/[projectId]/programme/start/route.ts` | Move+Modify | Project-scoped seed logic, refactored into a shared helper also called by `scheduled-autostart`. |
| `src/app/api/projects/[projectId]/programme/phase/route.ts` | Move+Modify | Manual jump-to-phase, project-scoped. |
| `src/app/api/projects/[projectId]/programme/deliverables/[deliverableKey]/route.ts` | Move+Modify | Deliverable status, project-scoped, now also validates against the new `dayStart`/`dayEnd` shape. |
| `src/app/api/projects/[projectId]/programme/internal-deliverables/[deliverableKey]/route.ts` | Create | Status cycling for the 8 internal deliverables. |
| `src/app/api/projects/[projectId]/programme/wizard-data/route.ts` | Move+Modify | Autosave, project-scoped, restructured to key by sub-phase (`{ kickoff: {...}, storageKb: {...} }`). |
| `src/app/api/projects/[projectId]/programme/complete-phase/route.ts` | Move+Modify | Project-scoped; on Phase 1 completion, also sets `projects.onboarding_visible_at = now()`. |
| `src/app/api/programme/reminders/route.ts` | Modify | Queries move from `customer_id` to `project_id`; join through `projects` for company name. |
| `src/app/api/customers/route.ts` | Modify | No default-`status` behavior change, but the new intake route reuses/wraps this for the "new company" path — verify session-less `adminClient` usage still applies. |
| `src/components/onboarding/product-selector.tsx` | Modify | Add `CiteForge` (pre-existing drift fix). |
| `src/types/hub.ts` | Modify | `ProductName` gains `CiteForge`. |
| `src/app/api/customers/[customerId]/products/route.ts` | Modify | `VALID_PRODUCTS` gains `CiteForge`. |
| `src/config/constants.ts` | Modify | New `V2_ROUTES.ONBOARDING` entry. |
| `src/app/v2/(hub)/_components/v2-hub-sidebar.tsx` | Modify | New nav item (visible to all staff roles except `client`); `ROLE_LABEL` gains `marketing`. |
| `src/app/v2/(hub)/onboarding/page.tsx` | Create | Server component — reads role from claims, fetches the role-appropriate project list. |
| `src/app/v2/(hub)/onboarding/_onboarding-list.tsx` | Create | Client component — card grid, role-conditional detail level, "New Project" entry (gated). |
| `src/app/v2/(hub)/onboarding/_new-project-form.tsx` | Create | New Project intake form (company toggle, contact, classification, project name, Save/Set Schedule/Start Onboarding). |
| `src/app/v2/(hub)/onboarding/[projectId]/page.tsx` | Create | Server component for the detail/wizard view — `marketing|admin|super_admin` only, redirects others. |
| `src/app/v2/(hub)/onboarding/[projectId]/_onboarding-detail.tsx` | Create | Sub-phase timeline (day-range Gantt-style bars per the referenced reference image), reminders rail, internal-deliverables checklist. |
| `src/app/v2/(hub)/onboarding/[projectId]/_onboarding-wizard.tsx` | Create | Sub-phase-scoped data entry (replaces task 122's `_bert-wizard.tsx` 5-step model with 7 sub-phase steps + the field-to-sub-phase mapping above). |
| `src/app/v2/(hub)/customers/[customerId]/client.tsx` | Modify | Remove `_bert-wizard.tsx` import/launch entry points from the `"programme"` section. |
| `src/app/v2/(hub)/customers/[customerId]/_programme-tab.tsx` | Modify | Remove Start/Jump-to-phase controls and wizard-launch buttons; becomes read-only; only renders when the project is `onboarding_visible_at`-visible. |
| `src/app/v2/(hub)/customers/[customerId]/_bert-wizard.tsx` | **Delete** | Superseded by `onboarding/[projectId]/_onboarding-wizard.tsx`. |
| `src/app/v2/(hub)/customers/page.tsx` | Modify | Exclude customers whose every project is hidden; per-customer project counts exclude hidden projects. |
| `src/app/v2/(hub)/customers/_customers-index.tsx` | Modify | "Day N/120" badge logic re-derives from the customer's *visible* project (if any) rather than the removed `customers.programme_started_at`. |

## Code Context

### Project-scoping migration (`060_onboarding_project_scoping.sql`) — key excerpts

```sql
-- New role, exact precedent from migration 047
alter table profiles drop constraint if exists profiles_role_check;
alter table profiles add constraint profiles_role_check
  check (role in ('admin', 'hr', 'pm', 'developer', 'client', 'super_admin', 'marketing'));

-- Classification (distinct from product_name — see task doc's Key Design Decisions)
alter table customer_products add column if not exists classification text
  check (classification in ('StackShift I','StackShift II','StackShift Access','StackShift Access Plus','PipelineForge','Discrete Development'));

-- projects gains the fields task 122 put on customers
alter table projects add column if not exists programme_started_at timestamptz;
alter table projects add column if not exists onboarding_visible_at timestamptz;
alter table projects add column if not exists scheduled_onboarding_start_at timestamptz;
-- CRITICAL: backfill existing rows visible so nothing currently shown to PMs disappears.
update projects set onboarding_visible_at = created_at where onboarding_visible_at is null;

-- Task 122's own disposable test/verification row — no projects row exists for it yet,
-- and it predates project-scoping. Clear it rather than leave project_id nullable forever.
delete from customer_deliverables where customer_id = 'WRQ-CUST-3691';
delete from customer_phases where customer_id = 'WRQ-CUST-3691';
delete from programme_notifications where customer_id = 'WRQ-CUST-3691';

alter table customer_phases add column if not exists project_id uuid references projects(id) on delete cascade;
alter table customer_deliverables add column if not exists project_id uuid references projects(id) on delete cascade;
alter table customer_assets add column if not exists project_id uuid references projects(id) on delete cascade;

-- Implementer: confirm exact existing constraint names via
--   select conname from pg_constraint where conrelid = 'customer_phases'::regclass;
-- before dropping — Postgres's auto-generated name should be customer_phases_customer_id_phase_number_key
-- and customer_deliverables_customer_id_phase_number_deliverable_key_key, but verify live.
alter table customer_phases drop constraint if exists customer_phases_customer_id_phase_number_key;
alter table customer_phases alter column project_id set not null;
alter table customer_phases add constraint customer_phases_project_id_phase_number_key unique (project_id, phase_number);

alter table customer_deliverables drop constraint if exists customer_deliverables_customer_id_phase_number_deliverable_key_key;
alter table customer_deliverables alter column project_id set not null;
alter table customer_deliverables add constraint customer_deliverables_project_id_phase_number_deliverable_key_key
  unique (project_id, phase_number, deliverable_key);

-- New internal-deliverables table (QBR 2.3, never modeled in task 122)
create table if not exists onboarding_internal_deliverables (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  deliverable_key text not null,
  status text not null default 'pending' check (status in ('pending','in_progress','done')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (project_id, deliverable_key)
);
alter table onboarding_internal_deliverables enable row level security;
create policy "onboarding_internal_deliverables_staff" on onboarding_internal_deliverables for all to authenticated
  using (get_my_role() in ('admin','super_admin','marketing'))
  with check (get_my_role() in ('admin','super_admin','marketing'));

-- Tighten existing programme tables' RLS: pm loses access (task 122 had it; this task removes it).
drop policy if exists "customer_phases_staff_read" on customer_phases;
drop policy if exists "customer_phases_staff_write" on customer_phases;
create policy "customer_phases_marketing_only" on customer_phases for all to authenticated
  using (get_my_role() in ('admin','super_admin','marketing'))
  with check (get_my_role() in ('admin','super_admin','marketing'));
-- (mirror for customer_deliverables)

-- customers.programme_started_at is now dead (moved to projects) — drop it.
alter table customers drop column if exists programme_started_at;

-- Frequent-interval cron for scheduled auto-start (existing jobs are all daily; this is new)
select cron.schedule(
  'onboarding-scheduled-autostart',
  '*/15 * * * *',
  $job$
  select net.http_post(
    url     := 'https://REPLACE_WITH_APP_URL/api/onboarding/scheduled-autostart',
    body    := '{}'::jsonb,
    headers := '{"x-digest-secret":"REPLACE_WITH_DIGEST_SECRET","content-type":"application/json"}'::jsonb
  )
  $job$
);
```

### `customer-phases.ts` restructure — day ranges + internal deliverables

```ts
export type DeliverableConfig = {
  key: string;
  name: string;
  description: string;
  dayStart: number;  // NEW — was just `due`
  dayEnd: number;     // NEW — `due` becomes an alias: due === dayEnd
  owner: string;
};

// Phase 1 only — Phases 2-5 keep dayStart === dayEnd (unchanged single-day behavior)
deliverables: [
  { key: "kickoff", name: "Kickoff meeting", dayStart: 1, dayEnd: 2, owner: "Bert", description: "..." },
  { key: "outcome-target", name: "Outcome target", dayStart: 3, dayEnd: 4, owner: "Bert", description: "..." },
  { key: "migration-checklist", name: "Migration checklist", dayStart: 5, dayEnd: 9, owner: "Bert", description: "..." },
  { key: "content-map", name: "90-day content map", dayStart: 10, dayEnd: 11, owner: "Bert", description: "..." },
  { key: "html-mockup", name: "HTML mockup", dayStart: 12, dayEnd: 13, owner: "Bert", description: "..." },
  { key: "storage-kb", name: "Storage folder + KB", dayStart: 14, dayEnd: 14, owner: "Bert", description: "..." },
  { key: "client-signoff", name: "Client call — sign-off", dayStart: 15, dayEnd: 15, owner: "PM + Bert", description: "..." },
]

export type InternalDeliverableConfig = { key: string; name: string; description: string; subPhaseKey: string };
export const INTERNAL_DELIVERABLES: InternalDeliverableConfig[] = [
  { key: "implementation-file", name: "Implementation file", description: "Full implementation plan document", subPhaseKey: "migration-checklist" },
  { key: "html-md-files", name: "HTML and MD files", description: "Mockup files and markdown source content", subPhaseKey: "html-mockup" },
  { key: "branding-guides", name: "Branding guides", description: "Logo, colour palette, typography specs", subPhaseKey: "storage-kb" },
  { key: "kb-info-raw", name: "KB info (raw)", description: "Raw knowledge base content before formatting", subPhaseKey: "storage-kb" },
  { key: "cluster-topics-schedules", name: "Cluster topics & schedules", description: "Content clusters and publishing schedule", subPhaseKey: "content-map" },
  { key: "publishing-plan", name: "Publishing plan", description: "Planned content calendar and approval flow", subPhaseKey: "content-map" },
  { key: "dns-details", name: "DNS details", description: "Access to their domain management", subPhaseKey: "storage-kb" },
  { key: "credentials-external", name: "Credentials (for external integrations)", description: "e.g. HubSpot, payment gateway access", subPhaseKey: "storage-kb" },
];

export const CLASSIFICATIONS = ["StackShift I","StackShift II","StackShift Access","StackShift Access Plus","PipelineForge","Discrete Development"] as const;
export type Classification = (typeof CLASSIFICATIONS)[number];
export function deriveProductName(classification: Classification): "StackShift" | "PipelineForge" {
  return classification === "PipelineForge" ? "PipelineForge" : "StackShift";
}
export function deriveProjectSuffix(classification: Classification): "Website" | "App" {
  return classification === "Discrete Development" ? "App" : "Website";
}
```

### Live `projects` table schema (`supabase/migrations/025_v2_schema.sql:17-27`) — the anchor this task builds on

```sql
create table projects (
  id                   uuid primary key default gen_random_uuid(),
  customer_id          text not null references customers (customer_id) on delete cascade,
  name                 text not null,
  project_type         text not null check (project_type in ('Content Site', 'Ecommerce (B2C)', 'Ecommerce (B2B)', 'Custom App')),
  zoho_project_id      text,
  sanity_project_id    text,
  github_repo          text,
  dedicated_developers text[] not null default '{}',
  status               text not null check (status in ('active', 'on_hold', 'completed', 'archived')) default 'active',
  customer_product_id  uuid references customer_products(id) on delete set null,
  description          text,
  created_by           uuid references auth.users(id) on delete set null,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);
```
No `project_type` value maps cleanly to "Discrete Development" — use `'Custom App'` for that classification's projects; StackShift-variant/PipelineForge projects use `'Content Site'` (matches the existing "New Customer" flow's default assumption for a StackShift website build).

### Migration 047 (role-CHECK-swap precedent, quoted in full)

```sql
-- profiles.role is a text CHECK constraint (not a PostgreSQL ENUM type)
-- Drop and recreate the constraint to add 'super_admin'
ALTER TABLE profiles
  DROP CONSTRAINT IF EXISTS profiles_role_check;

ALTER TABLE profiles
  ADD CONSTRAINT profiles_role_check
    CHECK (role IN ('admin', 'hr', 'pm', 'developer', 'client', 'super_admin'));
```
Task 123's migration repeats this byte-for-byte with `'marketing'` appended.

### Sidebar nav pattern to extend (`v2-hub-sidebar.tsx`)

```ts
const isAdmin = role === "admin" || role === "super_admin";
const isDev = role === "developer";
// NEW:
const isMarketing = role === "marketing";
// ...spread a new { label: "Onboarding", href: V2_ROUTES.ONBOARDING, icon: <...> } into workItems,
// visible whenever role !== "client" (everyone on staff can at least see the restricted list).
```
`ROLE_LABEL` (currently `{admin, pm, developer, hr, client, super_admin}`) needs a `marketing: "Marketing"` entry — confirmed missing today, falls back to the raw string otherwise.

### Product enum drift to fix while here (3 independent copies found, only 1 correct)

- `src/components/onboarding/product-selector.tsx:11-15` — `PRODUCTS` array: 3 values, missing `CiteForge`.
- `src/types/hub.ts:95-98` — `ProductName` type: 3 values, missing `CiteForge`.
- `src/app/api/customers/[customerId]/products/route.ts:5` — `VALID_PRODUCTS`: 3 values, missing `CiteForge`.
- Live DB CHECK constraint (`supabase/migrations/001_initial_schema.sql`, never altered since): `check (product_name in ('StackShift', 'PublishForge', 'CiteForge', 'PipelineForge'))` — 4 values, and CiteForge is **already live** on a real customer (`WRQ-CUST-9344`). All three UI/API copies need the same fix; there is no single shared source of truth for this list today — worth noting but not worth introducing a new shared constant module for, given this task's already-large surface area.

### New Project intake route shape (`POST /api/onboarding/projects`)

```ts
type NewProjectBody = {
  mode: "save" | "save_scheduled" | "start";
  scheduled_start_at?: string; // required if mode === "save_scheduled"
  customer: { existing_customer_id: string } | { company_name: string };
  contact: { name: string; email?: string; phone?: string };
  classification: Classification;
  project_name: string; // pre-filled by the client from deriveProjectSuffix(), editable
};
```
Server logic: resolve/create the `customers` row (reusing `POST /api/customers`'s `adminClient` insert path for the new-company case — session-less-safe, matching that route's existing comment about onboarding submissions with no active session); create the `customer_products` row with `classification` + derived `product_name`; create the `projects` row (`customer_product_id` FK set, `onboarding_visible_at: null`); if `mode === "start"`, immediately call the same seed-and-activate helper the manual Start button and the scheduled-autostart cron both use.

## Implementation Steps

1. Write and apply migration 060 (role, classification, project-scoping, backfill, test-data cleanup, internal-deliverables table, RLS, new cron).
2. Update `src/types/database.ts` for every schema change above.
3. Restructure `src/config/customer-phases.ts` (day ranges, `INTERNAL_DELIVERABLES`, `CLASSIFICATIONS`/derivation helpers).
4. Fix the 3-way `product_name`/`CiteForge` drift (`product-selector.tsx`, `src/types/hub.ts`, `products/route.ts`).
5. Build the project-scoped programme API routes under `/api/projects/[projectId]/programme/*` (move + modify from task 122's customer-scoped versions; refactor seed logic into a shared helper).
6. Build `/api/onboarding/projects` (list + New Project intake) and `/api/onboarding/scheduled-autostart`.
7. Update `/api/programme/reminders` for project-scoped queries.
8. Add `V2_ROUTES.ONBOARDING`, sidebar nav entry, `ROLE_LABEL.marketing`.
9. Build `/v2/onboarding` (list page, New Project form) and `/v2/onboarding/[projectId]` (sub-phase timeline detail + wizard), all role-gated per the access rules above.
10. Delete `_bert-wizard.tsx`; strip Phase-1-editing affordances from `_programme-tab.tsx`; gate its rendering on `onboarding_visible_at`.
11. Update the v2 Customers list query + badge logic for the hidden-project exclusion rule.
12. `npx tsc --noEmit` and `pnpm lint`.
13. Manual verification per Acceptance Criteria, including a real Marketing-role account (create one or promote a test user to `marketing`).

## Acceptance Criteria

- [ ] A user with `profiles.role = 'marketing'` can reach `/v2/onboarding`, click "New Project," and complete the intake form for both a brand-new company and an existing one.
- [ ] "Just Save" creates the customer/product/project rows with no clock started; reappears in the list as a draft.
- [ ] "Set Schedule" + a near-future timestamp results in `programme_started_at` being set automatically once the scheduled-autostart cron fires past that time (verify by curling the cron route directly with a past-dated test row, since pg_cron can't reach localhost).
- [ ] "Start Onboarding" immediately activates Phase 1 / Kickoff sub-phase.
- [ ] The sub-phase timeline shows all 7 Phase 1 sub-phases with the correct day ranges, and the 8 internal deliverables appear under their assigned sub-phase.
- [ ] Filling Kickoff's fields (senior contact, business facts, URLs, customer data) and Storage-folder+KB's fields (documents note, DNS access, credentials) persists correctly and only to those sub-phases.
- [ ] A `pm`-role test account: can see the project in `/v2/onboarding`'s list as a restricted card (name, company, phase, day, %) but gets 403 hitting any `/api/projects/[projectId]/programme/*` route directly, and has no way to reach `/v2/onboarding/[projectId]`.
- [ ] Before Phase 1 handover, the new project's customer does **not** appear in the default `/v2/customers` list (if it's a brand-new customer with only this one project) — and does **not** disappear if it's an existing customer with other already-visible projects.
- [ ] Completing Phase 1 (Sign-off) sets `onboarding_visible_at`, and the customer/project immediately appears in `/v2/customers` and its Programme tab (now read-only for Phase 1, live for Phase 2 onward).
- [ ] All pre-existing (pre-migration) customers/projects remain fully visible to PMs immediately after migration 060 runs — verify by spot-checking a handful of existing customers in the list before and after.
- [ ] `product-selector.tsx` now offers `CiteForge`; a customer created through the ordinary "New Customer" flow can select it and it round-trips through `/api/customers/[customerId]/products` without a validation error.
- [ ] `npx tsc --noEmit` and `pnpm lint` pass with no new errors.

## Verification

```bash
npx tsc --noEmit
pnpm lint
pnpm dev
# Manual, as a marketing-role account:
#   - /v2/onboarding -> New Project -> new company -> Save (just save) -> reappears as draft
#   - New Project -> existing company -> Start Onboarding -> sub-phase timeline at Kickoff (Day 1-2)
#   - Fill Kickoff fields, mark done -> confirm Outcome target becomes reachable/next
#   - Complete all 7 sub-phases -> Sign-off -> confirm onboarding_visible_at set, customer now in /v2/customers
# Manual, as a pm-role account:
#   - /v2/onboarding -> confirm restricted card only (no content, no edit)
#   - direct-hit /api/projects/<id>/programme -> confirm 403
#   - /v2/customers -> confirm the still-in-progress test project's customer is absent (if new) or present-without-the-new-project (if existing)
# Scheduled auto-start (curl, can't reach localhost from pg_cron):
curl -X POST http://localhost:3000/api/onboarding/scheduled-autostart \
  -H "x-digest-secret: $DIGEST_SECRET" -H "content-type: application/json" -d '{}'
```

## Compatibility Touchpoints

- Migration 060 must run before any new route is hit. The backfill (`onboarding_visible_at = created_at` for all existing `projects`) is the single most important line in it — skipping it hides every existing customer/project from every PM instantly.
- New `onboarding-scheduled-autostart` cron job needs the same post-deploy `cron.alter_job()` URL/secret fix-up as every prior cron job in this codebase (012, 059) — reuses `DIGEST_SECRET`, no new env var.
- `src/types/database.ts` must be updated in the same PR as the migration.
- Task 122's Implementation Notes and this doc should both be linked from whichever one lands second, since they describe two states of the same feature.

## Implementation Notes

### What Changed
- Migration 060 (applied live via `supabase db push --linked` against `App - Central Hub`): `profiles.role` gains `marketing`; `customer_products.classification` (6-value CHECK); `projects` gains `programme_started_at`/`onboarding_visible_at`/`scheduled_onboarding_start_at` (all 225 existing rows backfilled visible); task 122's disposable `WRQ-CUST-3691` programme rows deleted; `customer_phases`/`customer_deliverables`/`programme_notifications` all gain a required `project_id` and their unique constraints move from `(customer_id, ...)` to `(project_id, ...)`; `customer_assets` gains a nullable `project_id`; new `onboarding_internal_deliverables` table (8-item Bert-only checklist, RLS-gated `marketing|admin|super_admin`); `customer_phases`/`customer_deliverables` RLS tightened to drop `pm` entirely; `customers.programme_started_at` dropped; new 15-minute `onboarding-scheduled-autostart` pg_cron job.
- **Deviation, not in the original migration snippet**: `projects_staff_read`/`projects_pm_write` RLS (migration 025/026) predated the `marketing` role and didn't grant it read/write on `projects` at all — discovered via direct live-schema inspection (`pg_policies`), not called out anywhere in the task doc's Code Context. Without this fix, Bert could never create or read a project through the New Project intake. Extended both policies to include `marketing`, matching the existing breadth `pm` already has (folded into migration 060's file, applied live via a follow-up `supabase db query`).
- **Deviation**: gave `programme_notifications` a required `project_id` and moved its dedupe uniqueness from `(customer_id, notification_key)` to `(project_id, notification_key)`. Not listed in the task doc's migration snippet, but required by the same reasoning already given for `customer_phases`/`customer_deliverables` — a customer running two simultaneous onboardings needs independent due/overdue dedupe per project. Confirmed zero live rows before the change, so no backfill needed.
- `src/config/customer-phases.ts` restructured: `DeliverableConfig.due` → `dayStart`/`dayEnd` (Phase 1 gets the new 1–2/3–4/5–9/10–11/12–13/14/15 ranges; Phases 2–5 keep `dayStart === dayEnd`); added `INTERNAL_DELIVERABLES` (8 items, mapped to sub-phases per the task doc's table) + `getInternalDeliverable`/`internalDeliverablesForSubPhase`; added `CLASSIFICATIONS`/`Classification` + `deriveProductName`/`deriveProjectSuffix`/`deriveProjectType`.
- Fixed the pre-existing 3-way `CiteForge` product drift (`product-selector.tsx`, `types/hub.ts`, `products/route.ts`) — browser-verified end to end (see Verification Run).
- 7 new project-scoped routes under `/api/projects/[projectId]/programme/*` (`route.ts` GET, `start`, `phase`, `deliverables/[deliverableKey]`, `internal-deliverables/[deliverableKey]`, `wizard-data`, `complete-phase`), all gated `marketing|admin|super_admin`, replacing task 122's customer-scoped versions (deleted outright — untracked in git, no history lost). Seed logic extracted into `src/lib/programme/seed.ts` (`seedAndStartProgramme`), shared by the manual Start route, the New Project intake's `mode: "start"` path, and the scheduled-autostart cron — uses `adminClient` throughout since the cron caller has no session.
- New `/api/onboarding/projects` (`GET` role-conditional list scoped to `onboarding_visible_at IS NULL` projects; `POST` the New Project intake, `marketing|admin|super_admin` only) and `/api/onboarding/scheduled-autostart` (secret-gated cron target, mirrors `/api/digest`'s auth pattern).
- `/api/programme/reminders` rewritten for project-scoped queries (`project_id` throughout instead of `customer_id`; company name via a `projects → customers` join).
- `V2_ROUTES.ONBOARDING`, sidebar "Onboarding" nav item (visible to all staff roles except `client`), `ROLE_LABEL.marketing`.
- New `/v2/onboarding` module: `page.tsx` (role from claims, redirects `client`) + `_onboarding-list.tsx` (card grid, role-conditional edit access, empty state) + `_new-project-form.tsx` (New/Existing company toggle with debounced search, classification select, auto-derived-but-editable project name, Save/Save+Schedule/Start Onboarding); `[projectId]/page.tsx` (server-gated `marketing|admin|super_admin`, redirects others to the list) + `_onboarding-detail.tsx` (sub-phase timeline with day ranges, internal deliverables nested under their sub-phase, reminders rail, Jump-to-phase — reusing the `isDark`-prop pattern since it's a direct descendant of task 122's Programme tab/wizard) + `_onboarding-wizard.tsx` (7 steps, one per Phase-1 sub-phase, replacing task 122's 5-step model; Kickoff and Storage+KB carry the QBR's field-to-sub-phase mapping as actual inputs, autosaved per sub-phase key into `wizard_data`; every step also cycles its own deliverable + any internal deliverables assigned to it; last step is sign-off).
- **Deviation**: extended the onboarding wizard's Storage+KB step with a real file-upload box (reusing task 118/122's `customer_assets` upload flow verbatim, tagged `project_id` + `phase_number: 1`), which the task doc's Code Context didn't explicitly design for the new wizard. Required two small additive fixes not in the Proposed File Changes table: `assets/upload/route.ts`'s role gate (`admin|super_admin|pm` → `+marketing`) and `assets/route.ts`'s `POST` body/insert (`+project_id` passthrough, mirroring the existing `phase_number` passthrough). Without these, Bert (now `marketing`-role, not `pm`) could never actually upload anything through the new wizard — regressing task 122's already-working file-upload capability.
- Deleted `_bert-wizard.tsx`. Rewrote `_programme-tab.tsx` as a read-only, multi-project history view: fetches the customer's *visible* projects (now filtered server-side by `/api/customers/[customerId]/projects`), then each project's phases/deliverables via the new project-scoped GET route; no Start/Jump-to-phase/wizard-launch controls remain anywhere on the customer profile. `client.tsx`'s call site simplified to `customerId`+`isDark` only (the old `customer.programme_started_at` prop no longer exists on the `customers` row).
- v2 Customers list (`page.tsx`): computes the fully-hidden-customer exclusion set with one small full-table `projects` scan (`customer_id`, `onboarding_visible_at` only, paginated per the 1000-row convention) *before* the paginated/counted `customers` query, so `total`/`.range()` stay exact rather than post-filtering a page short. Project counts and the "Day N/120" badge source now only count/read *visible* projects. `_customers-index.tsx`'s `ProgrammeBadge` dropped its DB-sourced `active_phase_number` (now calendar-derived via `getPhaseForDay(day)`) and the `customer_phases` realtime subscription was removed entirely — both were reads `pm` can no longer perform once `customer_phases` RLS was tightened to `marketing|admin|super_admin`, so keeping them would have silently returned nothing for the exact role this list is built for.
- **Bug found and fixed during implementation, not a task-doc deviation**: widening `types/hub.ts`'s `ProductName` to include `CiteForge` broke `src/config/onboarding-schemas.ts`'s `schemas: Record<ProductName, FormSchema>` (a `tsc` error, not a runtime one) — CiteForge is a StackShift add-on (task 017) with no top-level onboarding schema of its own by design. Fixed by typing the map `Partial<Record<ProductName, FormSchema>>` and simplifying `getOnboardingSchema()`'s lookup accordingly; did not add a CiteForge entry, since one was never meant to exist.
- **Bug found and fixed during `pnpm lint`**: `_new-project-form.tsx`'s auto-derived project name and debounced customer search were both originally written as `useEffect`s that called `setState` synchronously in the effect body (`react-hooks/set-state-in-effect`). Fixed by (a) making the displayed project name a plain derived expression computed at render time instead of synced via effect, and (b) moving the debounced search entirely into the search input's `onChange` handler (matching `_customers-index.tsx`'s existing debounce-in-handler precedent) instead of a `useEffect` keyed on the search string.

### Files Changed
- `supabase/migrations/060_onboarding_project_scoping.sql` — new, applied live; includes the `projects` RLS fix as an in-file deviation note.
- `src/types/database.ts` — `profiles.role` +`marketing`; `customers` loses `programme_started_at`; `customer_products` +`classification`; `projects` +3 programme fields; `customer_assets` +`project_id`; `customer_phases`/`customer_deliverables`/`programme_notifications` +`project_id` (required) +new FK relationships; new `onboarding_internal_deliverables` type; new `CustomerPhaseRow`/`CustomerDeliverableRow`/`OnboardingInternalDeliverableRow` aliases.
- `src/config/customer-phases.ts` — full rewrite per above.
- `src/lib/programme/seed.ts` — new shared seed helper.
- `src/app/api/projects/[projectId]/programme/{route.ts,start,phase,deliverables/[deliverableKey],internal-deliverables/[deliverableKey],wizard-data,complete-phase}/route.ts` — new (7 routes).
- `src/app/api/customers/[customerId]/programme/*` — deleted (superseded, was untracked).
- `src/app/api/onboarding/projects/route.ts`, `src/app/api/onboarding/scheduled-autostart/route.ts` — new.
- `src/app/api/programme/reminders/route.ts` — project-scoped rewrite.
- `src/app/api/customers/[customerId]/assets/route.ts`, `assets/upload/route.ts` — `project_id` passthrough / `marketing` role added (deviation, see above).
- `src/app/api/customers/[customerId]/projects/route.ts` — `GET` now excludes individually-hidden projects.
- `src/components/onboarding/product-selector.tsx`, `src/types/hub.ts`, `src/app/api/customers/[customerId]/products/route.ts` — CiteForge drift fix.
- `src/config/onboarding-schemas.ts` — `schemas` map typed `Partial<...>` (bug found mid-implementation, see above).
- `src/config/constants.ts` — `V2_ROUTES.ONBOARDING`.
- `src/app/v2/(hub)/_components/v2-hub-sidebar.tsx` — nav item + `ROLE_LABEL.marketing`.
- `src/app/v2/(hub)/onboarding/{page.tsx,_onboarding-list.tsx,_new-project-form.tsx,[projectId]/page.tsx,[projectId]/_onboarding-detail.tsx,[projectId]/_onboarding-wizard.tsx}` — new (6 files).
- `src/app/v2/(hub)/customers/[customerId]/_bert-wizard.tsx` — deleted.
- `src/app/v2/(hub)/customers/[customerId]/_programme-tab.tsx` — full rewrite (read-only, multi-project).
- `src/app/v2/(hub)/customers/[customerId]/client.tsx` — `ProgrammeTab` call site simplified.
- `src/app/v2/(hub)/customers/page.tsx`, `_customers-index.tsx` — hidden-project exclusion, visible-project-derived badge, dropped `customer_phases` realtime subscription.

### Deviations From Plan
- Four items above are genuine deviations from the task doc's explicit Code Context/Proposed File Changes: the `projects` RLS grant for `marketing`, `programme_notifications.project_id`, the wizard's real file-upload step (+ its two small supporting route fixes), and the `onboarding-schemas.ts` `Partial<Record>` fix. All four were things the task doc's Code Context didn't anticipate but that the feature cannot function correctly without — documented individually above with the reasoning for each.
- Simplified the "Jump to phase" UI: the API route (`/api/projects/[projectId]/programme/phase`) was ported faithfully, but no dedicated jump-to-phase menu was built into `_onboarding-detail.tsx` beyond the same `JumpToPhaseMenu` component task 122 already had — kept for functional parity, not redesigned, since the task doc's Code Context didn't sketch a new one.
- The v2 Customers list's hidden-customer exclusion is computed via one additional full-table scan of `projects` (`customer_id`, `onboarding_visible_at`) on every page load, run *before* the paginated/counted `customers` query so `total` stays exact. Correct today (225 rows), but is a real O(project count) cost per request that will need a materialized view or computed column if the table grows substantially — flagged as a known limitation, not fixed here.

### Verification Run
- `npx tsc --noEmit` — PASS (0 errors in any file this task touched; the only 2 remaining errors are pre-existing, unrelated `_design/customers/*.tsx` reference-file errors already noted in task 121's Implementation Notes).
- `pnpm lint` — PASS (0 errors). Fixed 2 real `react-hooks/set-state-in-effect` violations in `_new-project-form.tsx` (see bug note above).
- Migration 060 — applied live via `supabase db push --linked` against `App - Central Hub` (`tgjpkyiywktjktbsxcyr`); independently re-verified via direct `supabase db query` reads: all 225 pre-existing `projects` rows backfilled `onboarding_visible_at`, `WRQ-CUST-3691`'s stale programme rows gone, live constraint names for the tightened uniques (`customer_deliverables_customer_id_phase_number_deliverable__key`, Postgres-truncated — confirmed via `pg_constraint`, not assumed from the migration-059 source) matched what the DROP statements actually targeted, and the new `onboarding-scheduled-autostart` cron job exists alongside the untouched `daily-programme-reminders` job.
- Browser verification (Chrome, `localhost:3000`, real logged-in Super Admin session — no dedicated `marketing`-role test account was available this session, same constraint task 121/122 hit; Super Admin passes every `marketing|admin|super_admin` gate this task adds, so the full flow was still exercised end-to-end):
  - `/v2/customers` (203 customers) and `/v2/onboarding` (empty state) both correct before any test data — confirms the backfill left every pre-existing customer/project visible.
  - New Project intake (new company, "Just Save"): created customer+product+project correctly (independently confirmed via direct DB read — draft, `onboarding_visible_at: null`); the list card only reflected it after a manual refresh, not the in-app `fetchProjects()` refetch — investigated and attributed to Turbopack dev-mode compile latency on this route's very first hit in the session (a `/v2/dashboard` navigation issued afterward visibly queued for tens of seconds before resolving, confirming general request queuing under first-compile load, not a code-level hang); not reproduced on any subsequent action this session, including the identical create→list flow implicit in "Start Onboarding" below completing normally.
  - Detail page empty state (Start Onboarding / Jump to phase) — confirmed, including project name + company name header.
  - "Start Onboarding" → sub-phase timeline rendered correctly at Day 1: all 7 Phase 1 sub-phases with correct day ranges (D1–2 through D15), 8 internal deliverables correctly nested under their assigned sub-phase (verified `Implementation file` under Migration checklist, `Cluster topics & schedules`+`Publishing plan` under 90-day content map), reminders rail showing "Due in 1 day: Kickoff meeting"/"Due in 3 days: Outcome target".
  - Onboarding Wizard: Kickoff step fields (typed "Senior contact + direct access") persisted correctly into `wizard_data.kickoff.seniorContact` (confirmed via direct DB read); cycling "Kickoff meeting" pending→in_progress correctly updated `customer_deliverables` (confirmed via direct DB read); stepped through all 7 steps to Sign-off.
  - "Complete Phase 1 & notify PM" — success screen rendered; independently re-verified via DB that `projects.onboarding_visible_at` was set and `customer_phases` showed phase 1 `completed`/phase 2 `active`, both dated today.
  - Post-handover: customer immediately appeared in `/v2/customers` search with the "Day 1/120 · Phase 1" badge (calendar-derived — see the RLS-driven limitation noted in Deviations: the badge cannot read the DB's actual `active` phase for `pm`-role viewers anymore, so it shows the computed calendar phase instead, which can lag a manually-advanced/early-handed-over phase); customer profile's "Projects (1)" tab (lazy-loads on click, matching the pre-existing pattern — showed "(0)" until clicked) correctly listed the now-visible project; the 120-Day Programme tab rendered the full read-only 5-phase history (Phase 1 Completed, Phase 2 Active, 3–5 Upcoming) with zero edit affordances.
  - CiteForge fix: `product-selector.tsx` now renders 4 products including CiteForge; selected it through the ordinary "New Customer" flow end to end (Company Info → Products → Review & Create) and it round-tripped through `/api/customers/[customerId]/products` with no validation error, customer created successfully.
  - `POST /api/onboarding/scheduled-autostart` with no secret/session — confirmed 401, matching task 122's established test pattern for this exact class of secret-gated route (cannot test the authenticated cron path itself without `DIGEST_SECRET`, which per CLAUDE.md is never read/exposed).
  - **Not independently verified**: a live `pm`-role account hitting the restricted onboarding list view or getting 403'd off the detail routes/API (no `pm`-role test credentials available this session — same gap task 121 hit). Verified instead by code review: `[projectId]/page.tsx` redirects any role not in `marketing|admin|super_admin`, and every `/api/projects/[projectId]/programme/*` + `/api/onboarding/projects` `POST` route independently checks the same role list before any DB access.
  - **Not independently verified**: the "Set Schedule" mode + scheduled-autostart cron actually flipping a project live (would need a past-dated test row + the real `DIGEST_SECRET`, per the note above) — the intake form's schedule field and the cron route's due-project query were code-reviewed instead; the underlying seed logic (`seedAndStartProgramme`) is the exact same function already browser-verified via the manual Start button.
  - Test customers/projects created during verification (`WRQ-CUST-B741` / Task123 Test Co, `WRQ-CUST-FFA8` / CiteForge Check Co) were deleted after verification (cascade-deleted cleanly — confirmed zero orphaned rows across `projects`/`customer_phases`/`customer_products`), unlike task 122's precedent of leaving `WRQ-CUST-3691` in place, since these were one-off verification artifacts rather than an established shared test fixture.
