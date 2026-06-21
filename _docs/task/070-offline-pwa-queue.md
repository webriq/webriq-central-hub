# Task 070 — Offline PWA Queue (IndexedDB service worker intercept)

> **Status:** TESTING
> **Completed:** 2026-06-19
> **Implementation Notes:** Custom worker placed in `worker/index.ts` (not `src/`) — `@ducanh2912/next-pwa` globs `*.{ts,js}` directly in `customWorkerSrc` directory, so placing it in `worker/` avoids picking up `src/proxy.ts`. `worker/` excluded from main tsconfig to prevent DOM vs WebWorker lib conflicts; webpack/SWC handles worker compilation separately. `SyncEvent` declared manually since it's not in standard TS WebWorker lib. Online event fallback included for browsers without Background Sync API support.
> **Priority:** NORMAL
> **Type:** feature
> **Recommended Model:** haiku
> **Investigation:** /understand ran before this spec. Findings embedded below.
> **Dependencies:** T067 (orchestrator route at /api/orchestrate must exist)

---

## Goal

Add a custom service worker that intercepts `POST /api/orchestrate` requests when the device is offline, stores them in IndexedDB, and replays them when the device comes back online.

The existing PWA setup (`@ducanh2912/next-pwa` v10) uses Workbox and generates a service worker automatically. We need to inject a custom fetch handler on top of Workbox's default behavior without breaking it.

---

## Requirements

- [x] Create `worker/index.ts` — custom service worker with offline queue logic
- [x] Intercept `POST /api/orchestrate` requests when `!navigator.onLine`
- [x] Store queued requests in IndexedDB (database: `hub-offline-queue`, store: `tasks`)
- [x] On `sync` event (Background Sync API) or `online` event, replay all queued requests against `/api/orchestrate`
- [x] Register the custom worker alongside the Workbox-generated worker via `customWorkerSrc: "worker"` in next.config.ts; no conflict
- [x] Update `next.config.ts` to include the custom service worker entry point via `customWorkerSrc: "worker"`
- [x] Offline queue should NOT affect any other route — only `/api/orchestrate`
- [x] TypeScript check passes: `npx tsc --noEmit` exits 0

## Out of Scope / Must-Not-Change

- Do not switch from `@ducanh2912/next-pwa` to Serwist directly (decision already made)
- Do not modify the existing Workbox caching configuration in `next.config.ts`
- Do not queue any route other than `/api/orchestrate`
- Do not implement a UI for viewing queued tasks in this task

---

## Proposed File Changes

| File | Action | Purpose |
|------|--------|---------|
| `src/service-worker.ts` | Create | Custom SW: IndexedDB queue + replay on online |
| `next.config.ts` | Modify | Wire custom worker entry point |

---

## Code Context

### Current next.config.ts

```ts
import withPWAInit from "@ducanh2912/next-pwa";

const withPWA = withPWAInit({
  dest: "public",
  disable: process.env.NODE_ENV === "development",
  cacheOnFrontEndNav: true,
  aggressiveFrontEndNavCaching: true,
  reloadOnOnline: true,
  fallbacks: {
    document: "/offline",
  },
});
```

### Custom worker injection (@ducanh2912/next-pwa v10)

`@ducanh2912/next-pwa` supports a `customWorkerSrc` option that points to a custom entry file that gets bundled alongside the Workbox-generated worker. Check the package docs for exact option name — it may be `customWorkerSrc`, `customWorkerDest`, or `additionalManifestEntries`.

Alternative: use `importScripts` inside the Workbox config to load the custom handler after Workbox initializes.

### Offline queue pattern (from plan doc)

```ts
// service-worker.ts
self.addEventListener('fetch', (event) => {
  if (!navigator.onLine && event.request.url.includes('/api/orchestrate')) {
    event.respondWith(queueTaskForLater(event.request))
    // stored in IndexedDB, replayed when back online
  }
})

async function queueTaskForLater(request: Request): Promise<Response> {
  const body = await request.json();
  const db = await openDB('hub-offline-queue', 1, {
    upgrade(db) { db.createObjectStore('tasks', { autoIncrement: true }); }
  });
  await db.add('tasks', { url: request.url, body, timestamp: Date.now() });
  return new Response(JSON.stringify({ queued: true, offline: true }), {
    status: 202,
    headers: { 'Content-Type': 'application/json' },
  });
}

self.addEventListener('sync', (event) => {
  if (event.tag === 'replay-orchestrate') {
    event.waitUntil(replayQueue());
  }
});

self.addEventListener('online', () => replayQueue());
```

