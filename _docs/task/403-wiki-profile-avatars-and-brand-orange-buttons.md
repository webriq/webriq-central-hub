# 403: Wiki — Larger Profile-Photo Avatars with Name Tooltips + Brand-Orange Primary Buttons (+ History link in Page Info)

**Created:** 2026-09-24
**Priority:** MEDIUM
**Type:** enhancement
**Recommended Tier:** balanced
**Status:** Completed
**Completed:** 2026-09-24

---

## Overview

On `/kb` (Wiki), every user avatar is an initials-only colored circle (`WikiAvatar`, `src/app/(hub)/kb/_wiki-avatar.tsx`) at 16px (`sm`) or 24px (`md`), with a native `title` tooltip. The screenshot marks four places: the **"Also viewing"** presence stack, the **"Edited by"** meta row, the info panel's **Owner** row, and the **Contributors** stack. They are too small, and they don't show the user's profile photo.

Projects, Tasks and Tickets already render `profiles.avatar_url` with an initials fallback and a real Base UI `Tooltip` showing the full name. The reference is `AvatarStack`/`AvatarTip` in `src/app/(hub)/projects/_v2-listing/_avatar-stack.tsx`. The Wiki should match.

Separately, the Wiki's primary/positive buttons (Save, Create page, Import, Restore, Resume draft) use blue `#007BFF`. The rest of the hub uses the brand-orange pill for these (`bg-[#FB914E] text-[#471F02] hover:bg-[#E2762F] hover:text-white`, e.g. `projects/_shared/_members-tab.tsx:104`, `desk/tickets/_filed-issues-index.tsx:169`).

## Requirements

### Avatars
- [x] `WikiContributor` carries an optional `avatarUrl: string | null`, and every API that builds one selects `profiles.avatar_url`.
- [x] `WikiAvatar` renders `<img src={avatarUrl}>` (`object-cover`, `overflow-hidden`) when present, otherwise the existing initials + deterministic color.
- [x] `WikiAvatar` uses the shared `Tooltip`/`TooltipTrigger`/`TooltipContent` (`@/components/ui/tooltip`, `side="top"`) showing the **full name**, replacing the native `title`. Use the same `AvatarTip` `render`-prop wrapper as `_avatar-stack.tsx`. `TooltipProvider` is already mounted in `src/app/layout.tsx`.
- [x] Sizes go up one step: `sm` 16→24px (`w-6 h-6 text-[9px]`), `md` 24→32px (`w-8 h-8 text-[11px]`). Overlap stacks use `ring-2 ring-white` and `-ml-2`, matching `_avatar-stack.tsx`.
- [x] Every call site gets the photo:
  - info panel Owner (`createdBy`) + Contributors (`contributors`) — `md`
  - doc panel "Edited by" (`updatedBy`) — `sm`
  - history panel contributor list + per-revision editor — `sm`
  - presence bar: "is editing now" rows, idle draft-holder rows, "Also viewing" stack — `sm`
- [x] The presence payload carries `avatarUrl`: `WikiCurrentUser` + `WikiPresenceState` gain `avatarUrl: string | null`, and `kb/page.tsx` selects `avatar_url` with the profile.
- [x] Draft holders get `avatarUrl`. The `wiki_page_draft_holders()` RPC doesn't return it, so the page GET route runs a follow-up `profiles.select("id, avatar_url").in("id", holderIds)` (skipped when empty) and merges the result. **No migration.**
- [x] Missing or broken photos fall back to initials. At minimum, a `null` `avatar_url` shows initials, as it does in `_avatar-stack.tsx`.

