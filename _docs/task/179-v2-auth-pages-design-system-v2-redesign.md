# 179: v2 Auth Pages — Design System v2.0 Redesign (Lottie Hero, Logo Reposition, Testimonial Removal)

**Created:** 2026-07-23
**Priority:** MEDIUM
**Type:** enhancement
**Recommended Tier:** balanced
**Status:** Completed (2026-07-23)

---

## Overview

Redesign the four `/v2/(auth)` pages (login, register, verify, change-password) and their shared components to follow `_final_design/guide/central-hub-design-system.md` (v2.0) — the navy `#071133` / blue `#007BFF` / orange `#FB914E` palette, the Space Grotesk / Inter / JetBrains Mono type system, and the pill-radius button/token rules. Three concrete changes on top of the token pass:

1. Replace the static hero photo (`/auth-hero-BN2J7r2Q.jpg`) on the desktop split panel with the "Team Work" Lottie animation from `public/assets/`.
2. Move the WebriQ Central Hub logo off the decorative hero panel and onto the form panel (above the "Welcome back"-style heading), on both desktop and mobile.
3. Remove the testimonial quote ("A workspace where ideas turn into shipped products…" / Mira Chen attribution) — no replacement copy for now.

All four pages share one shell (`AuthSplitShell`) and five shared components, so this is mostly a shell + component + token change; the four `page.tsx` files only need small label/link color-class swaps.

**Design decision on record (confirmed with user):** the hero panel becomes 100% illustration — no logo, no text. The logo now lives at the top of the form panel's heading block on every page, both breakpoints.

## Requirements

- [ ] Auth pages use the v2.0 brand palette (navy/blue/orange hex values below) instead of the current v1 `brand-orange` (`#F97316`) token — scoped to auth only, not a global palette change.
- [ ] Orange is used for the primary CTA button only (one per screen); every other accent (links, focus rings, icons, toggle) uses blue, per the design system's "one orange CTA per screen" rule.
- [ ] Page titles use Space Grotesk (`font-heading`) 700, not the inherited Inter default.
- [ ] Buttons use pill radius (`rounded-full`), not `rounded-md`.
- [ ] Desktop hero panel: photo + overlays replaced by the Lottie animation, centered, on a navy gradient background (reuse the existing mobile gradient recipe instead of a photo).
- [ ] Logo removed from the hero panel entirely; added above the heading block in the form panel on both desktop and mobile.
- [ ] Testimonial quote + attribution block removed, no replacement.
- [ ] Password strength meter and error banner use design-system semantic hex (`--ok`/`--warn`/`--late`) instead of ad hoc `brand-orange`/`green-500`/shadcn `--destructive`.
- [ ] `pnpm build` and `npx tsc --noEmit` pass; manual browser check of all four pages in both light and dark mode, desktop and mobile viewport.

## Out of Scope / Must-Not-Change

- `src/app/v2/(auth)/actions.ts` — no server action logic changes.
- `src/lib/auth/device-id.ts`, `src/lib/auth/gate-cookies.ts` — no logic changes.
- The global `--color-brand-orange` / `--color-brand` tokens in `globals.css` — these are used elsewhere in the hub (outside `/v2/(auth)`); do not repoint them. Introduce new `--color-auth-*` tokens instead (same pattern already used by `.pm-light`/`.pm-dark` for the v2.0 dashboard palette).
- `ThemeToggle`'s light/dark mechanism (the `.dark` class + `useSyncExternalStore` toggle) — restyle its accent color only, don't change how it works.
- Mobile does **not** get the Lottie illustration — it stays gradient-only, consistent with the current mobile layout (no side image today). Only the desktop hero panel gets the animation.
- `(hub)` dashboard pages, sidebar, or any non-auth v2 surface.
- The `isDark`-prop theming pattern used elsewhere in `/v2` (per CLAUDE.md) does not apply here — `(auth)` already has its own working CSS-variable + `.dark`-class convention (via `ThemeToggle`) that predates this task; keep using it, don't migrate to `isDark` props.

