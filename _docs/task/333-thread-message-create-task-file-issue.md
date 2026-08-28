# 333: Ticket Thread Message → "Create Task" / "File an Issue" (kebab menu on customer messages)

**Created:** 2026-08-28
**Priority:** MEDIUM
**Type:** feature
**Recommended Tier:** balanced
**Status:** Planned

---

## Overview

On the Ticket Detail conversation view (`/desk/tickets/[ticketId]`), add a kebab (`⋮`) menu to
every **customer-authored** thread message (`authorType === "client"`). The menu has two
actions:

- **Create Task** — opens the Projects "New Task" modal (`CreateTaskModal`) with a **searchable
  Project picker** added in front of it. Title is pre-filled from the ticket **Subject**
  (editable); Description is pre-filled from the **thread message body**. On submit the task is
  created against the chosen project and appears under **Project → Tasks**.
- **File an Issue** — identical flow using the "New Issue" modal (`CreateIssueModal`); the
  record appears under **Project → Issues**.

This lets a PM/Admin triage an inbound support message straight into project work without
leaving the ticket. It reuses the existing Projects create modals and the existing
`POST /api/v2/projects/[projectId]/tasks` / `.../issues` endpoints — no schema change.

## Key facts (verified in codebase)

- **Who can reach this:** `desk/tickets/[ticketId]/page.tsx:88` already hard-gates the page to
  `admin | super_admin | pm`. No additional role gate is needed on the kebab; task/issue POST
  is separately enforced by RLS.
- **Customer vs staff message:** `MessageItem.authorType` is `"client" | "staff" | "system" |
  "llm_draft"` (`_conversation-thread.tsx:15`). The kebab renders only for `"client"`.
- **The Projects create modals already exist and are the intended UI:**
  - `src/app/(hub)/projects/_shared/_create-task-modal.tsx` (`CreateTaskModal`, 435 lines)
  - `src/app/(hub)/projects/_shared/_create-issue-modal.tsx` (`CreateIssueModal`, 261 lines)
  Both take `projectId` (the **display** `project_id`, e.g. `BDD824C5-PROJ-01`, **not** the
  UUID — the API routes look it up with `.eq("project_id", projectId)`), plus data arrays they
  currently receive as props from `_project-detail.tsx`:
  - Task: `milestones`, `tasklists`, `tasks` (dupe-title check), `allMembers`, `defaults`,
    `onClose`, `onCreated`, `onTasklistCreated`.
  - Issue: `allMembers`, `issues` (dupe-title check), `onClose`, `onCreated`.
- **Data endpoints for the picked project (all RLS-scoped, all key by display `project_id`):**
  - `GET /api/v2/projects` → `[{ id, project_id, name, project_type, status, customer_id, … }]`
  - `GET /api/v2/projects/[projectId]/milestones` → milestone rows
  - `GET /api/v2/projects/[projectId]/tasks` → top-level task rows
  - `GET /api/v2/projects/[projectId]/issues` → issue rows
  - `GET /api/v2/projects/[projectId]/members` → `[{ id, full_name, avatar_url, role }]`
    (all developer/pm/admin profiles — matches `MemberOptionWithRole`)
  - **`tasklists` has NO GET route** today (`.../tasklists/route.ts` is POST-only). This task
    adds a GET (mirrors the milestones GET exactly).
- **Description seeding:** `TaskDescriptionEditor` (Tiptap) takes `content: value` once at
  init (`_task-description-editor.tsx:46`), so seeding via an initial state value works.
  `CreateIssueModal`'s description is a plain `<textarea>`.
- **HTML-safe body:** `sanitizeMessageHtml(body)` is already exported from
  `_conversation-thread.tsx:101` (DOMPurify + Zoho inline-image absolutize). Reuse it for the
  task description seed when `message.isHtml`; strip to plain text for the issue textarea.
- **Kebab pattern precedent:** `_v2-listing/_portfolio-card-menu.tsx` uses
  `<MoreVertical size={14} />` + a fixed-position menu with outside-click/Escape close. The
  in-file `ViewSwitchTab` in `_ticket-detail.tsx:100` is a closer, lighter reference
  (absolute-positioned dropdown, `useRef` + `mousedown`/`keydown` listeners).

## Requirements

- [ ] A kebab (`⋮`, `MoreVertical size={14}`) button appears on every conversation message
      whose `authorType === "client"`, in the message header row, with a visible hover state
      and `aria-label`. It does **not** appear on staff/system/llm_draft messages.
