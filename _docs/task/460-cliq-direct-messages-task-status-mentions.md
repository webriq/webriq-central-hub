# 460: Cliq direct messages to individual users — task status changes and @mentions in task comments

**Created:** 2026-10-22
**Priority:** HIGH
**Type:** feature
**Recommended Tier:** balanced
**Status:** Planned

---

## Overview

The Hub already posts **channel** broadcasts to Zoho Cliq through an incoming webhook
(`sendCliqNotification` in `src/lib/zoho/index.ts`, currently gated off by
`CLIQ_NOTIFICATIONS_ENABLED = false`). That is one shared channel and cannot address an
individual.

The goal is a per-person DM: when Mark changes a task's status or @mentions a colleague in a task
comment, the affected person gets a Cliq message in their own 1:1 chat, with the actor's name and a
link to the task.

Decisions taken with the user (2026-10-22):

| Question | Answer |
|---|---|
| Sender identity | **One Hub service account.** Cliq's buddy endpoint authenticates as the token owner, so DMs come from that single Cliq account and are worded in the third person ("Mark changed the status of…"). Per-user sending would require storing every user's Zoho refresh token — rejected. |
| Comment DMs | **Mentions only.** A comment with no `@mention` sends no DM. This requires adding a mention feature to the shared task comment editor first. |
| Status-change recipients | **Assignees ∪ creator**, minus the actor. |

Research findings (Zoho Cliq REST v2 docs, 2026-10-22):

- A 1:1 message is `POST /api/v2/buddies/{EMAIL_ID}/message` with body `{ "text": "…" }`.
- The messaging scope is `ZohoCliq.Webhooks.CREATE`; the existing webhook token cannot be used here,
  so a new credential is required (Operator Steps).
- Rate limit: 20 requests/min per authenticating user, with a 10-minute lockout on breach.
- The recipient must be a member of the Cliq organization. Email is accepted directly, so no
  ZUID mapping is needed.

## Requirements

- [ ] **R1 — DM transport.** New `sendCliqDirectMessage(email, text)` posting to
      `{ZOHO_CLIQ_API_BASE_URL || "https://cliq.zoho.com"}/api/v2/buddies/{encodeURIComponent(email)}/message`
      with the JSON text body and the same OAuth refresh-token cache pattern as
      `src/lib/zoho/mail.ts`. No-op when its refresh-token env var is unset; every failure is caught
      and logged, never thrown.
- [ ] **R2 — Email resolution.** `profiles` has no email column; resolve it from `auth.users`
      (`adminClient.auth.admin.getUserById`). Skip users with no email and `client`-role profiles.
- [ ] **R3 — Status-change DM.** After a successful `PATCH /api/v2/tasks/[taskId]` that actually
      changes `status`: DM `assignees ∪ created_by`, minus the actor, deduped, capped at 10.
      Same-status PATCHes and position-only board moves send nothing.
- [ ] **R4 — Status message.** `<Actor> changed the status of <display_id> "<title>" from
      <Old label> to <New label>`, then the task URL on its own line.
- [ ] **R5 — Mentions in the task comment editor.** Add Tiptap's `@` mention to both
      `_comment-editor.tsx` copies (v2 and legacy; byte-identical today), sourcing the list from the
      existing `GET /api/staff/members`. Inserts
      `<span data-type="mention" data-id="<uuid>" data-label="<name>">`.
      Keyboard operable (↑ ↓ Enter Escape) with `role="listbox"` / `role="option"` and
      `aria-activedescendant`; Escape returns focus to the editor.
- [ ] **R6 — Mention DM.** On comment create, extract mention ids from the stored HTML, keep only
      existing staff profiles, drop the actor, dedupe, cap 10, and send
      `<Actor> mentioned you in a comment on <display_id> "<title>"` + URL.
- [ ] **R7 — No false positives.** No DM for comments without a mention, comment edits,
      attachment-only comments with no mention, or self-actions.
- [ ] **R8 — Post-response, best-effort.** All DM work runs inside `after()`, following
      `src/lib/drive/notify-share.ts` and `src/lib/projects/touch-project.ts`.
- [ ] **R9 — One status-label map.** Move the 8 task status labels into a pure
      `src/lib/tasks/status-labels.ts` and re-export from `_pm-shared.tsx` so DM text cannot drift.
- [ ] **R10 — Config documented.** `env.example` documents the new variables and the scope note.

## Out of Scope / Must-Not-Change