### Brand-orange primary buttons
- [x] Every primary/positive action in the Wiki uses `bg-[#FB914E] text-[#471F02] hover:bg-[#E2762F] hover:text-white` in place of `bg-[#007BFF] text-white hover:bg-[#0063D6]`:
  - `_wiki-doc-panel.tsx:152` — **Save**
  - `_wiki-new-page-modal.tsx:139` — **Create page**
  - `_wiki-import-modal.tsx:238` — **Import**
  - `_wiki-history-panel.tsx:238` — **Restore this revision**
  - `_wiki-conflict-modal.tsx:24` — `ACTION_STYLE.primary`. This covers Restore confirm, Resume draft, and the other primary dialog actions in `_use-wiki-editor.tsx`.
  - `_wiki-tree-panel.tsx:125` — **New page**: already orange but `text-white`; align the text to `text-[#471F02] hover:text-white`.
- [x] Spinners inside these buttons still show (they inherit `currentColor`), and `disabled:opacity-45` is kept.

### Scope additions (user feedback during review)
- [x] The presence bar's **"X is editing now"** row shows the profile photo even when the editing user's tab predates `avatarUrl` tracking. It falls back to the server-resolved avatars on the page.
- [x] The doc header's **History** pill is removed. **History** is now a text link beside the version in Page Info (`v1 · History`, middle-dot separator).
- [x] The History link is available in **edit mode** too. Closing History returns to edit mode with unsaved changes intact. Restore is disabled while editing, to protect the autosaved draft.

## Out of Scope / Must-Not-Change

- Non-primary blue accents stay as they are: the tree-filter count badge (`_wiki-tree-filter.tsx:131`), links, focus/hover borders (`#A8C6F5`), and the `#0B1533` segmented toggles in the history and diff views.
- Danger (`#C0392B`) and secondary button styles stay as they are.
- The tag input's "Create "…"" suggestion row is a dropdown item, not a primary button. Leave it.
- Space-list and tree-filter colored squares (`_wiki-space-list.tsx:64`, `_wiki-tree-filter.tsx:153`) are space icons, not user avatars. Leave them.
- No DB migration, and no change to `wiki_page_draft_holders()`.
- Don't import `AvatarStack` across feature areas. Reimplement the tooltip wrapper locally, per the page-scoped UI convention (`_avatar-stack.tsx` does the same).
- No `dark:` classes.

## Proposed File Changes

| File | Action | Purpose |
|------|--------|---------|
| `src/types/wiki.ts` | Modify | `avatarUrl` on `WikiContributor`, `WikiDraftHolder`, `WikiPresenceState`, `WikiCurrentUser` |
| `src/app/api/wiki/pages/[pageId]/route.ts` | Modify | Select `avatar_url` in `DETAIL_SELECT` profile joins + `editor:profiles(...)`; `toContributor` maps it; holder avatar follow-up query |
| `src/app/api/wiki/pages/[pageId]/revisions/route.ts` | Modify | `editor:profiles(id, full_name, avatar_url)` → `avatarUrl` |
| `src/app/(hub)/kb/page.tsx` | Modify | Profile select adds `avatar_url`; `currentUser.avatarUrl` |
| `src/app/(hub)/kb/_use-wiki-presence.ts` | Modify | Track `avatarUrl` in the payload (primitive dep) |
| `src/app/(hub)/kb/_wiki-avatar.tsx` | Modify | Photo + initials fallback, Base UI tooltip, bigger sizes, ring overlap |
| `src/app/(hub)/kb/_wiki-presence-bar.tsx` | Modify | Pass `avatarUrl` for editors/holders/viewers; overlap container spacing |
| `src/app/(hub)/kb/_wiki-info-panel.tsx` | Verify/Modify | Stack spacing for the larger avatars (line 79 container) |
| `src/app/(hub)/kb/_wiki-history-panel.tsx` | Verify | Calls pass the full contributor, so they pick up `avatarUrl` automatically; check the row layout at 24px |
| `src/app/(hub)/kb/_wiki-doc-panel.tsx` | Modify | Save button → orange |
| `src/app/(hub)/kb/_wiki-new-page-modal.tsx` | Modify | Create page → orange |
| `src/app/(hub)/kb/_wiki-import-modal.tsx` | Modify | Import → orange |
| `src/app/(hub)/kb/_wiki-conflict-modal.tsx` | Modify | `ACTION_STYLE.primary` → orange |
| `src/app/(hub)/kb/_wiki-tree-panel.tsx` | Modify | New page text color alignment |

