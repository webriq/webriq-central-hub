# 186: Notification Drawer Stacking-Context Fix + Portfolio Tracker Sticky Header Parity

**Created:** 2026-07-24
**Priority:** MEDIUM
**Type:** bugfix
**Recommended Tier:** balanced
**Status:** Planned

---

## Overview

Three reported overlaps share one root cause, plus one feature-parity request:

1. On `/v2/portfolio-tracker/[projectId]`, the floating "Jump to today" button renders **on top of** the open Notifications drawer instead of being covered by it.
2. On `/v2/customers`, the page's sticky title/toolbar bar renders **on top of** the open Notifications drawer.
3. On `/v2/projects`, the same sticky title/toolbar bar renders **on top of** the open Notifications drawer.
4. Separately (not a bug): apply the same sticky-header pattern used on Customers/Projects to the Portfolio Tracker list page (`/v2/portfolio-tracker`), which currently has a static (non-sticky) header.

**Root cause of #1–#3:** `V2HubHeader` (`src/app/v2/(hub)/_components/v2-hub-header.tsx:58`) is rendered with `relative z-10`, which establishes its own CSS stacking context. `NotificationBell` — including its `fixed` backdrop and drawer panel (`z-[99999]`) — is a plain DOM descendant of that header, not portaled out. Because the header creates a stacking context, the entire `NotificationBell` subtree (backdrop + drawer, however high their own z-index) is confined *inside* the header's z-10 layer when compared against the rest of the page.

Meanwhile, page-level elements that sit in `<main>` (a sibling of the header, under the shared, non-positioned `V2HubShell` wrapper) participate directly in the same ancestor stacking context as the header itself, since neither `<main>` nor its flex wrappers establish a context of their own:
- Customers' sticky bar: `sticky top-0 z-20` (`customers/_customers-index.tsx:167`)
- Projects' sticky bar: `sticky top-0 z-20` (`projects/_projects-index.tsx:453`)
- Portfolio Tracker detail's "Jump to today" button: `fixed bottom-8 right-8 z-40` (`portfolio-tracker/[projectId]/_onboarding-detail.tsx:1781`)

Since 20 > 10 and 40 > 10, these elements paint above the header's entire z-10 layer — including the drawer trapped inside it — regardless of the drawer's own `z-[99999]`, because that 99999 only wins *within* the header's local stacking context, not against siblings of the header itself.

**Fix:** render the Notifications backdrop + drawer via `createPortal(..., document.body)` so they escape the header's stacking context entirely and compare directly against the true document root — where `z-[99999]` will correctly beat every other z-index in the app. This is a one-file fix that resolves all three reported overlaps without touching any of the three affected pages' z-index values. `createPortal` is already an established pattern in this codebase for exactly this kind of stacking-escape problem (see `projects/_projects-index.tsx:4` and `portfolio-tracker/[projectId]/_onboarding-detail.tsx:316`).

## Requirements

- [ ] Notifications backdrop + drawer panel in `notification-bell.tsx` render via `createPortal` to `document.body`, so they are no longer trapped inside `V2HubHeader`'s `z-10` stacking context.
- [ ] Verify the drawer now renders above: the "Jump to today" button on `/v2/portfolio-tracker/[projectId]`, the sticky header on `/v2/customers`, and the sticky header on `/v2/projects`.
- [ ] `/v2/portfolio-tracker` (the list page) gets the same sticky-header treatment as `/v2/customers` and `/v2/projects`: title row + toolbar row (search/filters/pagination) wrapped in a `sticky top-0 z-20 bg-[#F4F6FB]` container with a scroll-triggered shadow, matching the existing pattern exactly (including the `main`-scroll-listener approach for the `scrolled` state).
- [ ] No visual regression to existing drawer open/close animation, backdrop click-to-close, or Escape-to-close behavior.

## Out of Scope / Must-Not-Change

- Do not change z-index values on the Customers/Projects sticky bars or the "Jump to today" button — the portal fix in `notification-bell.tsx` is the actual fix; those values are fine as-is once the drawer escapes the header's stacking context.
- Do not touch `V2HubHeader`'s `relative z-10` — other things may depend on it (e.g. dropdown menus within the header), and removing it isn't necessary once the drawer is portaled.
- Do not change the Portfolio Tracker list page's card grid, filters logic, pagination logic, or `max-w-350` container width — only restructure the header into a sticky wrapper, matching layout conventions already used, without altering the width scale this page already uses.
- Do not touch the Portfolio Tracker **detail** page's "Jump to today" button itself — it does not need a code change; the overlap resolves once the drawer is portaled.

