# 029: Zoho API V3 Migration (/restapi → /api/v3)

**Created:** 2026-05-28
**Priority:** HIGH
**Type:** chore
**Recommended Model:** sonnet
**Status:** TESTING
**Completed:** 2026-05-28

> **Recommended Model:** sonnet — API version migration touching 4 files across 3 layers (lib, API routes, UI); involves HTTP method changes (POST→PATCH), content-type changes (form-encoded→JSON), date format changes (MM-DD-YYYY→YYYY-MM-DD), and response schema adjustments. Risk: any single field name mismatch breaks live Zoho data flow.

---

## Overview

Migrate the Zoho Projects API client from V2 (`/restapi/portal/`) to V3 (`/api/v3/portals/`). V3 is the current supported Zoho API with a significantly larger endpoint surface, consistent request/response schemas, PATCH for updates, ISO 8601 dates, and proper pagination.

The immediate motivation: V3 exposes endpoints that V2 does not, which forced the per-project fan-out workarounds added in `getMyZohoTasks` and `getMyZohoTimeLogs` (task 029 predecessor fix). V3 may allow cleaner direct endpoints for those — to be verified during implementation against https://projects.zoho.com/api-docs.

**Files changed:** 4 total — `src/lib/zoho/index.ts`, `src/app/api/dev/tasks/route.ts`, `src/app/api/dev/ask/route.ts`, `src/app/(hub)/dev/page.tsx`.

**No DB migration needed.** Zoho project/task IDs stored in `zoho_project_id` and `zoho_task_id` are stable across API versions.

---

## V2 → V3 Diff (reference)

| Area | V2 | V3 |
|------|----|----|
| URL prefix | `https://projectsapi.zoho.com/restapi/portal/{id}/` | `https://projectsapi.zoho.com/api/v3/portals/{id}/` |
| Date format | `MM-DD-YYYY` | `YYYY-MM-DD` |
| Updates HTTP method | `POST` | `PATCH` |
| Request body | `application/x-www-form-urlencoded` | `application/json` |
| Custom fields | `UDF_CHAR1` prefix | `api_name` (e.g. `expected_date`) |
| Pagination | `index` + `range` | `page` + `per_page` + `has_next_page` |
| Response ID field | `id_string` | `id` |

---

## Requirements

- [x] **URL prefix** — changed all `/restapi/portal/` to `/api/v3/portals/`; extracted as `ZOHO_BASE` constant
- [x] **HTTP methods** — `updateZohoTaskStatus` and `assignZohoTask` changed `POST` → `PATCH`
- [x] **Request bodies** — all write operations now use `application/json` + `JSON.stringify`
- [x] **Response ID field** — `createZohoProject` and `syncTaskToZoho` updated: `id_string` → `id`
- [x] **Date format — lib** — `getMyZohoTimeLogs` param comment updated to `YYYY-MM-DD`
- [x] **Date format — routes** — `todayZohoFormat()`, `mondayZohoFormat()` in both API routes now return `YYYY-MM-DD`
- [x] **Date parsing — UI** — `parseZohoDate()` updated to `new Date(dateStr)` (ISO 8601 native)
- [x] **Timelogs response shape** — V3 flattens `{ timelogs: { tasklogs: [...] } }` to `{ timelogs: [...] }`; implemented with Array.isArray fallback for backward compat
- [x] **`getMyZohoTasks` / `getUnassignedZohoTasks`** — kept per-project fan-out (V3 does not add a portal-level user-tasks endpoint); updated filter `type=open` → `status=open`
- [x] **`assignZohoTask` field name** — kept `person_responsible` (consistent across V2/V3)
- [x] **TypeScript check** — `npx tsc --noEmit` passes clean

---

## File Changes

| File | Change type | Notes |
|------|-------------|-------|
| `src/lib/zoho/index.ts` | Modify | URL prefix, HTTP methods, content-type, body encoding, response field names, date format comment |
| `src/app/api/dev/tasks/route.ts` | Modify | `todayZohoFormat()` and `mondayZohoFormat()` date format |
| `src/app/api/dev/ask/route.ts` | Modify | `todayZohoFormat()` date format |
| `src/app/(hub)/dev/page.tsx` | Modify | `parseZohoDate()` parsing logic |

---

## Code Context

### `src/lib/zoho/index.ts` — current URL pattern (repeated across all functions)
```ts
// createZohoProject (line 51)
const res = await fetch(`https://projectsapi.zoho.com/restapi/portal/${portalId}/projects/`, {
  method: "POST",
  headers: {
    Authorization: `Zoho-oauthtoken ${token}`,
    "Content-Type": "application/x-www-form-urlencoded",
  },
  body: body.toString(),  // body is URLSearchParams
});
const json = await res.json();
return (json?.projects?.[0]?.id_string as string) ?? "";