Also grep `WikiContributor`/`WikiPresenceState` construction sites (`rg "name: .*full_name|WikiContributor = \{" src`) for any other builders, e.g. the conflict `updatedBy` in `src/lib/wiki/save-errors.ts` or the PATCH/restore routes. With `avatarUrl` optional (`avatarUrl?: string | null`), unrelated builders still compile. Add `avatar_url` wherever a profile is already being joined.

## Code Context

### Current `WikiAvatar` (`src/app/(hub)/kb/_wiki-avatar.tsx`)
```tsx
export function WikiAvatar({ contributor, size = "md", overlap = false }: {...}) {
  const sizeClass = size === "sm" ? "w-4 h-4 text-[8px]" : "w-6 h-6 text-[9px]";
  return (
    <div title={contributor.name}
      className={cn("rounded-full flex items-center justify-center font-bold text-white shrink-0", sizeClass,
        overlap && "border-2 border-white -ml-1.5 first:ml-0")}
      style={{ background: avatarColorFor(contributor.id) }}>
      {initialsFor(contributor.name)}
    </div>
  );
}
```
Keep `avatarColorFor(id)` / `initialsFor(name)`. Drop the inline `style` background when a photo renders (same as `_avatar-stack.tsx`). The inline `style` stays acceptable for the computed hex, per the existing file.

### Reference (`src/app/(hub)/projects/_v2-listing/_avatar-stack.tsx`)
```tsx
function AvatarTip({ label, children }: { label: string; children: React.ReactElement }) {
  return (
    <Tooltip>
      <TooltipTrigger render={children} />
      <TooltipContent side="top">{label}</TooltipContent>
    </Tooltip>
  );
}
// ...
<div className="w-6 h-6 rounded-full ... ring-2 ring-white shrink-0 overflow-hidden"
     style={m.avatar_url ? undefined : { background: colorFor(m.full_name) }}>
  {m.avatar_url ? (
    // eslint-disable-next-line @next/next/no-img-element -- external Supabase-auth-provider avatar URL, not a static/optimizable asset
    <img src={m.avatar_url} alt={m.full_name ?? "Unnamed"} className="w-full h-full object-cover" />
  ) : initialsFor(m.full_name)}
</div>
```
Note: `TooltipTrigger render={children}` needs `children` to be a single element that forwards props/ref. A plain `<div>` works.

### API (`src/app/api/wiki/pages/[pageId]/route.ts`)
```ts
const DETAIL_SELECT = "... created_by_profile:profiles!wiki_pages_created_by_fkey(id, full_name), " +
  "updated_by_profile:profiles!wiki_pages_updated_by_fkey(id, full_name)";
function toContributor(profile: { id: string; full_name: string | null } | null) { ... }
// versions: .select("edited_by, created_at, editor:profiles(id, full_name)")
// holders:  supabase.rpc("wiki_page_draft_holders", ...) → { user_id, full_name, email, updated_at, base_revision }
```
The `DetailRow` type and the `toContributor` param type need `avatar_url`.

### Presence (`src/app/(hub)/kb/_use-wiki-presence.ts`)
`const { id: userId, name: userName, email: userEmail } = currentUser;`. The hook deliberately destructures primitives so the channel doesn't resubscribe. Add `avatarUrl` the same way, and add it to the `track` payload and the `useCallback` deps. The public-channel comment (line 12) lists the payload fields; update it to mention `avatarUrl`.

### Brand-orange reference
`_members-tab.tsx:104`: `rounded-full bg-[#FB914E] text-[#471F02] ... hover:bg-[#E2762F] hover:text-white cursor-pointer transition-colors`

