# 013: Sprint 2 — Classification Engine, PM Tasks UI, Cliq & Zoho Stubs

**Created:** 2026-05-18
**Completed:** 2026-05-18
**Priority:** HIGH
**Type:** feature
**Recommended Model:** sonnet
**Status:** TESTING

---

## Overview

Implements Sprint 2 (M2 + M7 partial). Five work items in priority order:

0. **Fix redirect** — `classification/page.tsx` points to `/pm?tab=tasks`; correct to `/pm/tasks`.
1. **Classification Engine** — wire the webhook → Haiku call → `classification_records` insert → `logLLMInvocation` loop (fully unblocked).
2. **PM Tasks UI** — replace mock data in `tasks-tab.tsx` with live `classification_records` from Supabase; wire re-classify action; connect Home tab stat card and "Needs Attention" to real counts. All new styling must use Tailwind classes (no `style={{}}` attributes).
3. **Zoho Cliq notification** — implement `sendCliqNotification()` in `src/lib/zoho/index.ts`; call it from the classification API on `CRITICAL` or `HIGH` priority results. Gated by `ZOHO_CLIQ_WEBHOOK_URL` env var; no-op if unset (blocked on O12).
4. **Zoho Project auto-creation** — implement `getZohoAccessToken()` + `createZohoProject()` in `src/lib/zoho/index.ts`; call after a product row is created in `POST /api/customers/[customerId]/products`. Gated by Zoho OAuth env vars; no-op if unset (blocked on O3).

---

## Requirements

- [ ] `classification/page.tsx` redirects to `/pm/tasks` (not `/pm?tab=tasks`)
- [ ] `POST /api/webhooks` parses Zoho Desk and Zoho Projects payloads, extracts `customer_id`, `title`, `description`, `source`, and optional `zoho_ticket_id`/`zoho_task_id`, then calls the classification logic
- [ ] `POST /api/classification` invokes Haiku via `getModel('classification')`, parses the JSON response into `task_type`, `priority`, `llm_eligible`, `confidence_score`, inserts a `classification_records` row via `adminClient`, and calls `logLLMInvocation()`
- [ ] Classification API responds with the created record ID and structured fields (not raw LLM text)
- [ ] `tasks-tab.tsx` fetches live rows from `classification_records` (passed as props from the page); no hardcoded mock data remains
- [ ] "Needs Review" filter shows rows where `confidence_score < 75` OR `status = 'pending'`; "Classified" filter shows `status = 'reviewed'`
- [ ] "Classify" button on a review row opens a modal for the PM to confirm or override `task_type`, `priority`, `llm_eligible`; on submit, PATCHes `classification_records` setting `status = 'reviewed'`, `reviewed_by`, `reviewed_at`
- [ ] Home tab "Pending Review" stat card shows live count of `status = 'pending'` records
- [ ] Home tab "Needs Attention" list includes high/critical classification records needing review
- [ ] All new UI code uses Tailwind utility classes; no `style={{}}` attributes on new elements
- [ ] `sendCliqNotification(webhookUrl, message)` function added to `src/lib/zoho/index.ts`; classification API calls it when `priority` is `CRITICAL` or `HIGH`; silently skips if `ZOHO_CLIQ_WEBHOOK_URL` is unset
- [ ] `getZohoAccessToken()` and `createZohoProject()` implemented in `src/lib/zoho/index.ts`; called from `POST /api/customers/[customerId]/products` after the DB insert; silently skips if Zoho OAuth env vars are unset; on success, PATCHes `customer_products.zoho_project_id`

---

## Out of Scope / Must-Not-Change

- Do not touch `src/components/hub/pm-tabs/shared.tsx` — its existing shared primitives remain unchanged
- Do not modify the onboarding flow or auth routes
- Do not change Sprint 3+ routes (`/api/assessment`, `/api/digest`, etc.)
- Do not remove the `ZOHO_CLIQ_WEBHOOK_URL` guard — Cliq must be a no-op if the env var is absent
- Do not remove the Zoho OAuth env var guard — Zoho auto-creation must be a no-op if env vars are absent
- No `"use server"` in utility modules (`src/lib/**`) — only on Server Actions
- Never import `adminClient` in Client Components

