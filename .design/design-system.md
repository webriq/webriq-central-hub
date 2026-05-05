# WebriQ Central Hub — Design System

> Source of truth for all UI design decisions. Every new component, page, or feature must reference this document before implementation.

---

## Table of Contents

1. [Brand Identity](#brand-identity)
2. [Color System](#color-system)
3. [Typography](#typography)
4. [Spacing & Layout](#spacing--layout)
5. [Border Radius](#border-radius)
6. [Shadows & Elevation](#shadows--elevation)
7. [Components](#components)
   - [Buttons](#buttons)
   - [Cards](#cards)
   - [Badges & Status Chips](#badges--status-chips)
   - [Forms & Inputs](#forms--inputs)
   - [Navigation](#navigation)
   - [Tables](#tables)
   - [Icon Containers](#icon-containers)
8. [Voice & Tone](#voice--tone)
9. [Do's & Don'ts](#dos--donts)

---

## Brand Identity

**WebriQ Central Hub** is an internal operations platform — a unified layer above Zoho, Sanity, GitHub, and Supabase. The visual language is **dense, data-rich, and professional**. It shares the WebriQ brand foundations but is expressed as a dashboard application, not a marketing site.

### Palette Summary

| Role | Color | Hex |
|---|---|---|
| Sidebar background | Deep navy | `#070E1F` |
| Page background (light) | Off-white | `#F7F8FA` |
| Surface / Cards | White | `#FFFFFF` |
| Brand blue (interactive) | Electric blue | `#3358F4` |
| Brand orange (CTA) | Orange | `#F97316` |
| Success | Green | `#22C55E` |
| Error | Red | `#EF4444` |

### Logo Mark

The WebriQ logo uses a stylized W path inside a circular gradient badge:

```
gradient: linear-gradient(135deg, #1a4ccc 0%, #3358F4 60%, #6B8FFF 100%)
ring:      box-shadow: 0 0 0 2px rgba(51,88,244,0.3)
```

SVG path: `M3.5 14 L7 6 L10 12 L13 8 L16.5 14` (stroke, white, strokeWidth 2.4)

---

## Color System

### Base Tokens

```css
/* Navy / Dark Backgrounds */
--color-navy-950:  #070E1F   /* sidebar, deepest dark */
--color-navy-900:  #0A1628   /* hero, footer */
--color-navy-800:  #0F1E3C   /* dark feature sections */
--color-navy-700:  #112040   /* card on dark */
--color-navy-600:  #1A2F5A   /* hover on dark cards */

/* Brand Blue */
--color-blue-600:  #2244D8   /* pressed */
--color-blue-500:  #3358F4   /* PRIMARY — active states, links, progress bars */
--color-blue-400:  #4B6EFF   /* icon containers, active icons */
--color-blue-300:  #7B9DFF   /* muted interactive */
--color-blue-200:  #B8CAFE   /* subtle tint */
--color-blue-100:  #EEF2FF   /* badge bg, table highlight */

/* Orange — CTA Only */
--color-orange-600: #D96210  /* pressed CTA */
--color-orange-500: #F97316  /* PRIMARY CTA — "New Project", "Submit" */
--color-orange-400: #FA9446  /* hover */
--color-orange-100: #FFF4EC  /* Onboarding badge bg */

/* Neutral Grays */
--color-gray-950:  #0F172A   /* strongest text on light */
--color-gray-900:  #1E293B   /* primary headings */
--color-gray-800:  #334155   /* section labels, strong secondary */
--color-gray-700:  #475569   /* body text */
--color-gray-600:  #64748B   /* secondary text, muted labels */
--color-gray-500:  #94A3B8   /* tertiary, timestamps, meta */
--color-gray-400:  #CBD5E1   /* text on dark */
--color-gray-300:  #E2E8F0   /* borders on light backgrounds */
--color-gray-200:  #F1F5F9   /* surface-alt, dividers */
--color-gray-100:  #F7F8FA   /* page background */

/* Semantic States */
--color-success:  #22C55E
--color-warning:  #F59E0B
--color-error:    #EF4444
--color-info:     #4B6EFF
```

### Semantic Aliases (use these in components)

```css
--bg-page:         #FFFFFF    /* card/content surfaces */
--bg-page-alt:     #F7F8FA   /* page wrapper, dashboard bg */
--bg-dark:         #0A1628   /* sidebar, dark sections */
--fg-primary:      #1E293B   /* headings, primary text */
--fg-secondary:    #475569   /* body text */
--fg-tertiary:     #94A3B8   /* metadata, timestamps */
--border-light:    #E2E8F0   /* card borders */
--border-dark:     rgba(255,255,255,0.07)  /* sidebar borders */
```

### Status Colors (for badges/chips)

| Status | Background | Text |
|---|---|---|
| In Progress | `#EEF2FF` | `#3358F4` |
| Onboarding | `#FFF4EC` | `#F97316` |
| Review | `#FDF4FF` | `#7C3AED` |
| Planning | `#F1F5F9` | `#64748B` |
| Completed | `#F0FDF4` | `#16A34A` |
| High priority | `#FEF2F2` | `#DC2626` |
| Medium / Normal | `#FFF7ED` | `#C2410C` |
| Low priority | `#F0FDF4` | `#166534` |

---

## Typography

### Font Family

**Primary:** `Sora` (Google Fonts) — loaded via Next.js `next/font/google`

```ts
import { Sora } from "next/font/google";
const sora = Sora({
  subsets: ["latin"],
  variable: "--font-sans",
  weight: ["300","400","500","600","700","800"]
});
```

**Mono:** `Geist Mono` — used for IDs, codes, monospace values

### Type Scale

| Token | Size | Weight | Use |
|---|---|---|---|
| Display hero | 72px / 4.5rem | 800 | Landing page H1 only |
| H1 | 48px / 3rem | 700 | Page-level heading |
| H2 | 36px / 2.25rem | 700 | Section heading |
| H3 | 20px / 1.25rem | 600 | Card title |
| H4 | 18px / 1.125rem | 600 | Subsection heading |
| Body large | 16px / 1rem | 400 | Default body |
| Body small | 14px / 0.875rem | 400 | Secondary text |
| Label / UI | 13px | 500–600 | Sidebar nav, form labels |
| Eyebrow | 11–12px | 600–700 | Section labels, ALL CAPS, letter-spacing: 0.06–0.1em |
| Meta | 11px | 400 | Timestamps, IDs |
| Mono | 11–15px | 400–700 | Client IDs, project codes |

### Stat Display (Dashboard)

Large metrics use a special display style:
```css
font-size: 32px;
font-weight: 800;
letter-spacing: -0.02em;
line-height: 1;
color: <brand color>;
```

### Line Heights

```css
--leading-tight:   1.15   /* display, hero headings */
--leading-snug:    1.3    /* section headings, card titles */
--leading-normal:  1.5    /* labels, short body */
--leading-relaxed: 1.65   /* body paragraphs */
```

---

## Spacing & Layout

### Spacing Scale

| Token | Value | Usage |
|---|---|---|
| 4px | `--space-1` | Icon padding, tight gaps |
| 8px | `--space-2` | Button icon gap, chip padding |
| 12px | `--space-3` | Card internal compact |
| 16px | `--space-4` | Standard gap, field spacing |
| 20px | `--space-5` | Card padding (compact) |
| 24px | `--space-6` | Page padding, card padding (default) |
| 32px | `--space-8` | Section inner padding, card padding (large) |
| 40px | `--space-10` | Component vertical margins |
| 64px | `--space-16` | Section separation |
| 80px | `--space-20` | Page section vertical padding |

### Layout Grid

| Element | Width |
|---|---|
| Sidebar (expanded) | 220px |
| Sidebar (collapsed) | 56px |
| Hub content max-width | ~1040px fluid |
| Design canvas width | 1280px |
| Form max-width | 740px |

### Page Background

```css
/* Hub shell wrapper */
background: #F7F8FA;

/* Cards / surfaces */
background: #FFFFFF;
border: 1px solid #E2E8F0;
border-radius: 12px;
box-shadow: 0 1px 4px rgba(0,0,0,0.05);
```

---

## Border Radius

| Token | Value | Use |
|---|---|---|
| `--radius-sm` | 4px | Badges, tags, status chips |
| `--radius-md` | 8px | Inputs, icon buttons, nav items |
| `--radius-lg` | 12px | Cards (primary card radius) |
| `--radius-xl` | 16px | Large panels |
| `--radius-2xl` | 20px | Modal dialogs |
| `--radius-full` | 9999px | Pill buttons, avatars, filter tabs |

---

## Shadows & Elevation

```css
/* Default card */
box-shadow: 0 1px 4px rgba(0,0,0,0.05);

/* Medium elevation (modals, dropdowns) */
box-shadow: 0 4px 16px rgba(0,0,0,0.10);

/* Dark surface cards (on navy bg) */
box-shadow: 0 4px 24px rgba(0,0,0,0.30);

/* Logo mark ring */
box-shadow: 0 0 0 2px rgba(51,88,244,0.3);
```

The design is **flat-first** — shadows are minimal. Depth is defined by borders and background contrast, not heavy drop shadows.

---

## Components

### Buttons

#### Primary CTA (Orange — action/submit)
```css
background: #F97316;
color: #FFFFFF;
border: 2px solid #F97316;
border-radius: 9999px;      /* pill */
padding: 10px 22px;
font-size: 13px;
font-weight: 600;
```
- Used for: "New Project", "Submit Onboarding", "Continue →"
- Hover: `background: #D96210`

#### Primary Blue (navigation/confirm)
```css
background: #3358F4;
color: #FFFFFF;
border: 2px solid #3358F4;
border-radius: 9999px;
padding: 10px 22px;
font-size: 13px;
font-weight: 600;
```
- Used for: "Continue →" in multi-step forms

#### Secondary / Ghost
```css
background: transparent;
color: #64748B;
border: 1.5px solid #E2E8F0;
border-radius: 9999px;
padding: 10px 22px;
```
- Used for: "← Back", cancel actions

#### Small Action Button (inline)
```css
background: #EEF2FF;
color: #3358F4;
border: none;
border-radius: 8px;
padding: 8px;
font-size: 12px;
font-weight: 600;
```
- Used for: "+ Log Time", secondary inline actions

---

### Cards

#### Standard Light Card
```css
background: #FFFFFF;
border: 1px solid #E2E8F0;
border-radius: 12px;
padding: 18px 20px;
box-shadow: 0 1px 4px rgba(0,0,0,0.05);
```

#### Dark Card (on navy bg)
```css
background: #112040;
border: 1px solid rgba(255,255,255,0.08);
border-radius: 12px;
padding: 32px;
```

#### Card Header Pattern
```tsx
<div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
  <span style={{ fontSize: 14, fontWeight: 700, color: "#0F172A" }}>Card Title</span>
  <span style={{ fontSize: 12, color: "#3358F4", cursor: "pointer", fontWeight: 500 }}>View all →</span>
</div>
```

---

### Badges & Status Chips

```tsx
<span style={{
  display: "inline-block",
  padding: "2px 8px",
  borderRadius: 4,
  fontSize: 11,
  fontWeight: 600,
  background: sc.bg,
  color: sc.color
}}>
  {status}
</span>
```

Sizes:
- Standard badge: `padding: 2px 8px`, `font-size: 11px`, `border-radius: 4px`
- Pill badge: `padding: 2px 10px`, `border-radius: 9999px`

---

### Forms & Inputs

#### Text Input
```css
font-family: inherit;
width: 100%;
font-size: 13px;
padding: 9px 12px;
border: 1px solid #E2E8F0;
border-radius: 8px;
color: #0F172A;
background: #FFFFFF;
outline: none;
```

#### Search Input (header)
```css
font-size: 13px;
padding: 7px 12px 7px 30px;  /* left pad for icon */
border: 1px solid #E2E8F0;
border-radius: 8px;
background: #F7F8FA;
width: 240px;
```

#### Select
Same as text input — `appearance: auto`, same sizing.

#### Label
```css
display: block;
font-size: 12px;
font-weight: 600;
color: #334155;
margin-bottom: 5px;
```

#### Form Row (two-column)
```tsx
<div style={{ display: "flex", gap: 14 }}>
  <Field ... />
  <Field ... />
</div>
```

#### Textarea
Same as input with `height: 80px; resize: vertical`

---

### Navigation

#### Sidebar Nav Item
```css
/* Active */
background: rgba(51,88,244,0.15);
border-left: 2px solid #3358F4;
border-radius: 0 8px 8px 0;
margin-right: 8px;

/* Icon color (active) */
color: #4B6EFF;

/* Label (active) */
font-size: 13px;
font-weight: 600;
color: #FFFFFF;

/* Label (inactive) */
font-size: 13px;
font-weight: 400;
color: #94A3B8;
```

#### Section Group Label
```css
font-size: 9px;
font-weight: 700;
letter-spacing: 0.1em;
text-transform: uppercase;
color: #334155;
padding: 10px 14px 4px;
```

#### Header Bar
```css
height: 60px;
background: #FFFFFF;
border-bottom: 1px solid #E2E8F0;
padding: 0 24px;
```

---

### Tables

#### Table Header Cell
```css
font-size: 10px;
font-weight: 700;
color: #94A3B8;
letter-spacing: 0.06em;
text-transform: uppercase;
padding: 6px 8px;
text-align: left;
border-bottom: 1px solid #F1F5F9;
```

#### Table Data Cell
```css
padding: 10px 8px;
font-size: 13px;
color: #475569;
vertical-align: middle;
border-bottom: 1px solid #F1F5F9;
```

#### Progress Bar (in table)
```css
/* Track */
height: 5px;
background: #F1F5F9;
border-radius: 9999px;
min-width: 48px;

/* Fill */
background: #3358F4;        /* or #22C55E for 100% */
border-radius: 9999px;
```

---

### Icon Containers

Used in feature/dashboard cards:
```css
width: 40px;
height: 40px;
border-radius: 10px;
background: #3358F4;
display: flex;
align-items: center;
justify-content: center;
```
Icon inside: `width: 20px; height: 20px; stroke: white`

For sidebar/header icon buttons:
```css
width: 34px;
height: 34px;
border-radius: 8px;
border: 1px solid #E2E8F0;
background: transparent;
```

#### Avatars (initials)
```css
width: 30–32px;
height: 30–32px;
border-radius: 50%;
background: #3358F4;   /* or role color */
color: #FFFFFF;
font-size: 10–11px;
font-weight: 700;
```

Team avatar stack: `margin-left: -6px; border: 2px solid #FFFFFF` on each overlapping avatar.

---

## Voice & Tone

- **Direct, confident, outcome-focused.** No fluff.
- **Title Case** for page headings and card titles.
- **Sentence case** for body copy, descriptions, placeholder text.
- **ALL CAPS** for eyebrow labels and section group labels (sidebar).
- **No exclamation points** in primary UI copy.
- Product codes/IDs in monospace: `WRQ-001`, `WRQ-CLIENT-XXXX`, `ZP-10293`
- Use numerals always: "5 overdue", "24 active", "87%"
- Timestamps: relative format — "2m ago", "1h ago", "1d ago"

---

## Do's & Don'ts

### Colors
- **Do** use `#3358F4` for all interactive/active states (progress bars, active nav, links)
- **Do** use `#F97316` exclusively for primary CTAs ("New", "Submit", "Continue")
- **Do** use `#22C55E` for success/completion states (100% progress, green badges)
- **Don't** use the orange for anything other than primary CTAs
- **Don't** use raw Tailwind color classes — use explicit hex values or CSS vars
- **Don't** mix light and dark themes within a single card

### Typography
- **Do** use Sora for all UI text
- **Do** use monospace (Geist Mono / `font-family: monospace`) for codes, IDs, project numbers
- **Don't** use font sizes below 10px
- **Don't** use font weight below 400 in UI components
- **Don't** use underlines for navigation — use color + weight for active state

### Layout
- **Do** use 24px as the default page padding (`padding: 24px`)
- **Do** use 14–16px gap between sibling cards
- **Do** use 12px border-radius on all cards
- **Do** maintain the 220px sidebar / light content area split
- **Don't** put the aurora/dark background inside hub pages — it's for the landing page only
- **Don't** use `margin: auto` for content centering inside the hub — use flex layout

### Interaction
- **Do** use `transition: background 150ms` on hover states
- **Do** show left-border + blue tint for active sidebar items
- **Don't** use heavy transforms or scale effects on hover — subtle color transitions only
- **Don't** use auto-playing animations in data tables or feeds

### Components
- **Do** add shadcn components via `npx shadcn add <component>` — they land in `src/components/ui/`
- **Do** use lucide-react for all icons (stroke style, 16–18px in nav/tables, 20px in icon containers)
- **Don't** use emoji as icons
- **Don't** write inline SVG in component files — use lucide-react imports

---

*Last updated: May 2026 · Source: Claude Design handoff + webriq.com screenshot analysis*