## Implementation Steps

1. Types: add `avatarUrl?: string | null` to `WikiContributor`, and `avatarUrl: string | null` to `WikiDraftHolder`, `WikiPresenceState` and `WikiCurrentUser`.
2. Page GET route: add `avatar_url` to both profile joins and the versions `editor` join, map it in `toContributor` and the contributors loop, then run the holder avatar follow-up query and merge by id.
3. Revisions route: add `avatar_url` to the editor join and map it.
4. Grep other `WikiContributor` builders (PATCH/restore/conflict responses) and add `avatar_url` where a profile join already exists.
5. `kb/page.tsx`: select `role, full_name, avatar_url` and set `currentUser.avatarUrl`.
6. `_use-wiki-presence.ts`: add `avatarUrl` to the tracked payload.
7. Rewrite `WikiAvatar`: add `AvatarTip`, photo/initials, new sizes, and `ring-2 ring-white -ml-2 first:ml-0` for overlap.
8. Presence bar: pass `avatarUrl` for editor, holder and viewer.
9. Swap the five blue primaries to orange and fix the "New page" text color.
10. Run `npx tsc --noEmit` and `pnpm lint`, then check in the browser.

## Acceptance Criteria

- [x] In the four places marked in the screenshot, a user with `profiles.avatar_url` shows their photo. A user without one shows initials on the deterministic color.
- [x] Hovering any Wiki avatar shows a styled tooltip with the full name, not the browser's native title.
- [x] Owner/Contributors avatars are 32px, and inline/meta/presence avatars are 24px. Overlapping stacks have a white ring and no clipped edges.
- [x] Draft-holder and history-panel avatars also show photos.
- [x] Save, Create page, Import, Restore this revision, and primary dialog actions (Resume draft, Restore confirm) render brand orange with dark-brown text, turning darker orange with white text on hover. The disabled state is still dimmed.
- [x] Danger/secondary buttons and non-button blue accents are unchanged.
- [x] The "is editing now" row shows the editor's photo (verified in user screenshot after the fallback fix).
- [x] The header shows Edit / Delete / Export only, and Page Info shows `Version v{n} · History`, where the link opens the history panel.
- [x] In edit mode, the History link opens the panel. Closing it returns to the editor with title, content and tags unchanged. "Restore this revision" is disabled with a hint while editing.
- [x] `npx tsc --noEmit` and `pnpm lint` pass.

## Verification

```bash
npx tsc --noEmit
pnpm lint
```

Browser (`pnpm dev` → `/kb`):
- Open a page as a user with a profile photo, then check Owner, Contributors and Edited by, and hover each for the tooltip.
- Open the same page in a second session or user to see "Also viewing". Enter edit mode in one to see the "is editing now" row.
- Open History and check the contributor and editor avatars.
- Check the button colors for Edit → Save, New page → Create page, Import, History → Restore, and the draft-resume dialog.

## Compatibility Touchpoints

- Presence payload shape changes (additive `avatarUrl`). A tab still running the old bundle sends no `avatarUrl`, which falls back to initials. Harmless.
- No migration, env, or packaging impact. CLAUDE.md needs no update beyond an optional note that Wiki avatars now follow the Projects `AvatarTip` pattern.

## Implementation Notes

### What Changed
- `WikiAvatar` now renders the `profiles.avatar_url` photo (initials + deterministic color fallback), wraps every avatar in a Base UI `Tooltip` showing the full name (local `AvatarTip`, same as `_avatar-stack.tsx`), and is one size step larger (`sm` 24px, `md` 32px). The overlap stack uses `ring-2 ring-white -ml-2 first:ml-0`.
- `avatarUrl` is threaded through the types, the page GET, the revisions GET, the 409 conflict body, the `/kb` current user, and the presence payload. Draft-holder avatars come from a follow-up `profiles` lookup, since the security-definer RPC is unchanged and there is no migration.
- Wiki primary buttons (Save, Create page, Import, Restore this revision, conflict/draft dialog `primary` variant) moved from blue `#007BFF` to brand orange `bg-[#FB914E] text-[#471F02] hover:bg-[#E2762F] hover:text-white`. The "New page" text color is aligned to match.

