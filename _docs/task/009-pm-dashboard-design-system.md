# Task 009 — PM Dashboard: Apply WebriQ Design System

> **Type:** enhancement
> **Version Impact:** minor
> **Priority:** HIGH
> **Status:** PLANNED
> **Recommended Tier:** `balanced`
> **Depends On:** Task 005 (Per-Product Progress Bars — Real-Time) ✅, Task 006 (Zoho Auth) ✅
> **Design Source:** `_design/WebriQ Design System/PM Dashboard Web.html`, `pm-web-screens.jsx`, `pm-screens.jsx`

---

## Overview

Replace the current single-table PM Dashboard (`/pm`) with a tabbed SPA that matches the [WebriQ Design System](_design/WebriQ%20Design%20System/) patterns. The redesign introduces stat cards, digest cards, task attention lists, pipeline overview, client health tracking, and theme-aware styling — all using the design system's tokenized colors, Geist typography, and card-based layout.

Scope: **PM role only**. Dev and Admin screens defined in the design files map to separate existing routes (`/dev`, `/kb`) and are out of scope.

---

## Requirements

### 1. Tabbed PM Dashboard Architecture

Replace the single customer table in `src/app/(hub)/pm/page.tsx` with a client-side tab router:

| Tab | Key | Data Source | Implementation |
|-----|-----|-------------|----------------|
| **Home** | `home` | Existing `/api/customers` data | Full: digest card, stat cards, attention list, pipeline overview, client health |
| **Clients** | `customers` | Existing `/api/customers` data | Migrate existing table to design-system card/table |
| **Tasks** | `tasks` | Mock data (placeholder) | Task queue UI — ready for Sprint 2 data |
| **Pipeline** | `pipeline` | Mock data (placeholder) | Kanban stage columns — ready for Sprint 3+ data |
| **Settings** | `settings` | localStorage | Home layout + theme toggles |

### 2. Design System Tokens

Apply from `pm-web-screens.jsx`. Light mode tokens:

| Token | Value |
|-------|-------|
| Page bg | `#f5f4f1` |
| Card bg | `#ffffff` |
| Card border | `rgba(0,0,0,0.08)` |
| Primary text | `rgba(10,12,30,0.90)` |
| Secondary text | `rgba(10,12,30,0.50)` |
| Muted text | `rgba(10,12,30,0.28)` |
| Blue | `#3358F4` |
| Orange | `#d45e09` |
| Sky | `#1565c0` |
| Violet | `#4f46e5` |
| Green | `#15803d` |
| Amber | `#a16207` |
| Red | `#b91c1c` |

Dark mode tokens map to blue `#5b7fff`, orange `#f97316`, sky `#60a5fa`, violet `#818cf8`, green `#4ade80`, amber `#fbbf24`, red `#f87171`.

Typography: Geist (primary), Geist Mono (monospace — IDs, percentages).

### 3. Home Screen Layout

Stat card data mapping:
- "Active Clients" = customers filtered by status === 'active'
- "Open Tasks" = mock (8) — no task table yet
- "In Pipeline" = mock (3) — no pipeline table yet
- "Pending Review" = mock (2)

Digest card: Static placeholder text until Sprint 3 digest engine.

Needs Attention: Show onboarding customers as urgent items. Use mock data until classification data is available.

Client Health: Map from customers. Per client: initials avatar, company name, avg product progress bar, status badge.

### 4. Clients Tab — Migrate Existing Table

Apply design-system styling to current customer table while preserving all existing functionality:
- Search input with icon, filter pills (All / Onboarding / Active / Inactive)
- Colored client avatar + name cell
- Product badges with abbreviated names (SS, PF, CF, PpF)
- Per-product progress bars with percentage
- Sortable column headers
- Row click navigates to /customers/[customerId]
- Supabase realtime subscription intact

### 5. Tasks, Pipeline — Placeholder Screens

Static mock versions matching design files. Mock data inline. Disabled interaction states where not yet available. "Coming in Sprint X" indicators.

### 6. Settings Screen

Two toggles stored in localStorage under `hub_pm_settings`:
- **Home Layout:** "Digest first" vs "Stats first" — controls digest card position on Home
- **Theme:** Light / Dark — applies to all tabs

### 7. Theme Integration

- Wrap page content in theme-aware container
- Apply dark/light tokens to all components
- Existing hub sidebar/header unaffected (they use their own dark theme)

---

## Out of Scope / Must Not Change

