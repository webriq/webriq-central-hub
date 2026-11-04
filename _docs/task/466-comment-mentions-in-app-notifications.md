# 466: @mentions in Task and Ticket comments send an in-app notification

**Created:** 2026-11-03
**Priority:** HIGH
**Type:** feature
**Recommended Tier:** balanced
**Status:** Planned

---

## Overview

Comment threads on Task Detail and Ticket Detail have no way to address a colleague. No mention
feature exists today. A search of `src/` for "mention" finds only an unrelated KB lint route, and
`@tiptap/extension-mention` is not installed. The comment POST routes notify nobody.

This task adds `@mention` to the task and ticket comment composers. When a comment is submitted,
**every person mentioned in it gets an in-app notification**: a `notifications` row through the
existing `createNotification()`. That row shows in the notification bell and also sends the usual
best-effort push. Clicking the notification opens the task or ticket.

**Relation to task 460 (Planned, not started):** 460 plans the same Tiptap mention extension
(`_shared/_mention-extension.ts`, its R5) to send Cliq DMs, for task comments only. **This task
builds that shared extension and the pure mention-id extractor.** Whichever task ships second
reuses them and does not build its own. 460's R5 and its `extractMentionIds` step become "already
done by 466" if 466 ships first.

## Requirements

- [ ] **R1: Mention picker in the composers.** Typing `@` in the task and ticket comment editors
      (v2 and legacy copies, 4 files) opens a list of staff filtered by the text typed after `@`.
      The list comes from the existing `GET /api/staff/members` (`getAssignableMembers()`).
      Picking an entry inserts
      `<span data-type="mention" data-id="<profile uuid>" data-label="<full name>">@Full Name</span>`.
- [ ] **R2: Accessible picker.** Keyboard operable (↑ ↓ Enter/Tab to pick, Escape to close and
      return focus to the editor), `role="listbox"` / `role="option"`, `aria-activedescendant`,
      visible active-row highlight that does not rely on color alone. The list shows an empty
      state ("No matching people") and a loading state while members load. Members are fetched
      once per editor mount and filtered locally.
- [ ] **R3: Mention rendering.** Mention spans render as a styled pill-like inline token, both in
      the composer and in the posted comment (the `_task-comments.tsx` / `_ticket-comments.tsx`
      `dangerouslySetInnerHTML` render), using static Tailwind arbitrary-selector classes in the
      existing `class` strings.
- [ ] **R4: Notify on submit.** After a successful insert in
      `POST /api/v2/tasks/[taskId]/comments` and
      `POST /api/v2/projects/[projectId]/tickets/[ticketId]/comments`:
      1. extract mention ids from the stored HTML,
      2. dedupe them,
      3. drop the author,
      4. keep only ids in `getAssignableMembers()` (active staff; this drops clients, inactive
         users, excluded people and forged ids),
      5. cap at 20,
      6. call `createNotification()` once per recipient.
- [ ] **R5: Notification content.**
      - `type`: `task_comment_mention` / `ticket_comment_mention`
      - `title`: `"Mentioned in a comment"`
      - `body`: `"<Actor> mentioned you in a comment on <display_id> \"<title>\""`, where Actor
        falls back to `"A teammate"`
      - `url`: `/projects/v2/<projects.project_id>/tasks/<tasks.display_id>` (or
        `/tickets/<tickets.display_id>`)
      - `actorId`: the author
      If `display_id` or `project_id` is null, send the notification without a `url`.
- [ ] **R6: Post-response, best-effort.** Notification work runs inside `after()` (same pattern
      as `src/lib/drive/notify-share.ts`). A failure is logged and never changes the comment
      POST response or status.
- [ ] **R7: No false positives.** No notification for:
      - comments without a mention
      - self-mentions
      - comment **edits** (PATCH)
      - deletes
      - attachment uploads
      - plain text like `@Mark` that was typed but never picked as a mention node

## Out of Scope / Must-Not-Change

- **Cliq DMs and status-change notifications.** Those belong to task 460.
- **Email notifications** for mentions.
- **Notifying newly added mentions on comment edit.** Edits never notify (R7).
- **Mentions anywhere else:** task/ticket descriptions, Notes, Wiki, Desk Inbox replies, Time log
  notes, and the `projects-old/` copies of the editors.
- **MCP / Ops Chat comment writes** that bypass these routes.
- **Project-visibility filtering of recipients.** The recipient pool is all assignable staff, the
  same pool every assignee picker uses.