### Files Changed
- `src/types/wiki.ts` - `avatarUrl` on `WikiContributor` (optional), `WikiDraftHolder`, `WikiPresenceState`, `WikiCurrentUser`
- `src/app/api/wiki/pages/[pageId]/route.ts` - `avatar_url` in profile joins, `ProfileRef` type, draft-holder avatar follow-up query
- `src/app/api/wiki/pages/[pageId]/revisions/route.ts` - editor `avatar_url`
- `src/lib/wiki/save-errors.ts` - conflict `updatedBy.avatarUrl`
- `src/app/(hub)/kb/page.tsx` - select `avatar_url`, `currentUser.avatarUrl`
- `src/app/(hub)/kb/_use-wiki-presence.ts` - track `avatarUrl`
- `src/app/(hub)/kb/_wiki-presence-bar.tsx` - pass `avatarUrl` for editors/holders/viewers
- `src/app/(hub)/kb/_wiki-avatar.tsx` - photo, tooltip, sizes
- `src/app/(hub)/kb/_wiki-doc-panel.tsx`, `_wiki-new-page-modal.tsx`, `_wiki-import-modal.tsx`, `_wiki-history-panel.tsx`, `_wiki-conflict-modal.tsx`, `_wiki-tree-panel.tsx` - brand-orange primaries

### Deviations From Plan
- `src/lib/wiki/save-errors.ts` was also updated. The plan's step 4 grep found it, and it was the only other `WikiContributor` builder.
- `_wiki-info-panel.tsx` and `_wiki-history-panel.tsx` needed no edits. They pass full contributor objects, and their flex rows fit the larger avatars.
- The design hook flagged the initials font sizes (`text-[9px]`/`text-[11px]`) as off the type ramp. These are intentional: they are sized to fit inside a 24/32px circle and match the existing 9px initials in the Projects `_avatar-stack.tsx`. Left unchanged.

### Verification Run
- `npx tsc --noEmit` - PASS
- `npx eslint src/app/(hub)/kb src/app/api/wiki src/lib/wiki src/types/wiki.ts` - PASS
- Browser acceptance - SKIPPED (deferred to the `test` stage)

## Quality Gate Notes

### Result
PASS

### Standards Review
- No blocking issues. No `any`, no dead or commented-out code, no debug logging.
- `ProfileRef` removes the three copies of the inline `{ id; full_name }` type in the page route.
- The draft-holder avatar lookup runs only when holders exist. A failed lookup is silently dropped and degrades to initials. That is intentional: an avatar is cosmetic and must not fail the page GET.
- The lookup is one extra sequential round trip after the `Promise.all`, and only when someone holds a draft. It can't join the parallel batch because it depends on the RPC result. Acceptable.
- The presence hook keeps its primitive-deps convention (`userAvatarUrl` is destructured, not the object), so the channel still doesn't resubscribe on re-render. Its public-payload comment is updated.
- The inline `style` background in `WikiAvatar` is a computed hex. That is permitted by the CLAUDE.md `style={{}}` exception and was pre-existing.
- `AvatarTip` duplicates the 6-line wrapper from `_avatar-stack.tsx`. This is deliberate, per the page-scoped UI convention and the task's out-of-scope rule against cross-feature imports.

