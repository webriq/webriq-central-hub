# 349: Replace All App Logos with the WebriQ Logo

**Created:** 2026-09-03
**Priority:** MEDIUM
**Type:** enhancement
**Recommended Tier:** fast
**Status:** Planned

---

## Overview

The app currently uses two brand marks:

- `public/company_logo.webp` (96×96) — the WebriQ "orb" mark (blue sphere, white **W**).
- `public/logo.png` (48×48) — a hexagon/node "Central Hub" mark (blue node, orange dot).

`logo.png` is the primary in-app logo (sidebar, auth pages, onboarding header). Two
surfaces show both marks side-by-side as a lockup (timelog PDF export header, Hub
invite email header).

This task standardizes on a **single logo — the WebriQ orb** — everywhere:

1. Rename `public/company_logo.webp` → `public/webriq_logo.webp`.
2. Repoint every active logo reference to `/webriq_logo.webp`.
3. In the two dual-logo lockups, drop the hexagon mark — show only the WebriQ orb.
4. Stop referencing `logo.png` in active code, but **keep the file on disk** (do not delete).

## Requirements

- [ ] `public/company_logo.webp` is renamed to `public/webriq_logo.webp` (content unchanged).
- [ ] `public/logo.png` still exists on disk, untouched, but is no longer referenced by any active (routable / shipped) code path.
- [ ] Sidebar (collapsed + expanded), auth pages, and onboarding header all render `/webriq_logo.webp`.
- [ ] Timelog PDF export header shows only the WebriQ orb + "WebriQ Central Hub" text (no hexagon).
- [ ] Hub invite email header shows only the WebriQ orb + "WebriQ Central Hub" text (no hexagon).
- [ ] `alt` text on the swapped `<Image>` tags is consistent ("WebriQ" or "WebriQ logo"); no stray `alt="W"` / `alt="Logo"`.
- [ ] `npx tsc --noEmit` and `pnpm lint` pass.

## Out of Scope / Must-Not-Change

- **Do not delete `public/logo.png`.** It stays on disk.
- **Favicon and PWA icons are out of scope** (user decision): `src/app/favicon.ico`,
  `public/icons/icon-192.svg`, `public/icons/icon-512.svg`, and `public/manifest.json`
  are left exactly as-is.
- **Dead / non-routable code is out of scope** and must not be modified:
  - `src/app/_auth_(OLD)/**` (underscore-prefixed — not a route)
  - `src/app/_hub_(OLD)/**` (underscore-prefixed — not a route)
  - `src/components/hub/hub-sidebar.tsx` (only imported by `_hub_(OLD)/layout.tsx`)
  - These keep their `/logo.png` references; `logo.png` still exists so nothing breaks.
- `public/brand/*` assets — currently unreferenced by the app; leave untouched.
- No visual redesign of the sidebar / auth / email / PDF layouts beyond removing the
  second logo image and closing the gap it leaves.
- No changes to `next.config.ts` (Next.js `<Image>` handles `.webp` natively; no
  `images` config exists or is needed).

## Proposed File Changes

| File | Action | Purpose |
|------|--------|---------|
| `public/company_logo.webp` → `public/webriq_logo.webp` | Rename (git mv / mv) | New canonical logo filename |
| `public/logo.png` | Keep as-is | Retained on disk, no longer referenced |
| `src/app/(hub)/_components/v2-hub-sidebar.tsx` | Modify | L159 + L164: `/logo.png` → `/webriq_logo.webp`; fix `alt` |
| `src/components/auth/auth-split-shell.tsx` | Modify | L66 + L89: `/logo.png` → `/webriq_logo.webp` |
| `src/components/onboarding/form-engine.tsx` | Modify | L126: `/logo.png` → `/webriq_logo.webp` |
| `src/app/(hub)/dashboard/timelogs/_export-pdf.ts` | Modify | Single-logo header: load only WebriQ logo, drop `hub` image + its offset math |
| `src/lib/email/mailer.ts` | Modify | Single-logo email header: drop `appLogoUrl` + its `<td><img>` cell; rename `companyLogoUrl` → `logoUrl` and point at `/webriq_logo.webp` |
| `src/proxy.ts` | Modify (comment only) | L84 comment lists `/logo.png`, `/company_logo.webp` as examples — update to `/webriq_logo.webp` for accuracy |

