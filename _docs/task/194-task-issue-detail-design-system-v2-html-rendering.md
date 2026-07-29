# 194: Task & Issue Detail Pages — Design System v2.0 Redesign + Proper HTML Title/Description Rendering

**Created:** 2026-07-28
**Priority:** HIGH
**Type:** enhancement
**Recommended Tier:** balanced
**Status:** Planned

---

## Overview

`/v2/projects/[projectId]/tasks/[taskId]` (`_task-detail.tsx`) and `/v2/projects/[projectId]/issues/[issueId]` (`_issue-detail.tsx`) — both shipped by task 193's route restructure — were built as functional MVPs using a generic `slate-*` Tailwind palette (`Card`/`Meta` helpers, `rounded-xl border-slate-200`, `bg-slate-50`, `bg-slate-900` buttons). Task 193's own doc flags this explicitly as deferred: *"No redesign of MilestonePanel's visual style… A full … restyle is a separate, not-requested task."* The same generic pattern was copy-pasted into the Task and Issue detail files too — this task is that follow-up, scoped to Task and Issue (not Milestone, see Out of Scope).

Sibling files in the same directory (`_list-view.tsx`, `_board-view.tsx`, `_calendar-view.tsx`, `_issue-list-view.tsx`, `_issue-board-view.tsx`, `_issue-calendar-view.tsx`, `_project-detail.tsx`) were already retoned to Design System v2.0 by tasks 191/192 — hex tokens (`#0B1533`, `#5F6A88`, `#E2E7F2`, `#007BFF`, `#FB914E`…), `font-heading`/`font-mono` utility classes, pill-radius buttons, Forms-spec inputs (`bg-[#F4F6FB]` rest → `focus:bg-white focus:border-[#007BFF] focus:ring-[3px] focus:ring-[#007BFF]/[0.14]`). Those files are the concrete precedent to copy from — **do not invent new tokens**, reuse what's already shipped in this directory.

**Second, separate defect on the same two pages (and their listing/board/calendar views):** data imported from Zoho carries literal HTML in two different ways that the UI currently shows verbatim instead of rendering:
1. **Titles** are plain text but contain literal HTML-entity-encoded characters (e.g. a task title stored as the 24-character string `Bug Fixes &amp; Support` instead of `Bug Fixes & Support`, or `Onboarding &amp; Briefing`) — Zoho's export encoded `&` as `&amp;` and it was imported as-is rather than decoded. React does not decode entities in interpolated JSX text (only real HTML parsing does), so every screen showing `{task.title}` / `{issue.title}` literally prints `&amp;` to the user (see screenshot 3 — "Onboarding &amp; Briefing" in the tasklist row).
2. **Descriptions** are full HTML fragments (`<div>Troubleshoot and resolve issues quickly.<br /></div>`, or nested `<div dir="ltr"><a target="_blank" href="...">...</a></div>` for issues) — the current detail pages dump this string into a plain `<textarea>`, so the user reads raw markup instead of formatted text/links (screenshots 1 & 2).

## Requirements

### A. Title — decode HTML entities everywhere a title/name renders as plain text

- [ ] Add `decodeHtmlEntities(input: string): string` to `_pm-shared.tsx` — pure string transform (regex-based: numeric entities `&#NNN;`/`&#xHEX;` via `String.fromCodePoint`, plus a small named-entity lookup covering at minimum `amp lt gt quot apos nbsp hellip mdash ndash lsquo rsquo ldquo rdquo`). Must **not** use `DOMParser`/`document` — this module is imported by client components that Next.js server-renders on first paint, so it needs to run in Node with no DOM.
- [ ] Apply it at every remaining raw `{task.title}` / `{issue.title}` display site that isn't already going through an editable field:
  - `_list-view.tsx:613`, `_board-view.tsx:181`, `_calendar-view.tsx:124` (task title cells/cards)
  - `_issue-list-view.tsx:354`, `_issue-board-view.tsx:156`, `_issue-calendar-view.tsx:110` (issue title cells/cards)
  - `_milestone-detail.tsx:182` (linked-tasks list inside the Milestone detail's "Tasks" card renders `{t.title}` too — one-line fix, in scope even though the rest of that file's redesign is not, see Out of Scope)