### Deviations
- Minor: `src/lib/wiki/save-errors.ts` was also changed. The plan's step 4 anticipated this, and it keeps the conflict dialog's `updatedBy` consistent.
- Minor: `_wiki-info-panel.tsx` and `_wiki-history-panel.tsx` needed no edits (both marked "Verify" in the plan).
- Minor: the initials font sizes are off the DESIGN.md type ramp (hook finding). This is intentional sizing inside the avatar circle and matches the Projects `_avatar-stack.tsx`.
- Out-of-scope boundaries were respected. The tree-filter blue badge, danger/secondary styles, space icons, and RPC/migrations are untouched, and no `dark:` classes were added.

### Required Fixes
- None.

## Follow-up — "is editing now" row avatar (user feedback, post-quality-gate)

User reported the presence bar's **"X is editing now"** row still showed initials ("DH") after the change. The row already rendered at the new 24px size with the new Base UI tooltip.

**Root cause:** presence-row avatars came only from the editing user's own Realtime `track()` payload. That user's tab had been open for 49 minutes, since before this change, so its bundle never sent `avatarUrl`.

**Fix:** `WikiPresenceBar` takes a new `knownPeople: WikiContributor[]` prop. `_wiki-shell.tsx` passes `createdBy`, `updatedBy` and `contributors`. The bar builds an id → avatar map from `knownPeople` plus `draftHolders`, and `presenceAvatar(entry)` resolves `entry.avatarUrl || knownAvatars.get(userId) || null` for the editor and viewer rows. An active editor almost always has an autosaved draft row, and draft holders' photos are resolved server-side, so the photo shows even when the editor's own tab is stale.

- Files: `src/app/(hub)/kb/_wiki-presence-bar.tsx`, `src/app/(hub)/kb/_wiki-shell.tsx`
- `npx tsc --noEmit` - PASS; eslint on both files - PASS
- If a user has no `profiles.avatar_url` at all, initials remain the correct fallback.

## Follow-up — History moved from header pill to Page Info link (user feedback)

The doc header's **History** pill took up space in the top action row. It is now a text link beside the version in **Page Info**, reading `Version  v1 · History`.

- **Label:** kept **"History"**. It matches the panel it opens (`_wiki-history-panel.tsx`) and the familiar "Page/Version history" convention. "Revisions" was rejected because it is easily confused with the version number (`version` is publish-only, while the history lists every save). "Changes" was rejected because it implies a diff-only view, but the panel also restores revisions and lists contributors.
- `_wiki-doc-panel.tsx`: removed the History pill, the `onOpenHistory` prop, and the `History` icon import.
- `_wiki-info-panel.tsx`: new optional `onOpenHistory` prop. The Version row renders `v{n}`, then a `·` separator (`aria-hidden`), then a `<button>` styled as a link (`text-[#0063D6]`, underline on hover). The `mono` option on `InfoRow` was removed, since Version was its only user.
- `_wiki-shell.tsx`: passes `onOpenHistory` to the info panel only when not in edit mode. This preserves the old pill's view-mode-only behavior, so history can't be opened over unsaved edits. The info panel is already hidden while history is open.
- `npx tsc --noEmit` - PASS; eslint on the three files - PASS

## Follow-up — History link available in Edit mode (user feedback)

The user asked for the **History** link to show in edit mode too, with closing History returning to edit mode and no unsaved changes lost.

- **Why edits survive:** `editMode`, `draftTitle`, `draftContentHtml`, `draftTags` and `baseRevision` all live in `useWikiEditor` (`_use-wiki-editor.tsx`), which is owned by `_wiki-shell.tsx`, not by `WikiDocPanel`. The shell swaps `WikiDocPanel` ↔ `WikiHistoryPanel` on `historyOpen`, so the doc panel unmounts, but the hook state persists. The hook has no effect that resets on `detail` changes. On close, `WikiRte` remounts with `content: value` (the in-memory draft HTML), and draft autosave (`useWikiDraft`, gated on `editMode`) keeps running throughout. Tiptap's undo stack and caret position reset on remount; this is acceptable.
- `_wiki-shell.tsx`: `onOpenHistory` is always passed (no more edit-mode gating). The history panel also gets `editing={editor.editMode}`.
- `_wiki-info-panel.tsx`: `onOpenHistory` is now required, and the link always renders.
- `_wiki-history-panel.tsx`: new `editing` prop. **Restore is disabled while editing**, with the tooltip "Save or cancel your edits before restoring a revision". Restore runs through `wiki_save_page()`, which deletes the caller's own autosaved draft, the only server-side backup of the unsaved edits. Restoring mid-edit would also leave the editor on a stale `baseRevision` (a guaranteed 409 on Save). Browsing and diffing revisions stay fully available while editing.
- `npx tsc --noEmit` - PASS; eslint on the three files - PASS