## Proposed File Changes

| File | Action | Purpose |
|------|--------|---------|
| `src/app/v2/(hub)/_components/notification-bell.tsx` | Modify | Portal the backdrop + drawer to `document.body` via `createPortal` so they escape `V2HubHeader`'s stacking context |
| `src/app/v2/(hub)/portfolio-tracker/_onboarding-list.tsx` | Modify | Wrap title row + toolbar row in the same sticky-header pattern used by Customers/Projects; add `scrolled` state + `main`-scroll listener |

## Code Context

### File: `src/app/v2/(hub)/_components/notification-bell.tsx`

Current (lines 1–7, 219–230, 315):
```tsx
"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Bell, CheckCircle2, XCircle, Clock, X, type LucideIcon } from "lucide-react";
import { formatRelativeTime, cn } from "@/lib/utils";
...
      {mounted && (
        <>
          <div
            aria-hidden="true"
            onClick={closeDrawer}
            className={`fixed inset-0 bg-slate-900/20 z-[99999] transition-opacity motion-reduce:transition-none duration-200 ${open ? "opacity-100" : "opacity-0"}`}
          />
          <div
            role="dialog"
            aria-label="Notifications"
            className={`fixed right-0 top-0 h-full w-full max-w-100 bg-white z-[99999] shadow-[0_8px_24px_rgba(7,17,51,0.10)] flex flex-col transition-transform ease-out motion-reduce:transition-none duration-200 ${open ? "translate-x-0" : "translate-x-full"}`}
          >
            ...
          </div>
        </>
      )}
    </>
  );
}
```

Add `import { createPortal } from "react-dom";`, and wrap the `mounted && (...)` block's returned JSX with `createPortal(..., document.body)`. Keep the `mounted` gate exactly as-is (it already ensures this only renders client-side, after a user click, so `document.body` is always available).

### File: `src/app/v2/(hub)/portfolio-tracker/_onboarding-list.tsx`

Current top-level return structure (lines 267–299, abbreviated):
```tsx
return (
  <div className="max-w-350 mx-auto px-8 py-6">
    <div className="flex items-center justify-between gap-4 mb-5 flex-wrap">
      {/* title + New/Import buttons */}
    </div>

    {/* Toolbar: search + status filter + pagination */}
    <div className="flex items-center gap-3 flex-wrap mb-4">
      {/* ... */}
    </div>

    {error && ( /* ... */ )}
    {loading ? ( /* skeleton grid */ ) : /* ... */ }
  </div>
);
```

Reference pattern to mirror, from `src/app/v2/(hub)/customers/_customers-index.tsx:135-141,164-281`:
```tsx
useEffect(() => {
  const main = document.querySelector("main");
  if (!main) return;
  const onScroll = () => setScrolled(main.scrollTop > 4);
  main.addEventListener("scroll", onScroll, { passive: true });
  return () => main.removeEventListener("scroll", onScroll);
}, []);

...

return (
  <div>
    {/* ── Sticky header (title row + toolbar row) ─────────────────────────── */}
    <div className={cn("sticky top-0 z-20 bg-[#F4F6FB] transition-shadow duration-150", scrolled && "shadow-[0_1px_0_0_rgba(7,17,51,0.08)]")}>
      <div className="max-w-[1400px] mx-auto px-8 pt-6 pb-4">
        {/* title row */}
        {/* toolbar row */}
      </div>
    </div>

    {/* ── Scrollable content ───────────────────────────────────────────────── */}
    <div className="max-w-[1400px] mx-auto px-8 py-5">
      {/* ... */}
    </div>
  </div>
);
```

## Implementation Steps