---

## Proposed File Changes

| File | Action | Purpose |
|------|--------|---------|
| `src/app/(hub)/classification/page.tsx` | Modify | Fix redirect target to `/pm/tasks` |
| `src/app/api/webhooks/route.ts` | Modify | Parse Zoho payload, extract fields, call classification logic |
| `src/app/api/classification/route.ts` | Modify | Implement Haiku call, DB insert, LLM log |
| `src/lib/zoho/index.ts` | Modify | Implement `getZohoAccessToken`, `createZohoProject`, `sendCliqNotification` |
| `src/app/(hub)/pm/tasks/page.tsx` | Modify | Fetch `classification_records` from Supabase, pass to `TasksTab` |
| `src/components/hub/pm-tabs/tasks-tab.tsx` | Modify | Accept real data props, remove mock array, add re-classify modal, convert confidence badge to Tailwind |
| `src/components/hub/pm-tabs/home-tab.tsx` | Modify | Wire "Pending Review" stat to live count, merge classification items into "Needs Attention" |
| `src/app/api/customers/[customerId]/products/route.ts` | Modify | Call `createZohoProject` after product insert |

---

## Code Context

### `src/app/(hub)/classification/page.tsx` — current (fix this redirect)

```tsx
import { redirect } from "next/navigation";
export default function ClassificationPage() {
  redirect("/pm?tab=tasks"); // wrong — should be "/pm/tasks"
}
```

### `src/app/api/webhooks/route.ts` — current stub

```ts
import { NextRequest, NextResponse } from "next/server";
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  console.log("[webhook] received payload", body);
  return NextResponse.json({ received: true });
}
```

Zoho Desk sends:
```json
{ "ticketId": "...", "subject": "...", "description": "...", "accountId": "..." }
```
Zoho Projects sends:
```json
{ "taskId": "...", "taskName": "...", "description": "...", "projectId": "..." }
```
The webhook must map `accountId` / `projectId` to `customer_id` via a Supabase lookup (`customers.zoho_account_id` for Desk, `customer_products.zoho_project_id` for Projects).

### `src/app/api/classification/route.ts` — current stub

```ts
import { NextResponse } from "next/server";
export async function POST() {
  return NextResponse.json({ message: "Classification engine — Sprint 2" }, { status: 501 });
}
```

### `src/lib/zoho/index.ts` — current stubs

```ts
export async function getZohoAccessToken(): Promise<string> {
  throw new Error("Zoho client not yet implemented — Sprint 2");
}
export async function createZohoProject(_customerId: string): Promise<string> {
  throw new Error("Zoho project creation not yet implemented — Sprint 2");
}
export async function syncTaskToZoho(_taskId: string): Promise<void> {
  throw new Error("Zoho task sync not yet implemented — Sprint 4");
}
```

### `src/lib/ai/model-config.ts` — how to get the Haiku model

```ts
// Use this in the classification API:
const model = await getModel("classification"); // returns LanguageModel
```

### `src/lib/ai/logger.ts` — how to log after each LLM call

```ts
await logLLMInvocation({
  customerId: "WRQ-CLIENT-XXXX",
  layer: "classification",
  modelUsed: config.model_id,       // from getModelConfig("classification")
  inputTokens: usage.promptTokens,
  outputTokens: usage.completionTokens,
  durationMs: Date.now() - start,
  status: "success",
  referenceId: classificationRecordId,
  referenceType: "classification_records",
});
```

### `classification_records` schema (after `004_schema_corrections.sql`)

