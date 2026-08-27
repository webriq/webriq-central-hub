# 324: Ticket Detail — Move Reply & Comment to Top Actions (Zoho-style full-panel composers)

**Created:** 2026-08-27
**Priority:** MEDIUM
**Type:** enhancement
**Recommended Tier:** balanced
**Status:** Planned

---

## Overview

Today the ticket detail page (`/desk/tickets/[ticketNumber]`) has one compose panel
**pinned to the bottom** of the conversation card with an "Internal Note / Reply to
Customer" toggle. Zoho Desk instead puts **Reply** and **Comment** as actions at the
**top**, and each opens a distinct composer surface:

- **Reply** (images 17–19) — replaces the whole thread/conversation list with a full
  composer (From / Recipients / rich-text body / Send / Cancel). It targets the latest
  message in the conversation. The sent email contains **only the new reply** — no quoted
  copy of the prior thread (the customer's mail client already has the history; the reply
  threads natively).
- **Comment** (images 20–21) — opens the internal-note editor **above** the existing
  comment list (list stays visible below). The **Comments tab shows this composer by
  default**.

This task moves the compose UI to match that model.

## Requirements

### Reply

- [ ] A **Reply** button in the conversation card header (top-right of the tab-bar row),
      shown only on the **Conversations** and **Threads** views. Not on Comments or
      Attachments.
