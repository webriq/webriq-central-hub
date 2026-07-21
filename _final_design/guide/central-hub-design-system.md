# WebriQ Central Hub — Design System v2.0

> Source of truth for all Hub UI. Reference before building any component, page, or module.
> Supersedes v1 (`#3358F4` / `#F97316` palette). Pairs with `central-hub-style-guide.html` (visual reference) and `webriq-central-hub-dashboard.html` (reference implementation).

**Brand colors:** `#007BFF` · `#071133` · `#FB914E` (official website palette)
**Register:** Product UI — dense, data-rich, earned familiarity. The tool disappears into the task.

---

## 1. Color

Strategy: **Restrained.** Neutral surfaces carry the interface; brand hues appear only with intent.
Color always carries meaning: navy = chrome/selection, blue = interactive, orange = act now.

### Brand

```css
--navy:        #071133;   /* sidebar chrome, headings anchor, day pills, active filters */
--navy-800:    #0C1B4A;
--navy-700:    #122459;   /* sidebar hover */
--navy-active: #16296B;   /* sidebar active item */

--blue:        #007BFF;   /* PRIMARY interactive — nav active icon, progress, focus ring */
--blue-700:    #0063D6;   /* links, pressed, Migrate phase */
--blue-100:    #E5F1FF;   /* icon-container bg, tints */
--blue-50:     #F0F7FF;   /* row hover */

--orange:      #FB914E;   /* PRIMARY CTA only — one per screen */
--orange-600:  #E2762F;   /* CTA hover, Onboard phase */
--orange-700:  #B85512;   /* orange-on-light text */
--orange-100:  #FFEFE3;   /* Onboard tint */
```

### Neutrals & ink

```css
--bg:        #F4F6FB;   /* page background (cool, blue-tinted) */
--surface:   #FFFFFF;   /* cards, panels */
--line:      #E2E7F2;   /* borders */
--line-soft: #EDF0F7;   /* row dividers, tracks */
--ink:       #0B1533;   /* headings, primary text */
--body:      #3A4565;   /* body text (≥4.5:1 on white) */
--muted:     #5F6A88;   /* labels, hints (≥4.5:1 on white) */
```

### Phase hues — 120-day programme (fixed vocabulary)

| Phase | Days | Fg | Bg tint |
|---|---|---|---|
| Onboard | 1–15 | `#E2762F` | `#FFEFE3` |
| Migrate & Rebrand | 16–30 | `#0063D6` | `#E5F1FF` |
| Publish | 31–60 | `#6A48E0` | `#EFEAFD` |
| AI Visibility | 61–90 | `#0B8A93` | `#E2F6F7` |
| Optimize | 91–120 | `#177E48` | `#E3F5EA` |

A phase hue is **never** reused for a non-phase meaning. Violet anywhere = Publish.

### Semantic states

```css
--ok:   #177E48;  --ok-bg:   #E3F5EA;   /* On track, Done */
--warn: #8A5A00;  --warn-bg: #FFF3D6;   /* Due soon, Blocked, Sign-off due */
--late: #C0392B;  --late-bg: #FDE8E6;   /* Late, Overdue, Error */
```

---

## 2. Typography

Three faces, three jobs.

| Role | Face | Rule |
|---|---|---|
| Display | **Space Grotesk** 500–700 | Page titles, panel titles, stat numbers only. Banned from buttons, labels, cells. |
| UI / body | **Inter** 400–700 | Everything else. |
| Data | **JetBrains Mono** 500–600 | Day counters, dates, IDs, counts, `⌘K`. Machine values always look like data. |

### Scale (fixed rem, never fluid — ratio ≈ 1.15–1.2)

| Style | Spec |
|---|---|
| Page title | Space Grotesk 700 · 22px · −0.015em · `--ink` |
| Panel title | Space Grotesk 600 · 15px · −0.01em · `--ink` |
| Stat number | Space Grotesk 700 · 28px · −0.02em · line-height 1 |
| Body / UI | Inter 400–600 · 13px · `--body` |
| Small label | Inter 600 · 11px · `--muted` |
| Table header | Inter 700 · 9.5px · caps · +0.09em · `--muted` |
| Mono data | JetBrains Mono 500–600 · 9–11px |

Fonts:
```html
https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@500;600&family=Space+Grotesk:wght@500;600;700&display=swap
```

---

## 3. Spacing, radius, elevation

- **4px base grid.** Panel padding 18px · page padding 24px (14px mobile) · section gap 18px · row vertical 9–12px.
- **Radius:** `--r-sm: 7px` (chips, kbd) · `--r-md: 10px` (inputs, inner) · `--r-lg: 14px` (panels, tiles) · `999px` (buttons, pills, tracks).
- **Elevation:** `--sh-sm: 0 1px 2px rgba(7,17,51,.05)` default card · `--sh-md: 0 8px 24px rgba(7,17,51,.10)` dropdown/modal · blue ring `0 0 0 2px rgba(0,123,255,.28)` logo/focus.
- Every raised surface pairs a 1px `--line` border **with** `--sh-sm`. Never shadow-only on light surfaces.
- Z-scale: `--z-sticky: 20` · `--z-popover: 40` (extend semantically; never 999).

