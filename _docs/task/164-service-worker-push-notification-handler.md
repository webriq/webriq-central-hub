# 164: Service Worker — Push Event + Notification Click Handlers

**Created:** 2026-07-20
**Priority:** HIGH
**Type:** bugfix
**Recommended Tier:** fast
**Status:** Planned

---

## Overview

Push notifications (task 064) and their first real caller (task 163) are both fully wired end-to-end — VAPID signing, `push_subscriptions`, `sendPushNotification()`, and now real trigger points (plan approve/reject, programme reminders, phase completion, onboarding submit, deliverable completion) — but **nothing ever appears on the user's device**, because the service worker never listens for the `push` event.

`webpush.sendNotification()` (`src/lib/push/index.ts`) succeeds at the network layer — the push service accepts and delivers the payload to the browser. But delivery to the browser is not the same as showing a notification: displaying one requires the active service worker to catch the `push` event and explicitly call `self.registration.showNotification(...)`. `worker/index.ts` — the custom service worker source Next.js merges into the generated `public/sw.js` via `customWorkerSrc: "worker"` in `next.config.ts` — only has `fetch`/`sync`/`online` listeners for the existing offline-task-queue feature (task unrelated to push). There is no `push` listener and no `notificationclick` listener anywhere in the codebase.

This is a gap in task 064 that was never caught because, until task 163, `sendPushNotification()` had zero callers — there was nothing to actually test the full delivery path with. This task closes it: add the missing service worker handlers so a push payload actually becomes a visible OS notification, and clicking it navigates to the right page.

---

## Requirements

- [ ] `worker/index.ts` — add `self.addEventListener('push', ...)`: parse the push event's JSON payload (`{ title, body, url? }`, matching `PushPayload` in `src/lib/push/index.ts`), call `self.registration.showNotification(title, { body, data: { url } })`, wrapped in `event.waitUntil(...)`.
- [ ] `worker/index.ts` — add `self.addEventListener('notificationclick', ...)`: close the notification, then focus an existing client tab already on that URL if one exists, or open a new window/tab to `notification.data.url` if present (fall back to `/` or no-op if absent).
- [ ] Handle malformed/missing push payloads gracefully (e.g. `event.data` is null, or `.json()` throws) — don't let the service worker crash; show a generic fallback notification or silently no-op.
- [ ] Verify the notification `icon` actually renders — `public/icons/icon-192.svg` is the only app icon and SVG has inconsistent support as a `Notification.icon` across browsers (notably Chrome). Confirm during manual testing whether it renders; if not, use `public/logo.png` (existing PNG) as the notification icon instead.
- [ ] `npx tsc --noEmit` exits 0 (the `worker/` directory is TypeScript, compiled separately by next-pwa's custom worker build — confirm the existing build step still succeeds, since this is compiled output, not typechecked by the main `tsc` pass the same way `src/` is — verify via `pnpm build` if `tsc --noEmit` doesn't cover it).

## Out of Scope / Must-Not-Change

- Do not touch the existing `fetch`/`sync`/`online` listeners in `worker/index.ts` (the offline-task-queue feature) — additive only.
- Do not change `src/lib/push/index.ts`, `/api/push/subscribe`, or `PushPermissionPrompt` — the sending/subscription side already works; this task only fixes the receiving/display side.
- Do not add VAPID key generation or `.env.local` setup — that's an operator/deployment step, not a code change (see task 163's follow-up conversation for the full prerequisite list).
- Do not build a full in-browser notification history or "recent pushes" UI — the in-app bell (task 163) already covers persistent notification history; this task is strictly about the transient OS-level push popup.
- Do not modify `next.config.ts`'s PWA config (`customWorkerSrc`, `dest`, etc.) — the wiring that merges `worker/index.ts` into `public/sw.js` already works correctly; only add listeners inside the existing custom worker source file.

---

## Proposed File Changes

| File | Action | Purpose |
|------|--------|---------|
| `worker/index.ts` | Modify | Add `push` and `notificationclick` event listeners |

---

## Code Context

### Current worker/index.ts (full file — small, no push handling exists)

```ts
import { openDB } from 'idb';

declare const self: ServiceWorkerGlobalScope;
export {};

// ... offline-queue IndexedDB helpers (getDB, queueTaskForLater, replayQueue) ...

self.addEventListener('fetch', (event: FetchEvent) => {
  if (
    event.request.method === 'POST' &&
    event.request.url.includes('/api/orchestrate') &&
    !self.navigator.onLine
  ) {
    event.respondWith(queueTaskForLater(event.request));
  }
});

self.addEventListener('sync', (event: Event) => {
  const syncEvent = event as unknown as SyncEvent;
  if (syncEvent.tag === 'replay-orchestrate') {
    syncEvent.waitUntil(replayQueue());
  }
});

self.addEventListener('online', () => {
  replayQueue().catch(() => {});
});
```

### Payload shape being sent (src/lib/push/index.ts) — this is exactly what `event.data.json()` will parse to

```ts
export type PushPayload = {
  title: string;
  body: string;
  url?: string;
};

// ...
await webpush.sendNotification(
  { endpoint: subscription.endpoint, keys },
  JSON.stringify(payload) // <- the raw string the push event receives
);
```

### next.config.ts — confirms how worker/index.ts reaches production

```ts
const withPWA = withPWAInit({
  dest: "public",
  disable: process.env.NODE_ENV === "development",
  cacheOnFrontEndNav: true,
  aggressiveFrontEndNavCaching: true,
  reloadOnOnline: true,
  fallbacks: { document: "/offline" },
  customWorkerSrc: "worker",
});
```
PWA (and therefore the compiled service worker) is disabled in dev — push notification display can only be manually verified against a production build (`pnpm build && pnpm start`), not `pnpm dev`.

