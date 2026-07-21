---
name: WebriQ Central Hub
description: Design System v2.0 — a restrained, light navy/blue/orange brand system for dense, data-rich operational tooling. Supersedes the v1 dark-first oklch "Night Ops Console" system below.
colors:
  navy: "#071133"
  navy-800: "#0C1B4A"
  navy-700: "#122459"
  navy-active: "#16296B"
  blue: "#007BFF"
  blue-700: "#0063D6"
  blue-100: "#E5F1FF"
  blue-50: "#F0F7FF"
  orange: "#FB914E"
  orange-600: "#E2762F"
  orange-700: "#B85512"
  orange-100: "#FFEFE3"
  bg: "#F4F6FB"
  surface: "#FFFFFF"
  line: "#E2E7F2"
  line-soft: "#EDF0F7"
  ink: "#0B1533"
  body: "#3A4565"
  muted: "#5F6A88"
  ok: "#177E48"
  ok-bg: "#E3F5EA"
  warn: "#8A5A00"
  warn-bg: "#FFF3D6"
  late: "#C0392B"
  late-bg: "#FDE8E6"
  ph-onboard: "#E2762F"
  ph-onboard-bg: "#FFEFE3"
  ph-migrate: "#0063D6"
  ph-migrate-bg: "#E5F1FF"
  ph-publish: "#6A48E0"
  ph-publish-bg: "#EFEAFD"
  ph-ai: "#0B8A93"
  ph-ai-bg: "#E2F6F7"
  ph-optimize: "#177E48"
  ph-optimize-bg: "#E3F5EA"
typography:
  page-title:
    fontFamily: "Space Grotesk, ui-sans-serif, system-ui"
    fontSize: "1.375rem"
    fontWeight: 700
    lineHeight: 1.2
    letterSpacing: "-0.015em"
  panel-title:
    fontFamily: "Space Grotesk, ui-sans-serif, system-ui"
    fontSize: "0.9375rem"
    fontWeight: 600
    letterSpacing: "-0.01em"
  stat-number:
    fontFamily: "Space Grotesk, ui-sans-serif, system-ui"
    fontSize: "1.75rem"
    fontWeight: 700
    lineHeight: 1
    letterSpacing: "-0.02em"
  body:
    fontFamily: "Inter, ui-sans-serif, system-ui"
    fontSize: "0.8125rem"
    fontWeight: 400
    lineHeight: 1.55
  small-label:
    fontFamily: "Inter, ui-sans-serif, system-ui"
    fontSize: "0.6875rem"
    fontWeight: 600
  table-header:
    fontFamily: "Inter, ui-sans-serif, system-ui"
    fontSize: "0.5938rem"
    fontWeight: 700
    letterSpacing: "0.09em"
  data:
    fontFamily: "JetBrains Mono, ui-monospace, monospace"
    fontSize: "0.6875rem"
    fontWeight: 500
rounded:
  sm: "7px"
  md: "10px"
  lg: "14px"
  full: "9999px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "16px"
  lg: "24px"
components:
  button-cta:
    backgroundColor: "{colors.orange}"
    textColor: "#471F02"
    rounded: "{rounded.full}"
    padding: "8px 15px"
  button-cta-hover:
    backgroundColor: "{colors.orange-600}"
    textColor: "#FFFFFF"
  button-blue:
    backgroundColor: "{colors.blue}"
    textColor: "#FFFFFF"
    rounded: "{rounded.full}"
  button-ghost:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.body}"
    rounded: "{rounded.full}"
  chip:
    rounded: "{rounded.sm}"
    padding: "2.5px 8px"
  card:
    backgroundColor: "{colors.surface}"
    rounded: "{rounded.lg}"
    padding: "18px"
---

# Design System: WebriQ Central Hub (v2.0)

## Adoption status — read this first

This file describes **Design System v2.0** — a full replacement of the palette and visual language previously documented here (a dark-first `oklch()` "Night Ops Console" system; see "Superseded v1 system" at the bottom of this file for the record). v2.0 is **not yet applied everywhere**. As of task 166:

- **Migrated:** `/v2/dashboard`'s content area (PM/Admin/Dev/Marketing dashboards, `src/app/v2/(hub)/dashboard/_components/*`).
- **Not yet migrated:** `v2-hub-sidebar.tsx`, the topbar (`v2-hub-header.tsx`), and every other `/v2/*` page — these still follow the v1 dark-first system and the `isDark`-prop pattern described at the bottom of this file. Do not "fix" untouched v1 files to match v2.0 on sight; migrate them via their own dedicated tasks.
- Treat this file as the **target** system for all new/redesigned Hub UI going forward, not a description of what every screen looks like today.

## 1. Overview

