# 288: Import Zoho User Profile Photos into `profiles.avatar_url`

**Created:** 2026-08-21
**Priority:** MEDIUM
**Type:** feature
**Recommended Tier:** balanced
**Status:** Planned

---

## Overview

`profiles.avatar_url` already exists (migration `025_v2_schema.sql`) and is already rendered across the UI (issue/task detail assignee avatars, notification bell, project detail, list views), but it is never populated by the Zoho bulk-import flow — `zoho-import/users/route.ts` only ever writes `full_name`. This task extends that import to also fetch and store each user's Zoho profile photo.

Research this session established:

- Every Zoho product we checked (People, Projects/CRM, Cliq) serves user photos from the same undocumented, **unauthenticated** endpoint: `https://contacts.zoho.com/file?ID={id}&fs=thumb` — verified live via `curl` (headers only), no OAuth token or session cookie required, `HTTP 200` / `image/png`.
- The `ID` param **is the same `zuid`** already captured into `hub_users.external_id` for every user today — confirmed by cross-referencing a known-real-photo ID (`871125681`, 3586 bytes, a distinct image) against the real `_from_zoho/users.json` export and finding it matches April Grace Trocio's `zuid` exactly.
- **No new Zoho OAuth scope, API integration, or refresh-token regeneration is needed.** An earlier hypothesis that this required `ZohoCRM.users.READ` / `ZOHOPEOPLE.forms.READ` / `ZohoDirectory.users.READ` / `profile.userphoto.READ` was a dead end — none of those gate this endpoint.
- The endpoint **never 404s**. A user with no custom photo uploaded (e.g. `zuid 727458079`, tested live) silently returns Zoho's generic default avatar — also PNG, also exactly 2001 bytes, both times observed. This must be detected and skipped, or every photo-less user gets the same fake avatar imported.
- Decision made in conversation: **re-host, don't hot-link.** Fetch the image once at import time and upload it to Supabase Storage; store our own public URL in `avatar_url`, not the raw `contacts.zoho.com` URL. Zoho is being actively decommissioned in this project (see `external_project_id` rename note in `CLAUDE.md`), and this endpoint is undocumented with no stability guarantee — hot-linking would just create a second migration later.

## Requirements

- [ ] New Supabase Storage bucket for user avatars (public read, so existing `<img src>` usages across the app keep working with no auth-header plumbing).
- [ ] For each Zoho user processed by `zoho-import/users/route.ts` (both the existing-user update branch and the new-user create branch), fetch `https://contacts.zoho.com/file?ID={zuid}&fs=thumb` via a plain `fetch()` (no `Authorization` header — this is not a `projectsapi.zoho.com`/Desk API call, do not route it through `fetchZohoWithRetry`).
- [ ] Detect and skip Zoho's generic default-avatar placeholder (hash comparison, not just byte length — see Implementation Steps for how to capture the reference hash).
- [ ] Upload real (non-placeholder) photos to the new bucket, keyed by the internal `profiles.id` (stable even if Zoho/`zuid` goes away later), and write the resulting public URL into `profiles.avatar_url`.
- [ ] Re-running the import should overwrite a previously-imported avatar (`upsert: true`) so re-imports pick up updated Zoho photos.
- [ ] A user whose fetch fails (network error, non-200, placeholder match) must not fail the whole import — log and continue, same pattern as existing `result.errors` handling in this route.
- [ ] Import result summary (`result` object returned to the caller) should reflect avatar outcomes — extend it with counts, don't silently fold into `imported`/`updated`.

## Out of Scope / Must-Not-Change

- Fixing the live OAuth-signup avatar path (`handle_new_user()` reading `raw_user_meta_data->>'avatar_url'` in migration `026_rls_policies_v2.sql`). Flagged during research as likely broken too (Zoho's custom OIDC provider probably doesn't emit a literal `avatar_url` claim), but that's a separate signup-time bug, not part of this bulk-import feature.
- Any change to the Zoho OAuth scopes, `ZOHO_REFRESH_TOKEN`, or `env.example` — confirmed not needed for this task.
- `zoho-export/users/route.ts` — the export step needs no changes; `zuid` is already captured in the exported JSON.
- Any change to `hub_users` table or its fields — only `profiles.avatar_url` is written by this task.

## Proposed File Changes