## Proposed File Changes

| File | Action | Purpose |
|------|--------|---------|
| `src/app/globals.css` | Modify | Add `--color-auth-*` brand/semantic tokens (scoped, additive — no existing tokens removed) |
| `package.json` | Modify | Add `@lottiefiles/dotlottie-react` dependency |
| `public/assets/Team Work.lottie` → `public/assets/team-work.lottie` | Rename | Remove space from filename for URL safety; `Team Work.json` left untouched as source backup |
| `src/components/auth/auth-lottie.tsx` | Create | Client component wrapping `DotLottieReact`, loads `team-work.lottie` |
| `src/components/auth/auth-split-shell.tsx` | Modify | Remove photo/overlays/logo/testimonial from hero panel; add centered Lottie (dynamic import, `ssr: false`); add logo to desktop + mobile heading blocks; swap tokens; add `font-heading` to `h1` |
| `src/components/auth/auth-error-banner.tsx` | Modify | Swap `text-destructive bg-destructive/10 border-destructive/20` → `text-auth-late bg-auth-late-bg border-auth-late/20` |
| `src/components/auth/auth-submit-button.tsx` | Modify | `rounded-md` → `rounded-full`; `bg-brand-orange` → `bg-auth-orange`; hover → `hover:bg-auth-orange-600`; `text-white` → `text-auth-cta-ink` |
| `src/components/auth/password-input.tsx` | Modify | Label size/weight to design-system form-label spec; focus ring `brand-orange` → `auth-blue` (+ ring-offset) |
| `src/components/auth/password-strength-meter.tsx` | No change (reads `STRENGTH_META`) | — |
| `src/lib/auth/password-strength.ts` | Modify | `STRENGTH_META` bar/text colors → `auth-late` / `auth-warn` / `auth-blue` / `auth-ok` progression |
| `src/app/v2/(auth)/auth/login/page.tsx` | Modify | Email label/input token swap; "Forgot password?" link → blue |
| `src/app/v2/(auth)/auth/register/page.tsx` | Modify | Email label token swap; replace hand-rolled invalid-invite-link error markup with `<AuthErrorBanner>`; "Back to login" link → blue |
| `src/app/v2/(auth)/auth/verify/page.tsx` | Modify | Mail icon circle `brand-orange` → `auth-blue`; "Resend code" hover → blue |
| `src/app/v2/(auth)/auth/change-password/page.tsx` | No change expected (only uses shared components already covered above) | — |
| `src/components/auth/theme-toggle.tsx` | Modify | `hover:border-brand-orange/50` / icon `text-brand-orange` → `auth-blue` equivalents |

## Code Context

### `src/app/globals.css` — `@theme inline` Brand tokens block (currently lines 50-56)

```css
/* ─── Brand tokens ──────────────────────────────────────────────────────── */
--color-brand: #3358F4;
--color-brand-orange: #F97316;
--color-sidebar-dark: #070E1F;
--color-page-bg: #F7F8FA;
--color-nav-active-bg: rgba(51, 88, 244, 0.15);
--color-toggle-bg: #1a2f5a;
```

Add directly below this block (theme-invariant brand/semantic hex, same pattern as the existing `--color-brand-orange` literal — no `:root`/`.dark` indirection needed for these):

```css
/* ─── Auth v2.0 tokens (task 179) — scoped to /v2/(auth); do not repoint the
   brand-orange/brand tokens above, those are still used elsewhere in the hub ── */
--color-auth-navy: #071133;
--color-auth-blue: #007BFF;
--color-auth-blue-700: #0063D6;
--color-auth-orange: #FB914E;
--color-auth-orange-600: #E2762F;
--color-auth-cta-ink: #471F02;   /* CTA text-on-orange per design system §4 Buttons */
--color-auth-warn: #8A5A00;
--color-auth-ok: #177E48;
--color-auth-late: var(--auth-late);
--color-auth-late-bg: var(--auth-late-bg);
```