- `src/lib/notifications/index.ts` and the `notifications` table schema stay as they are. **No
  migration.**
- Do not merge the four editor copies into one component. Their separation is intentional (see
  the header comments in the task 212 and 236 files). Only the shared extension module is new.
- Do not change `GET /api/staff/members` or `getAssignableMembers()`.

## Proposed File Changes

| File | Action | Purpose |
|------|--------|---------|
| `package.json` / `pnpm-lock.yaml` | Modify | `pnpm add @tiptap/extension-mention@^3.30.5 @tiptap/suggestion@^3.30.5` (match the installed Tiptap 3.30.5) |
| `src/lib/comments/mentions.ts` | Create | Pure `extractMentionIds(html)`, `resolveMentionRecipients({ ids, actorId, allowedIds })` (dedupe, drop actor, allow-list filter, cap `MAX_MENTION_RECIPIENTS = 20`), `buildMentionNotification(...)` |
| `src/lib/comments/notify-mentions.ts` | Create | `scheduleCommentMentionNotifications({ kind, actorId, entityId, body })`: wraps in `after()`, resolves actor name, task/ticket `display_id` + `title` + project `project_id`, allow-list, calls `createNotification()` |
| `src/app/(hub)/projects/_shared/_mention-extension.ts(x)` | Create | Shared Tiptap `Mention.configure({ suggestion })` + the suggestion list popup (fetch members once, local filter, keyboard/ARIA). Reused by task 460. |
| `src/app/(hub)/projects/v2/[projectId]/tasks/[taskId]/_comment-editor.tsx` | Modify | Add the mention extension + mention span styling |
| `src/app/(hub)/projects/legacy/[projectId]/tasks/[taskId]/_comment-editor.tsx` | Modify | Same change (byte-identical copy today) |
| `src/app/(hub)/projects/v2/[projectId]/tickets/[ticketId]/_ticket-comment-editor.tsx` | Modify | Same change |
| `src/app/(hub)/projects/legacy/[projectId]/tickets/[ticketId]/_ticket-comment-editor.tsx` | Modify | Same change (byte-identical copy today) |
| `src/app/(hub)/projects/{v2,legacy}/[projectId]/tasks/[taskId]/_task-comments.tsx` | Modify | Mention span styling in the rendered comment body |
| `src/app/(hub)/projects/{v2,legacy}/[projectId]/tickets/[ticketId]/_ticket-comments.tsx` | Modify | Same |
| `src/app/api/v2/tasks/[taskId]/comments/route.ts` | Modify | Call `scheduleCommentMentionNotifications({ kind: "task", ... })` after a successful insert |
| `src/app/api/v2/projects/[projectId]/tickets/[ticketId]/comments/route.ts` | Modify | Same with `kind: "ticket"` |
| `_docs/task/466-comment-mentions.check.ts` | Create | Pure-logic assertions (AC2) |
| `_docs/task/460-cliq-direct-messages-task-status-mentions.md` | Modify | Note that R5 and the mention-id extractor are provided by 466; 460 imports them |

## Code Context

### Composer editors (4 copies, all on Tiptap 3.30.5)

v2 and legacy copies are byte-identical. The task and ticket versions differ only in their props
and the image-upload URL.

```tsx
// _comment-editor.tsx (task) — extension array + class string to extend
const editor = useEditor({
  extensions: [
    StarterKit.configure({ link: { openOnClick: false } }),
    Image,
  ],
  ...
  editorProps: {
    attributes: {
      class: cn(
        "outline-none px-3 py-2 text-[13px] min-h-[70px] leading-relaxed",
        "[&_p]:my-1 ... [&_li]:my-0.5",
        "[&_a]:text-[#0063D6] [&_a]:underline [&_img]:max-w-full [&_img]:rounded-[8px] [&_img]:my-1.5",
        "text-[#3A4565]"
      ),
    },
```

The editor reports HTML through `onChange`. The parent posts it as `body` unchanged, so mention
spans reach the route as-is. `handlePaste`/`handleDrop` read `disabledRef`. The mention suggestion
should likewise not open while `disabled` is set.

### Posted-comment render

`_task-comments.tsx:325` / `_ticket-comments.tsx:350`:

```tsx
dangerouslySetInnerHTML={{ __html: normalizeZohoDescriptionHtml(c.body) }}
```

