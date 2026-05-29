# Task 030 — Classification Review: Code Quality + Audit Trail

> **Investigation:** /understand ran before this spec. Findings embedded below.
> **Recommended Model:** haiku
> **Type:** patch (enhancement — no DB schema changes, no breaking API changes)
> **Status:** TESTING
> **Completed:** 2026-05-29
> **Implementation Notes:** All 4 tasks complete. TypeScript check passes (0 errors). Zoho + hub_users fetches refactored to run in parallel via Promise.all in pm/tasks/page.tsx (async-parallel best practice). The `reviewed_at` audit line reuses the existing `formatAge()` helper rather than importing formatRelativeTime from utils.

**Goal:** Fix three code quality issues found in the classification review workflow and surface the existing `reviewed_by` / `reviewed_at` audit data in the tasks-tab UI.

---

## File Map

| File | Action | Responsibility |
|------|--------|----------------|
| `src/types/hub.ts` | Modify | Expand `ClassificationStatus` to match actual DB constraint |
| `src/app/api/classification/[id]/route.ts` | Modify | Add Zod validation (align with plan/route.ts pattern) |
| `src/components/hub/pm-tabs/tasks-tab.tsx` | Modify | Replace hardcoded enum arrays with imports; add reviewer audit line |
| `src/app/(hub)/pm/page.tsx` | Modify | Fetch hub_users and pass reviewer map to TasksTab |

> **No test runner configured.** Validate with `npx tsc --noEmit` after all changes.

---

## Task 1: Expand `ClassificationStatus` in `hub.ts`

**File:** `src/types/hub.ts`

**Problem:** Line 48 currently defines:
```ts
export type ClassificationStatus = "pending" | "reviewed" | "rejected";
```
The actual DB constraint (migration 013) allows 10+ values that are used throughout the codebase but absent from this type — causing silent narrowing wherever `ClassificationStatus` is consumed.

**Full DB constraint values (from migration 013):**
`pending`, `reviewed`, `rejected`, `planning`, `planned`, `approved`, `open`, `on_hold`, `active`, `review`, `closed`

- [ ] **Step 1: Replace `ClassificationStatus` on line 48**

```ts
export type ClassificationStatus =
  | "pending"
  | "reviewed"
  | "rejected"
  | "planning"
  | "planned"
  | "approved"
  | "open"
  | "on_hold"
  | "active"
  | "review"
  | "closed";
```

> Note: `"review"` (PM pipeline action value) and `"reviewed"` (classification outcome) are different values on the same column. Do not merge them.

- [ ] **Step 2: Run `npx tsc --noEmit` and fix any new type errors** caused by existing code that assumed the narrower type (e.g., exhaustive switches). There should be none in the current codebase — the type was being used permissively — but verify.

---

## Task 2: Add Zod Validation to Classification PATCH Route

**File:** `src/app/api/classification/[id]/route.ts`

**Problem:** The route manually validates fields (lines 31–34) without Zod. The rest of the codebase (e.g., `plan/route.ts:8-18`) uses `z.object().safeParse()`. This is an inconsistency the investigation flagged.

**Pattern to follow** (`plan/route.ts:8-18`):
```ts
import { z } from "zod";

const ApproveBody = z.object({
  action: z.enum(["approve", "reject"]),
  ...
});
```

**Current classification route body handling (lines 24–34):**
```ts
let body: ReclassifyBody;
try {
  body = await req.json();
} catch {
  return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
}

const { task_type, priority, llm_eligible } = body;
if (!task_type || !priority || !llm_eligible) {
  return NextResponse.json({ error: "task_type, priority, and llm_eligible are required" }, { status: 400 });
}
```

- [ ] **Step 1: Add Zod schema and replace manual validation**

Replace `ReclassifyBody` type and manual validation with:

```ts
import { z } from "zod";

const ReclassifyBody = z.object({
  task_type: z.enum([
    "CONTENT_UPDATE", "SETTINGS_CHANGE", "BLOG_PUBLISH", "ASSET_UPLOAD",
    "CODE_CHANGE_MINOR", "SEO_UPDATE", "BUG_REPORT", "FEATURE_REQUEST",
    "STRATEGIC", "OTHER",
  ]),
  priority: z.enum(["CRITICAL", "HIGH", "NORMAL", "LOW"]),
  llm_eligible: z.enum(["YES", "NO", "HUMAN_ONLY"]),
});
```

Replace the try/catch + manual check block with:
```ts
let rawBody: unknown;
try {
  rawBody = await req.json();
} catch {
  return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
}

const parsed = ReclassifyBody.safeParse(rawBody);
if (!parsed.success) {
  return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid body" }, { status: 400 });
}
const { task_type, priority, llm_eligible } = parsed.data;
```

Remove the old `ReclassifyBody` type import/declaration. The `TaskType`, `TaskPriority`, `LLMEligibility` imports from `hub.ts` can also be removed since Zod now drives the validation.

- [ ] **Step 2: Run `npx tsc --noEmit` to confirm no type regressions**

---

## Task 3: Replace Hardcoded Enum Arrays in `ReclassifyModal`

**File:** `src/components/hub/pm-tabs/tasks-tab.tsx`

**Problem:** Lines 31–35 define local `as const` arrays that duplicate the canonical types in `hub.ts`:
```ts
const TASK_TYPES = [
  "CONTENT_UPDATE", "SETTINGS_CHANGE", "BLOG_PUBLISH", "ASSET_UPLOAD",
  "CODE_CHANGE_MINOR", "SEO_UPDATE", "BUG_REPORT", "FEATURE_REQUEST", "STRATEGIC", "OTHER",
] as const;
const PRIORITIES = ["CRITICAL", "HIGH", "NORMAL", "LOW"] as const;
```

If `TaskType` or `TaskPriority` in `hub.ts` ever changes, the modal silently falls out of sync.

- [ ] **Step 1: Replace the local arrays with derived arrays from hub.ts types**

Since TypeScript types can't be iterated at runtime, derive the arrays from the same source of truth used in the Zod schema (Task 2). Add these constants at the top of tasks-tab.tsx (after imports), replacing the existing local declarations:

```ts
const TASK_TYPES: TaskType[] = [
  "CONTENT_UPDATE", "SETTINGS_CHANGE", "BLOG_PUBLISH", "ASSET_UPLOAD",
  "CODE_CHANGE_MINOR", "SEO_UPDATE", "BUG_REPORT", "FEATURE_REQUEST", "STRATEGIC", "OTHER",
];
const PRIORITIES: TaskPriority[] = ["CRITICAL", "HIGH", "NORMAL", "LOW"];
```

This keeps the values in one authoritative place while giving the arrays proper TypeScript types (`TaskType[]`, `TaskPriority[]`) that will error at compile-time if an invalid value is added.

- [ ] **Step 2: Add `TaskType` and `TaskPriority` to the hub.ts import at the top of tasks-tab.tsx**

The file already imports from `@/types/hub` — add `TaskType` and `TaskPriority` to that import.

- [ ] **Step 3: Run `npx tsc --noEmit`**

---

## Task 4: Surface Reviewer Audit Data in Tasks-Tab

**Problem:** `reviewed_by` (UUID) and `reviewed_at` (timestamp) are written to `classification_records` on every reclassification but are never shown in the UI. The "✓ Classified" status cell shows no information about who reviewed it or when.

**Goal:** Under "✓ Classified" in the Status column, show:
> Reviewed by **[name]** · 2h ago

### Step A: Fetch reviewer map in pm/page.tsx

**File:** `src/app/(hub)/pm/page.tsx`

- [ ] **Step 1: Add a hub_users fetch for reviewer display names**

In the server component's data-fetching logic, add alongside the existing queries:
```ts
const { data: hubUsers } = await supabase
  .from("hub_users")
  .select("id, display_name");

const reviewerMap: Record<string, string> = {};
for (const u of hubUsers ?? []) {
  if (u.id && u.display_name) reviewerMap[u.id] = u.display_name;
}
```

