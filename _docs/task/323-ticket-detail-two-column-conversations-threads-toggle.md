# 323: Ticket Detail — Two-Column Layout, Conversations/Threads View Toggle & Missing Outbound Replies

**Created:** 2026-08-27
**Priority:** MEDIUM
**Type:** enhancement
**Recommended Tier:** deep
**Status:** Planned

---

## Overview

The Desk ticket detail page (`/desk/tickets/[ticketNumber]`) needs a UX pass to bring it
closer to the Zoho Desk conversation view PMs are used to:

1. Tighten the two-column layout so the left column is **only** ticket properties and the
   right column owns the subject header + conversation.
2. Rework the first three content tabs (Conversations / Threads / Comments) into a
   **two-mode toggle**:
   - **Conversations mode** (default) — one merged, newest-first feed of threads *and*
     comments, tab labelled `10 Conversations` with a caret that reveals `3 Threads`.
   - **Threads mode** — two separate tabs `3 Threads` and `7 Comments`, the `3 Threads`
     tab carrying a caret that reveals `10 Conversations` to switch back.
3. Put the count **before** the label everywhere (`10 Conversations`, not `Conversations 10`).
4. Sort every conversation/thread list **descending — newest first**.
5. Fix a data gap: **our outbound replies (`direction: "out"` Zoho threads) are missing**
   from the Hub thread on imported tickets. Zoho Desk shows them; the Hub does not.

See screenshots in the task request (images 7–12).

## Requirements

- [ ] **Layout:** Left column = ticket properties only (Contact Info, Key Information,
      Ticket Information cards). Right column = subject/`displayId`/status-chip/meta header
      **moved inside the right column, above the tab bar**, then the conversation card.
      The "Back to Tickets" link stays above the grid, full width. Keep the CSS grid
      (`grid-cols-[280px_1fr]` or similar); left column stays `sticky top-*` if practical.
- [ ] **Merged Conversations feed:** In Conversations mode the feed shows threads **and**
      comments interleaved chronologically (matches image 7, where Zoho status-change
      "Private" notes appear inline with customer messages).
- [ ] **Count before label:** `{count} {Label}` for Conversations, Threads, Comments,
      Attachments. Singular/plural is acceptable to ignore (Zoho does: "3 Threads").
- [ ] **View toggle — Conversations mode:** The `{n} Conversations` tab renders a
      `ChevronDown` affordance. Activating it opens a small dropdown/popover containing a
      single option `{m} Threads`. Selecting it switches to Threads mode.
- [ ] **View toggle — Threads mode:** Tab bar shows `{m} Threads` and `{k} Comments` as
      two separate content tabs (Threads active by default). The `{m} Threads` tab renders
      the same `ChevronDown` affordance; its dropdown contains `{n} Conversations`.
      Selecting it returns to Conversations mode and the separate Threads/Comments tabs
      collapse back into the single merged tab.
- [ ] **Attachments tab** stays a always-visible separate tab in both modes, unchanged in
      behaviour (count-before-label only).
- [ ] **Descending order:** Every rendered message list (merged Conversations, Threads,
      Comments) is ordered newest-first. The raw `messages` array passed to the reply
      composer / attachments tab must stay correct (composer already sorts internally —
      see `findQuotedMessage`; verify attachments tab is order-independent).
- [ ] **Outbound replies visible:** Imported Zoho threads with `direction: "out"` /
      `author.type: "AGENT"` (our replies) appear in the merged Conversations feed and in
      the Threads tab, attributed to the sending agent / "WebriQ". Hub-native replies sent
      via `POST /api/desk/tickets/[n]/reply` already insert a row and must keep working.

## Out of Scope / Must-Not-Change

- No change to the reply/notes send flow, the rich-text editor, or the compose-mode
  (Internal Note / Reply to Customer) switch at the bottom of the card.
- No change to `POST /reply`, `POST /notes`, `PATCH /status` route behaviour.
- Do not introduce shadcn `Tabs`/`Popover`/`DropdownMenu` or `dark:` classes — this file
  uses the hand-rolled hub pattern with literal WebriQ hex colors (`#0B1533`, `#007BFF`,
  `#5F6A88`, …). Match it. The dropdown can be a plain absolutely-positioned `<div>`
  toggled by `useState` with a click-outside handler, or a `<details>`/`<summary>`.