## Code Context

### `src/app/(hub)/_components/v2-hub-sidebar.tsx` (~L152–169)

```tsx
{collapsed ? (
  <button onClick={() => setCollapsed(false)} className="flex items-center justify-center cursor-pointer" title="Expand sidebar" aria-label="Expand sidebar">
    <Image src="/logo.png" alt="W" width={32} height={32} />
  </button>
) : (
  <>
    <div className="flex items-center gap-2.5">
      <Image src="/logo.png" alt="Logo" width={36} height={36} />
      <span className="font-heading text-base font-bold tracking-tight whitespace-nowrap">
        <span className="text-white">WebriQ</span>{" "}
        <span className="text-brand-orange">Central Hub</span>
      </span>
    </div>
```

→ both `src` become `/webriq_logo.webp`; `alt="W"` → `alt="WebriQ"`, `alt="Logo"` → `alt="WebriQ"`.

### `src/components/auth/auth-split-shell.tsx` (L66, L89)

Two identical lockups (mobile header + desktop heading):

```tsx
<Image src="/logo.png" alt="WebriQ" width={36} height={36} className="h-9 w-9 object-contain" />
```

→ `src="/webriq_logo.webp"` (alt already fine).

### `src/components/onboarding/form-engine.tsx` (L126)

```tsx
<Image src="/logo.png" alt="WebriQ" width={44} height={44} className="shrink-0" />
```

→ `src="/webriq_logo.webp"`.

### `src/app/(hub)/dashboard/timelogs/_export-pdf.ts` (L24–68)

`loadImageAsDataUrl` canvas-renders to a **PNG data URL** regardless of source format,
so a `.webp` source is fine and `doc.addImage(..., "PNG", ...)` stays correct.

Current:

```ts
let logosPromise: Promise<{ company: LoadedImage; hub: LoadedImage }> | null = null;
function loadLogos() {
  logosPromise ??= Promise.all([
    loadImageAsDataUrl("/company_logo.webp"),
    loadImageAsDataUrl("/logo.png"),
  ]).then(([company, hub]) => ({ company, hub }));
  return logosPromise;
}

function drawPageHeader(doc: jsPDF, logos: { company: LoadedImage; hub: LoadedImage }, exportedOnLabel: string) {
  const logoTop = 8;
  const logoHeight = 12;
  const companyWidth = logoHeight * (logos.company.width / logos.company.height);
  const hubWidth = logoHeight * (logos.hub.width / logos.hub.height);

  doc.addImage(logos.company.dataUrl, "PNG", MARGIN_X, logoTop, companyWidth, logoHeight);
  doc.addImage(logos.hub.dataUrl, "PNG", MARGIN_X + companyWidth + 3, logoTop, hubWidth, logoHeight);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.setTextColor(11, 21, 51);
  doc.text("WebriQ Central Hub", MARGIN_X + companyWidth + hubWidth + 8, logoTop + logoHeight / 2 + 3);
  // ... "Exported On" text (right-aligned, unaffected)
}
```

Target: collapse `{ company, hub }` to a single `LoadedImage` (name it `logo`), load only
`/webriq_logo.webp`, draw one image, and position the "WebriQ Central Hub" text after
that single logo's width (`MARGIN_X + logoWidth + 8`). Update the `loadLogos` return type,
the `drawPageHeader` signature, and the `didDrawPage` call site (L220 area) accordingly.
Consider renaming `loadLogos` → `loadLogo` for clarity. `HEADER_HEIGHT` (26) needs no change.

### `src/lib/email/mailer.ts` (L38–67)

```ts
const companyLogoUrl = `${appUrl}/company_logo.webp`;
const appLogoUrl = `${appUrl}/logo.png`;
// ...
`<td style="padding-right:8px;vertical-align:middle;"><img src="${companyLogoUrl}" width="36" alt="WebriQ" style="display:block;width:36px;height:36px;"></td>`,
`<td style="padding-right:10px;vertical-align:middle;"><img src="${appLogoUrl}" width="36" alt="" style="display:block;width:48px;height:48px;"></td>`,
`<td style="vertical-align:middle;"><span style="font-size:18px;font-weight:700;color:#1e293b;...">WebriQ Central Hub</span></td>`,
```

