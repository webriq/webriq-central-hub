# 438: Share Picker — searchable multi-select with role chips, role-hides-members, and bottom-aware placement (Drive, Project Files, Notes)

**Created:** 2026-10-07
**Priority:** MEDIUM
**Type:** enhancement (UI/UX; shared component + 4 adopters)
**Recommended Tier:** balanced (one new shared component, four call-site migrations, no data/API/migration changes)
**Status:** Testing

---

## Overview

The Drive **Share** dialog (task 436) picks a recipient with two native `<select>`s: one flat list of "Everyone in …" roles and every person, one choice at a time, no search, and the browser's own dropdown that runs off the bottom of the screen (screenshot). Sharing with several people means repeating the dialog, and picking a role leaves its members in the people list.

This task replaces that with **one shared Share Picker** and moves every file/folder-sharing surface onto it:

- **Searchable** — type to filter both roles and people.
- **Multi-select** — pick any mix of roles and people; selections appear as **chips** in the field (role chips and person chips are visually distinct, each removable).
- **Roles are chips** — a row of toggle chips (navy when selected) at the top of the menu.
- **Selecting a role hides that role's members** from the people list and drops any already-picked person chips that the role now covers; deselecting the role brings them back.
- **Bottom-aware placement** — the menu measures space on the **first open**; if it would run off the bottom of the viewport it opens **upward** instead, and its height is clamped to the space available. It is portaled and `position: fixed`, so dialogs/panels with `overflow` never clip it.
- Design System v2.0 tokens, keyboard + screen-reader complete.

Adopters (user-confirmed scope): **Drive Share dialog**, **Project Files** permissions (file/folder inline panel, bulk Share popover, Access tab picker), **Notes** folder share dialog and note collaborator picker.

## Decisions & Assumptions

