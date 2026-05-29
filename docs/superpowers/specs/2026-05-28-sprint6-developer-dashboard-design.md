# Sprint 6 — Developer Dashboard + KB Seed: Design Spec

**Date:** 2026-05-28  
**Sprint goal (AC5):** A Developer can see their assigned work and self-assign an available unassigned task from the Hub.  
**Execution order:** AC5 first (tasks 1–9, 22), then KB/Storage (10–16), then Metrics/Logging (17–21).

---

## 1. Context and Constraints

- **Dev page** (`src/app/(hub)/dev/page.tsx`) exists with fully hardcoded mock data — no live connections.
- **KB page** (`src/app/(hub)/kb/page.tsx`) is an empty stub.
- **Sidebar** (`src/components/hub/hub-sidebar.tsx`) shows only PM-centric nav; no Developer section yet.
- **Zoho lib** (`src/lib/zoho/index.ts`) has write helpers only. No read-side functions for fetching tasks or time logs.
- **Zoho credentials are fully configured** in `.env.local` — live API calls work today.
- **Self-assign writes to Zoho only** (Zoho is the single source of truth; no hub-side assignment table needed).
- **`hub_users.zoho_user_id`** is the link between a logged-in Hub user and their Zoho identity.

---

## 2. Wave 1 — Zoho Read Layer + Live Dev Dashboard

**Sprint tasks:** 1 (dashboard), 3 (unassigned list), 2 (overdue highlighting)

### 2.1 New Zoho read functions (`src/lib/zoho/index.ts`)

Three new exported functions, following the existing pattern of `getZohoAccessToken()`:

```
getMyZohoTasks(portalId, zohoUserId): Promise<ZohoTask[]>
getUnassignedZohoTasks(portalId): Promise<ZohoTask[]>
getMyZohoTimeLogs(portalId, zohoUserId, dateRange): Promise<ZohoTimeLog[]>
```

`ZohoTask` shape (from Zoho Projects REST API `GET /tasks/`):
```ts
{
  id: string            // id_string
  name: string
  project: { id: string; name: string }
  priority: string      // "high" | "medium" | "low" | "none"
  status: { name: string }
  due_date: string | null   // "MM-DD-YYYY" from Zoho
  completed: boolean
  link?: { web?: { url: string } }
}
```

`ZohoTimeLog` shape (from Zoho Projects `GET /logs/` or `GET /timelogs/`):
```ts
{
  id: string
  project: { id: string; name: string }
  task: { id: string; name: string }
  hours: string          // "HH:MM" format
  log_date: string       // "MM-DD-YYYY"
}
```

**Zoho API endpoints used:**
- My tasks: `GET /portal/{portalId}/mytasks/` with `?owner={zohoUserId}&status=open`
- Unassigned tasks: `GET /portal/{portalId}/tasks/?noassignee=true&status=open`. If the portal-wide endpoint does not support the `noassignee` filter, fall back to fetching tasks per project (iterate over distinct `zoho_project_id` values from `customer_products`) and filter `task.details.owners` === empty client-side. The fallback is slower but correct.
- Time logs: `GET /portal/{portalId}/timelogs/` with `?users_list={zohoUserId}&date={today}`

All three functions: silent-fail with empty array when token is unavailable (same pattern as `syncTaskToZoho`).

### 2.2 New API route: `/api/dev/tasks`

**File:** `src/app/api/dev/tasks/route.ts`  
**Method:** GET  
**Auth:** Requires session (uses `createClient()` + `hub_users` read for `zoho_user_id`)  
**Returns:**
```json
{
  "myTasks": ZohoTask[],
  "unassignedTasks": ZohoTask[],
  "timeLogs": ZohoTimeLog[]
}
```

Calls all three Zoho read functions in parallel (`Promise.all`). If `zoho_user_id` is null on the user's profile, returns empty arrays with a `{ warning: "no_zoho_id" }` flag so the UI can show a setup prompt.

### 2.3 Dev page rewrite (`src/app/(hub)/dev/page.tsx`)

Convert from a static Server Component with hardcoded arrays to a **Client Component** that fetches from `/api/dev/tasks` on mount.

