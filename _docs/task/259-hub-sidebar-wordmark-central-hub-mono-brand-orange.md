# 259: Hub Sidebar Wordmark — "WebriQ Central Hub" Lockup, Mono Font, Brand Orange, Collapse-Button Overlap Fix

**Created:** 2026-08-17
**Priority:** LOW
**Type:** enhancement
**Recommended Tier:** fast
**Status:** Completed

---

## Overview

The v2 hub sidebar's wordmark (`V2HubSidebar`, the only sidebar actually rendered — see Out of Scope) showed a bare "WebriQ." — "WebriQ" in white plus a hardcoded blue (`#2563EB`) period — next to the `/logo.png` icon. The user supplied a reference image of the desired lockup: icon + "WebriQ" (white) + "Central Hub" (colored), all inline on one line, and asked for this treatment in the sidebar. Follow-up requests in the same session refined the font, letter-spacing/size, and accent color, and a layout bug surfaced once the longer wordmark was in place.

This was executed conversationally (no separate implement/simplify/test stages) — each change was applied directly and verified live via Claude in Chrome browser automation against `http://localhost:3000/v2/dashboard`. This doc records it after the fact per the user's request.

## Requirements

- [x] Sidebar wordmark reads "WebriQ" + "Central Hub" inline next to the existing `/logo.png` icon, matching the user's reference image.
- [x] Wordmark font is the project's mono font (`font-mono` / JetBrains Mono).
- [x] Wordmark letter-spacing and size match the `/auth` wordmark convention (`AuthSplitShell`).
- [x] "Central Hub" renders in brand orange, not the original hardcoded blue.
- [x] The collapse ("minimize") chevron button does not visually overlap the wordmark text.

## Out of Scope / Must Not Change

- `src/components/hub/hub-sidebar.tsx` (the old v1 sidebar) — confirmed unused; only referenced by the archived `src/app/_hub_(OLD)/layout.tsx`, which is not part of the live route tree. Left untouched.
- The collapsed-sidebar state's centered icon-only rendering — unaffected by these changes, re-verified after the padding fix.
- Nav items, user footer, and every other part of `V2HubSidebar` below the wordmark row.

## Proposed File Changes

| File | Action | Purpose |
|------|--------|---------|
| `src/app/(hub)/_components/v2-hub-sidebar.tsx` | Modify | Wordmark markup/copy, font, tracking/size, color, header row padding |

## Implementation Notes

### What Changed
All changes are in the wordmark row of `V2HubSidebar`'s expanded (non-collapsed) header, `src/app/(hub)/_components/v2-hub-sidebar.tsx:129-150`:

1. **Lockup copy** — replaced `WebriQ<span style={{ color: "#2563EB" }}>.</span>` with two spans: `<span className="text-white">WebriQ</span>` + `<span ...>Central Hub</span>`, matching the user's reference image.
2. **Font** — added `font-mono` to the wrapping `<span>`. The project already wires JetBrains Mono as `--font-mono` (`src/app/layout.tsx:14`, `src/app/globals.css:11`), so this needed no new font loading.
3. **Size/tracking** — changed from `text-[18px] tracking-[-0.02em]` to `text-base tracking-tight`, matching the letter-spacing/size convention already established by the `/auth` wordmark in `src/components/auth/auth-split-shell.tsx:67` (`text-base font-heading` under a `tracking-tight` parent). Note: `/auth` itself uses `font-heading` (Space Grotesk), not mono — only the **size and tracking** were matched, per the explicit request to keep the mono font from the prior step.
4. **Color** — changed "Central Hub" from the hardcoded `style={{ color: "#2563EB" }}` to `className="text-brand-orange"`, pointing at the existing `--color-brand-orange: #F97316` design token (`src/app/globals.css:52`) rather than introducing a new literal hex.
5. **Collapse-button overlap fix** — the wordmark (200px measured via live DOM `getBoundingClientRect()`) plus the collapse button (24px) exactly filled the 224px available row width (264px sidebar − 24px left padding − 16px right padding), leaving a **0px** gap between the "b" in "Hub" and the chevron — visually read as overlap. Reduced the header row's `paddingRight` from `16` to `8` in the expanded state only (`collapsed ? 0 : 16` → `collapsed ? 0 : 8`), freeing 8px that `justifyContent: "space-between"` now renders as an actual gap. Collapsed-state centering (`paddingLeft/Right: 0`, icon-only) is untouched.

### Files Changed
- `src/app/(hub)/_components/v2-hub-sidebar.tsx` — wordmark copy/markup, `font-mono`, `text-base tracking-tight`, `text-brand-orange`, header `paddingRight` (16 → 8, expanded state only)

### Deviations From Plan
- None — there was no upfront plan; each step was a direct, incremental chat request applied and verified in turn.

### Verification Run
- Live browser verification via Claude in Chrome against `http://localhost:3000/v2/dashboard` after each change: wordmark copy/lockup, font-mono rendering, size/tracking match, brand-orange color, and — for the overlap fix — measured actual `getBoundingClientRect()` values for the wordmark and button (confirmed 200px + 24px = 224px = exactly the available width before the fix, i.e. 0px gap) and re-screenshotted both expanded and collapsed states after the padding change to confirm the gap and confirm collapsed-state centering was unaffected.
- No `npx tsc --noEmit` / `pnpm lint` run — no type or logic changes, only JSX text/className/inline-style edits to an existing file.

### Note on `impeccable` design-hook findings
The PostToolUse design hook flagged pre-existing `design-system-color`/`design-system-font-size` findings on this file (e.g. `#0F172A`, `#64748B`, `#475569` inline styles) on every edit in this session. All are pre-existing values in `V2HubSidebar` untouched by these changes, consistent with this codebase's documented v2 convention of explicit inline hex colors rather than design tokens (`CLAUDE.md`'s "UI Polish Conventions → Rejected/superseded" section). The one color this task did change — "Central Hub"'s accent — was moved **off** a literal hex (`#2563EB`) and **onto** the existing `--color-brand-orange` token, which is a fix in the direction the hook wants, not new drift.

## Quality Gate Notes

### Result
PASS

### Standards Review
- Change is scoped entirely to one file's wordmark row; no other sidebar behavior touched.
- Reused existing tokens/utilities (`--font-mono`, `--color-brand-orange`, Tailwind's `tracking-tight`/`text-base`) rather than introducing new literals, except where the file's own established convention already uses inline hex (untouched, pre-existing).
- Collapse-button fix addressed the actual measured root cause (zero gap from padding math), not a guess — confirmed via live DOM measurement before and after.

### Deviations
- None.

### Required Fixes
- None.