**Creative North Star: "Earned familiarity."**

v2.0 is a restrained, light product-UI system for dense, data-rich operational tooling — not a marketing site and not a generic SaaS admin template. Neutral surfaces (`bg`/`surface`/`line`) carry almost all of the interface; brand hues appear only with intent. Color always carries meaning: **navy = chrome and selection**, **blue = interactive**, **orange = act now**. The register is "the tool disappears into the task" — PMs and developers triaging dozens of clients a day need calm, legible density, not decoration.

**Brand colors:** `#007BFF` (blue) · `#071133` (navy) · `#FB914E` (orange) — the official WebriQ website palette, reused here rather than a bespoke product palette.

**Key Characteristics:**
- Light, cool-neutral surfaces (`bg: #F4F6FB`, `surface: #FFFFFF`) with a navy chrome anchor (sidebar) — not dark-first.
- One interactive blue, one CTA orange, one selection/chrome navy. Nothing else competes for attention.
- A fixed five-color "phase hue" vocabulary for the 120-day customer programme (Onboard/Migrate & Rebrand/Publish/AI Visibility/Optimize) — these hues are reserved exclusively for phase meaning, never reused elsewhere.
- Three type faces, three jobs: Space Grotesk for page titles/panel titles/stat numbers only, Inter for everything else, JetBrains Mono for any day count, date, ID, or shortcut.
- Small, quiet chips (10px/700, 5px radius) carry status — never color-blocked banners, never left/right accent-stripe borders.
- Every raised surface pairs a 1px border with a near-invisible shadow — never shadow-only elevation.

## 2. Color

Strategy: **restrained.** Neutral surfaces carry the interface; brand hues appear only with intent.

### Brand

- **Navy** (`#071133`, `navy-800` `#0C1B4A`, `navy-700` `#122459`, `navy-active` `#16296B`): sidebar chrome, headings anchor, day pills, active filters. Navy marks *selection/chrome*, never an action.
- **Blue** (`#007BFF`, `blue-700` `#0063D6`, `blue-100` `#E5F1FF`, `blue-50` `#F0F7FF`): the **primary interactive** color — nav active icon, progress fills, focus rings, links, confirm/navigate buttons, row hover tint (`blue-50`).
- **Orange** (`#FB914E`, `orange-600` `#E2762F`, `orange-700` `#B85512`, `orange-100` `#FFEFE3`): the **primary CTA color only — one per screen, maximum.** Never a second "primary."

### Neutrals & ink

- **Background** (`#F4F6FB`): page background — cool, blue-tinted, never pure white or gray.
- **Surface** (`#FFFFFF`): cards, panels, popovers.
- **Line** (`#E2E7F2`) / **Line-soft** (`#EDF0F7`): borders / row-dividers and tracks respectively.
- **Ink** (`#0B1533`): headings, primary text.
- **Body** (`#3A4565`): body text — ≥4.5:1 contrast on white.
- **Muted** (`#5F6A88`): labels, hints — ≥4.5:1 contrast on white.

### Phase hues — 120-day programme (fixed vocabulary)

| Phase | Days | Fg | Bg tint |
|---|---|---|---|
| Onboard | 1–15 | `#E2762F` | `#FFEFE3` |
| Migrate & Rebrand | 16–30 | `#0063D6` | `#E5F1FF` |
| Publish | 31–60 | `#6A48E0` | `#EFEAFD` |
| AI Visibility | 61–90 | `#0B8A93` | `#E2F6F7` |
| Optimize | 91–120 | `#177E48` | `#E3F5EA` |

A phase hue is **never** reused for a non-phase meaning — violet anywhere in the product means Publish, full stop.

### Semantic states

- **Ok** (`#177E48` / `#E3F5EA`): on track, done.
- **Warn** (`#8A5A00` / `#FFF3D6`): due soon, blocked, sign-off due.
- **Late** (`#C0392B` / `#FDE8E6`): late, overdue, error.

### Named Rules

**The One-CTA Rule.** Orange marks exactly one call-to-action per screen — never a second "primary" button, never a decorative accent. **Navy-for-selection, blue-for-action.** Filter pills and other selection state use navy (never blue) so they don't read as buttons; blue is reserved for things that navigate or submit.

## 3. Typography

Three faces, three jobs — no face does more than one job.

| Role | Face | Rule |
|---|---|---|
| Display | **Space Grotesk** 600–700 | Page titles, panel titles, stat numbers only. Banned from buttons, labels, table cells. |
| UI / body | **Inter** 400–700 | Everything else — body copy, labels, buttons, table cells. |
| Data | **JetBrains Mono** 500–600 | Day counters, dates, IDs, counts, keyboard shortcuts (`⌘K`). Machine values always look like data. |