Loading state: skeleton shimmer on each card section (consistent with the PM dashboard pattern).

**Overdue detection** (task 2): A task is overdue if `due_date` parses to before today and `completed === false`. Overdue tasks get `text-red-600` on the due-date label and a red left border accent on the row. The summary strip's "Overdue" counter is derived from the live count.

**Zoho deep links** (task 1 requirement): Each task row links to `link.web.url` if present; otherwise falls back to constructing the URL via `NEXT_PUBLIC_ZOHO_PORTAL_NAME` using the same `buildZohoTaskUrl` helper already in `orchestration/page.tsx`. Link opens in a new tab (`target="_blank"`).

---

## 3. Wave 2 — Self-Assign Flow + PM Notification

**Sprint tasks:** 4 (self-assign), 5 (Cliq notification)

### 3.1 New Zoho write function (`src/lib/zoho/index.ts`)

```
assignZohoTask(portalId, projectId, taskId, zohoUserId): Promise<boolean>
```

Calls `POST /portal/{portalId}/projects/{projectId}/tasks/{taskId}/` with body `{ owners: zohoUserId }` (Zoho Projects owner assignment syntax). Returns `true` on success, `false` on failure.

### 3.2 New API route: `/api/dev/assign`

**File:** `src/app/api/dev/assign/route.ts`  
**Method:** POST  
**Body:** `{ projectId: string; taskId: string }`  
**Auth:** Requires session — reads `zoho_user_id` from `hub_users`.

Steps:
1. Get the session user's `zoho_user_id`.
2. Call `assignZohoTask(portalId, projectId, taskId, zohoUserId)`.
3. On success: call `sendCliqNotification()` to the `"pm"` channel with message: `"🙋 {displayName} self-assigned: {taskName} ({projectName})"`.
4. Return `{ ok: true }` or `{ ok: false, error: string }`.

If `zoho_user_id` is null, return 400 with `{ error: "no_zoho_id" }`.

### 3.3 Self-assign UI

In the unassigned tasks section of `dev/page.tsx`, each task row gets an **"Assign to me"** button (small, secondary style). On click:
- Optimistically removes the task from the unassigned list and appends it to "My Tasks".
- Fires `POST /api/dev/assign` in the background.
- On failure: rolls back the optimistic update and shows an inline error toast.

Button is disabled while the request is in-flight (per-task loading state via a `Set<string>` of in-flight task IDs).

---

## 4. Wave 3 — Hours Logged (Zoho Read)

**Sprint task:** 6

The "Time Logged Today" card already exists in the UI. Wire it to `timeLogs` from `/api/dev/tasks` (already fetched in Wave 1 — no additional API call needed).

Display format: group logs by project, sum hours per project, show individual task rows with `HH:MM` format. The summary strip's "Logged Today" stat is derived from the total sum.

Add a "This Week" toggle (button pair: Today / This Week). When "This Week" is selected, pass `?range=week` to `/api/dev/tasks` which adjusts the `date` param in `getMyZohoTimeLogs` to the Monday–Sunday range. Default is "Today".

---

## 5. Wave 4 — AI Dev Prompt Widget

**Sprint tasks:** 7 ("What open tasks do I have?"), 8 ("Show my pending tickets"), 9 ("How many hours did I log today?")

### 5.1 New API route: `/api/dev/ask`

**File:** `src/app/api/dev/ask/route.ts`  
**Method:** POST  
**Body:** `{ query: string }`  
**Auth:** Requires session.

Steps:
1. Fetch the user's current Zoho data (call the same three Zoho functions used in `/api/dev/tasks`).
2. Serialize tasks + time logs into a compact context string.
3. Call Claude Haiku via `getModel('digest')` (existing model config pattern).
4. System prompt: "You are a developer assistant. Answer questions about the developer's Zoho tasks and time logs based only on the data provided. Be concise — 1-3 sentences max."
5. Log via `logLLMInvocation()` with `orchestration_layer: 'digest'` and `customer_id: null`.
6. Return `{ answer: string }`.

### 5.2 AI prompt widget on dev page

A small collapsible panel at the bottom of the dev page (collapsed by default, expand on click):