---

## 4. Components

### Buttons — pill radius (999px), one job each
- **CTA (orange):** `--orange` bg, `#471F02` text → hover `--orange-600` + white text. **One per screen.**
- **Confirm/navigate (blue):** `--blue` bg, white → hover `--blue-700`.
- **Ghost:** white bg, `--line` border → hover border `#A8C6F5`.
- **Text link:** `--blue-700`, 600 weight.
- Sizes: default `8px 15px / 12px`; small `5.5px 12px / 11px`. Disabled: 45% opacity.
- Labels name the outcome: "Start handover," never "Submit."

### Chips — 5px radius, 10px/700
- **Status** (leading 5px dot): ok / warn / late tints.
- **Phase**: phase fg on phase tint, no dot.
- **Classification / neutral**: `--line-soft` bg, `--muted` text.
- Chips are read-only — never clickable.

### Filter pills — classification filtering
- Pill radius, 11px/600. Inactive: white + `--line` border. **Active: navy fill** (never blue — filters must not read as actions). Count in mono at 65% opacity.
- Single-select, `aria-pressed`. New classifications added by Super Admin inherit automatically.

### Programme track (signature element)
- 22px pill track on `--line-soft`; phase boundary ticks at Days 15/30/60/90 (12.5% / 25% / 50% / 75%).
- Fill: gradient from phase tint → phase hue, width `day/120 × 100%`.
- Day marker: navy pill, JetBrains Mono 9px/600, `left: day/120 × 100%`, centered via translate.
- Phase widths always to **true day scale** (15/15/30/30/30) — never equal fifths.

### Table
- Header: 9.5px/700 caps `--muted` on `#FAFBFE`, bottom `--line-soft`.
- Cells: 11–12px padding, 13px text, `--line-soft` dividers. Row hover `--blue-50`.
- First column padded 18px. Wrap in `overflow-x: auto` for mobile.

### Checklist row (intake deliverables)
- 17px checkbox, 5px radius. Done: `--ok` fill + white check, label struck through in `--muted`.
- Right-aligned mono tag (`DAY 12` / `PENDING`).

### Forms
- Inputs on `--bg`, 10px radius, 9px 12px padding → focus: white bg, `--blue` border, 3px ring `rgba(0,123,255,.14)`.
- Labels 11px/600 `--ink`, 5px below-gap. Errors: `--late` border + plain-language message (what happened, how to fix).

### Avatars
- Initials, 30px (24px in stacks, 20px in tables), fixed 6-color rotation: `#0063D6` `#6A48E0` `#0B8A93` `#B85512` `#177E48` `#44508A` — assigned per person, stable across screens.
- Stacks: −7px overlap, 2px white keyline.

### Panels
- White, `--line` border, `--r-lg`, `--sh-sm`. Head: 14px 18px padding, `--line-soft` bottom border, Space Grotesk title + optional hint + right-aligned link.

### Sidebar (navy chrome)
- 236px, `--navy`. Group labels 9px/700 caps `#5E6C9E`. Items 13px/500 `#B9C2E0` → hover `--navy-700` → active `--navy-active` pill + white text + `#5EB0FF` icon. **No left-border accent stripes.** Counts as mono pills (blue tint; orange tint = needs attention).
- Collapses to 64px icon rail ≤1080px.

---

## 5. Motion & interaction

- Transitions **160ms `cubic-bezier(.22,1,.36,1)`** on background/color/border-color; 120ms press (1px translateY).
- Compositor properties only — never animate layout.
- Row hover = `--blue-50` tint. No lifts, no scale, no page-load choreography.
- Focus: 2px `--blue` outline, 2px offset, on every interactive element.
- Loading: skeleton rows in place — never centered spinners.
- `prefers-reduced-motion: reduce` collapses all transitions. Non-negotiable.

---

## 6. Voice & tone

- **Sentence case** everywhere; caps only for table headers and mono data labels.
- Buttons name outcomes. Reminders state who + what + when: "Day 16 handover — Coastal Dental · Due Thu, Jul 23."
- Fixed programme vocabulary: Onboard, Migrate & Rebrand, Publish, AI Visibility, Optimize. Days are "Day 34."
- Empty states teach: "No clients in Publish yet — they'll appear here from Day 31."
- No exclamation points in primary UI. Errors never apologize — state the problem and the fix.

---

## 7. Do's & don'ts

**Do**
- One orange CTA per screen, maximum
- Border + soft shadow together on every raised surface
- Mono face for any day count, date, ID, or shortcut
- Phase widths to true day scale
- Navy for selection/filter states; blue for actions
- Skeletons over spinners; empty states that teach

**Don't**
- No colored left/right border accent stripes
- No gradient text, glassmorphism, or decorative blur
- No Space Grotesk in buttons, labels, or table cells
- No phase hue reused for non-phase meaning
- No orange for anything that isn't a call to action
- No nested cards; no shadow-only elevation; no page-load animation