- [ ] In `_task-detail.tsx` / `_issue-detail.tsx`, initialize the editable title `useState` from the **decoded** value (`useState(() => decodeHtmlEntities(task.title))` / `…(issue.title)`) rather than the raw DB string — this both fixes the header display and means the next time a PM edits and blurs the title field, `saveTitle` persists the clean decoded text back to the DB (organic data cleanup, no migration needed).
- [ ] Sort comparators (`a.title.localeCompare(b.title)` in `_list-view.tsx`/`_issue-board-view.tsx`) are **not** in scope — comparing encoded vs. decoded strings produces a materially identical order for the entities involved; changing it is unrelated churn.

### B. Description — render Zoho HTML properly, keep it editable

- [ ] Add a shared `DescriptionField` component to `_pm-shared.tsx` (this file is already the established shared module for this exact subtree per task 191's blast-radius note) built on the already-installed Tiptap stack (`@tiptap/react`, `@tiptap/starter-kit`, `@tiptap/extension-underline` — all in `package.json`, no new dependency needed). Model it on `_onboarding-wizard.tsx`'s `RichTextField` (`src/app/v2/(hub)/portfolio-tracker/[projectId]/_onboarding-wizard.tsx:2991-3085`) but **do not import across feature directories** — copy the shape into `_pm-shared.tsx` and retone it to this directory's Forms tokens (that file's version is always `bg-white`; this one should rest on `bg-[#F4F6FB]` and go `bg-white` + blue border/ring on focus-within, matching every other input in this subtree).
  - Props: `value: string` (HTML), `onSave: (html: string) => void`.
  - `useEditor({ extensions: [StarterKit], content: value, immediatelyRender: false, onBlur: ({ editor }) => onSave(editor.getHTML()) })` — mirrors the existing "edit locally, persist `onBlur`" convention already used for every other field on these two pages (`saveTitle`/`saveDescription` etc.), so no new autosave/debounce mechanism is introduced.
  - Toolbar: Bold/Italic/Underline/Bullet list, same as the onboarding one — reasonable minimum for both Zoho-imported content (mostly plain paragraphs/links/line breaks) and future manually-typed descriptions.
  - No sanitization library needed: ProseMirror (Tiptap's engine) parses the incoming HTML string into its own document schema on `content: value` — any tag/attribute not part of the configured schema (e.g. `<script>`, inline event handlers) is dropped during that parse, not preserved. This is different from `dangerouslySetInnerHTML`, which would render the string as-is with no such filtering — do not use `dangerouslySetInnerHTML` here.
- [ ] In `_task-detail.tsx`, replace the description `<textarea>` (currently `Card title="Description"` block around line 239-248) with `<DescriptionField value={description} onSave={(html) => saveField({ description: html || null })} />`. Same for `_issue-detail.tsx` (around line 169-178).
- [ ] Links inside rendered descriptions (e.g. the issue's `builderonline.com` product links) must open in a new tab — StarterKit's default Link handling / the editor's read rendering should carry `target="_blank" rel="noreferrer"` through; confirm at implementation time whether StarterKit needs an explicit `Link` extension config for `openOnClick`/target, since plain StarterKit does not include `@tiptap/extension-link` by default and a raw `<a href>` inside pasted/imported HTML may need that extension added to preserve clickability (currently in `package.json`? check — if not installed, `pnpm add @tiptap/extension-link` is a reasonable, narrowly-scoped addition since it's the direct Tiptap-family package needed to keep imported hyperlinks clickable, not a new UI library).

### C. `_task-detail.tsx` — v2.0 tokens (mirrors task 191's `_project-detail.tsx` treatment)

- [ ] Back link (`:197-202`): `text-slate-500 hover:text-slate-700` → `text-[#5F6A88] hover:text-[#0B1533]`.
- [ ] Header wrapper (`:196`): `border-slate-100` → `border-[#E2E7F2]`; content area (`:232`) `bg-slate-50` → `bg-[#F4F6FB]`.
- [ ] `TASK · {display_id}` chip (`:207-209`): `font-mono text-slate-400 bg-slate-100 rounded` → `font-mono text-[#5F6A88] bg-[#EDF0F7] rounded-[5px]` (Chips spec: neutral chip = `--line-soft` bg / `--muted` text, 5px radius).
- [ ] Title textarea (`:213-219`): `text-slate-900` → `text-[#0B1533]`; add `font-heading` (Page title spec: Space Grotesk 700, this is the page's title-equivalent element); `focus:bg-slate-50` → `focus:bg-[#F4F6FB]`.
- [ ] Delete button (`:221-227`): `text-slate-400 hover:text-red-600 hover:bg-red-50` → `text-[#5F6A88] hover:text-[#C0392B] hover:bg-[#FDE8E6]` (`--late`/`--late-bg`), `rounded-lg` → `rounded-full` (icon buttons in this subtree are pill-shaped, e.g. `_issue-list-view.tsx`'s bulk-trash button).
- [ ] `Card` helper (`:22-44`): panel wrapper `rounded-xl border-slate-200` → `rounded-[14px] border-[#E2E7F2]` + add `shadow-[0_1px_2px_rgba(7,17,51,0.05)]` (`--sh-sm`, Panels spec: "border + soft shadow together on every raised surface"); head `border-slate-100` → `border-[#EDF0F7]`, padding `px-5 py-3` → `px-[18px] py-3.5` (Panels spec: "14px 18px padding"); title `text-[11px] font-semibold text-slate-500 uppercase tracking-wider` → `font-heading text-[15px] font-semibold text-[#0B1533]` (Panel title spec: Space Grotesk 600/15px, sentence case — **not** the small-caps label treatment, that's reserved for table headers); count badge `font-mono text-slate-400` → `font-mono text-[#5F6A88]`.
- [ ] `Meta` helper (`:46-53`): label `text-slate-600` → per Forms spec "Labels 11px/600 `--ink`": `text-[11px] font-semibold text-[#0B1533]` (currently `text-[12px] font-medium`).
- [ ] Description/Labels/Subtasks inputs (`:246,266-271,271-272,326-331`) and sidebar Details `<select>`/`<input>` (`:355-448`): all `rounded-lg border-slate-200 … focus:border-slate-400` → the Forms-spec class already established at `_project-detail.tsx:854` (`inputClass`): `rounded-[10px] border-[#E2E7F2] bg-[#F4F6FB] text-[#3A4565] focus:border-[#007BFF] focus:bg-white focus:ring-[3px] focus:ring-[#007BFF]/[0.14]`, keeping this page's existing smaller `px-2.5 py-1.5`/`text-[12px]` sizing for the sidebar fields (only the Description/Labels/Subtasks fields in the main column use the fuller `px-3 py-2`/`text-[13px]` size, matching their current sizing).
- [ ] Priority `<select>` inline `style={{ color: ps.text }}` stays (already token-driven via `PRIORITY_STYLE`) — just retone the surrounding classes as above.
- [ ] Add-label / add-subtask "+" buttons (`:273-279`, `:333-343`): `bg-slate-900 hover:bg-slate-800 rounded-lg` → ghost icon-button treatment matching `_board-view.tsx:141` (`p-1 rounded-md text-[#5F6A88] hover:text-[#0B1533] hover:bg-[#EDF0F7]`) sized to `p-2` to match the existing hit-area.
- [ ] Subtask row checkbox/label/delete (`:296-320`): `text-green-600` (done check) → `text-[#177E48]` (`--ok`); `text-slate-300`/`text-slate-400`/`hover:bg-slate-50` → `text-[#C7CEDD]`/`text-[#5F6A88]`/`hover:bg-[#F4F6FB]`; subtask delete hover `hover:text-red-500` → `hover:text-[#C0392B]`.
- [ ] GitHub PR / Preview links (`:463-482`): `text-violet-600`/`text-blue-600` → keep as distinct link colors but move to token equivalents: PR link `text-[#6A48E0]` (nearest existing purple token, Publish-phase hue reused here only as a link accent, not a phase label, matching "violet = Publish" caution — actually per DESIGN.md §7 "No phase hue reused for non-phase meaning": **do not** reuse `#6A48E0`; use `--blue-700` (`#0063D6`) for both PR and Preview links instead, differentiated only by icon, not color).

### D. `_issue-detail.tsx` — same treatment, issue-specific fields

- [ ] Same back-link/header/content-area/chip/title/delete-button/Card/Meta retoning as Requirement C (this file duplicates the same `Card`/`Meta` helpers and generic slate classes at the equivalent line numbers: `:21-38`, `:40-47`, `:117-161`, `:164-253`).
- [ ] `ISSUE · {display_id ?? prefix ?? id}` chip (`:130-132`): same neutral-chip retone as the Task page's `TASK ·` chip.
- [ ] Status/Severity/Assignee/Due date selects in the Details panel (`:186-245`): same Forms-spec input retone as Requirement C.
- [ ] Severity `<select>` inline `style={{ color: sv.text }}` stays (already `SEVERITY_STYLE`-driven).

## Out of Scope / Must-Not-Change

- **`_milestone-detail.tsx`'s own visual redesign.** It shares the identical generic `Card`/`Meta`/slate pattern (task 193 built all three detail pages the same way) but the user's request names only the Task and Issue detail pages. Only the one-line `{t.title}` entity-decode fix inside it (Requirement A) is in scope; leave every other class in that file untouched. Flagging as a natural follow-up task, not doing it here.
- **`_milestone-panel.tsx` restyle** — task 193 explicitly deferred this ("still the older slate-palette table… A full MilestonePanel restyle is a separate, not-requested task"); this task does not touch it either.
- **`_task-drawer.tsx`** — confirmed via grep to be unused/unimported anywhere in `src/` (dead code left over from before task 188/190's routing change, already flagged by task 191's own doc). Do not edit or delete it as part of this task.
- **No `dangerouslySetInnerHTML` / DOMPurify / new sanitization dependency.** Tiptap's ProseMirror-based parsing already constrains imported HTML to the editor's configured schema (Requirement B) — sufficient for this data (Hub-internal Zoho import + PM/dev editing, not arbitrary public user input). Do not add `isomorphic-dompurify` or similar.
- **No backend/API changes.** `PATCH /api/v2/tasks/[taskId]`, `PATCH /api/v2/issues/[issueId]` already accept `description`/`title` as plain strings; sending decoded/HTML strings through the existing endpoints requires no route changes.
- **No change to `title`/`description` sort or filter logic**, and no data migration/backfill of existing encoded titles in the database — decoding is display+edit-time only (see Requirement A's note on organic cleanup via re-save).
- **Board/Calendar/List views for Tasks and Issues keep their current v2.0 styling** (already done by tasks 191/192) — this task only touches the one-line title-decode call inside each, not their broader layout/classes.

## Proposed File Changes

| File | Action | Purpose |
|------|--------|---------|
| `src/app/v2/(hub)/projects/_pm-shared.tsx` | Modify | Add `decodeHtmlEntities()` and `DescriptionField` (Tiptap-based) shared helpers |
| `src/app/v2/(hub)/projects/[projectId]/tasks/[taskId]/_task-detail.tsx` | Modify | Full v2.0 token retone (Requirement C) + decode title + swap description textarea → `DescriptionField` |
| `src/app/v2/(hub)/projects/[projectId]/issues/[issueId]/_issue-detail.tsx` | Modify | Full v2.0 token retone (Requirement D) + decode title + swap description textarea → `DescriptionField` |
| `src/app/v2/(hub)/projects/[projectId]/_list-view.tsx` | Modify | Wrap `task.title` (line 613) in `decodeHtmlEntities()` |
| `src/app/v2/(hub)/projects/[projectId]/_board-view.tsx` | Modify | Wrap `task.title` (line 181) in `decodeHtmlEntities()` |
| `src/app/v2/(hub)/projects/[projectId]/_calendar-view.tsx` | Modify | Wrap `t.title` (line 124) in `decodeHtmlEntities()` |
| `src/app/v2/(hub)/projects/[projectId]/_issue-list-view.tsx` | Modify | Wrap `issue.title` (line 354) in `decodeHtmlEntities()` |
| `src/app/v2/(hub)/projects/[projectId]/_issue-board-view.tsx` | Modify | Wrap `issue.title` (line 156) in `decodeHtmlEntities()` |
| `src/app/v2/(hub)/projects/[projectId]/_issue-calendar-view.tsx` | Modify | Wrap `issue.title` (line 110) in `decodeHtmlEntities()` |
| `src/app/v2/(hub)/projects/[projectId]/milestones/[milestoneId]/_milestone-detail.tsx` | Modify | Wrap `t.title` (line 182) in `decodeHtmlEntities()` only — no other change |
| `package.json` | Modify (conditional) | Add `@tiptap/extension-link` only if implementation confirms imported `<a href>` links don't survive StarterKit's default schema |

## Code Context

### File: `src/app/v2/(hub)/projects/_pm-shared.tsx` (append near existing helpers, e.g. after `formatDueDate` at line 319)

```tsx
// ─── HTML entity decode — Zoho-exported titles carry literal &amp; etc. ──────
// Pure string transform, no DOMParser: this module is imported by client
// components Next.js server-renders on first paint (no `document` in Node).
const NAMED_HTML_ENTITIES: Record<string, string> = {
  amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ",
  hellip: "…", mdash: "—", ndash: "–",
  lsquo: "'", rsquo: "'", ldquo: "“", rdquo: "”",
};

export function decodeHtmlEntities(input: string): string {
  if (!input) return input;
  return input.replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z]+);/g, (match, entity: string) => {
    if (entity[0] === "#") {
      const isHex = entity[1] === "x" || entity[1] === "X";
      const code = isHex ? parseInt(entity.slice(2), 16) : parseInt(entity.slice(1), 10);
      return Number.isNaN(code) ? match : String.fromCodePoint(code);
    }
    return NAMED_HTML_ENTITIES[entity] ?? match;
  });
}
```

### File: `src/app/v2/(hub)/projects/[projectId]/_project-detail.tsx:854` — the Forms-spec input class to replicate

```tsx
const inputClass = "w-full px-3 py-2 rounded-[10px] border text-[13px] outline-none transition-colors border-[#E2E7F2] bg-[#F4F6FB] text-[#3A4565] focus:border-[#007BFF] focus:bg-white focus:ring-[3px] focus:ring-[#007BFF]/[0.14]";
```

### File: `src/app/v2/(hub)/portfolio-tracker/[projectId]/_onboarding-wizard.tsx:2991-3085` — `RichTextField` shape to model `DescriptionField` on (do not import; copy/retone into `_pm-shared.tsx`)

```tsx
const editor = useEditor({
  extensions: [StarterKit],
  content: value,
  editable: !disabled,
  immediatelyRender: false,
  editorProps: { attributes: { class: cn("outline-none px-3.5 py-[11px] text-sm …") } },
  onUpdate: ({ editor: e }) => onChange(e.getHTML()),
});
```

### File: `src/app/v2/(hub)/projects/[projectId]/tasks/[taskId]/_task-detail.tsx:239-248` — current description block to replace

```tsx
<Card title="Description">
  <textarea
    value={description}
    onChange={(e) => setDescription(e.target.value)}
    onBlur={saveDescription}
    rows={5}
    placeholder="Add a description…"
    className="w-full px-3 py-2 rounded-lg border border-slate-200 text-[13px] text-slate-700 outline-none focus:border-slate-400 resize-none"
  />
</Card>
```

## Implementation Steps

1. Add `decodeHtmlEntities()` to `_pm-shared.tsx`; wrap the 6 listing/board/calendar title sites + the 1 milestone-detail site (Requirement A).
2. Build `DescriptionField` in `_pm-shared.tsx` (Requirement B); verify link click-through behavior on a real imported issue description (e.g. Raith Design's `#20751 new feature`) and add `@tiptap/extension-link` if needed.
3. Retone `_task-detail.tsx` per Requirement C; swap in `DescriptionField`; initialize title state via `decodeHtmlEntities`.
4. Retone `_issue-detail.tsx` per Requirement D; swap in `DescriptionField`; initialize title state via `decodeHtmlEntities`.
5. Manual browser pass on both pages: confirm colors/typography/radii/shadows match `_project-detail.tsx`/`_list-view.tsx` siblings exactly (same hex values, same `font-heading`/`font-mono` usage), confirm a title containing `&amp;` renders as `&`, confirm an HTML description renders formatted (paragraphs/line breaks/links) instead of raw tags, and confirm editing + blur still persists via the existing PATCH endpoints (Network tab).

## Acceptance Criteria

- [ ] `/v2/projects/[projectId]/tasks/[taskId]` and `/v2/projects/[projectId]/issues/[issueId]` use only Design System v2.0 tokens — no `slate-*`/`red-*`/`green-*`/`violet-*`/`blue-*` Tailwind palette classes remain in either file or their shared `Card`/`Meta` helpers.
- [ ] A task/issue title containing `&amp;` (or other common entities) displays the decoded character everywhere it appears: tasklist row, board card, calendar cell, and the detail page's editable title field.
- [ ] A task/issue description containing HTML tags (`<div>`, `<br />`, `<a href>`) renders as formatted rich text (paragraphs, line breaks, clickable links) instead of visible raw markup, and remains editable with changes persisted on blur via the existing PATCH endpoints.
- [ ] `npx tsc --noEmit` passes with no new errors.
- [ ] No new runtime dependency added except (conditionally) `@tiptap/extension-link`, and only if confirmed necessary for link click-through.

## Verification

```bash
npx tsc --noEmit
pnpm lint
pnpm dev   # then browser-check both detail pages + all 6 listing/board/calendar views against a task/issue with an "&" in its title and HTML in its description
```

## Compatibility Touchpoints

- No packaging/docs/adapter/install-surface impact. Purely a `src/app/v2` UI change plus one shared-helper addition in `_pm-shared.tsx`, and a possible single new Tiptap-family dependency.
