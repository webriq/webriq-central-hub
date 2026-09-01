# 343: Activate `/orchestration` — Transfer Old Orchestration UI from `_hub_(OLD)`

**Created:** 2026-09-01
**Priority:** MEDIUM
**Type:** feature
**Recommended Tier:** balanced
**Status:** Planned

---

## Overview

`/orchestration` is currently a dead stub — `src/app/(hub)/orchestration/page.tsx` renders one line of placeholder text (`v2 · Orchestration · Sprint 1C`). The real orchestration UI (the Assess → Plan → Execute → Reply pipeline console, plus a full end-to-end pipeline **Simulate** tool) still exists under `src/app/_hub_(OLD)/orchestration/`, which was parked wholesale during the v2 hub migration and is **excluded from both `tsc` and ESLint** (`tsconfig.json` `exclude`, `eslint.config.mjs` ignores).

This task moves that UI into the live `(hub)/orchestration/` route, rewires it to the current v2 conventions (`profiles`-based role guard, not the old `hub_users`/`requireRole` path), applies a light visual polish (lucide icons instead of emoji, consistent page container), and makes it pass `npx tsc --noEmit` + `pnpm lint` cleanly — which it has never been subjected to.

All backing infrastructure is already in place and current:

- **API routes** (all present, already migrated to `profiles` + `pm|admin|super_admin` gating):
  `POST /api/assessment`, `POST|PATCH /api/plan`, `POST /api/execution`, `POST /api/execution/[id]/revert`,
  `GET /api/reply` (list is via Supabase client, not this route), `PATCH /api/reply/[id]`, `POST /api/reply/[id]/send`,
  `PATCH /api/zoho`, `POST /api/classification` (used by Simulate).
- **DB tables** (all present in `src/types/database.ts`): `classification_records`, `requirements_assessments`,
  `implementation_plans`, `execution_records`, `reply_drafts`; `customers.automation_paused`,
  `customers.company_name`; `projects.external_project_id`.
- **Sidebar** already has an "Orchestration" nav item → `V2_ROUTES.ORCHESTRATION` (`/orchestration`).
- **Header** already maps `/orchestration` → breadcrumb `Work / Orchestration`.

Scope confirmed with the user: **transfer the main pipeline UI AND the `simulate/` sub-page**, with **light polish** (faithful transfer + emoji→lucide + page-container alignment; no full dark-theme rework).

## Requirements

- [ ] `/orchestration` renders the full pipeline console: automation-paused banner, stage filter tabs (All / Assess / Plan), Requirements Assessment section, Plan Generation section (with nested Execution + Reply Draft sub-sections).
- [ ] `/orchestration/simulate` renders the end-to-end pipeline simulation tool (customer picker, task title/description, run button, per-step status + timings + log stream).
- [ ] Both routes are server-guarded: unauthenticated → redirect `/auth/login`; role not in `admin | super_admin | pm` → redirect `/dashboard` (mirror `src/app/(hub)/desk/tickets/page.tsx:63-69`).
- [ ] The old `hub_users` / `requireRole("/orchestration")` guard is **not** used — it queries the deprecated `hub_users` table.
- [ ] Sidebar "Orchestration" item is shown only to `admin | super_admin | pm` (today it shows to every non-`developer` role, including `client`/`hr`/`marketing`, who would just bounce off the guard).
- [ ] Light polish: replace emoji used as icons/bullets (`⚠️`, `⚠`, `⏳`, `•`) with `lucide-react` equivalents; wrap both pages in a container consistent with other v2 pages.
- [ ] `npx tsc --noEmit` passes (these files have never been type-checked in-tree — expect `Json`-cast fixes).
- [ ] `pnpm lint` passes (never linted in-tree — expect unused-import fixes, e.g. the bare `React` import).
- [ ] No regression to the v2 hub shell, sidebar, header, or any other route.

## Out of Scope / Must-Not-Change