Fonts are already wired app-wide via `next/font/google` in `src/app/layout.tsx` (`Space_Grotesk` → `--font-display`/`font-heading`, `Inter` → `--font-sans`, `JetBrains_Mono` → `--font-mono`) — no per-page font loading needed.

### Scale (fixed rem, never fluid — ratio ≈ 1.15–1.2)

| Style | Spec |
|---|---|
| Page title | Space Grotesk 700 · 22px · −0.015em · `ink` |
| Panel title | Space Grotesk 600 · 15px · −0.01em · `ink` |
| Stat number | Space Grotesk 700 · 28px · −0.02em · line-height 1 |
| Body / UI | Inter 400–600 · 13px · `body` |
| Small label | Inter 600 · 11px · `muted` |
| Table header | Inter 700 · 9.5px · caps · +0.09em · `muted` |
| Mono data | JetBrains Mono 500–600 · 9–11px |

### Named Rules

**The No-Shout Rule.** Hierarchy comes from the weight/size steps in the scale above, not from decoration — no gradient text, no oversized hero numbers performing importance beyond what the scale already gives them.

## 4. Spacing, Radius & Elevation

- **4px base grid.** Panel padding 18px · page padding 24px (14px on mobile) · section gap 18px · row vertical padding 9–12px.
- **Radius:** `sm` 7px (chips, `kbd`) · `md` 10px (inputs, inner elements) · `lg` 14px (panels, tiles) · `full` 999px (buttons, pills, tracks).
- **Elevation:** `sh-sm` `0 1px 2px rgba(7,17,51,.05)` — the default card shadow; `sh-md` `0 8px 24px rgba(7,17,51,.10)` — dropdowns/modals only; a blue ring `0 0 0 2px rgba(0,123,255,.28)` marks the logo mark and focus states.
- Every raised surface pairs a 1px `line` border **with** `sh-sm` — never shadow-only elevation on a light surface.
- Z-scale: `sticky` 20 · `popover` 40 — extend semantically as needed, never jump straight to `999`.

### Named Rules

**The Flat-Enough Rule.** If a shadow is being reached for to fix a hierarchy problem, fix spacing, border, or tonal contrast first — elevation is not a hierarchy tool here.

## 5. Components

### Buttons — pill radius (999px), one job each

- **CTA (orange):** `orange` background, `#471F02` text → hover `orange-600` background, white text. **One per screen, maximum.**
- **Confirm/navigate (blue):** `blue` background, white text → hover `blue-700`.
- **Ghost:** white background, `line` border → hover border `#A8C6F5`.
- **Text link:** `blue-700`, 600 weight.
- Sizes: default `8px 15px` padding / 12px text; small `5.5px 12px` / 11px text. Disabled: 45% opacity.
- Labels name the outcome — "Start handover," never "Submit."

### Chips — 5px radius, 10px/700

- **Status** (leading 5px dot): `ok`/`warn`/`late` tints.
- **Phase**: phase foreground on phase tint, no dot.
- **Classification / neutral**: `line-soft` background, `muted` text.
- Chips are read-only — never clickable, never a substitute for a button.

### Filter pills — classification/selection filtering

- Pill radius, 11px/600. Inactive: white + `line` border. **Active: navy fill** — never blue, so filters don't read as actions. Count shown in mono at 65% opacity. Single-select, `aria-pressed`.

### Programme track (signature element)

- 22px pill track on `line-soft`; phase-boundary ticks at Days 15/30/60/90 (12.5% / 25% / 50% / 75% of the track width).
- Fill: gradient from phase tint → phase hue, width `day / 120 × 100%`.
- Day marker: navy pill, JetBrains Mono 9px/600, positioned at `left: day/120 × 100%`, centered via transform.
- Phase widths are always to **true day scale** (15/15/30/30/30 days) — never rendered as equal fifths.

### Table

- Header: 9.5px/700 caps `muted` text on `#FAFBFE` background, `line-soft` bottom border.
- Cells: 11–12px padding, 13px text, `line-soft` dividers. Row hover: `blue-50` tint.
- First column padded 18px. Wrap in `overflow-x: auto` for mobile.

### Checklist row (intake deliverables)

- 17px checkbox, 5px radius. Done: `ok` fill + white check, label struck through in `muted`.
- Right-aligned mono tag (`DAY 12` / `PENDING`).

### Forms

- Inputs on `bg`, 10px radius, 9px/12px padding → focus: white background, `blue` border, 3px ring `rgba(0,123,255,.14)`.
- Labels 11px/600 `ink`, 5px gap below. Errors: `late` border + a plain-language message stating what happened and how to fix it.

### Avatars

