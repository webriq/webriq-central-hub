# 121: Fix Lint Errors + Warnings (`pnpm lint`)

**Created:** 2026-07-09
**Priority:** HIGH
**Type:** chore
**Recommended Tier:** balanced
**Status:** Completed

---

## Overview

`pnpm lint` currently fails (`exit code 1`) with **8 errors, 36 warnings** across 15 files (re-verified live against the current working tree, not the user's originally-pasted output — one warning already resolved itself: `client.tsx`'s `AlertTriangle` import was removed by an in-progress uncommitted edit, dropping the count from 45→44 total problems). Two failure classes dominate:

1. **A newly-strict rule, `react-hooks/set-state-in-effect`** (from `eslint-plugin-react-hooks@7.1.1`, bundled via `eslint-config-next@16.2.4`) — 6 errors. It flags any `useEffect`/`useLayoutEffect` that calls a state setter *synchronously* (before any `await`/promise boundary), because that causes an extra, avoidable render pass. Setter calls made *inside* a `.then()`/`.catch()`/`.finally()` callback are not flagged — only the synchronous prefix of the effect body is. Each of the 6 occurrences needs a different fix shape depending on *why* the effect exists (one-time hydration-safe read of an external value vs. a fetch-on-mount vs. a derived reset) — see Code Context below, grouped by pattern.
2. **Plain unused imports/vars/params** — the rest of the warnings, all mechanical deletions except one dead-but-working `useCallback` (`deleteTask`) and one truly-dead piece of state (`plans` in `_content.tsx`) that requires deleting its whole computation block, not just a variable name.

Plus two one-off fixes: a `no-explicit-any` cast in `src/lib/sanity/index.ts` that has a real replacement type available from `@sanity/client`, and a `no-unused-expressions` ternary-used-for-its-side-effect in the (structurally duplicated) v1/v2 customer profile client components.

The `public/worker-a69e12d862738c27.js` errors/warnings (1 error, 16 warnings — the single largest chunk of the total) are **not source code** — it's `@ducanh2912/next-pwa`'s compiled output of `worker/index.js` (`customWorkerSrc: "worker"` in `next.config.ts`), regenerated on every `pnpm build` with a new content hash in its filename. `eslint.config.mjs` already ignores three sibling PWA-generated patterns (`public/sw.js`, `public/workbox-*.js`, `public/swe-worker-*.js`, `public/fallback-*.js`) but is missing the `public/worker-*.js` pattern for this specific file — the fix is a one-line config addition, not editing generated code (any manual edit would be overwritten on the next build anyway).

## Requirements