> Use `createClient()` (not adminClient) — this is a standard authenticated read. hub_users has RLS allowing reads for authenticated users.

- [ ] **Step 2: Pass `reviewerMap` to the component that renders TasksTab**

Find where `<TasksTab ... />` is rendered (or where its props are assembled) and add `reviewerMap={reviewerMap}`.

### Step B: Accept and use `reviewerMap` in TasksTab

**File:** `src/components/hub/pm-tabs/tasks-tab.tsx`

- [ ] **Step 1: Add `reviewerMap` to the `Props` interface**

```ts
interface Props {
  settings: PMSettings;
  tasks: ClassificationRow[];
  zohoProjectMap?: Record<string, string>;
  reviewerMap?: Record<string, string>;   // new
}
```

Update the destructuring at line 146:
```ts
export default function TasksTab({ settings, tasks, zohoProjectMap = {}, reviewerMap = {} }: Props) {
```

- [ ] **Step 2: Update the Status cell (lines 243–253) to show reviewer info**

Replace:
```tsx
<td className="py-3.25 px-4">
  {t.status === "pending" ? (
    <button
      onClick={() => setReclassifyTarget(t)}
      className="text-[11px] font-semibold text-white bg-(--c-blue) rounded-[6px] px-3 py-1.25 cursor-pointer border-0"
    >
      Classify
    </button>
  ) : (
    <span className="text-[11px] font-semibold text-(--c-green)">✓ Classified</span>
  )}
</td>
```

With:
```tsx
<td className="py-3.25 px-4">
  {t.status === "pending" ? (
    <button
      onClick={() => setReclassifyTarget(t)}
      className="text-[11px] font-semibold text-white bg-(--c-blue) rounded-[6px] px-3 py-1.25 cursor-pointer border-0"
    >
      Classify
    </button>
  ) : (
    <div>
      <span className="text-[11px] font-semibold text-(--c-green)">✓ Classified</span>
      {t.reviewed_at && (
        <div className="text-[10px] text-(--c-muted) mt-0.5 leading-tight">
          {t.reviewed_by && reviewerMap[t.reviewed_by]
            ? `${reviewerMap[t.reviewed_by]} · `
            : ""}
          {formatRelativeTime(t.reviewed_at)}
        </div>
      )}
    </div>
  )}
</td>
```

> `formatRelativeTime` is already imported from `@/lib/utils` — check the current imports at the top of the file and add it if missing.

- [ ] **Step 3: Verify `reviewed_by` and `reviewed_at` are in `ClassificationRow`**

Check `src/types/database.ts` — find the `classification_records` `Row` type. If `reviewed_by` and `reviewed_at` are missing, add them:
```ts
reviewed_by: string | null
reviewed_at: string | null
```
These columns were added when the classification PATCH route was implemented. If they're already in database.ts, no change needed.

---

## Final Validation

- [ ] Run `npx tsc --noEmit` — zero errors
- [ ] Open tasks-tab in browser: reclassify a task, confirm "Reviewed by [name] · just now" appears
- [ ] Confirm ReclassifyModal selects still show correct options (TypeScript-typed arrays)
- [ ] Confirm classification PATCH rejects invalid `task_type` / `priority` values with 400

---

## Notes for Implementation Agent

- `"review"` and `"reviewed"` are two different values in the same `status` column on `classification_records`. `"review"` is a PM pipeline action value (used in orchestration page); `"reviewed"` is the classification outcome set by the PATCH route. Never conflate them.
- The classification PATCH route already imports `TaskType`, `TaskPriority`, `LLMEligibility` from hub.ts — after adding Zod, those imports become unused and should be removed.
- `formatRelativeTime()` lives in `src/lib/utils.ts` — import it if not already in tasks-tab.tsx.
- hub_users RLS allows reads for authenticated users (no adminClient needed for this fetch).
- Do not use `style={{}}` — all UI additions must use Tailwind class names only.
- Sonnet recommendation rationale: N/A — haiku is correct here (targeted type + UI changes, no new architecture).