- **Do not flip `CLIQ_NOTIFICATIONS_ENABLED`** or change `sendCliqNotification` and its callers.
- **No per-user sender identity** and no storage of users' Zoho tokens.
- **Tickets are out** — task status changes and task comment mentions only.
- **MCP / Ops Chat writes bypass the routes** (`src/lib/mcp/tools/update-task-status.ts`,
  `update-task.ts` write directly to the table), so they send no DM. Documented gap.
- **No retry queue** for failures or 429s, and no per-user opt-out (`notification_preferences` has
  no Cliq column).
- **No in-app/push notifications** for these events.
- Do not widen the admin-only `src/app/api/v2/users/route.ts`.

## Proposed File Changes

| File | Action | Purpose |
|------|--------|---------|
| `src/lib/cliq/index.ts` | Create | Token cache + `sendCliqDirectMessage()` |
| `src/lib/cliq/logic.ts` | Create | Pure mention-id extraction, recipient dedupe/cap, message builders |
| `src/lib/cliq/notify.ts` | Create | Status and mention scheduling, recipient/email resolution |
| `src/lib/tasks/status-labels.ts` | Create | Pure `TASK_STATUS_LABEL` (`Record<TaskStatus, string>`) |
| `src/app/(hub)/projects-old/_pm-shared.tsx` | Modify | Re-export the label map (one line) |
| `src/app/api/v2/tasks/[taskId]/route.ts` | Modify | Select `status, title, display_id`; schedule the status DM on a real transition |
| `src/app/api/v2/tasks/[taskId]/comments/route.ts` | Modify | Schedule mention DMs after a successful insert |
| `src/app/(hub)/projects/_shared/_mention-extension.ts` | Create | Tiptap Mention instance + suggestion list, shared by both editors |
| `src/app/(hub)/projects/v2/[projectId]/tasks/[taskId]/_comment-editor.tsx` | Modify | Add the mention extension |
| `src/app/(hub)/projects/legacy/[projectId]/tasks/[taskId]/_comment-editor.tsx` | Modify | Same change (byte-identical copy) |
| `package.json` / `pnpm-lock.yaml` | Modify | `pnpm add @tiptap/extension-mention` |
| `env.example` | Modify | New variables + scope note |
| `_docs/task/460-cliq-dm.check.ts` | Create | `npx tsx` pure-logic checks |

## Code Context

### Cliq DM call shape (Zoho Cliq REST v2)

```
POST {base}/api/v2/buddies/{EMAIL_ID}/message
Content-Type: application/json
{ "text": "Mark changed the status of …" }
```

`base` is `https://cliq.zoho.com` unless `ZOHO_CLIQ_API_BASE_URL` overrides it. The docs do not
document a `/company/{id}` path segment for `/buddies`, and this tenant's existing webhook URL uses
a custom domain with one, so the base is configurable and verified live rather than assumed.

### Existing channel webhook — leave unchanged: `src/lib/zoho/index.ts:464-490`

```ts
const CLIQ_NOTIFICATIONS_ENABLED = false;

export async function sendCliqNotification(message: string, channel: "pm" | "dev" = "pm") {
  if (!CLIQ_NOTIFICATIONS_ENABLED) return;
  // … POST `${webhookUrl}?zapikey=${token}` with { text: message }
}
```

### Token-cache pattern to copy: `src/lib/zoho/mail.ts:25-65`

Module-level `_tokenCache` + `_tokenRefreshPromise`, 60 s expiry buffer, the same refresh-token
call shape used by the rest of `src/lib/zoho/`.

### Status PATCH: `src/app/api/v2/tasks/[taskId]/route.ts`

```ts
// line 31-33 — extend this select with status, title, display_id
const [{ data: existingTask }, { data: profile }] = await Promise.all([
  supabase.from("tasks").select("created_by, assignees, project_id").eq("id", taskId).maybeSingle(),
  supabase.from("profiles").select("role").eq("id", user.id).maybeSingle(),
]);

// line 91-99 — the transition to detect
if (typeof body.status === "string") { … patch.status = body.status; }

// line 115-121 — schedule here, after the successful update
if (Object.keys(body).some((k) => k !== "position")) touchProject(existingTask.project_id);
return NextResponse.json(data);
```

`taskId` here is the task UUID. The URL uses `projects.project_id` and `tasks.display_id`
(confirmed by `projects/v2/[projectId]/tasks/[taskId]/page.tsx:44,50`).

### Comment create: `src/app/api/v2/tasks/[taskId]/comments/route.ts:100-140`

```ts
const body = await req.json().catch(() => ({}));
const text = typeof body.body === "string" ? body.body.trim() : "";
const { data: comment, error } = await supabase
  .from("task_comments")
  .insert({ task_id: taskId, author_id: user.id, body: text })
  .select("id, body, created_at")
  .single();
…
touchProjectForTask(taskId);
```