- **Do NOT modify** `hub-sidebar.tsx`, `hub-header.tsx`, or `(hub)/layout.tsx`
- **Do NOT modify** any API routes
- **Do NOT modify** the database schema or Supabase migrations
- **Do NOT implement** Dev or Admin role screens — those live at separate routes (`/dev`, `/kb`)
- **Do NOT implement** mobile (bottom-nav) or desktop (titlebar + list-detail pane) variants — web layout only
- **Do NOT remove** the existing Supabase realtime subscription for progress updates
- **Do NOT remove** the existing customer detail navigation

---

## Proposed File Changes

| Action | File | Description |
|--------|------|-------------|
| **REWRITE** | `src/app/(hub)/pm/page.tsx` | Tabbed SPA shell with Home, Clients, Tasks, Pipeline, Settings tabs |
| **CREATE** | `src/components/hub/pm-tabs/home-tab.tsx` | Home tab — digest, stats, attention, pipeline overview, client health |
| **CREATE** | `src/components/hub/pm-tabs/clients-tab.tsx` | Clients tab — refactored customer table with design-system styling |
| **CREATE** | `src/components/hub/pm-tabs/tasks-tab.tsx` | Tasks tab — mock task queue (placeholder for Sprint 2) |
| **CREATE** | `src/components/hub/pm-tabs/pipeline-tab.tsx` | Pipeline tab — mock Kanban stages (placeholder for Sprint 3) |
| **CREATE** | `src/components/hub/pm-tabs/settings-tab.tsx` | Settings tab — home layout + theme toggles |
| **CREATE** | `src/components/hub/pm-tabs/shared.tsx` | Shared atoms: Card, StatCard, ProgressBar, StatusBadge, ProductBadge, PriorityDot, SectionHeader |
| **CREATE** | `src/hooks/use-pm-settings.ts` | Hook for reading/writing `hub_pm_settings` from localStorage |
| **MODIFY** | `src/app/layout.tsx` (if needed) | Ensure Geist font is loaded |

---

## Code Context

### Current PM Page (`src/app/(hub)/pm/page.tsx`)

Currently a single client component that:
- Fetches customers from `/api/customers` with search/filter params
- Subscribes to Supabase realtime for `customer_products` UPDATE events
- Renders a single HTML table with sortable columns and per-product progress bars

Will become a tab router that delegates to sub-components, with data fetched once at the page level and passed down.

### Design Tokens (from `pm-web-screens.jsx`)

```ts
const LIGHT = {
  bg: '#f5f4f1', card: '#ffffff', border: 'rgba(0,0,0,0.08)',
  blue: '#3358F4', orange: '#d45e09', sky: '#1565c0',
  violet: '#4f46e5', green: '#15803d', amber: '#a16207', red: '#b91c1c',
  text: 'rgba(10,12,30,0.90)', sub: 'rgba(10,12,30,0.50)', muted: 'rgba(10,12,30,0.28)',
};
const DARK = {
  bg: '#090c18', card: '#121726', border: 'rgba(255,255,255,0.08)',
  blue: '#5b7fff', orange: '#f97316', sky: '#60a5fa',
  violet: '#818cf8', green: '#4ade80', amber: '#fbbf24', red: '#f87171',
  text: 'rgba(255,255,255,0.92)', sub: 'rgba(255,255,255,0.50)', muted: 'rgba(255,255,255,0.28)',
};
```

### Existing Product Constants (already in current code)

```ts
const PRODUCT_ABBREV = { StackShift: "SS", PublishForge: "PF", CiteForge: "CF", PipelineForge: "PpF" };
const PRODUCT_COLORS = {
  StackShift: "#3358F4", PublishForge: "#7C3AED", CiteForge: "#22C55E", PipelineForge: "#F97316",
};
```

---

## Implementation Steps

1. **Verify Geist font** — Check `src/app/layout.tsx` loads Geist from Google Fonts. Add if missing.
2. **Create `use-pm-settings.ts` hook** — Read/write `hub_pm_settings` with defaults: `{ homeLayout: 'digest', theme: 'light' }`
3. **Create `shared.tsx` atoms** — Card, StatCard, ProgressBar, StatusBadge, ProductBadge, PriorityDot, SectionHeader
4. **Create `home-tab.tsx`** — Digest card, stat row, attention list, pipeline overview, client health
5. **Create `clients-tab.tsx`** — Migrate existing customer table to design-system styling
6. **Create `tasks-tab.tsx`** — Mock task queue with classification status indicators
7. **Create `pipeline-tab.tsx`** — Mock Kanban columns with stage cards
8. **Create `settings-tab.tsx`** — Home layout selector + theme toggle
9. **Rewrite `page.tsx`** — Tab router with theme propagation, data fetching, Supabase realtime

