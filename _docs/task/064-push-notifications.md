# Task 064 — Push Notifications (web-push + VAPID + subscription API)

> **Status:** TESTING
> **Completed:** 2026-06-19
> **Implementation Notes:** Deviation from task doc: `push_subscriptions` table uses `keys: Json` (single column), not separate `p256dh` and `auth` columns as shown in the task doc — adapted accordingly. `PushPermissionPrompt` extracted as a client component at `src/components/hub/push-permission-prompt.tsx` rather than inlining into layout (layout is a server component). Delete-then-insert used instead of upsert to avoid needing a unique constraint on `(profile_id, endpoint)`. `urlBase64ToUint8Array` returns `Uint8Array<ArrayBuffer>` explicitly to satisfy TS strict buffer types. `npx tsc --noEmit` exits 0.
> **Priority:** HIGH
> **Type:** feature
> **Recommended Model:** sonnet
> **Investigation:** /understand ran before this spec. Findings embedded below.

---

## Goal

Wire up the application layer for web push notifications. The DB table (`push_subscriptions`) already exists from migration 025. What's missing: the `web-push` npm package, VAPID key env vars, a subscription registration API route, a `sendPushNotification()` helper, and a permission prompt on login.

The pipeline uses push notifications to alert the assignee when a preview URL is ready, when approval is needed, when a deploy completes, and when a health check fails.

---

## Requirements

- [x] Install `web-push` and `@types/web-push` packages
- [x] Add `VAPID_PUBLIC_KEY` and `VAPID_PRIVATE_KEY` to `env.example` (with generation instructions)
- [x] Add `NEXT_PUBLIC_VAPID_PUBLIC_KEY` to `env.example` (public key must be accessible client-side for subscription creation)
- [x] Create `src/app/api/push/subscribe/route.ts` — POST endpoint to save a push subscription to `push_subscriptions` table; DELETE to remove it
- [x] Create `src/lib/push/index.ts` — `sendPushNotification(profileId, payload)` helper that fetches the subscription from DB and calls `webpush.sendNotification()`
- [x] Add push permission prompt after successful login in the hub layout or a client component that fires once per session
- [x] TypeScript check passes: `npx tsc --noEmit` exits 0

## Out of Scope / Must-Not-Change

- Do not modify existing auth flow logic in `(auth)/actions.ts`
- Do not add push to the onboarding public route — only hub-authenticated users
- Do not send push notifications from client components — server-only via `src/lib/push/index.ts`
- Do not create a full notification center UI in this task — that's a separate feature

---

## Proposed File Changes

| File | Action | Purpose |
|------|--------|---------|
| `package.json` | Modify | Add `web-push` + `@types/web-push` |
| `env.example` | Modify | Add VAPID key vars with generation instructions |
| `src/app/api/push/subscribe/route.ts` | Create | POST/DELETE subscription registration |
| `src/lib/push/index.ts` | Create | `sendPushNotification()` server helper |
| `src/app/(hub)/layout.tsx` | Modify | Add push permission prompt on mount |

---

## Code Context

### push_subscriptions table (from src/types/database.ts:1011)

```ts
push_subscriptions: {
  Row: {
    id: string
    profile_id: string | null
    endpoint: string
    p256dh: string
    auth: string
    created_at: string | null
  }
  Insert: {
    id?: string
    profile_id?: string | null
    endpoint: string
    p256dh: string
    auth: string
    created_at?: string | null
  }
  Update: { ... }
}
```

### Auth guard pattern (from src/app/api/execution/route.ts:18-25)

```ts
const supabase = await createClient();
const { data: { user } } = await supabase.auth.getUser();
if (!user) {
  return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
}
```

### Admin client write pattern

```ts
import { adminClient } from '@/lib/supabase/admin';

const { error } = await adminClient
  .from('push_subscriptions')
  .insert({ profile_id: user.id, endpoint, p256dh, auth });
```

---

## Implementation Steps

1. Run `pnpm add web-push && pnpm add -D @types/web-push`
2. Add to `env.example`:
   ```
   # ─── Push Notifications ────────────────────────────────────────────────────
   # Generate VAPID keys: node -e "const webpush = require('web-push'); console.log(webpush.generateVAPIDKeys())"
   VAPID_PUBLIC_KEY=          # server-side
   VAPID_PRIVATE_KEY=         # server-side — never expose
   NEXT_PUBLIC_VAPID_PUBLIC_KEY=  # public key for browser PushManager.subscribe()
   ```