`--auth-late` / `--auth-late-bg` need light/dark variants (unlike the brand hues, the error-banner tint must stay legible against both a white and a dark-navy card) — add to the existing `:root { ... }` block and the existing `.dark { ... }` block respectively:

```css
/* in :root */
--auth-late: #C0392B;
--auth-late-bg: #FDE8E6;

/* in .dark */
--auth-late: #F2A29B;
--auth-late-bg: #C0392B26; /* ~15% tint on dark surface */
```

### `src/components/auth/auth-split-shell.tsx` (full current content — see file)

Current hero panel (lines 18-51) does three things that all change: renders `/auth-hero-BN2J7r2Q.jpg` + three overlay divs, renders the logo top-left (`justify-between` pins it there), renders the testimonial block bottom (same `justify-between`). Current mobile header (lines 56-68) also renders the logo left-aligned above the title.

New desktop hero — full-bleed centered Lottie on navy gradient, no logo/text:

```tsx
<div className="relative hidden lg:flex items-center justify-center overflow-hidden p-10 bg-[linear-gradient(140deg,#07111f_0%,#0c1b38_55%,#070E1F_100%)]">
  <div className="absolute -top-24 -right-16 h-72 w-72 rounded-full bg-auth-blue/25 blur-3xl pointer-events-none" />
  <div className="absolute -bottom-24 -left-16 h-72 w-72 rounded-full bg-auth-navy blur-3xl pointer-events-none" />
  <div className="relative z-10 w-full max-w-md">
    <AuthLottie />
  </div>
</div>
```