- Do not add "Resolution / Time Entry / Activity" tabs from the Zoho screenshots — those
  are not in scope; only Conversations/Threads/Comments/Attachments exist here.
- Keep `ConversationThread` / `ReplyComposer` / `AttachmentsTab` dynamically imported with
  `ssr: false` (DOMPurify constraint — see file header comments).

## Proposed File Changes

| File | Action | Purpose |
|------|--------|---------|
| `src/app/(hub)/desk/tickets/[ticketNumber]/_ticket-detail.tsx` | Modify | Move subject header into right column; replace 4-tab state with `viewMode: "conversations" \| "threads"` + `threadsSubTab: "threads" \| "comments"` + `attachments`; count-before-label; dropdown toggle; sort derived lists desc |
| `src/app/(hub)/desk/tickets/[ticketNumber]/_conversation-thread.tsx` | Modify | Add `kind: "thread" \| "comment"` to `MessageItem`; component itself just renders the array it's given (already order-agnostic) — optionally show a subtle thread/comment visual distinction |
| `src/app/(hub)/desk/tickets/[ticketNumber]/page.tsx` | Modify | Derive `kind` per message from `source_meta.zohoSource` / visibility; keep fetch `ascending: true` (composer relies on nothing, but attachments/consistency simpler) and let the client sort for display |
| `src/app/api/admin/zoho-import/desk-threads/route.ts` | Investigate / Modify | Confirm outbound threads import; harden if a bug is found; otherwise this is a re-import (data) fix |
| `_docs/task/323-...md` | Create | This document |

## Code Context

### Message classification (the core model decision)

`ticket_messages` rows come from three sources, distinguishable today:

| Source | `source_meta.zohoSource` | `author_type` | `visibility` | notes |
|--------|--------------------------|---------------|--------------|-------|
| Zoho thread import (`desk-threads`) | `"thread"` | `staff` (out) / `client` (in) | `public` (1138) / `private`→`internal` (12) | the real conversation |
| Zoho comment import (`desk-ticket-comments`) | `"comment"` | `staff` / `client` | `public` if `isPublic` else `internal` | agent notes + status-change lines |
| Hub-native reply (`POST /reply`) | *(absent)* | `staff` | `public` | has `email_message_id` |
| Hub-native note (`POST /notes`) | *(absent)* | `staff` | `internal` | — |

**Proposed `kind` derivation (in `page.tsx`):**

```ts
const zohoSource = m.source_meta?.zohoSource;
const kind: "thread" | "comment" =
  zohoSource === "comment" ? "comment"
  : zohoSource === "thread" ? "thread"
  : m.visibility === "internal" ? "comment"   // hub-native note
  : "thread";                                  // hub-native reply / inbound email
```

- **Threads tab** = `messages.filter(m => m.kind === "thread")`
- **Comments tab** = `messages.filter(m => m.kind === "comment")`
- **Conversations (merged)** = all messages, sorted desc

> This replaces the current `visibility === "public"` proxy for "Threads", which
> mis-files public Zoho comments into the Threads tab.

### Current tab code — `_ticket-detail.tsx:89-132`

```tsx
type TabId = "conversations" | "threads" | "comments" | "attachments";
// ...
const publicMessages = messages.filter((m) => m.visibility === "public");
const internalMessages = messages.filter((m) => m.visibility === "internal");
const attachmentCount = messages.reduce((sum, m) => sum + m.attachments.length, 0);

const tabs: { id: TabId; label: string; count: number }[] = [
  { id: "conversations", label: "Conversations", count: messages.length },
  { id: "threads", label: "Threads", count: publicMessages.length },
  { id: "comments", label: "Comments", count: internalMessages.length },
  { id: "attachments", label: "Attachments", count: attachmentCount },
];

const threadMessages =
  activeTab === "threads" ? publicMessages : activeTab === "comments" ? internalMessages : messages;
```

**Target shape:**