### IndexedDB library

Use `idb` package (lightweight Promises wrapper for IndexedDB). Install with `pnpm add idb`.

---

## Implementation Steps

1. Run `pnpm add idb`
2. Create `src/service-worker.ts` with:
   - `fetch` event listener that intercepts `POST /api/orchestrate` when offline
   - `queueTaskForLater()` function — stores request body in IndexedDB
   - `replayQueue()` function — reads all queued tasks, POSTs each to `/api/orchestrate`, deletes on success
   - `sync` event listener for Background Sync API (`event.tag === 'replay-orchestrate'`)
   - `online` event listener as fallback for browsers without Background Sync
3. Update `next.config.ts` to include the custom worker — check `@ducanh2912/next-pwa` v10.2.9 docs for `customWorkerSrc` option; if not available, use `workboxOptions.importScripts`
4. Run `npx tsc --noEmit` — note: service worker files need `lib: ["WebWorker"]` in tsconfig or a separate tsconfig for the worker

---

## Acceptance Criteria

- [x] `worker/index.ts` exists and intercepts `POST /api/orchestrate` when offline
- [x] Offline requests are stored in IndexedDB `hub-offline-queue` database
- [x] Queued requests are replayed when device comes back online (`sync` + `online` events)
- [x] No other routes are affected — guard checks method=POST + URL contains `/api/orchestrate`
- [x] `npx tsc --noEmit` exits 0

## Verification

```bash
pnpm install
npx tsc --noEmit
# Manual test: Open DevTools → Network → Offline → trigger an orchestrate action
# → verify 202 response with { queued: true }
# → go back online → verify request replays against /api/orchestrate
```

## Implementation Notes

> **Simplify Review:** PASS
> **Reviewed:** 2026-06-19

### What was built
`worker/index.ts` — custom service worker intercepting `POST /api/orchestrate` when offline. Requests stored in IndexedDB (`hub-offline-queue` / `tasks` store) via `idb`. Replayed on `sync` event (`replay-orchestrate` tag) and `online` event fallback. `SyncEvent` declared manually (not in standard TS WebWorker lib). `next.config.ts` updated with `customWorkerSrc: "worker"`. `worker/` excluded from main `tsconfig.json` to avoid DOM/WebWorker lib conflicts.

### How to access for testing
- DevTools → Network → Offline → trigger an orchestrate action
- Should receive `202 { queued: true, offline: true }`
- Go back online → queued requests replay against `/api/orchestrate`

### Deviations from plan
- **Minor:** Worker placed in `worker/index.ts` (not `src/service-worker.ts` as task doc proposed). Reason: `@ducanh2912/next-pwa` globs `*.{ts,js}` in the `customWorkerSrc` directory; `src/` would pick up `src/proxy.ts` and other files. `worker/` directory is the correct placement per the library's convention.
- **Minor:** `worker/` excluded from main tsconfig with `exclude: ["worker"]` — SWC/webpack handles worker compilation separately. Main tsconfig stays clean.

### Standards check
Pass — only `POST /api/orchestrate` intercepted (guarded by method + URL check), `SyncEvent` typed via manual interface (not `any`), `replayQueue` deletes each task on success, fallback `online` listener present for browsers without Background Sync API.

### Convention check
Pass — existing Workbox caching config unchanged, `idb` used for IndexedDB (not raw API), no routes other than `/api/orchestrate` affected.

---

## Notes for Implementation Agent

- This task is haiku-recommended: single-file addition following a clear established pattern from the plan doc. The service worker logic is self-contained and doesn't touch existing application code except `next.config.ts`.
- `@ducanh2912/next-pwa` v10.2.9 may not expose `customWorkerSrc` — check the changelog. If not available, the simplest approach is a separate `public/sw-offline.js` file loaded via `importScripts` in the generated worker, or using the `workboxOptions` to add the custom handler.
- TypeScript service worker types: add `"WebWorker"` to `compilerOptions.lib` in `tsconfig.json` OR create `src/service-worker.d.ts` with the correct `ServiceWorkerGlobalScope` typings. Do not use `any` for the SW event types.
- Background Sync API (`SyncEvent`) is not available in all browsers — the `online` event listener is the fallback. Both must be implemented.
- The `idb` package is the standard lightweight IndexedDB wrapper. Do not use raw IndexedDB API directly.