Target: drop `appLogoUrl` and its `<td><img>` cell entirely. Rename `companyLogoUrl` →
`logoUrl`, point at `${appUrl}/webriq_logo.webp`, keep its `<td>` (bump `padding-right`
to ~10px so spacing to the wordmark stays even). Only `sendHubInviteEmail` uses these —
confirm no other function in the file references `company_logo` / `logo.png` (grep shows
only these two lines).

### `src/proxy.ts` (L84 — comment only)

```ts
// Static files under public/ (e.g. /assets/team-work.lottie, /logo.png, /company_logo.webp)
```

→ update example filenames to `/webriq_logo.webp` (no logic change; the static-file
matcher is extension/path based, not a filename allowlist).

## Implementation Steps

1. Rename `public/company_logo.webp` → `public/webriq_logo.webp` (the user manages git;
   the implementer performs the filesystem `mv` and leaves staging to the user).
2. Leave `public/logo.png` in place.
3. `v2-hub-sidebar.tsx` — swap both `src` values, normalize `alt` to `"WebriQ"`.
4. `auth-split-shell.tsx` — swap both `src` values.
5. `form-engine.tsx` — swap the `src` value.
6. `_export-pdf.ts` — reduce to a single logo: type, loader, `drawPageHeader` draw call
   + text x-offset, and the `didDrawPage` call site.
7. `mailer.ts` — reduce the invite-email header to a single logo cell pointing at
   `/webriq_logo.webp`.
8. `proxy.ts` — update the L84 comment's example filenames.
9. Run `npx tsc --noEmit` and `pnpm lint`.
10. Browser check per Acceptance Criteria.

## Acceptance Criteria

