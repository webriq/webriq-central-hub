---
name: WebriQ Central Hub
description: Dark-first ops console synthesizing Zoho, Sanity, GitHub, and Supabase into one AI-powered operational layer.
colors:
  void-navy: "oklch(0.09 0.02 264)"
  console-panel: "oklch(0.12 0.018 264)"
  hairline-white: "oklch(1 0 0 / 7%)"
  ink: "oklch(0.97 0.004 264)"
  ink-muted: "oklch(0.58 0.02 264)"
  signal-blue: "oklch(0.75 0.18 215)"
  deep-cobalt: "#3358F4"
  ember-orange: "#F97316"
  alert-red: "oklch(0.65 0.22 25)"
  chart-violet: "oklch(0.70 0.20 280)"
  chart-magenta: "oklch(0.72 0.20 300)"
  chart-teal: "oklch(0.68 0.18 165)"
typography:
  display:
    fontFamily: "Sora, ui-sans-serif, system-ui"
    fontSize: "1.5rem"
    fontWeight: 700
    lineHeight: 1.2
    letterSpacing: "normal"
  headline:
    fontFamily: "Sora, ui-sans-serif, system-ui"
    fontSize: "1.125rem"
    fontWeight: 600
    lineHeight: 1.3
  body:
    fontFamily: "Sora, ui-sans-serif, system-ui"
    fontSize: "0.875rem"
    fontWeight: 400
    lineHeight: 1.5
  label:
    fontFamily: "Sora, ui-sans-serif, system-ui"
    fontSize: "0.6875rem"
    fontWeight: 600
    letterSpacing: "0.01em"
  data:
    fontFamily: "Geist Mono, ui-monospace, monospace"
    fontSize: "0.75rem"
    fontWeight: 500
rounded:
  sm: "calc(var(--radius) * 0.6)"
  md: "calc(var(--radius) * 0.8)"
  lg: "var(--radius)"
  xl: "calc(var(--radius) * 1.4)"
  full: "9999px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "16px"
  lg: "24px"
components:
  button-primary:
    backgroundColor: "{colors.signal-blue}"
    textColor: "{colors.void-navy}"
    rounded: "{rounded.lg}"
    padding: "0 10px"
    height: "32px"
  button-primary-hover:
    backgroundColor: "{colors.signal-blue}"
  button-outline:
    backgroundColor: "transparent"
    textColor: "{colors.ink}"
    rounded: "{rounded.lg}"
  badge-pill:
    textColor: "{colors.ink-muted}"
    rounded: "{rounded.full}"
    padding: "2px 6px"
  card:
    backgroundColor: "{colors.console-panel}"
    rounded: "{rounded.xl}"
    padding: "16px"
---

# Design System: WebriQ Central Hub

## 1. Overview

**Creative North Star: "The Night Ops Console"**

The Hub is a dark-first mission-control surface, not a bright SaaS dashboard. The default view (`.dark` in `globals.css`) is a deep navy void — `oklch(0.09 0.02 264)`, close to `#020817` — with a single glowing accent, Signal Blue, doing almost all of the attention-directing work. Everything else sits in muted navy tones so that when something needs a decision, it's the only thing that reads as "on." This is deliberate: the Hub sits above Zoho, Sanity, GitHub, and Supabase and exists to shorten the human decision loop, not to compete for visual attention with the systems of record underneath it.

Light mode exists (used in the customer-facing onboarding form and some PM-tab light views) but the console is dark-first by convention — see the `/* Light (fallback — Hub is dark-first) */` comment in `globals.css`. Depth comes from tonal layering (navy-on-navy, hairline borders) and near-invisible shadows, never heavy drop shadows or glassmorphism. This system explicitly rejects generic SaaS dashboard clichés — gradient hero-metric cards, identical icon-in-a-box grids, cookie-cutter admin templates — in favor of something that reads as built specifically for how PMs and developers actually triage work here.

**Key Characteristics:**
- Dark-first navy void with one glowing accent color, not a rainbow of equally-loud UI colors.
- Flat, tonal depth — hairline borders and near-invisible shadows, no glassmorphism, no heavy elevation.
- Precise, mono-tinged data (Geist Mono for numbers, timestamps, IDs) paired with a warm geometric sans (Sora) for everything else.
- Small, quiet pill badges (10–11px, `rounded-full`) carry status, not color-blocked banners.
- Every themed surface pairs an explicit light/dark class via an `isDark` boolean prop — no `dark:` Tailwind variant, no CSS-variable `bg-background`/`text-foreground` tokens inside `src/app/v2`.