```
id               uuid PK
customer_id      text NOT NULL (FK → customers.customer_id)
zoho_ticket_id   text (nullable)
zoho_task_id     text (nullable)
source           text NOT NULL CHECK ('zoho_desk' | 'zoho_projects')
title            text NOT NULL
description      text (nullable)
task_type        text (nullable)  — CONTENT_UPDATE | SETTINGS_CHANGE | BLOG_PUBLISH | ASSET_UPLOAD | CODE_CHANGE_MINOR | SEO_UPDATE | BUG_REPORT | FEATURE_REQUEST | STRATEGIC | OTHER
priority         text CHECK ('CRITICAL' | 'HIGH' | 'NORMAL' | 'LOW')  — uppercase
llm_eligible     text NOT NULL default 'NO' CHECK ('YES' | 'NO' | 'HUMAN_ONLY')
confidence_score numeric(5,2) (nullable)
model_used       text (nullable)
input_tokens     int (nullable)
output_tokens    int (nullable)
raw_response     jsonb (nullable)  — store raw LLM JSON here
status           text NOT NULL default 'pending' CHECK ('pending' | 'reviewed' | 'rejected')
reviewed_by      text (nullable)
reviewed_at      timestamptz (nullable)
created_at       timestamptz NOT NULL default now()
```

### `src/components/hub/pm-tabs/tasks-tab.tsx` — the mock data to replace (lines 28–34)

```ts
const tasks = [
  { id: "T-0091", title: "...", customer: "Acme Corp", priority: "CRITICAL", type: "Content Update", conf: 94, t: "2h", status: "classified" },
  // ...5 hardcoded rows
];
```

**Props pattern:** accept `tasks: ClassificationRecord[]` from the page; derive the `shown` array from real DB rows. The page fetches from Supabase and passes down.

### Confidence badge — convert from inline style to Tailwind (tasks-tab.tsx lines 93–96)

Current (inline style — remove this pattern):
```tsx
<span
  className="text-[11px] font-semibold rounded-[6px] px-2 py-px font-mono border text-[var(--cc)] bg-[var(--cc-bg)] border-[var(--cc-bd)]"
  style={{ "--cc": cc, "--cc-bg": `${cc}10`, "--cc-bd": `${cc}20` } as React.CSSProperties}
>
  {t.conf}%
</span>
```

Replace with conditional Tailwind:
```tsx
const confClass = (v: number) =>
  v >= 80 ? "text-green-700 bg-green-50 border-green-200 dark:text-green-400 dark:bg-green-950 dark:border-green-800"
  : v >= 60 ? "text-amber-700 bg-amber-50 border-amber-200 dark:text-amber-400 dark:bg-amber-950 dark:border-amber-800"
  : "text-red-700 bg-red-50 border-red-200 dark:text-red-400 dark:bg-red-950 dark:border-red-800";

<span className={`text-[11px] font-semibold rounded-[6px] px-2 py-px font-mono border ${confClass(t.confidence_score ?? 0)}`}>
  {t.confidence_score ?? "—"}%
</span>
```

### Re-classify modal — pattern to follow

The modal should be an inline component in `tasks-tab.tsx` (not a separate file — single-page use). Use shadcn Dialog if available, otherwise a simple overlay div with Tailwind classes. On submit:
- `PATCH /api/classification/[id]` (create this endpoint) with `{ task_type, priority, llm_eligible, reviewed_by: userId }`
- Supabase updates `status = 'reviewed'`, `reviewed_at = now()`

### `src/app/(hub)/pm/tasks/page.tsx` — current (extend with data fetch)

```tsx
"use client";
import React from "react";
import { usePMSettings } from "@/hooks/use-pm-settings";
import { getTokens } from "@/components/hub/pm-tabs/shared";
import TasksTab from "@/components/hub/pm-tabs/tasks-tab";

export default function PMTasksPage() {
  const { settings } = usePMSettings();
  const C = getTokens(settings);
  return (
    <div className="flex-1 overflow-y-auto py-[26px] px-8 bg-[var(--c-page-bg)]"
      style={{ "--c-page-bg": C.bg } as React.CSSProperties}>
      <TasksTab settings={settings} />
    </div>
  );
}
```