- **No API route changes.** `/api/assessment`, `/api/plan`, `/api/execution*`, `/api/reply*`, `/api/zoho`, `/api/classification` are already correct — do not touch them.
- **No DB / migration changes.** No schema work.
- **No full v2 dark-theme redesign** of the orchestration UI. The `isDark`-prop theming pattern is *not* being introduced here — light polish only. A proper redesign is a separate future task.
- **Do not delete `src/app/_hub_(OLD)/`** or change its `tsconfig`/`eslint` exclusions in this task (other parked routes still live there). Only the `orchestration/` sub-tree is copied out; leaving the originals in place is fine.
- **Do not change** `src/lib/auth/require-role.ts` / `role-access.ts` (the old `/orchestration` rule in `role-access.ts` is harmless dead config now; leave it).
- **Do not re-scope** `classification_records` status/eligibility filters — copy the existing query semantics verbatim.
- Keep the "Execute · Reply stages coming Sprint 5+" footer wording as-is (or drop it — implementer's call; it's cosmetic).

## Proposed File Changes

| File | Action | Purpose |
|------|--------|---------|
| `src/app/(hub)/orchestration/page.tsx` | Modify | Replace stub with server component: auth + `profiles` role guard → render `<OrchestrationContent />`. Keep `export const metadata = { title: "Orchestration" }`; add `export const dynamic = "force-dynamic"`. |
| `src/app/(hub)/orchestration/_content.tsx` | Create | The moved pipeline console client component (from `_hub_(OLD)/orchestration/_content.tsx`), polished + type-clean. |
| `src/app/(hub)/orchestration/simulate/page.tsx` | Create | Server component: same auth + role guard → render `<SimulateContent />`. `export const dynamic = "force-dynamic"`; `metadata = { title: "Orchestration · Simulate" }`. |
| `src/app/(hub)/orchestration/simulate/_simulate-content.tsx` | Create | The moved Simulate client component (from `_hub_(OLD)/orchestration/simulate/page.tsx`, minus its `"use client"` page role → default export `SimulateContent`), polished + type-clean. |
| `src/app/(hub)/_components/v2-hub-sidebar.tsx` | Modify | Gate the "Orchestration" nav item to `admin | super_admin | pm`. |
| `src/app/(hub)/_components/v2-hub-header.tsx` | Modify (optional) | Add explicit `"/orchestration/simulate"` breadcrumb entry (`Work / Orchestration · Simulate`). Prefix-match already yields `Work / Orchestration` without this. |
| `src/config/constants.ts` | Modify (optional) | Add `ORCHESTRATION_SIMULATE: "/orchestration/simulate"` to `V2_ROUTES` for the sidebar/header/links to reference instead of a string literal. |

Optional (recommended, not required): split `_content.tsx` (~1160 lines, well over the ~250-line soft ceiling in `nextjs-file-length-best-practices.md`) into colocated sub-files while it's being moved — e.g. `_badges.tsx` (`StatusBadge`, `PriorityChip`), `_assessment.tsx` (`AssessmentResult`, `TaskRow`), `_plan.tsx` (`PlanRow`, `PlanResult`), `_execution.tsx` (`ExecutionSection`), `_reply.tsx` (`ReplyDraftSection`), leaving `_content.tsx` as the page shell + data load. Keep component behavior byte-for-byte identical. If the split adds risk under time pressure, ship it as one file and file a follow-up.

## Code Context

### Current stub — `src/app/(hub)/orchestration/page.tsx`

```tsx
import type { Metadata } from "next";
export const metadata: Metadata = { title: "Orchestration" };
export default function OrchestrationPage() {
  return (
    <div className="py-6.5 px-8">
      <p className="text-sm text-muted-foreground">v2 · Orchestration · Sprint 1C</p>
    </div>
  );
}
```

### Guard pattern to adopt — `src/app/(hub)/desk/tickets/page.tsx:58-69`

```tsx
export const dynamic = "force-dynamic";

export default async function DeskTicketsPage({ searchParams }: { ... }) {
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  if (!claims?.claims) redirect(V2_ROUTES.AUTH_LOGIN);

  const userId = claims.claims.sub as string;
  const { data: profile } = await supabase.from("profiles").select("role").eq("id", userId).maybeSingle();
  const role = profile?.role ?? null;

  if (role !== "admin" && role !== "super_admin" && role !== "pm") redirect(V2_ROUTES.DASHBOARD);
  // ...
}
```

The new `orchestration/page.tsx` is the same, minus `searchParams`, ending in `return <OrchestrationContent />;`. `simulate/page.tsx` is identical, ending in `return <SimulateContent />;`.

### Old guard being replaced — `src/app/_hub_(OLD)/orchestration/page.tsx`

```tsx
import { requireRole } from "@/lib/auth/require-role";   // ← queries deprecated hub_users, redirects /auth/login|/dashboard
import OrchestrationContent from "./_content";
export default async function OrchestrationPage() {
  await requireRole("/orchestration");
  return <OrchestrationContent />;
}
```

