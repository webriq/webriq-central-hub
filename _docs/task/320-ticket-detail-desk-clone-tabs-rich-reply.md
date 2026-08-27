# 320: Ticket Detail — Clone Zoho Desk Ticket View (Tabs + Rich-Text Reply)

**Created:** 2026-08-27
**Priority:** MEDIUM
**Type:** enhancement
**Recommended Tier:** balanced
**Status:** Planned

---

## Overview

Reference screenshots (Zoho Desk's own ticket view) show a richer per-ticket layout than our current `(hub)/desk/tickets/[ticketNumber]` page: a tabbed conversation area (Conversations / Threads / Comments / Attachment / Resolution / Time Entry / Activity), a left icon rail (Zia Insights, History, Resolution, Tools, Link, Bug), and — when composing — a full rich-text reply screen with From/To fields, a formatting toolbar, a branded signature block, and the quoted original message.

We don't have backing data for everything Zoho shows (no time-entry-on-tickets, no resolution notes, no status-change history log, no AI insights, no signature/email-template system). Per user decision, this task clones only the parts we can back with real data:

- **Tabs:** `Conversations` (all messages, current default behavior), `Threads` (public client↔staff messages only), `Comments` (internal/private staff notes only), `Attachments` (aggregated across the ticket). Resolution, Time Entry, Activity, Zia Insights, and the left icon rail are explicitly **not** built — see Out of Scope.
- **Reply composer:** upgraded from a plain `<textarea>` to a Tiptap rich-text composer with From/To display rows and the quoted original message shown below the compose area — no signature block. Stays **inline, expanded in place** (current UX pattern), not a full-page/modal overlay.
- **Comments composer:** upgraded to the same rich-text editor for consistency (Comments tab screenshot also shows a formatting toolbar), reusing one shared local editor component for both.

Decisions were confirmed via `AskUserQuestion` before writing this doc — see the three answers folded into the bullets above.

## Design System & Coding Standards

- **Styling authority:** `_final_design/guide/central-hub-design-system.md` (v2.0) — visual reference at `_final_design/guide/central-hub-style-guide.html`. The current page already matches this system's tokens (`#0B1533` ink, `#5F6A88` muted, `#E2E7F2` line, `#EDF0F7` line-soft, `#007BFF` blue, `#3A4565` body, `--r-lg`/`14px` panels, `--r-md`/`10px` inputs) — keep every new element on these exact tokens, don't introduce new colors.
  - **Tabs (new):** no dedicated "Tabs" component is documented, so build the 4-tab bar from existing primitives: 13px/500 label + mono-face count (JetBrains Mono, per §2 "Data" row — counts are machine values), active tab in `--blue`/`--ink` with a 2px bottom border, inactive in `--muted`, 160ms `cubic-bezier(.22,1,.36,1)` color transition per §5. No left-border accent stripes (§7 Don't).
  - **Attachments list (new):** follow §4 Table conventions — `--line-soft` row dividers, `--blue-50` row hover, 13px text; empty state follows §6 "empty states teach" voice (state what's true and why, sentence case, no exclamation points) rather than a generic "No Attachments available."
  - **Rich-text editor toolbar (new):** treat as a Form control per §4 Forms — `--bg` resting fill, `--blue` border + 3px `rgba(0,123,255,.14)` ring on focus-within, `--r-md` radius; toolbar buttons follow the existing `_comment-editor.tsx` precedent (compact icon/letter buttons, `--blue-100`/`--blue` active state).
  - Buttons: Send = Confirm/navigate blue pill (§4 Buttons); Cancel = Ghost pill. No new orange CTA — orange is reserved, one-per-screen, and this page has no CTA-tier action.
  - Run `/frontend-design:frontend-design` and/or `/impeccable:impeccable` during implementation for the actual visual/UX pass (tab bar layout, spacing rhythm, empty-state composition) rather than guessing pixel values from this doc alone — this doc fixes tokens and constraints, not final layout.
- **File length:** per `nextjs-file-length-best-practices.md`, `_ticket-detail.tsx` is already 346 lines before this task's additions (tabs + attachments tab + upgraded reply block will add real weight). Split proactively rather than letting it cross the ~400–500 line hard-limit guidance:
  - Extract the Attachments tab into its own local file (e.g. `_attachments-tab.tsx`) rather than inlining it in `_ticket-detail.tsx`.
  - Extract the reply composer's From/To rows + quoted-message block into a small local component (e.g. `_reply-composer.tsx`) rather than inlining ~60+ more lines into the existing compose block.
  - `_rich-text-editor.tsx` is already planned as its own file (Proposed File Changes) — keep it under ~150 lines by not adding image support (per Out of Scope).
  - This keeps `_ticket-detail.tsx` focused on layout/orchestration (tab state, data flow) rather than growing into a kitchen-sink file — same "single responsibility per file" heuristic the guide calls out, and consistent with this route folder's existing pattern of splitting `_conversation-thread.tsx` out already.

## Requirements

- [ ] Replace the static `"{n} Conversation(s)"` header in `_ticket-detail.tsx` with a 4-tab bar: **Conversations** (count = all messages), **Threads** (count = `visibility === 'public'`), **Comments** (count = `visibility === 'internal'`), **Attachments** (count = total attachments across all messages on the ticket).
- [ ] Switching tabs filters what `ConversationThread` renders (Conversations = unfiltered `messages`; Threads = public-only; Comments = internal-only). No new data fetch needed — filter the already-fetched `messages` array client-side.
- [ ] New **Attachments** tab: flat list of every attachment across all of the ticket's messages (filename, size, which message/author it came from, download button reusing the existing `/api/desk/tickets/[ticketNumber]/messages/[messageId]/attachments/[attachmentId]/file-url` endpoint). Empty state: icon + "No attachments on this ticket" message — no upload UI (see Out of Scope).
- [ ] Build one shared local rich-text editor component (Tiptap, `StarterKit` + `Underline`, no image extension) for both the Internal Note composer and the Reply composer — replacing the current plain `<textarea>` for both. Match the existing minimal toolbar pattern (see Code Context) rather than inventing a new one.
- [ ] Reply composer becomes: a read-only **From** row (`ZOHO_MAIL_FROM_ADDRESS`, passed down from the server component) and **To** row (`ticket.contactEmail`, already computed) above the rich-text editor, and — below the editor — a de-emphasized, non-editable **quoted block** showing the most recent message that has an `email_message_id` (the same message `POST /reply` actually threads off of via `replyToMessageId`), formatted roughly as `On {date}, {authorName} wrote:` followed by its sanitized body. Keep the existing Send/disabled/error/loading states; add a **Cancel** button next to Send that clears the draft and collapses back to the mode toggle.
- [ ] `POST /api/desk/tickets/[ticketNumber]/reply` and `POST /api/desk/tickets/[ticketNumber]/notes`: set `source_meta: { contentType: "text/html" }` on the inserted `ticket_messages` row, since the body is now Tiptap HTML, not plain text. Without this, `_ticket-detail.tsx`'s `isHtml` check (`contentTypeMeta === "text/html"`) stays `false` for our own outgoing messages and they'll render as escaped raw HTML tags in the thread — a real regression, not cosmetic.
- [ ] Manually verify one real reply send end-to-end (staging/sandbox ticket + real inbox): confirm the HTML body renders correctly in the recipient's mail client, and confirm whether Zoho Mail's native `action: "reply"` already quotes the original message on the recipient's side or not. `src/lib/zoho/mail.ts`'s own header already flags several `sendReply`/content-format details as **unverified against a live account** — switching the request body from plain text to Tiptap HTML is exactly the kind of change that disclaimer warns about, so this must be checked before calling the feature done, not assumed.

## Out of Scope / Must-Not-Change

- Left icon rail (Zia Insights / History / Resolution-check / Tools / Link / Bug), Resolution tab, Time Entry tab, Activity tab — no backing data; do not stub or fake them.
- Macros, Remote Assist, and a dedicated "Reopen Ticket" button — the existing Status `<select>` in the Key Information panel already covers reopening a closed/resolved ticket; do not add a redundant button.
- Signature block in the reply composer (branded logo/name/contact block) — no email-template/signature system exists in this codebase; do not hardcode one.
- Attachment **upload** on the Attachments tab ("Attach From Cloud" / "Browse Files" in the reference screenshot) — task 306 scope was import + download only; no upload endpoint exists for `ticket_message` attachments. This task is view/download only.
- Image paste/embed in the new rich-text editor — unlike `_comment-editor.tsx` (tasks/issues), do not wire up an image upload endpoint for ticket notes/replies; text formatting marks only (bold/italic/underline/lists/link).
- CC/BCC or an editable "To" field on replies — recipient stays the single resolved `ticket.contactEmail`, matching current `POST /reply` behavior exactly.
- Full-page/modal reply overlay — composer stays inline within the ticket page, per the confirmed decision.
- Left panel (Contact Info / Key Information / Ticket Information cards) and the top ticket header (subject, status chip, back link) — already structurally close to the reference; no changes required there.

## Proposed File Changes

| File | Action | Purpose |
|------|--------|---------|
| `src/app/(hub)/desk/tickets/[ticketNumber]/_ticket-detail.tsx` | Modify | Add tab state + tab bar, filter messages per tab, swap note composer for the new rich-text editor, wire in `_attachments-tab.tsx` and `_reply-composer.tsx` — keep this file to layout/orchestration, not the new UI's implementation detail |
| `src/app/(hub)/desk/tickets/[ticketNumber]/_rich-text-editor.tsx` | Create | Shared local Tiptap editor (no image upload) used by both Note and Reply composers |
| `src/app/(hub)/desk/tickets/[ticketNumber]/_attachments-tab.tsx` | Create | Attachments tab list + empty state, extracted to keep `_ticket-detail.tsx` under the file-length guidance |
| `src/app/(hub)/desk/tickets/[ticketNumber]/_reply-composer.tsx` | Create | From/To rows + `_rich-text-editor.tsx` + quoted-message block + Send/Cancel, extracted for the same reason |
| `src/app/(hub)/desk/tickets/[ticketNumber]/page.tsx` | Modify | Flatten attachments (with message/author context) for the Attachments tab; pass `fromAddress` (`process.env.ZOHO_MAIL_FROM_ADDRESS`) down as a prop |
| `src/app/(hub)/desk/tickets/[ticketNumber]/_conversation-thread.tsx` | No change expected | Already accepts a `messages` array — tabs pass it a pre-filtered array; confirm no change needed during implementation |
| `src/app/api/desk/tickets/[ticketNumber]/reply/route.ts` | Modify | Insert `source_meta: { contentType: "text/html" }` on the new `ticket_messages` row |
| `src/app/api/desk/tickets/[ticketNumber]/notes/route.ts` | Modify | Insert `source_meta: { contentType: "text/html" }` on the new `ticket_messages` row |

## Code Context

### Current state — `_ticket-detail.tsx` (compose area, `src/app/(hub)/desk/tickets/[ticketNumber]/_ticket-detail.tsx:270-341`)
Plain `<textarea>` for both note and reply, mode toggle via `composeMode`, `handleAddNote`/`handleSendReply` POST to the existing routes. Keep this state-management shape (`noteBody`/`replyBody`/`*Saving`/`*Error`) — only swap the input control and reply layout, don't rewrite the fetch logic.

### Current state — `_conversation-thread.tsx` (`MessageItem` type, `src/app/(hub)/desk/tickets/[ticketNumber]/_conversation-thread.tsx:10-19`)
```ts
export type MessageItem = {
  id: string;
  authorType: "client" | "staff" | "system" | "llm_draft";
  authorName: string;
  body: string;
  isHtml: boolean;
  visibility: "public" | "internal";
  createdAt: string;
  attachments: MessageAttachment[];
};
```
Filter on `visibility` for Threads/Comments tabs; `attachments` per message already carries `{ id, filename, size }` — flatten across all messages for the Attachments tab (add `messageId`/`authorName`/`createdAt` context when flattening in `page.tsx`).

### Rich-text editor precedent to follow — `src/app/(hub)/projects/v2/[projectId]/tasks/[taskId]/_comment-editor.tsx`
Minimal Tiptap pattern already used for comments elsewhere in this codebase (StarterKit + toolbar buttons driving `editor.chain().focus().toggle*().run()`, `onUpdate` reporting HTML + empty state to the parent). This task's new `_rich-text-editor.tsx` should follow the same shape, **minus** the `Image` extension and paste/drop image-upload handlers (out of scope here) — add `@tiptap/extension-underline` (already an installed dependency) for the Underline mark and a Link mark/button since the reference toolbar shows both.

### `POST /reply` route — recipient + threading (`src/app/api/desk/tickets/[ticketNumber]/reply/route.ts:55-70`)
```ts
const { data: latestMessage } = await adminClient
  .from("ticket_messages")
  .select("email_message_id")
  .eq("ticket_id", ticket.id)
  .not("email_message_id", "is", null)
  .order("created_at", { ascending: false })
  .limit(1)
  .maybeSingle();
```
This is the same message the new UI's quoted block should preview — don't duplicate the "latest message with an `email_message_id`" selection logic differently client-side; the client already has the full `messages` array from `page.tsx`, so replicate this exact filter (`email_message_id` truthy, most recent `createdAt`) client-side rather than adding a new API call.

### Insert call to patch (`src/app/api/desk/tickets/[ticketNumber]/reply/route.ts:98-104` and `notes/route.ts:39-45`)
Both currently insert without `source_meta`:
```ts
.insert({
  ticket_id: ticket.id,
  author_type: "staff",
  author_id: user.id,
  body: replyBody,          // or noteBody
  visibility: "public",     // or "internal"
  email_message_id: messageId, // reply only
})
```
Add `source_meta: { contentType: "text/html" }` to both once the body is Tiptap HTML.

## Implementation Steps

1. Build `_rich-text-editor.tsx` (shared Note/Reply editor) following the `_comment-editor.tsx` precedent, minus image support, plus Underline + Link marks, styled per the Design System & Coding Standards section above.
2. Wire `_rich-text-editor.tsx` into `_ticket-detail.tsx`'s existing Note compose block in place of its `<textarea>`, keeping the existing save/error/loading state variables.
3. Build `_reply-composer.tsx` (From/To rows, `_rich-text-editor.tsx`, quoted-message block replicating the `reply/route.ts` "latest message with `email_message_id`" selection, Send/Cancel) and wire it in in place of the current reply `<textarea>`.
4. Add the 4-tab bar and tab state to `_ticket-detail.tsx`; derive per-tab counts and filtered message arrays from the existing `messages` prop.
5. Build `_attachments-tab.tsx` using attachments flattened from `page.tsx`, and wire it into the tab bar.
6. Update `page.tsx` to flatten attachments with message context and pass `fromAddress`.
7. Update `reply/route.ts` and `notes/route.ts` to set `source_meta.contentType`.
8. Run `/frontend-design:frontend-design` or `/impeccable:impeccable` for a visual/UX pass over the new tab bar, attachments list, and reply composer before calling the UI done.
9. Manually send one real reply on a staging/sandbox ticket and confirm rendering + quoting behavior in an actual inbox (see Requirements — this is a hard acceptance gate, not optional polish).

## Acceptance Criteria

- [ ] Ticket detail page shows 4 tabs with correct live counts; switching tabs filters the thread correctly (verified against a ticket with a mix of public and internal messages).
- [ ] Attachments tab lists every attachment across the ticket's messages with working downloads, and shows a clean empty state when there are none.
- [ ] Internal Note and Reply both use the new rich-text editor (bold/italic/underline/bullet list/link all functional); posting a note or reply round-trips correctly and renders as formatted HTML (not escaped tags) in the thread afterward.
- [ ] Reply composer shows From/To rows and a quoted preview of the last threaded message; Cancel clears the draft.
- [ ] A real test reply was sent and visually confirmed in an actual recipient inbox (not just "the API returned 200").
- [ ] `npx tsc --noEmit` passes.
- [ ] No `dark:` classes introduced (v2 uses the `isDark`-prop pattern — this page currently has no dark-mode prop at all; match its existing light-only styling, don't introduce theming scope not already present).
- [ ] New/changed UI uses only tokens from `_final_design/guide/central-hub-design-system.md` (no new colors, radii, or shadows invented ad hoc).
- [ ] `_ticket-detail.tsx` stays under ~400 lines after the change (Attachments tab and reply composer extracted to their own files, per Design System & Coding Standards).

## Verification

```bash
npx tsc --noEmit
pnpm lint
pnpm dev   # manually exercise all 4 tabs, both composers, and one real reply send
```

## Compatibility Touchpoints

- None — no packaging, docs-site, adapter, or install-surface impact. Purely an in-app UI/API change under `desk/tickets/[ticketNumber]`.

## Implementation Notes

### What Changed
- Added a 4-tab bar (Conversations / Threads / Comments / Attachments) to the ticket detail page, filtering the existing `messages` array client-side by `visibility` — no new data fetch.
- Built a shared local Tiptap rich-text editor (`_rich-text-editor.tsx`) and swapped it in for both the Internal Note composer and a new, upgraded Reply composer (`_reply-composer.tsx`) — From/To display rows, a quoted preview of the last message the reply actually threads off of, Send/Cancel.
- Built a ticket-wide Attachments tab (`_attachments-tab.tsx`) that flattens attachments across every message on the ticket with a download action and a "teaches" empty state.
- `POST /reply` and `POST /notes` now tag their inserted `ticket_messages` row with `source_meta: { contentType: "text/html" }` since bodies are Tiptap HTML now, not plain text.
- Mid-implementation, the user reported that Zoho Desk's imported thread bodies contain inline `<img src="/supportapi/api/v1/threads/.../inlineImages/...">` paths with no origin, rendering broken. Added `absolutizeZohoDeskInlineImages()` (mirrors the existing `absolutizeZohoInlineImages()` precedent in `projects-old/_pm-shared.tsx`, same `https://crmplus.zoho.com` host) and folded it into a new exported `sanitizeMessageHtml()` helper in `_conversation-thread.tsx`, used by both the conversation thread and the reply composer's quoted-message block.

### Files Changed
- `src/app/(hub)/desk/tickets/[ticketNumber]/_rich-text-editor.tsx` - new shared Note/Reply Tiptap editor (no image support)
- `src/app/(hub)/desk/tickets/[ticketNumber]/_attachments-tab.tsx` - new Attachments tab (list + empty state)
- `src/app/(hub)/desk/tickets/[ticketNumber]/_reply-composer.tsx` - new Reply composer (From/To, editor, quoted block, Send/Cancel)
- `src/app/(hub)/desk/tickets/[ticketNumber]/_ticket-detail.tsx` - tab state/bar, wired in the three new components, note composer swapped to `RichTextEditor`
- `src/app/(hub)/desk/tickets/[ticketNumber]/_conversation-thread.tsx` - added `emailMessageId` to `MessageItem`; extracted + exported `sanitizeMessageHtml()` (now includes the Zoho Desk inline-image fix) for reuse by the reply composer
- `src/app/(hub)/desk/tickets/[ticketNumber]/page.tsx` - select/map `email_message_id`; compute and pass `fromAddress` (`ZOHO_MAIL_FROM_ADDRESS`) prop
- `src/app/api/desk/tickets/[ticketNumber]/reply/route.ts` - insert `source_meta: { contentType: "text/html" }`
- `src/app/api/desk/tickets/[ticketNumber]/notes/route.ts` - insert `source_meta: { contentType: "text/html" }`

### Deviations From Plan
- Attachments are flattened client-side from the already-fetched `messages` prop (each `MessageItem` already carries `authorName`/`createdAt`/`attachments`) instead of adding a separate flatten step in `page.tsx` — the doc's proposed server-side flatten turned out to be redundant once the type was inspected; `page.tsx` was still modified, but only to add `email_message_id`/`fromAddress`.
- `_conversation-thread.tsx` **was** modified, contrary to the doc's "No change expected" note — needed for the `emailMessageId` field and the shared `sanitizeMessageHtml()` helper (plus the inline-image fix below), both small, additive changes.
- Did not add `@tiptap/extension-underline` as a separate extension as the doc suggested. Existing codebase precedent (`_onboarding-wizard.tsx:3316`'s comment) confirms Tiptap v3's `StarterKit` already bundles Underline and Link — adding the standalone package triggers a "Duplicate extension names" runtime warning. Used `StarterKit.configure({ link: {...} })` alone, matching `_comment-editor.tsx`.
- Added `absolutizeZohoDeskInlineImages()` / exported `sanitizeMessageHtml()` — a mid-implementation scope addition requested directly by the user (broken inline images in imported Desk threads), not in the original task doc, landed in the same rendering path this task was already touching.
- `_ticket-detail.tsx` is 405 lines — 5 over the doc's own "~400" acceptance-criterion target, but within `nextjs-file-length-best-practices.md`'s actual 400–500 hard-limit band. No further extraction made; the remaining bulk is the left Ticket Properties panel, which the doc explicitly marked out-of-scope/unchanged.
- Several pre-existing `text-[12px]` labels/buttons (carried over from the original file, plus matched in the new composer files) were flagged by the `impeccable` design hook as off DESIGN.md's documented 11px/13px type ramp. Left as-is — they match this exact page's established, pervasive 12px button/label convention; changing only the new code to 13px would introduce a new inconsistency within the same view rather than resolve one.
- **Did not perform the doc's required live-send verification** ("manually send one real reply on a staging/sandbox ticket and confirm rendering + quoting behavior in an actual inbox"). This dev environment's `.env` is wired to real production Supabase and Zoho Mail credentials — no sandbox/staging separation was available, and sending a live customer email or writing a live internal note without the user's explicit go-ahead is exactly the class of hard-to-reverse, customer-visible action that needs confirmation first, not something to do autonomously. Verified instead at the compile/type level (see below); **the real-send check and full authenticated UI walkthrough (tab switching, editor formatting, attachments download, reply send) still need to be run by the user** before this can be marked fully done.

### Verification Run
- `npx tsc --noEmit` - PASS
- `pnpm lint` - PASS (2 pre-existing warnings in an unrelated file, `_checklist-tab.tsx`, not touched by this task)
- `pnpm dev` full manual UI walkthrough - SKIPPED (real production credentials in `.env`, no sandbox ticket/test account available; sending a real reply email requires the user's explicit authorization — see Deviations)
- `pnpm dev` compile smoke test - PASS (`curl /desk/tickets/1` returned a clean `307` auth redirect with no server-side errors in the dev log, confirming the modified module tree loads without runtime import/compile errors)

## Quality Gate Notes

### Result
PASS

### Standards Review
- **Bug found and fixed during this pass:** `_ticket-detail.tsx` passed a single `disabled` prop into `_reply-composer.tsx` that was used for *both* the Send button's disabled state (`replySaving || replyEmpty || !contactEmail`) *and* wired straight through to `RichTextEditor`'s `disabled`. Since `replyEmpty` defaults to `true`, the reply editor was `editable: false` from first render — and a disabled Tiptap instance can't receive input to ever fire `onUpdate`/flip `replyEmpty` to `false`, so the reply composer was permanently locked and completely unusable. Fixed by splitting the single prop into `sendDisabled` (button, unchanged semantics) and a `toEmail`-derived `editorDisabled = saving || !toEmail` computed inside `_reply-composer.tsx` (editor locks only while sending or when there's no recipient — matching the Note composer's existing `disabled={noteSaving}` pattern, and the original textarea's `disabled={!ticket.contactEmail}` behavior). Re-verified `npx tsc --noEmit` and `pnpm lint` clean after the fix.
- **Gap found and fixed:** both `reply/route.ts` and `notes/route.ts` still gated the "body is required" check on `body.body.trim()` truthiness. Tiptap's HTML output for an empty editor is `"<p></p>"` — a non-empty string — so the server-side required check no longer actually rejected empty content once the body format changed from plain text to HTML (the client-side `noteEmpty`/`replyEmpty` guard still prevented this through the UI, but the API itself had lost its own validation). Fixed by stripping tags before the emptiness check in both routes (`replyBody.replace(/<[^>]*>/g, "").trim().length === 0`).
- No unused code, no `any`, no deep nesting, no secrets/debug logging introduced. Error handling matches existing per-route conventions (try/catch + user-facing error state, distinct "sent but not saved" message preserved in `reply/route.ts`).
- Minor duplication: `formatDateTime` is now a near-identical one-liner in four files in this route folder (`_ticket-detail.tsx`, `_conversation-thread.tsx`, `_attachments-tab.tsx`, `_reply-composer.tsx`) rather than a shared helper. Consistent with this folder's pre-existing convention (`_ticket-detail.tsx` and `_conversation-thread.tsx` already had separate copies with different format options before this task) — not extracted, low complexity/drift risk.
- Multiple pre-existing and new `text-[12px]` labels/buttons were flagged by the `impeccable` design hook as off DESIGN.md's documented 11px/13px type ramp. Left as intentional (see Implementation Notes) — matches this exact page's established button/label convention.

### Deviations
- Major (found and corrected in this pass, not carried forward): reply composer editor was non-functional due to the shared-`disabled`-prop bug above. Root cause fixed; no longer a deviation in the current code.
- Minor: server-side empty-body validation gap for Tiptap HTML — fixed in this pass, documented above.
- Minor: `formatDateTime` duplication across 4 files — consistent with pre-existing folder convention, not extracted.
- Minor: `_ticket-detail.tsx` at 405 lines vs. the doc's own "~400" acceptance target (already documented in Implementation Notes) — within the actual 400–500 hard-limit guidance.
- Carried forward from Implementation Notes: the doc's required live-send verification (real reply to a real inbox) was not performed — this dev environment has real production Supabase/Zoho credentials with no sandbox separation, and sending a live customer email without the user's explicit authorization is not something to do unsupervised. This remains the one open acceptance-criteria item and should be the focus of the `test` stage / user's own hands-on check.