---

## Acceptance Criteria

- [ ] PM Dashboard at `/pm` shows tabbed navigation: Home | Clients | Tasks | Pipeline | Settings
- [ ] Home tab displays: greeting, digest card, 4 stat cards, needs-attention list, pipeline overview, client health list
- [ ] Clients tab displays: customer table with design-system styling, search, filter pills, sortable columns
- [ ] Supabase realtime progress updates continue to work (clients tab)
- [ ] Clicking a client row navigates to `/customers/[customerId]`
- [ ] Tasks tab shows mock task queue with proper styling
- [ ] Pipeline tab shows mock Kanban columns with proper styling
- [ ] Settings tab: Home layout toggle (digest-first / stats-first) changes Home tab order
- [ ] Settings tab: Theme toggle (light / dark) applies to all tabs
- [ ] Theme setting persists across page refreshes (localStorage)
- [ ] All components use Geist font, design system color tokens
- [ ] Existing hub sidebar/header are not visually altered
- [ ] `pnpm build` passes with no new TypeScript errors
- [ ] `pnpm dev` renders the dashboard without console errors

---

## Verification

```bash
pnpm build
pnpm dev
# Visit http://localhost:3000/pm
# 1. Verify all 5 tabs render
# 2. Toggle theme in Settings, verify light/dark applies
# 3. Toggle home layout, verify digest/stats order changes
# 4. Navigate to client detail via row click
# 5. Verify realtime updates still work (open onboarding form in another tab)
```

---

## Compatibility Touchpoints

- **Packaging:** No new dependencies. Uses existing React 19, Tailwind CSS 4, lucide-react.
- **Routes:** No route changes. `/pm` stays the same. Other hub routes unaffected.
- **API:** No API changes. Existing `/api/customers` endpoint used as-is.
- **Auth:** No auth changes. Hub layout RLS/redirect unchanged.
- **PWA / Desktop:** Out of scope for this task.

---

## Implementation Notes

### What Changed
- Rewrote PM Dashboard from a single customer table to a tabbed SPA with 5 tabs: Home, Clients, Tasks, Pipeline, Settings
- Applied WebriQ Design System tokens (colors, typography, card patterns) across all components
- Added light/dark theme support via localStorage, controllable from Settings tab
- Added home layout preference (digest-first vs stats-first)
- Created shared component library (ThemeCard, ProgressBar, StatusBadge, ProductBadge, StatCard, etc.)
- Preserved all existing functionality: customer data fetching, Supabase realtime progress subscriptions, sort/filter/search, row-click navigation

### Files Changed
- `src/app/(hub)/pm/page.tsx` — Rewrote: tab router shell with data fetching, realtime subscription, theme integration
- `src/components/hub/pm-tabs/shared.tsx` — New: design tokens, Tokens interface, shared atoms
- `src/components/hub/pm-tabs/home-tab.tsx` — New: Home tab with digest, stats, attention, pipeline overview, client health
- `src/components/hub/pm-tabs/clients-tab.tsx` — New: Clients tab with design-system table, exports CustomerWithProducts type
- `src/components/hub/pm-tabs/tasks-tab.tsx` — New: Tasks tab with mock classification data
- `src/components/hub/pm-tabs/pipeline-tab.tsx` — New: Pipeline tab with mock Kanban stages
- `src/components/hub/pm-tabs/settings-tab.tsx` — New: Settings tab with theme/layout toggles
- `src/hooks/use-pm-settings.ts` — New: localStorage hook for PM settings persistence

### Deviations From Plan
- Font: The project uses Sora (not Geist) as primary font. Geist_Mono is available as monospace. Kept Sora for body text, used Geist Mono for IDs/percentages via CSS variable `var(--font-mono)`.
- No change to `src/app/layout.tsx` — Geist Mono was already loaded; no action needed.
- The `RightColumn` function in home-tab.tsx was inlined into the JSX rather than kept as a separate component, to keep the file simpler.

### Verification Run
- `pnpm build` — PASS (TypeScript check passes, no errors)
- `pnpm dev` — SKIPPED (server starts but could not verify rendering in headless environment; manual verification needed)