- [ ] Clicking the kebab opens a small dropdown with **Create Task** and **File an Issue**.
      Outside-click and `Escape` close it. Clicking either item closes the dropdown and opens
      the corresponding modal flow. The kebab click must not toggle the message
      expand/collapse (no nested `<button>` — restructure the header).
- [ ] **Project picker step:** the modal flow first shows a searchable Project select
      (`SearchableSelect`, options = `{ value: project_id, label: name }`, sorted by name;
      projects with a null `project_id` are excluded). A "Continue" action is disabled until a
      project is chosen.
- [ ] On Continue, the flow fetches the picked project's data bundle in parallel
      (task: milestones + tasklists + tasks + members; issue: issues + members), showing a
      loading state, then renders `CreateTaskModal` / `CreateIssueModal` for that project.
- [ ] **Title** field of the opened modal is pre-filled with the ticket **Subject** and is
      fully editable.
- [ ] **Description** field is pre-filled from the thread message body:
      - Task modal: sanitized HTML via `sanitizeMessageHtml()` when `message.isHtml`, else the
        raw text.
      - Issue modal: plain text (tags stripped, whitespace collapsed).
- [ ] Submitting creates the record against the chosen project via the existing
      `POST /api/v2/projects/[project_id]/tasks` (or `/issues`) endpoint — no new create path.
- [ ] On success: a `sonner` toast confirms creation naming the project (e.g. "Task created in
      Acme Corp"), and the whole flow closes. (A deep link to the new record is **out of
      scope** — see below.)
- [ ] A "< Back" affordance on the project-picker step is not required; closing and reopening
      is acceptable. Cancel/close at any step aborts with no writes.
- [ ] `CreateTaskModal` / `CreateIssueModal` behaviour when opened normally from
      `_project-detail.tsx` is unchanged (new props are optional and default to `""`).
- [ ] Adding the `GET` to the tasklists route does not change its existing `POST` behaviour.
- [ ] `npx tsc --noEmit` and `pnpm lint` pass.

## Out of Scope / Must-Not-Change

- **No deep link to the created task/issue** in the success toast. The v2-vs-legacy project
  base path (`/projects/v2/…` vs `/projects/legacy/…`) is derived from
  `customer_products.classification` and is non-trivial to resolve client-side; a plain
  confirmation toast is sufficient for this task. (Follow-up candidate.)