## Final Summary

### Delivered
1. **Profile-photo avatars:** `WikiAvatar` renders `profiles.avatar_url` (initials + deterministic color fallback) with a Base UI `Tooltip` showing the full name, one size step larger (`sm` 24px, `md` 32px, ring-2 overlap). It covers Owner, Contributors, Edited by, History (contributors + per-revision editor), and the presence bar (editing now, draft holders, Also viewing).
2. **Avatar data plumbing:** `avatarUrl` is added to `WikiContributor`, `WikiDraftHolder`, `WikiPresenceState` and `WikiCurrentUser`. It is selected in the page GET, the revisions GET, the 409 conflict body, and the `/kb` current user, and is carried in the Realtime presence payload. Draft-holder avatars come from a follow-up `profiles` lookup (the RPC is unchanged, no migration).
3. **Stale-presence fallback:** the presence bar resolves a missing live `avatarUrl` from the page's server-known people (owner, last editor, contributors, draft holders).
4. **Brand-orange primaries:** Save, Create page, Import, Restore this revision, and the dialog `primary` variant use `bg-[#FB914E] text-[#471F02] hover:bg-[#E2762F] hover:text-white`. The "New page" text color is aligned to match.
5. **History link:** the header pill is replaced by a `v{n} · History` link in Page Info, labelled "History" (over "Revisions" or "Changes"; see the follow-up above). It is available in view and edit mode, and Restore is gated while editing.

### All Files Changed
- `src/types/wiki.ts`
- `src/app/api/wiki/pages/[pageId]/route.ts`
- `src/app/api/wiki/pages/[pageId]/revisions/route.ts`
- `src/lib/wiki/save-errors.ts`
- `src/app/(hub)/kb/page.tsx`
- `src/app/(hub)/kb/_use-wiki-presence.ts`
- `src/app/(hub)/kb/_wiki-avatar.tsx`
- `src/app/(hub)/kb/_wiki-presence-bar.tsx`
- `src/app/(hub)/kb/_wiki-shell.tsx`
- `src/app/(hub)/kb/_wiki-info-panel.tsx`
- `src/app/(hub)/kb/_wiki-history-panel.tsx`
- `src/app/(hub)/kb/_wiki-doc-panel.tsx`
- `src/app/(hub)/kb/_wiki-new-page-modal.tsx`
- `src/app/(hub)/kb/_wiki-import-modal.tsx`
- `src/app/(hub)/kb/_wiki-conflict-modal.tsx`
- `src/app/(hub)/kb/_wiki-tree-panel.tsx`

### Verification
- `npx tsc --noEmit`: PASS after every change set.
- ESLint on all changed files: PASS.
- Browser: avatars, tooltip, sizes and orange buttons confirmed via user screenshots during review. Formal `test`-stage report skipped at the user's request (marked completed directly).

### Known Limitations / Follow-ups
- A set-but-broken `avatar_url` renders a broken image rather than initials. This matches the Projects `_avatar-stack.tsx` behavior and is not addressed here.
- Tiptap undo history and caret position reset when returning from History to edit mode (content is preserved).
- No migration. The `wiki_page_draft_holders()` RPC is unchanged.