- Initials, 30px default (24px in stacks, 20px in tables), fixed 6-color rotation (`#0063D6` `#6A48E0` `#0B8A93` `#B85512` `#177E48` `#44508A`) assigned per person, stable across screens.
- Stacks: −7px overlap, 2px white keyline.

### Panels / Cards

- White surface, `line` border, `lg` radius, `sh-sm` shadow.
- Head: 14px/18px padding, `line-soft` bottom border, Space Grotesk panel title + optional hint text + right-aligned link.

### Sidebar (navy chrome) — target spec, not yet applied (see Adoption status)

- 236px wide, `navy` background. Group labels 9px/700 caps `#5E6C9E`. Items 13px/500 `#B9C2E0` → hover `navy-700` background → active `navy-active` pill background + white text + `#5EB0FF` icon.
- **No left-border accent stripes** — the current v1 sidebar's `border-l-[3px]` active-item stripe violates this rule and needs fixing when the sidebar is migrated (tracked as follow-up, not part of task 166).
- Counts shown as mono pills — blue tint by default, orange tint when something needs attention.
- Collapses to a 64px icon rail at ≤1080px viewport width.

## 6. Motion & Interaction

- Transitions: **160ms `cubic-bezier(.22,1,.36,1)`** on background/color/border-color; 120ms press (1px `translateY`).
- Compositor properties only — never animate layout-affecting properties.
- Row hover = `blue-50` tint. No lifts, no scale transforms, no page-load choreography.
- Focus: 2px `blue` outline, 2px offset, on every interactive element.
- Loading: skeleton rows in place — never a centered spinner.
- `prefers-reduced-motion: reduce` collapses all transitions. Non-negotiable.

## 7. Voice & Tone

- **Sentence case** everywhere; caps reserved for table headers and mono data labels.
- Buttons name outcomes. Reminders state who + what + when — "Day 16 handover — Coastal Dental · Due Thu, Jul 23."
- Fixed programme vocabulary: Onboard, Migrate & Rebrand, Publish, AI Visibility, Optimize. Days are always phrased "Day 34," never "day thirty-four" or "34/120" in prose (mono `34/120` is fine in a data cell).
- Empty states teach: "No clients in Publish yet — they'll appear here from Day 31," never a bare "No data."
- No exclamation points in primary UI. Errors never apologize — state the problem and the fix.

## 8. Do's and Don'ts

### Do:
- **Do** keep orange as the only call-to-action color, one per screen, maximum.
- **Do** use navy for selection/filter state, blue for anything that navigates or submits.
- **Do** pair a 1px `line` border with `sh-sm` shadow on every raised surface — border + soft shadow together, never shadow-only.
- **Do** use JetBrains Mono for any day count, date, ID, or shortcut; reserve Space Grotesk (`font-heading`) for page titles, panel titles, and stat numbers only.
- **Do** render phase widths to true day scale (15/15/30/30/30), never as equal fifths.
- **Do** communicate status with hue + a short text label together (chips), never color alone.
- **Do** use skeleton rows over spinners, and empty states that teach rather than a bare "No data."

### Don't:
- **Don't** use a colored left/right border accent stripe on cards, list items, or sidebar nav as a status/active indicator — use the chip pattern or a filled pill instead.
- **Don't** use gradient text, glassmorphism, or decorative blur anywhere.
- **Don't** use Space Grotesk in buttons, labels, or table cells.
- **Don't** reuse a phase hue for a non-phase meaning.
- **Don't** use orange for anything that isn't the one call-to-action on the screen.
- **Don't** nest cards inside cards; don't rely on shadow-only elevation; don't add page-load animation.
- **Don't** ship generic SaaS-dashboard clichés — no gradient hero-metric cards, no cookie-cutter icon-in-a-box grids.

---

## Superseded v1 system (record only — do not build against this)

The previous iteration of this document described a **dark-first** "Night Ops Console" system: a deep navy void (`oklch(0.09 0.02 264)`) with a single glowing Signal Blue accent (`oklch(0.75 0.18 215)`), Deep Cobalt (`#3358F4`) as the light-mode brand blue, and Ember Orange (`#F97316`) as a sparing warm accent. It used the `isDark`-prop pattern (explicit paired light/dark Tailwind classes chosen via a boolean prop, never a `dark:` Tailwind variant or `bg-background`/`text-foreground` semantic token) for any themed v2 surface.

**That pattern is still live and correct for every v2 surface not yet migrated to v2.0** (see Adoption status at the top of this file) — do not introduce `dark:` variants there, and do not "helpfully" convert an untouched v1 file to v2.0 tokens outside of its own dedicated migration task. The full v1 color/typography/component spec that used to live in this file is preserved in git history (see this file's history prior to task 166) rather than duplicated here.
