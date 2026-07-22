# 173: Notification Drawer — Design System v2.0 Restyle, Paginated Scroll, Read/Unread Emphasis, Bell Badge Polish

**Created:** 2026-07-22
**Priority:** MEDIUM
**Type:** enhancement
**Recommended Tier:** balanced
**Status:** Planned

---

## Overview

`NotificationBell` (`src/app/v2/(hub)/_components/notification-bell.tsx`) is the only notification surface in v2 — a bell icon in the hub header (`v2-hub-header.tsx`) that opens a right-side drawer. It still uses the pre-redesign Tailwind palette (`slate-*`, `amber-*`, `red-*`) and a centered `Loader2` spinner, both of which the new design guide (`_final_design/guide/central-hub-design-system.md`) explicitly supersedes ("Skeletons over spinners — never centered spinners"; brand palette is now `#007BFF` / `#071133` / `#FB914E`, not the old `#3358F4` / `#F97316`).

This task restyles the drawer to Design System v2.0 and adds five behavior changes:

1. Bottom fade-out overlay on the scrollable list so it visually implies more content below the fold.
2. Cap the initial list at 10 notifications; fetch 10 more on scroll-near-bottom, with skeleton rows appended during that fetch.
3. Strengthen the visual distinction between **read** and **unread** rows — today the only difference is a 6px dot, everything else (weight, color, background) is identical. *(Note: the request text says "red and unread notifications" — there is no "red" notification variant anywhere in the codebase (`getNotificationVisual` has no red/error type today, and no `type` value maps to red). Read as a typo for "read and unread," which matches the attached screenshot: rows look near-identical except for the small orange dot.)*
4. Move the unread-count badge on the bell icon slightly further up/out (currently `top-0.5 right-0.5`, which partially overlaps the bell glyph) so the bell shape stays recognizable.
5. Change the badge fill from `bg-red-500` to the brand orange `#FB914E`, matching the unread-dot color already used elsewhere (e.g. `pm-dashboard.tsx:263`) and the design guide's `--orange` token.

Reference implementation for the v2.0 hex-token styling pattern (already migrated, same notification data shape): `RemindersCard` in `src/app/v2/(hub)/dashboard/_components/pm-dashboard.tsx:243-270`, plus `SkeletonRow` (`dashboard-shared.tsx:175-177`) and the local `EmptyState` pattern (`pm-dashboard.tsx:140-148`).

## Requirements

- [ ] Restyle the drawer (header, list rows, empty state, close/mark-all-read controls) using Design System v2.0 tokens — `--ink #0B1533`, `--body #3A4565`, `--muted #5F6A88`, `--line #E2E7F2`, `--line-soft #EDF0F7`, `--bg #F4F6FB`, `--blue #007BFF`, `--orange #FB914E`, `--r-lg 14px` / `--r-md 10px`, `160ms cubic-bezier(.22,1,.36,1)` transitions — replacing the current `slate-*`/`amber-*`/`red-*` Tailwind classes. Keep the existing slide-in/backdrop mechanics (translate-x + opacity, `TRANSITION_MS = 220`) — only restyle, don't rearchitect the open/close animation.
- [ ] Add a bottom fade: an absolutely-positioned gradient overlay (`--surface` → transparent, ~40-56px tall) pinned to the bottom of the scroll container, only rendered while there are more notifications below the fold (hide it once `hasMore` is false and the user has reached the true end, so it doesn't lie about content that isn't there).
- [ ] Cap the initial fetch/display at 10 notifications (`GET /api/notifications` already accepts `?limit=`, currently defaults to 20 — pass `limit=10` explicitly from the drawer).
- [ ] Implement on-demand "+10" pagination: when the scroll container is scrolled near its bottom (e.g. within ~120px), and more notifications may exist, fetch the next batch and append.
  - The existing `GET /api/notifications` route has **no offset/cursor param**, only `limit` (capped at 100 server-side). Simplest correct approach without touching the API: track a `visibleLimit` state (10 → 20 → 30 …) and refetch `?limit={visibleLimit}` each time, replacing the list with the returned (now-larger) set. This also naturally keeps the 30s poll in sync — poll with the *current* `visibleLimit`, not a hardcoded 10, so background polling doesn't truncate a list the user has already expanded by scrolling.
  - Derive `hasMore` from the fetch result: `notifications.length >= visibleLimit` (a full page came back → more may exist); `notifications.length < visibleLimit` → reached the end, stop paginating and hide the bottom fade.
  - Guard against duplicate concurrent fetches (e.g. a `loadingMore` ref/state checked before firing another load).