| # | Decision | Notes |
|---|----------|-------|
| P1 | **One permission for the whole batch** (confirmed). Pick chips → choose *Can view* / *Can edit* once → **Share**. | Matches the Notes pickers. Per-share permission stays editable in each surface's existing access list. |
| P2 | **Placement is decided once, on open** (the "first click" the user asked for) and locked for that open; coordinates are re-synced on scroll/resize so the menu stays attached, and the max-height is clamped to the chosen side. | Prefers *below*; flips *up* only when space below is too small **and** space above is larger. |
| P3 | **Selecting a role** removes already-selected people of that role (covered) and hides them from the list. Roles already shared (existing shares) are excluded from the role chips; people already shared are excluded from the list. | A person covered by an **existing** role share stays pickable (they may need *Can edit* while the role has *Can view*). |
| P4 | **Shared component lives in `src/components/share-picker/`** (used by 3 different feature areas — CLAUDE.md's "extract when shared across pages"). Call-site-specific wiring (labels, which roles exist, how a selection is committed) stays in each feature. | Role lists differ per surface (Drive: 6 roles incl. HR/Marketing; Project Files: 4; Notes folders: 4) and are passed as props — this task does **not** change who may be shared with. |
| P5 | **Project Files semantics are preserved**: there an *empty* selection means "all roles" and every change **applies immediately** (no Share button). The picker is controlled and emits `{ roles, userIds }` on each change; the adapter maps it to `allowed_roles` / `allowed_user_ids`. | Only the UI changes; no API/DB/permission-rule change. |
| P6 | **Light-only hex-token classes, no `isDark`**, matching the Drive/HR/Files neighbours. | Same as tasks 435/436. |
| P7 | **Portal + `z-[70]`** for the menu (above modals `z-50` and `ConfirmDialog` `z-[60]`). No arbitrary 999. | Comment the scale inline. |

## Requirements

### Share Picker component (`src/components/share-picker/`)
- **Field**: looks like an input (design-system form style: `#F4F6FB` bg, 10px radius, focus → white bg, `#007BFF` border, 3px `rgba(0,123,255,.14)` ring). Contains selected **chips** + a text input; clicking anywhere in the field focuses the input and opens the menu. Placeholder: "Add people or roles…" (configurable). Backspace on empty input removes the last chip.
- **Chips**: role chip = pill, navy `#071133` fill, white text, `Users` glyph; person chip = pill, `#EDF0F7` fill, `#0B1533` text, 20px initials avatar (design-system 6-color rotation, stable per person id). Each has an `×` button with `aria-label="Remove {name}"`. Chips never overflow the field (field wraps; scrolls beyond ~3 rows).
- **Menu** (portaled, fixed): white, 1px `#E2E7F2` border, 14px radius, `0 8px 24px rgba(7,17,51,.10)`.
  - **Roles** section: toggle chips (`aria-pressed`); unselected = white + `#E2E7F2` border (hover `#A8C6F5`), selected = navy. Hidden when `roles` is empty (collaborator picker) or all roles excluded.
  - **People** section: rows with avatar, name, role label (muted), and a check mark when selected; row hover `#F0F7FF`; selected people stay listed so they can be toggled off.
  - Search filters roles (by label) and people (by name **and** role label, case-insensitive). Both sections keep their headings only when non-empty.
  - Menu stays open after each pick (multi-select); closes on outside click, **Esc** (stops propagation so a parent dialog stays open), or Tab out.
  - **Empty/edge states**: no people at all → "No one else to share with."; no match → "No people match “{q}”."; every member hidden by selected roles → "Everyone in the selected roles is already included."
- **Keyboard / a11y**: `role="combobox"` input with `aria-expanded`, `aria-controls`, `aria-activedescendant`; menu `role="listbox"` `aria-multiselectable`; options `role="option"` `aria-selected`; ↑/↓ move through role chips then people, Enter/Space toggles, Home/End jump; 2px `#007BFF` focus outlines; touch targets ≥ 40px rows on mobile; colour never the only signal (chips carry text, selected rows carry a check); `prefers-reduced-motion` respected (no animation beyond 120 ms colour transitions).
- **Placement** (`use-anchored-menu.ts`): on open, measure the field rect vs `window.innerHeight`; `needed = min(menuContentHeight, 320)`; open **up** iff `spaceBelow < needed && spaceAbove > spaceBelow`; `maxHeight = clamp(chosenSpace − 12, 160, 320)`; width = field width (min 280). Re-sync `top/left/width` on scroll (capture) and resize while open; the up/down choice stays fixed for that open.
- **Props (controlled)**: `roles: {value,label}[]`, `people: {id,name,role,roleLabel?}[]`, `value: { roles: string[]; userIds: string[] }`, `onChange(value)`, `excludeRoles?`, `excludeUserIds?`, `placeholder?`, `emptyLabel?` (muted pseudo-chip shown when the selection is empty, used by Project Files: "All roles"), `disabled?`, `autoFocus?`, `aria-label`.

### Drive Share dialog (`src/app/(hub)/drive/_share-dialog.tsx`)
- Replace the two selects with `<SharePicker>` + a **Can view / Can edit** segmented control + **Share** button (disabled until ≥ 1 chip; shows "Share with 3"). One click shares the whole batch.
- Roles from `DRIVE_SHARE_ROLES` (labels: Admins, Super admins, Project managers, Developers, HR, Marketing); `excludeRoles` = roles already shared; `excludeUserIds` = already-shared users + the owner; people from `useDrivePeople()`.
- `useDriveShares.add` becomes `addMany(selection, permission)` — issues the existing `POST /api/drive/shares` per target (bounded concurrency 4), applies results to the list, reports **partial failures inline** ("2 of 5 couldn't be shared — try again"), and keeps failed chips selected so the user can retry. (Each POST triggers task 437's notifications — unchanged.)
- The access list below keeps its behaviour; role rows show the same navy role chip, person rows the avatar, for visual consistency. Dialog layout must not clip the menu (menu is portaled).

### Project Files permissions (`projects/v2/[projectId]/onboarding-workspace/_permission-picker.tsx`)
- `PermissionFields` (used by `PermissionPicker` popover and `InlinePermissionsPanel`) renders `<SharePicker>` instead of the role-toggle row + inline search: `roles = ASSET_ROLE_OPTIONS`, `people = staffDirectory`, `emptyLabel="All roles"`, every change calls the existing `onChange({ allowed_roles, allowed_user_ids })` immediately. `permissionSummary()` is unchanged (tile badges depend on it).
- The floating `PermissionPicker` popover (Access tab rows, bulk "Share" in `_bulk-toolbar.tsx`) uses `use-anchored-menu` so **it also flips upward** near the bottom instead of the current `absolute mt-1.5 right-0`.
- No change to who can see/edit (`allowed_roles` / `allowed_user_ids` semantics, `canAccessAsset`).

### Notes (`projects/_shared/_notes/`)
- `_note-folder-share-dialog.tsx`: replace the "Add roles" checkbox grid + "Add people" checklist with `<SharePicker>` + permission select + **Share (n)**; keep the Private/Public control, the existing-shares list and the confirm-public dialog untouched. `excludeRoles = sharedRoles`, `excludeUserIds = sharedUserIds + current user`.
- `_note-collaborator-picker.tsx`: replace the search + checklist + select-all with `<SharePicker roles={[]}>` (people only) inside the existing popover, keeping its permission select and Share (n) action and its upward `bottom-full` popover. "Select all" is dropped (chips + search cover it); the author stays excluded.
- File length: both files shrink (275 → ≲ 200, 205 → ≲ 150).

### Cross-cutting
- Design System v2.0 only (tokens above; Space Grotesk never inside chips/rows; no side stripes; no nested cards; no gradient/glass).
- Sentence-case microcopy; errors state problem + fix, no apology.
- Follow `nextjs-file-length-best-practices.md` (budgets below).

## Out of Scope / Must-Not-Change

- No API, database, RLS or migration changes; no change to share/permission **semantics** in any surface (Drive levels, Project Files `allowed_*`, Notes shares).
- Do not add roles to a surface's role list (Project Files stays 4 roles; Notes 4) — only the UI changes.
- No new batch API endpoint for Drive (client-side loop over the existing `POST`).
- No avatar images (initials only), no recent-people ranking, no invite-by-email.
- Do not touch the Drive/Project Files/Notes **access lists** beyond visual consistency of role/person labels in the Drive dialog.
- No git commands.

## Proposed File Changes

### New — `src/components/share-picker/`
| File | Purpose | Budget |
|------|---------|--------|
| `types.ts` | `SharePerson`, `ShareRoleOption`, `ShareSelection`, props types | ≤ 40 |
| `share-picker-logic.ts` | Pure functions: `filterRoles`, `filterPeople` (hides people in selected roles / excluded ids / by query), `toggleRole` (drops covered user chips), `toggleUser`, `selectionCount` | ≤ 90 |
| `use-anchored-menu.ts` | Open/close, outside-click, Esc, first-open flip decision, fixed coords + max-height, scroll/resize sync | ≤ 100 |
| `share-chips.tsx` | `RoleChip`, `PersonChip`, `PersonAvatar` (+ 6-color rotation helper) | ≤ 90 |
| `share-picker-menu.tsx` | Menu body: role toggle chips + people rows + empty states, keyboard option ids | ≤ 160 |
| `share-picker.tsx` | Controlled combobox: field, chips, input, keyboard model, portal host | ≤ 230 |
| `index.ts` | Barrel (`SharePicker`, `PersonAvatar`, `RoleChip`, types, logic) | ≤ 10 |

### Modified
| File | Change |
|------|--------|
| `src/app/(hub)/drive/_share-dialog.tsx` | Use `<SharePicker>`, permission segmented control, batch Share; consistent chips in the access list |
| `src/app/(hub)/drive/_use-drive-shares.ts` | `add` → `addMany(selection, permission)` with concurrency 4 + partial-failure result |
| `src/app/(hub)/projects/v2/[projectId]/onboarding-workspace/_permission-picker.tsx` | `PermissionFields` → `<SharePicker>`; `PermissionPicker` popover uses `use-anchored-menu` |
| `src/app/(hub)/projects/_shared/_notes/_note-folder-share-dialog.tsx` | Replace roles grid + people list with `<SharePicker>` |
| `src/app/(hub)/projects/_shared/_notes/_note-collaborator-picker.tsx` | Replace search + checklist with `<SharePicker roles={[]}>` |
| `CLAUDE.md` | Convention bullet: shared Share Picker, its rules (role hides members, flip-on-open, portal z-70), adopters, no semantic changes; add `components/share-picker/` to Project Structure |
| `_docs/task/436-…`, `_docs/task/437-…` | One-line pointer to 438 |

### Verification helper (no test runner exists)
- `_docs/task/438-share-picker-logic.check.ts` — runs the pure logic with `npx tsx` (assertions below), precedent: task 434's dry-run script.

## Code Context

- **Today's Drive dialog** — `src/app/(hub)/drive/_share-dialog.tsx` (113 lines): `select` (roles via `optgroup` "Everyone in …" + people), `PermissionSelect`, `useDriveShares({ shares, add(grantee, permission), setPermission, remove })` in `_use-drive-shares.ts`; shares POST to `/api/drive/shares` one grantee at a time (`{ folderId|fileId, userId|role, permission }`).
- **Project Files picker** — `_permission-picker.tsx` (166 lines): `permissionSummary()`, `PermissionFields` (role pill toggles from `ASSET_ROLE_OPTIONS` + removable person chips + "Search people to share with…" input with an inline result list), `PermissionPicker` (absolute popover `w-72 right-0 mt-1.5`, `z-30`), `InlinePermissionsPanel`. Consumers: `_file-tile.tsx:184`, `_folder-tile.tsx:109` (inline), `_bulk-toolbar.tsx:91`, `_access-tab.tsx:122` (popover). Semantics: empty `allowed_roles` + empty `allowed_user_ids` = visible to all roles; `onChange` applies immediately.
- **Notes** — `_note-folder-share-dialog.tsx` (275 lines): checkbox grid for roles (`ROLE_OPTIONS` pm/developer/admin/super_admin), searchable checkbox list for people, `batchPermission` select, `Share (n)`; `_note-collaborator-picker.tsx` (205 lines): popover `absolute bottom-full left-0 mb-2 z-40`, same pattern for people only. Both take `allMembers: { id, full_name, avatar_url, role }[]`.
- **Types to adapt**: `StaffPerson { id, full_name, role }` (`_wizard-v2-types.ts`), `DrivePerson { id, full_name, role }` (`lib/drive/types.ts`), notes `allMembers`.
- **Design tokens**: `_final_design/guide/central-hub-design-system.md` — form focus ring, navy = selection, avatar 6-colour rotation `#0063D6 #6A48E0 #0B8A93 #B85512 #177E48 #44508A`, popover shadow `0 8px 24px rgba(7,17,51,.10)`, `--z-popover: 40` (modals here sit at `z-50`, so the picker uses `z-[70]`).
- **Libraries**: `@base-ui/react` is installed but the codebase's popovers are hand-rolled (`ActionsMenu` computes `position: fixed` from the trigger rect + `clampMenuPosition`); follow that hand-rolled pattern rather than introduce a new popover dependency.
- **Existing clamp precedent**: `projects/v2/.../_file-actions-menu.tsx` `clampMenuPosition()` clamps to the viewport but never flips — this task adds the flip logic only inside the new hook (does **not** modify that file).

## Design Brief (follow `_final_design/guide/` — run `/anthropic-skills:frontend-design` and `/impeccable:impeccable` (shape/craft) before writing UI)

**Register / strategy:** Product UI, **Restrained**. This is a familiar multi-select combobox (think Linear's assignee picker, Google Drive's share field); the tool should disappear into the task. Anchors: Google Drive share field, Linear assignee/label pickers, the Hub's own Files tab filter pills.
**Scene sentence:** A PM in the middle of a meeting wraps up, types two names and clicks "Developers", sets *Can view*, and shares — without scrolling a 40-name list.
**Colour meaning:** navy = selected role (selection is navy across the Hub); blue = focus ring, links, the **Share** confirm button (blue per "confirm/navigate"; there is **no orange CTA** in this dialog — the page's single orange CTA is the Drive toolbar's Upload files); neutral `#EDF0F7` = person chips; `#F0F7FF` = row hover; `--late` only for the partial-failure message.
**Type:** Inter 13px for rows/chips (chips 11–12px/600); names never in Space Grotesk; dialog title keeps the Drive dialog's existing Space Grotesk 15px. Role label under people rows 11px muted.
**Layout:** field (min-height 44px, wraps) → menu below/above. In the Drive dialog: `[ picker field — flex-1 ] [ Can view | Can edit ]  [ Share with n ]` collapses to two rows < 480px. Menu width = field width.
**Motion:** colour/border transitions 160 ms `cubic-bezier(.22,1,.36,1)`; no menu entrance animation; reduced-motion safe.
**Content:** placeholder "Add people or roles…" (Project Files: "Add people or roles…" with the "All roles" pseudo-chip when empty); button "Share with 3" / "Share"; empty states per Requirements; failure "2 of 5 couldn't be shared — try again."
**Mobile:** menu is the field's width and ≤ 60vh; rows ≥ 40px; chips wrap.

## File Budget (per `nextjs-file-length-best-practices.md`)

Components 100–250 (soft 300), hooks 30–100 (hard 150), pure logic ≤ 90, no function > 75 lines. Adopted files must **not grow** — `_note-folder-share-dialog.tsx` and `_note-collaborator-picker.tsx` should shrink; `_permission-picker.tsx` stays ≲ 170.

## Implementation Steps

1. **Run the design skills** (frontend-design + impeccable shape/craft) against the Design Brief; confirm the chip/menu visuals before building.
2. Write `types.ts` + `share-picker-logic.ts`; write `_docs/task/438-share-picker-logic.check.ts` and get it green (`npx tsx`).
3. Write `use-anchored-menu.ts` (portal host, outside click/Esc, first-open flip, scroll/resize sync).
4. Write `share-chips.tsx`, `share-picker-menu.tsx`, `share-picker.tsx`, `index.ts`.
5. Migrate **Drive** (`_share-dialog.tsx`, `_use-drive-shares.ts`).
6. Migrate **Project Files** (`PermissionFields`, `PermissionPicker` popover flip) — check all four consumers.
7. Migrate **Notes** (folder share dialog, collaborator picker).
8. CLAUDE.md + pointers; `tsc`, `lint`, file-length audit, hex/style audit.
9. Browser acceptance (below).

## Acceptance Criteria

**Picker behaviour**
- Typing filters roles and people live; matching by name or role label, case-insensitive; headings hide when a section is empty.
- Multi-select works for any mix of roles and people; chips appear in the field, each removable by its `×` and (last chip) by Backspace on empty input.
- Selecting a role chip: its members disappear from the People list and any already-picked members are removed from the chips; deselecting restores them (not re-picked).
- Roles/people already shared (or excluded by the caller) never appear as options.
- The menu stays open while picking; Esc closes **only** the menu (a parent dialog stays open); outside click closes it.
- **Placement:** with the field near the bottom of the viewport (e.g. a short window, or the dialog scrolled low), the first open places the menu **above** the field and clamps its height so nothing is cut off; with room below it opens below. The choice does not flip while open; the menu follows the field on scroll/resize. Works inside the Drive dialog, the Notes dialog/popover, and the Project Files inline panel/popover without being clipped by `overflow`.

**Surfaces**
- **Drive:** share to 3 people + 2 roles in one action → one POST per target, list updates, "Share with 5" → batch permission applied; a forced failure of one target shows the inline partial-failure message and keeps only the failed chips selected; notifications from task 437 still fire per share.
- **Project Files:** file tile / folder tile inline panel, bulk Share popover and Access tab popover all use the new picker; empty selection shows the "All roles" pseudo-chip and means unrestricted exactly as before; every toggle applies immediately; tile `permissionSummary` badges unchanged; the popover flips up near the bottom.
- **Notes:** folder share dialog and collaborator picker use the picker (collaborator picker people-only); Private/Public control, existing-shares list, confirm-public flow, author exclusion all unchanged.

**A11y & design**
- Combobox/listbox ARIA complete; fully keyboard-operable (↑ ↓ Home End Enter Space Esc Backspace); visible 2px `#007BFF` focus; chips carry text; rows ≥ 40px touch height.
- Tokens only (no off-palette hex beyond the avatar rotation + existing Files-tab tints), no `dark:`, no `style={{}}` except computed fixed coordinates/max-height (commented), no side stripes, exactly the colour roles in the brief.
- No file over budget; `npx tsc --noEmit` and `pnpm lint` clean; no behavioural change to any share/permission rule (spot-check: Drive levels, `canAccessAsset`, Notes shares).

## Verification

```bash
npx tsc --noEmit
pnpm lint

# Pure logic checks (role hides members, covered chips dropped, exclusions, search)
npx tsx _docs/task/438-share-picker-logic.check.ts

# File-length audit — new component folder + adopters
wc -l src/components/share-picker/*.ts* \
  "src/app/(hub)/drive/_share-dialog.tsx" "src/app/(hub)/drive/_use-drive-shares.ts" \
  "src/app/(hub)/projects/v2/[projectId]/onboarding-workspace/_permission-picker.tsx" \
  "src/app/(hub)/projects/_shared/_notes/_note-folder-share-dialog.tsx" \
  "src/app/(hub)/projects/_shared/_notes/_note-collaborator-picker.tsx"

# Style audit (expect only the commented computed-position style in the menu)
grep -rn "style={{\|dark:" src/components/share-picker
grep -rnoh '#[0-9A-Fa-f]\{6\}' src/components/share-picker | sort -u
```

Browser acceptance (Claude in Chrome / manual, two accounts for Drive): the placement matrix (menu near bottom of a short window → opens up; plenty of space → opens down; inside Drive dialog, Notes dialog, Notes collaborator popover, Project Files tile panel, bulk Share, Access tab), keyboard-only pass, role-hides-members, partial-failure path, 375 px width.

## Compatibility Touchpoints

- `StaffPerson`/`DrivePerson`/notes `allMembers` are adapted at each call site (no type changes to those modules).
- `permissionSummary()` and every `onChange({ allowed_roles, allowed_user_ids })` contract in Project Files stay identical — the Access tab, bulk toolbar and tiles keep working unmodified except for the picker swap.
- CLAUDE.md "Do Not": no `style={{}}` except computed values (fixed coordinates/max-height — commented), Tailwind scale classes preferred.
- `@base-ui/react` is **not** introduced for this component (hand-rolled pattern, like `ActionsMenu`).

## Open Questions for Review

None outstanding — scope (Drive + Project Files + Notes) and batch-permission model were confirmed with the user.

## Implementation Notes

### What Changed
- **New shared `SharePicker`** (`src/components/share-picker/`): searchable, multi-select combobox; role toggle chips (navy when selected) + people rows with initials avatars; selected items as removable chips in the field; selecting a role hides its members and drops covered person chips; keyboard model (↑↓ Enter Backspace Esc Tab) with combobox/listbox ARIA; empty states; `emptyLabel` pseudo-chip for Project Files' "All roles".
- **Bottom-aware placement** (`use-anchored-menu.ts`): portaled + `position: fixed`; invisible first render → side chosen once per open from the menu's real height → opens upward only when it doesn't fit below and there's more room above; max-height clamped; follows scroll/resize; Esc closes only the menu; nested-menu aware.
- **Adopters:** Drive Share dialog (batch share at one permission, partial-failure handling, role/person chips in the access list, segmented Can view/Can edit); Project Files `PermissionFields` (all of file/folder inline panel, bulk Share and Access tab) + the `PermissionPicker` popover now portaled and flips upward; Notes folder-share dialog and note collaborator picker.
- Tests: pure logic assertions in `_docs/task/438-share-picker-logic.check.ts`.

### Files Changed
- `src/components/share-picker/{types,share-picker-logic,use-anchored-menu,share-chips,share-picker-menu,share-picker}.ts(x)`, `index.ts` - new
- `_docs/task/438-share-picker-logic.check.ts` - new
- `src/app/(hub)/drive/_share-dialog.tsx`, `_use-drive-shares.ts` - SharePicker + `addMany`
- `src/app/(hub)/projects/v2/[projectId]/onboarding-workspace/_permission-picker.tsx` - SharePicker + anchored popover
- `src/app/(hub)/projects/_shared/_notes/_note-folder-share-dialog.tsx`, `_note-collaborator-picker.tsx` - SharePicker
- `src/app/(hub)/projects/_shared/_notes/_note-editor-modal.tsx` - dropped the now-unused `currentUserId` prop passed to the collaborator picker
- `CLAUDE.md`, `_docs/task/436-…`, `_docs/task/437-…`, `TASKS.md`

### Deviations From Plan
- **Placement is decided from the menu's measured content height** (invisible first render, then lock), not an estimated constant — more accurate for short lists; same "decide once on open" behaviour.
- **Hook gained `width`/`align` options and a `NESTED_MENU` marker** (not in the plan) so the Project Files popover can reuse it and keep its right-aligned 288px shape, and so clicks/Esc in a nested picker menu don't close the outer popover.
- **Drive access list** shows role chip / avatar instead of plain text (planned as "consistent chips").
- **`currentUserId` prop removed** from `NoteCollaboratorPicker` (it only fed an opacity tweak that no longer exists), with its single caller updated.
- "Select all (matching)" in the collaborator picker was dropped (planned) — chips + search replace it.
- Colours: avatar rotation + `#5EB0FF` (design-system sidebar-active icon) on the role chip glyph + the Files-tab tint `#C7D2E8` for hover/border.

### Verification Run
- `npx tsc --noEmit` - PASS (0 errors)
- `npx eslint` (share-picker, drive, notes, permission picker) - PASS (0 errors/warnings in changed files)
- `npx tsx _docs/task/438-share-picker-logic.check.ts` - PASS (9 rule groups: role hides members, covered chips dropped, restore on deselect, exclusions, search, counts)
- File-length audit - PASS (largest new file `share-picker.tsx` 137 lines; adopters: Notes folder dialog 275→207, collaborator picker 205→139, `_permission-picker.tsx` 166→130)
- Style audit - PASS (`style=` only for the computed fixed position/max-height, commented; no `dark:`)
- **Live browser check (Drive, signed-in Chrome, dev server):** Share dialog renders the new field; menu lists roles + people; picking Developers makes the chip navy/checked and removes developer members from the list; typing "mar" filters roles + people; with the dialog pushed to the bottom of the viewport the first open placed the menu **above** the field (field 610–654 of 843 px, menu bottom 604) with a 320 px clamp, and with room below it opened **down**. Nothing was actually shared (no notifications sent).
- **NOT RUN:** the Project Files surfaces (file/folder panel, bulk Share, Access tab popover), the Notes dialog and collaborator popover in a browser; keyboard-only and 375 px passes; a real multi-recipient Drive share incl. forced partial failure.

## Quality Gate Notes

### Result
PASS

### Standards Review
- Reviewed every file in Implementation Notes against the checklist; no blocking issues. No `any`, dead or commented-out code, debug logging or secrets; every async path (shares, loads) reports failures to the user or logs them.
- **Fixed during this gate (minor):**
  - `share-picker.tsx` parsed option ids back out of strings (`id.startsWith(...)`/`slice(...)`) to decide what to toggle → now keeps an `options` array of `{ id, kind, key }` and looks the option up, which also removes the id-prefix coupling between the picker and the menu.
  - A 250-character inline `onMouseDown` handler on the field → extracted to a named `focusField` function with a comment.
  - A convoluted placeholder ternary → `empty ? placeholder : "Add more…"` (same behaviour).
  - Unused exports trimmed: `initialsOf` is no longer exported; `PersonChip` removed from the barrel (still used internally).
- Responsibilities are clean: pure rules (`share-picker-logic.ts`), placement/dismissal (`use-anchored-menu.ts`), presentation (`share-chips.tsx`, `share-picker-menu.tsx`), orchestration (`share-picker.tsx`, 147 lines). Adopters shrank or stayed flat (Notes folder dialog 275→207, collaborator picker 205→139, `_permission-picker.tsx` 166→130).
- Re-verified after the fixes: `npx tsc --noEmit` and `npx eslint` (share-picker, drive) clean; `npx tsx _docs/task/438-share-picker-logic.check.ts` passes.
- **Live keyboard check (Drive Share dialog, real key events):** ↓ highlights options in order (3×↓ → "Project managers"), Enter adds the chip and keeps the menu open, Backspace on the empty input removes the last chip, Esc closes only the menu while the dialog stays open. (An earlier synthetic-event probe read `null` — a test-harness artifact, not an app bug; real key presses behave correctly.)

### Deviations
- **Minor** — menu side chosen from the measured content height (invisible first render) instead of an estimate; still decided once per open.
- **Minor** — placement hook gained `width`/`align` options and a `NESTED_MENU` marker so the Project Files popover reuses it and nested menus don't close the outer panel.
- **Minor** — unused `currentUserId` prop removed from `NoteCollaboratorPicker` (one caller updated); "Select all (matching)" dropped as planned.
- No Major deviations: no API/DB/permission-semantics change, Project Files/Notes/Drive rules untouched, scope matches the user-confirmed adopters.

### Required Fixes
- None. (Still to cover in the test stage: Project Files surfaces and Notes in a browser, 375 px layout, a real multi-recipient Drive share with a forced partial failure.)

### Follow-up (user-reported): inactive users hidden, real profile avatars
- **Bug/ask:** deactivated users (e.g. April Grace Trocio) still appeared in the people list, and avatars were always initials.
- **Inactive:** there is no `profiles.is_active`; deactivation (task 378) bans the auth user and sets `hub_users.status = 'inactive'`. `/api/drive/people` and `/api/staff-directory` now include an `inactive` flag from `getInactiveHubUserIds()` (flagged, not dropped, so existing shares / "Shared by" labels / Project Files chips still resolve names). `SharePerson.inactive` makes `filterPeople` and `allCoveredByRoles` ignore them. Notes needed no change — `allMembers` comes from `getAssignableMembers()`, which already excludes inactive users.
- **Avatars:** `profiles.avatar_url` is now selected by both APIs and passed as `SharePerson.avatarUrl`; `PersonAvatar` renders the photo (`<img>`, `object-cover`) and falls back to the initials circle when the URL is missing or fails to load. Applied in the menu rows, field chips, Drive access list, and the Project Files / Notes adapters.
- **Files:** `types.ts`, `share-picker-logic.ts`, `share-chips.tsx`, `share-picker-menu.tsx`, `share-picker.tsx`, `lib/drive/types.ts`, `api/drive/people/route.ts`, `api/staff-directory/route.ts`, `_wizard-v2-types.ts` (`StaffPerson`), Drive `_share-dialog.tsx`, `_permission-picker.tsx`, both Notes pickers, `_docs/task/438-share-picker-logic.check.ts` (+5 inactive assertions), CLAUDE.md.
- **Verified:** `tsc` + `eslint` clean; logic script passes; live in Chrome — `/api/drive/people` returned 32 staff / 3 inactive (incl. April Grace Trocio) / 22 with photos; the picker listed 28 people (29 active minus the viewer), **0 inactive leaked**, 18 rows with real Supabase-hosted photos and the rest (no `avatar_url`, e.g. Brandon Dwite Cobacha) on the initials fallback. Not yet browser-checked: Project Files and Notes pickers.
