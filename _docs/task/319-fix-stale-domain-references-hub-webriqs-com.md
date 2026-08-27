# 319: Fix Stale Domain References After Custom Domain Rename to hub.webriqs.com

**Created:** 2026-08-27
**Priority:** LOW
**Type:** bugfix
**Recommended Tier:** fast
**Status:** Completed

---

## Overview

While setting up and live-testing task 318 (Zoho Mail ticketing migration), the app's production domain changed twice in quick succession: `webriq-central-hub-lime.vercel.app` → `centralhub.webriq.cloud` → `hub.webriqs.com` (confirmed final). This surfaced two unrelated stale-domain issues discovered along the way, both fixed in this session:

1. `next.config.ts` already had a permanent redirect from the old `*.vercel.app` URL to `centralhub.webriq.cloud` (added in an earlier, undocumented change) — now stale itself, since that domain is also retired.
2. `src/lib/email/resend.ts`'s invite-email fallback URL, and `env.example`'s matching comment, both hardcoded `https://hub.webriq.com` (missing the "s") — confirmed by the user to be wrong; the real domain is `https://hub.webriqs.com`.

This is a small, self-contained cleanup task, split out from task 318 because it's unrelated to ticketing/email-provider scope — it's a domain-rename correction that happened to surface during that task's live setup.

## Requirements

- [x] `next.config.ts`: redirect the legacy `webriq-central-hub-lime.vercel.app` domain straight to `hub.webriqs.com` (was chaining through the now-also-legacy `centralhub.webriq.cloud`).
- [x] `next.config.ts`: add a new permanent redirect from `centralhub.webriq.cloud` to `hub.webriqs.com`, so old bookmarks/links to that domain keep resolving.
- [x] `src/lib/email/resend.ts`: fix `sendInvitationEmail()`'s hardcoded fallback URL (`https://hub.webriq.com` → `https://hub.webriqs.com`) — only used when `NEXT_PUBLIC_APP_URL` is unset, but should still be correct.
- [x] `env.example`: fix the matching example-domain comment for `NEXT_PUBLIC_APP_URL`.

## Out of Scope / Must-Not-Change

- Actually reconfiguring domains in the Vercel dashboard, or DNS records — that's the user's own infrastructure action, already done before this task started (the rename itself was already live when this task's fixes were made).
- The Supabase Vault `app_base_url` secret used by pg_cron jobs (migrations 077/078/122) — updated directly via SQL during task 318's live setup, not a code change, not part of this doc.
- Any other domain string across the codebase beyond the four confirmed stale references found — this was a targeted grep-and-fix, not a full domain audit.

## Proposed File Changes

| File | Action | Purpose |
|---|---|---|
| `next.config.ts` | Modify | Update the vercel.app→domain redirect destination; add a new centralhub.webriq.cloud→hub.webriqs.com redirect. |
| `src/lib/email/resend.ts` | Modify | Fix hardcoded invite-email fallback URL. |
| `env.example` | Modify | Fix `NEXT_PUBLIC_APP_URL` example comment. |

## Code Context

### `next.config.ts` — existing redirect pattern this follows exactly

```ts
{
  source: "/:path*",
  has: [{ type: "host", value: "webriq-central-hub-lime.vercel.app" }],
  destination: "https://hub.webriqs.com/:path*",
  permanent: true,
},
{
  source: "/:path*",
  has: [{ type: "host", value: "centralhub.webriq.cloud" }],
  destination: "https://hub.webriqs.com/:path*",
  permanent: true,
},
```

## Acceptance Criteria

- [x] `npx tsc --noEmit` passes.
- [ ] Live check (pending, requires the redirect to be deployed): visiting `https://centralhub.webriq.cloud/desk/tickets` in a browser 308-redirects to `https://hub.webriqs.com/desk/tickets`, preserving the path. Not run in this session — see Implementation Notes.
- [x] A new invite email (if triggered) links to `hub.webriqs.com`, not the stale `hub.webriq.com`, when `NEXT_PUBLIC_APP_URL` is unset.

## Verification

```bash
npx tsc --noEmit
pnpm lint
# Manual (post-deploy): curl -I https://centralhub.webriq.cloud/ — confirm 308 redirect to
#   https://hub.webriqs.com/, and that both legacy domains are still attached in the Vercel
#   project's Domains settings (a Next.js redirect only fires for requests that actually reach
#   this deployment — if a domain was fully detached from the Vercel project, this code-level
#   redirect never runs and the fix must happen at DNS/registrar level instead).
```

## Compatibility Touchpoints

- No schema, API, or UI changes — config and one string-literal fallback only.
- No effect on any deployment where `NEXT_PUBLIC_APP_URL` is already correctly set to `hub.webriqs.com` (the fallback only matters when that env var is missing).

## Implementation Notes

### What Changed
- Added/updated two `next.config.ts` redirect rules (see Code Context) so both retired domains land on `hub.webriqs.com`.
- Fixed the one-letter-off domain typo (`hub.webriq.com` → `hub.webriqs.com`) in `resend.ts`'s invite-email fallback and `env.example`'s matching comment.

### Files Changed
- `next.config.ts` - redirect destinations updated/added.
- `src/lib/email/resend.ts` - invite-email fallback URL corrected.
- `env.example` - `NEXT_PUBLIC_APP_URL` example comment corrected.

### Deviations From Plan
- None — this task doc was written after the fixes were already made (during task 318's live setup session), matching what was actually done rather than the reverse. No scope drift.

### Verification Run
- `npx tsc --noEmit` - PASS (clean, no errors)
- `pnpm lint` - PASS (0 errors; 2 pre-existing warnings in an unrelated file, not touched by this task)
- Live redirect check (`curl -I https://centralhub.webriq.cloud/`) - **SKIPPED**, requires this code to actually be deployed first (same push/redeploy step covering task 318's changes). Marked complete at the user's explicit request — see Completion Note.

### Completion Note
Marked **Completed** at the user's explicit request, alongside task 318, in the same session. The one unverified item is the live redirect behavior post-deploy (pending a push the user does on their own schedule) — everything else (code correctness, `tsc`/lint) is confirmed. If the redirect doesn't fire after deploying, the most likely cause is one of the two legacy domains having been fully detached from the Vercel project rather than left attached-but-secondary — check Vercel's Domains settings first.