Add a `[&_span[data-type=mention]]:…` style to that container's class string. Check that
`normalizeZohoDescriptionHtml` keeps `span[data-*]` attributes; if it strips them, style
`span.mention` instead (Tiptap Mention renders `class="mention"` by default when `HTMLAttributes`
sets it).

### Comment POST routes

`src/app/api/v2/tasks/[taskId]/comments/route.ts:99-140`. `taskId` is the task **UUID**.

```ts
const { data: comment, error } = await supabase
  .from("task_comments")
  .insert({ task_id: taskId, author_id: user.id, body: text })
  .select("id, body, created_at")
  .single();
if (error) { ...; return NextResponse.json({ error: error.message }, { status: 403 }); }
touchProjectForTask(taskId);
// ← schedule mention notifications here (text, user.id, taskId)
```

In the ticket route (`.../tickets/[ticketId]/comments/route.ts:114-160`), `project.id` and
`ticket.id` are already resolved (only `id` is selected). The notifier looks up `display_id` /
`title` itself, inside `after()`.

### Notification helper (do not modify)

`src/lib/notifications/index.ts`: `createNotification(profileId, { type, title, body, url?, actorId? })`
writes `notifications` through `adminClient` and sends a best-effort push. The bell
(`src/app/(hub)/_components/notification-bell.tsx:201`) navigates with `router.push(n.url)`.

### Existing `after()` + fan-out pattern

`src/lib/drive/notify-share.ts`. Copy its shape, not its email logic:

```ts
await Promise.all(recipients.map((r) =>
  createNotification(r.id, { type: DRIVE_SHARE_EVENT, title: copy.title, body: copy.body, url: copy.path, actorId: sharerId })));
```

### Recipient allow-list

`src/lib/members/assignable.ts`: `getAssignableMembers()` is server-only (`adminClient`) and
returns `{ id, full_name, avatar_url, role }[]` for active staff minus `ASSIGNEE_EXCLUDE`.
`GET /api/staff/members` returns the same list to any authenticated session. Use it for the
picker.

### Detail URLs

Both `/projects/v2/[projectId]/tasks/[taskId]/page.tsx` and the legacy page look up
`projects.project_id` (display) + `tasks.display_id` (`.eq("display_id", taskId)`). The v2 page
does not filter out legacy projects, so `/projects/v2/<project_id>/tasks/<display_id>` resolves
for every project. Tickets follow the same pattern with `tickets.display_id`.

### Mention extraction

Use a tolerant regex per `<span ... data-type="mention" ...>` tag so attribute order does not
matter. Read `data-id` from the same tag and accept only UUID-shaped values.

## Implementation Steps

1. `pnpm add @tiptap/extension-mention@^3.30.5 @tiptap/suggestion@^3.30.5`.
2. `src/lib/comments/mentions.ts`: pure helpers (`extractMentionIds`, `resolveMentionRecipients`,
   `buildMentionNotification`), with no imports from Supabase or Next.
3. `src/lib/comments/notify-mentions.ts`: `scheduleCommentMentionNotifications({ kind, actorId, entityId, body })`.
   1. Return early if `extractMentionIds(body)` is empty, so `after()` is never scheduled.
   2. Inside `after()`, wrapped in try/catch, load in parallel:
      - the actor's `profiles.full_name`
      - the entity's `display_id`, `title` and `project_id` → `projects.project_id`
      - `getAssignableMembers()`
   3. Resolve the recipients and `createNotification()` each one.
   Use `adminClient` for these lookups. This is the same documented display-lookup exception
   `getAssignableMembers()` and the existing comment GET routes already use, because
   notification writing is service-side.
4. Wire it into both comment POST routes right after the successful insert.
5. `_shared/_mention-extension.tsx`: `Mention.configure({ HTMLAttributes: { class: "mention" }, renderLabel/renderText → "@" + label, suggestion: { char: "@", items, render } })`.
   - Render the popup with `ReactRenderer` from `@tiptap/react` into an absolutely positioned
     list at the caret (`clientRect`).
   - Fetch members once and cache them in module scope per page load.
   - Keyboard handling and ARIA follow R2.
   - If the file grows past ~200 lines, split the list component into `_mention-list.tsx`.
6. Add the extension and mention styling to the 4 composer copies, then the styling to the 4
   comment-render components.