New mobile header — same gradient, blobs recolored, logo kept here (this is the top of the single-column mobile flow, doubling as the form panel's mobile entry point per the confirmed design decision):

```tsx
<div className="relative lg:hidden overflow-hidden px-6 pt-[max(2rem,env(safe-area-inset-top))] pb-16 text-white bg-[linear-gradient(140deg,#07111f_0%,#0c1b38_55%,#070E1F_100%)]">
  <div className="absolute -top-24 -right-16 h-64 w-64 rounded-full bg-auth-blue/25 blur-3xl pointer-events-none" />
  <div className="absolute -bottom-20 -left-10 h-56 w-56 rounded-full bg-auth-navy blur-3xl pointer-events-none" />
  <Link href="/" className="relative z-10 inline-flex items-center gap-2 font-semibold tracking-tight">
    <Image src="/logo.png" alt="WebriQ" width={36} height={36} className="h-9 w-9 object-contain" />
    <span className="text-base font-heading">WebriQ <span className="text-auth-blue">Central Hub</span></span>
  </Link>
  <div className="relative z-10 mt-8 space-y-2">
    <h1 className="text-3xl font-heading font-bold tracking-tight">{title}</h1>
    <p className="text-white/60 text-sm">{subtitle}</p>
  </div>
</div>
```

New desktop heading block (replaces current lines 76-81, logo added above `headingIcon`/title):

```tsx
<div className="hidden lg:block mb-8 space-y-6">
  <Link href="/" className="inline-flex items-center gap-2.5 font-semibold tracking-tight text-foreground">
    <Image src="/logo.png" alt="WebriQ" width={36} height={36} className="h-9 w-9 object-contain" />
    <span className="text-base font-heading">WebriQ <span className="text-auth-blue">Central Hub</span></span>
  </Link>
  <div className="space-y-2">
    {headingIcon}
    <h1 className="text-4xl font-heading font-bold tracking-tight text-foreground">{title}</h1>
    <p className="text-muted-foreground">{subtitle}</p>
  </div>
</div>
```

Import change at top of file: replace the direct `Image` hero usage with a dynamic-imported `AuthLottie` (same reasoning CLAUDE.md gives for recharts — browser-only rendering):

```tsx
import dynamic from "next/dynamic";
const AuthLottie = dynamic(
  () => import("@/components/auth/auth-lottie").then((m) => m.AuthLottie),
  { ssr: false }
);
```

### `src/components/auth/auth-lottie.tsx` (new file)

```tsx
"use client";

import { DotLottieReact } from "@lottiefiles/dotlottie-react";

export function AuthLottie() {
  return (
    <DotLottieReact
      src="/assets/team-work.lottie"
      loop
      autoplay
      className="w-full h-auto"
    />
  );
}
```

### `src/components/auth/auth-submit-button.tsx` (current lines 12-22)

```tsx
className="group inline-flex items-center justify-center gap-2 h-12 w-full rounded-md bg-brand-orange text-white font-semibold text-sm shadow cursor-pointer hover:bg-brand-orange/90 transition-all disabled:opacity-60 disabled:pointer-events-none"
```

→

```tsx
className="group inline-flex items-center justify-center gap-2 h-12 w-full rounded-full bg-auth-orange text-auth-cta-ink font-semibold text-sm shadow cursor-pointer hover:bg-auth-orange-600 transition-all disabled:opacity-60 disabled:pointer-events-none"
```

### `src/lib/auth/password-strength.ts` (current lines 16-21)

```ts
export const STRENGTH_META: Record<Strength, { label: string; filled: number; bar: string; text: string }> = {
  0: { label: "Too weak", filled: 1, bar: "bg-brand-orange/60", text: "text-muted-foreground" },
  1: { label: "Okay",     filled: 2, bar: "bg-brand-orange",    text: "text-brand-orange" },
  2: { label: "Good",     filled: 3, bar: "bg-brand-orange",    text: "text-brand-orange" },
  3: { label: "Strong",   filled: 4, bar: "bg-green-500",       text: "text-green-500" },
};
```

→ (red → amber → blue → green progression, all design-system semantic tokens, no more `brand-orange`/ad hoc `green-500`)

```ts
export const STRENGTH_META: Record<Strength, { label: string; filled: number; bar: string; text: string }> = {
  0: { label: "Too weak", filled: 1, bar: "bg-auth-late/60",  text: "text-muted-foreground" },
  1: { label: "Okay",     filled: 2, bar: "bg-auth-warn",     text: "text-auth-warn" },
  2: { label: "Good",     filled: 3, bar: "bg-auth-blue",     text: "text-auth-blue" },
  3: { label: "Strong",   filled: 4, bar: "bg-auth-ok",       text: "text-auth-ok" },
};
```

### `src/components/auth/password-input.tsx` — label + focus ring (current lines 33-53)

Label: `text-sm font-medium leading-none text-foreground` → `text-xs font-semibold leading-none text-foreground` (closest Tailwind scale step to the design system's 11px/600 form-label spec — no arbitrary `text-[11px]`, per CLAUDE.md's "prefer Tailwind scale over arbitrary values" rule). Apply the same label swap in `login/page.tsx`, `register/page.tsx`, and `verify/page.tsx` wherever a bare `<label>` is hand-rolled (they currently duplicate this exact className string rather than using `PasswordInput`'s label markup).

Focus ring: `focus-visible:ring-1 focus-visible:ring-brand-orange` → `focus-visible:ring-2 focus-visible:ring-auth-blue focus-visible:ring-offset-2` (design system §5: "Focus: 2px `--blue` outline, 2px offset, on every interactive element").

### `src/app/v2/(auth)/auth/register/page.tsx` — invalid-invite-link error block (current lines 122-134)

Currently hand-rolls its own error markup instead of reusing the shared component:

```tsx
<div className="rounded-lg px-4 py-3 text-sm text-destructive bg-destructive/10 border border-destructive/20">
  {error}
</div>
```

Replace with `<AuthErrorBanner message={error} />` (already imported in this file) — removes the duplicate markup and picks up the new `auth-late` tokens automatically once `auth-error-banner.tsx` is updated.

## Implementation Steps

1. `pnpm add @lottiefiles/dotlottie-react`.
2. Rename `public/assets/Team Work.lottie` → `public/assets/team-work.lottie` (leave `Team Work.json` in place, untouched, as a source backup — not referenced by code).
3. Add the `--color-auth-*` tokens to `globals.css` (`@theme inline` block) plus the light/dark `--auth-late`/`--auth-late-bg` pair in `:root`/`.dark`, per Code Context above.
4. Create `src/components/auth/auth-lottie.tsx`.
5. Update `src/components/auth/auth-split-shell.tsx`: swap the hero panel (photo → Lottie, strip logo + testimonial), swap the mobile header (recolor blobs, keep logo, add `font-heading`), add the logo block to the desktop heading, dynamic-import `AuthLottie`.
6. Update `src/components/auth/auth-submit-button.tsx` (pill radius, orange/cta-ink tokens).
7. Update `src/components/auth/auth-error-banner.tsx` (late/late-bg tokens).
8. Update `src/components/auth/theme-toggle.tsx` (blue accent instead of orange).
9. Update `src/components/auth/password-input.tsx` (label size/weight, focus ring).
10. Update `src/lib/auth/password-strength.ts` (`STRENGTH_META` token swap).
11. Update `login/page.tsx`, `register/page.tsx`, `verify/page.tsx`: swap remaining hand-rolled label classNames, link colors (`brand-orange` → `auth-blue-700`/`auth-blue`), and (register only) replace the inline invite-error block with `<AuthErrorBanner>`.
12. Run `npx tsc --noEmit` and `pnpm lint`.
13. `pnpm dev` and manually check all four pages (`/v2/auth/login`, `/v2/auth/register` — needs a valid invite link or the error-state branch, `/v2/auth/verify`, `/v2/auth/change-password`) in light mode, dark mode, desktop width, and mobile width. Confirm the Lottie animation plays, the logo renders correctly on both breakpoints, and no testimonial text remains.

## Acceptance Criteria

- [ ] No `brand-orange` class references remain anywhere under `src/app/v2/(auth)/`, `src/components/auth/`, or `src/lib/auth/password-strength.ts`.
- [ ] Desktop hero panel shows only the Lottie illustration on a navy gradient — no photo, no logo, no testimonial text.
- [ ] Logo appears above the heading on the form panel, both desktop and mobile, on all four pages (via the shared shell).
- [ ] Primary submit button is pill-shaped (`rounded-full`), orange background, dark ink text (`#471F02`), and is the only orange element on the page.
- [ ] All links, the theme toggle, and focus rings use blue, not orange.
- [ ] Page titles render in Space Grotesk (visually distinct from the Inter body text).
- [ ] Password strength meter shows a red → amber → blue → green progression across its four states.
- [ ] `npx tsc --noEmit` passes with no new errors.
- [ ] `pnpm lint` passes with no new errors.
- [ ] `pnpm build` succeeds (webpack flag intact).

## Verification

```bash
npx tsc --noEmit
pnpm lint
pnpm build
pnpm dev   # then browser-check /v2/auth/login, /v2/auth/register, /v2/auth/verify, /v2/auth/change-password
```

No automated test runner is configured for this repo (per CLAUDE.md) — verification is TypeScript check + lint + build + manual browser pass across breakpoints and both themes.

## Compatibility Touchpoints

- New runtime dependency: `@lottiefiles/dotlottie-react` (adds to `package.json`/`pnpm-lock.yaml`; no native/CLI surface impact).
- Renamed public asset (`Team Work.lottie` → `team-work.lottie`) — no other code currently references the old path, so this is a clean rename with no dangling references.
- Purely additive `globals.css` tokens — does not touch `--color-brand-orange`/`--color-brand`, so no risk to non-auth surfaces of the hub.

## Implementation Notes

### What Changed
- Added `--color-auth-*` v2.0 brand/semantic tokens to `globals.css` (theme-invariant hues in `@theme inline`, plus light/dark `--auth-late`/`--auth-late-bg` pair for the error banner).
- Installed `@lottiefiles/dotlottie-react`; renamed `public/assets/Team Work.lottie` → `team-work.lottie`; created `AuthLottie` (dynamic-imported, `ssr: false`).
- Rebuilt `AuthSplitShell`: desktop hero is now full-bleed navy-gradient + centered Lottie (photo, overlays, logo, and testimonial all removed); logo added above the heading on both the desktop form panel and the mobile gradient header; mobile blur blobs recolored from orange to blue/navy; page titles now use `font-heading` (Space Grotesk) 700.
- Restyled `AuthSubmitButton` (pill radius, `auth-orange`/`auth-cta-ink`), `AuthErrorBanner` (`auth-late`/`auth-late-bg`), `ThemeToggle` (blue accent), `PasswordInput` (11px-equivalent label via `text-xs font-semibold`, 2px blue focus ring with offset).
- Updated `password-strength.ts` `STRENGTH_META` to a late→warn→blue→ok progression, removing `brand-orange`/ad hoc `green-500`.
- Updated `login`, `register`, `verify` pages: label/link/icon token swaps to blue; register's hand-rolled invite-error block replaced with the shared `<AuthErrorBanner>`; register's loading-spinner border color also swapped `brand-orange` → `auth-blue` (not itemized in the original Code Context but caught by the "no `brand-orange` anywhere" acceptance criterion — see Deviations).
- `change-password/page.tsx` needed no direct edits, as predicted — it only consumes already-updated shared components.

### Files Changed
- `src/app/globals.css` — added `--color-auth-*` tokens + light/dark `--auth-late`/`--auth-late-bg`
- `package.json` / `pnpm-lock.yaml` — added `@lottiefiles/dotlottie-react`
- `public/assets/Team Work.lottie` → `public/assets/team-work.lottie` — renamed (space removed for URL safety)
- `src/components/auth/auth-lottie.tsx` — created
- `src/components/auth/auth-split-shell.tsx` — hero/heading/logo restructure, token swaps
- `src/components/auth/auth-submit-button.tsx` — pill radius, orange/cta-ink tokens
- `src/components/auth/auth-error-banner.tsx` — late/late-bg tokens
- `src/components/auth/theme-toggle.tsx` — blue accent
- `src/components/auth/password-input.tsx` — label size/weight, focus ring
- `src/lib/auth/password-strength.ts` — `STRENGTH_META` token swap
- `src/app/v2/(auth)/auth/login/page.tsx` — label, focus ring, link color
- `src/app/v2/(auth)/auth/register/page.tsx` — label, `<AuthErrorBanner>` reuse, link color, loading-spinner color
- `src/app/v2/(auth)/auth/verify/page.tsx` — label, focus ring, icon circle color, resend-link color

### Deviations From Plan
- Register page's loading-spinner border (`border-brand-orange`, line 113, inside the `sessionState === "loading"` branch) wasn't listed in the task doc's Code Context/file table, but was caught by a `grep` sweep against the "no `brand-orange` references remain" acceptance criterion and fixed (→ `border-auth-blue`) to keep the requirement airtight.
- No other deviations — implementation matches the Code Context blocks essentially verbatim.

### Verification Run
- `npx tsc --noEmit` — PASS
- `pnpm lint` — PASS
- `pnpm build` — PASS (first attempt failed with an unrelated stale `.next` cache error — `TypeError: Cannot read properties of null (reading 'hash')` inside the PWA/service-worker build step; reproduced identically with the Lottie usage and new public assets both temporarily removed, confirming it predates this task; resolved by `rm -rf .next` and rebuilding clean)
- Manual browser check (Chrome, dev server on `localhost:3001`) — PASS for login (dark + light mode), verify, change-password (typed a password to confirm the strength-meter's late→warn→blue→ok progression, saw "Strong" in green), and register's invalid-invite error state (confirmed the shared `AuthErrorBanner` renders with `auth-late` tokens). Desktop viewport (1440×900) confirmed visually. Mobile viewport could not be confirmed via the browser tool's `resize_window` in this environment (screenshot dimensions didn't change after resizing) — the mobile markup is a close structural mirror of the original, already-shipped mobile header (same gradient/blur-blob pattern, only recolored + repositioned), so risk is low, but a manual phone-width check is recommended before shipping.

### Post-Review Fixes (user testing feedback, same day)

The user tested the login page and reported five issues, all fixed in this same pass:

1. **Lottie illustration too small** — `DotLottieReact` renders a bare `<canvas>`; with only `w-full h-auto` on an un-sized parent (`max-w-md`, no height), it fell back to the browser's default canvas resolution (300×150) rather than filling the panel. Fixed by giving the wrapper an explicit box (`max-w-lg aspect-square`) and changing the canvas's className to `w-full h-full` so it fills that box exactly. — `auth-split-shell.tsx`, `auth-lottie.tsx`.
2. **Logo not left-aligned with the heading below it** — `public/logo.png` has built-in transparent padding around the mark, so its optical left edge sat right of the container's true edge versus the flush heading text. Fixed with `-ml-1.5` on both logo `<Link>` instances (desktop heading block + mobile header). — `auth-split-shell.tsx`.
3. **Email label/field spacing off** — the earlier pass shrank the label font (`text-sm`→`text-xs`) but never tightened the `space-y-2` gap that was tuned for the old larger label; also found the non-`headerAction` branch of `PasswordInput`'s label (used by register/change-password) had been missed entirely by the earlier label-size edit and was still on the old `text-sm font-medium` classes. Fixed: `space-y-2` → `space-y-1.5` on every label+field wrapper (login email, register email, verify code, both `PasswordInput` branches); corrected the stale label classes. — `login/page.tsx`, `register/page.tsx`, `verify/page.tsx`, `password-input.tsx`.
4. **Field icons don't highlight on focus** — added `peer`/`peer-focus:text-auth-blue` pairing so the Mail/Lock icon turns blue while its input is focused, matching the blue focus ring.
5. **Tab order bug (Email → "Forgot password?" → Password instead of Email → Password)** — root cause was two-fold:
   - `PasswordInput` rendered `headerAction` (the "Forgot password?" link) in the same DOM row as the label, ahead of the actual `<input>`, so it was the next focusable element after Email. Fixed with a CSS grid: `headerAction` is now the *last* DOM child (so Tab reaches it after the password input and its eye-toggle button) but is grid-positioned back onto the label's row (`row-start-1 justify-self-end`) so nothing shifts visually.
   - Fixing this exposed a second bug in the same edit: the Mail/Lock icons were placed *before* their input in the DOM, so `peer-focus:` (Tailwind's `~` general-sibling selector, which only matches siblings *after* `.peer`) never actually matched — my first attempt at fix #4 silently failed. Corrected by moving each icon to *after* its input in DOM order (still `absolute`-positioned on the left, so the visual layout is unchanged).

Re-verified after these fixes: `npx tsc --noEmit` PASS, `pnpm lint` PASS, `pnpm build` PASS (clean `.next`), and a second manual browser pass on `/v2/auth/login` confirming: bigger illustration, aligned logo, tighter label spacing, blue icons on focus (both Email and Password fields), and Tab correctly moving Email → Password.

### Two Final Polish Rounds

- **Lottie still not large enough** — bumped the hero wrapper from `max-w-lg` to `max-w-2xl` (512px → 672px, still `aspect-square`). Confirmed via browser screenshot the illustration now fills noticeably more of the panel.
- **Email/label gap still too tight** — an external edit (user or linter) reverted the login page's email wrapper from `space-y-1.5` back to `space-y-2` (still not enough per the user's follow-up screenshot). Rather than re-fight that, increased the gap further and applied it consistently everywhere a label sits above a field: `space-y-3` on login email, register email, verify code, `PasswordInput`'s plain branch, and `gap-y-3` on `PasswordInput`'s grid branch (the one with `headerAction`). Confirmed via zoomed screenshot — clearly more breathing room between "Email"/"Password" labels and their inputs, "Forgot password?" still correctly pinned to the label row.

`npx tsc --noEmit` PASS after both rounds; both changes visually confirmed live in the browser (dev server on `localhost:3000`).