## 2. Colors

The palette is restrained and role-driven: one glowing signal color against a near-black navy field, with a second cobalt blue reserved for light-mode contexts, and orange used sparingly as the only warm note in the system.

### Primary
- **Signal Blue** (`oklch(0.75 0.18 215)`, sky-400 range): the dark-mode primary — focus rings, active nav state, links, `chart-1`, `sidebar-primary`. This is the one color allowed to glow; it marks "this is active, this is the answer, look here."

### Secondary
- **Deep Cobalt** (`#3358F4`): the light-mode brand blue — PM-tab light theme accents, nav-active background tint (`rgba(51, 88, 244, 0.15)`), and anywhere the Hub needs a brand-recognizable blue outside the dark console theme.

### Tertiary
- **Ember Orange** (`#F97316`): the only warm accent in the system. Used sparingly for orange-coded chart series and specific status states (e.g. `pm-dark`'s `--c-orange`) — never as a second "primary," always a deliberate, occasional flag.

### Neutral
- **Void Navy** (`oklch(0.09 0.02 264)` / `#020817`): the dark-mode page background. The base the whole console sits on.
- **Console Panel** (`oklch(0.12 0.018 264)`): card and popover surfaces — one step lighter than Void Navy, never a jump to pure gray.
- **Hairline White** (`oklch(1 0 0 / 7%)`): borders and dividers on dark surfaces — always translucent white over navy, never a flat gray stroke.
- **Ink** (`oklch(0.97 0.004 264)`): primary text on dark surfaces — near-white with a faint cool tint, not pure `#fff`.
- **Ink Muted** (`oklch(0.58 0.02 264)`): secondary/muted text — captions, timestamps, helper copy.
- **Alert Red** (`oklch(0.65 0.22 25)`): destructive actions and error states only.

### Named Rules
**The One Glow Rule.** Signal Blue (or Deep Cobalt in light contexts) is the only color allowed to read as "lit up" on a screen. Status pills borrow amber/green/red/violet at low opacity for meaning, but none of them compete with the primary accent for visual weight.

## 3. Typography

**Display/Body Font:** Sora (weight 300–800, variable via `next/font/google`), falling back to system sans.
**Data/Label Font:** Geist Mono, used specifically for numbers, IDs, timestamps, and code-like content.

**Character:** Sora is a geometric-humanist sans with enough warmth to avoid feeling clinical, while Geist Mono gives numeric and identifier data the "instrument panel" precision the personality calls for. The pairing is a deliberate contrast: rounded warmth for prose, exact monospace for data.

### Hierarchy
- **Display** (700, `1.5rem`, 1.2 line-height): page-level headings, dashboard section titles.
- **Headline** (600, `1.125rem`, 1.3 line-height): card titles, modal headers.
- **Title** (600, `0.875rem`): table headers, nav group labels.
- **Body** (400, `0.875rem`, 1.5 line-height): default UI copy, descriptions. Cap prose at ~70ch where it appears in longer form (KB articles, digests).
- **Label** (600, `0.6875rem`, `0.01em` tracking): the 10–11px pill-badge and micro-label text used throughout status indicators.
- **Data** (500, `0.75rem`, Geist Mono): timestamps, IDs, counts, code snippets.

### Named Rules
**The No-Shout Rule.** Nothing in the console uses uppercase-tracked "eyebrow" labels or oversized hero numbers to perform importance. Hierarchy comes from weight and size steps already in the scale above, not from decoration.

## 4. Elevation

The Hub is flat by default. Depth comes from tonal layering — Console Panel sitting one step lighter than Void Navy, Hairline White borders separating surfaces — not from drop shadows. Where a shadow does appear (light-mode dashboard cards), it's a near-invisible ambient hint, not a structural cue: `shadow-[0_1px_3px_rgba(0,0,0,0.05)]` is the actual value used across PM dashboard cards. There is no glassmorphism, no backdrop-blur-as-decoration anywhere in the system.

### Shadow Vocabulary
- **Ambient card** (`box-shadow: 0 1px 3px rgba(0,0,0,0.05)`): the only shadow role in use, applied to light-mode dashboard cards to lift them barely off the page background.

### Named Rules
**The Flat-By-Default Rule.** Surfaces are flat at rest. If a shadow is being reached for to fix a hierarchy problem, that's a signal to fix spacing, border, or tonal contrast first — not add elevation.

## 5. Components

Buttons, cards, and pills are precise and unshowy: flat surfaces, thin borders, state changes are the only thing that moves. Nothing performs importance through size or ornament.

### Buttons
- **Shape:** `rounded-lg` (`var(--radius)`, 0.75rem base), with smaller variants stepping down via `min(var(--radius-md), 10-12px)`.
- **Primary:** Signal Blue background, Void Navy text, `h-8` default height, `px-2.5`. No gradient, no glow beyond the color itself.
- **Outline / Ghost / Secondary:** transparent or `bg-secondary` background, hairline border on outline, hover states step to `bg-muted`/`bg-input/30` — always a subtle one-step tonal shift, never a color change.
- **Hover / Focus:** `focus-visible:ring-3 ring-ring/50` plus a `border-ring` shift; active state nudges `translate-y-px` rather than changing color — a physical "press," not a color swap.
- **Destructive:** low-opacity red fill (`bg-destructive/10`) rather than a solid red block, so it reads as "careful" rather than "alarm."

### Badges / Pills (signature component)
- **Style:** `text-[10px]` to `text-[11px]`, `font-semibold`, `rounded-full`, `px-1.5 py-px` to `px-2 py-0.5`. Background is always a low-opacity tint of the status color (amber-50/amber-200 in light mode, or the `isDark` dark equivalent), never a solid fill.
- **Rule:** status is communicated by hue + a short label, never by color alone (per the codebase's own accessibility convention) — pair every colored pill with legible text, not a bare dot.

### Cards / Containers
- **Corner Style:** `rounded-xl` for cards, `rounded-lg` for nested/smaller elements.
- **Background:** Console Panel in dark mode; white or `bg-slate-50/50` in light-mode dashboard contexts, chosen per the `isDark` prop, never a `dark:` Tailwind variant.
- **Shadow Strategy:** none in dark mode (tonal layering does the work); the near-invisible ambient shadow (Section 4) only in light-mode dashboard cards.
- **Border:** `border-white/[0.06]` to `border-white/[0.08]` in dark mode; `border-slate-100`/`border-slate-200` in light mode.
- **Internal Padding:** `p-4` (16px) as the standard card padding.

### Inputs / Fields
- **Style:** hairline border, `bg-input/30` in dark mode, `rounded-lg`.
- **Focus:** `border-ring` + `ring-3 ring-ring/50` — the same focus treatment as buttons, kept consistent across all interactive elements.
- **Error:** `aria-invalid` triggers a destructive-red border and ring, never color alone.

### Navigation (Sidebar)
- **Style:** dark sidebar (`--color-sidebar-dark: #070E1F`) regardless of page theme — the sidebar is a fixed dark anchor even when content panels go light. Active state uses the nav-active tint (`rgba(51, 88, 244, 0.15)`), a translucent Deep Cobalt wash, not a solid fill.

## 6. Do's and Don'ts

### Do:
- **Do** keep Signal Blue (dark) / Deep Cobalt (light) as the only "glowing" color on any given screen — status pills borrow hue at low opacity, they don't compete with it.
- **Do** use the `isDark` boolean prop with paired explicit light/dark Tailwind classes (`isDark ? "border-white/[0.06] bg-white/[0.03]" : "border-slate-100 bg-slate-50/50"`) for any new themed v2 component — never `dark:` variants, never `bg-background`/`text-foreground` semantic tokens inside `src/app/v2`.
- **Do** use Geist Mono for numbers, IDs, and timestamps to reinforce the "precise instrument" personality; use Sora for everything else.
- **Do** communicate status with hue + short text label together (pills), never color alone.
- **Do** keep shadows near-invisible (`0 1px 3px rgba(0,0,0,0.05)` or none) — depth comes from tonal layering and hairline borders, not elevation.

### Don't:
- **Don't** ship generic SaaS dashboard clichés — no gradient hero-metric cards, no cookie-cutter icon-in-a-box grids, nothing that could be mistaken for a stock admin template.
- **Don't** use `border-left`/`border-right` accent stripes on cards or list items as a status indicator — use the pill-badge pattern instead.
- **Don't** use gradient text (`background-clip: text` + gradient) for emphasis — weight and size carry hierarchy here.
- **Don't** introduce glassmorphism or backdrop-blur as decoration — it doesn't exist anywhere in the current system and would break the flat, precise feel.
- **Don't** use uppercase-tracked "eyebrow" labels above sections as default scaffolding — the type hierarchy in Section 3 already carries that weight.
- **Don't** reach for a shadow to fix a hierarchy problem — fix spacing, border, or tonal contrast first.