Add a `useEffect` to fetch `classification_records` from Supabase (browser client) and pass the array to `TasksTab`. Subscribe to Supabase realtime `classification_records` channel for live updates (same pattern as `pm/page.tsx` which subscribes to `customer_products`).

### Home tab — stat card count (home-tab.tsx line 162)

```ts
// Change from:
{ v: "2", l: "Pending Review", c: C.amber }
// To: pass pendingReviewCount as prop, derive from classification_records
{ v: String(pendingReviewCount), l: "Pending Review", c: C.amber }
```

Fetch count from Supabase: `supabase.from("classification_records").select("id", { count: "exact", head: true }).eq("status", "pending")`

---

## Implementation Steps

### Step 0 — Fix redirect
1. In `src/app/(hub)/classification/page.tsx`, change `redirect("/pm?tab=tasks")` to `redirect("/pm/tasks")`

### Step 1 — Classification Engine

2. In `src/app/api/classification/route.ts`:
   - Accept `POST` with body `{ customerId, title, description, source, zoho_ticket_id?, zoho_task_id? }`
   - Build a Haiku prompt that returns structured JSON: `{ task_type, priority, llm_eligible, confidence_score, reasoning }`
   - Call `getModel("classification")` and `getModelConfig("classification")` from `@/lib/ai/model-config`
   - Use Vercel AI SDK `generateObject` or `generateText` with JSON mode
   - Insert row into `classification_records` via `adminClient`
   - Call `logLLMInvocation()` with the token counts and duration
   - Return the inserted record ID + structured fields
   - Add `PATCH /api/classification/[id]/route.ts` for the re-classify action (update `task_type`, `priority`, `llm_eligible`, `status = 'reviewed'`, `reviewed_by`, `reviewed_at`)