```
┌─────────────────────────────────────────────────────────┐
│  Ask about your work                              [▲/▼] │
├─────────────────────────────────────────────────────────┤
│  [What open tasks do I have?  ] [Ask]                   │
│                                                         │
│  You have 3 open tasks: "Set up staging..."             │
└─────────────────────────────────────────────────────────┘
```

Suggestion chips below the input for the three canonical queries (tasks 7–9). Clicking a chip populates the input and auto-submits. Response replaces the previous answer inline (no history — single Q&A display).

---

## 6. Wave 5 — AC5 QA

**Sprint task:** 22

Acceptance criteria check:
- [ ] Dev user logs in, sees their assigned Zoho tasks with correct due dates and priority
- [ ] Overdue tasks are visually highlighted in red
- [ ] Unassigned team tasks list is populated
- [ ] Dev clicks "Assign to me" → task moves to "My Tasks" → Cliq PM channel receives notification
- [ ] Time logged today is accurate
- [ ] AI prompt answers "What open tasks do I have?" correctly

---

## 7. KB + Storage (post-AC5)

**Sprint tasks:** 10–16

### Task 10 — KB directory structure in Supabase Storage

Create a `kb` bucket in Supabase Storage with the following folder convention:
```
kb/
  global/          # Internal playbooks (not customer-specific)
  customers/
    {customerId}/  # Per-customer KB files
```

Add storage policies:
- `hub_users` with role `pm` or `developer` can upload to `kb/global/`
- `hub_users` with role `pm` can upload to `kb/customers/{customerId}/`
- `hub_users` with role `developer` can upload to `kb/customers/{customerId}/` (task 15)
- All `hub_users` can read all paths

New migration: `016_kb_storage.sql`

### Tasks 11–12 — Seed playbooks

Insert two rows into the existing `playbooks` table (no schema change needed):

| task_type        | title                              | source     |
|------------------|------------------------------------|------------|
| `content_update` | Content Update Playbook            | `manual`   |
| `settings_change`| Settings Change Playbook           | `manual`   |

Content: step-by-step instructions for each task type covering the standard WebriQ delivery workflow. `customer_id = null` (global, not customer-specific). `is_active = true`.

Delivered as a seed SQL file or a one-time admin script — not a migration (data, not schema).

### Task 13 — Customer KB scaffold

New API route `GET /api/kb/[customerId]` that lists files in `kb/customers/{customerId}/` from Supabase Storage. Returns `{ files: StorageFile[] }`.

KB page (`/kb`) becomes a two-panel layout:
- Left: Customer selector (dropdown of active customers)
- Right: File list for selected customer + upload button

### Tasks 14–15 — File upload (PM + Dev)

Create a new route `POST /api/kb/upload` rather than modifying the existing `/api/upload` (which is scoped to brand assets). The new route accepts `{ customerId: string; file: File }`, validates the caller's role via session, and uploads to `kb/customers/{customerId}/{filename}` in the `kb` bucket. The existing `use-file-upload.ts` hook is reused client-side by passing a different `endpoint` prop.

PM upload (task 14): available for all customers in the selector.  
Dev upload (task 15): available, same UI — Supabase Storage RLS enforces the access rules.

### Task 16 — Weekly Wiki Lint Cron

New API route `POST /api/kb/lint` (pg_cron target, same auth pattern as `/api/digest`):
- Reads all files in `kb/global/` (playbooks) via Supabase Storage.
- Inserts a `wiki_lint` row into `llm_config` via seed script (the constraint in migration 001 already includes `'wiki_lint'` as a valid value, so no schema change is needed). Uses `getModel('wiki_lint')` — defaults to Claude Sonnet.
- Sends content to that model with prompt: "Audit these playbook documents for contradictions and orphaned references. Return a structured JSON report."
- Writes the lint report to a new `kb_lint_logs` table (new migration `017_kb_lint.sql`).
- Logs via `logLLMInvocation()` with `orchestration_layer: 'wiki_lint'`.

`017_kb_lint.sql` adds:
```sql
create table kb_lint_logs (
  id           uuid primary key default gen_random_uuid(),
  report       jsonb not null,
  model_used   text,
  input_tokens integer,
  output_tokens integer,
  created_at   timestamptz not null default now()
);
```