3. Create `src/lib/push/index.ts`:
   - Import `webpush` and `adminClient`
   - `webpush.setVapidDetails(process.env.NEXT_PUBLIC_APP_URL!, process.env.VAPID_PUBLIC_KEY!, process.env.VAPID_PRIVATE_KEY!)`
   - Export `sendPushNotification(profileId: string, payload: { title: string; body: string; url?: string })` — fetch subscription from `push_subscriptions` by `profile_id`, call `webpush.sendNotification(subscription, JSON.stringify(payload))`
   - Handle `WebPushError` with status 410 (subscription expired) by deleting the stale row
4. Create `src/app/api/push/subscribe/route.ts`:
   - `POST`: auth guard → parse `{ endpoint, p256dh, auth }` → upsert into `push_subscriptions` by `profile_id` + `endpoint`
   - `DELETE`: auth guard → delete by `endpoint`
5. Add push permission prompt to `src/app/(hub)/layout.tsx` (or a `<PushPermissionPrompt />` client component extracted and imported there):
   - On mount, check `Notification.permission` — if not `'granted'`, show a toast/banner asking user to enable
   - On user consent: call `navigator.serviceWorker.ready`, call `pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY })`, POST the subscription to `/api/push/subscribe`
6. Run `npx tsc --noEmit`

---

## Acceptance Criteria

- [ ] `web-push` and `@types/web-push` in `package.json`
- [ ] `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `NEXT_PUBLIC_VAPID_PUBLIC_KEY` in `env.example` with generation instructions
- [ ] `POST /api/push/subscribe` saves subscription; `DELETE /api/push/subscribe` removes it
- [ ] `sendPushNotification(profileId, payload)` works server-side and handles 410 stale subscriptions
- [ ] Permission prompt appears in hub layout for unauthenticated notification permission
- [ ] `npx tsc --noEmit` exits 0

## Verification

```bash
pnpm install
npx tsc --noEmit
# Test manually: log in → see push permission prompt → grant → check push_subscriptions table in Supabase
```

## Implementation Notes

> **Simplify Review:** PASS
> **Reviewed:** 2026-06-19

### What was built
`web-push` + `@types/web-push` installed. VAPID keys added to `env.example`. `POST/DELETE /api/push/subscribe` saves/removes subscriptions. `sendPushNotification(profileId, payload)` in `src/lib/push/index.ts` fetches subscription and calls `webpush.sendNotification()` with 410 stale-subscription cleanup. `PushPermissionPrompt` client component wired into hub layout.

### How to access for testing
- Log in → push permission prompt fires once per session if `Notification.permission === 'default'`
- Grant → check `push_subscriptions` table in Supabase dashboard
- API: `POST /api/push/subscribe` with `{ endpoint, keys: { p256dh, auth } }`

### Deviations from plan
- **Medium:** `push_subscriptions` table has a `keys: Json` column (single object), not separate `p256dh` and `auth` columns shown in Code Context. The subscribe route accepts `{ endpoint, keys: { p256dh, auth } }` and stores `keys` as JSON. This matches the actual DB schema; the Code Context type was stale.
- **Minor:** Delete-then-insert used instead of upsert (no unique constraint on `(profile_id, endpoint)` exists). Functionally equivalent.
- **Minor:** `PushPermissionPrompt` extracted to `src/components/hub/push-permission-prompt.tsx` rather than inlined into layout — necessary because hub layout is a Server Component.

### Standards check
Pass — auth guard present in both POST and DELETE, no `window`/`navigator` at render time (correctly inside `useEffect`), no `adminClient` in client component, `urlBase64ToUint8Array` returns explicit `Uint8Array<ArrayBuffer>` type.

### Convention check
Pass — `adminClient` used for the subscription write (authenticated user but write needs service-level access consistent with the pattern), VAPID keys handled server-only, `web-push` never imported in client code.

---

## Notes for Implementation Agent

- This task is sonnet-recommended: cross-cutting concern (touches auth layer, layout, new API route, new lib), security-sensitive VAPID key handling, and stale subscription 410 error recovery logic.
- `NEXT_PUBLIC_VAPID_PUBLIC_KEY` must be the same value as `VAPID_PUBLIC_KEY` — one is exposed to the browser for `PushManager.subscribe()`, the other stays server-side for signing.
- Do NOT import `web-push` in any Client Component — it's a Node.js-only module. Keep it in `src/lib/push/index.ts` which is server-only.
- The `push_subscriptions` table uses `profile_id` (from `profiles` table), which is the same as `auth.users.id`. Fetch it from `user.id` after the auth guard.