```tsx
const threads  = messages.filter((m) => m.kind === "thread");
const comments = messages.filter((m) => m.kind === "comment");
const byNewest = (a: MessageItem, b: MessageItem) =>
  new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();

const [viewMode, setViewMode] = useState<"conversations" | "threads">("conversations");
const [threadsSubTab, setThreadsSubTab] = useState<"threads" | "comments">("threads");
const [showAttachments, setShowAttachments] = useState(false); // or fold into a union
const [viewMenuOpen, setViewMenuOpen] = useState(false);

// displayed list
const shown =
  showAttachments ? null // attachments tab renders its own component
  : viewMode === "conversations" ? [...messages].sort(byNewest)
  : threadsSubTab === "threads" ? [...threads].sort(byNewest)
  : [...comments].sort(byNewest);
```

Keep `attachments` as a peer selection (a third boolean/union), rendered by
`<AttachmentsTab>` exactly as today. The compose panel visibility check
`activeTab !== "attachments"` becomes `!showAttachments`.

### Tab bar rendering

- Conversations mode tab bar: `[ {n} Conversations ▾ ]  [ {a} Attachments ]`
- Threads mode tab bar: `[ {m} Threads ▾ ]  [ {k} Comments ]  [ {a} Attachments ]`
- The `▾` is a sibling `<button aria-label="Switch conversation view">` inside the active
  count-tab; clicking opens `viewMenuOpen` dropdown with the single opposite-mode option.
  Close on outside click / Escape / selection.
- Count style: reuse the existing `font-mono text-[11px] opacity-60` treatment but place
  the number **before** the label — e.g. `<span className="font-mono …">{count}</span> {label}`.

### `page.tsx` — message fetch & mapping (`page.tsx:104-181`)

```ts
const { data: messagesData } = await supabase
  .from("ticket_messages")
  .select("id, author_type, author_id, body, visibility, source_meta, created_at, email_message_id")
  .eq("ticket_id", t.id)
  .order("created_at", { ascending: true });   // keep asc; client sorts for display
```

Add `kind` to the `MessageItem` object built at `page.tsx:164-181` using the derivation
above. `MessageItem` type lives in `_conversation-thread.tsx:10-22` — add `kind` there.

### Requirement 5 investigation — missing outbound replies

Findings from `_from_zoho/desk-threads.json` (1,150 threads, dated 25 Aug):

- `direction`: `{ in: 796, out: 354 }` — outbound threads **are** in the export.
- Sample ticket "Holiday Hours" (`_zoho_ticket_id 300063000090359001`) has **3** threads
  in the export: 2 inbound + 1 outbound (`id 300063000090401003`, author `WebriQ`,
  `helpdesk@webriq.us`, `content` 6,494 chars, `isContentTruncated: false`).