### `_content.tsx` — what it does (from `_hub_(OLD)/orchestration/_content.tsx`, 1160 L)

- `"use client"`. One `useEffect` on mount fires 8 parallel Supabase-browser-client queries:
  - `classification_records`: `.eq("llm_eligible", "YES").in("status", ["pending","reviewed","planning","planned","approved"]).order("created_at",{ascending:false}).limit(50)`
  - `requirements_assessments`: all, `.order("assessment_version",{ascending:false})` → reduced to latest-per-`classification_id`
  - `implementation_plans`: all, `.order("created_at",{ascending:false})` → reduced to latest non-`REJECTED` per classification (joined via `assessment_id` → assessment's `classification_id`)
  - `projects`: `.select("customer_id, external_project_id").not("external_project_id","is",null)` → first project per customer → `zohoProjects` map (used for the "Open in Zoho" deep link)
  - `execution_records`: all → latest per `plan_id`
  - `customers`: `.select("customer_id, automation_paused").eq("automation_paused", true)` → `customerPaused` map
  - `reply_drafts`: `.in("status", ["DRAFT","SENT"]).order("created_at",{ascending:false})` → latest per `classification_id`
  - `customers`: `.select("customer_id, company_name")` → `customerNames` map
- Splits tasks into `assessmentTasks` (no CLEAR assessment and no live plan) vs `planTasks` (CLEAR assessment OR a live non-REJECTED plan).
- `TaskRow` → `POST /api/assessment` `{ classificationId, customerId }`, renders `AssessmentResult` (subtasks + `clarification_draft`, Copy button).
- `PlanRow` → `POST /api/plan` `{ classificationId, customerId, assessmentId }` to generate; `PATCH /api/plan` `{ planId, action: "approve"|"reject", rejectionReason }` to action. On approve, response `{ ok, zohoTaskId }` patches local state.
- `PlanResult` → PM action buttons `PATCH /api/zoho` `{ classificationId, action }` (open/on_hold/active/review/close/reopen); "Open in Zoho" link built from `NEXT_PUBLIC_ZOHO_PORTAL_NAME` + `external_project_id` + `zoho_task_id`.
- `ExecutionSection` → `POST /api/execution` `{ planId, customerId, classificationId }`; then re-reads the `execution_records` row via Supabase client by `data.executionId`. Revert → `POST /api/execution/{id}/revert`.
- `ReplyDraftSection` → `POST /api/reply/{id}/send` `{ content }`; discard → `PATCH /api/reply/{id}` `{ status: "DISCARDED" }`.

### Known type/lint hazards (never checked in-tree)

1. **`Json` casts.** `Json = string | number | boolean | null | { [key: string]: Json } | Json[]`. Direct casts like
   `record.subtasks as Array<{ title: string; status: string; notes?: string }>`,
   `plan.steps as Array<{ order: number; title: string; ... }>`,
   `plan.affected_files as string[]`, `plan.risk_flags as string[]`,
   `record.clarification_draft as string | null`
   will likely trip TS2352 ("Conversion of type 'Json' to type ... may be a mistake"). Fix with `as unknown as T`
   (or narrow local helper types). Current v2 code sidesteps this by declaring local row types with
   `source_meta: Record<string, unknown> | null` — same idea.
2. **Bare `React` import.** `_content.tsx` line 3: `import React, { useEffect, useState, useCallback } from "react";` — `React` is unused (react-jsx runtime). `@typescript-eslint/no-unused-vars` will error. Drop `React`.
3. **Unused lucide imports in Simulate.** `_hub_(OLD)/orchestration/simulate/page.tsx` imports
   `Play, CheckCircle2, XCircle, Loader2, Clock, ChevronRight, AlertTriangle, RotateCcw, Zap` — verify each is
   used; remove any that aren't.
4. **Emoji as icons/bullets** — `⚠️` (paused banner), `⚠ Modified directly in Zoho`, `⏳ Running…`, `• ${flag}`
   risk-flag bullets. Not ESLint-enforced but violates the CLAUDE.md "no emoji as icons or bullets — lucide only"
   convention; the user asked for these swapped (`AlertTriangle`, `Loader2` w/ `animate-spin`, a real bullet dot or
   `list-disc`).
5. **`exhaustive-deps`** warnings in the `useEffect`/`useCallback` hooks are acceptable (project-wide pattern, they're
   warnings not errors) — do not restructure the effects to chase them.
6. **`style={{}}`** — `_content.tsx` uses none; if any slips in during the split, the CLAUDE.md rule is Tailwind
   classes only. `_simulate-content.tsx` — check.

### Simulate `_simulate-content.tsx` extra note

`simulate/page.tsx` is currently a `"use client"` **page** (no guard — it relied on the old `(hub)` layout).
Move its body into `_simulate-content.tsx` (`export default function SimulateContent()`), and let the new
server `simulate/page.tsx` do the guard. Its mount effect reads `customers` (`customer_id, company_name, status`)
and `projects` (`customer_id, sanity_project_id`) via the Supabase browser client — both columns exist; keep as-is.

## Implementation Steps

1. **Read the Next.js 16 docs note in `AGENTS.md`** — server/client component + route conventions may differ from training data. Skim `node_modules/next/dist/docs/` for anything relevant to server-component redirects if unsure.
2. Copy `_hub_(OLD)/orchestration/_content.tsx` → `(hub)/orchestration/_content.tsx`. Fix imports if any are relative; they're all `@/`-absolute so should be fine.
3. Fix type hazards (#1–#2 above): `as unknown as T` for `Json` casts, drop the bare `React` import.
4. Apply light polish (#4): emoji → lucide (`AlertTriangle`, `Loader2 className="animate-spin"`); risk-flag bullets → a `<span>` dot or `list-disc list-inside`. Wrap the page body so its outer padding matches sibling v2 pages (keep the `max-w-*` inner column for readability). Keep all component logic identical.
5. Rewrite `(hub)/orchestration/page.tsx`: `export const dynamic = "force-dynamic"`, keep `metadata`, add the auth + `profiles` role guard (copy from `desk/tickets/page.tsx`), `return <OrchestrationContent />;`.
6. Create `(hub)/orchestration/simulate/_simulate-content.tsx` from the old `simulate/page.tsx` body — remove `"use client"` page semantics into a plain client component `export default function SimulateContent()`, keep `"use client"` directive at top. Remove unused lucide imports (#3), fix any `Json`/`style={{}}` issues.
7. Create `(hub)/orchestration/simulate/page.tsx` — server guard wrapper, `dynamic = "force-dynamic"`, `metadata = { title: "Orchestration · Simulate" }`, `return <SimulateContent />;`.
8. `src/config/constants.ts` (optional): add `ORCHESTRATION_SIMULATE: "/orchestration/simulate"` to `V2_ROUTES`.
9. `v2-hub-sidebar.tsx`: change the `Orchestration` entry so it only appears for `admin | super_admin | pm`. It currently lives inside the `...(!isDev ? [ Desk, Orchestration ] : [])` block — pull `Orchestration` into its own `...((isAdmin || role === "pm") ? [ ... ] : [])` spread (Desk keeps its existing `!isDev` gate). `isAdmin` is already computed as `role === "admin" || role === "super_admin"`.
10. `v2-hub-header.tsx` (optional): add `["/orchestration/simulate"]: { section: "Work", page: "Orchestration · Simulate" }` to `BREADCRUMB_MAP` (or rely on prefix match).
11. (Optional, recommended) Split `_content.tsx` into the colocated sub-files listed above if time allows; otherwise leave as one file and note the follow-up.
12. Run `npx tsc --noEmit` and `pnpm lint`; fix everything they surface (these files are being checked for the first time).
13. Browser acceptance (dev server): see Verification.

## Acceptance Criteria

- [ ] `npx tsc --noEmit` → clean (no new errors).
- [ ] `pnpm lint` → clean (no new errors; pre-existing unrelated warnings OK).
- [ ] `GET /orchestration` as a `pm` or `admin` user → renders the pipeline console; stage tabs switch; assessment/plan/execute/reply actions hit their endpoints (verify at least the page loads with live data and one "Run Assessment" or a visibly-correct empty state).
- [ ] `GET /orchestration` as `developer` / `client` / `hr` / `marketing` → redirected to `/dashboard`; sidebar shows no "Orchestration" item for those roles.
- [ ] `GET /orchestration` logged out → redirected to `/auth/login`.
- [ ] `GET /orchestration/simulate` as `pm`/`admin` → renders; customer dropdown populates. (Do **not** run a full live simulation against a real customer unless the user asks — it creates real `classification_records` and can trigger real execution.)
- [ ] `GET /orchestration/simulate` as a disallowed role / logged out → redirected as above.
- [ ] Sidebar "Orchestration" click navigates to `/orchestration` and highlights active; breadcrumb reads `Work / Orchestration` (and `Work / Orchestration · Simulate` on the sub-page).
- [ ] No emoji rendered as icons/bullets in the transferred UI.
- [ ] Dashboard, Desk, Projects, Customers, Time Logs, KB all still load (no shell/sidebar/header regression).

## Verification

```bash
# Type + lint (primary gate — these files have never been checked in-tree)
npx tsc --noEmit
pnpm lint

# Manual / browser (dev server)
pnpm dev
#  → sign in as a pm/admin user
#  → visit /orchestration            (console renders, tabs work, data or correct empty states)
#  → visit /orchestration/simulate   (tool renders, customer dropdown populates — do NOT run a live pipeline)
#  → confirm sidebar "Orchestration" item + Work/Orchestration breadcrumb
#  → (optional) sign in as developer/client → /orchestration redirects to /dashboard, no sidebar item
#  → spot-check /dashboard, /desk/tickets, /projects/v2 for no regressions
```

No automated test runner is configured (per CLAUDE.md) — verification is `tsc --noEmit` + `pnpm lint` + browser acceptance.

## Compatibility Touchpoints

- **Routing:** adds one real route (`/orchestration/simulate`) and activates one existing stub (`/orchestration`). Both inside the `(hub)` group, so they inherit the hub auth layout automatically.
- **Docs:** update `CLAUDE.md` Project Structure only if the `orchestration/` entry needs correcting (currently says "Sprints 3–5 — M3/M5/M6/M8"); optionally note that `/orchestration` is now live with `/orchestration/simulate` as its dev tool. Not required for merge.
- **`_hub_(OLD)`:** originals left in place (still tsc/eslint-excluded). No change to `tsconfig.json` / `eslint.config.mjs`.
- **No** packaging, env var, migration, MCP-tool, or install-surface impact.
- **Sidebar role visibility** narrows for `client`/`hr`/`marketing` (they lose an item that never worked for them) — intended.

## Implementation Notes

### What Changed
- `/orchestration` now renders the full Assess → Plan → Execute → Reply pipeline console (transferred from `_hub_(OLD)/orchestration/_content.tsx`) behind a `profiles`-based server role guard (`admin | super_admin | pm`), replacing the dead stub.
- `/orchestration/simulate` is now a live route: server guard wrapper + `_simulate-content.tsx` client component (transferred from the old `simulate/page.tsx`, which was a bare `"use client"` page with no guard).
- Sidebar "Orchestration" item pulled out of the shared `!isDev` block into its own `(isAdmin || role === "pm")` spread, so `client`/`hr`/`marketing` no longer see an item that only bounces them to `/dashboard`.
- Header breadcrumb map gained an explicit `/orchestration/simulate` entry (`Work / Orchestration · Simulate`).
- `V2_ROUTES.ORCHESTRATION_SIMULATE` added to `src/config/constants.ts`.
- Light polish on the transferred UI: dropped the unused bare `React` import; `Json`-field casts changed to `as unknown as T` (first time these files hit `tsc`); emoji swapped for lucide — `⚠️`/`⚠` → `<AlertTriangle>`, `⏳ Running…` → `<Loader2 className="animate-spin">`; risk-flag `• ` bullets → a real `<ul className="list-disc list-inside">`; in-content H1 "Pipeline" → "Orchestration" to match the nav/breadcrumb; outer container `max-w-195 mx-auto px-6 py-7` → `max-w-4xl mx-auto px-8 py-6.5`. Simulate event-log strings had `✓`/`❌` replaced with plain text.

### Files Changed
- `src/app/(hub)/orchestration/page.tsx` — replaced stub with auth + `profiles` role guard rendering `<OrchestrationContent />`; `dynamic = "force-dynamic"`.
- `src/app/(hub)/orchestration/_content.tsx` — **new**; transferred + polished pipeline console client component.
- `src/app/(hub)/orchestration/simulate/page.tsx` — **new**; server guard wrapper.
- `src/app/(hub)/orchestration/simulate/_simulate-content.tsx` — **new**; transferred + polished simulator client component.
- `src/app/(hub)/_components/v2-hub-sidebar.tsx` — "Orchestration" nav item gated to `admin | super_admin | pm`.
- `src/app/(hub)/_components/v2-hub-header.tsx` — breadcrumb entry for `/orchestration/simulate`.
- `src/config/constants.ts` — `V2_ROUTES.ORCHESTRATION_SIMULATE`.
- `src/app/_hub_(OLD)/orchestration/` — **left untouched** (still `tsc`/eslint-excluded); the originals remain as dead reference.

### Deviations From Plan
- **`_content.tsx` not split into sub-files.** The plan listed this as optional/recommended. Kept as one 1160-line file to minimise import-wiring risk on a transfer whose primary goal is "no errors". Follow-up: colocated split (`_badges` / `_assessment` / `_plan` / `_execution` / `_reply`) if the file is touched again.
- **Impeccable design hook** flags ~17 pre-existing visual-style findings in the transferred `_content.tsx` (literal font sizes off the DESIGN.md type ramp, gray-text-on-colored-background). These are the old file's light-only conventions and are **explicitly out of scope** ("no full v2 dark-theme redesign" — user chose "light polish", not "faithful transfer"; the polish done is the emoji/container/header work above). Left as-is, not config-suppressed (suppression needs explicit user confirmation). A proper v2 redesign of this surface is a separate future task.

### Verification Run
- `npx tsc --noEmit` — PASS (clean; the `Json`-cast fixes were needed exactly as the plan predicted).
- `pnpm lint` — PASS (0 errors; the only 2 warnings are pre-existing, in the unrelated `projects/v2/.../onboarding-workspace/_checklist-tab.tsx`).
- Browser acceptance — NOT RUN (test stage). Do **not** run a full live pipeline in `/orchestration/simulate` — it creates real `classification_records` and can trigger real execution.

## Quality Gate Notes

### Result
PASS

### Standards Review
- **Guard duplication (not a finding):** the ~6-line auth + `profiles` role check is copy-pasted across `orchestration/page.tsx` and `simulate/page.tsx`. This is the established v2 convention (identical to `desk/tickets/page.tsx` and other v2 pages inline it too) — extracting a shared helper would be new scope. Left as-is intentionally.
- **`any`-typed simulator (`_simulate-content.tsx`):** `apiFetch` returns untyped `r.json()`; `classifyRes`/`assessRes`/`planRes`/`execRes` and their property accesses are unchecked `any`. Transferred verbatim from the old file; not newly introduced. It's a dev/QA-only tool. Acceptable but user-visible — see Deviations.
- **`as unknown as T` casts (`_content.tsx`, 4 sites):** blunt double-casts for `Json` columns (`subtasks`, `steps`, `affected_files`, `risk_flags`), each guarded with `?? []`. The plan predicted exactly this. Weaker than a local narrowed row type but localised to render-time shape assumptions. Minor.
- **Dead status-filter values:** `classification_records` query keeps `"reviewed"` / `"planned"` in the `.in("status", …)` list — not in the current status constraint. Transferred verbatim; harmless no-op entries. Minor.
- **Stale footer text:** `_content.tsx` renders "Execute · Reply stages coming Sprint 5+" while the Execution and Reply Draft sub-sections are, in fact, rendered. Cosmetically misleading; transferred verbatim. Flagged for the test/document stage to correct or drop.
- Error handling, naming, single-responsibility, no-secrets, no-console-logging: all clean. Emoji-as-icon/bullet cleanup done as planned.
- `npx tsc --noEmit` + `pnpm lint` re-confirmed PASS (0 errors).

### Deviations
- **Medium — `_content.tsx` kept as one 1160-line file.** Well over the `nextjs-file-length-best-practices.md` soft ceiling. Plan made the split optional; deferred to a follow-up. Risk acceptable: it's a verbatim transfer of working code, behaviour unchanged.
- **Medium — `_simulate-content.tsx` carries `any`-typed API-response handling.** Pre-existing in the transferred code; the project has typed alternatives. Confined to a non-production dev tool. Documented.
- **Medium — parked originals in `_hub_(OLD)/orchestration/` now duplicate the live files.** Plan explicitly said not to delete `_hub_(OLD)/`. Dead reference copies, `tsc`/eslint-excluded.
- **Minor — `as unknown as` casts, dead status-filter values, stale footer string** (all above).
- No Major deviations: nothing violates a requirement, expands product scope, or changes architecture without approval.

### Required Fixes
- None (PASS).