### Available icon assets (public/)

- `icons/icon-192.svg`, `icons/icon-512.svg` — PWA manifest icons, SVG format.
- `logo.png` — existing PNG, likely the safer choice for `Notification.icon` given inconsistent SVG support in notification surfaces.

---

## Implementation Steps

1. In `worker/index.ts`, add a `push` listener:
   ```ts
   self.addEventListener('push', (event: PushEvent) => {
     let data: { title?: string; body?: string; url?: string } = {};
     try {
       data = event.data?.json() ?? {};
     } catch {
       data = { title: 'Notification', body: '' };
     }
     event.waitUntil(
       self.registration.showNotification(data.title ?? 'WebriQ Central Hub', {
         body: data.body ?? '',
         icon: '/logo.png', // verify vs. icon-192.svg during manual test; swap if this renders better
         data: { url: data.url },
       })
     );
   });
   ```
2. Add a `notificationclick` listener that closes the notification and focuses/opens `event.notification.data?.url`:
   ```ts
   self.addEventListener('notificationclick', (event: NotificationEvent) => {
     event.notification.close();
     const url = event.notification.data?.url;
     if (!url) return;
     event.waitUntil(
       self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientsArr) => {
         const existing = clientsArr.find((c) => c.url === url);
         if (existing) return existing.focus();
         return self.clients.openWindow(url);
       })
     );
   });
   ```
3. Run `npx tsc --noEmit`.
4. Run `pnpm build` (PWA/service worker is disabled in dev mode — this is the only way to get a real compiled `public/sw.js` to test against) and manually verify:
   - Grant push permission, trigger one of task 163's notification events (e.g. approve a plan), confirm an OS notification appears with the right title/body.
   - Click the notification — confirm it opens/focuses the right page.
   - Try with the app tab already open vs. closed, to confirm both the "focus existing tab" and "open new tab" paths work.

---

## Acceptance Criteria

- [ ] A push sent via `sendPushNotification()` results in a visible OS-level notification with the correct title and body.
- [ ] Clicking the notification navigates to (or focuses an existing tab already on) the `url` from the payload.
- [ ] A malformed or missing payload does not crash the service worker.
- [ ] The chosen notification icon actually renders (verified manually, not assumed).
- [ ] Existing offline-queue behavior (`fetch`/`sync`/`online` listeners) is unaffected.
- [ ] `npx tsc --noEmit` exits 0; `pnpm build` succeeds.

## Verification

```bash
npx tsc --noEmit
pnpm build && pnpm start   # PWA/SW disabled in `pnpm dev` — must test against a real build
# Manual: grant push permission, trigger a notification (e.g. approve a plan from task 163),
#         confirm the OS notification appears and clicking it navigates correctly.
```

## Compatibility Touchpoints

- No packaging/adapter/install-surface impact — this only affects the compiled service worker's runtime behavior.
- Depends on VAPID keys and a granted push permission actually being configured in the test environment (see the task 163 conversation for the full push-notification prerequisite list) — without those, there's nothing to trigger a `push` event to test against, even after this task ships.

---

## Implementation Notes

### What Changed
- Added `self.addEventListener('push', ...)` to `worker/index.ts`: parses the push payload (`{ title, body, url? }`), falls back to a generic `{ title: 'Notification', body: '' }` if `event.data` is missing or `.json()` throws, and calls `self.registration.showNotification()` with `/logo.png` as the icon, wrapped in `event.waitUntil(...)`.
- Added `self.addEventListener('notificationclick', ...)`: closes the notification, then either focuses an existing client tab already on the target URL or opens a new one via `self.clients.openWindow()`. No-ops if the notification carries no `url`.
- Both listeners appended after the existing `online` listener — the pre-existing `fetch`/`sync`/`online` offline-queue listeners are untouched.

### Files Changed
- `worker/index.ts` - added `push` and `notificationclick` event listeners (only change)

### Deviations From Plan
- Used `/logo.png` as the notification icon directly (per the doc's own implementation-step code), rather than trying `icon-192.svg` first — SVG's known unreliability as a `Notification.icon` made that not worth testing as a first attempt. Flagging for the test stage: confirm `/logo.png` actually renders well at notification-icon size (it's the full app logo, not a purpose-cut icon) — if it looks poor, a dedicated small PNG icon may be worth cutting later, but that's a design nit, not a functional blocker.
- `npx tsc --noEmit` does not actually typecheck this file — confirmed `worker` is listed in `tsconfig.json`'s `exclude`. Real verification came from `pnpm build`, which compiles `worker/index.ts` via next-pwa's separate custom-worker build step. Confirmed by inspecting the build log (`✓ (pwa) Building the custom worker to .../public/worker-7214e9ba7d696a98.js`) and grepping the compiled output for the new listeners (`addEventListener("push"`, `addEventListener("notificationclick"`, `showNotification`, `openWindow` all present) and confirming `public/sw.js`'s `importScripts(...)` points at that same new worker chunk hash.

### Verification Run
- `npx tsc --noEmit` - PASS (does not cover `worker/`, see deviation above)
- `pnpm build` - PASS (exit 0; custom worker compiled successfully, confirmed new listeners present in compiled output)
- Manual browser verification (grant permission, trigger a real push, confirm notification appears + click navigates) - SKIPPED (not run this session; requires VAPID keys configured in a local `.env.local` and a running production build — recommended before sign-off, per this doc's own Compatibility Touchpoints note)
