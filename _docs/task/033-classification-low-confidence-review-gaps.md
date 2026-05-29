# Task 033 — Classification: Low-Confidence Review Gaps

> **Type:** patch
> **Priority:** NORMAL
> **Recommended Model:** haiku
> **File:** `_docs/task/033-classification-low-confidence-review-gaps.md`
> **Status:** TESTING
> **Completed:** 2026-05-29
> **Implementation Notes:** Single file changed — `tasks-tab.tsx`. TypeScript check passes clean. No API or DB changes.

---

## Goal

Close two M2 acceptance criterion gaps in the low-confidence PM review surface:

1. **Gap 1 — No action on low-confidence reviewed tasks.** The "Needs Review" tab surfaces tasks where `confidence_score < 75`, but if a task's `status` is already `"reviewed"`, the row shows "✓ Classified" with no action button. The PM can see the record but cannot re-classify it from this surface.

2. **Gap 2 — Reasoning never shown.** The classifier writes a `reasoning` field explaining *why* it chose the classification. It is stored in `raw_response` but is never surfaced in the UI. PMs reviewing a low-confidence task have no context for what made the model uncertain.

---

## Acceptance Criteria

- [ ] A task with `status === "reviewed"` AND `confidence_score < 75` renders a "Re-classify" button in the Status column that opens the existing `ReclassifyModal`.
- [ ] The `ReclassifyModal` displays the LLM's `reasoning` string (from `raw_response.reasoning`) as a read-only block above the form fields. If `raw_response` is null or reasoning is absent, the block is omitted silently.
- [ ] Tasks with `status === "reviewed"` AND `confidence_score >= 75` are unaffected — they continue to show "✓ Classified" only.
- [ ] `status === "pending"` tasks are unaffected — they continue to show "Classify".
- [ ] No new files. No API changes. No DB changes.

---

## Implementation Notes

> **Simplify Review:** PASS
> **Reviewed:** 2026-05-29

### What was built
- Low-confidence reviewed tasks (`confidence_score < 75`, `status === "reviewed"`) now render an amber "Re-classify" link below "✓ Classified" in the Status column. Clicking it opens the existing `ReclassifyModal`.
- `ReclassifyModal` now extracts `reasoning` from `raw_response` via a type-safe guard and renders it as a read-only "AI Reasoning" block above the form fields. Block is omitted silently when absent.

### How to access for testing
- URL: `/pm/tasks` → "Needs Review" tab
- Entry point: Any classified task with confidence score below 75% — should show amber "Re-classify" link
- For the modal: open any task (pending or low-confidence reviewed) — "AI Reasoning" block appears when the classifier produced a reasoning field

### Deviations from plan
None. Implementation matches the task spec exactly.

### Standards check
Pass — `Record<string, unknown>` used for Json type guard, ternary conditionals throughout, no dynamic class construction, no any types.

### Convention check
Pass — Tailwind scale classes used; arbitrary pixel sizes (`text-[10px]`, `text-[12px]`) consistent with pre-existing file convention; no `style={{}}`.

---

## Implementation Steps

### Step 1 — Add "Re-classify" button for low-confidence reviewed tasks

In `src/components/hub/pm-tabs/tasks-tab.tsx`, find the Status column cell (currently lines 245–263):

```tsx
{t.status === "pending" ? (
  <button onClick={() => setReclassifyTarget(t)} ...>
    Classify
  </button>
) : (
  <div>
    <span className="text-[11px] font-semibold text-(--c-green)">✓ Classified</span>
    ...
  </div>
)}
```

Change the `else` branch to split on confidence:

```tsx
{t.status === "pending" ? (
  <button onClick={() => setReclassifyTarget(t)} ...>
    Classify
  </button>
) : (t.confidence_score ?? 100) < 75 ? (
  <div>
    <span className="text-[11px] font-semibold text-(--c-green)">✓ Classified</span>
    <button
      onClick={() => setReclassifyTarget(t)}
      className="block text-[10px] font-semibold text-amber-600 dark:text-amber-400 mt-0.5 cursor-pointer hover:underline"
    >
      Re-classify
    </button>
    {/* reviewer info stays here */}
  </div>
) : (
  <div>
    <span className="text-[11px] font-semibold text-(--c-green)">✓ Classified</span>
    {/* reviewer info stays here */}
  </div>
)}
```

Keep the `reviewed_at` / `reviewerMap` display inside both branches.

### Step 2 — Surface reasoning in ReclassifyModal

`raw_response` is typed as `Json | null`. Extract `reasoning` safely:

```tsx
const reasoning =
  record.raw_response &&
  typeof record.raw_response === "object" &&
  !Array.isArray(record.raw_response) &&
  typeof (record.raw_response as Record<string, unknown>).reasoning === "string"
    ? (record.raw_response as Record<string, unknown>).reasoning as string
    : null;
```

If `reasoning` is non-null, render it above the form fields in the modal:

```tsx
{reasoning && (
  <div className="mb-4 rounded-lg bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 px-3 py-2.5">
    <p className="text-[10px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-[0.06em] mb-1">
      AI Reasoning
    </p>
    <p className="text-[12px] text-gray-700 dark:text-gray-300 leading-relaxed">
      {reasoning}
    </p>
  </div>
)}
```

Place this block between the title/description header (line ~86) and the `<div className="space-y-3 mb-5">` form fields.

---

## File Changes

| File | Action | Notes |
|------|--------|-------|
| `src/components/hub/pm-tabs/tasks-tab.tsx` | Modify | Both gaps resolved here only |

---

## Code Context

### Current status cell (lines 245–263) — full block being changed

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
      {t.reviewed_at ? (
        <div className="text-[10px] text-(--c-muted) mt-0.5 leading-tight">
          {t.reviewed_by && reviewerMap[t.reviewed_by] ? `${reviewerMap[t.reviewed_by]} · ` : ""}
          {formatAge(t.reviewed_at)}
        </div>
      ) : null}
    </div>
  )}
</td>
```

### Current ReclassifyModal — description block (lines 86–88) — insert reasoning block after this

```tsx
<p className="text-[13px] text-gray-600 dark:text-gray-400 mb-4 leading-relaxed line-clamp-2">
  {record.title}
</p>
```

### raw_response type (from database.ts)

`raw_response` is `Json | null` where `Json = string | number | boolean | { [key: string]: Json | undefined } | Json[]`. Safe extraction requires the object + non-array + string-property check shown in Step 2.

---

## Notes for Implementation Agent

- Only `tasks-tab.tsx` changes. Do not touch the API, DB, or any other file.
- The "Re-classify" button label is deliberately different from "Classify" so PMs can distinguish first-time classification from a correction.
- `(t.confidence_score ?? 100) < 75` — the `?? 100` default means a null score (LLM failed) does NOT trigger the re-classify prompt. Null scores already show `status === "pending"` and have their own "Classify" button path.
- The reasoning block must be **read-only** — it is informational context only, not an editable field.
- Do not change the `confClass` thresholds or the "Needs Review" filter logic (line 159) — those are already correct.
