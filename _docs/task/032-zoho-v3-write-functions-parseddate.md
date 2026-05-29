# Task 032 — Zoho V3: Fix 3 Write Functions + parseZohoDate

> **Investigation:** /understand ran before this spec. Findings embedded below.
> **Recommended Model:** haiku
> **Type:** patch (bug fixes — no schema changes, no new API surface)
> **Status:** TESTING
> **Completed:** 2026-05-29

## Implementation Notes

> **Simplify Review:** PASS
> **Reviewed:** 2026-05-29

### What was built
Four live Zoho bugs fixed: `createZohoProject`, `syncTaskToZoho`, and `updateZohoTaskStatus` now use `application/json` bodies (V3 spec), returning the correct `id` field instead of the V2 `id_string`. `updateZohoTaskStatus` changed from POST to PATCH with `completion_percentage` string body. `parseZohoDate` in dev dashboard now uses native `new Date(dateStr)` to handle ISO 8601 dates — overdue highlighting functional again.

### How to access for testing
- Customer onboarding → Zoho project creation no longer 415
- Plan approval → `syncTaskToZoho` no longer 415; `zoho_task_id` now populated
- Execution complete/revert → `updateZohoTaskStatus` PATCH succeeds
- Dev dashboard → overdue tasks now highlight correctly when `due_date` is past

### Deviations from plan
None.

### Standards check
Pass — all patterns follow existing `assignZohoTask` V3 template. Guard clauses intact. `console.warn`/`console.error` pattern consistent with rest of file.

### Convention check
Pass — `adminClient` usage comment present in `syncTaskToZoho`. No `"use server"` misuse. No style props.

## Goal

Complete the Zoho V3 migration for three write functions that were missed when the URL base was updated. Also fix a silent overdue-detection bug in the dev dashboard caused by a V2 date parser still receiving ISO 8601 dates.

These are live bugs:
- `createZohoProject` fails silently with HTTP 415 on customer onboarding (V3 rejects `application/x-www-form-urlencoded`)
- `syncTaskToZoho` fails silently with HTTP 415 on plan approval
- `updateZohoTaskStatus` fails silently on plan COMPLETE/webhook status sync
- `isOverdue()` always returns `false` — overdue highlighting is permanently broken in the dev dashboard

---

## Requirements

1. `createZohoProject`: switch to `application/json` + `JSON.stringify`, return `json?.projects?.[0]?.id`
2. `syncTaskToZoho`: switch to `application/json` + `JSON.stringify`, return `json?.tasks?.[0]?.id`
3. `updateZohoTaskStatus`: switch method to `PATCH`, `application/json`, body `{ completion_percentage: "100" | "0" }` — avoids needing to resolve status IDs at runtime
4. `parseZohoDate` in dev/page.tsx: replace split-based V2 parser with `new Date(dateStr)` — ISO 8601 is natively handled
5. Fix two stale comments: line 2 of zoho/index.ts (`// Using V2`) and the `getMyZohoTimeLogs` date comment
6. No new migrations, no new env vars, no new packages

---

## File Changes

| File | Lines | Change |
|------|-------|--------|
| `src/lib/zoho/index.ts` | 2 | Update stale V2 comment |
| `src/lib/zoho/index.ts` | 76–94 | `createZohoProject`: JSON body + `id` field |
| `src/lib/zoho/index.ts` | 147–168 | `syncTaskToZoho`: JSON body + `id` field |
| `src/lib/zoho/index.ts` | 183–192 | `updateZohoTaskStatus`: PATCH + JSON body |
| `src/lib/zoho/index.ts` | ~308 | Fix stale date format comment |
| `src/app/(hub)/dev/page.tsx` | 14–19 | `parseZohoDate`: ISO 8601 parser |

---

## Implementation Steps

### Step 1 — `createZohoProject` (zoho/index.ts ~76–94)

Replace form-encoded body with JSON:

```ts
const res = await fetch(`${ZOHO_PROJECTSAPI_BASE}/projects`, {
  method: "POST",
  headers: {
    Authorization: `Zoho-oauthtoken ${token}`,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    name: projectName,
    description: `WebriQ Hub managed project for ${customerId}`,
  }),
});
// ...
return (json?.projects?.[0]?.id as string) ?? "";  // was id_string
```

### Step 2 — `syncTaskToZoho` (zoho/index.ts ~147–168)

Replace URLSearchParams with JSON:

```ts
const res = await fetch(
  `${ZOHO_PROJECTSAPI_BASE}/projects/${product.zoho_project_id}/tasks`,
  {
    method: "POST",
    headers: {
      Authorization: `Zoho-oauthtoken ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      name: input.title,
      ...(input.description ? { description: input.description } : {}),
    }),
  }
);
// ...
return (json?.tasks?.[0]?.id as string) ?? "";  // was id_string
```

### Step 3 — `updateZohoTaskStatus` (zoho/index.ts ~183–192)

Change POST → PATCH + form-encoded → JSON + `completion_percentage`:

```ts
const res = await fetch(
  `${ZOHO_PROJECTSAPI_BASE}/projects/${zohoProjectId}/tasks/${zohoTaskId}`,
  {
    method: "PATCH",                            // was POST
    headers: {
      Authorization: `Zoho-oauthtoken ${token}`,
      "Content-Type": "application/json",       // was application/x-www-form-urlencoded
    },
    body: JSON.stringify({
      completion_percentage: completed ? "100" : "0",  // was URLSearchParams { completed }
    }),
  }
);
```

### Step 4 — `parseZohoDate` (dev/page.tsx:14–19)

Replace V2 split-parse with ISO 8601 native parse:

```ts
function parseZohoDate(dateStr: string | null | undefined): Date | null {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  return isNaN(d.getTime()) ? null : d;
}
```

### Step 5 — Stale comments

- `src/lib/zoho/index.ts` line 2: `// Using V2 REST API...` → `// Zoho Projects API V3 (/api/v3/portal/)`
- `src/lib/zoho/index.ts` near `getMyZohoTimeLogs` date param comment: update `"MM-DD-YYYY"` → `"YYYY-MM-DD"` to match ISO 8601

---

## Code Context

### Pattern to follow — `assignZohoTask` (zoho/index.ts:388–402)
```ts
const res = await fetch(
  `${ZOHO_PROJECTSAPI_BASE}/projects/${projectId}/tasks/${taskId}`,
  {
    method: "PATCH",
    headers: {
      Authorization: `Zoho-oauthtoken ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      owners_and_work: {
        owners: [{ add: [{ zpuid }] }],
      },
    }),
  }
);
```

### Current broken — `createZohoProject` (zoho/index.ts:76–94)
```ts
const res = await fetch(`${ZOHO_PROJECTSAPI_BASE}/projects`, {
  method: "POST",
  headers: {
    Authorization: `Zoho-oauthtoken ${token}`,
    "Content-Type": "application/x-www-form-urlencoded",       // ← V2, causes 415
  },
  body: new URLSearchParams({
    name: projectName,
    description: `WebriQ Hub managed project for ${customerId}`,
  }).toString(),
});
// ...
return (json?.projects?.[0]?.id_string as string) ?? "";       // ← V2 field, now null
```

### Current broken — `syncTaskToZoho` body (zoho/index.ts:147–158)
```ts
const body = new URLSearchParams({ name: input.title });       // ← V2 encoding
if (input.description) body.set("description", input.description);
// ...
"Content-Type": "application/x-www-form-urlencoded",           // ← causes 415
body: body.toString(),
// ...
return (json?.tasks?.[0]?.id_string as string) ?? "";          // ← V2 field, now null
```

### Current broken — `updateZohoTaskStatus` (zoho/index.ts:183–192)
```ts
method: "POST",                                                 // ← should be PATCH in V3
"Content-Type": "application/x-www-form-urlencoded",           // ← causes 415
body: new URLSearchParams({ completed: completed ? "true" : "false" }).toString(),
```

### Current broken — `parseZohoDate` (dev/page.tsx:14–19)
```ts
function parseZohoDate(dateStr: string | null | undefined): Date | null {
  if (!dateStr) return null;
  // V2 format: "MM-DD-YYYY"
  const [mm, dd, yyyy] = dateStr.split("-");
  if (!mm || !dd || !yyyy) return null;
  return new Date(Number(yyyy), Number(mm) - 1, Number(dd));  // ← mis-parses "2026-05-30"
}
```

---

## Notes for Implementation Agent

- **haiku rationale**: all 4 changes mirror the existing `assignZohoTask` V3 pattern exactly — no judgment calls required.
- **V3 task update body**: use `completion_percentage: "100" | "0"` (string, not number) — confirmed from Zoho V3 PATCH example showing `"completion_percentage": "-"` as a string field. Avoids needing to resolve portal-specific status IDs.
- **`name` field unchanged**: V3 task creation still uses `name` (not `task_name`) — confirmed from V3 docs POST example.
- **`id` not `id_string`**: V3 responses use `id` consistently. All three write functions currently read `id_string` which is now `undefined`, silently returning `""`.
- **`parseZohoDate` fix is one-liner**: `new Date(dateStr)` handles ISO 8601 natively. The `isNaN` guard preserves the null-return contract that `isOverdue()` depends on.
- **Don't change `getMyZohoTasks`, `getUnassignedZohoTasks`, `getMyZohoTimeLogs`, or `assignZohoTask`** — these are already V3-correct.
- **No Zoho auth changes** — token fetch pattern is unchanged.
