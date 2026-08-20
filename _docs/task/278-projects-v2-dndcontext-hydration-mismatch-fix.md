# 278: Fix `/projects-v2` Tab Strip Hydration Mismatch — Missing `DndContext` `id` Prop

**Created:** 2026-08-20
**Priority:** MEDIUM
**Type:** bugfix
**Recommended Tier:** fast
**Status:** Planned

---

## Overview

`/projects-v2` throws a React hydration mismatch on load:

```
aria-describedby="DndDescribedBy-0"   (+ Client)
aria-describedby="DndDescribedBy-1"   (- Server)
```

flagged on the `<button>` rendered by `SortableTab` in `src/app/(hub)/projects-v2/_projects-v2-shell.tsx:44` (part of task 276's draggable "V2 Projects"/"Legacy Projects" tab strip).

**Root cause:** `@dnd-kit/core`'s `DndContext` builds its internal accessibility live-region id (`DndDescribedBy-{n}`) from a module-level auto-incrementing counter whenever no explicit `id` prop is passed. `src/app/(hub)/projects-v2/page.tsx:12` sets `export const dynamic = "force-dynamic"`, so this page is server-rendered fresh on every request inside a long-lived Node.js process — the counter keeps incrementing server-side across requests (module state persists between requests, unlike a per-request-scoped value), while the browser always starts a fresh module instance at `0` on first client mount. Server and client therefore land on different counter values, producing the exact `-0` vs `-1` (or any `N` vs `N+1`) drift seen in the screenshot. This is a known dnd-kit SSR gotcha — their docs recommend passing a stable, explicit `id` prop to `DndContext` specifically to avoid relying on the non-deterministic auto-increment counter.

This is the only `DndContext` usage in the codebase (confirmed via `grep -rn "DndContext" src`), so no other page is currently exposed to this failure mode — but the fix pattern (explicit `id` prop) should be treated as the standard going forward for any future `DndContext` usage on a server-rendered route, since `_phase-builder.tsx` (`src/app/(hub)/portfolio-tracker/new/_phase-builder.tsx`) is the only sibling `DndContext` consumer and also lacks an `id` — same latent risk, out of scope here but worth flagging (see Compatibility Touchpoints).

## Requirements

- [ ] `DndContext` in `_projects-v2-shell.tsx` receives an explicit, stable `id` prop so its `aria-describedby` value no longer depends on the module-level auto-increment counter.
- [ ] Hydration mismatch no longer appears in the browser console on `/projects-v2` (fresh load and hard refresh, not just client-side navigation).
- [ ] Drag-and-drop tab reordering keeps working exactly as before (no behavior change, only id determinism).

## Out of Scope / Must-Not-Change

- Do not touch `_phase-builder.tsx` (`portfolio-tracker/new`) — same latent issue, but not reported/reproduced here; flagged as a follow-up only, not fixed in this task.
- Do not change `_use-tab-order.ts` (`useSyncExternalStore` localStorage pattern) — unrelated to this mismatch, already correctly SSR-safe via `getServerSnapshot`.
- Do not change `dynamic = "force-dynamic"` on `page.tsx` — that's an intentional data-freshness requirement, not the bug.
- Do not upgrade or modify `@dnd-kit/*` package versions.

## Proposed File Changes

| File | Action | Purpose |
|------|--------|---------|
| `src/app/(hub)/projects-v2/_projects-v2-shell.tsx` | Modify | Add explicit `id` prop to `<DndContext>` (line 109) to make the internal `aria-describedby` id deterministic between server and client render |

## Code Context

### File: `src/app/(hub)/projects-v2/_projects-v2-shell.tsx`

```tsx
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={order} strategy={horizontalListSortingStrategy}>
```

Change to:

```tsx
        <DndContext
          id="projects-v2-tab-order"
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleDragEnd}
        >
          <SortableContext items={order} strategy={horizontalListSortingStrategy}>
```

`DndContext`'s `id` prop type is `string | undefined` (from `@dnd-kit/core`) — a plain string literal is sufficient, no need for `useId()`.

## Implementation Steps

1. In `src/app/(hub)/projects-v2/_projects-v2-shell.tsx`, add `id="projects-v2-tab-order"` to the `<DndContext>` element at line 109.
2. Run `pnpm dev`, hard-refresh `/projects-v2` in the browser, open devtools console, confirm no hydration mismatch warning is logged.
3. Verify drag-to-reorder of the two tabs ("V2 Projects" / "Legacy Projects") still works and still persists order via `localStorage` (`projects-v2-tab-order` key) across a reload.

## Acceptance Criteria

- [ ] No hydration mismatch/error logged in the browser console on a fresh (hard) load of `/projects-v2`.
- [ ] Tab drag-and-drop reorder still functions identically (visual drag, drop, order persists after reload).
- [ ] `npx tsc --noEmit` passes.

## Verification

```bash
npx tsc --noEmit
pnpm dev
# Manually: open http://localhost:3000/projects-v2, hard refresh, check console for hydration warnings, then test drag-reorder.
```

## Compatibility Touchpoints

- None for packaging/docs/adapters.
- Follow-up worth flagging separately (not part of this task): `src/app/(hub)/portfolio-tracker/new/_phase-builder.tsx` also uses `DndContext` without an explicit `id`. It hasn't been reported as broken, likely because that route isn't `force-dynamic` in a way that's been observed to drift, but the same class of risk exists if/when that page's SSR behavior changes.

## Implementation Notes

### What Changed
- Added `id="projects-v2-tab-order"` to the `<DndContext>` in `_projects-v2-shell.tsx`, making its internal `aria-describedby` value deterministic between server and client render instead of relying on dnd-kit's module-level auto-increment counter.

### Files Changed
- `src/app/(hub)/projects-v2/_projects-v2-shell.tsx` — added explicit `id` prop to `DndContext` (was line 109, single call site, no other logic touched)

### Deviations From Plan
- None. Applied exactly as specified in Code Context.
- A design-system lint hook flagged a pre-existing `text-[12px]` literal font size on the same `SortableTab` button (now shifted to line 57) — untouched, out of scope per this task's boundaries (only the `DndContext` id prop was in scope).

### Verification Run
- `npx tsc --noEmit` — PASS (clean, no output)
- Manual browser hard-refresh + hydration-warning console check — SKIPPED (dev server not started in this session; deferred to `test` stage / user acceptance)
- Drag-and-drop reorder regression check — SKIPPED (same reason; behavior is unchanged by this prop addition, no logic touched)
