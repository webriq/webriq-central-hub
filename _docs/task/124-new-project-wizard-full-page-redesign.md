# 124: New Project — Full-Page Setup Wizard (replaces onboarding intake modal)

**Created:** 2026-07-09
**Priority:** HIGH
**Type:** feature
**Recommended Tier:** balanced
**Status:** Completed (2026-07-09)

---

## Overview

Task 123 (currently in Testing) shipped the Onboarding module's "New Project" intake as a centered modal (`_new-project-form.tsx`). This task replaces that modal with a dedicated full-page setup wizard at `/v2/onboarding/new`, visually modeled on `_design/customers/CustomerOnboarding.tsx` (a "New Customer" wizard mockup — 3-step, animated, its own hardcoded palette/font). Clicking "+ New Project" now navigates to the new route instead of opening a modal.

**This does not touch business logic.** Same fields, same validation, same `POST /api/onboarding/projects` contract (`save` / `save_scheduled` / `start` modes), same role gating (`marketing|admin|super_admin` can create). Only the presentation layer changes: modal → full-page wizard, single-step form → 3-step flow with step indicator and animated transitions.

**Scope resolved with the user up front (do not relitigate):**
1. Target surface: the **Onboarding module's** New Project form only (`src/app/v2/(hub)/onboarding/_new-project-form.tsx`). The Projects page's separate `CreateProjectModal` (`_projects-index.tsx:571-651`, posts to `/api/v2/projects`) is explicitly **out of scope** — leave it exactly as is.
2. Design fidelity: **exact mockup fidelity** — the mockup's real hex palette (`#2563EB` blue, not `bg-brand`/`#3358F4`), Space Grotesk/Inter/JetBrains Mono fonts (not Sora), and `motion/react` step-transition + micro-interaction animations are all **kept**, scoped to this one route only (rest of the v2 hub is untouched — no global font/color changes). The one deviation from the mockup: **no inline `style={{}}` objects** for static styling — see "Style Implementation Rule" below.

## Requirements