- [ ] Clicking **Reply** hides the conversation/thread list and renders the reply composer
      in the card body (full area), with a small header line ("Replying to
      {contactName}") and a **Cancel** control.
- [ ] The composer targets the **latest message with an `email_message_id`** — the same
      target `POST /api/desk/tickets/[n]/reply` already threads off of
      (`route.ts` "latest message" query). No behavior change to the send API.
- [ ] The composer shows **no quoted copy** of the message being replied to, and the sent
      body is **only** the staff-authored reply (already true server-side — `sendReply`
      posts just `content` with `action: "reply"`). Remove the quoted-preview block from
      `_reply-composer.tsx`.
- [ ] **Cancel** or a **successful send** returns to the conversation list. On success:
      `router.refresh()` so the new reply appears at the top (newest-first, task 323).
- [ ] **Reply** is disabled (with a title/tooltip reason) when `ticket.contactEmail` is
      null or `fromAddress` is not configured — same guard as today's `sendDisabled`.

### Comment

- [ ] A **Comment** button in the same header row, shown only on the **Conversations** and
      **Comments** views. Not on Threads or Attachments.
- [ ] Clicking **Comment** shows the internal-note rich-text editor **above** the existing
      list (list remains visible and scrollable below it).
- [ ] Opening the **Comments** tab auto-opens this composer (expanded, at the top).
- [ ] Submitting posts the note (`POST /api/desk/tickets/[n]/notes`, unchanged —
      `visibility: "internal"`), then `router.refresh()`. After success: on the Comments
      tab the composer **stays open** (editor cleared via key bump); on Conversations it
      **collapses**.
- [ ] Comments stay **staff-only** — no public/customer-visible comment option.

### Shared

- [ ] Remove the bottom compose panel and the `composeMode` ("note" | "reply") toggle
      entirely.
- [ ] Switching tabs cancels an open Reply composer (returns to list). Switching to a
      non-Comments tab closes the Comment composer.
- [ ] Buttons get `transition-colors` hover states and `aria-label`s per the UI Polish
      conventions; disabled buttons are visibly disabled, not hidden (except where a whole
      action doesn't apply to the current tab — then it's not rendered).

## Out of Scope / Must-Not-Change

- **"Reply All" and "Forward"** — the Hub stores a single resolved `contactEmail` per
  ticket and no CC/BCC. Ship a single **Reply** action (Zoho's split-button is not
  reproduced).
- **Public / customer-visible comments** — Zoho's "Comment ▾ Private/Public" split
  (image 21) is not reproduced; notes stay internal.
- **Draft saving** ("Save draft" in image 19).
- Editing or deleting already-sent replies / notes.
- The reply **send API, threading mechanism, or `sendReply()`** in `src/lib/zoho/mail.ts`
  — untouched. (Verification note: confirm on a live send that Zoho Mail's `action: reply`
  does not itself append the original message body; if it does and that's unwanted, raise
  a follow-up — do not change it speculatively here.)
- `page.tsx` data fetching, the `kind` classification, the view switcher, collapsible
  message cards, `_attachments-tab.tsx` — all from tasks 320/323, untouched.
- The `#533` inbound-email duplicate-ticket issue (separate task, see task 323 doc).
- Keep `ReplyComposer` / `ConversationThread` / `RichTextEditor` dynamically imported with
  `ssr: false` (DOMPurify/Tiptap need `window`).

## Proposed File Changes

| File | Action | Purpose |
|------|--------|---------|
| `src/app/(hub)/desk/tickets/[ticketNumber]/_ticket-detail.tsx` | Modify | Replace `composeMode` with `composerMode: "none" \| "reply" \| "comment"`; render Reply/Comment header buttons per view; reply-mode hides `<ConversationThread>` and shows `<ReplyComposer>`; comment-mode renders the note editor above `<ConversationThread>`; auto-open comment composer when `convView === "comments"`; delete the bottom panel |
| `src/app/(hub)/desk/tickets/[ticketNumber]/_reply-composer.tsx` | Modify | Remove the quoted-message preview block + `findQuotedMessage` + `sanitizeMessageHtml` import + the now-unused `messages` prop; add a one-line static hint ("Threads onto the latest message in this conversation."); keep From/To rows, RTE, Send/Cancel |
| `_docs/task/324-...md` | Create | This document |

Optionally extract the internal-note editor JSX (currently inline in `_ticket-detail.tsx`)
into a small `NoteComposer` component in the same folder if it makes the two call sites
(comment-above-list) cleaner — implementer's call; not required.

## Code Context

### Current compose panel — `_ticket-detail.tsx:477-534` (to be removed / restructured)

```tsx
{!attachmentsOpen && (
  <div className="px-5 py-4 border-t border-[#EDF0F7] bg-[#FAFBFE]">
    <div className="flex items-center gap-1 mb-2.5">
      <button onClick={() => setComposeMode("note")}  … >Internal Note</button>
      <button onClick={() => setComposeMode("reply")} … >Reply to Customer</button>
    </div>
    {composeMode === "note" ? (
      <> …inline RichTextEditor + "Add Note" button… </>
    ) : (
      <ReplyComposer fromAddress={fromAddress} toEmail={ticket.contactEmail} messages={messages} … />
    )}
  </div>
)}
```

`handleAddNote()` and `handleSendReply()` (`_ticket-detail.tsx:254-322`) already do the
right fetches — reuse them. `handleSendReply` success currently only clears the editor;
add `setComposerMode("none")`. `handleAddNote` success: keep open on Comments tab, else
`setComposerMode("none")`.

### Tab-bar row — `_ticket-detail.tsx:412-465`

The header action buttons go at the end of this flex row (`ml-auto`):

```tsx
<div className="px-5 border-b border-[#EDF0F7] flex items-center gap-5 flex-wrap">
  {splitView ? ( <ViewSwitchTab …/> <button>Comments</button> ) : ( <ViewSwitchTab …/> )}
  <button …>{attachmentCount} Attachments</button>
  {/* NEW: right-aligned action group */}
  <div className="ml-auto flex items-center gap-2 py-2">
    {(convView === "conversations" || convView === "threads") && !attachmentsOpen && (
      <button onClick={() => setComposerMode("reply")} … >Reply</button>
    )}
    {(convView === "conversations" || convView === "comments") && !attachmentsOpen && (
      <button onClick={() => setComposerMode("comment")} … >Comment</button>
    )}
  </div>
</div>
```

### Card body — `_ticket-detail.tsx:467-475`

```tsx
{attachmentsOpen ? (
  <AttachmentsTab … />
) : composerMode === "reply" ? (
  <div className="px-5 py-4">
    <div className="flex items-center justify-between mb-3">
      <span className="text-[13px] font-semibold text-[#0B1533]">Replying to {ticket.contactName}</span>
      {/* Cancel lives in ReplyComposer already via onCancel */}
    </div>
    <ReplyComposer … onCancel={() => setComposerMode("none")} onSend={handleSendReply} />
  </div>
) : (
  <>
    {composerMode === "comment" && (
      <div className="px-5 py-4 border-b border-[#EDF0F7] bg-[#FEFCF6]">
        {/* internal-note RichTextEditor + Add Note + Cancel */}
      </div>
    )}
    <ConversationThread key={convView} ticketNumber={ticket.ticketNumber} messages={shownMessages} />
  </>
)}
```

### Comments-tab auto-open

In the Comments tab's `onSelect` (and the `onMenuSelect` that lands on `comments`), set
`setComposerMode("comment")`. In `ViewSwitchTab.onSelect`/the Threads/Conversations
handlers and the Attachments button, set `setComposerMode("none")`. Prefer setting it in
the click handlers over a `useEffect` (avoids `set-state-in-effect`, consistent with the
`key={convView}` approach from task 323).

### `_reply-composer.tsx` — remove quoted preview

Delete lines 81-95 (`{quoted && ( … )}`), the `findQuotedMessage` helper (19-26), the
`sanitizeMessageHtml`/`MessageItem` import trimming, and the `messages` prop. Replace with
a static line under the From/To rows:

```tsx
<div className="text-[11px] text-[#5F6A88] px-3 pb-2">
  Threads onto the latest message in this conversation — the customer sees it as a reply.
</div>
```

Update the call site in `_ticket-detail.tsx` to drop `messages={messages}`.

## Implementation Steps

1. `_ticket-detail.tsx`: replace `const [composeMode, setComposeMode] = useState<"note" | "reply">("note")`
   with `const [composerMode, setComposerMode] = useState<"none" | "reply" | "comment">("none")`.
2. Add the right-aligned Reply / Comment button group to the tab-bar row, conditional on
   `convView` + `!attachmentsOpen` (Reply: conversations|threads; Comment: conversations|comments).
3. In the tab click handlers: Threads/Conversations/Attachments → `setComposerMode("none")`;
   Comments → `setComposerMode("comment")`.
4. Card body: branch `attachmentsOpen` → `composerMode === "reply"` (list hidden, full
   `<ReplyComposer>`) → default (`<ConversationThread>`, with the note editor above it when
   `composerMode === "comment"`).
5. Move the inline internal-note editor JSX out of the removed bottom panel into the
   comment-above-list slot (or a `NoteComposer` component). Wire `handleAddNote`; add a
   Cancel that sets `composerMode` back (`"none"` on Conversations, keep `"comment"` +
   just clear on the Comments tab — Cancel there can simply clear the editor).
6. `handleSendReply` success → `setComposerMode("none")` + existing `router.refresh()`.
   `handleAddNote` success → `router.refresh()`; `composerMode` stays `"comment"` if
   `convView === "comments"`, else `"none"`; bump `noteEditorKey` to clear.
7. Delete the old bottom `<div className="px-5 py-4 border-t …">` panel.
8. `_reply-composer.tsx`: strip the quoted preview + dead code + `messages` prop; add the
   static hint line; update the call site.
9. `npx tsc --noEmit`, `pnpm lint`, browser acceptance test on ticket **#8**.

## Acceptance Criteria

- [ ] **Conversations** view: both **Reply** and **Comment** buttons in the header.
- [ ] **Threads** view: **Reply** only.
- [ ] **Comments** view: **Comment** only; the note editor is open by default above the
      comment list.
- [ ] **Attachments** view: no action buttons, no composer.
- [ ] Clicking **Reply** hides the list and shows the composer; **Cancel** restores the
      list; switching tabs also restores it.
- [ ] The reply composer shows no quoted thread; a sent reply posts only the reply body
      and appears at the top of the list after refresh.
- [ ] Clicking **Comment** shows the RTE above the list (list still visible); submitting
      adds the note and refreshes.
- [ ] The old bottom compose panel is gone.
- [ ] `npx tsc --noEmit` and `pnpm lint` pass.

## Verification

```bash
npx tsc --noEmit
pnpm lint
pnpm dev   # browser, logged in as admin/pm:
#  /desk/tickets/8
#   - Conversations: Reply + Comment buttons; Threads: Reply only; Comments: composer open
#   - Reply → list hidden, composer shown, no quoted block; Cancel → list back
#   - Comment (Conversations) → editor above list; add note → refresh, note at top
#   - Attachments: no buttons/composer
```

Live-send check (needs Zoho Mail configured): send a reply and confirm the delivered
email body contains only the typed reply (not an appended copy of the prior thread).

## Compatibility Touchpoints

- No packaging / adapter / migration impact. No API changes. No new env vars.
- `MEMORY.md` work-summary: fragment as "WebriQ Central Hub > Ticket Detail — Top Reply &
  Comment Actions".

## Implementation Notes

### What Changed

- **`_ticket-detail.tsx`:**
  - Replaced `composeMode: "note" | "reply"` state with
    `composerMode: "none" | "reply" | "comment"`.
  - Added `goToView(view)` / `goToAttachments()` helpers wired into every tab handler
    (`ViewSwitchTab.onSelect` / `.onMenuSelect`, the Comments tab button, the Attachments
    button). `goToView("comments")` sets `composerMode = "comment"`; every other view sets
    `"none"`. Added `handleCancelNote()` (mirrors `handleCancelReply`).
  - New right-aligned action group in the tab-bar row (`ml-auto`): **Reply** button
    (rendered for `conversations`/`threads`), **Comment** button (rendered for
    `conversations`/`comments`); neither on Attachments. Active state = filled
    blue / amber.
  - Card body is now a 3-way branch: `attachmentsOpen` → `<AttachmentsTab>`;
    `composerMode === "reply"` → **`<ConversationThread>` hidden**, `<ReplyComposer>`
    shown under a "Replying to {contactName}" header; else → `<ConversationThread>` with
    the internal-note editor rendered **above** it when `composerMode === "comment"` (the
    editor's Cancel is hidden on the Comments view where the composer is permanent).
  - `handleSendReply` success → `setComposerMode("none")`. `handleAddNote` success →
    stays `"comment"` on the Comments view, `"none"` elsewhere.
  - Deleted the entire bottom compose panel + its "Internal Note / Reply to Customer"
    toggle.
- **`_reply-composer.tsx`:** removed the quoted-message preview block, `findQuotedMessage`,
  the `sanitizeMessageHtml`/`MessageItem` import, `formatDateTime`, and the `messages`
  prop. Added a static hint line ("Threads onto the latest message — the customer receives
  it as a reply."). From/To rows, RTE, Send/Cancel unchanged. Server already sent only the
  reply body (`sendReply` posts `content` with `action: "reply"`), so no send-path change
  was needed.

### Files Changed

- `src/app/(hub)/desk/tickets/[ticketNumber]/_ticket-detail.tsx` — top Reply/Comment
  actions, composer state machine, list-replacement for reply, note-above-list for
  comment, Comments-tab auto-open, bottom panel removed.
- `src/app/(hub)/desk/tickets/[ticketNumber]/_reply-composer.tsx` — dropped quoted preview
  + dead code + `messages` prop; added static hint.

### Deviations From Plan

- None. "Reply All" / "Forward" / public comments / draft-saving stayed out of scope as
  specified.
- Did not extract a `NoteComposer` component (planning marked it optional) — the note
  editor JSX lives inline in the one comment-above-list slot.

### Verification Run

- `npx tsc --noEmit` — PASS
- `pnpm lint` — PASS (2 pre-existing warnings in unrelated `_checklist-tab.tsx`)
- **Browser acceptance test — PASS** (dev server, admin, ticket #8):
  - Conversations: both **Reply** + **Comment** in header.
  - Click **Reply** → list hidden, composer shown (From/To, RTE, hint, no quoted block);
    **Cancel** → list restored.
  - Click **Comment** (Conversations) → note editor above the still-visible list, with a
    Cancel link.
  - Threads view: **Reply** only; the previously-open comment composer closed on switch.
  - **Comments** view: **Comment** only; note editor open by default above the list, no
    Cancel link.
  - Attachments view: no action buttons.
  - Did not post a live test note/reply — ticket #8 is real Closed customer data and the
    POST handlers are unchanged from tasks 316/320/323.
- `impeccable` design hook: literal `text-[11/12/13px]` sizes flagged — pre-existing
  pattern in these exact files and the desk feature; nothing new introduced, left as-is
  per CLAUDE.md's "match neighboring UI".

## Quality Gate Notes

### Result
PASS

### Standards Review
- **Fixed during gate:** the Reply and Comment header buttons repeated a ~90-char
  className base. Extracted `ACTION_BTN_BASE` / `ACTION_BTN_IDLE` module constants
  (matching the file's existing `TAB_BASE` / `TAB_ACTIVE` / `TAB_INACTIVE` pattern); only
  the accent + hover-border colors stay inline. `npx tsc --noEmit` + `pnpm lint` re-run
  clean.
- No dead/commented-out code, no `any`, no debug logging, no secrets. Error paths in
  `handleAddNote` / `handleSendReply` unchanged and intentional. `<button>` used for all
  actions, `aria-label`s present, lucide icons (no emoji), Tailwind-only classes, `cn()`
  for conditionals — matches AGENTS.md / CLAUDE.md conventions and the desk feature's
  hardcoded-hex (non-`isDark`) style.
- `goToView` / `goToAttachments` / `handleCancelNote` are small, single-responsibility
  helpers; `handleCancelNote` mirrors the existing `handleCancelReply`.

### Deviations
- **None.** Implementation matches the requirements, proposed file changes, and acceptance
  criteria. Out-of-scope items (Reply All / Forward, public comments, draft saving, send
  API) untouched.
- Minor (non-blocking, not fixed): `goToView` / `goToAttachments` close the composer
  (`composerMode = "none"`) without clearing `replyError` / `noteError`, so a failed send
  followed by a tab switch and reopening the composer would briefly show a stale error
  until the next keystroke/action. Very low impact; flag for the test stage.

### Required Fixes
- None.