| File | Action | Purpose |
|------|--------|---------|
| `supabase/migrations/112_user_avatars_storage.sql` | Create | New public `user-avatars` storage bucket + RLS policies (mirror `onboarding-assets` pattern from migration 005) |
| `src/app/api/admin/zoho-import/users/route.ts` | Modify | Add photo fetch + placeholder-hash check + storage upload + `avatar_url` write, in both the update and create/patch branches |

## Code Context

### File: `supabase/migrations/005_onboarding_storage.sql` (pattern to mirror — public bucket)

```sql
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('onboarding-assets', 'onboarding-assets', true, 26214400, ARRAY['image/jpeg', 'image/png', ...])
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Public read access for onboarding assets"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'onboarding-assets');
```

For `user-avatars`, restrict `allowed_mime_types` to `ARRAY['image/png']` (Zoho's endpoint has only ever been observed returning PNG) and keep `file_size_limit` small (e.g. `2097152` / 2MB — these are thumbnails, observed sizes so far are 2–4KB).

### File: `src/app/api/upload/route.ts` (pattern to reuse — fetch bytes → Buffer → admin upload → getPublicUrl)

```ts
const arrayBuffer = await file.arrayBuffer();
const buffer = Buffer.from(arrayBuffer);

const { error: uploadError } = await adminClient.storage
  .from("onboarding-assets")
  .upload(storagePath, buffer, { contentType: file.type, upsert: false });

const { data: { publicUrl } } = adminClient.storage.from("onboarding-assets").getPublicUrl(storagePath);
```

Adapt: source bytes come from `await (await fetch(zohoPhotoUrl)).arrayBuffer()` instead of a form upload, target bucket is `user-avatars`, storage path is `${profileId}.png`, and `upsert: true` (re-imports should overwrite).

### File: `src/lib/zoho/index.ts:86-96` (why NOT to reuse `fetchZohoWithRetry` here)

```ts
export async function fetchZohoWithRetry(
  url: string,
  token: string,
  options?: { label?: string; maxRollingRetries?: number; headers?: Record<string, string> }
): Promise<ZohoFetchResult> {
  ...
  const doFetch = () =>
    fetch(url, { headers: { Authorization: `Zoho-oauthtoken ${currentToken}`, ...options?.headers } });
```

This wrapper always attaches an `Authorization: Zoho-oauthtoken` header and expects a `projectsapi.zoho.com`/Desk-style token. `contacts.zoho.com/file?...` is a different host, needs no token, and returns an image body (not JSON) — use a plain `fetch()` for this call, not this helper.

### File: `src/app/api/admin/zoho-import/users/route.ts:100-177` (both branches needing the new step)

```ts
const existing = hubUsersMap.get(email);

if (existing) {
  // Already in hub_users — update fields
  const [hubErr, profileErr] = await Promise.all([
    adminClient.from("hub_users").update({ ... }).eq("id", existing.id).then(({ error }) => error),
    adminClient.from("profiles").update({ full_name: fullName }).eq("id", existing.id).then(({ error }) => error),
  ]);
  ...
} else {
  // ...creates auth user, then:
  const [hubPatchErr, profilePatchErr] = await Promise.all([
    adminClient.from("hub_users").update({ ... }).eq("id", authUserId).then(({ error }) => error),
    adminClient.from("profiles").update({ full_name: fullName }).eq("id", authUserId).then(({ error }) => error),
  ]);
  ...
}
```

Both `profiles` updates need `avatar_url` added conditionally (only when a real, non-placeholder photo was successfully fetched and uploaded — don't overwrite `avatar_url` with `null` on a fetch failure or placeholder match, since a prior successful import may already have set it).

## Implementation Steps

1. **Capture the reference placeholder hash first**, before writing any import logic: hit `https://contacts.zoho.com/file?ID={a-zuid-known-to-have-no-photo}&fs=thumb` (e.g. `727458079`, confirmed placeholder during research), compute its SHA-256, and hard-code that hash as a constant (e.g. `ZOHO_DEFAULT_AVATAR_SHA256`) in the route file with a comment explaining what it is and how it was derived. Sanity-check against a second known-placeholder ID if possible — both should match.
2. Add the `user-avatars` storage bucket migration (112), mirroring `onboarding-assets`: `public: true`, `allowed_mime_types: ['image/png']`, small `file_size_limit`.
3. In `zoho-import/users/route.ts`, add a helper (module-scoped function, not exported — this route is the only caller) that takes a `zuid` and `profileId`, does:
   - `fetch(`https://contacts.zoho.com/file?ID=${zuid}&fs=thumb`)` (plain fetch, no auth headers, reasonable timeout)
   - on non-200 or network error: return `null` (caller logs + continues, doesn't fail the row)
   - on success: read bytes, SHA-256 hash, compare to `ZOHO_DEFAULT_AVATAR_SHA256` — if it matches, return `null` (no real photo)
   - otherwise: upload to `user-avatars/${profileId}.png` via `adminClient.storage` with `upsert: true`, return the public URL
4. Call this helper for every `zohoUser` processed (both branches), using `existing.id` (update branch) or `authUserId` (create branch) as `profileId`.
5. Only include `avatar_url` in the `profiles` update payload when the helper returned a non-null URL — don't clobber an existing avatar on transient fetch failure.
6. Extend the `result` object (currently `{ imported, updated, skipped, errors }`) with avatar-specific counters, e.g. `avatarsImported: number`, so the admin caller can see how many photos actually landed vs. were skipped as placeholders/failures.
7. Run the import against the real `_from_zoho/users.json` (37 users) and manually verify: a known-real-photo user (e.g. April Grace Trocio, `zuid 871125681`) ends up with a populated, working `avatar_url`; a known-no-photo user (e.g. Alex Belding, `zuid 727458079`) ends up with `avatar_url` left `null`, not a placeholder image.

## Acceptance Criteria

- [ ] `supabase/migrations/112_user_avatars_storage.sql` creates a public `user-avatars` bucket with RLS mirroring the `onboarding-assets` pattern.
- [ ] Running `POST /api/admin/zoho-import/users` populates `profiles.avatar_url` for users with a real Zoho photo, and leaves it untouched (not set to the placeholder image, not overwritten with `null`) for users without one.
- [ ] Zoho's generic default avatar is never stored as a user's `avatar_url`.
- [ ] A network failure fetching one user's photo does not abort the import or mark that user as `skipped` in the pre-existing `imported`/`updated`/`skipped`/`errors` counters — it only affects the new avatar-specific counter.
- [ ] Re-running the import a second time overwrites a previously-imported avatar (`upsert: true` behavior verified).
- [ ] Existing avatar render sites (issue/task detail, notification bell, project detail, list views) display the newly-imported photos with no code changes needed there — confirms the stored URL format is directly usable as an `<img src>`.

## Verification

```bash
npx tsc --noEmit
pnpm lint
```

Manual/browser verification (per project convention — no test runner configured):
- Apply migration 112, run the import against the real `_from_zoho/users.json`, and check a handful of `profiles.avatar_url` values in Supabase directly.
- Load a page that renders assignee avatars (e.g. an issue detail page) for a user known to have a real Zoho photo and confirm the image renders.
- Confirm the `user-avatars` bucket in Supabase Storage contains the uploaded files and that fetching the public URL directly in a browser works (public bucket).

## Compatibility Touchpoints

- No packaging/docs/adapter changes.
- New Supabase Storage bucket must be created via migration in every environment (local, staging, prod) before the import route is run there — matches the existing pattern for `onboarding-assets`/`project-assets`/`customer-assets`/`kb`/`task-content` buckets.

## Implementation Notes

### What Changed
- Added `supabase/migrations/112_user_avatars_storage.sql` — public `user-avatars` bucket (2MB limit, `image/png` only), public read policy, admin/super_admin-only write policy (via `get_my_role()`).
- Added `fetchAndStoreAvatar(zuid, profileId)` to `zoho-import/users/route.ts` — plain unauthenticated `fetch` (not `fetchZohoWithRetry`) against `contacts.zoho.com/file?ID={zuid}&fs=thumb`, SHA-256 hash check against the captured placeholder hash, upload to `user-avatars/{profileId}.png` with `upsert: true`.
- Captured the placeholder reference hash live before writing the check: downloaded the images for `zuid 727458079` and `zuid 839460623` (both previously observed as 2001-byte placeholders) to the session scratchpad and confirmed via `shasum -a 256` that they are byte-identical — `4521ac8461e45e62a59b56e7e6dbe066e7673ea64fdddaccca333a4862d78457`. Also re-downloaded `zuid 871125681` (April Grace Trocio's real photo, 3586 bytes) and confirmed its hash differs, as expected. Hardcoded as `ZOHO_DEFAULT_AVATAR_SHA256` with a comment explaining derivation.
- Wired the helper into both the "existing user" update branch and the "new user" create/patch branch — `avatar_url` is only included in the `profiles` update payload when a real (non-placeholder) photo was fetched and uploaded, so a transient failure or a photo-less user never clobbers a previously-imported avatar with `null`.
- Extended the route's `result` object with `avatarsImported` and `avatarsSkipped` counters, kept separate from the pre-existing `imported`/`updated`/`skipped`/`errors` counters so avatar outcomes don't distort the existing user-sync accounting.

### Files Changed
- `supabase/migrations/112_user_avatars_storage.sql` - new storage bucket + RLS
- `src/app/api/admin/zoho-import/users/route.ts` - avatar fetch/hash/upload helper, wired into both sync branches, extended result shape

### Deviations From Plan
- None. Implementation followed the task doc's Implementation Steps 1-6 as written.
- Step 7 (running the import against the real `_from_zoho/users.json` and eyeballing `profiles.avatar_url`/rendered avatars in the browser) was not run in this session — it requires an authenticated admin session against a live Supabase instance with the new migration applied, which is outside what this coding session can drive. Left for the `test` stage / a manual admin run, per the task doc's Verification section (this project has no automated test runner — "browser-based acceptance testing" is the documented pattern).

### Verification Run
- `npx tsc --noEmit` - PASS
- `pnpm lint` - PASS (2 pre-existing warnings in an unrelated file, 0 errors)
- Manual browser/Supabase verification (migration apply, run import, check `avatar_url` values, confirm avatar renders in UI) - SKIPPED (needs live Supabase + authenticated admin session; not drivable from this session)

## Quality Gate Notes

### Result
PASS

### Standards Review
- No unused/dead/commented-out code; no `any`; `fetchAndStoreAvatar` uses guard clauses (`if (!zuid) return null`, `if (!res.ok) return null`, etc.) rather than nested conditionals.
- Errors handled intentionally: the fetch/hash/upload sequence is wrapped in try/catch and every failure path returns `null` rather than throwing, matching this route's existing convention of logging-and-continuing per user instead of aborting the whole import.
- Naming, function scope, and `console.log`/`console.error` usage match the file's pre-existing conventions exactly (this route already logs heavily per user; the new logging follows the same `[zoho-import/users] ...` prefix style).
- The two call sites (existing-user branch, new-user branch) each repeat the same 3-line "call helper, bump one of two counters" block. Per this project's stated convention ("three similar lines is better than a premature abstraction"), this is intentional, not a finding.
- Confirmed `Buffer` (used in the new helper) is already relied on unimported/as a Node global elsewhere in this codebase (`src/app/api/upload/route.ts`) — consistent, no missing-import risk.

### Deviations
- **Minor:** The `user-avatars` bucket's write RLS policy restricts writes to `admin`/`super_admin` via `get_my_role()` (mirroring migration 057's `customer-assets` staff-gated pattern), rather than the fully-open "any authenticated user" write policy shown in migration 005's `onboarding-assets` (the pattern the task doc's Code Context called out to mirror). This is a deliberate tightening, not a functional gap — the actual upload path goes through `adminClient` (service role, bypasses RLS) either way, so behavior is unaffected; the policy only matters for a hypothetical future direct-client upload path, and the tighter version is safer for a bucket that isn't meant to accept arbitrary user uploads the way onboarding assets are.
- **Medium (risk note, not a required fix):** `zoho-import/users/route.ts` has no `maxDuration`/timeout handling, and this change adds up to one additional sequential external network call (up to a 10s timeout on failure) per user inside a single `POST` handler. For the current 37-user export this is low-risk, but if the user list grows substantially or `contacts.zoho.com` degrades, the request could run long enough to hit a platform-level serverless timeout. This is not a new category of risk — every existing `zoho-import`/`zoho-export` route in this codebase already loops synchronously over up to 1000 users with no duration safeguard — so it's consistent with the established (if imperfect) pattern here, and adding timeout/duration handling across that whole family of routes is out of this task's scope. Flagging for future follow-up rather than fixing here.

### Required Fixes
- None (PASS).

## Post-Ship Verification Notes (2026-08-21)

After running the import against the live app, only 3 of 37 users ended up with a populated `avatar_url`. Investigated as a suspected bug (systematic-debugging process) before concluding it's correct behavior — documenting the evidence chain here so this number isn't mistaken for a regression later.

**Ground truth check:** fetched all 36 real `zuid`s (the 37th user, Regenia Robb, has no `zuid` at all) directly against `contacts.zoho.com/file?ID={zuid}&fs=thumb` and hashed the responses. Exactly 3 returned a distinct image (April Grace Trocio, Eleazar Junsan, Niña Anjerrie Baraquil); the other 33 all hashed identically to Zoho's generic placeholder. This matched the app's result exactly — the hash-detection logic is working correctly.

**But:** a live Cliq presence screenshot showed several other users (Allen, Jaymar Matiga, Kenet Medez, Mariel Genodiala, Mark John Mejias, Miguel Franco Trinidad, Nikki Gabato, Philippe Bodart) with real, distinct photos — contradicting the "no photo uploaded" conclusion for those users. Investigated further:
- Ruled out URL params (`exp`, `t=user`) — identical response with or without them.
- Ruled out session/auth — fetched the same URL with real Zoho session cookies (`credentials: 'include'`, from an authenticated browser tab) and still got the placeholder for Allen and Mark John Mejias.
- Root cause: `contacts.zoho.com/file?ID={zuid}` only serves the photo set at the **Zoho Accounts/Contacts level** — confirmed by checking Zoho's own Org Contacts directory, where Allen also shows the generic placeholder. **Zoho Cliq maintains a separate, independently-uploaded avatar per user, under its own internal ID, unrelated to `zuid`.** There is no single "the user's Zoho photo" across products; `zuid` only ever unlocks the Accounts-level one.
- Visually confirmed via direct image download+inspection: Jaymar Matiga and Mark John Mejias both download as the generic grey silhouette from this endpoint despite having real Cliq photos; April Grace Trocio downloads as her real photo, as expected.

**Decision (user, 2026-08-21):** ship as-is. The 3-of-37 result is the correct ceiling for this implementation and this data source — it imports every photo that's actually reachable via `zuid`, and correctly leaves everyone else `null` rather than importing a fake placeholder. Pulling in the Cliq-specific photos (likely the larger share of real photos in this org) would require a separate investigation into Cliq's own internal photo ID/API and is out of scope for this task — no code changes made as a result of this investigation.

## Follow-Up: Manual-Photo Fallback (2026-08-21)

After the above, the user manually downloaded real Cliq-sourced photos for 19 of the 37 users (via their own authenticated browser session — the one path confirmed to reliably get the real image) into `_from_zoho/user_photos/`, named `{full_name}.png`, or `{full_name} ({email}).png` for the two full_names shared by two Zoho accounts (Dannea Moneva, Philippe Bodart). Investigated further before concluding this couldn't be replicated server-side:

- Ruled out URL params, Referer header, and session cookies (via an authenticated `fetch` from the user's own logged-in browser tab, `credentials: 'include'`) as fixes — all still returned the Accounts-level placeholder for users with real Cliq photos.
- The one thing never isolated: whether the block is specific to CDP/browser-automation (`navigator.webdriver`), since every automated test ran through either `curl` or a `claude-in-chrome`-controlled tab. Not resolved — the manual-download route made further isolation unnecessary.

**Code change:** `zoho-import/users/route.ts` now checks `_from_zoho/user_photos/` first for each user (via `loadLocalPhotoIndex()` / `resolveLocalPhotoPath()`), matching by `email` when the filename has a `(email)` disambiguator, otherwise by exact `full_name` — but only when that `full_name` is unique across the roster (guards against silently matching the wrong one of two same-named accounts). Falls back to the original live `contacts.zoho.com` fetch + placeholder-hash check for anyone without a local file, preserving the 3 already-working Accounts-level imports and the correct `null` result for genuinely photo-less users.

**Verified before touching Supabase:** wrote a standalone Node script replicating the exact matching logic against the real `_from_zoho/users.json` (37 users) and `_from_zoho/user_photos/` (19 files) — all 19 files matched to the correct, unique `zuid`, including both duplicate-name disambiguations, with zero unmatched files and zero ambiguous matches. `npx tsc --noEmit` and `pnpm lint` both pass clean.

**Not yet done:** running the import against live Supabase with these files present (no DB credentials in this session — same limitation as the original implementation). Expected result: 22/37 users with `avatar_url` populated (19 local + 3 Accounts-level), everyone else correctly `null`.