The stored `body` is Tiptap HTML, so a mention is
`<span data-type="mention" data-id="…" data-label="…">@Name</span>`. Extract ids server-side with a
tolerant regex per `data-type="mention"` tag so attribute order does not matter.

### Comment editor: `_comment-editor.tsx:57-72` (identical in v2 and legacy)

```tsx
const editor = useEditor({
  extensions: [StarterKit.configure({ link: { openOnClick: false } }), Image],
  …
});
```

Add the shared mention extension to that array and one rendered style rule for mention spans in the
existing `editorProps.attributes.class` string.

### Staff list for the suggestion popup: `src/app/api/staff/members/route.ts`

Already returns `getAssignableMembers()` (`id, full_name, avatar_url, role`) to any authenticated
session, excluding deactivated users and `ASSIGNEE_EXCLUDE`. Fetch once on editor mount and filter
client-side as the user types.

### Post-response precedent: `src/lib/drive/notify-share.ts:45-64`

`after(async () => { … })`, `adminClient` for display-name lookups, every failure logged and
swallowed.

## Implementation Steps

1. `src/lib/tasks/status-labels.ts`: move the 8 labels verbatim from
   `projects-old/_pm-shared.tsx:33-42`; replace that literal with a re-export.
2. `src/lib/cliq/index.ts`: `getCliqAccessToken()` (cache + refresh, no-op when unconfigured) and
   `sendCliqDirectMessage(email, text)` (non-2xx → `console.error` with status and body).
3. `src/lib/cliq/logic.ts`: pure `extractMentionIds(html)`,
   `resolveRecipientIds({ assignees, creatorId, actorId })` (dedupe, drop actor/null, cap at
   `MAX_RECIPIENTS = 10`, return `{ ids, capped }`), `buildStatusMessage(...)`,
   `buildMentionMessage(...)`, `taskUrl(...)`. When `NEXT_PUBLIC_APP_URL` is unset, send without the
   URL line.
4. `src/lib/cliq/notify.ts`: `scheduleTaskStatusDm({ actorId, task })` and
   `scheduleCommentMentionDms({ actorId, taskId, body })`, both wrapped in `after()`; shared
   `actorName()` lookup (`profiles.full_name`, fallback `"A teammate"`). Filter recipients to staff
   roles and resolve emails from `auth.users`.
5. Wire `scheduleTaskStatusDm` in the PATCH route only when `patch.status` is defined and differs
   from `existingTask.status`.
6. Wire `scheduleCommentMentionDms` in the comments POST route only when the extracted id list is
   non-empty.
7. `_shared/_mention-extension.ts`: `Mention.configure({ suggestion: { items, render } })` plus an
   absolutely-positioned list near the caret, keyboard handling and ARIA per R5. If it grows past
   the repo's file-length guidance, split the list component into its own file.
8. Add the extension import + array entry to both `_comment-editor.tsx` copies.
9. `pnpm add @tiptap/extension-mention` (never npm/yarn).
10. `env.example`: document the two variables, the scope note, and the "separate credential — do not
    replace the Projects/Desk one" warning.
11. `_docs/task/460-cliq-dm.check.ts`: assert-based checks per AC2.

## Acceptance Criteria

- [ ] **AC1 (pre-merge, automated).** `npx tsc --noEmit` exits 0.
- [ ] **AC2 (pre-merge, automated).** `npx tsx _docs/task/460-cliq-dm.check.ts` exits 0. Asserts:
      mention ids from a two-mention body and from reordered attributes; a non-mention `data-id`
      ignored; no mention → `[]`; recipients = assignees ∪ creator − actor, deduped; >10 capped with
      `capped: true`; both messages contain actor, `display_id` and URL; the label map has exactly
      the 8 statuses.
- [ ] **AC3 (post-deploy, manual).** A developer sets a task to *Ready for QA/QC*; another assignee
      receives one DM containing the display id, both labels and a working URL; the actor receives
      none.
- [ ] **AC4 (post-deploy, manual).** A comment with `@<colleague>` DMs exactly that person and not
      the actor; a comment with no mention sends nothing.
- [ ] **AC5 (pre-merge, no-regression).** With the Cliq env var unset, comment create/edit/delete
      and task PATCH return the same responses and status codes as before, with no unhandled
      rejection.
- [ ] **AC6 (pre-merge, no-regression).** `sendCliqNotification` call sites and
      `CLIQ_NOTIFICATIONS_ENABLED = false` are unchanged.