3. In `src/app/api/webhooks/route.ts`:
   - Parse body; detect source from payload shape (`ticketId` → `zoho_desk`, `taskId` → `zoho_projects`)
   - For `zoho_desk`: look up `customer_id` via `customers.zoho_account_id = body.accountId`
   - For `zoho_projects`: look up `customer_id` via `customer_products.zoho_project_id = body.projectId`
   - If `customer_id` not found, return 200 (don't fail — Zoho retries)
   - Call `fetch("/api/classification", { method: "POST", body: ... })` with the mapped fields
   - Return `{ received: true }`

### Step 2 — Zoho Cliq notification

4. In `src/lib/zoho/index.ts`, add:
   ```ts
   export async function sendCliqNotification(message: string): Promise<void> {
     const url = process.env.ZOHO_CLIQ_WEBHOOK_URL;
     if (!url) return; // blocked on O12 — no-op until configured
     await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text: message }) });
   }
   ```
5. In `src/app/api/classification/route.ts`, after the DB insert, if `priority === 'CRITICAL' || priority === 'HIGH'`, call `sendCliqNotification()` with a human-readable summary (task title, customer, priority, classification ID)

### Step 3 — Zoho Project auto-creation

6. In `src/lib/zoho/index.ts`, implement:
   - `getZohoAccessToken()`: exchange `ZOHO_REFRESH_TOKEN` for an access token using `ZOHO_CLIENT_ID` + `ZOHO_CLIENT_SECRET`. Return empty string and log a warning if any env var is missing.
   - `createZohoProject(customerId, projectName)`: call Zoho Projects API to create a project; return the new `zoho_project_id`. No-op if `getZohoAccessToken()` returns empty string.
7. In `src/app/api/customers/[customerId]/products/route.ts`, after the `INSERT` into `customer_products`, call `createZohoProject()` and if it returns a project ID, `UPDATE customer_products SET zoho_project_id = ... WHERE id = ...`

### Step 4 — PM Tasks UI

8. In `src/app/(hub)/pm/tasks/page.tsx`:
   - Add `useEffect` to fetch `classification_records` ordered by `created_at desc`, limit 100
   - Subscribe to Supabase realtime on `classification_records` for live inserts/updates
   - Pass data as `tasks` prop to `TasksTab`

9. In `src/components/hub/pm-tabs/tasks-tab.tsx`:
   - Remove the hardcoded `tasks` array
   - Accept `tasks: ClassificationRecordRow[]` prop (import type from `@/types/database`)
   - Map DB row fields to the table columns: `id` → ticket ID display, `title`, `customer_id` → customer, `task_type`, `confidence_score`, `status` (`pending` = "review", `reviewed` = "classified"), `created_at` → age
   - Replace the per-element CSS var pattern for confidence with conditional Tailwind classes (see Code Context above)
   - Add inline `ReclassifyModal` component: shadcn Dialog or Tailwind overlay; fields for `task_type`, `priority`, `llm_eligible`; submit PATCHes `/api/classification/[id]`; on success, update local state

10. In `src/components/hub/pm-tabs/home-tab.tsx`:
    - Accept `pendingReviewCount: number` prop
    - Replace hardcoded `"2"` in the stat card with `String(pendingReviewCount)`
    - Accept `classificationAttentionItems` prop (high/critical pending records) and merge into the "Needs Attention" list

11. In `src/app/(hub)/pm/page.tsx`:
    - Fetch `pendingReviewCount` and top attention items from `classification_records`
    - Pass to `HomeTab`

---

## Acceptance Criteria

- [ ] Navigating to `/classification` redirects to `/pm/tasks`
- [ ] `POST /api/webhooks` with a Zoho Desk-shaped body returns `{ received: true }` and creates a `classification_records` row in Supabase (verify via Supabase dashboard)
- [ ] `POST /api/classification` returns structured JSON (not 501) and the row appears in `classification_records`
- [ ] An `llm_invocation_logs` row is created for every classification call
- [ ] `/pm/tasks` displays real rows from `classification_records` (not mock data)
- [ ] "Needs Review" filter shows only `pending` / low-confidence rows; "Classified" shows `reviewed` rows
- [ ] Clicking "Classify" on a review row opens the modal; submitting updates the DB row to `reviewed`
- [ ] Home tab "Pending Review" count reflects actual DB count
- [ ] No `style={{}}` attributes on new or modified UI elements
- [ ] `sendCliqNotification` is called without throwing when `ZOHO_CLIQ_WEBHOOK_URL` is absent
- [ ] `createZohoProject` is called without throwing when Zoho env vars are absent

---

## Verification

```bash
npx tsc --noEmit         # TypeScript check — must pass clean
pnpm lint                # ESLint — must pass clean
pnpm build               # Production build — must succeed
```

Browser acceptance:
- Visit `/classification` — confirm redirect to `/pm/tasks`
- POST to `/api/webhooks` with test payload — check Supabase `classification_records` table for new row
- Open `/pm/tasks` — confirm live data loads, filters work, re-classify modal opens and submits

---

## Implementation Notes

> **Simplify Review:** PASS
> **Reviewed:** 2026-05-18

### What was built

The full Sprint 2 classification loop is now wired end-to-end:
- Zoho Desk/Projects webhooks are parsed, customer resolved, and Haiku runs classification immediately — writing a structured `classification_records` row and logging token usage.
- `/pm/tasks` shows live classification records with filter tabs (All / Needs Review / Classified), confidence badges in Tailwind color-coded classes, and a `ReclassifyModal` for manual PM overrides.
- The PM Home page "Pending Review" stat card reflects the live DB count; CRITICAL/HIGH pending items surface in "Needs Attention".
- Cliq notification and Zoho Project auto-creation are implemented but env-var gated (no-ops until O12/O3 are resolved).

### How to access for testing

- **Webhook:** `POST /api/webhooks` with `{ ticketId, subject, description, accountId }` (Desk) or `{ taskId, taskName, description, projectId }` (Projects). Customer must have `zoho_account_id` / `zoho_project_id` set.
- **Classification API:** `POST /api/classification` with `{ customerId, title, description, source }` — creates and returns a `classification_records` row.
- **PATCH endpoint:** `PATCH /api/classification/:id` with `{ task_type, priority, llm_eligible }` — requires hub session.
- **PM Tasks UI:** `/pm/tasks` — shows live data once at least one classification record exists.
- **Setup required:** `ANTHROPIC_API_KEY` must be set; `llm_config` row for `classification` layer must be active in Supabase.

### Deviations from plan

**Minor — Architecture:**
- Added `src/lib/ai/classify.ts` (not in original file list). Extracted core classification logic to a shared module to avoid a circular HTTP self-call from the webhook route importing from the classification route. `classifyTask()` is imported directly by both `webhooks/route.ts` and `classification/route.ts`.

**Minor — AI SDK field names:**
- AI SDK 6's `LanguageModelUsage` uses `inputTokens`/`outputTokens` (not `promptTokens`/`completionTokens` as assumed in the task spec). Fixed during implementation.

**Minor — Optimistic updates pattern:**
- `tasks-tab.tsx` uses an `overrides` map instead of a `localTasks` state mirror. Avoids `react-hooks/set-state-in-effect` lint error while maintaining immediate UI feedback after re-classify.

### Standards check

Pass. TypeScript clean (`npx tsc --noEmit`). No `any` types. No unused variables. All functions single-responsibility. `console.error`/`console.warn` used (not `console.log`) in production paths.

### Convention check

Pass (with one fix applied):
- `adminClient` used for reads in `webhooks/route.ts` — valid exception (no user session in server-to-server webhook context, same as public onboarding routes). Inline comment added per CLAUDE.md pattern.
- All other CLAUDE.md conventions respected: `logLLMInvocation()` called on every LLM invocation; `getModel("classification")` used (no hardcoded model IDs); `llm_eligible` stored as `YES|NO|HUMAN_ONLY` text; priority uses `CRITICAL|HIGH|NORMAL|LOW` uppercase; `adminClient` import-guarded from client components; no `"use server"` in utilities.

---

## Notes for Implementation Agent

- **Model:** Use sonnet — this is cross-cutting (DB, AI layer, API routes, UI) and introduces the core orchestration loop. Do not downgrade to haiku.
- **Tailwind only on new elements:** The existing CSS-var theming in `tasks-tab.tsx` (the `buildVars(C)` call at the top) can remain for backward compat with the rest of the tab's existing elements. Only new elements and the confidence badge must use Tailwind classes.
- **`adminClient` in API routes only:** Use `adminClient` from `@/lib/supabase/admin` for all `classification_records` writes (the classification API and PATCH endpoint). The tasks page and home page must use the browser `createClient()` from `@/lib/supabase/client` for reads.
- **Schema is correct post-migration-004:** `llm_eligible` is text `'YES'|'NO'|'HUMAN_ONLY'`, priority is uppercase `'CRITICAL'|'HIGH'|'NORMAL'|'LOW'`. Do not use boolean for `llm_eligible`.
- **Zoho / Cliq are no-ops:** Both must check for env vars at runtime and return silently (not throw) if absent. This is intentional — they will be activated when O3 and O12 are resolved.
- **Haiku prompt:** The classification prompt must instruct Haiku to return valid JSON only (no prose). Use `generateObject` with a Zod schema for structured output so parsing errors are caught by the SDK. Wrap the LLM call in try/catch; on error, still insert the row with `status: 'pending'`, `confidence_score: null`, and log the error.
- **`syncTaskToZoho` in `src/lib/zoho/index.ts`:** Leave untouched — it belongs to Sprint 4.
- **Page-scoped UI:** The `ReclassifyModal` should be defined inline in `tasks-tab.tsx`, not extracted to a separate file — it's only used in that one component.
- **Realtime subscription:** Follow the same pattern as `pm/page.tsx` lines 42–58 for subscribing to `classification_records` changes.
