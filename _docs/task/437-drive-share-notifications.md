# 437: Drive — In-app + Email Notifications When Something Is Shared With You

**Created:** 2026-10-07
**Priority:** MEDIUM
**Type:** feature (follow-up to task 436)
**Recommended Tier:** balanced (no schema change; server-side fan-out across in-app, push and email; touches the share routes)
**Status:** Completed

---

## Overview

Task 436 shipped the personal Drive with per-folder/per-file sharing, but deliberately skipped notifications (436 decision D8/D10): a recipient only discovers a share by opening **Drive → Shared with me**. This task closes that gap. When an owner shares a folder or file, every recipient gets:

1. an **in-app notification** (the bell, deep-linked into *Shared with me*), and
2. an **email** to their account address, with an **Open in Drive** button.

Recipients can't opt out in v1 (share alerts are low-volume and caused by a deliberate action).

## Decisions & Assumptions (confirmed with the user unless marked)

| # | Decision | Notes |
|---|----------|-------|
| N1 | **Role shares notify everyone currently holding that role**, in-app **and** email. | Confirmed. Fan-out is one in-app row + one personal email per person (never a shared To/Cc list, so addresses aren't exposed). Sharer is always excluded. |
| N2 | **Triggers: a new share, and a permission upgrade (`view` → `edit`).** Downgrades, removals and no-op re-shares are silent. | Confirmed. |
| N3 | **Always send in v1** — `notification_preferences` is not consulted. | Confirmed. The table exists (email defaults off) but there is no preferences UI; honouring it would make emails effectively never send. Follow-up if opt-out is wanted. |
| N4 | **Best-effort, post-response.** Notifications run via `after()` (task 417 precedent, `src/lib/projects/touch-project.ts`) so they never slow or fail the share request. Failures are logged. | In-app row is written first; email failure never rolls back the share or the in-app row. |
| N5 | **Role membership is resolved at share time only.** Someone who gains the role later gets no retroactive alert (they still see the item under *Shared with me*). | Matches how the share itself works (live role match). |
| N6 | **Recipients with no email, non-staff roles, or the sharer are skipped.** A person who is both named directly and via a role is notified once. | Dedupe by profile id. |
| N7 | **Web push rides along for free** — `createNotification()` already calls `sendPushNotification()` best-effort. | No new push code. |

## Requirements

- On `POST /api/drive/shares` creating a **new** share row → notify the grantee(s) (N1/N2).
- On `POST /api/drive/shares` hitting the existing "re-share = update permission" branch, and on `PATCH /api/drive/shares/[shareId]`: notify **only** when the stored permission goes `view` → `edit`. Same permission, or `edit` → `view`, sends nothing.
- `DELETE` sends nothing.
- **In-app notification** (via `createNotification`, `src/lib/notifications/index.ts`):
  - `type`: `"drive_share"` (free-text column; no check constraint exists on `notifications.event_type`).
  - `title`: `"{Sharer} shared a folder with you"` / `"… a file with you"`; for an upgrade: `"{Sharer} gave you edit access to {name}"`.
  - `body`: `"“{name}” — you can view it."` / `"…you can view and edit it."` (sentence case, no exclamation points).
  - `url`: `/drive?view=shared&folder=<id>` or `/drive?view=shared&file=<id>` (task 436's deep-link scheme; a shared file opens its folder and the preview).
  - `actorId`: the sharer.
- **Email** (new `src/lib/email/drive-share-notification.ts`, built on the shared `transporter`/`FROM` exports in `mailer.ts`):
  - One email per recipient, personalised greeting by first name (fallback "Hi there").
  - Subject: `{Sharer} shared “{name}” with you on Drive` (upgrade: `{Sharer} gave you edit access to “{name}”`).
  - Body: who shared, what (folder/file name + type), the access level in plain words ("You can view this" / "You can view and edit this"), a note that folder shares include everything inside, and **one** CTA button **Open in Drive** linking to the same URL as the in-app notification (absolute, from `NEXT_PUBLIC_APP_URL`, fallback `https://hub.webriq.com`).
  - Plain-text alternative included. HTML in the **Design System v2.0** email style used by `ticket-created-notification.ts` (Arial/web-safe only, `#F4F6FB` page, `#FFFFFF` card with `#E2E7F2` border, `#0B1533`/`#3A4565`/`#5F6A88` text, orange `#FB914E`/`#471F02` pill CTA, logo from `/webriq_logo.webp`). All user-supplied strings HTML-escaped (`esc()`).
- **Recipient resolution** (new `src/lib/drive/notify-share.ts`):
  - User share → that profile. Role share → all `profiles` with that role.
  - Emails come from `auth.users` (profiles has no email column) via `adminClient.auth.admin.listUsers` paged at 1000 (same pattern as `lib/migrate/zoho-import.ts`), filtered to the recipient ids — staff headcount is small, so one paged listing beats N `getUserById` calls for role shares; use `getUserById` for a single named user.
  - Drop: the sharer, `client`-role profiles, anyone without an email, duplicates.
  - Send emails with bounded concurrency (5 at a time); one recipient's failure doesn't stop the rest.
- If `MAIL_HOST/MAIL_USER/MAIL_PASS` are unset the email step logs once and is skipped; the in-app notification still lands.

## Out of Scope / Must-Not-Change

- No schema/migration changes (the `notifications` table and its writer already exist).
- No notification-preferences UI and no opt-out (N3); no digest/batching of multiple shares into one email; no notification on removal or downgrade; no retroactive alerts when someone later joins a role (N5); no "share link" / external recipients.
- Do not change the shape of share creation/update responses, share semantics, or any RLS from tasks 436/167.
- Do not modify `createNotification`, `mailer.ts` exports, or Project Files code. (Adding a new file that imports `transporter`/`FROM` is the established pattern.)
- No git commands.

## Proposed File Changes

| File | Change |
|------|--------|
| `src/lib/email/drive-share-notification.ts` | **New.** `sendDriveShareEmail({ to, recipientName, sharerName, itemName, kind, permission, isUpgrade, url })` — builds subject/text/html and calls `transporter.sendMail`. ≤ ~110 lines. |
| `src/lib/drive/notify-share.ts` | **New.** `notifyDriveShare({ sharerId, target: { kind, id, name }, grantee: { userId } \| { role }, permission, isUpgrade })` — resolves recipients (N6), writes in-app rows via `createNotification`, then sends emails with concurrency 5. Exports a tiny pure `buildShareCopy()` (titles/bodies/subject) so copy lives in one place for in-app + email. ≤ ~130 lines; split `resolve-recipients.ts` if it grows. |
| `src/lib/drive/resolve-recipients.ts` | **New (if needed for the size budget).** `resolveShareRecipients(grantee, sharerId) → { id, name, email }[]`. |
| `src/app/api/drive/shares/route.ts` | In `POST`: after the insert (new share) call `after(() => notifyDriveShare(...))`; in the existing-row branch, fetch the **previous** permission before the update and notify only when `view → edit`. Needs the target's display name + sharer's name (one extra select each, already RLS-readable by the owner). |
| `src/app/api/drive/shares/[shareId]/route.ts` | In `PATCH`: read the existing row's `permission` + target/grantee first; after a successful update, notify when `view → edit`. |
| `CLAUDE.md` | Extend the **Personal Drive** bullet: share notifications (in-app `drive_share` + per-person email, role fan-out, upgrade-only re-notify, `after()`, no opt-out). Remove "share notifications" from its not-built list. |
| `_docs/task/436-personal-drive-my-files-shared-with-me.md` | One line under Follow-ups pointing at 437. |

No new env vars (uses existing `MAIL_*`, `NEXT_PUBLIC_APP_URL`, VAPID if push is configured).

## Code Context

- **In-app writer:** `src/lib/notifications/index.ts` — `createNotification(profileId, { type, title, body, url?, actorId? })` inserts into `notifications` (`recipient_id, actor_id, event_type, title, body, link, channels_sent`) with `adminClient` and best-effort `sendPushNotification`. `notifyProjectMembers` is the existing fan-out precedent. The bell (`src/app/(hub)/_components/notification-bell.tsx`, `/api/notifications*`) renders any `event_type` and navigates `link` — verify during implementation that an unknown type renders with the default icon and that clicking navigates to `link` (no per-type allowlist assumed; check before relying on it).
- **Email:** `src/lib/email/mailer.ts` exports `transporter` and `FROM`; `ticket-created-notification.ts` (≈70 lines) is the Design-System-v2.0 HTML template to mirror (table layout, `esc()`, pill CTA); `stackshift-order-notification.ts` shows the "skip + warn when no recipients" convention.
- **Post-response work:** `src/lib/projects/touch-project.ts` uses `after()` from `next/server` — same mechanism here (the share routes are Route Handlers).
- **Share routes to touch:** `src/app/api/drive/shares/route.ts` (POST has the "existing row → update permission" branch added in 436) and `shares/[shareId]/route.ts` (PATCH). Share rows: `drive_shares { folder_id | file_id, user_id | role, permission, added_by }`; the owner can read targets and shares via RLS, so name lookups can use the session client (`viewer.supabase`).
- **Names:** sharer name from `profiles.full_name`; item name from `drive_folders.name` / `drive_files.file_name`.
- **Deep links:** task 436 `useDriveDeeplink` — `?view=shared&folder=<id>` opens the folder; `?view=shared&file=<id>` opens the file's folder + preview. A role/user recipient only has the item in the `shared` view, so notifications must always use `view=shared`.
- **Email recipients:** `adminClient.auth.admin.listUsers({ page, perPage: 1000 })` loop (see `src/lib/migrate/zoho-import.ts:78`); role membership from `profiles.role`.

## Implementation Steps

1. **Verify the bell:** confirm `notification-bell.tsx` renders an unknown `event_type` and navigates `link`; if it maps types to icons, add `drive_share` there (smallest possible change, noted in Deviations).
2. Write `buildShareCopy()` + `src/lib/email/drive-share-notification.ts` (text + HTML, escaped, one CTA).
3. Write `resolve-recipients.ts` and `notify-share.ts` (dedupe, exclusions, in-app first, emails with concurrency 5, per-recipient try/catch, single warn when mail isn't configured).
4. Wire `POST /api/drive/shares` (new share → notify; existing-row branch → capture previous permission, notify only on `view → edit`).
5. Wire `PATCH /api/drive/shares/[shareId]` (read previous row, notify only on `view → edit`).
6. Update CLAUDE.md and the 436 follow-up line.
7. Verify (below).

## Acceptance Criteria

**Triggers**
- Sharing a folder or file with a **person** creates one in-app notification for them and sends one email to their account address; the sharer gets neither.
- Sharing with a **role** notifies every current member of that role (minus the sharer and non-staff), each with their own in-app row and their own email; nobody sees other recipients' addresses.
- Changing a share from **Can view → Can edit** notifies the grantee(s) with the upgrade copy; **Can edit → Can view**, re-saving the same permission, and **removing** access send nothing.
- Re-sharing with someone who already has the same permission sends nothing.
- A person covered by both a direct share and a role share in the same request gets one notification.

**Content**
- In-app title/body and email subject/body match the Requirements copy (sentence case, names HTML-escaped in email, no exclamation points); the notification link and the email's **Open in Drive** button both open `/drive?view=shared&…` and land on the shared folder, or on the file's folder with its preview open.
- Email is branded per Design System v2.0 (tokens above), has a plain-text part, exactly one CTA, and a readable subject in a mail client.

**Robustness**
- The share API response time/shape is unchanged; a mail outage (or missing `MAIL_*`) never fails the share or the in-app notification and logs a single clear warning.
- A bad recipient (no email) or one SMTP failure doesn't stop the other recipients.
- No notification is sent to `client` accounts or to the sharer.

**Code quality**
- New files within budget (lib ≤ ~130 lines, email template ≤ ~110, route edits small); `npx tsc --noEmit` and `pnpm lint` clean; no `console.log`; no change to `createNotification`, `mailer.ts`, or Project Files.

## Verification

```bash
npx tsc --noEmit
pnpm lint

# File-length audit
wc -l src/lib/drive/notify-share.ts src/lib/drive/resolve-recipients.ts src/lib/email/drive-share-notification.ts src/app/api/drive/shares/route.ts "src/app/api/drive/shares/[shareId]/route.ts"
```

Manual (needs migrations 166/167 applied and `MAIL_*` configured; a dev SMTP catcher such as Mailpit or a test mailbox is enough):
1. Account A shares a folder with account B (person) → B's bell shows the notification; click opens the folder under *Shared with me*; B receives the email; A receives nothing.
2. A shares a file with role **Developers** → every developer gets bell + email; A and non-developers get none.
3. A changes B from view to edit → one "gave you edit access" notification + email; change back to view → none; remove → none.
4. Unset `MAIL_HOST` and share again → share succeeds, bell notification appears, one warning in the server log.
5. Share with a user who also holds the shared role in the same action → exactly one notification.

## Compatibility Touchpoints

- Existing `notifications` rows/UI: new `event_type` value only; confirm in step 1 that the bell handles it.
- Push: `createNotification` will also attempt a web push for recipients with subscriptions (N7) — expected, no extra config.
- `MAIL_HOST` / `MAIL_PORT` / `MAIL_USER` / `MAIL_PASS` / `MAIL_FROM` and `NEXT_PUBLIC_APP_URL` must be set in every deployed environment for email to send (existing requirement).
- CLAUDE.md and the 436 doc updated; `_docs/mcp-tools.md` unaffected (no MCP tools).

## Open Questions for Review

Resolved with the user: role shares **always email everyone** in the role, with no size threshold (N1 stands); opt-out is **deferred with no follow-up planned** (N3 stands).

None outstanding.

## Implementation Notes

### What Changed
- New share (person or role) and a `view` → `edit` upgrade now notify recipients with an in-app notification (`drive_share`, deep link into Shared with me, web push via the existing writer) and a personal Design-System-v2.0 email with one **Open in Drive** button. Downgrades, removals and same-permission re-shares are silent; no opt-out (N3).
- Role shares resolve to every current member at share time, excluding the sharer, `client` accounts and anyone without an email; one email per person, 5 at a time, one failure never stops the rest.
- Runs post-response via `after()`; a mail outage / missing `MAIL_*` never fails the share or the in-app notification (one logged warning).
- Bell shows a Drive icon for `drive_share`.

### Files Changed
- `src/lib/drive/share-copy.ts` - new; single source of the notification/email wording + deep-link path
- `src/lib/drive/resolve-recipients.ts` - new; recipient + email resolution (adminClient, commented)
- `src/lib/drive/notify-share.ts` - new; `scheduleDriveShareNotice()` (after(), name lookup, in-app then email fan-out)
- `src/lib/email/drive-share-notification.ts` - new; email template
- `src/app/api/drive/shares/route.ts` - POST: notify on new share; on the existing-row branch only for `view → edit`
- `src/app/api/drive/shares/[shareId]/route.ts` - PATCH: read previous permission, notify only on `view → edit`
- `src/app/(hub)/_components/notification-bell.tsx` - `drive_share` icon (HardDrive, blue tint)
- `CLAUDE.md`, `_docs/task/436-…md` (follow-up pointer), `TASKS.md`

### Deviations From Plan
- Added `src/lib/drive/share-copy.ts` (plan had `buildShareCopy()` inside `notify-share.ts`): both the email module and the notifier need it, and keeping it separate avoids a circular import. `resolve-recipients.ts` was created (the plan marked it conditional) to keep `notify-share.ts` small.
- Step 1 check: the bell already rendered unknown types with a default icon and navigated `link`; the `drive_share` icon is an optional nicety, not a requirement.
- Name lookups happen inside `after()` with the owner's session, so the share response does zero extra queries.

### Verification Run
- `npx tsc --noEmit` - PASS
- `npx eslint` (new/changed lib, email, API and bell files) - PASS
- File-length audit - PASS (largest new file 64 lines; routes 78 / 55 lines)
- Copy smoke test (`buildShareCopy` for folder/view and file/edit-upgrade) - PASS (output matches the Requirements wording)
- **NOT RUN:** the live manual scenarios (person share, role share fan-out, upgrade/downgrade/remove, mail unset, bell click-through) — need two accounts and a configured `MAIL_*` / SMTP catcher.

## Quality Gate Notes

### Result
PASS

### Standards Review
- Reviewed all files from Implementation Notes against the checklist; no blocking issues. No `any`, dead or commented-out code, or debug logging (only `console.warn/error` on failure paths); every failure path is handled intentionally (per-recipient `allSettled`, one warning when `MAIL_*` is unset, whole job wrapped in try/catch).
- **Fixed during this gate (medium robustness):** `scheduleDriveShareNotice` originally looked up the sharer/item names with the request's own Supabase session inside `after()`. A post-response job can't rely on that session/cookies still being usable, and a failed lookup returned silently — dropping every notification with no log. It now takes the `sharerId` and reads the two display names with `adminClient` (already used by the recipient resolver; the caller is authorised by the route before scheduling, and only those two names are read — commented inline). The `DriveViewer` parameter is gone; both share routes pass `viewer.userId`.
- Responsibilities are clean: `share-copy.ts` (pure wording), `resolve-recipients.ts` (who), `notify-share.ts` (orchestration), `drive-share-notification.ts` (email rendering); the routes only schedule. Sizes: 37 / 39 / ~64 / 50 lines; routes 78 / 55.
- Re-verified after the fix: `npx tsc --noEmit` and `npx eslint` (lib/drive, email module, `/api/drive`) — PASS.

### Deviations
- **Minor** — separate `share-copy.ts` and `resolve-recipients.ts` files (avoid a circular import / keep files small).
- **Minor** — Drive icon for `drive_share` in the bell (optional nicety).
- **Minor** — `adminClient` for the two name lookups (see above) instead of the owner's session; inline-justified.
- No Major deviations: no scope added, no migration, `createNotification`/`mailer.ts`/Project Files untouched, share semantics and response shapes unchanged.

### Required Fixes
- None.

- Note: task 438 batches Drive shares (one POST per target); each POST still fires its own notification exactly as specified here.