- [ ] **AC7 (pre-merge, manual).** The mention list is fully keyboard operable and screen-reader
      announced.
- [ ] **AC8 (pre-merge, manual).** `_pm-shared.tsx` consumers render the same eight labels as
      before.

## Verification

```bash
npx tsc --noEmit
npx tsx _docs/task/460-cliq-dm.check.ts
pnpm lint
grep -rn "sendCliqNotification" src   # call sites unchanged
```

## Coordination

Checked every `Planned`, `In Progress` and `Testing` doc; none touches `src/lib/zoho/index.ts`,
`src/app/api/v2/tasks/**`, `_comment-editor.tsx`, or `_pm-shared.tsx`. Task 301 deliberately keeps
the four per-tree comment editors separate; this task adds the same shared extension to the two
*task* copies rather than merging them.

## Open Decisions

None blocking. Defaults stated and configurable:

- **D1 (NON-BLOCKING).** API base for this tenant: default `https://cliq.zoho.com`; the custom
  domain plus company path are set via `ZOHO_CLIQ_API_BASE_URL` after a live check.
- **D2 (NON-BLOCKING).** All 8 status transitions send a DM; same-status PATCHes send none.
- **D3 (NON-BLOCKING).** Fan-out capped at 10 recipients to stay under the 20/min sender limit.

## Credentials

Exactly **one new credential** is needed — a Cliq-scoped refresh token. Everything else is reused
or is plain config.

| Variable | Status | What it is |
|---|---|---|
| `ZOHO_CLIENT_ID` | Reuse — already set (`env.example:27`) | The same Zoho Self Client the Projects/Desk/Mail integrations use. Zoho allows only one Self Client per account, so no second credential pair. |
| `ZOHO_CLIENT_SECRET` | Reuse — already set (`env.example:28`) | Same client as above. |
| **`ZOHO_CLIQ_REFRESH_TOKEN`** | **New — the only real credential** | Refresh token minted from that Self Client with **`ZohoCliq.Webhooks.CREATE`** added to the scope list. Read by `src/lib/cliq/index.ts`. |
| `ZOHO_CLIQ_API_BASE_URL` | New, optional, not secret | Config only: `https://cliq.zoho.com`, or this tenant's custom-domain + company path if the live check requires it. |
| `NEXT_PUBLIC_APP_URL` | Reuse — already set (`env.example:21`) | Builds the task link inside the DM text. |

**Not usable for this:** `ZOHO_CLIQ_WEBHOOK_TOKEN` / `ZOHO_CLIQ_WEBHOOK_URL`. That is the
incoming-webhook credential and only authenticates `channelsbyname/…` and `bots/…` endpoints —
Zoho does not support `zapikey` on `/buddies/{EMAIL_ID}/message`. It is also why the existing
`sendCliqNotification` is channel-only.

**How to mint `ZOHO_CLIQ_REFRESH_TOKEN`** — same flow as `ZOHO_MAIL_REFRESH_TOKEN`, documented at
`src/lib/zoho/mail.ts:1-14`: Zoho API Console → the existing Self Client → add
`ZohoCliq.Webhooks.CREATE` → generate a code → exchange it for a refresh token. Do **not**
regenerate the existing `ZOHO_REFRESH_TOKEN`; that would drop the Projects/Desk scopes. Each scope
set gets its own token off the same client.

**Recipients need no credentials.** DMs are sent by the one service account; each recipient just has
to be a member of the WebriQ Cliq organization under the same email as their `auth.users` row.

### Known env.example defect (fix in this task)

`env.example:223` says "`ZOHO_CLIQ_WEBHOOK_URL` and `ZOHO_CLIQ_WEBHOOK_TOKEN` defined above under
Zoho section", but neither variable exists anywhere in the file — only `ZOHO_CLIQ_DEV_WEBHOOK_URL`
does. Correct that comment while adding the two new variables (R10).

## Operator Steps

1. Add the messaging scope to the Zoho Self Client and mint a **separate** refresh token for Cliq;
   keep the existing Projects/Desk token untouched (same split as `ZOHO_MAIL_REFRESH_TOKEN`).
2. Verify the correct API base for this tenant with one test DM, then set
   `ZOHO_CLIQ_API_BASE_URL`.
3. Set the new variables in Vercel (Production first) and `.env.local`.
4. Confirm each recipient is a Cliq org member under the same email as their `auth.users` row.
5. Redeploy.

## Compatibility Touchpoints

- No new API routes; `GET /api/staff/members` is reused unchanged.
- One new dependency in the existing Tiptap v3 line; no popup library.
- No migration; existing columns only.
