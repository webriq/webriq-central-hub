# 257: Issue Detail Page — Description Enhancement, Accordion Sections, Image Preview, Comment/Attachment Fixes, Tab Redesign, Quick Access Panel

**Created:** 2026-08-17
**Priority:** HIGH
**Type:** enhancement
**Recommended Tier:** balanced
**Status:** Planned

---

## Overview

The user's request lists 8 changes under the heading "Task/Issue Details Page" and points at a Zoho screenshot as the "ideal/target look." Research below confirms the request is concretely scoped to the **Issue Detail page** (`/projects/[projectId]/issues/[issueId]`, `_issue-detail.tsx` and its subtree) even though the heading names both:

- Requirement 1 explicitly says "Issue Details > Description."
- The attached screenshot is Zoho's **Bug/Issue** detail view (breadcrumb chip reads `Issue`, ID format `A8U4-I22`), not its Task view.
- Requirements 5 and 6 (missing/unmerged comment attachments) turn out to be **factually Issue-only**, not just scope-narrowed by choice — see Requirement E below for why: `zoho-import/comments/route.ts` (Task comments' importer) never wrote a `source_meta.attachments` field at all, while `zoho-import/issue-comments/route.ts` does (migration 052). There is nothing to surface on the Task side for that specific defect.

**The Zoho screenshot is a structural/behavioral reference only — not a visual one.** It's Zoho's own dark/orange theme; this codebase's [UI Polish Conventions](../../CLAUDE.md#ui-polish-conventions) already establish Design System v2.0 (light background, `#007BFF` blue accent, `isDark`-prop pattern — not used in this subtree at all) as the only palette in use under `src/app/(hub)/projects/`. Copy the screenshot's *layout ideas* (collapsible sections, Comments-before-Attachments tab order, a persistent sibling-issue list) — never its colors.

Sibling files already retoned to Design System v2.0 by tasks 191/192/234 remain the visual precedent (`rounded-[14px] border-[#E2E7F2]`, `font-heading`, Forms-spec inputs, pill-radius buttons). Do not invent new tokens.

This task touches **only** `_issue-detail.tsx` and its direct subtree (`_issue-comments.tsx`, `_issue-attachments.tsx`, `_issue-comment-editor.tsx`, `_issue-attachments-comments-panel.tsx`, `page.tsx`), plus two new shared components at the `[projectId]/` level (reusable by a future Task Detail parity pass) and one narrowly-scoped shared-bug fix in `_task-comments.tsx` (Requirement D only — see there for why that one file is the exception). **`_task-detail.tsx` itself is not touched.**

---

## Requirements

### A. Description field — enhance (Requirement 1)

`_issue-detail.tsx:274-284` already renders `DescriptionField` (`../../_description-field.tsx`, task 234/238), a Tiptap-based rich editor with bold/italic/bullet-list, paste/drag-to-embed images, and Zoho HTML normalization (`normalizeZohoDescriptionHtml`). What it's missing:

- [ ] **No empty state.** An empty description renders a blank `min-h-[100px]` box with no affordance telling the user they can add one. Add `@tiptap/extension-placeholder` (not currently installed — same Tiptap-family addition precedent as task 194's conditional `@tiptap/extension-link`) with placeholder text `"Add a description…"` when editable, and when `readOnly && !value`, skip the editor entirely and render a plain muted one-liner (`text-[13px] text-[#5F6A88]`) reading `"No description provided."` instead of an empty editor shell — matches the UI Polish Conventions' "every section needs an explicit empty state."
- [ ] Wrap the Description `Card` in the new `AccordionCard` (Requirement C) — this is the section Zoho's reference shows collapsed by default in its screenshot, but see Requirement C's note on why this task defaults it **open**, not collapsed.

### B. Clickable image preview — Description and Comments (Requirement 2)

Both `_description-field.tsx` (Tiptap `Image` extension, task 238) and `_issue-comments.tsx` (comment bodies rendered via `dangerouslySetInnerHTML` with the same `[&_img]` treatment, since `_issue-comment-editor.tsx` also embeds pasted/dropped images) render inline `<img>` tags that are inert — clicking does nothing.

- [ ] Create `ImageLightboxModal` in a new file `src/app/(hub)/projects/[projectId]/_image-lightbox-modal.tsx` — same modal chrome as `../tasks/[taskId]/_task-attachment-viewer-modal.tsx` (dark `#071133/60` overlay, centered white `rounded-xl` card, Escape-to-close, `framer-motion` fade/scale-in), but simplified: takes a direct `{ src, alt, onClose }` (no `fetchUrl` round-trip — Description/comment image URLs are already resolved, public, or Zoho-absolutized strings baked straight into the HTML, unlike attachment records which need a signed URL). Body is just `<img src={src} alt={alt} className="max-w-full max-h-full object-contain" />` inside the same `w-full h-full flex items-center justify-center overflow-auto p-4` wrapper `TaskAttachmentViewerModal` uses for its own `kind === "image"` branch. This is "the existing Preview dialog on Onboarding Wizard/Workspace" the request names — `TaskAttachmentViewerModal` is itself already a reduced port of that file's `FileViewerModal` (see that file's own top comment); this is one further reduction for the no-record, no-signed-URL case.
- [ ] Wire it into `DescriptionField`: add `handleClickOn(view, pos, node, nodePos, event)` to `editorProps` (same hook family already used there for `handlePaste`/`handleDrop`) — if `node.type.name === "image"`, read `node.attrs.src`, open the lightbox, and `return true` to stop ProseMirror's own click handling (prevents cursor-placement conflicts). Works in both editable and read-only mode since `handleClickOn` fires regardless of `editable`.
- [ ] Wire it into `_issue-comments.tsx`'s rendered comment body: the `dangerouslySetInnerHTML` div is not a Tiptap instance, so use plain event delegation — add `onClick={(e) => { const img = (e.target as HTMLElement).closest("img"); if (img) setLightboxSrc(img.getAttribute("src")); }}` on the wrapping div (line 219-227), plus `cursor-zoom-in` on `[&_img]` via the existing className string.
- [ ] Render one `<ImageLightboxModal>` instance per component (Description field, Issue Comments) gated on local `lightboxSrc` state — mirrors the existing `viewing`-state pattern already used for attachment "View" clicks in the same files.

### C. Convert sections to Accordion (Requirement 3)

- [ ] Create `AccordionCard` in a new file `src/app/(hub)/projects/[projectId]/_accordion-card.tsx` — same visual chrome as the local `Card` helper duplicated in `_issue-detail.tsx:30-47` and `_task-detail.tsx:29-46` (`rounded-[14px] border-[#E2E7F2] bg-white shadow-[0_1px_2px_rgba(7,17,51,0.05)]`, header `px-[18px] py-3.5 border-b border-[#EDF0F7]`, title `font-heading text-[15px] font-semibold text-[#0B1533]`), but the header becomes a `<button>` that toggles an internal `open` state, with a `ChevronRight`/`ChevronDown` (lucide-react, rotates via `transition-transform`) before the title — matches Zoho's reference chevron affordance. Props: `{ title: string; defaultOpen?: boolean; children: React.ReactNode }`. Animate the content region's height with `framer-motion`'s `AnimatePresence`/`motion.div` (`initial={{ height: 0 }} animate={{ height: "auto" }}`), consistent with this codebase's existing `framer-motion` usage for modals — no new animation dependency.
- [ ] In `_issue-detail.tsx`, replace the local `Card` usages for the **Details** sidebar card and the **Description** card with `AccordionCard`. Leave the local `Card`/`Meta` helper definitions in place only if still referenced elsewhere in the file after this change — otherwise delete the now-dead `Card` function (keep `Meta`, still used inside the Details fields).
- [ ] **Default open state — deliberate deviation from the screenshot:** Zoho's reference shows Description collapsed and Issue Information expanded. This task defaults **both open** (`defaultOpen=true`). Rationale: collapsing Description by default hides the one field every visitor to this page is most likely to read first, behind an extra click, on every single visit — worse for a light-theme low-density Hub page than for Zoho's much denser multi-accordion Bug view. The affordance to collapse is what Requirement 3 asks for; the default state is a judgment call favoring this page's actual reading pattern over screenshot fidelity.
- [ ] The Attachments/Comments/Time Logs tab panel (`IssueAttachmentsCommentsPanel`) is **not** wrapped in `AccordionCard` — it already has its own internal tab-switcher UI (Requirement G), which is a different interaction pattern than a collapsible section and should stay a persistent, always-visible panel, matching how Zoho's own reference keeps its tab bar outside/below the accordion stack.

### D. Comment timestamp exact date/time — alignment fix (Requirement 4)

`_issue-comments.tsx:198-205` (and the identical pattern in `../../tasks/[taskId]/_task-comments.tsx:173`, both from task 238's "inline reveal" design):

```tsx
<span className="text-[10px] font-mono text-[#5F6A88] whitespace-nowrap">
  {formatRelativeTime(c.created_at)}
  <span className="inline-block max-w-0 group-hover:max-w-[200px] overflow-hidden whitespace-nowrap text-[#8A93AC] transition-[max-width] duration-200 ease-out">
    {" · "}{formatDate(c.created_at)} {formatClockTime(c.created_at)}
  </span>
</span>
```

This is a **shared bug, byte-identical in both files** — the one exception to this task's Issue-only scope (Requirement D applies to both `_issue-comments.tsx` and `_task-comments.tsx`; every other requirement is Issue Detail only).

- [ ] **Diagnose at implementation time by viewing an issue/task with comments in the browser and hovering a timestamp** — the doc's hypothesis (not yet visually confirmed) is that the `inline-block` child's baseline is computed differently at `max-w-0` (effectively empty) vs. `max-w-[200px]` (content-bearing), causing the whole comment row (avatar / name / timestamp / delete button, all on one `items-baseline` flex line at `_issue-comments.tsx:198`) to jump vertically during the hover transition — not a horizontal/clipping issue.
- [ ] Likely fix: give the inner reveal `<span>` an explicit `align-baseline` (or switch it from `inline-block` to `inline-flex`, which has more predictable baseline behavior than `inline-block` with clipped content) so its baseline stays anchored to its own text regardless of rendered width. Keep the existing `max-w-0 → max-w-[200px]` reveal mechanism itself — task 238's "Third Refinement" section documents why a tooltip and an `opacity`/`hidden` toggle were both already tried and rejected; don't reopen that decision, only fix the alignment.
- [ ] Confirm the exact `formatDate` + `formatClockTime` output (e.g. `"Aug 15, 2026 2:34 PM"`, ~20-24 chars) fits inside `max-w-[200px]` at `text-[10px]` without truncating — widen the `max-w` value if it doesn't (keep it a `max-w-[Npx]` value, not `max-w-fit`, since `max-w-fit` breaks the collapsed-to-zero rest state the transition depends on).

### E. Zoho-imported comment attachments — surface, don't hide (Requirement 5)

**Root cause, confirmed by reading both importers directly** (not a hypothesis): `zoho-import/issue-comments/route.ts:143-151` writes `source_meta.attachments: [{name, size, type}, ...]` for every imported Zoho comment that had attachments — this is metadata only, no `download_url`, no stable ID (see task 170's own overview, which independently confirms this and is building an *export* tool for admin migration tooling, unrelated to this fix). `_issue-comments.tsx` and its GET route (`.../comments/route.ts`) only ever query the generic `attachments` table (`entity_type = 'comment'`), which is **empty** for these legacy rows — no import route has ever populated it (task 170's own Out of Scope section confirms this: "No import route... populating it is separate, unscoped follow-up work"). Result: any Zoho-imported comment that had an attachment in Zoho silently shows nothing in the Hub today — not a rendering bug, a real data-surfacing gap.

**`task_comments` has no equivalent gap** — confirmed by grepping `zoho-import/comments/route.ts` (the Task-side importer): it never writes anything resembling `source_meta.attachments`. There is nothing to surface on the Task side for this specific defect, which is why this requirement is Issue-only by data reality, not by scope choice.

- [ ] `GET /api/v2/projects/[projectId]/issues/[issueId]/comments` — add `source_meta` to the `.select(...)` list (currently `"id, body, created_at, author_id, author_name, author_email"`).
- [ ] In the route's result-mapping step, derive `legacyAttachments: { name: string; size: number | null; type: string | null }[]` from `c.source_meta?.attachments` (empty array if absent/malformed — this is externally-sourced JSONB, validate shape defensively) and include it in each comment's JSON alongside the existing (real, Hub-native) `attachments` array.
- [ ] In `_issue-comments.tsx`, render `legacyAttachments` (when non-empty) as a **visually distinct, non-interactive** chip list below the real `attachments` list — same row shape (icon + filename + size) as the existing attachment chips at line 228-254, but no "View" button (there is no file to view — Zoho attachment download is confirmed blocked platform-wide, per task 106, cited directly in task 170's Compatibility Touchpoints) and a small trailing label or tooltip: `"Imported from Zoho — original file unavailable"`. Do not attempt to fetch or link these — that would 404 or require net-new Zoho API work explicitly out of scope here (see Out of Scope).

### F. Comment attachments also appear in the Attachments tab (Requirement 6)

`IssueAttachments` (`_issue-attachments.tsx`) currently queries only `entity_type = 'issue'` — comment-uploaded files (Hub-native ones, via `_issue-comment-editor.tsx`'s attachment picker, `entity_type = 'comment'`) never appear there.

- [ ] `GET /api/v2/projects/[projectId]/issues/[issueId]/attachments` — after the existing issue-native query, also fetch the issue's `issue_comments` ids, then `attachments` rows where `entity_type = 'comment' AND entity_id IN (...)`. Merge both lists, each row tagged `source: "issue" | "comment"` and (for comment-sourced rows) `commentId: string`. Sort the merged list by `created_at` ascending (same as today).
- [ ] `_issue-attachments.tsx` — accept the new `source`/`commentId` fields in `AttachmentRow`. For `source === "comment"` rows: still render in the same grid (thumbnail, filename, size, "View"), but the delete button (`canEdit &&` block, line 235-245) does not render for these — deletion happens on the parent comment, not here, to avoid two divergent delete paths for one physical file. Add a small `"From comment"` badge/label on comment-sourced tiles so users understand why delete is unavailable there.
- [ ] `AttachmentThumbnail` and the "View" click must fetch the correct signed-URL endpoint per source: `source === "issue"` → existing `/attachments/${id}/file-url`; `source === "comment"` → `/comments/${commentId}/attachments/${id}/file-url` (already exists, used today by `_issue-comments.tsx`'s own viewer). Simplest implementation: have the merged GET route return a ready-to-use `fetchUrl` string per row instead of making the client branch-construct it.
- [ ] Legacy (`source_meta`-only, Requirement E) attachments are **not** included in this merge — they have no `attachments` table row and no file to view; they stay comment-scoped, informational-only, per Requirement E.

### G. Tab order + redesign (Requirement 7)

`_issue-attachments-comments-panel.tsx:13,42` currently orders tabs `["attachments", "comments", "timelogs"]` with `attachments` as the default-active tab.

- [ ] Reorder to `["comments", "attachments", "timelogs"]`; change the default `useState<PanelTab>("attachments")` to `useState<PanelTab>("comments")` — matches Zoho's reference (Comments is the leftmost/default tab there).
- [ ] Add live item counts to each tab label (Zoho's reference shows `Comments (3)`, `Attachments (5)`) — the panel component itself doesn't fetch data (each child tab component does its own fetch), so lift counts up via a small `onCountChange?: (n: number) => void` prop on `IssueComments` and the merged-list version of `IssueAttachments`, called once after each one's fetch resolves. Store `{ comments: number; attachments: number }` in the panel's own state, render as `${TAB_LABEL[t]}${count != null ? ` (${count})` : ""}`. Don't add a duplicate count-only fetch — reuse data the children already load.
- [ ] Visual redesign of the tab bar itself is an open craft decision, not a prescribed set of classes — **invoke `/frontend-design` or `/impeccable` during implementation** (per the user's own instruction) to decide the specific treatment (the current pill/segmented-control style vs. an underline-tab style closer to the reference). Stay within Design System v2.0 tokens regardless of which shape is chosen.
- [ ] No new tabs. Zoho's reference also shows Log Hours, Link Issue, Resolution, Tasks, Status Timeline, and Activity Stream tabs — none of those exist in the Hub today and adding them is net-new feature work far beyond "redesign the tab UI," not requested by the numbered list. Out of scope (see below).

### H. Quick Access Panel — other Tasks/Issues assigned (Requirement 8)

Zoho's reference shows a persistent left-hand list of sibling issues (`#73`, `#72`, `#69`, …, current one highlighted) for fast navigation without returning to the list view. Nothing equivalent exists today — `page.tsx` fetches only the single issue plus `allMembers`.

- [ ] `page.tsx` (`.../issues/[issueId]/page.tsx`) — add a `Promise.all`-parallel fetch (alongside the existing `issue`/`allMembers` queries) for:
  - Other **tasks** assigned to the current user in this project: `.from("tasks").select("id, display_id, title, status").eq("project_id", project.id).contains("assignees", [currentUserId]).order("due_date", { ascending: true, nullsFirst: false }).limit(8)`.
  - Other **issues** assigned to the current user in this project: `.from("issues").select("id, display_id, title, status, severity").eq("project_id", project.id).eq("assignee_id", currentUserId).neq("id", issue.id).order("due_date", { ascending: true, nullsFirst: false }).limit(8)`.
  - **Fallback when both are empty** (expected for admin/PM roles, who are rarely assignees — `getIssueEditPermission`'s own role model treats assignee as a developer concept): fetch the 8 most recently updated **open** issues in the project (`.neq("status", "closed").neq("id", issue.id).order("updated_at", { ascending: false }).limit(8)`), so the panel isn't empty for non-developer viewers.
- [ ] New file `src/app/(hub)/projects/[projectId]/issues/[issueId]/_issue-quick-access-panel.tsx` exporting `IssueQuickAccessPanel({ tasks, issues, projectId }: {...})` — renders inside an `AccordionCard title="Other Assigned"` (Requirement C's component, `defaultOpen` can be `false` here — unlike Description, a secondary navigation aid is reasonable to start collapsed), stacked below the Details `AccordionCard` in the existing `w-72 shrink-0` left sidebar column (no layout/column-count change to the page). Each row: small type chip (`TASK`/`ISSUE`, reusing the neutral-chip style from the `TASK ·`/`ISSUE ·` header chips), title (through `decodeHtmlEntities`, per the existing convention for every title display site), and `StatusBadge`/`SeverityBadge` (both already imported in `_issue-detail.tsx`, reused here). `router.push` to `/projects/${projectId}/tasks/${t.display_id}` or `/projects/${projectId}/issues/${i.display_id}` on click — mirrors the existing `goToIssues` navigation pattern in `_issue-detail.tsx`.
- [ ] Scope is same-project only (not cross-project) — keeps the query simple and consistent with every other query already scoped to `project.id` on this page; a cross-project "everything assigned to me" view would be a materially different (and separately valuable) feature, not this request.

---

## Out of Scope / Must-Not-Change

- **`_task-detail.tsx` structural changes** (accordion, quick access panel, tab reorder, image-preview wiring, Description empty-state placeholder). Requirements A, B, C, F, G, H are Issue Detail only, per this doc's Overview — flagged as a natural, separately-scoped follow-up ("Task Detail Design Parity Pass"), matching how task 194 itself deferred Milestone Detail's redesign the same way. Requirement D is the sole exception (byte-identical shared bug, fixed in both files).
- **No Zoho dark/orange theme, no literal Zoho layout clone.** The screenshot is structural reference only (accordion affordance, tab order, sibling-list navigation) — Design System v2.0 light tokens stay as-is everywhere.
- **No new tabs** (Log Hours as its own top-level tab already exists as "Time Logs" — no `Link Issue`, `Resolution`, `Tasks`, `Status Timeline`, `Activity Stream` tabs). Each would be its own multi-file feature; none is named in the numbered request beyond "redesign the tab UI."
- **No `Flag`/`Tags` fields added to the Details sidebar**, even though `issues.flag` exists in the schema (migration 051) and Zoho's reference shows both. Not named in the request; adding new persisted-field UI is a separate, additive task.
- **No download/proxy of actual Zoho attachment files.** Confirmed blocked platform-wide (task 106). Requirement E surfaces metadata only, explicitly non-interactive.
- **No changes to `task_comments`' import route, `_task-attachments.tsx`, or `_task-attachments-comments-panel.tsx`** — Requirements E and F are Issue-only by data/architecture reality (see those requirements' own root-cause notes), not by arbitrary scope-narrowing.
- **Task 238's timestamp-reveal *mechanism*** (`max-w-0 → max-w-[200px]` hover expand, chosen after rejecting a tooltip and an opacity/`hidden` toggle — see that task's "Third Refinement") **is not reopened.** Requirement D fixes alignment only, keeps the mechanism.
- **No changes to `getIssueEditPermission`, RLS, or any migration.** All changes are additive reads (`source_meta`, comment-scoped `attachments` merge) and UI.

## Proposed File Changes

| File | Action | Purpose |
|------|--------|---------|
| `src/app/(hub)/projects/[projectId]/_accordion-card.tsx` | Create | Shared collapsible `Card` replacement (Requirement C) |
| `src/app/(hub)/projects/[projectId]/_image-lightbox-modal.tsx` | Create | Direct-`src` image preview modal (Requirement B) |
| `src/app/(hub)/projects/[projectId]/issues/[issueId]/_issue-quick-access-panel.tsx` | Create | Sibling task/issue navigation list (Requirement H) |
| `src/app/(hub)/projects/[projectId]/issues/[issueId]/_issue-detail.tsx` | Modify | Swap `Card` → `AccordionCard` for Details/Description; mount `IssueQuickAccessPanel` in sidebar |
| `src/app/(hub)/projects/[projectId]/_description-field.tsx` | Modify | Add Placeholder extension + empty-state branch; `handleClickOn` → lightbox |
| `src/app/(hub)/projects/[projectId]/issues/[issueId]/_issue-comments.tsx` | Modify | Image-click delegation → lightbox; timestamp alignment fix; render `legacyAttachments`; accept `onCountChange` |
| `src/app/(hub)/projects/[projectId]/tasks/[taskId]/_task-comments.tsx` | Modify | Timestamp alignment fix only (Requirement D, shared bug) |
| `src/app/(hub)/projects/[projectId]/issues/[issueId]/_issue-attachments.tsx` | Modify | Consume merged `source`/`commentId`/`fetchUrl` rows; hide delete for comment-sourced rows; accept `onCountChange` |
| `src/app/(hub)/projects/[projectId]/issues/[issueId]/_issue-attachments-comments-panel.tsx` | Modify | Reorder tabs (comments first), default tab, counts, visual redesign |
| `src/app/(hub)/projects/[projectId]/issues/[issueId]/page.tsx` | Modify | Fetch other-assigned tasks/issues (+ fallback) for Quick Access Panel |
| `src/app/api/v2/projects/[projectId]/issues/[issueId]/comments/route.ts` | Modify | GET: select `source_meta`, derive+return `legacyAttachments` |
| `src/app/api/v2/projects/[projectId]/issues/[issueId]/attachments/route.ts` | Modify | GET: merge in comment-sourced attachments with `source`/`commentId`/`fetchUrl` |
| `package.json` | Modify | Add `@tiptap/extension-placeholder` |

## Code Context

### `_issue-detail.tsx:30-56` — local `Card`/`Meta` helpers being replaced (Card only; Meta stays)

```tsx
function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-[14px] border border-[#E2E7F2] bg-white shadow-[0_1px_2px_rgba(7,17,51,0.05)] overflow-hidden">
      <div className="flex items-center justify-between px-[18px] py-3.5 border-b border-[#EDF0F7]">
        <span className="font-heading text-[15px] font-semibold text-[#0B1533]">{title}</span>
      </div>
      <div className="p-[18px]">{children}</div>
    </div>
  );
}
```

### `_issue-attachments-comments-panel.tsx:13-19,36,42` — tab order/default to change

```tsx
type PanelTab = "attachments" | "comments" | "timelogs";
const TAB_LABEL: Record<PanelTab, string> = { attachments: "Attachments", comments: "Comments", timelogs: "Time Logs" };
// ...
const [tab, setTab] = useState<PanelTab>("attachments");
// ...
{(["attachments", "comments", "timelogs"] as const).map((t) => ( /* ... */ ))}
```

### `zoho-import/issue-comments/route.ts:143-151` — confirms Requirement E's root cause

```ts
source_meta: {
  added_by: c.added_by ?? null,
  added_via: c.added_via ?? null,
  attachments: (c.attachments ?? []).map((a) => ({ name: a.name, size: a.size, type: a.type })),
},
```

### `.../issues/[issueId]/attachments/route.ts:48-56` — GET query to extend with the comment-attachments merge

```ts
const { data, error } = await supabase
  .from("attachments")
  .select("id, filename, size, created_at")
  .eq("entity_type", "issue")
  .eq("entity_id", issue.id)
  .order("created_at", { ascending: true });
```

### `.../issues/[issueId]/comments/route.ts:43-47,78-85` — GET query + mapping to extend with `source_meta`/`legacyAttachments`

```ts
const { data: comments, error } = await supabase
  .from("issue_comments")
  .select("id, body, created_at, author_id, author_name, author_email")
  .eq("issue_id", issue.id)
  .order("created_at", { ascending: true });
// ...
const result = (comments ?? []).map((c) => ({
  id: c.id, body: c.body, created_at: c.created_at, author_id: c.author_id,
  author_name: resolveAuthorName(c, profileNames),
  attachments: attachmentsByComment.get(c.id) ?? [],
}));
```

### `_task-attachment-viewer-modal.tsx:70-138` — modal chrome + image branch to reduce for `ImageLightboxModal`

Reuse the `motion.div` overlay/card structure and the `kind === "image"` branch (`<img src={url} className="max-w-full max-h-full object-contain" />` inside `w-full h-full flex items-center justify-center overflow-auto p-4`) verbatim; drop the `fetchUrl`/loading/error machinery since the src is already resolved.

---

## Implementation Steps

1. `pnpm add @tiptap/extension-placeholder`.
2. Create `_accordion-card.tsx` and `_image-lightbox-modal.tsx` (Requirements C, B).
3. Update `_description-field.tsx`: Placeholder extension + empty-state branch, `handleClickOn` → lightbox (Requirements A, B).
4. Update `_issue-detail.tsx`: swap in `AccordionCard`, both `defaultOpen`; remove dead local `Card` (Requirement C).
5. Update `.../attachments/route.ts` GET (merge, `source`/`commentId`/`fetchUrl`) and `_issue-attachments.tsx` (consume merge, hide delete for comment-sourced, `onCountChange`) (Requirement F).
6. Update `.../comments/route.ts` GET (`source_meta` select + `legacyAttachments` derivation) and `_issue-comments.tsx` (render `legacyAttachments`, image-click lightbox, `onCountChange`) (Requirements B, E).
7. Fix timestamp alignment in `_issue-comments.tsx` and `_task-comments.tsx` — **diagnose live in the browser first** (Requirement D).
8. Update `_issue-attachments-comments-panel.tsx`: tab order/default/counts, then invoke `/frontend-design` or `/impeccable` for the visual redesign pass (Requirement G).
9. Create `_issue-quick-access-panel.tsx`; wire the new `page.tsx` queries; mount in `_issue-detail.tsx`'s sidebar (Requirement H).
10. `npx tsc --noEmit` and `pnpm lint`.
11. Browser-verify: Description empty/filled states, image click-to-preview (Description + comment body), accordion collapse/expand, comment timestamp hover alignment, a Zoho-imported comment with `legacyAttachments`, a Hub-native comment attachment appearing in the Attachments tab, tab default/order/counts, Quick Access Panel navigation (as a developer with assignments, and as a PM/admin to confirm the fallback list).

## Acceptance Criteria

- [ ] Empty Description shows a placeholder (editable) or a muted "No description provided." line (read-only); non-empty Description unaffected.
- [ ] Clicking an image inside Description or a comment body opens `ImageLightboxModal` at full size; Escape/overlay-click closes it.
- [ ] Details and Description sections on Issue Detail are collapsible via a chevron-toggle header; both default open.
- [ ] Hovering a comment timestamp (Issue and Task detail) reveals the exact date/time with no vertical jump in the row.
- [ ] A Zoho-imported comment with `source_meta.attachments` shows those as non-interactive, labeled chips.
- [ ] A comment-uploaded (Hub-native) attachment appears in both the comment thread and the Attachments tab; not deletable from the Attachments tab.
- [ ] Attachments tab loads and displays correctly for issues with zero comment attachments (merge is additive, not required).
- [ ] Tab order is Comments, Attachments, Time Logs; Comments is the default-active tab; tab labels show live counts.
- [ ] Quick Access Panel lists other tasks/issues assigned to the current user (developer) or a same-project open-issues fallback (PM/admin); clicking a row navigates to that item's detail page.
- [ ] `npx tsc --noEmit` and `pnpm lint` both clean.
- [ ] `_task-detail.tsx`, `_task-attachments.tsx`, `_task-attachments-comments-panel.tsx` are unmodified (verify via diff) except `_task-comments.tsx`'s scoped timestamp-alignment fix.

## Verification

```bash
npx tsc --noEmit
pnpm lint
pnpm dev
```

Browser: open an Issue Detail page with existing comments/attachments (prefer one with Zoho-imported history for Requirement E) as a developer assigned to other work, and separately as a PM/admin, and walk every Acceptance Criteria item above.

## Compatibility Touchpoints

- `AccordionCard` and `ImageLightboxModal` are new, generically-named, `[projectId]/`-level shared components — deliberately reusable by a future Task Detail parity pass without relocation.
- No schema, RLS, or migration changes — all new server-side reads use existing tables/columns (`issue_comments.source_meta`, the existing polymorphic `attachments` table).
- No change to any POST/DELETE route — only the two GET routes gain fields; existing consumers of those GET responses outside this subtree (none currently) would only see additive fields, not breaking ones.

---

## Implementation Notes

### What Changed

Implemented Requirements A–H as scoped. Every requirement was verified live in the browser against real seeded data (not just `tsc`/`lint`), including one end-to-end write (posted a real comment with a real file attachment, confirmed it appeared in both the Comments thread and the merged Attachments tab, then cleaned up the test row directly via the DB so no test data was left behind).

- **A/C — Description + accordion.** `AccordionCard` (new, `_accordion-card.tsx`) replaces the local `Card` helper for the Details and Description sections in `_issue-detail.tsx`; both default open (per the doc's documented deviation from the screenshot). `DescriptionField` gained `@tiptap/extension-placeholder` (new dependency) and an `isEmptyReadOnly` branch that skips the editor shell entirely for an empty read-only description.
- **B — Image lightbox.** New `ImageLightboxModal` (`_image-lightbox-modal.tsx`), wired into `DescriptionField` via Tiptap's `editorProps.handleClickOn` and into `_issue-comments.tsx` via plain click-delegation on the `dangerouslySetInnerHTML` body. Verified live: a synthetic click dispatched directly on an `<img>` (bypassing a real coordinate-scaling artifact in the browser-automation tooling itself, not the app — see Deviations) opened the modal correctly in both Description and a comment body, with title, Escape-to-close, and overlay-click-to-close all working.
- **D — Timestamp alignment.** Root cause confirmed via live DOM measurement (see Deviations): CSS2.1 §10.8.1's overflow-triggered inline-block baseline fallback, not a hypothesis. Fixed by switching the reveal `<span>` from `inline-block` to `inline-flex items-baseline` in both `_issue-comments.tsx` and `_task-comments.tsx`. Verified programmatically across all 7 comment rows on a live issue: zero vertical shift (`delta: 0` for every row) when toggling the reveal open.
- **E — Legacy Zoho comment attachments.** `GET .../comments` now selects `source_meta` and derives `legacyAttachments` from it; `_issue-comments.tsx` renders them as a dashed, non-interactive chip row labeled "Unavailable". Verified against real data: issue `50E6A31701-I0022` (the exact issue from the request's reference screenshot) shows 5 real legacy attachment chips from a genuine Zoho-imported comment.
- **F — Comment attachments in the Attachments tab.** `GET .../attachments` now merges issue-native and comment-sourced `attachments` rows, tagging each with `source`/`commentId`/`fetchUrl`. `_issue-attachments.tsx` hides the delete control and shows a "From comment" badge for `source: "comment"` rows. Verified end-to-end with a real upload (see What Changed above) — merged count, badge, and "View" (correct signed-URL routing to the comment's own file-url endpoint) all confirmed.
- **G — Tab reorder/redesign.** `_issue-attachments-comments-panel.tsx`: tab order is now Comments/Attachments/Time Logs, Comments is the default-active tab, and each tab label shows a live count lifted from the child component's own fetch via a new `onCountChange` prop (no duplicate count query). Redesigned from the pill/segmented control to an underline-tab treatment. Verified live: "Comments (7)", "Attachments (0)", underline on the active tab.
- **H — Quick Access Panel.** New `_issue-quick-access-panel.tsx`; `page.tsx` fetches other same-project tasks/issues assigned to the current user, falling back to the project's other open issues when both are empty. Verified both states live: "Nothing else assigned right now." on an issue with no siblings, and a populated 5-row fallback list (with working click-to-navigate) on the issue from the request's reference screenshot.

### Files Changed

- `src/app/(hub)/projects/[projectId]/_accordion-card.tsx` - new shared collapsible section (Requirement C)
- `src/app/(hub)/projects/[projectId]/_image-lightbox-modal.tsx` - new direct-`src` image preview modal (Requirement B)
- `src/app/(hub)/projects/[projectId]/issues/[issueId]/_issue-quick-access-panel.tsx` - new sibling task/issue nav list (Requirement H)
- `src/app/(hub)/projects/[projectId]/issues/[issueId]/_issue-detail.tsx` - `Card` → `AccordionCard`, mounted Quick Access Panel
- `src/app/(hub)/projects/[projectId]/_description-field.tsx` - Placeholder extension, empty-state branch, `handleClickOn` → lightbox
- `src/app/(hub)/projects/[projectId]/issues/[issueId]/_issue-comments.tsx` - image-click lightbox, timestamp alignment fix, `legacyAttachments` rendering, `onCountChange`
- `src/app/(hub)/projects/[projectId]/tasks/[taskId]/_task-comments.tsx` - timestamp alignment fix only (shared-bug exception)
- `src/app/(hub)/projects/[projectId]/issues/[issueId]/_issue-attachments.tsx` - consumes merged `source`/`commentId`/`fetchUrl`, hides delete for comment-sourced rows, `onCountChange`
- `src/app/(hub)/projects/[projectId]/issues/[issueId]/_issue-attachments-comments-panel.tsx` - tab reorder/default/counts/redesign
- `src/app/(hub)/projects/[projectId]/issues/[issueId]/page.tsx` - Quick Access Panel data fetch (+ fallback)
- `src/app/api/v2/projects/[projectId]/issues/[issueId]/comments/route.ts` - `source_meta` select + `legacyAttachments` derivation
- `src/app/api/v2/projects/[projectId]/issues/[issueId]/attachments/route.ts` - merge comment-sourced attachments
- `package.json` / `pnpm-lock.yaml` - added `@tiptap/extension-placeholder`

### Deviations From Plan

- **Renumbered 256 → 257.** Mid-implementation, discovered an unrelated, already-completed, uncommitted task doc (`_docs/task/256-auth-verify-lottie-proxy-static-asset-redirect-fix.md`, logged in `TASKS.md`'s Shipped section) already occupying ID 256 — a genuine collision, not a duplicate of this task. Renamed this doc and every in-code `task 256` comment to `task 257`; `TASKS.md` updated accordingly. `_docs/task/256-...md` is untouched and not part of this change.
- **Timestamp alignment root cause, upgraded from hypothesis to confirmed.** The task doc flagged the `inline-block`/`overflow-hidden` baseline interaction as a hypothesis to verify live. Live DOM measurement (toggling the reveal's `max-width` and diffing `getBoundingClientRect().top` across all 7 real comment rows on a seeded issue) confirmed it directly: 0px delta after the `inline-flex` fix, versus the CSS2.1 §10.8.1 "bottom margin edge" fallback the old `inline-block` was hitting. No mechanism change beyond what the doc specified.
- **Browser-automation coordinate scaling, not an app bug.** Real mouse clicks via the browser tool's screen-pixel coordinates intermittently landed off-target on this page (the screenshot's pixel space didn't match the live CSS pixel space in this environment) — a tooling artifact, confirmed by cross-checking `window.innerWidth` against the screenshot dimensions and reproducing correctly-targeted clicks via `element.dispatchEvent(new MouseEvent(...))` at the element's real `getBoundingClientRect()` center. Not a defect in `handleClickOn`, the lightbox, or any other shipped code — flagging only so a future session doesn't misdiagnose the same symptom as a real bug.
- Everything else matches the approved plan; no scope changes.

### Verification Run

- `npx tsc --noEmit` - PASS
- `pnpm lint` - PASS (2 pre-existing warnings in `_checklist-tab.tsx`, unrelated to this task)
- Browser (Chrome, real seeded dev data) - PASS — every Acceptance Criteria item walked live: Description empty/filled states, image click-to-preview (Description + comment body), accordion collapse/expand, comment timestamp hover alignment (measured across 7 rows, 0px shift), a real Zoho-imported comment with 5 `legacyAttachments`, a real Hub-native comment attachment appearing in both the Comments thread and the Attachments tab (with correct badge/no-delete/View), tab default/order/counts, Quick Access Panel both empty and populated-fallback states with working navigation. No console errors at any point.

### Follow-up (same session): Comment Body Image Src + Spacing Parity With Description

User-reported after initial verification: comment-body inline images with Zoho's portal-relative `/portal/viewInlineAttachment/image` src weren't getting the `https://crmplus.zoho.com` prefix Description already applies, and comment-body line spacing didn't match Description's.

**Root cause (confirmed against real DB rows, not assumed):** `issue_comments.body` and `task_comments.body` come from the same Zoho export shape as `issues.description` — literal `<div>text<br/></div>`-per-line HTML, with the same portal-relative inline image srcs. Real example pulled from the dev DB (`issue_comments.id = 0d8034c9-919f-47ae-b286-525d1f2cd0c0`): `<div style="font-size:0.9285rem"><div>Updated:<br/></div><div><img src="/portal/viewInlineAttachment/image?file=...".../><br/></div><div>Thanks.</div></div>`. `_issue-comments.tsx`/`_task-comments.tsx` render `c.body` via `dangerouslySetInnerHTML` directly, never passing it through `normalizeZohoDescriptionHtml` the way `DescriptionField` does — so the src stayed relative (404s) and every `<div>` line had zero margin between it and the next (no `[&_div]` spacing rule existed, only `[&_p]`, because Tiptap's HTML parser converts `<div>` → `<p>` for free when Description goes through it, but raw `dangerouslySetInnerHTML` never does that conversion).

**Fix, applied identically to both `_issue-comments.tsx` and `_task-comments.tsx`** (same shared-bug rationale as Requirement D — byte-identical root cause in both files):
- Import `normalizeZohoDescriptionHtml` from `_pm-shared` and wrap it around `c.body`: `dangerouslySetInnerHTML={{ __html: normalizeZohoDescriptionHtml(c.body) }}`.
- Add `[&_div]:my-1 [&_div:first-child]:mt-0 [&_div:last-child]:mb-0` to the comment body's className, mirroring the existing `[&_p]` rule exactly.

**Verification:** `npx tsc --noEmit` and `pnpm lint` both clean. Ran the actual shared function against the real DB row's HTML via `npx tsx`, confirming byte-for-byte: `src="/portal/viewInlineAttachment/image?file=..."` → `src="https://crmplus.zoho.com/portal/viewInlineAttachment/image?file=..."`, and each line's trailing `<br/>` stripped exactly as Description's own transform does. Did not re-verify in the browser — the dev session's browser auth had expired and re-authenticating requires entering a password, which is outside what I'm allowed to do on the user's behalf; the Node-level check plus the identical, already browser-verified transform function (Description) gives high confidence without it. Flagging so a future session can do the live pass if wanted.

### Follow-up 2 (same session): Dashed Separator Between Comments

User asked for a light dashed line between comments, matching the reference Zoho screenshot (a hairline dashed rule centered in the gap between one comment's content and the next comment's avatar/name row).

**Fix, applied identically to both `_issue-comments.tsx` and `_task-comments.tsx`:**
- `<ul>` wrapping the comment list: `flex flex-col gap-3.5` → `flex flex-col divide-y divide-dashed divide-[#E2E7F2]` (Tailwind's `divide-y` border-between-children utility, no divider before the first item).
- Each `<li>`: added `pt-1.75 pb-1.75 first:pt-0 last:pb-0` (replaces the removed `gap-3.5`, split 7px/7px around the divider so it lands symmetrically in the middle of the same 14px total spacing the list already had — `1.75` is Tailwind v4's dynamic spacing scale, same non-named-step pattern this codebase's own conventions already endorse, e.g. `py-6.5`).

**Verification:** `npx tsc --noEmit` and `pnpm lint` both clean. Not re-verified in the browser (auth-expired, same reason as above) — CSS-only change using vanilla Tailwind utilities already used elsewhere.

### Follow-up 3 (same session): Second-Column Width + Description Full-Bleed

User asked for two layout changes, both confirmed live in the browser:

1. **Right column (Description, Attachments/Comments/Time Logs) should occupy remaining width, not be capped.** `_issue-detail.tsx`'s content wrapper had `flex gap-6 max-w-5xl` (1024px cap) — removed `max-w-5xl` entirely. The `w-72 shrink-0` sidebar and `flex-1 min-w-0` right column already handled the split correctly; the only thing capping the right column's growth was the outer `max-w-5xl`.
2. **Description field should cover the entire accordion content area — no padding gap, no border-radius.** Added a `noPadding` prop to `AccordionCard` (skips its default `p-[18px]` content wrapper) and a `fullBleed` prop to `DescriptionField` (drops `rounded-[10px]`, keeps the `border` on all sides — with zero padding between it and the parent, that border now sits flush at the parent's own inner edge, and the parent's `overflow-hidden rounded-[14px]` clips the field's bottom corners to match). Both new props are opt-in — every other `AccordionCard`/`DescriptionField` usage (Details, Other Assigned, and eventually a Task Detail parity pass) is unaffected.

**Verification:** `npx tsc --noEmit` and `pnpm lint` both clean. Verified live in the browser (session was still authenticated this time) on the same issue (`50E6A31701-I0022`) used throughout this task: Description and the Attachments/Comments/Time Logs panel now both measure 1034px wide (up from the ~712px the old `max-w-5xl` cap allowed) and match each other exactly; the Description toolbar sits flush against the accordion header's divider with no radius (zoomed screenshot); clicking into the field shows the blue focus border running edge-to-edge with square corners, matching the reference image.

`#E2E7F2` matches the existing neutral border token used everywhere else in this subtree (Card/AccordionCard borders, Forms-spec input borders) — no new color introduced.

### Follow-up 4 (same session): Task Detail Parity + Scrollable Description

User asked to bring Task Detail (`_task-detail.tsx`) up to the same two visual states as Follow-up 3 above, plus a new, Task-specific requirement: a fixed height + internal scroll for the Description field.

**Task Detail parity (width + full-bleed), scoped narrowly — no structural Accordion conversion:** `_task-detail.tsx` still uses its own local, non-collapsible `Card` helper (deliberately, per this doc's original Out of Scope section — Task Detail's Card→AccordionCard conversion was never requested and stays a separate, flagged follow-up). Rather than converting it, added the identical `noPadding` prop to the *local* `Card` component (mirroring `AccordionCard`'s prop, not replacing `Card` with it) and removed the same `max-w-5xl` cap from the content wrapper. `DescriptionField` on Task Detail now gets `fullBleed` the same way Issue Detail's does.

**New: `scrollable` prop on `DescriptionField`.** Only requested for Task Detail ("the task description"), so added as a third opt-in prop (Description/Issue Detail does not pass it, and is unaffected): wraps `<EditorContent>` in a `max-h-[420px] overflow-y-auto` div, leaving the toolbar outside that wrapper so it stays fixed/visible regardless of content length. `420px` is a fixed constant, not user-configurable — reasonable middle ground between showing a useful amount of a long description and not letting it push the sidebar/Attachments panel far below the fold.

**Verification:** `npx tsc --noEmit` and `pnpm lint` both clean. Verified live in the browser on two real tasks: `D24D26E901-T0137` (CiteForge, 7402-char description) confirmed the width/full-bleed parity, though its description turned out short enough post-widening not to overflow 420px (not a bug — the wider column meant less wrapped height for the same character count, so this wasn't a real overflow test); switched to `E3E8DA1801-T0151` (Keeler Brass Company, ~100 line-breaks) which does overflow — confirmed via direct measurement (`scrollHeight: 1159` vs `clientHeight: 420`, `overflow-y: auto`) and by programmatically setting `scrollTop` and reading it back, proving the internal scroll is real and interactive, not just visually clipped.

**Verification:** `npx tsc --noEmit` and `pnpm lint` both clean. Did not re-verify in the browser for the same auth-expired reason as the follow-up above — this is a small, low-risk CSS-only change using vanilla Tailwind utilities (`divide-y`/`divide-dashed`/`divide-{color}`) already exercised elsewhere in this codebase, but flagging so a future session can eyeball it live if wanted.