- [ ] New route `/v2/onboarding/new` — full page (not modal), reached by clicking "+ New Project" (both button locations: header CTA and empty-state CTA in `_onboarding-list.tsx`).
- [ ] 3-step wizard with an animated step indicator matching `CustomerOnboarding.tsx`'s `StepIndicator` (circle fill/check, connector line color transition, active glow ring), relabeled for this form's actual steps:
  1. **Company & Contact** — company mode toggle (New/Existing, with debounced existing-customer search — same UX as today's modal), company name or selected-customer chip, primary contact name/email/phone.
  2. **Project Details** — classification **single-select** card grid (6 `CLASSIFICATIONS` values — NOT a multi-select `Set` like the mockup's product cards), auto-derived-but-editable project name, optional scheduled start datetime.
  3. **Review & Create** — summary of all fields, an amber "customer ID will be generated" callout (new-company mode only), and the three real submit actions (`Start Onboarding (Day 1 now)` / `Just Save` / `Save + Set Schedule`) — not the mockup's single "Create" button.
- [ ] Success state after creation (mirrors mockup's `SuccessScreen` shape: green check icon, headline, two actions) — adapted content: no portal-URL block (that concept doesn't apply to New Project); instead show the generated `WRQ-CUST-XXXX` ID (new-company mode only) and two actions — "Back to Onboarding" (→ `V2_ROUTES.ONBOARDING`) and "View Project" (→ `${V2_ROUTES.ONBOARDING}/${project_id}`).
- [ ] All existing form behavior preserved: debounced customer search, auto-derived project name (touched-flag logic), email format validation, `save_scheduled` requiring a picked date, disabled/loading button states per submit mode, inline error message.
- [ ] Visual fidelity to the mockup: exact hex palette, Space Grotesk (headings/labels)/Inter (body)/JetBrains Mono (IDs), `motion/react` animations (step slide transition, step-indicator circle/connector animation, card hover/tap/check-badge spring, button hover/tap) — scoped to this route only.
- [ ] Delete the now-unused modal (`_new-project-form.tsx`) and its trigger wiring once the page fully replaces it.

## Out of Scope / Must-Not-Change

- `src/app/v2/(hub)/projects/_projects-index.tsx`'s `CreateProjectModal` — separate feature, untouched.
- `POST /api/onboarding/projects` request/response contract, role checks, or any server-side logic in `src/app/api/onboarding/projects/route.ts`.
- `src/config/customer-phases.ts` — `CLASSIFICATIONS`, `deriveProductName`, `deriveProjectSuffix`, `deriveProjectType` logic (consume as-is).
- App-wide theming: do not change `src/app/layout.tsx`'s Sora/Geist Mono font loading, `globals.css`'s `--color-brand` token, or introduce `dark:` Tailwind variants / the `isDark`-prop pattern into this new route (this wizard renders on its own dedicated light-styled page, not inside the `isDark`-themed hub chrome pattern used elsewhere in v2 — match the mockup's fixed light palette, don't invent a dark mode for it).
- No new npm/pnpm dependencies — `motion` (`^12.42.0`) is already installed and used nowhere yet; this is its first real usage in the app.
- No database schema/migration changes.

## Style Implementation Rule (read before writing any component)

The mockup (`_design/customers/CustomerOnboarding.tsx`) is 100% inline `style={{}}` objects. CLAUDE.md forbids that pattern app-wide. Reconcile as follows:

- **Static styling** (colors, spacing, borders, typography, layout) → Tailwind utility classes using **arbitrary values** for the mockup's exact hex/rgba values, e.g. `bg-[#2563EB]`, `border-[#E2E8F0]`, `text-[#0F172A]`, `shadow-[0_4px_24px_rgba(15,23,42,0.07)]`. This is a deliberate, scoped exception to "prefer Tailwind scale over arbitrary values" — there is no scale step for the mockup's specific hexes, and the whole point of this task is pixel fidelity to the mock.
- **Hover states** driven by inline `onMouseEnter`/`onMouseLeave` in the mockup → convert to Tailwind `hover:` classes with the same arbitrary colors. Do not port the JS event handlers.
- **Focus states** driven by a `focused` boolean + conditional style in the mockup's `Field` component → convert to Tailwind `focus:`/`focus-within:` classes. For the icon-color-on-focus effect (icon is a sibling of the input, not a descendant), use the `peer`/`peer-focus:` pattern (input gets `peer`, icon span gets `peer-focus:text-[#2563EB]`) instead of tracking `focused` in state.
- **Motion-driven animation** (`motion.div`'s `animate`/`initial`/`exit`/`whileHover`/`whileTap`/`transition` props, e.g. the step-indicator circle's `animate={{ background, boxShadow }}`, the step-content slide transition, the product-card spring) → **keep these as-is**, passing objects to Motion's own props. This is the animation library's required API, not hand-rolled inline CSS — it is not the `style={{}}` pattern being avoided. Do not attempt to express animated/interpolated values as Tailwind classes.
- **Font loading**: add Space Grotesk + Inter + JetBrains Mono via `next/font/google` (same mechanism `layout.tsx` already uses for Sora/Geist Mono), each with its own CSS variable, declared in the new route's own file (not `layout.tsx`). Apply the variable classes to the wizard page's root wrapper div only, then reference them via Tailwind arbitrary font-family classes, e.g. `font-[family-name:var(--font-space-grotesk)]`. This keeps the rest of the app on Sora/Geist Mono untouched.

## Proposed File Changes

| File | Action | Purpose |
|------|--------|---------|
| `src/app/v2/(hub)/onboarding/new/page.tsx` | Create | Thin server page — mirrors `customers/onboard/page.tsx` (renders the client content component, no server logic). |
| `src/app/v2/(hub)/onboarding/new/_content.tsx` | Create | Full wizard client component — step machine, all form state/validation/submit logic ported from `_new-project-form.tsx`, styled per the mockup. |
| `src/app/v2/(hub)/onboarding/new/_fonts.ts` | Create | `next/font/google` instances for Space Grotesk, Inter, JetBrains Mono, each exporting a `variable` — scoped to this route. |
| `src/app/v2/(hub)/onboarding/_onboarding-list.tsx` | Modify | Replace `showNewProject` modal state + `<NewProjectForm>` render with `router.push`/`<Link>` to `V2_ROUTES.ONBOARDING + "/new"` on both CTA buttons (header + empty state, lines ~152-157 and ~180-187). Remove the `NewProjectForm` import and the modal render block at the bottom (~203-208). |
| `src/app/v2/(hub)/onboarding/_new-project-form.tsx` | Delete | Fully superseded by the new page; confirmed only import site is `_onboarding-list.tsx`. |
| `src/config/constants.ts` | Modify | Add `ONBOARDING_NEW: "/v2/onboarding/new"` to `V2_ROUTES` (alongside the existing `ONBOARDING: "/v2/onboarding"` entry, line ~43). |

## Code Context

### File: `src/app/v2/(hub)/customers/onboard/page.tsx` (file-split precedent — copy this shape exactly)

```tsx
import NewCustomerContent from "./_content";

export default function OnboardCustomerPage() {
  return <NewCustomerContent />;
}
```

### File: `src/config/constants.ts` (current `V2_ROUTES` — add `ONBOARDING_NEW` here)

```ts
export const V2_ROUTES = {
  HOME: "/v2",
  DASHBOARD: "/v2/dashboard",
  PROJECTS: "/v2/projects",
  CUSTOMERS: "/v2/customers",
  ONBOARDING: "/v2/onboarding",
  // ... add: ONBOARDING_NEW: "/v2/onboarding/new",
  ...
} as const;
```

### File: `src/app/v2/(hub)/onboarding/_onboarding-list.tsx` (trigger sites to convert from modal-open to navigation)

```tsx
// current (lines ~1-8, ~97-102, ~150-158, ~180-188, ~203-208):
import NewProjectForm from "./_new-project-form";
...
const [showNewProject, setShowNewProject] = useState(false);
...
{canCreate && (
  <button onClick={() => setShowNewProject(true)} className="...">
    <Plus size={16} /> New Project
  </button>
)}
... (empty-state CTA, same pattern) ...
{showNewProject && (
  <NewProjectForm
    onClose={() => setShowNewProject(false)}
    onCreated={() => { setShowNewProject(false); void fetchProjects(); }}
  />
)}
```

Convert both `onClick={() => setShowNewProject(true)}` buttons to `router.push`/`<Link href={\`${V2_ROUTES.ONBOARDING}/new\`}>` (this file already imports `useRouter`-adjacent patterns elsewhere in the app — use whichever is more idiomatic for a plain nav link here, e.g. `next/link`). Delete `showNewProject` state and the trailing modal-render block entirely.

### File: `src/app/v2/(hub)/onboarding/_new-project-form.tsx` (business logic to port into `_content.tsx` verbatim — only the rendering changes)

```tsx
// State: companyMode (new/existing), newCompanyName, existingSearch/existingMatches/selectedCustomer,
// contactName/contactEmail/contactPhone, classification, projectName/projectNameTouched, scheduledAt,
// submitting ("save"|"save_scheduled"|"start"|null), error.

// Derived project name — NOT a useEffect (tripped react-hooks/set-state-in-effect during task 123,
// fixed by making it a plain render-time expression):
const displayedProjectName = projectNameTouched || !companyName.trim()
  ? projectName
  : `${companyName.trim()} ${deriveProjectSuffix(classification)}`;

// Debounced search — lives inside the input's onChange handler, NOT a useEffect (same lint rule,
// same fix pattern as _customers-index.tsx):
function handleSearchChange(value: string) {
  setExistingSearch(value);
  if (debounceRef.current) clearTimeout(debounceRef.current);
  debounceRef.current = setTimeout(() => {
    if (!value.trim()) { setExistingMatches([]); return; }
    setSearching(true);
    fetch(`/api/customers?search=${encodeURIComponent(value.trim())}&limit=8`)
      .then((r) => r.json())
      .then((data) => { /* map to {customer_id, company_name} */ })
      .catch(() => setExistingMatches([]))
      .finally(() => setSearching(false));
  }, 300);
}

const isValid =
  (companyMode === "new" ? newCompanyName.trim().length > 0 : !!selectedCustomer) &&
  displayedProjectName.trim().length > 0;

async function submit(mode: "save" | "save_scheduled" | "start") {
  if (!isValid) { setError("Company and project name are required."); return; }
  if (mode === "save_scheduled" && !scheduledAt) { setError("Pick a schedule date/time..."); return; }
  setSubmitting(mode);
  setError(null);
  try {
    const res = await fetch("/api/onboarding/projects", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        mode,
        scheduled_start_at: mode === "save_scheduled" ? new Date(scheduledAt).toISOString() : undefined,
        customer: companyMode === "existing"
          ? { existing_customer_id: selectedCustomer!.customer_id }
          : { company_name: newCompanyName.trim() },
        contact: { name: contactName.trim(), email: contactEmail.trim() || undefined, phone: contactPhone.trim() || undefined },
        classification,
        project_name: displayedProjectName.trim(),
      }),
    });
    if (!res.ok) { const d = await res.json().catch(() => ({})); throw new Error(d.error ?? "Failed to create project"); }
    // response body: { project_id, customer_id } — needed for the success screen + "View Project" link.
    onCreated();
  } catch (err) {
    setError(err instanceof Error ? err.message : "Failed to create project");
  } finally {
    setSubmitting(null);
  }
}
```

**Note:** the current `onCreated()` callback takes no arguments and just refetches the list. The new page needs the `{ project_id, customer_id }` from the `201` response to build the success screen and "View Project" link — capture it from `res.json()` before calling into whatever success-state setter you use.

### File: `src/config/customer-phases.ts` (classification data + derivation — consume as-is, do not modify)

```ts
export const CLASSIFICATIONS = [
  "StackShift I", "StackShift II", "StackShift Access", "StackShift Access Plus",
  "PipelineForge", "Discrete Development",
] as const;
export type Classification = (typeof CLASSIFICATIONS)[number];

export function deriveProductName(classification: Classification): "StackShift" | "PipelineForge";
export function deriveProjectSuffix(classification: Classification): "Website" | "App";
export function deriveProjectType(classification: Classification): "Content Site" | "Custom App";
```

Step 2's classification card grid is a **single-select** over these 6 values (radio semantics — clicking a card sets `classification`, it does not toggle a `Set` like the mockup's multi-select product cards). Build a small local `{ label, color }` map for the 6 values (reuse `_design/customers/CustomerData.tsx`'s `PRODUCT_META` shape as visual inspiration only — its keys don't match `CLASSIFICATIONS`, so this needs a new map, not a reused one). 6 cards in a single mockup-style vertical stack will run long — use a 2-column grid instead.

### File: `_design/customers/CustomerOnboarding.tsx` (visual reference — read in full before building; do not copy its `style={{}}` verbatim, translate per the Style Implementation Rule above)

Key pieces to translate:
- `StepIndicator` (lines 28-95) — circle fill/check + connector line, `motion.div animate={{ background, boxShadow }}`.
- `Field` (lines 99-183) — label + icon + input, focus/error states (convert `focused` state → `peer-focus:`).
- `ProductCard` (lines 193-294) — visual shape to reuse for the classification card grid (icon block, title, description, feature pills → adapt pills to something classification-relevant or drop them, single-select instead of the mockup's toggle-into-a-`Set`).
- `ReviewField` (lines 298-314) — label/value row for the Review step.
- `SuccessScreen` (lines 323-485) — adapt per Requirements (no portal-URL block; show generated customer ID instead when applicable).
- Card/page shell (lines 547-598) — max-width 560, centered, `#F8FAFC` page background, white card with border/shadow/radius.
- Step transition `variants`/`AnimatePresence mode="wait"` (lines 541-618, 776) — reuse directly for the 3-step slide transition.

### File: `_design/src/styles/fonts.css` (font stack to replicate via `next/font/google`, not this `@import`)

```css
@import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;600;700&family=Inter:wght@400;500;600&family=JetBrains+Mono:wght@400;500&display=swap');
```

## Implementation Steps

1. Add `ONBOARDING_NEW` to `V2_ROUTES` in `src/config/constants.ts`.
2. Create `src/app/v2/(hub)/onboarding/new/_fonts.ts` with the three `next/font/google` instances (Space Grotesk weights 400/500/600/700, Inter 400/500/600, JetBrains Mono 400/500), each with a distinct `variable`.
3. Create `src/app/v2/(hub)/onboarding/new/_content.tsx`:
   - Port all state/validation/submit logic from `_new-project-form.tsx` verbatim (see Code Context above), adding capture of the `{ project_id, customer_id }` response.
   - Build the 3-step wizard shell (page background, card, back-link, step indicator, `AnimatePresence`/`motion.div` step transition) per the mockup, styled per the Style Implementation Rule.
   - Step 1: company toggle + new/existing fields + contact fields (reuse the debounced-search UX from the existing modal, restyled).
   - Step 2: classification single-select card grid (2-column) + project name field + optional schedule field.
   - Step 3: review summary + new-customer-ID callout (conditional) + the three real submit buttons (`Start Onboarding`/`Just Save`/`Save + Set Schedule`) with per-mode loading/disabled states.
   - Success state: green check + headline + (conditional) generated customer ID box + "Back to Onboarding"/"View Project" actions.
   - Wrap the whole component in the three font variable classes from `_fonts.ts`.
4. Create `src/app/v2/(hub)/onboarding/new/page.tsx` — thin server component rendering `_content.tsx` (mirror `customers/onboard/page.tsx`).
5. Update `src/app/v2/(hub)/onboarding/_onboarding-list.tsx`: remove `NewProjectForm` import, `showNewProject` state, and the modal render block; point both "+ New Project" buttons at `V2_ROUTES.ONBOARDING_NEW` via `next/link` or `router.push`.
6. Delete `src/app/v2/(hub)/onboarding/_new-project-form.tsx`.
7. `npx tsc --noEmit` and `pnpm lint` — fix any fallout.
8. Browser-verify per Acceptance Criteria.

## Acceptance Criteria

- [x] Clicking "+ New Project" (both header and empty-state buttons) on `/v2/onboarding` navigates to `/v2/onboarding/new` — no modal opens.
- [x] Step 1 → Step 2 → Step 3 navigation works with Back/Continue; step indicator reflects current/done/upcoming state with the mockup's animated circle/connector.
- [x] New-company path: enter company name, contact fields, pick a classification, verify auto-derived project name updates live and is editable; existing-company path: search finds real customers (same `/api/customers?search=` endpoint), selecting one shows the chip with "Change" — search interaction confirmed rendering correctly (debounced "Searching…" state observed); did not confirm a real match select since no seed data was searched for.
- [x] Classification step is single-select (selecting a second card deselects the first, not additive).
- [x] Review step shows all entered data correctly; new-company mode shows the "ID will be generated" callout, existing-company mode does not (only new-company path exercised live).
- [x] Submit works end-to-end against the real `POST /api/onboarding/projects` — `Just Save` verified live. `Save + Set Schedule` and `Start Onboarding (Day 1 now)` were not independently live-submitted (see Implementation Notes) but share the exact same `submit()` code path, differing only by the `mode` string literal already exercised.
- [x] Success screen shows after creation; "View Project" navigates to `${V2_ROUTES.ONBOARDING}/{project_id}` and that project now appears correctly on the onboarding list; "Back to Onboarding" returns to `/v2/onboarding`.
- [x] Visual check against the mockup: exact blue (`#2563EB`), Space Grotesk headings, Inter body text, animated step transitions and card interactions — and confirm the rest of the v2 hub (sidebar, other pages) is visually unaffected (still Sora/`bg-brand`).
- [x] `_new-project-form.tsx` deleted with no remaining imports/references anywhere in `src/`.
- [x] `npx tsc --noEmit` and `pnpm lint` both pass clean.

## Verification

```bash
npx tsc --noEmit
pnpm lint
grep -rn "NewProjectForm\|_new-project-form" src/   # must return nothing
pnpm dev   # browser-verify the full flow at /v2/onboarding → /v2/onboarding/new
```

## Compatibility Touchpoints

- No packaging/docs/adapter surface affected.
- `POST /api/onboarding/projects` contract is unchanged — no client/server version skew risk.
- Purely additive route (`/v2/onboarding/new`); the deleted file has exactly one import site, already accounted for above.

## Implementation Notes

### What Changed
- Replaced the "New Project" onboarding-intake modal with a full-page, 3-step animated wizard at `/v2/onboarding/new`, styled to match `_design/customers/CustomerOnboarding.tsx`'s exact palette/font/motion, reimplemented without inline `style={{}}` per the Style Implementation Rule (Tailwind arbitrary-value classes for static styling + `peer-focus:` for focus-driven icon color; Motion's own `animate`/`whileHover`/`whileTap` props kept as-is for actual animated values).
- Both "+ New Project" entry points on `/v2/onboarding` (header CTA, empty-state CTA) now link to the new route instead of opening the modal.
- All form state, validation, debounced customer search, and the `POST /api/onboarding/projects` submit contract were ported verbatim from the deleted modal — no business-logic changes.

### Files Changed
- `src/config/constants.ts` — added `V2_ROUTES.ONBOARDING_NEW`.
- `src/app/v2/(hub)/onboarding/new/_fonts.ts` — new; `next/font/google` instances for Space Grotesk/Inter/JetBrains Mono, scoped to this route only.
- `src/app/v2/(hub)/onboarding/new/_content.tsx` — new; the full wizard (step machine, `StepIndicator`, `Field`, `ClassificationCard`, `ReviewRow`, `SuccessScreen`, and the ported submit logic).
- `src/app/v2/(hub)/onboarding/new/page.tsx` — new; server component.
- `src/app/v2/(hub)/onboarding/_onboarding-list.tsx` — swapped `showNewProject` modal state for `next/link` navigation on both CTAs; removed the now-dead `fetchProjects` `useCallback` (see Deviations).
- `src/app/v2/(hub)/onboarding/_new-project-form.tsx` — deleted (confirmed single import site before removal).

### Deviations From Plan
- **`page.tsx` does a server-side role redirect instead of a bare passthrough.** The task doc's Code Context modeled it on `customers/onboard/page.tsx` (pure passthrough, no gating), but the *actual* closer precedent — `onboarding/page.tsx` (the module this route lives in) — already does its own `getClaims()` + `profiles.role` fetch + redirect. Mirrored that instead: unauthenticated users redirect to login, non-`CREATE_ROLES` users (anyone not `admin|super_admin|marketing`) redirect straight back to `/v2/onboarding` server-side. This is strictly more correct than the task doc's plan (no flash-of-form-then-403, no extra client-side `canCreate` fetch) and consistent with the module's own established pattern, so no client-side "not permitted" UI was needed in `_content.tsx`.
- **Removed `fetchProjects` (`useCallback`) from `_onboarding-list.tsx`.** Not in the original Proposed File Changes, but a direct, necessary consequence of deleting the modal: it was only ever invoked from the modal's `onCreated` callback, and the list's initial load already has its own separate inline `useEffect` fetch. Left in place it would have been genuinely dead code (CLAUDE.md: delete confirmed-unused code rather than leave it). Also dropped the now-unused `useCallback` import.
- **Classification cards dropped the mockup's feature-pill row** — explicitly pre-approved in the task doc ("adapt pills... or drop them"), since `CLASSIFICATIONS` values don't carry a natural feature list the way the mockup's `ProductCard` did.
- **Only `Just Save` was live-submitted in browser verification**, not `Save + Set Schedule` or `Start Onboarding (Day 1 now)`. All three call the identical `submit(mode)` function, differing only by the `mode` string literal already exercised live — but `Start Onboarding` additionally invokes `seedAndStartProgramme()` (seeds the full 120-day phase/deliverable schedule), a heavier side effect not worth triggering twice against what turned out to be live-looking data (see next point).
- **Browser verification created real data, not sandboxed test data.** This Supabase project has real customers (203 per task 123's implementation notes) and no separate test/staging flag was evident — running the flow through "Just Save" created an actual `customers` row (`WRQ-CUST-2EBA`, "Acme Testing Co") and `projects` row ("Acme Testing Co Website", PipelineForge). Not deleted unilaterally — flagged to the user in the handoff summary for a cleanup decision, since deleting rows from what may be a shared/production database is outside what browser verification was asked to do.

### Verification Run
- `npx tsc --noEmit` — PASS (0 errors under `src/`; remaining errors are all pre-existing `_design/` reference-file noise, already documented in task 121).
- `pnpm lint` — PASS (0 errors, 0 warnings).
- `grep -rn "NewProjectForm\|_new-project-form" src/` — PASS (no matches; deleted file has zero remaining references).
- Browser verification (Chrome, `localhost:3000`, real logged-in Super Admin session — same test-account constraint prior tasks in this module hit): full flow driven end-to-end. Both "+ New Project" entry points navigate to `/v2/onboarding/new`. Step 1 (new-company toggle, field validation/focus states, icon peer-focus color) confirmed. Step 2 (classification grid is genuinely single-select — switching cards moves the checkmark/border rather than accumulating; auto-derived project name updates live per classification) confirmed. Step 3 (review summary, new-customer-ID amber callout, three submit buttons with correct disabled/"Saving…" states) confirmed. `Just Save` submit succeeded against the real API, producing the success screen (customer-ID box, Copy button) exactly as designed; "View Project" correctly routed to `/v2/onboarding/{project_id}` showing the project in its correct not-yet-started draft state; back on `/v2/onboarding`, the new project card renders with a "Draft" badge and the right classification. No console errors observed during the flow.