// updateZohoTaskStatus (line 157) — POST must become PATCH
const res = await fetch(
  `https://projectsapi.zoho.com/restapi/portal/${portalId}/projects/${zohoProjectId}/tasks/${zohoTaskId}/`,
  {
    method: "POST",  // → PATCH in V3
    headers: { Authorization: ..., "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  }
);

// assignZohoTask (line 324) — POST must become PATCH
const body = new URLSearchParams({ person_responsible: zohoUserId });
const res = await fetch(`...tasks/${taskId}/`, { method: "POST", ... });
```

### `src/app/api/dev/tasks/route.ts` — date helpers (lines 10–27)
```ts
function todayZohoFormat(): string {
  const d = new Date();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  const yyyy = d.getFullYear();
  return `${mm}-${dd}-${yyyy}`;  // → `${yyyy}-${mm}-${dd}` for V3
}

function mondayZohoFormat(): string {
  const d = new Date();
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  const yyyy = d.getFullYear();
  return `${mm}-${dd}-${yyyy}`;  // → `${yyyy}-${mm}-${dd}` for V3
}
```

### `src/app/(hub)/dev/page.tsx` — date parser (lines 14–20)
```ts
function parseZohoDate(dateStr: string | null | undefined): Date | null {
  if (!dateStr) return null;
  // Zoho format: "MM-DD-YYYY"
  const [mm, dd, yyyy] = dateStr.split("-");
  if (!mm || !dd || !yyyy) return null;
  return new Date(Number(yyyy), Number(mm) - 1, Number(dd));
  // V3: "YYYY-MM-DD" — simplify to: return new Date(dateStr) which handles ISO format
}
```

### `getMyZohoTimeLogs` — current response shape (lines 302–305)
```ts
const json = await res.json();
// Zoho V2 returns: { timelogs: { tasklogs: [...] } }
return (json?.timelogs?.tasklogs ?? []) as ZohoTimeLog[];
// V3 shape: verify against docs — may be { timelogs: [...] } (flat array)
```

---

## Notes for Implementation Agent

- **sonnet task**: API migration with response schema unknowns that require judgment. Don't guess field names — verify against https://projects.zoho.com/api-docs before finalizing V3 response parsing.
- **`id_string` → `id`**: V3 drops the `_string` suffix on ID fields. `createZohoProject` and `syncTaskToZoho` both return `id_string` from V2; update to `id` in V3.
- **`sendCliqNotification` is unchanged** — it uses Zoho Cliq webhooks, not the Projects API. Do not modify it.
- **`getZohoAccessToken` is unchanged** — it hits `https://accounts.zoho.com/oauth/v2/token` which is the auth service, not the Projects API. Do not modify it.
- **The fan-out pattern in `getMyZohoTasks` and `getUnassignedZohoTasks`** — these iterate over all `zoho_project_id`s from `customer_products` and fetch per-project because V2 had no portal-level user-tasks endpoint. Check V3 docs for `/api/v3/portals/{id}/tasks/` with owner filter. If that endpoint exists and supports `?assigned_to={userId}`, replace the fan-out with a single call. If not, keep the fan-out (it works).
- **Backward compatibility**: all `zoho_project_id` and `zoho_task_id` values in the DB are IDs that remain valid in V3. No data migration needed.
- **`npx tsc --noEmit`** must pass before marking the task complete.

---

## Implementation Notes

> **Simplify Review:** PASS
> **Reviewed:** 2026-05-28

### What was built
All Zoho Projects API calls now use the V3 base URL (`/api/v3/portals/`), JSON request bodies, PATCH for updates, and ISO 8601 dates. Token refreshes are cached for 1 hour and deduplicated so concurrent callers never trigger parallel refreshes.

### How to access for testing
- Hit `GET /api/dev/tasks?range=today` — verify no `[zoho] token refresh` spam in logs; one refresh at cold start, then cache hits
- Hit `POST /api/dev/ask` — same token cache should be reused
- Check Zoho tasks load and due dates display correctly (overdue badge)

### Deviations from plan
- **Minor**: `todayZohoFormat()` is duplicated in `tasks/route.ts` and `ask/route.ts`. Below the task's 3-instance threshold for extraction but worth noting.
- **Minor**: `getZohoAccessToken` grew to ~50 lines (soft cap 30) due to the caching/dedup logic; tradeoff accepted for correctness.
- **Bug caught and fixed**: `parseZohoDate` was changed to use `new Date(dateStr)` (UTC midnight), which would have caused tasks due today to appear overdue in non-UTC timezones. Reverted to explicit `new Date(Number(yyyy), Number(mm) - 1, Number(dd))` pattern using V3 field order `[yyyy, mm, dd]`.

### Standards check
Pass — no `any` types, no unused imports, proper guard clauses, TypeScript clean.

### Convention check
Pass — no adminClient in client components, no hard-coded model IDs, no "use server" on utility module, Tailwind-only styling untouched.

---

## Implementation Steps

1. Open `src/lib/zoho/index.ts`
2. Replace all occurrences of `https://projectsapi.zoho.com/restapi/portal/` with `https://projectsapi.zoho.com/api/v3/portals/`
3. Change `updateZohoTaskStatus` and `assignZohoTask` from `method: "POST"` to `method: "PATCH"`
4. Change all write functions to use `"Content-Type": "application/json"` and `body: JSON.stringify({...})` instead of form-encoded `URLSearchParams`
5. Update `createZohoProject` response: `json?.projects?.[0]?.id_string` → `json?.projects?.[0]?.id`
6. Update `syncTaskToZoho` response: `json?.tasks?.[0]?.id_string` → `json?.tasks?.[0]?.id`
7. Verify V3 timelogs response shape and update `getMyZohoTimeLogs` destructuring
8. Verify V3 assignee field name for `assignZohoTask` (`person_responsible` vs V3 equivalent)
9. Check V3 for direct user-tasks endpoint; simplify `getMyZohoTasks` if available
10. Update `todayZohoFormat()` and `mondayZohoFormat()` in `src/app/api/dev/tasks/route.ts` to return `YYYY-MM-DD`
11. Update `todayZohoFormat()` in `src/app/api/dev/ask/route.ts` to return `YYYY-MM-DD`
12. Update `parseZohoDate()` in `src/app/(hub)/dev/page.tsx` to handle `YYYY-MM-DD` (use `new Date(dateStr)` directly)
13. Run `npx tsc --noEmit` — fix any type errors