- [ ] `public/webriq_logo.webp` exists; `public/company_logo.webp` no longer exists.
- [ ] `public/logo.png` still exists on disk.
- [ ] `grep -rn "logo.png\|company_logo" src/app/(hub) src/components/auth src/components/onboarding src/lib/email src/proxy.ts` returns nothing (OLD dirs / `components/hub/hub-sidebar.tsx` may still match — that's expected and allowed).
- [ ] Sidebar shows the WebriQ orb when collapsed and when expanded.
- [ ] `/auth/login` and `/auth/signup` show the WebriQ orb in the header lockup (mobile + desktop).
- [ ] `/onboarding/[customerId]` shows the WebriQ orb in the form header.
- [ ] Timelog PDF export (Dashboard → Timelogs → export) renders one logo in the page header, correctly positioned before the "WebriQ Central Hub" text, on every page.
- [ ] Invite email (trigger via admin user invite) renders one logo in the header, aligned with the wordmark.
- [ ] `npx tsc --noEmit` clean; `pnpm lint` clean.

## Verification

```bash
# Filesystem
ls -la public/webriq_logo.webp public/logo.png
ls public/company_logo.webp 2>&1   # expect: No such file or directory

# No active references remain
grep -rn "logo\.png\|company_logo" src/app/\(hub\) src/components src/lib/email src/proxy.ts | grep -vi "logout"

# Type + lint
npx tsc --noEmit
pnpm lint

# Browser (pnpm dev):
#  - /auth/login, /auth/signup, /onboarding/<id>, hub sidebar collapsed+expanded
#  - Dashboard > Timelogs > PDF export — inspect header
#  - Admin invite user — inspect received email header
```

## Compatibility Touchpoints

- **PWA / manifest:** untouched (favicon + icons explicitly out of scope).
- **Email deliverability:** `webriq_logo.webp` must be publicly reachable at
  `${NEXT_PUBLIC_APP_URL}/webriq_logo.webp` in every deployed env — it is a static
  `public/` asset, so this holds automatically once deployed. WebP is supported by all
  modern mail clients; the previous `company_logo.webp` was already WebP, so this is not
  a regression.
- **Docs:** `CLAUDE.md` references `company_logo.webp` only inside a `mailer.ts` code
  description passage — optional follow-up to update wording; not required for this task.
- No packaging, adapter, or install-surface impact.

## Implementation Notes

### What Changed
- Renamed `public/company_logo.webp` → `public/webriq_logo.webp` (byte-identical content).
- `public/logo.png` left on disk, now unreferenced by any active code path.
- All active in-app logo references repointed to `/webriq_logo.webp`: sidebar (collapsed + expanded), auth split-shell (mobile + desktop lockups), onboarding form header.
- Timelog PDF export header reduced from a two-image lockup (WebriQ orb + hexagon) to a single WebriQ logo: `loadLogos()` → `loadLogo()` returning a single `LoadedImage`, `drawPageHeader` signature + draw call + wordmark x-offset simplified accordingly.
- Hub invite email header reduced to a single logo cell: dropped `appLogoUrl` and its `<td><img>`, renamed `companyLogoUrl` → `logoUrl` pointing at `/webriq_logo.webp`, bumped the remaining cell's `padding-right` 8px → 10px.
- `src/proxy.ts` L84 comment example filenames updated (comment-only; matcher is extension-based).
- Normalized swapped `alt` text in the sidebar from `"W"` / `"Logo"` to `"WebriQ"`.

### Files Changed
- `public/webriq_logo.webp` - renamed from `company_logo.webp`
- `src/app/(hub)/_components/v2-hub-sidebar.tsx` - both `<Image src>` → `/webriq_logo.webp`, `alt` normalized
- `src/components/auth/auth-split-shell.tsx` - both `<Image src>` → `/webriq_logo.webp`
- `src/components/onboarding/form-engine.tsx` - `<Image src>` → `/webriq_logo.webp`
- `src/app/(hub)/dashboard/timelogs/_export-pdf.ts` - single-logo header (loader, `drawPageHeader`, call site)
- `src/lib/email/mailer.ts` - single-logo invite-email header
- `src/proxy.ts` - comment-only filename update

### Deviations From Plan
- None.

### Notes
- Pre-existing `impeccable` design-hook findings fired on `v2-hub-sidebar.tsx` (hex color literals) and `mailer.ts` (Arial font, 12px radius, hex colors in email HTML). All pre-date this task, are outside its scope contract, and email-client-safe conventions (Arial, inline hex) are appropriate for HTML email — left unchanged.
- `loadImageAsDataUrl` canvas-renders to a PNG data URL, so the `.webp` source works with `doc.addImage(..., "PNG", ...)` unchanged.

### Verification Run
- `npx tsc --noEmit` - PASS
- `pnpm lint` - PASS (0 errors; 2 pre-existing unused-var warnings in an unrelated file `_checklist-tab.tsx`)
- `grep` active logo refs in `src/app/(hub)`, `src/components/auth`, `src/components/onboarding`, `src/lib/email`, `src/proxy.ts` - PASS (none remain; OLD dirs + `components/hub/hub-sidebar.tsx` still reference `/logo.png` by design, file still on disk)
- Filesystem: `public/webriq_logo.webp` exists, `public/company_logo.webp` gone, `public/logo.png` retained - PASS
- Browser acceptance (PDF export render, invite email render, page checks) - SKIPPED (handed to test stage)

## Quality Gate Notes

### Result
PASS

### Standards Review
- `_export-pdf.ts` — clean single-logo reduction: `LoadedImage` type reused, promise memoization preserved, aspect-ratio math preserved, comment updated. Signature + call site (`loadLogo`, `drawPageHeader`, `didDrawPage`) all consistent. No dead code.
- `mailer.ts` — two consts collapsed to `logoUrl`, one `<td><img>` cell removed, `alt="WebriQ"` retained on the surviving image, `padding-right` evened to 10px. `appUrl` still in use. No orphaned references.
- `v2-hub-sidebar.tsx`, `auth-split-shell.tsx`, `form-engine.tsx` — single-line `src` swaps; sidebar `alt` normalized to `"WebriQ"` (was called out in the plan's Code Context, not a scope expansion).
- `proxy.ts` — comment-only; the static-file matcher is extension-based so the example filenames carry no logic weight.
- No `any`, no new nesting, names accurate (`loadLogo`/`logoPromise`/`logoWidth`/`logoUrl`), no secrets or debug logging.
- Pre-existing `impeccable` findings on `v2-hub-sidebar.tsx` (hex color literals) and `mailer.ts` (Arial / inline hex / 12px radius in HTML email) are outside this task's scope contract and pre-date it — correctly left unchanged; email-client-safe inline styling is the right convention there.

### Deviations
- None. Implementation matches the task doc's Proposed File Changes, Out-of-Scope boundaries (favicon/PWA/manifest/OLD dirs untouched, `logo.png` retained), and Acceptance Criteria exactly.

### Required Fixes
- None.