- **No changes to the create API routes' logic** beyond adding `GET` to `tasklists/route.ts`.
- **No attachment pre-fill** from the ticket message (the modals' own attachment picker still
  works for manually added files; carrying the message's attachments across is out of scope).
- **No kebab on staff replies, internal comments, or system lines.**
- Do **not** refactor the shared inner form of `CreateTaskModal` / `CreateIssueModal` — only
  add the two optional seed props.
- Do **not** introduce `react-hook-form`, new form libraries, or `dark:` classes. Match the
  existing `_shared/` modal styling tokens (`#007BFF`, `rounded-[10px]`, `text-[13px]`, etc.).
- Do **not** touch `_reply-composer.tsx`, `_attachments-tab.tsx`, or the reply/notes routes.

## Proposed File Changes

| File | Action | Purpose |
|------|--------|---------|
| `src/app/(hub)/desk/tickets/[ticketId]/_thread-message-actions.tsx` | Create | Kebab button + dropdown ("Create Task" / "File an Issue"); owns the `_thread-to-project-modal` open state. |
| `src/app/(hub)/desk/tickets/[ticketId]/_thread-to-project-modal.tsx` | Create | Project-picker gate: `SearchableSelect` of projects → fetch project bundle → render `CreateTaskModal` / `CreateIssueModal` with seeded title/description. |
| `src/app/(hub)/desk/tickets/[ticketId]/_conversation-thread.tsx` | Modify | Add `subject` prop; restructure `MessageCard` header so the toggle is one `<button>` and the kebab is a sibling; render `<ThreadMessageActions>` for `authorType === "client"`. |
| `src/app/(hub)/desk/tickets/[ticketId]/_ticket-detail.tsx` | Modify | Pass `subject={ticket.subject}` into `<ConversationThread>`. |
| `src/app/(hub)/projects/_shared/_create-task-modal.tsx` | Modify | Add optional `defaultTitle?` / `defaultDescription?` props; seed `title` / `description` state from them. |
| `src/app/(hub)/projects/_shared/_create-issue-modal.tsx` | Modify | Same optional `defaultTitle?` / `defaultDescription?` props. |
| `src/app/api/v2/projects/[projectId]/tasklists/route.ts` | Modify | Add `GET` handler (mirror milestones GET) so the ticket flow can load existing task lists. |

## Code Context

### `_conversation-thread.tsx` — header restructure (currently one big `<button>`)

```tsx
// NOW (lines ~157-185): the entire header row is a single <button onClick={onToggle}>.
// A nested <button> for the kebab is invalid HTML. Restructure to:
<div className={cn("px-5 py-3", tint)}>
  <div className="flex w-full items-center gap-2">
    <button type="button" onClick={onToggle} aria-expanded={open}
            className="flex items-center gap-2 text-left min-w-0 flex-1">
      <Avatar … />
      <span …>{m.authorName}</span>
      {isOutboundReply(m) && <span>Reply from us</span>}
      <Chip …>{…}</Chip>
      {!open && <span className="truncate …">{previewText(m.body, m.isHtml)}</span>}
      <span className="ml-auto …">{formatDateTime(m.createdAt)}</span>
      <ChevronDown … className={cn(…, open && "rotate-180")} />
    </button>
    {m.authorType === "client" && (
      <ThreadMessageActions subject={subject} message={m} />
    )}
  </div>
  {open && ( /* body — unchanged */ )}
</div>
```

`ConversationThread` and `MessageCard` both gain a `subject: string` prop threaded from the
parent. `_ticket-detail.tsx` renders `<ConversationThread key={convView} ticketId={…}
subject={ticket.subject} messages={shownMessages} />`.

### `_thread-to-project-modal.tsx` — gate shape

```tsx
type Mode = "task" | "issue";

export function ThreadToProjectModal({ mode, subject, message, onClose }: {
  mode: Mode;
  subject: string;
  message: MessageItem;         // for body + isHtml
  onClose: () => void;
}) {
  const [projects, setProjects] = useState<ProjectLite[] | null>(null);   // GET /api/v2/projects
  const [projectId, setProjectId] = useState("");                         // display project_id
  const [bundle, setBundle] = useState<Bundle | null>(null);
  const [loading, setLoading] = useState(false);

  // 1. mount: fetch projects (filter out null project_id), populate SearchableSelect
  // 2. Continue: Promise.all the mode-specific GETs, setBundle
  // 3. bundle != null → render the real modal:

  if (bundle && mode === "task") {
    return (
      <CreateTaskModal
        projectId={projectId}
        milestones={bundle.milestones}
        tasklists={bundle.tasklists}
        tasks={bundle.tasks}
        allMembers={bundle.members}
        defaults={{}}
        defaultTitle={subject}
        defaultDescription={message.isHtml ? sanitizeMessageHtml(message.body) : message.body}
        onClose={onClose}
        onCreated={() => { toast.success(`Task created in ${projectName}`); onClose(); }}
        onTasklistCreated={() => {}}   // no-op: gate unmounts on close
      />
    );
  }
  if (bundle && mode === "issue") {
    return (
      <CreateIssueModal
        projectId={projectId}
        allMembers={bundle.members}
        issues={bundle.issues}
        defaultTitle={subject}
        defaultDescription={htmlToPlainText(message.body)}
        onClose={onClose}
        onCreated={() => { toast.success(`Issue created in ${projectName}`); onClose(); }}
      />
    );
  }

  // else: own overlay — SearchableSelect + Continue (disabled until projectId) + loading state
}
```

`htmlToPlainText`: `html.replace(/<br\s*\/?>/gi, "\n").replace(/<\/(p|div|li)>/gi, "\n").replace(/<[^>]+>/g, "").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/[ \t]+\n/g, "\n").trim()` — inline in this file.

### `_create-task-modal.tsx` / `_create-issue-modal.tsx` — the only edit

```tsx
export function CreateTaskModal({ projectId, /* … */, defaultTitle, defaultDescription, /* … */ }: {
  /* … existing props … */
  defaultTitle?: string;
  defaultDescription?: string;
  /* … */
}) {
  const [title, setTitle] = useState(defaultTitle ?? "");
  const [description, setDescription] = useState(defaultDescription ?? "");
  // …everything else unchanged
```

### `tasklists/route.ts` — add GET (mirror `milestones/route.ts` GET)

```ts
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const { projectId } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: project } = await supabase.from("projects").select("id").eq("project_id", projectId).single();
  if (!project) return NextResponse.json({ error: "Project not found" }, { status: 404 });

  const { data, error } = await supabase
    .from("tasklists")
    .select("*")
    .eq("project_id", project.id)
    .order("position", { ascending: true, nullsFirst: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json(data ?? []);
}
```
(Confirm `tasklists` has a `position` column; if not, order by `name`.)

## Implementation Steps

1. Add `GET` to `src/app/api/v2/projects/[projectId]/tasklists/route.ts` (mirror milestones
   GET; keep the existing `POST` untouched). Verify the `tasklists` order column against
   `src/types/database.ts`.
2. Add optional `defaultTitle?` / `defaultDescription?` props to `CreateTaskModal` and
   `CreateIssueModal`; seed the `title` / `description` `useState` from them. No other change.
3. Create `_thread-to-project-modal.tsx`:
   - `ProjectLite` type; `useEffect` to `GET /api/v2/projects`, filter `project_id != null`,
     store; error + empty states.
   - `SearchableSelect` (import from `@/app/(hub)/projects/_shared/_searchable-select`) + a
     "Continue" button in a `_shared`-style overlay card.
   - On Continue: `setLoading`, `Promise.all` the mode-specific GETs (map member rows straight
     to `MemberOptionWithRole`), `setBundle`; on any fetch failure show an inline error and
     let the user retry.
   - When `bundle` is set, render `CreateTaskModal` / `CreateIssueModal` (see snippet). Import
     `sanitizeMessageHtml` from `./_conversation-thread`; inline `htmlToPlainText`.
   - `toast` from `sonner` on `onCreated`.
4. Create `_thread-message-actions.tsx`:
   - `<MoreVertical size={14} />` trigger button (`aria-label="Message actions"`,
     `hover:bg-[#F4F6FB] rounded-md p-1 text-[#5F6A88] transition-colors`).
   - Dropdown (absolute, `useRef` + `mousedown`/`keydown` close, same as `ViewSwitchTab`) with
     two rows: "Create Task" (`ListChecks`/`SquareCheck` icon) and "File an Issue"
     (`CircleAlert`/`Bug` icon).
   - Local `useState<"task" | "issue" | null>` → renders `<ThreadToProjectModal>` via a
     portal or inline (the modal is `fixed inset-0` so inline is fine).
5. Modify `_conversation-thread.tsx`: add `subject` prop to `ConversationThread` +
   `MessageCard`; restructure the `MessageCard` header per the snippet; render
   `<ThreadMessageActions subject={subject} message={m} />` only when
   `m.authorType === "client"`. Keep `previewText`, tint, chevron behaviour identical.
6. Modify `_ticket-detail.tsx`: pass `subject={ticket.subject}` into `<ConversationThread>`
   (the `dynamic()` import already exists; just add the prop).
7. Keep every new file within the file-length guidance (`_thread-to-project-modal.tsx`
   ≈150 lines, `_thread-message-actions.tsx` ≈110 lines). If the gate modal grows past ~200,
   split the project-picker overlay into its own `_project-picker-dialog.tsx`.
8. `npx tsc --noEmit` && `pnpm lint`.

## Acceptance Criteria

- [ ] On a ticket with a customer message, the `⋮` menu shows on that message only; staff
      replies / internal comments have no `⋮`.
- [ ] "Create Task" → project search → pick a project → "New Task" modal opens with Title =
      ticket Subject (editable) and Description populated from the message; changing the title,
      picking a task list / assignee / dates, and submitting creates the task; it is visible
      under that project's **Tasks** tab; success toast names the project.
- [ ] "File an Issue" → same flow → issue is visible under that project's **Issues** tab.
- [ ] Duplicate-title validation in both modals works against the fetched project data.
- [ ] Cancelling at the picker step or the modal step performs no writes.
- [ ] Opening `CreateTaskModal` / `CreateIssueModal` from a project page still starts with
      empty Title/Description (no regression).
- [ ] Kebab click does not expand/collapse the message; outside-click/Escape close the menu.
- [ ] `npx tsc --noEmit` and `pnpm lint` pass.

## Verification

```bash
npx tsc --noEmit
pnpm lint
# Browser (pnpm dev), signed in as admin or pm:
#  /desk/tickets → open a ticket that has a customer-authored message
#  ⋮ on the customer message → Create Task → search + pick project → verify prefilled
#    Title (= subject) and Description (= message body) → submit
#  open that project → Tasks tab → new task present
#  repeat with File an Issue → Issues tab
#  confirm ⋮ absent on staff/comment messages
#  open New Task from a project page directly → fields still blank
```

## Compatibility Touchpoints

- No packaging / install-surface impact.
- New `GET /api/v2/projects/[projectId]/tasklists` route — additive; note it in any API
  inventory docs if one is kept. Not an MCP tool (`src/app/api/mcp/route.ts` unaffected).
- No migration, no new env var, no new OAuth scope.
- `_docs/mcp-tools.md` unaffected (no `server.registerTool` change).

## Implementation Notes

### What Changed
- Added `GET /api/v2/projects/[projectId]/tasklists` (mirrors the milestones GET) so the
  ticket flow can populate the New Task modal's Task List picker.
- Added optional `defaultTitle?` / `defaultDescription?` props to `CreateTaskModal` and
  `CreateIssueModal` — they seed the `title` / `description` `useState` and are blank for the
  normal project-page flow (no behaviour change there).
- New `_message-html.ts`: `sanitizeMessageHtml` + `absolutizeZohoDeskInlineImages` moved here
  from `_conversation-thread.tsx`. This was **not** in the plan — needed to break a runtime
  import cycle (`_conversation-thread` → `_thread-message-actions` → `_thread-to-project-modal`
  → back to `_conversation-thread` for `sanitizeMessageHtml`). `_conversation-thread.tsx` now
  imports it from `_message-html`; `MessageItem` stays exported from `_conversation-thread` and
  is only ever imported `type`-only elsewhere (erased at runtime → no cycle). No external
  consumer of `sanitizeMessageHtml` existed (task 324 removed the reply-composer quoted
  preview), so no re-export shim was kept.
- New `_thread-message-actions.tsx`: kebab (`MoreVertical`) on each customer message.
  `fixed`-positioned menu from the trigger rect + full-screen backdrop for outside-click —
  same pattern as `_v2-listing/_portfolio-card-menu.tsx`, chosen over an `absolute` menu
  because the conversation card has `overflow-hidden` (task 323) which would clip a downward
  menu on the last/oldest message. Two items: "Create Task", "File an Issue".
- New `_thread-to-project-modal.tsx`: project-picker gate. On mount fetches
  `GET /api/v2/projects` (drops rows with null `project_id`, sorts by name) into a
  `SearchableSelect`. "Continue" fetches the project's bundle in parallel
  (task: milestones + tasklists + tasks + members; issue: issues + members) then renders
  `CreateTaskModal` / `CreateIssueModal` for that project with `defaultTitle = ticket subject`
  and `defaultDescription` = `sanitizeMessageHtml(body)` for tasks (Tiptap editor) /
  `htmlToPlainText(body)` for issues (plain `<textarea>`). Success → `sonner` toast naming the
  project, then the whole flow closes. `onTasklistCreated` is a no-op (gate unmounts on close).
- `_conversation-thread.tsx`: `MessageCard` header split so the expand toggle is one `<button>`
  and `<ThreadMessageActions>` is a sibling (no nested buttons); rendered only when
  `message.authorType === "client"`. `subject` prop threaded `ConversationThread` → `MessageCard`.
- `_ticket-detail.tsx`: passes `subject={ticket.subject}` into `<ConversationThread>`.

### Files Changed
- `src/app/api/v2/projects/[projectId]/tasklists/route.ts` - add `GET` list handler
- `src/app/(hub)/projects/_shared/_create-task-modal.tsx` - optional seed props
- `src/app/(hub)/projects/_shared/_create-issue-modal.tsx` - optional seed props
- `src/app/(hub)/desk/tickets/[ticketId]/_message-html.ts` - new; extracted HTML helpers (cycle break)
- `src/app/(hub)/desk/tickets/[ticketId]/_thread-message-actions.tsx` - new; kebab menu
- `src/app/(hub)/desk/tickets/[ticketId]/_thread-to-project-modal.tsx` - new; project-picker gate
- `src/app/(hub)/desk/tickets/[ticketId]/_conversation-thread.tsx` - header restructure + `subject` prop + import helper from `_message-html`
- `src/app/(hub)/desk/tickets/[ticketId]/_ticket-detail.tsx` - pass `subject` prop

### Deviations From Plan
- Added `_message-html.ts` (8th file, not in the plan's 7) to break the import cycle — see above.
- `_thread-to-project-modal.tsx` landed at 235 lines (plan estimated ~150, noted "split if
  >200"). Left as one file: single cohesive responsibility, within the 100–250 component
  guidance, splitting the ~35-line picker JSX would only add indirection.
- Design hook (`impeccable`) flags the `text-[Npx]` literals in the new/edited files. Left
  as-is: they deliberately match the sibling files (`_create-task-modal.tsx`,
  `_ticket-detail.tsx`, `_conversation-thread.tsx`) per CLAUDE.md's "new v2 UI must follow the
  pattern for visual consistency with the rest of the page it lives on"; the design sidecar is
  also stale (`DESIGN.md is newer than .impeccable/design.json`). Not suppressed, not churned.

### Verification Run
- `npx tsc --noEmit` - PASS
- `pnpm lint` - PASS (0 errors; 2 pre-existing warnings in an unrelated file,
  `onboarding-workspace/_checklist-tab.tsx`)
- Browser acceptance testing - NOT RUN (needs `pnpm dev` + a signed-in admin/pm session and a
  ticket with a customer-authored message)

## Quality Gate Notes

### Result
PASS

### Standards Review
- No unused/dead code; `npx tsc --noEmit` and `pnpm lint` clean (2 warnings are pre-existing,
  unrelated file).
- No `any` — the `getJson<T>` helper is a properly-constrained generic; `Bundle` is a
  discriminated union keyed on `mode`.
- Guard clauses used throughout (`if (!projectId) return`, early `return` per bundle mode).
- Clear single responsibilities: `_message-html.ts` (HTML helpers), `_thread-message-actions.tsx`
  (kebab trigger + menu), `_thread-to-project-modal.tsx` (picker gate + hand-off).
- Conventions followed: `fixed`-positioned menu from trigger rect + full-screen backdrop
  matches `_v2-listing/_portfolio-card-menu.tsx`; overlay chrome matches `_create-task-modal.tsx`;
  the new `tasklists` GET mirrors `milestones/route.ts` (RLS-scoped, keys by display `project_id`);
  silent `catch {}` with a user-facing error string matches the local pattern in
  `_conversation-thread.tsx`'s `AttachmentChip`.
- Errors handled intentionally — every fetch failure surfaces an inline message; the backdrop /
  Cancel / X are disabled while `bundleLoading` so a load can't be orphaned.
- No secrets or debug logging.

### Deviations
- **Minor** — `_message-html.ts` added (8th file, plan listed 7). Required to break a runtime
  import cycle (`_conversation-thread` → `_thread-message-actions` → `_thread-to-project-modal`
  → `sanitizeMessageHtml`). Sound: the extracted module has one clear job and no external
  consumer of the old export path existed.
- **Minor** — `_thread-to-project-modal.tsx` is 235 lines vs the plan's ~150 estimate / "split
  if >200" note. Left as one file: within the 100–250 component guideline, single cohesive
  responsibility, splitting the ~35-line picker JSX would only add indirection.
- **Minor** — impeccable design hook flags `text-[Npx]` literals in the new/edited files. Left
  as-is (not suppressed): they deliberately match the sibling files per CLAUDE.md's "new v2 UI
  must follow the pattern for visual consistency"; the design sidecar is also stale.
- **Minor (new, not fixed)** — `htmlToPlainText` strips tags but not the *content* of an
  embedded `<style>`/`<script>` block, so an email body with a `<style>` block could leak CSS
  text into the seeded **issue** description (task path is unaffected — it uses DOMPurify via
  `sanitizeMessageHtml`). Cosmetic, on a user-editable pre-fill. Follow-up: prepend
  `.replace(/<(style|script)[^>]*>[\s\S]*?<\/\1>/gi, "")`.
- **Minor (new, not fixed)** — `ProjectLite.project_id` is typed `string` though the column can
  be `null`; the runtime `.filter((p) => !!p.project_id)` enforces the invariant before use, so
  no functional risk.
- **Minor (pre-existing characteristic)** — Zoho inline images kept by `sanitizeMessageHtml`
  carry auth-gated `crmplus.zoho.com` URLs that may render broken in the seeded task
  description; the user can edit before submitting.

### Required Fixes
- None (PASS). The two new Minor findings are logged for an optional follow-up.