7. Write `_docs/task/466-comment-mentions.check.ts`.
8. Update task 460's doc: mark R5 and the mention-id extractor as provided by 466.
9. `npx tsc --noEmit`.

## Acceptance Criteria

- [ ] **AC1 (pre-merge, automated).** `npx tsc --noEmit` passes.
- [ ] **AC2 (pre-merge, automated).** `npx tsx _docs/task/466-comment-mentions.check.ts` exits 0.
      It asserts:
      - two mentions → two ids
      - reordered attributes still parse
      - a non-mention `data-id` span is ignored
      - non-UUID ids are ignored
      - no mention → `[]`
      - duplicate mentions dedupe to one
      - the actor is dropped
      - ids outside the allow-list are dropped
      - more than 20 ids are capped at 20
      - the notification body contains actor, display_id and title, and the url is
        `/projects/v2/<pid>/tasks/<did>` (or `/tickets/...`)
      - a null display_id → no url
- [ ] **AC3 (pre-merge, browser).** On a v2 and a legacy Task Detail page, typing `@` opens the
      staff list. Typing filters it. ↑/↓/Enter inserts a mention and Escape closes the list. The
      mention renders as a token in the composer and in the posted comment. The same works on
      Ticket Detail.
- [ ] **AC4 (pre-merge, browser).** Posting a task comment that mentions a colleague creates
      exactly one notification for that colleague. It shows in their bell with the correct body,
      and clicking it opens the task. Same for a ticket comment.
- [ ] **AC5 (pre-merge, no-regression).** None of these creates a notification:
      - a comment with no mention
      - a self-mention
      - a comment edit that adds a mention
      - an attachment-only comment
      Plain comments, edits, image paste/drop and attachments behave as before.
- [ ] **AC6 (pre-merge).** A forced notification failure (e.g. a temporary throw) still returns
      201 for the comment and logs the error.

## Verification

```bash
npx tsc --noEmit
npx tsx _docs/task/466-comment-mentions.check.ts
# Browser: AC3–AC5 on /projects/v2/<pid>/tasks/<did>, /projects/legacy/<pid>/tasks/<did>,
#          and both ticket detail routes, signed in as two different staff users.
```

## Compatibility Touchpoints

- **New dependencies:** `@tiptap/extension-mention`, `@tiptap/suggestion`, pinned to the
  installed Tiptap 3.30.x line through pnpm.
- **No migration, no env vars, no MCP tool changes** (`_docs/mcp-tools.md` is untouched).
- **New `notifications.event_type` values** `task_comment_mention` / `ticket_comment_mention`.
  `event_type` is free text, and the bell renders any type.
- **Task 460** depends on this task's shared extension and extractor. Keep both exports stable.

## Implementation Notes

### What Changed
- Added a shared Tiptap `@` mention extension (`CommentMention`) to all four task/ticket comment composers (v2 + legacy). The staff list comes from `GET /api/staff/members`, fetched once per page load and filtered locally to 8 results. It is keyboard operable (↑/↓, Enter/Tab, Escape via the suggestion plugin), uses `role="listbox"`/`role="option"`, and sets `aria-controls`/`aria-expanded`/`aria-activedescendant` on the editor. It shows a loading state and a "No matching people" state, and stays closed while the composer is locked.
- Mention tokens are styled (`MENTION_CLASSES`) in the composer and in the posted-comment render. The active row is marked by a left border as well as color.
- Both comment POST routes call `scheduleCommentMentionNotifications()` after a successful insert. It returns early when there are no mentions. Otherwise, inside `after()`, it resolves the actor name, the entity `display_id`/`title`/project `project_id`, and the `getAssignableMembers()` allow-list, then calls `createNotification()` once per recipient. Errors are only logged.
- PATCH (edit), DELETE and attachment routes are untouched, so they never notify.