pg_cron schedule: weekly, Monday 06:00 UTC (same mechanism as `012_pg_cron_digest.sql`).

---

## 8. Logging + Metrics (post-KB)

**Sprint tasks:** 17–21

### Task 17 — LLM invocation logging audit

Verify every AI call in the codebase calls `logLLMInvocation()` after completion. The `wiki_lint` layer from task 16 adds a new valid value — the `llm_invocation_logs.orchestration_layer` constraint already includes `'wiki_lint'` in migration 001. No schema change needed.

Audit checklist: `classification/`, `assessment/`, `plan/`, `execution/`, `digest/`, `reply/`, `dev/ask` (new).

### Task 21 — Data collection verification (do before 18/19)

Confirm `llm_invocation_logs`, `digest_logs`, and `execution_records` have real rows (not just seeded/test data) and that `cost_usd` is populated (requires `computeLLMCost()` from `src/config/constants.ts` to be wired in `logLLMInvocation()`).

### Tasks 18–19 — Metrics Dashboard

**Task 18 — Supabase view:**

Create a view `vw_hub_metrics` aggregating 11 tracked metrics:
1. Total customers onboarded
2. Total tasks classified
3. LLM-eligible task rate (%)
4. Average classification confidence score
5. Total assessments run
6. Plan approval rate (%)
7. Plan rejection rate (%)
8. Total executions completed
9. Execution success rate (%)
10. Total LLM cost USD (all time)
11. Total LLM cost USD (this month)

New migration: `018_metrics_view.sql`.

**Task 19 — Hub UI panel:**

New page or section in `/pm` (PM-visible, read-only). A grid of metric cards fetched from a new `GET /api/metrics` route that queries `vw_hub_metrics`. Displayed as a 4-col grid of stat cards (same visual style as the dev dashboard summary strip but larger).

### Task 20 — Phase 1 targets display

Alongside each metric card, show a target value and a delta indicator (green if at/above target, red if below). Targets are hardcoded in a constants object (they don't change mid-phase). Example: plan approval rate target ≥ 70%.

---

## 9. Files Changed Summary

| File | Change |
|------|--------|
| `src/lib/zoho/index.ts` | Add `getMyZohoTasks`, `getUnassignedZohoTasks`, `getMyZohoTimeLogs`, `assignZohoTask` |
| `src/app/api/dev/tasks/route.ts` | New — fetches all live dev data from Zoho |
| `src/app/api/dev/assign/route.ts` | New — self-assign + Cliq notification |
| `src/app/api/dev/ask/route.ts` | New — AI prompt handler |
| `src/app/(hub)/dev/page.tsx` | Rewrite — live data, overdue highlighting, self-assign UI, AI widget |
| `src/app/api/kb/lint/route.ts` | New — wiki lint endpoint |
| `src/app/(hub)/kb/page.tsx` | Rewrite — two-panel KB browser with upload |
| `src/app/api/kb/[customerId]/route.ts` | New — list KB files per customer |
| `src/app/api/metrics/route.ts` | New — query vw_hub_metrics |
| `supabase/migrations/016_kb_storage.sql` | KB bucket + storage policies |
| `supabase/migrations/017_kb_lint.sql` | kb_lint_logs table |
| `supabase/migrations/018_metrics_view.sql` | vw_hub_metrics view |

---

## 10. Key Decisions

- **No hub-side task assignment table.** Zoho is the single source of truth for task ownership. The self-assign writes directly to Zoho and the dev page always re-fetches fresh state from Zoho on load.
- **`/api/dev/tasks` fetches all three data types in one round-trip** (`Promise.all`) to avoid waterfall requests from the client.
- **AI dev queries reuse Wave 1 Zoho data** — `/api/dev/ask` calls the same Zoho functions rather than making a second set of API calls, keeping Zoho request count low.
- **Wiki lint uses `orchestration_layer: 'wiki_lint'`** which is already a valid enum value in `llm_invocation_logs` (migration 001). No schema change needed for logging.
- **Metrics view is a Supabase SQL view**, not a materialized view — data is always fresh, no refresh scheduling needed at Phase 1 scale.