- The Hub detail page for that ticket shows only **2** messages (image 12: "2 Conversations
  / 2 Threads") → the outbound row is **absent from `ticket_messages`**.
- `desk-threads/route.ts` has no row-level skip that would drop it: the only skip is
  `if (!externalId || !body)` and body is present. `isAgent` handling
  (`author?.type === "AGENT" || direction === "out"` → `author_type: "staff"`) is correct.
  No duplicate `external_id`s in the file.

> **UPDATE (implementation) — hypothesis DISPROVEN, real cause found.** Live query against
> `ticket_messages` (2,292 rows): `thread | dir=out | staff` = **354** (matches the export
> exactly — import is NOT stale). The imported "HOLIDAY HOURS?" ticket is
> **`ticket_number 8`** (`external_id 300063000090359001`) and has **all 10 messages**,
> including the `dir=out` WebriQ reply at `2026-08-12T04:06:15Z`.
>
> Image 12 ("2 Conversations / 2 Threads / 0 Comments") is a **different, DUPLICATE
> ticket — `ticket_number 533`** — created **2026-08-27** by the inbound-email intake
> (`source_meta: {}`, `external_contact_id: null`). Its 2 messages are both inbound
> customer emails from the same requester & subject that **failed to thread onto the
> existing ticket #8**. Our outbound reply appears only *quoted inside* message 2.
>
> **Resolution for task 323:** no `desk-threads` import change (no bug). The task-323 UI
> changes correctly surface the outbound reply for imported tickets. The genuine defect —
> **inbound emails spawning a duplicate ticket instead of threading onto an existing one**
> — lives in the inbound intake path (task 303 webhook / task 321 IMAP poll) and is
> **out of scope**; filed as a follow-up (see Implementation Notes).

**Original (incorrect) conclusion, kept for the record:** most likely the `desk-threads`
import was last run against an older export that predated outbound threads.

Hub-native replies (`POST /reply`) already insert `visibility: "public"`,
`author_type: "staff"`, `source_meta.contentType: "text/html"` and no `zohoSource`, so
they classify as `kind: "thread"` under the new rule and will show — no change needed
there.

## Implementation Steps

1. **`page.tsx`** — add `kind` to each `MessageItem` from `source_meta.zohoSource` /
   `visibility` (derivation above). Leave the fetch order ascending.
2. **`_conversation-thread.tsx`** — add `kind: "thread" | "comment"` to the `MessageItem`
   type. Optionally give comments a subtle visual tag (they already get the `Private` /
   `Public` chip from `visibility`; a "Comment" vs "Reply" label is a nice-to-have, not
   required).
3. **`_ticket-detail.tsx`:**
   a. Move the `displayId` + status `Chip` + `<h1>{subject}</h1>` + contact·date block
      out of the pre-grid header and into the top of the right-hand column, above the
      conversation card. Keep "Back to Tickets" above the grid.
   b. Replace `activeTab: TabId` with `viewMode` + `threadsSubTab` + an `attachments`
      selection. Derive `threads` / `comments` / merged lists; sort all displayed lists
      newest-first.
   c. Build the mode-aware tab bar with count-before-label and the `ChevronDown` view
      switcher dropdown (single opposite-mode option, close on outside-click/Escape).
   d. Update the compose-panel guard from `activeTab !== "attachments"` to the new
      attachments selection check.
   e. Pass the correctly sorted/filtered list into `<ConversationThread>`.
4. **`desk-threads` import** — run the investigation in Requirement 5; re-import if stale,
   or fix the bug. Add a one-line code comment if a real bug is found and fixed.
5. `npx tsc --noEmit`, `pnpm lint`, browser acceptance test.

## Acceptance Criteria

- [ ] Left column shows only the three property cards; subject header sits in the right
      column above the conversation card; page has no full-width subject band.
- [ ] Default view: single tab `{n} Conversations` (count first) + `{a} Attachments`;
      feed is threads+comments merged, newest at top.
- [ ] Clicking the caret on `{n} Conversations` reveals `{m} Threads`; selecting it
      switches to two tabs `{m} Threads` (active) + `{k} Comments`, plus `{a} Attachments`.
- [ ] Clicking the caret on `{m} Threads` reveals `{n} Conversations`; selecting it
      collapses back to the single merged tab.
- [ ] All three message lists render newest-first.
- [ ] Reply composer still quotes the latest emailed message; attachments tab unaffected.
- [ ] On the "Holiday Hours" imported ticket (and imported tickets generally), our
      outbound "WebriQ" reply appears in both the merged feed and the Threads tab.
- [ ] `npx tsc --noEmit` and `pnpm lint` pass.

## Verification

```bash
npx tsc --noEmit
pnpm lint
pnpm dev   # then browser-test:
#  - /desk/tickets/<an imported ticket with agent replies>
#    * two-column layout, subject in right column
#    * toggle Conversations <-> Threads both directions
#    * counts render before labels; lists are newest-first
#    * outbound "WebriQ" reply is present in Threads + merged feed
```

Data check (Supabase SQL editor or a scratch script):

```sql
-- outbound thread messages present?
select coalesce(source_meta->>'direction','?') dir, author_type, count(*)
from ticket_messages
where source_meta->>'zohoSource' = 'thread'
group by 1,2 order by 3 desc;
-- expect a healthy 'out'/'staff' bucket (~354 to match the export)
```

## Compatibility Touchpoints

- No packaging / adapter / install-surface impact.
- No DB migration — `kind` is derived at read time from existing `source_meta`.
- `desk-threads` import was **not** changed (investigation showed no bug).

## Implementation Notes

### What Changed

- **Two-column layout:** "Back to Tickets" is now a full-width link above the grid. The
  subject header (`displayId` + status chip + `<h1>` + contact·date) moved out of the
  pre-grid band and into the **top of the right column**, above the conversation card.
  Left column = ticket property cards only. Right column wrapped in
  `space-y-4 min-w-0`.
- **Conversations ⇄ Threads view switcher:** replaced the flat 4-tab `activeTab` state
  with `convView: "conversations" | "threads" | "comments"` + `attachmentsOpen: boolean`.
  - Default merged view: one `{n} Conversations ▾` tab (threads + comments interleaved).
  - The `▾` (`ChevronDown`) opens a small dropdown with a single option, `{m} Threads`,
    which switches to the split view: `{m} Threads ▾` + `{k} Comments` tabs (Threads
    active). Its `▾` dropdown offers `{n} Conversations` to collapse back.
  - `Attachments` stays a peer tab in both views.
  - Dropdown is a new page-scoped `ViewSwitchTab` component (own `useState` open flag,
    `mousedown`-outside + `Escape` close via `useEffect`). Split label + caret into two
    sibling `<button>`s to avoid nested buttons.
- **Count before label:** every tab renders `<span class="font-mono text-[11px]
  opacity-60">{count}</span> {Label}`.
- **Newest-first:** the displayed list is `[...list].sort(newestFirst)` in
  `_ticket-detail.tsx`. The `messages` prop stays chronological for `ReplyComposer`
  (which sorts internally in `findQuotedMessage`) and `AttachmentsTab` (order-independent
  `flatMap`). `page.tsx` fetch order left `ascending: true`.
- **Thread/Comment classification:** new `kind: "thread" | "comment"` on `MessageItem`,
  derived server-side in `page.tsx` from `source_meta.zohoSource` (`"thread"` / `"comment"`)
  falling back to `visibility` for Hub-native rows. Replaces the old
  `visibility === "public"` proxy, which mis-filed public Zoho comments into Threads.

### Round 2 (follow-up from user review — screenshots 13–15)

- **Collapsible conversation items, default collapsed (Zoho-style):** `_conversation-thread.tsx`
  reworked — each message is now a `MessageCard` with a clickable header (avatar, author,
  label chips, timestamp, `ChevronDown`) and, when collapsed, a one-line `previewText()`
  snippet. Only the newest message (index 0, newest-first) starts expanded; the rest
  collapse. Added an **Expand all / Collapse all** toggle. `ConversationThread` is keyed on
  `convView` in the parent so switching Conversations/Threads/Comments re-seeds the
  expand state cleanly (avoids `set-state-in-effect`).
- **"Reply from us" is now unmistakable:** outbound staff replies
  (`authorType === "staff" && visibility === "public"`) get a blue card tint + a small
  `REPLY FROM US` label; internal comments get a faint amber tint; inbound stays white.
- **Author name fix:** `page.tsx` now prefers `source_meta.author.name` (e.g. `"WebriQ"`)
  over the Hub profile the import resolved by email — that profile carried a wrong
  `full_name` (`"Danessa helpdesk@webriq.us"`), so our replies were mis-attributed.
- **Dropdown clipping bug fixed:** the tab bar's `overflow-x-auto` created a clipping
  context that hid the view-switcher dropdown entirely. Changed to `flex-wrap` (tab set is
  ≤ 3 items).
- **`#533` clarified with the user:** they were viewing ticket `#533`, which genuinely has
  **no reply-from-us message** — our reply lives on `#8` and appears only *quoted* inside
  `#533`'s message 2. Confirmed live in the browser. This is the duplicate-ticket bug
  below; the conversation UI is behaving correctly.

### Round 3 (follow-up — screenshot 16, "the blue line looks cut")

- The view-switcher tab's active blue underline looked broken because the count/label
  button and the caret button each carried their own `border-b-2`, leaving a seam between
  them. Moved the border to the `ViewSwitchTab` wrapper `<div>` (`border-b-2 -mb-px`), so
  one unbroken 2px line runs under the whole `[count · label · caret]` unit; the inner
  buttons now only carry text color.
- Polished the dropdown: `top-[calc(100%+8px)]` (was `mt-1`), `z-30`, `rounded-[12px]`,
  a real elevation shadow (`shadow-[0_16px_40px_-12px_rgba(11,21,51,0.28)]`) + hairline
  ring so it reads as a floating menu over the conversation list instead of a flat box.
- Browser-verified both directions on ticket `#8`: `10 Conversations ▾` ↔ `3 Threads ▾` /
  `7 Comments`, continuous underline, elevated dropdown.

### Files Changed

- `src/app/(hub)/desk/tickets/[ticketNumber]/_conversation-thread.tsx` — added `kind` to
  `MessageItem`; new `MessageCard` (collapsible), `previewText()`, `isOutboundReply()`
  helpers; Expand all / Collapse all; per-type card tint + "Reply from us" label.
- `src/app/(hub)/desk/tickets/[ticketNumber]/page.tsx` — derive `kind` per message; prefer
  `source_meta.author.name` for `authorName`.
- `src/app/(hub)/desk/tickets/[ticketNumber]/_ticket-detail.tsx` — layout move, view
  switcher state machine, `ViewSwitchTab` component, count-before-label, newest-first sort;
  tab bar `overflow-x-auto` → `flex-wrap`; `key={convView}` on `ConversationThread`.

### Deviations From Plan

- **Requirement 5 root cause was misdiagnosed in planning.** Live DB check: the
  `desk-threads` import is complete (354 outbound thread rows; imported ticket
  `#8` has all 10 messages incl. the WebriQ reply). The screenshot in the request is a
  **duplicate ticket `#533`** created today by the inbound-email path, which failed to
  thread onto `#8`. `desk-threads/route.ts` was therefore **not modified**. The task-323
  UI changes do make the outbound reply show correctly on imported tickets.
- **New follow-up needed (out of scope):** inbound email (task 303 webhook / task 321 IMAP
  poll) creates a new ticket instead of threading onto an existing open ticket with the
  same requester + subject / `In-Reply-To` chain. Ticket `#533` is a live example
  (duplicate of `#8`, "HOLIDAY HOURS?", `laura@lanemitchelljewelers.com`).
- Did not add a per-message "Comment"/"Reply" text label (planning marked it optional);
  the existing Public/Private chip already distinguishes them.

### Follow-up task to raise

**Inbound email creates a duplicate ticket instead of threading onto the existing one.**
Ticket `#533` (created 2026-08-27, `external_id: null`, `zoho_mail_thread_id` set) is a
duplicate of the imported `#8` — same requester (`laura@lanemitchelljewelers.com`), same
subject ("HOLIDAY HOURS?"). The inbound path (task 303 webhook / task 321 IMAP poll)
matched neither the Zoho-imported ticket nor its messages (imported `email_message_id`
values are Zoho thread IDs, not RFC822 Message-IDs, so `In-Reply-To`/`References` matching
can't connect a reply to an imported thread). Needs: (a) thread inbound email onto an
existing open ticket by requester + normalized subject when no Message-ID match exists,
and/or (b) a merge-tickets action for existing duplicates.

### Verification Run

- `npx tsc --noEmit` — PASS
- `pnpm lint` — PASS (2 pre-existing warnings in an unrelated file: `_checklist-tab.tsx`)
- Live DB diagnostic (scratch script, PostgREST) — confirmed thread/comment/outbound
  counts and the `#8` vs `#533` duplicate.
- **Browser acceptance test — PASS** (dev server, logged in as admin):
  - `/desk/tickets/533` — two-column layout, subject in right column, `2 Conversations ▾`
    + `0 Attachments`, newest message expanded, older collapsed with preview line.
  - `/desk/tickets/8` — `10 Conversations ▾`; caret opens `3 Threads`; switching shows
    `3 Threads ▾` + `7 Comments` + `0 Attachments`; Threads list newest-first with the
    **WebriQ "REPLY FROM US"** card (blue tint) present and correctly attributed;
    Comments list newest-first, all Private, newest expanded.
- `impeccable` design hook flagged literal `text-[11/12/13px]` sizes — left as-is: these
  match the established hand-rolled pattern in this exact file and its siblings
  (`_conversation-thread.tsx`, `_attachments-tab.tsx`), per CLAUDE.md's "match the
  neighboring UI" rule. No new type scale introduced.