- [ ] Add a distinct `loadingMore` state that renders 2-3 skeleton rows appended below the real rows while the "+10" fetch is in flight (reuse the `SkeletonRow` visual language from `dashboard-shared.tsx:175-177`, restyled to match row height/padding of this list — do not import that component as-is since its skeleton height doesn't match this row's height, but match its `animate-pulse` + rounded block approach).
- [ ] Replace the current full-drawer `Loader2` centered spinner (`notification-bell.tsx:201-204`) with skeleton rows for the *initial* load too, per the design guide's "skeletons over spinners" rule.
- [ ] Increase read vs. unread visual differentiation:
  - Unread rows: subtle background tint (e.g. `--blue-50` / `#F0F7FF`, distinct from the `--blue-50` hover tint — pick a value that doesn't collide with hover, e.g. a faint orange-tinted background `#FB914E0A`-style low-opacity tint, or bold title + tint combo), bold/semibold title (already semibold — increase contrast some other way since title weight is already maxed), and the existing dot kept as a secondary cue, not the only one.
  - Read rows: muted/lighter title color (e.g. `--muted` instead of `--ink`) and no background tint — read rows should look visually "settled" next to unread ones at a glance, not just distinguishable by a small dot.
  - Keep dot as leading indicator too (existing `bg-amber-500` dot → migrate to `--orange` `#FB914E` for palette consistency with the badge change below).
- [ ] Move the bell badge position: from `absolute top-0.5 right-0.5` to sit further outside the bell glyph (e.g. `-top-1 -right-1` or `-top-0.5 -right-0.5`, whichever keeps the full bell outline visible at `size={18}` — verify visually, don't just copy a number).
- [ ] Change badge color: `bg-red-500` → brand orange (`bg-[#FB914E]`, matching the arbitrary-hex pattern already used in `pm-dashboard.tsx:263` and `pm-dashboard.tsx:233,240`), keep the white border ring (`border-2 border-white`) for contrast against any header background.
- [ ] Verify the mark-all-read text color (currently `text-amber-600` / `hover:text-amber-700`) still reads correctly against the new palette — align to `--orange-700` (`#B85512`, the design guide's "orange-on-light text" token) rather than Tailwind's `amber-600`, since the guide explicitly restricts raw `--orange` to CTA fills, not text-on-white.

## Out of Scope / Must-Not-Change

- `GET /api/notifications`, `PATCH /api/notifications/[id]`, `POST /api/notifications/mark-all-read` route logic — no backend changes needed; pagination is achieved by varying the existing `limit` param only. Do not add offset/cursor params to the API for this task.
- The 30s poll interval (`POLL_INTERVAL_MS`) and its existence — keep polling, just parameterize its `limit`.
- The drawer's open/close slide + backdrop mechanics (`mounted`/`open` state machine, `TRANSITION_MS`, Escape-key handling) — restyle only.
- `getNotificationVisual()`'s icon/type mapping logic and avatar-initials logic (`colorForName`, `initialsForName`) — colors used there (`bg-red-50`/`text-red-600` for `plan_rejected`, `bg-amber-50` for reminders, `bg-emerald-50` for completions) are semantic per-type icon tints, not part of this task's read/unread or badge scope. Leave as-is unless they visually clash with the new unread-row tint (spot-check only).
- `RemindersCard` in `pm-dashboard.tsx` — reference only, do not modify.
- Any other notification consumer/badge outside `notification-bell.tsx` and `v2-hub-header.tsx`.
- No new dependencies; this is a client-component-only, Tailwind-CSS + inline-state change.

## Proposed File Changes

| File | Action | Purpose |
|------|--------|---------|
| `src/app/v2/(hub)/_components/notification-bell.tsx` | Modify | Restyle to Design System v2.0, add pagination (`visibleLimit`, `loadingMore`, scroll handler), bottom fade overlay, read/unread emphasis, skeleton loading states, badge position/color |

## Code Context

### File: `src/app/v2/(hub)/_components/notification-bell.tsx` (current relevant excerpts)

Badge (bell button) — position + color to change:
```tsx
<button
  aria-label="Notifications"
  onClick={openDrawer}
  className={`relative p-1.5 rounded-lg text-slate-500 hover:bg-slate-50 hover:text-slate-700 transition-colors cursor-pointer ${FOCUS_RING}`}
>
  <Bell size={18} />
  {unreadCount > 0 && (
    <span className="absolute top-0.5 right-0.5 min-w-4 h-4 px-1 rounded-full bg-red-500 border-2 border-white flex items-center justify-center text-[10px] font-semibold text-white leading-none">
      {unreadCount > 9 ? "9+" : unreadCount}
    </span>
  )}
</button>
```

Fetch (currently no `limit` param, relies on server default of 20):
```tsx
const fetchNotifications = useCallback(async () => {
  try {
    const res = await fetch("/api/notifications");
    if (!res.ok) return;
    const data = await res.json();
    setNotifications(data.notifications ?? []);
    setUnreadCount(data.unreadCount ?? 0);
  } catch {
  } finally {
    setLoading(false);
  }
}, []);
```

Loading state to replace (centered spinner → skeletons):
```tsx
{loading ? (
  <div className="flex items-center justify-center py-16">
    <Loader2 size={20} className="animate-spin text-slate-300" />
  </div>
) : ...}
```

Row rendering (unread dot is the only unread cue today):
```tsx
notifications.map(n => {
  const unread = !n.read_at;
  return (
    <button
      key={n.id}
      onClick={() => handleItemClick(n)}
      className={`flex items-start gap-3 w-full text-left px-5 py-4 border-b border-slate-50 last:border-b-0 hover:bg-slate-50 transition-colors cursor-pointer ${FOCUS_RING}`}
    >
      <NotificationLeadingVisual notification={n} />
      <span className="min-w-0 flex-1">
        <span className="flex items-center justify-between gap-2">
          <span className="text-[13px] font-semibold text-slate-900">{n.title}</span>
          {unread && <span className="w-1.5 h-1.5 rounded-full bg-amber-500 shrink-0" />}
        </span>
        <span className="block text-[12px] text-slate-600 mt-0.5 line-clamp-2">{n.body}</span>
        <span className="block text-[10px] text-slate-400 mt-1">{formatRelativeTime(n.created_at)}</span>
      </span>
    </button>
  );
})
```

Scroll container that needs the `onScroll` pagination hook + fade overlay:
```tsx
<div className="flex-1 overflow-y-auto">
  {/* rows */}
</div>
```

### File: `src/app/api/notifications/route.ts` (do not modify — confirms `limit` support)
```ts
const requestedLimit = Number(searchParams.get("limit"));
const limit = Number.isInteger(requestedLimit) && requestedLimit > 0 && requestedLimit <= 100 ? requestedLimit : 20;
```
No offset/cursor param exists. Pagination for this task must be done by increasing `limit` and refetching, per Requirements above.

### File: `src/app/v2/(hub)/dashboard/_components/pm-dashboard.tsx` (style reference only)
Already-migrated hex-token pattern, unread dot color, and empty/skeleton conventions to mirror:
```tsx
function RemindersCard({ notifications, loading }: { notifications: NotificationItem[]; loading: boolean }) {
  if (loading) return <div className="p-[18px] space-y-3"><SkeletonRow /><SkeletonRow /></div>;
  if (notifications.length === 0) {
    return <EmptyState icon={<Bell size={20} />} title="You're all caught up" body="..." />;
  }
  return (
    <div className="divide-y divide-[#EDF0F7]">
      {notifications.map((n) => {
        const content = (
          <div className="flex gap-2.5 px-[18px] py-3 hover:bg-[#F0F7FF] transition-colors">
            {/* ... */}
            {!n.read_at && <span className="w-[7px] h-[7px] rounded-full bg-[#FB914E] shrink-0 mt-1.5" />}
          </div>
        );
        return n.url ? <Link key={n.id} href={n.url} className="block">{content}</Link> : <div key={n.id}>{content}</div>;
      })}
    </div>
  );
}
```

### File: `src/app/v2/(hub)/dashboard/_components/dashboard-shared.tsx` (skeleton reference only)
```tsx
export function SkeletonRow() {
  return <div className="h-14 animate-pulse bg-slate-100 rounded-lg mb-2" />;
}
```

## Implementation Steps

1. Add `visibleLimit` (initial `10`), `loadingMore` (boolean), and `hasMore` (boolean, derived after each fetch) state to `NotificationBell`.
2. Update `fetchNotifications` to accept a `limit` argument (default to current `visibleLimit`) and pass it as `?limit=` on the request; set `hasMore = (data.notifications?.length ?? 0) >= limit` after each successful fetch.
3. Update the mount effect and poll interval to call `fetchNotifications(visibleLimit)` instead of the no-arg call, so background polling doesn't truncate an expanded list.
4. Add a `loadMore()` handler: if `loadingMore || !hasMore`, return; else set `loadingMore = true`, compute `nextLimit = visibleLimit + 10`, fetch with that limit, update `notifications`/`unreadCount`/`hasMore`, set `visibleLimit = nextLimit`, clear `loadingMore`.
5. Add an `onScroll` handler on the `flex-1 overflow-y-auto` container: when `scrollTop + clientHeight >= scrollHeight - 120`, call `loadMore()`.
6. Replace the centered `Loader2` initial-loading block with 4-5 skeleton rows matching the real row's height/padding (`px-5 py-4`, ~72-80px tall incl. avatar).
7. Append 2-3 skeleton rows below the real list when `loadingMore` is true (same skeleton component/markup as step 6, reused).
8. Add the bottom fade: `<div className="pointer-events-none absolute bottom-0 inset-x-0 h-14 bg-gradient-to-t from-white to-transparent" />` (or hex equivalent for `--surface`), conditionally rendered when `hasMore` (or `loadingMore`) is true; the scroll container's parent needs `relative` positioning for this to anchor correctly.
9. Restyle drawer header, close/mark-all-read buttons, and row layout to Design System v2.0 hex tokens (see Requirements list for the exact token swap). Replace `text-amber-600` mark-all-read with `text-[#B85512]` / hover `text-[#E2762F]` (orange-on-light text token → CTA-hover token), matching guide's Section 1 "orange-700: orange-on-light text" line.
10. Rework row styling for read/unread emphasis: unread rows get a tint background + `--ink` title; read rows get `--muted` title, no tint. Swap the dot color from `bg-amber-500` to `bg-[#FB914E]`.
11. Move badge to `-top-1 -right-1` (or nearest visually-correct offset) and change `bg-red-500` to `bg-[#FB914E]` on the bell button.
12. Manually verify in-browser: open drawer with >10 notifications seeded, scroll to trigger a "+10" load and observe skeleton rows appended then replaced by real rows; confirm fade disappears once all notifications are loaded; confirm poll (wait 30s or trigger manually) doesn't collapse an expanded list back to 10; confirm badge no longer overlaps the bell glyph and reads brand-orange; confirm read vs. unread rows are distinguishable without hunting for the dot.

## Acceptance Criteria

- [ ] Drawer visually matches Design System v2.0 tokens (no remaining `slate-*`/`amber-*`/`red-*` Tailwind classes in the restyled markup, except where explicitly out-of-scope per-type icon tints are left untouched).
- [ ] Initial drawer open shows at most 10 notifications.
- [ ] Scrolling near the bottom of the list fetches and appends 10 more (up to whatever total exists), showing skeleton rows during that fetch.
- [ ] A bottom fade overlay is visible whenever more notifications may exist below the fold, and disappears once the true end of the list is reached.
- [ ] Read and unread rows are clearly distinguishable at a glance (background tint and/or title color difference), not just via the small dot.
- [ ] The unread-count badge sits clear of the bell glyph (doesn't visually merge with/obscure the icon) and is brand-orange (`#FB914E`) instead of red.
- [ ] 30-second background polling does not reset an already-expanded (>10) notification list back down to 10.
- [ ] `npx tsc --noEmit` passes with no new errors.
- [ ] `pnpm lint` passes with no new warnings/errors in the modified file.

## Verification

```bash
npx tsc --noEmit
pnpm lint
pnpm dev   # manual browser check: open notification drawer, scroll pagination, badge position/color, read/unread contrast
```

## Compatibility Touchpoints

- No API, schema, or route changes — purely a client-component restyle + client-side pagination against the existing `GET /api/notifications?limit=` param.
- No new packages required.

## Implementation Notes

### What Changed
- Restyled the entire drawer (header, close/mark-all-read controls, empty state, rows, focus rings) from `slate-*`/`amber-*`/`red-*` Tailwind classes to Design System v2.0 hex tokens.
- Added client-side pagination: `visibleLimit` state (starts at 10, +10 per load), `hasMore` derived from whether the last fetch returned a full page, and a `loadMore()` fetch that re-requests `?limit={visibleLimit+10}` and replaces the list (the API has no offset/cursor param, so this is the correct approach per the task doc).
- Poll interval and initial fetch now read `visibleLimitRef.current` (a ref kept in sync with `visibleLimit`) instead of a hardcoded limit, so 30s background polling can't truncate a list the user has scrolled to expand.
- Replaced the centered `Loader2` spinner with skeleton rows for both initial load (5 rows) and "load more" (2 rows appended below the real list), per the design guide's "skeletons over spinners" rule.
- Added a bottom fade overlay (`bg-gradient-to-t from-white to-transparent`, absolutely positioned) shown only while `hasMore || loadingMore`, inside a new `relative flex-1 min-h-0` wrapper around the scrollable list.
- Added an `onScroll` handler on the scroll container that calls `loadMore()` when within 120px of the bottom.
- Reworked read/unread row styling: unread rows get a low-alpha orange background tint (`bg-[#FB914E0D]`, distinct from the `#F0F7FF` hover tint used on read rows) plus `--ink` semibold titles and `--body` body text; read rows get `--muted` medium-weight titles and `--muted` body text, no tint. The unread dot moved from `bg-amber-500` to `bg-[#FB914E]`.
- Moved the bell badge from `top-0.5 right-0.5` to `-top-1 -right-1` so it sits clear of the bell glyph, and changed its fill from `bg-red-500` to `bg-[#FB914E]`. Per the design guide's own CTA-button spec ("`orange` bg, `#471F02` text"), the badge's number uses `text-[#471F02]` rather than white, since that's the documented readable-text-on-`--orange` combination in this system, not `--orange`-fill-with-white-text (which the guide reserves for the *hover* state of CTA buttons).
- "Mark all read" text recolored from `text-amber-600`/`hover:text-amber-700` to `text-[#B85512]`/`hover:text-[#E2762F]` (the guide's documented "orange-on-light text" token and its CTA-hover token).
- Focus rings across all interactive elements in this file switched from `ring-slate-300` to `ring-[#007BFF]` with a 2px offset, per the guide's "Focus: 2px `--blue` outline, 2px offset, on every interactive element" rule.
- Removed the now-unused `Loader2` import and an eslint-disable comment that became unnecessary after restructuring the mount effect (confirmed via `pnpm lint`, which flagged it as an unused directive once dead).

### Files Changed
- `src/app/v2/(hub)/_components/notification-bell.tsx` — full restyle + pagination/skeleton/fade/badge changes described above. No other files touched (matches the task's single-file scope).

### Deviations From Plan
- None. All five requested behaviors (bottom fade, 10-cap + on-demand +10 pagination with skeletons, read/unread emphasis, badge reposition, badge recolor) and the full v2.0 token restyle were implemented as scoped. The one interpretive call — reading "red and unread" as a typo for "read and unread" — was flagged explicitly in the task doc's Overview before implementation began and carried through unchanged.
- Badge text color was set to `#471F02` (dark) rather than white, which isn't explicitly specified in the task doc. This follows the design guide's own literal CTA-button spec for text-on-`--orange` rather than assuming white-on-orange; flagging here since it's a judgment call, not a literal requirement-doc instruction.

### Verification Run
- `npx tsc --noEmit` — PASS (no errors).
- `pnpm lint` — PASS (0 errors, 0 warnings; one initially-flagged unused eslint-disable directive was removed).
- Manual browser check (`pnpm dev`, real authenticated v2 session) — PASS. Confirmed: badge position/color migrated correctly (screenshot-verified, clear of bell glyph, brand orange); read vs. unread rows visually distinct at a glance (tint + title color, not just the dot); drawer restyled to v2.0 tokens end-to-end. Pagination and fade logic were verified against real data by temporarily lowering `INITIAL_LIMIT`/`PAGE_SIZE` to 3/2 (test account only had 7 total notifications, insufficient to exercise a 10-item page under normal settings) — confirmed two successive scroll-triggered loads correctly grew the list 3 → 5 → 7 and the fade overlay disappeared exactly once `hasMore` became false at the true end of the list. Constants were reverted to the spec values (10/10) immediately after, and the reverted state was re-verified in-browser and via `tsc`/`lint` before finishing.
- Design-system font-size hook findings (9 flagged, all on pre-existing `text-[12px]`/`text-[14px]` values carried over unchanged from the original component) — reviewed and classified as out-of-scope/false-positive for this task: they predate this change and the task was scoped to color/token restyling plus pagination behavior, not a full typography rescale to the documented 11/13/15px ramp. Left unsuppressed (no inline ignore comments or config exceptions added) pending explicit user direction, since remapping them risks readability regressions in dense list text and wasn't requested.