- [ ] `eslint.config.mjs`: add `"public/worker-*.js"` to `globalIgnores` (alongside the existing `public/swe-worker-*.js` etc. PWA-ignore entries) — eliminates 1 error + 16 warnings from generated code.
- [ ] Fix all 6 `react-hooks/set-state-in-effect` errors using the pattern appropriate to each (see Code Context — three are "read an external/hydration-sensitive value once," two are "fetch on mount," one is "derived reset disguised as state").
- [ ] Remove all dead imports/vars/params flagged by `@typescript-eslint/no-unused-vars` (11 occurrences across 10 files) — full deletion, not `_`-prefixing, per CLAUDE.md's "delete when certain it's unused" guidance, **except** where noted below as a discretionary keep.
- [ ] Fix the `no-unused-expressions` ternary in both `src/app/(hub)/customers/[customerId]/client.tsx:2097` and its v2 duplicate `src/app/v2/(hub)/customers/[customerId]/client.tsx:2230` — convert the side-effect ternary to `if`/`else`.
- [ ] Fix `no-explicit-any` in `src/lib/sanity/index.ts:170` using `IdentifiedSanityDocumentStub` from `@sanity/client` instead of `any`.
- [ ] Remove `zohoPortalId` entirely — from both `client.tsx` files' props interface, destructure, **and** both callers (`page.tsx` in v1 and v2) that pass `process.env.ZOHO_PORTAL_ID` into it. It's a server-only env var (per CLAUDE.md) currently being serialized into a Client Component prop for no reason — `zohoPortalName` (the actually-used one) is separate and untouched.
- [ ] `pnpm lint` exits 0 with no errors and no new warnings when done.
- [ ] `npx tsc --noEmit` passes (several fixes touch type signatures — `validateCustomerUpdate`-style widening isn't needed here, but the Sanity `any` removal and the `_list-view.tsx` state restructure both need a clean typecheck).

## Out of Scope / Must-Not-Change

- Do not hand-edit `public/worker-a69e12d862738c27.js` or any other PWA-generated `public/*.js` file — fix via the eslint ignore list only.
- Do not change PWA build config (`next.config.ts`'s `withPWAInit` options) beyond what's already there.
- `deleteTask` in `src/app/v2/(hub)/projects/[projectId]/_project-detail.tsx:116` is a complete, working optimistic-delete callback (mirrors `updateTask`'s exact shape) that is simply never wired to any UI — no "Delete Task" button/menu exists yet anywhere in the tree (confirmed: zero other references in `src/app/v2/(hub)/projects/`). This task removes it as dead code per CLAUDE.md's anti-hack stance ("if you are certain that something is unused, delete it completely"). Building an actual delete-task UI is out of scope — a separate future task if wanted.
- Do not add a "Delete Task" UI, do not wire up any of the removed dead code to new features. This is a lint-cleanup task only.
- Do not touch `implementation_plans`/`plansByClassification` behavior in `_content.tsx` — only the parallel, unused `plans`/`setPlans` state and its dead `latestByAssessment` computation block are removed; `plansByClassification` (the state actually rendered) is untouched.
- Do not change the Refresh button behavior in `src/app/v2/(hub)/dashboard/users/page.tsx` — the restructure must preserve both call paths (mount-fetch and manual-refresh-click) with identical observable behavior.

## Proposed File Changes

| File | Action | Purpose |
|------|--------|---------|
| `eslint.config.mjs` | Modify | Add `public/worker-*.js` to `globalIgnores`. |
| `src/app/(hub)/customers/[customerId]/client.tsx` | Modify | Remove unused `zohoPortalId` prop; fix ternary-for-side-effect at ~2097. |
| `src/app/(hub)/customers/[customerId]/page.tsx` | Modify | Stop passing `zohoPortalId` to `CustomerProfileClient`. |
| `src/app/v2/(hub)/customers/[customerId]/client.tsx` | Modify | Same two fixes as the v1 file (structural duplicate). |
| `src/app/v2/(hub)/customers/[customerId]/page.tsx` | Modify | Stop passing `zohoPortalId` to `CustomerProfileClient`. |
| `src/app/(hub)/kb/page.tsx` | Modify | Replace `loadingFiles` state + synchronous `setLoadingFiles(true)` with a derived boolean (`selectedId !== loadedForId`). |
| `src/app/(hub)/orchestration/_content.tsx` | Modify | Delete unused `plans`/`setPlans` state and the dead `latestByAssessment` computation block (11 lines) that only fed it. |
| `src/app/v2/(hub)/_components/ops-chat.tsx` | Modify | Replace `greeting` `useState`+`useEffect` with `useSyncExternalStore`. |
| `src/app/v2/(hub)/_components/v2-hub-header.tsx` | Modify | Remove unused `displayName`, `email`, `userRole` from destructure + props interface. |
| `src/app/v2/(hub)/_components/v2-hub-shell.tsx` | Modify | Stop passing `displayName`/`email`/`userRole` to `V2HubHeader` (still passed to `V2HubSidebar`/`OpsChat`, untouched). |
| `src/app/v2/(hub)/_components/v2-hub-sidebar.tsx` | Modify | Remove unused `ChevronRight` import. |
| `src/app/v2/(hub)/dashboard/_components/pm-dashboard.tsx` | Modify | Remove unused imports (`TrendingUp`, `SectionCard`, `ClassificationPulseChart`), unused `shortId` fn, unused `displayName`/`greeting`/`customerCount`; replace `greeting`/`date` synchronous-effect init with `useSyncExternalStore`-based read. |
| `src/app/v2/(hub)/dashboard/users/page.tsx` | Modify | Split `loadUsers` so the mount effect calls a plain async fetch function with no synchronous setState prefix, while the Refresh button keeps calling `loadUsers` (which still resets `loading`/`fetchError` synchronously — fine, it's an event handler). |
| `src/app/v2/(hub)/projects/[projectId]/_list-view.tsx` | Modify | `TimerButton`: replace `elapsed` state + reset-effect with a derived value computed from `startedAt` + a tick-forcing counter. |
| `src/app/v2/(hub)/projects/[projectId]/_project-detail.tsx` | Modify | Remove unused `deleteTask` callback. |
| `src/app/v2/(hub)/projects/_pm-shared.tsx` | Modify | Remove unused `idx` param from `TagChip` (no caller passes it). |
| `src/components/auth/theme-toggle.tsx` | Modify | Replace `isDark` `useState`+`useLayoutEffect(localStorage read)` with a tiny `useSyncExternalStore`-based store (subscribe/notify on `toggle()`). |
| `src/components/hub/pm-tabs/tasks-tab.tsx` | Modify | Remove unused `customers` param (confirm no caller relies on it being required — it already defaults to `[]`). |
| `src/lib/github/index.ts` | Modify | Remove unused `branch` param from `waitForCI`; update the one call site. |
| `src/lib/sanity/index.ts` | Modify | Replace `as any` with `as IdentifiedSanityDocumentStub` (imported from `@sanity/client`). |

## Code Context

### Pattern A — one-time hydration-safe read of an external value → `useSyncExternalStore`

Three occurrences share the same shape: SSR renders a fixed default, and an effect corrects it from a browser-only source (`localStorage`, `Date.now()`) right before/after first paint, purely to avoid a hydration mismatch. `useSyncExternalStore`'s `getServerSnapshot` parameter is the built-in mechanism for exactly this — it's returned during the hydration-matching render, then `getSnapshot` takes over afterward, with zero risk of mismatch and no extra render-triggering `setState` call.

**`src/components/auth/theme-toggle.tsx` (current, 41 lines):**
```tsx
"use client";
import { useLayoutEffect, useState } from "react";
import { Sun, Moon } from "lucide-react";

export function ThemeToggle() {
  const [isDark, setIsDark] = useState(true);
  useLayoutEffect(() => {
    setIsDark(localStorage.getItem("auth-theme") !== "light");
  }, []);
  useLayoutEffect(() => {
    document.documentElement.classList.toggle("dark", isDark);
  }, [isDark]);
  function toggle() {
    const next = !isDark;
    setIsDark(next);
    localStorage.setItem("auth-theme", next ? "dark" : "light");
  }
  // ...button JSX using isDark, toggle unchanged
}
```

**Fix** — module-level tiny store (toggle() notifies subscribers; no cross-tab `storage` listener needed, matches current behavior which also didn't have one):
```tsx
"use client";
import { useLayoutEffect, useSyncExternalStore } from "react";
import { Sun, Moon } from "lucide-react";

const THEME_KEY = "auth-theme";
let listeners: Array<() => void> = [];

function subscribe(onChange: () => void) {
  listeners.push(onChange);
  return () => { listeners = listeners.filter((l) => l !== onChange); };
}
function getSnapshot() {
  return localStorage.getItem(THEME_KEY) !== "light";
}
function getServerSnapshot() {
  return true; // matches the old SSR-safe default (dark)
}
function setDarkTheme(next: boolean) {
  localStorage.setItem(THEME_KEY, next ? "dark" : "light");
  listeners.forEach((l) => l());
}

export function ThemeToggle() {
  const isDark = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  useLayoutEffect(() => {
    document.documentElement.classList.toggle("dark", isDark);
  }, [isDark]);

  function toggle() {
    setDarkTheme(!isDark);
  }
  // ...button JSX unchanged (isDark, toggle same names/signatures)
}
```
The second `useLayoutEffect` (DOM class sync) is untouched — it's the *allowed* "update external system (the DOM) from React state" pattern the rule's own message describes, not flagged today.

**`src/app/v2/(hub)/_components/ops-chat.tsx`** (`greeting`, used at line 155 `{greeting}{displayName ? ...}`):
```tsx
// replace: const [greeting, setGreeting] = useState("");
//          useEffect(() => { setGreeting(...) }, []);
function subscribeNoop() { return () => {}; }
function getGreetingSnapshot() {
  const h = new Date().getHours();
  return h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
}
function getGreetingServerSnapshot() { return ""; } // matches current SSR default

// inside component:
const greeting = useSyncExternalStore(subscribeNoop, getGreetingSnapshot, getGreetingServerSnapshot);
```

**`src/app/v2/(hub)/dashboard/_components/pm-dashboard.tsx`** — only `greeting`/`date` need this treatment; the surrounding `Promise.all(...).then(...)` data fetch (lines ~396–408) is untouched (its setters already run inside `.then()`, not flagged):
```tsx
// replace: const [greeting, setGreeting] = useState("Good morning");
//          const [date, setDate] = useState("");
//          ...useEffect(() => { setGreeting(getGreeting()); setDate(formatCurrentDate()); ...fetch... }, [])
function subscribeNoop() { return () => {}; }
function getGreetingServerSnapshot() { return "Good morning"; } // matches old default
function getDateServerSnapshot() { return ""; }

// inside component:
const greeting = useSyncExternalStore(subscribeNoop, getGreeting, getGreetingServerSnapshot);
const date = useSyncExternalStore(subscribeNoop, formatCurrentDate, getDateServerSnapshot);
// keep the existing useEffect for the Promise.all data fetch, minus the two setGreeting/setDate lines
```
Note: `greeting`/`date`/`customerCount` are flagged as unused warnings too (see Requirement for unused-var cleanup) — re-check after this restructure whether `greeting`/`date` are actually rendered anywhere in this file; if truly unused in JSX (not just unused *state*), remove the whole computation instead of converting it. **Verify by reading current JSX before implementing** — the lint output flags `greeting`(384) and `customerCount`(389) as `no-unused-vars` in the *current* code, meaning they may already be dead in this file specifically (unlike `ops-chat.tsx`'s `greeting`, which is rendered). If dead, just delete `getGreeting`/`formatCurrentDate`/`shortId`(also unused) and their state entirely rather than converting to `useSyncExternalStore`.

### Pattern B — fetch-on-mount → don't route the effect through a setter-prefixed helper

**`src/app/(hub)/kb/page.tsx`** (derive `loadingFiles`, don't store it):
```tsx
// replace loadingFiles state:
const [loadedForId, setLoadedForId] = useState<string | null>(null);
const loadingFiles = selectedId !== null && selectedId !== loadedForId;

useEffect(() => {
  if (!selectedId) return;
  let ignore = false;
  const requestedId = selectedId;
  fetch(`/api/kb/${requestedId}`)
    .then((r) => r.json())
    .then((json) => { if (!ignore) setFiles(json.files ?? []); })
    .finally(() => { if (!ignore) setLoadedForId(requestedId); });
  return () => { ignore = true; };
}, [selectedId]);
```
`setLoadedForId` only runs inside `.finally()` — matches the already-accepted `setFiles` pattern one line above it, so no synchronous setter call remains in the effect body. `loadingFiles` ends up `true`/`false` in exactly the same situations as before (including on fetch error, since `.finally()` always fires).

**`src/app/v2/(hub)/dashboard/users/page.tsx`** — the error points at the `loadUsers()` call itself (`loadUsers` synchronously calls `setLoading(true)` as its first statement, reachable from the effect). Since `loading` already defaults to `true` (`useState(true)`), the mount path doesn't need to re-set it; only the Refresh button (an event handler, not subject to this rule) needs the explicit reset:
```tsx
const fetchAndSetUsers = useCallback(async () => {
  try {
    const res = await fetch("/api/v2/users");
    if (!res.ok) {
      const d = await res.json() as { error?: string };
      setFetchError(d.error ?? `HTTP ${res.status}`);
      return;
    }
    setUsers(await res.json() as HubUser[]);
    setFetchError(null);
  } catch {
    setFetchError("Failed to load users. Please refresh.");
  } finally {
    setLoading(false);
  }
}, []);

const loadUsers = useCallback(() => {
  setLoading(true);
  setFetchError(null);
  void fetchAndSetUsers();
}, [fetchAndSetUsers]);

useEffect(() => { void fetchAndSetUsers(); }, [fetchAndSetUsers]);
```
The `onClick={loadUsers}` Refresh button (~line 386) is unchanged — it still resets `loading`/`fetchError` before re-fetching, exactly as today.

### Pattern C — derived reset disguised as state

**`src/app/v2/(hub)/projects/[projectId]/_list-view.tsx`, `TimerButton`:**
```tsx
function TimerButton({ taskId, onStop }: { taskId: string; onStop: (taskId: string, hours: number) => void }) {
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [, forceTick] = useState(0); // unnamed value — only the setter is used, to force a re-render each second

  useEffect(() => {
    if (startedAt === null) return;
    const id = setInterval(() => forceTick((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, [startedAt]);

  const elapsed = startedAt === null ? 0 : Math.floor((Date.now() - startedAt) / 1000);

  function handleStart() { setStartedAt(Date.now()); }
  function handleStop() {
    if (startedAt === null) return;
    const hours = (Date.now() - startedAt) / 3600000;
    setStartedAt(null);
    onStop(taskId, hours);
  }
  // render unchanged — `elapsed` is now a derived const instead of state, same mm:ss formatting below
}
```
No more `setElapsed(0)` reset branch — `elapsed` is `0` automatically whenever `startedAt` is `null`, computed at render time instead of stored.

### `_content.tsx` — delete dead `plans` state, not just rename

`plans`/`setPlans` (line 880) and the block that populates it (`latestByAssessment`, ~lines 947–954) are **fully dead** — `plansByClassification` (the state actually read at lines 1018/1025/1138) is built independently, directly from `plansResult.data`, not from `latestByAssessment`. Delete both the state declaration and the 8-line loop + `setPlans(latestByAssessment)` call; leave `plansByClassification`'s block (which starts right after, at "Build classification_id → latest non-rejected plan...") untouched.

### `no-unused-expressions` ternary (both v1 and v2 `client.tsx`, identical pattern)

```tsx
// current:
onClick={() => setRevealedAssets(prev => {
  const next = new Set(prev);
  isRevealed ? next.delete(asset.id) : next.add(asset.id);
  return next;
})}
// fix:
onClick={() => setRevealedAssets(prev => {
  const next = new Set(prev);
  if (isRevealed) next.delete(asset.id); else next.add(asset.id);
  return next;
})}
```

### `no-explicit-any` in `src/lib/sanity/index.ts:170`

```ts
// current:
import { createClient, type SanityClient } from "@sanity/client";
...
tx.createOrReplace({
  ...(doc as Record<string, unknown>),
  _id: docId,
} as any);

// fix:
import { createClient, type SanityClient, type IdentifiedSanityDocumentStub } from "@sanity/client";
...
tx.createOrReplace({
  ...(doc as Record<string, unknown>),
  _id: docId,
} as IdentifiedSanityDocumentStub);
```
(`IdentifiedSanityDocumentStub` is the exact parameter type `SanityClient["transaction"]()["createOrReplace"]` expects — confirmed in `@sanity/client`'s own `.d.ts`.)

### `zohoPortalId` removal (both `client.tsx` + both `page.tsx`)

Remove `zohoPortalId: string;` from `CustomerProfileClientProps`, drop it from the destructure (`{ customer, zohoPortalId, zohoPortalName }` → `{ customer, zohoPortalName }`), and in each `page.tsx` remove the `zohoPortalId={process.env.ZOHO_PORTAL_ID ?? ""}` prop line from the `<CustomerProfileClient ... />` call. `zohoPortalName` and its one real usage (Zoho project deep-link URL) are untouched in all four files.

### `v2-hub-header.tsx` / `v2-hub-shell.tsx`

Remove `displayName`, `email`, `userRole` from `V2HubHeaderProps` and the component's destructure — confirmed unused anywhere in the header's render. In `v2-hub-shell.tsx`, remove the three corresponding props from the `<V2HubHeader ... />` call (lines ~47–49) — `V2HubSidebar` and `OpsChat` still receive `displayName`/`userRole`/`email` as before, untouched.

## Implementation Steps

1. `eslint.config.mjs` — add the `public/worker-*.js` ignore pattern. Re-run `pnpm lint` to confirm the generated-file noise (1 error, 16 warnings) drops out immediately; work against the remaining ~27 problems from here.
2. Fix the three Pattern-A files (`theme-toggle.tsx`, `ops-chat.tsx`, `pm-dashboard.tsx`) — implement `useSyncExternalStore` per Code Context; for `pm-dashboard.tsx`, first check whether `greeting`/`date` render anywhere in JSX (if dead, delete instead of converting — see the note in Code Context).
3. Fix the two Pattern-B files (`kb/page.tsx`, `dashboard/users/page.tsx`) — derived-state / split-function restructure per Code Context.
4. Fix the Pattern-C file (`_list-view.tsx` `TimerButton`) — derived `elapsed` + tick-forcing counter.
5. Remove dead code: `_content.tsx`'s `plans` state block, `_project-detail.tsx`'s `deleteTask`, `_pm-shared.tsx`'s `idx` param, unused imports in `v2-hub-sidebar.tsx` (`ChevronRight`), `pm-dashboard.tsx` (`TrendingUp`, `SectionCard`, `ClassificationPulseChart`, `shortId` — unless still needed per step 2's check), `tasks-tab.tsx`'s `customers` param, `github/index.ts`'s `branch` param (+ its one call site).
6. Fix the two `no-unused-expressions` ternaries (v1 + v2 `client.tsx`).
7. Fix `sanity/index.ts`'s `any` → `IdentifiedSanityDocumentStub`.
8. Remove `zohoPortalId` from both `client.tsx`/`page.tsx` pairs and `displayName`/`email`/`userRole` from `v2-hub-header.tsx`/`v2-hub-shell.tsx`.
9. `pnpm lint` — confirm 0 errors, 0 warnings.
10. `npx tsc --noEmit` — confirm clean.
11. Manual/browser verification per Acceptance Criteria (theme toggle, ops chat greeting, PM dashboard greeting/date, KB file loading, users page load+refresh, task timer).

## Acceptance Criteria

- [ ] `pnpm lint` exits 0 with no errors and no warnings.
- [ ] `npx tsc --noEmit` passes.
- [ ] Theme toggle (`/auth/*` pages): no flash of wrong theme on reload with a saved `light` preference in `localStorage`; toggling still persists and updates immediately.
- [ ] Ops Chat panel greeting still shows the correct time-of-day greeting on open, no hydration warning in the browser console.
- [ ] v2 PM Dashboard: page loads without a console hydration warning; if `greeting`/`date` are still rendered somewhere, they show correct values (re-verify against actual current JSX during implementation per the Code Context note).
- [ ] `/kb`: selecting a customer shows the "Loading files…" state briefly then the file list (or "No files uploaded yet."); switching customers quickly doesn't get stuck showing a stale loading state or stale file list.
- [ ] `/v2/dashboard/users`: page loads with the user list on mount (no regression); clicking "Refresh" re-shows the loading state and re-fetches correctly; a fetch error still surfaces via `fetchError`.
- [ ] v2 Project list view: task timer (`TimerButton`) still starts, ticks mm:ss every second, and stops/reports elapsed hours correctly via `onStop`.
- [ ] Customer profile "Show/Hide" masked-asset toggle (v1 and v2) still works identically.
- [ ] Sanity execution rollback (`revertSanityExecution`) still compiles and behaves identically — no runtime-visible change, type-only fix.
- [ ] No visual/behavioral regression in `v2-hub-header.tsx` (breadcrumb, search, notification/help icons) or the customer profile pages (Zoho deep links via `zohoPortalName` still work).

## Verification

```bash
npx tsc --noEmit
pnpm lint
pnpm dev
# Manual, in browser:
#   - /auth/login — toggle theme, reload, confirm no flash / persists
#   - /v2/dashboard — open Ops Chat (Cmd/Ctrl+K or header), confirm greeting text, check console for hydration warnings
#   - /kb — select a customer, confirm loading→file-list transition; switch customers rapidly
#   - /v2/dashboard/users — confirm list loads, click Refresh, confirm it re-loads
#   - /v2/projects/[id] (list view) — start a task timer, confirm it ticks, stop it, confirm hours logged
#   - /customers/[id] and /v2/customers/[id] — toggle a masked asset's Show/Hide, confirm Zoho project links still resolve
```

## Compatibility Touchpoints

- None for packaging/docs/install surface — this is a source-only lint/type cleanup across existing app-route and lib files, no schema, API contract, or dependency changes.

## Implementation Notes

### What Changed
- `eslint.config.mjs`: added `public/worker-*.js` to `globalIgnores`, eliminating the generated PWA custom-worker file's 1 error + 16 warnings.
- Three hydration-sensitive one-time reads converted from `useState`+`useEffect(fn, [])` to `useSyncExternalStore` (theme in `theme-toggle.tsx`, greeting in `ops-chat.tsx`, date in `pm-dashboard.tsx`) — eliminates the extra synchronous-setState render pass while preserving the SSR-safe-default/no-hydration-mismatch behavior via each store's `getServerSnapshot`.
- `pm-dashboard.tsx`'s `greeting` state and `getGreeting()`/`shortId()` helpers turned out to be fully dead (never rendered) once actually checked against JSX — removed entirely instead of converting, along with the dead `customerCount` state and its `customers` count query in the `Promise.all`. Also dropped unused `TrendingUp`, `SectionCard`, `ClassificationPulseChart` imports.
- `kb/page.tsx`: `loadingFiles` state replaced with a derived boolean (`selectedId !== loadedForId`), with `loadedForId` set inside `.finally()` — removes the synchronous `setLoadingFiles(true)` while preserving identical loading-state semantics (including on fetch error).
- `dashboard/users/page.tsx`: the mount effect no longer calls the named `fetchAndSetUsers`/`loadUsers` functions (the lint rule's interprocedural check flags *any* function call from an effect body if that function transitively calls a setState setter, even after an `await` — not just literal synchronous prefixes). Inlined the mount-only fetch directly in the effect using a `.then()/.catch()/.finally()` chain instead; the Refresh button keeps using `loadUsers`/`fetchAndSetUsers` unchanged (event handlers aren't subject to the rule).
- `_list-view.tsx`'s `TimerButton`: first attempt (deriving `elapsed` from `Date.now()` at render time) tripped a *different*, stricter rule — `react-hooks/purity` ("Cannot call impure function during render"), since `Date.now()` isn't a pure function of props/state. Reverted to real `elapsed` state, updated only inside the `setInterval` callback (an async timer callback, not synchronous-in-effect) and reset via `setElapsed(0)` in `handleStart()` (an event handler) instead of a synchronous branch in the effect — satisfies both rules and gives a cleaner UX (immediate 0 on start, no flash of stale value).
- `_content.tsx`: deleted the fully-dead `plans`/`setPlans` state and the `latestByAssessment` computation block that only fed it — `plansByClassification` (the state actually rendered) is built independently and untouched.
- `_project-detail.tsx`: removed the unused `deleteTask` callback (no delete-task UI exists anywhere in the tree).
- `_pm-shared.tsx`'s `TagChip` lost its unused `idx` param — surfaced two real callers in `_projects-index.tsx` that passed `idx={i}` for no reason (TagChip never used it); removed the prop from both call sites and the now-unused `i` map-callback parameter.
- `zohoPortalId` (a server-only env var per CLAUDE.md) removed end-to-end: both `client.tsx` copies' props interface/destructure, and **three** callers, not the two originally scoped — `src/app/(hub)/dashboard/customers/[customerId]/page.tsx` turned out to be a third page importing the same v1 `client.tsx` via a cross-route-group import, missed during planning and caught by `tsc`.
- `v2-hub-header.tsx` lost its unused `displayName`/`email`/`userRole` props. Removing the `V2HubHeader` call's props cascaded: `email` became dead in `v2-hub-shell.tsx` too (only ever forwarded to the header), which cascaded further into `layout.tsx` (dropped the `userEmail` JWT-claims read entirely, since it was single-purpose). `displayName`/`userRole` stayed in `V2HubShell` (still used for `V2HubSidebar`/`OpsChat`).
- `tasks-tab.tsx`'s unused `customers` prop cascaded up two more layers than originally scoped: `_pm-tasks.tsx` (`PMTasksContent`) only ever forwarded it, and `page.tsx` fetched a whole `customers` table query solely to feed that dead chain — removed the query, the prop, and the now-unused `Customer` type alias in both files.
- `github/index.ts`'s `waitForCI` dropped its unused `branch` param — the function has zero call sites anywhere in the codebase (a not-yet-wired CI-polling feature), so no caller updates were needed.
- `sanity/index.ts`: `as any` → `as IdentifiedSanityDocumentStub` (the real parameter type `SanityClient`'s `transaction().createOrReplace()` expects, imported from `@sanity/client`).
- Both `client.tsx` copies' masked-asset Show/Hide ternary-for-side-effect converted to `if`/`else`.

### Files Changed
- `eslint.config.mjs` — PWA-generated worker file ignore pattern.
- `src/components/auth/theme-toggle.tsx` — `useSyncExternalStore` rewrite.
- `src/app/v2/(hub)/_components/ops-chat.tsx` — `useSyncExternalStore` for greeting.
- `src/app/v2/(hub)/_components/v2-hub-header.tsx` — removed unused props.
- `src/app/v2/(hub)/_components/v2-hub-shell.tsx` — removed `email` pass-through (cascaded from header cleanup, not originally scoped).
- `src/app/v2/(hub)/_components/v2-hub-sidebar.tsx` — removed unused `ChevronRight` import.
- `src/app/v2/(hub)/layout.tsx` — removed dead `userEmail` JWT-claims read (cascaded, not originally scoped).
- `src/app/v2/(hub)/dashboard/_components/pm-dashboard.tsx` — dead-code removal + `useSyncExternalStore` for date.
- `src/app/v2/(hub)/dashboard/_components/admin-dashboard.tsx` — stopped forwarding `displayName` to `PMDashboard` (cascaded, not originally scoped).
- `src/app/v2/(hub)/dashboard/_components/dashboard-view.tsx` — updated `PMDashboard`/`AdminDashboard` call sites (cascaded, not originally scoped).
- `src/app/v2/(hub)/dashboard/users/page.tsx` — inlined mount-fetch effect.
- `src/app/v2/(hub)/projects/[projectId]/_list-view.tsx` — `TimerButton` state/effect restructure.
- `src/app/v2/(hub)/projects/[projectId]/_project-detail.tsx` — removed unused `deleteTask`.
- `src/app/v2/(hub)/projects/_pm-shared.tsx` — removed unused `idx` param from `TagChip`.
- `src/app/v2/(hub)/projects/_projects-index.tsx` — removed `idx={i}` from both `TagChip` call sites (not originally scoped, caught by `tsc`).
- `src/app/(hub)/kb/page.tsx` — derived `loadingFiles`.
- `src/app/(hub)/orchestration/_content.tsx` — removed dead `plans` state.
- `src/app/(hub)/customers/[customerId]/client.tsx` + `page.tsx` — `zohoPortalId` removal + ternary fix.
- `src/app/(hub)/dashboard/customers/[customerId]/page.tsx` — `zohoPortalId` removal (third caller, not originally scoped).
- `src/app/v2/(hub)/customers/[customerId]/client.tsx` + `page.tsx` — `zohoPortalId` removal + ternary fix + unused `AlertTriangle` import (also not originally scoped — missed in planning, caught by re-running `pnpm lint`).
- `src/components/hub/pm-tabs/tasks-tab.tsx` — removed unused `customers` prop + `Customer` type.
- `src/app/(hub)/dashboard/tasks/_pm-tasks.tsx` — removed `customers` pass-through + `Customer` type (cascaded, not originally scoped).
- `src/app/(hub)/dashboard/tasks/page.tsx` — removed dead `customers` query (cascaded, not originally scoped).
- `src/lib/github/index.ts` — removed unused `branch` param.
- `src/lib/sanity/index.ts` — `any` → `IdentifiedSanityDocumentStub`.

### Deviations From Plan
- Several unused-prop removals cascaded one or more layers further up the call chain than the task doc scoped (`v2-hub-shell.tsx`/`layout.tsx` for `email`; `admin-dashboard.tsx`/`dashboard-view.tsx` for `PMDashboard`'s `displayName`; `_pm-tasks.tsx`/`page.tsx` for `tasks-tab.tsx`'s `customers`). Each was required to satisfy the task's own "no new warnings" acceptance criterion — leaving the removal at the originally-scoped file would have turned an intermediate pass-through prop into a newly-unused one. All were verified dead (no other use) before removal.
- Found and fixed a third `zohoPortalId` caller (`src/app/(hub)/dashboard/customers/[customerId]/page.tsx`) not listed in the task doc's file table — a cross-route-group import of the same v1 `client.tsx`. Caught by `tsc`, not missed silently.
- Found and fixed one unused-import warning (`AlertTriangle` in the v2 `client.tsx`) that was in the original lint output but not carried into the task doc's per-file scope list. Caught by re-running `pnpm lint` after the planned changes.
- `_pm-shared.tsx`'s `TagChip.idx` removal required also touching `_projects-index.tsx` (two call sites passing `idx={i}` that `TagChip` never used) — not listed in the task doc, caught by `tsc`.
- `_list-view.tsx`'s `TimerButton` fix diverged from the task doc's proposed "derived `elapsed` + tick-forcing counter" pattern: that approach passed the targeted `set-state-in-effect` rule but newly tripped `react-hooks/purity` ("Cannot call impure function during render") because it called `Date.now()` at render time. Reverted to real `elapsed` state updated from the `setInterval` callback, with the reset moved to the `handleStart` event handler instead of the effect — satisfies both rules.
- `dashboard/users/page.tsx`'s fix diverged from the task doc's proposed `fetchAndSetUsers`-called-from-effect pattern, which still tripped the rule (the linter's interprocedural check follows through named function calls, not just literal synchronous-prefix statements). Inlined the mount fetch directly in the effect instead.

### Verification Run
- `pnpm lint` — PASS (0 errors, 0 warnings).
- `npx tsc --noEmit` — PASS (0 errors).
- Browser (`pnpm dev`, Chrome automation) — theme toggle (`/auth/login`, no auth required) CONFIRMED: toggles correctly, persists across reload, zero console errors/hydration warnings on load or reload.
- Browser verification of the remaining auth-gated Acceptance Criteria (Ops Chat greeting, `/kb` loading transition, `/v2/dashboard/users` load+refresh, project list view task timer, masked-asset Show/Hide) — SKIPPED (no test credentials available in this session; all four live behind the `(hub)`/`v2/(hub)` auth guard). Dev server was left running on `localhost:3000` for the user to manually verify these per the task doc's Verification section.