### Files Changed
- `package.json` / `pnpm-lock.yaml`: `@tiptap/extension-mention` and `@tiptap/suggestion` at **3.30.5**
- `src/lib/comments/mentions.ts`: pure extractor, recipient resolver, notification copy builder (new)
- `src/lib/comments/notify-mentions.ts`: post-response notifier (new)
- `src/app/(hub)/projects/_shared/_mention-extension.tsx`: extension, picker list, `MENTION_CLASSES` (new)
- `src/app/(hub)/projects/{v2,legacy}/[projectId]/tasks/[taskId]/_comment-editor.tsx`: extension + styling
- `src/app/(hub)/projects/{v2,legacy}/[projectId]/tickets/[ticketId]/_ticket-comment-editor.tsx`: extension + styling
- `src/app/(hub)/projects/{v2,legacy}/[projectId]/tasks/[taskId]/_task-comments.tsx`: mention styling on rendered bodies
- `src/app/(hub)/projects/{v2,legacy}/[projectId]/tickets/[ticketId]/_ticket-comments.tsx`: same
- `src/app/api/v2/tasks/[taskId]/comments/route.ts`: schedule notifications after insert
- `src/app/api/v2/projects/[projectId]/tickets/[ticketId]/comments/route.ts`: same
- `_docs/task/466-comment-mentions.check.ts`: pure-logic checks (new)
- `_docs/task/460-cliq-direct-messages-task-status-mentions.md`: note that R5 and the extractor are provided by 466

### Deviations From Plan
- **Exact version pin.** The first `pnpm add ...@^3.30.5` resolved 3.32.2, whose peer deps require `@tiptap/core`/`pm` **exactly** 3.32.2, while the project is on 3.30.5. I re-added them at `3.30.5`. The specifiers in `package.json` are `^3.30.5` like the sibling Tiptap packages, and the lockfile pins 3.30.5. A future Tiptap upgrade must move all `@tiptap/*` packages together.
- `@tiptap/suggestion` imports `@floating-ui/dom` (peer). pnpm auto-installed it, and it resolves, so no explicit dependency was added. Popup positioning uses the plugin's managed `props.mount()`, not a hand-rolled positioner.
- Mention styling targets `.mention`, Tiptap's `class="mention"` via `HTMLAttributes`, not `span[data-type=mention]`. `normalizeZohoDescriptionHtml` only touches line breaks and image srcs, so the spans and classes survive rendering.
- `pnpm` reported `ERR_PNPM_IGNORED_BUILDS` for `esbuild` (pre-existing policy). The install itself succeeded.

### Verification Run
- `npx tsx _docs/task/466-comment-mentions.check.ts`: PASS (11 checks)
- `npx tsc --noEmit`: PASS
- Browser AC3–AC6: SKIPPED (left for the `test` stage; needs two signed-in staff users)

## Quality Gate Notes

### Result
PASS

### Standards Review
- **Fixed in this gate:** the editor's `aria-controls` pointed at the listbox id even while the
  loading or empty state rendered instead of the list (a dangling reference). It is now set only
  when options exist.
- **Fixed in this gate:** removed a `full_name!` non-null assertion. Members are narrowed with a
  type guard at fetch time, so `MentionMember.full_name` is `string`.
- No `any`, dead code, commented-out code or debug logging. The `console.error` calls are
  intentional failure logs: the member fetch, and the notifier, which is best-effort by design.
- Responsibilities are split cleanly:
  - pure logic in `mentions.ts`, unit-checked and free of Supabase/Next imports
  - I/O and `after()` in `notify-mentions.ts`
  - UI in `_mention-extension.tsx` (172 lines, under the ~200-line split threshold in the plan)
- The four composers and four comment renderers changed by exactly the same lines (import,
  extension entry, `MENTION_CLASSES`). The intentional per-copy separation is preserved.
- Conventions:
  - `pnpm` only
  - no `style={{}}`
  - static class strings via `cn()`
  - lucide icon, `<li role="option">` with `onMouseDown` so editor focus is kept
  - no `adminClient` in client code
  - no migration, env var or MCP change
- `npx tsc --noEmit` PASS; `npx tsx _docs/task/466-comment-mentions.check.ts` PASS (11) after
  the fixes.

### Deviations
- **Minor:** dependencies are pinned at 3.30.5 (lockfile) because newer releases require an
  exact-match `@tiptap/core`. This is within scope and documented in Implementation Notes.
- **Minor:** styling targets `.mention`, not `span[data-type=mention]`. The rendered output is
  the same.
- **Minor:** the notifier's display lookups (actor name, entity, project) use `adminClient`
  inside `after()`. CLAUDE.md discourages `adminClient` for regular reads, but this is the
  service-side notification path the plan called for. It reads only what the actor's own
  request already had access to, and it matches `getAssignableMembers()` and the comment GET
  routes' profile lookups. Acceptable.
- **Note (not a deviation):** while the list shows "No matching people", Enter is not captured,
  so it inserts a newline as normal.

### Required Fixes
- None.