1. In `notification-bell.tsx`: add `import { createPortal } from "react-dom";`. Wrap the existing `{mounted && (<>...</>)}` fragment's JSX in `createPortal(<>...</>, document.body)`, keeping the `mounted &&` gate outside the portal call (i.e. `{mounted && createPortal(<>...</>, document.body)}`).
2. In `_onboarding-list.tsx`: add `useState` for `scrolled` and the `useEffect` scroll listener on `document.querySelector("main")`, identical to `_customers-index.tsx`/`_projects-index.tsx`.
3. Restructure the returned JSX: change the outer `<div className="max-w-350 mx-auto px-8 py-6">` into a bare `<div>` wrapping two children — (a) a `sticky top-0 z-20 bg-[#F4F6FB] transition-shadow duration-150` div (with conditional shadow on `scrolled`) containing an inner `max-w-350 mx-auto px-8 pt-6 pb-4` div with the existing title row + toolbar row, and (b) a `max-w-350 mx-auto px-8 py-5` div containing the existing error/loading/empty/grid content and the trailing restricted-access note.
4. Preserve `max-w-350` (this page's existing width scale) rather than switching to Customers/Projects' `max-w-[1400px]` — only the sticky/shadow/scroll-listener mechanics are being mirrored, not the width.
5. Double check the toolbar row's bottom margin (`mb-4` on the toolbar div) still reads correctly now that it's the last element before the sticky container's own `pb-4` padding — avoid doubled spacing.

## Acceptance Criteria

- [ ] Opening the Notifications drawer on `/v2/portfolio-tracker/[projectId]` shows the drawer rendering above the "Jump to today" button (button no longer visible through/over the drawer or backdrop).
- [ ] Opening the Notifications drawer on `/v2/customers` shows the drawer rendering above the sticky title/toolbar bar (search input, "+ New Customer" button, pagination controls all covered by the backdrop, not poking through).
- [ ] Opening the Notifications drawer on `/v2/projects` shows the same correct stacking (sticky bar fully covered).
- [ ] `/v2/portfolio-tracker` list page: title + toolbar (search/filters/pagination) stick to the top on scroll and gain the same subtle bottom shadow on scroll as Customers/Projects, with no layout shift or double spacing.
- [ ] Notifications drawer open/close animation, Escape-to-close, backdrop-click-to-close, mark-all-read, and infinite-scroll pagination all still work identically post-portal.
- [ ] `npx tsc --noEmit` passes.

## Verification

```bash
npx tsc --noEmit
pnpm lint
pnpm dev
# Manually: open /v2/portfolio-tracker/[projectId], /v2/customers, /v2/projects — open notifications drawer on each, confirm full coverage.
# Manually: scroll /v2/portfolio-tracker list page, confirm sticky header + shadow behavior matches /v2/customers.
```

## Compatibility Touchpoints

- None — internal UI-only fix, no API/schema/packaging impact.

## Implementation Notes

### What Changed
- Wrapped the Notifications drawer's backdrop + panel in `createPortal(..., document.body)` so it renders as a true document-root overlay instead of a descendant of `V2HubHeader`'s `relative z-10` stacking context. This was the actual root cause of all three reported overlaps — the drawer's `z-[99999]` only ever competed within the header's z-10 layer, so any sibling element with a higher explicit z-index (the Customers/Projects sticky bars at `z-20`, the Portfolio Tracker detail "Jump to today" button at `z-40`) painted above the drawer regardless of its own z-index.
- Restructured the Portfolio Tracker list page (`_onboarding-list.tsx`) to match the Customers/Projects sticky-header pattern: title row + toolbar row now live inside a `sticky top-0 z-20 bg-[#F4F6FB] transition-shadow duration-150` wrapper with a `scrolled`-triggered shadow, driven by the same `document.querySelector("main")` scroll-listener effect used on the other two pages. Content below (error/loading/empty/grid states) moved into its own scrollable `max-w-350 mx-auto px-8 py-5` container. Kept this page's existing `max-w-350` width scale rather than switching to the other pages' `max-w-[1400px]` — only the sticky/shadow mechanics were mirrored, not the width.

### Files Changed
- `src/app/v2/(hub)/_components/notification-bell.tsx` - added `createPortal` import; wrapped the `mounted && (...)` backdrop+drawer JSX in `createPortal(<>...</>, document.body)`
- `src/app/v2/(hub)/portfolio-tracker/_onboarding-list.tsx` - added `scrolled` state + `main`-scroll-listener effect; restructured the returned JSX into a sticky header wrapper (title + toolbar) and a separate scrollable content wrapper, matching `_customers-index.tsx`/`_projects-index.tsx`

### Deviations From Plan
- None.

### Verification Run
- `npx tsc --noEmit` - PASS
- `pnpm lint` - PASS
- Manual browser check (`pnpm dev` + Chrome automation) - PASS: opened the Notifications drawer on `/v2/customers`, `/v2/projects`, `/v2/portfolio-tracker`, and `/v2/portfolio-tracker/[projectId]` — in all four cases the drawer/backdrop now fully covers the previously-overlapping element (sticky header controls, "Jump to today" button). Portfolio Tracker list page's new sticky title/toolbar bar renders correctly with no layout shift or doubled spacing.
