# 010: Sidebar Navigation Restructure + Header User Menu + AI Chat

**Created:** 2026-05-15
**Priority:** HIGH
**Type:** enhancement
**Recommended Tier:** balanced
**Status:** Planned

---

## Overview

Restructure the Hub layout to match the approved design system. This involves:

1. **Elevating PM dashboard inline tabs to the sidebar** — The `/pm` page currently renders 5 inline tabs (Home, Clients, Tasks, Pipeline, Settings). These become proper sidebar navigation items, matching the role-based sidebar in the design (`_design/WebriQ Design System/PM Dashboard Desktop.html`).

2. **Removing `/onboarding` from the sidebar** — Accessible only via the "+ New Client" button inside the Clients view (already wired in `ClientsTab`).

3. **Integrating Classification into Tasks** — Classification becomes a sub-tab or filter inside the Tasks section, not a standalone route.

4. **Replacing Orchestration with AI Chat** — The `/orchestration` placeholder becomes a full AI Chat interface (per the design: `pm-web-screens.jsx` lines 369-380 and `pm-desktop-screens.jsx` lines 435-461).

5. **Removing the bottom-left user area from the sidebar** — Avatar, email, and role label removed. Replaced with a dedicated minimize/collapse button.

6. **Adding a top-right user avatar with dropdown/slide-out** — The header gains a user avatar that opens a panel showing: full display name, email, Zoho ID (if any), Settings link, and Sign Out.

7. **Reviewing and aligning the customers table** — Compare the existing `ClientsTab` table columns against the design's `WebPMCustomers` table and update if needed.

## Requirements

- [ ] PM dashboard inline tabs are removed; Home, Clients, Tasks, Pipeline, and AI Chat sections are each directly navigable from the sidebar.
- [ ] `/onboarding` route is removed from the sidebar; it is only accessible via the "+ New Client" button in Clients.
- [ ] Classification (`/classification`) is integrated into the Tasks section.
- [ ] `/orchestration` is repurposed into a proper AI Chat interface (Claude-powered, following the design pattern).
- [ ] Bottom-left sidebar user area (avatar, email, role) is removed and replaced with a minimize button.
- [ ] Header gains a user avatar that opens a dropdown or slide-out with user details and actions (display name, email, Zoho ID, Settings, Sign Out).
- [ ] Customers table columns match the design; extraneous columns (Contact, Created) are considered for removal or condensing.
- [ ] The Hub layout (`src/app/(hub)/layout.tsx`) fetches `display_name` and `zoho_user_id` in addition to `email` and `role`.

## Out of Scope / Must-Not-Change

- **Do NOT change the authentication flow** — sign-in, sign-up, OAuth callbacks, and the `signOut()` action remain as-is.
- **Do NOT change the public onboarding route** (`/onboarding/[customerId]`) — this is a login-free route for customers.
- **Do NOT change the database schema** — `hub_users` already has `display_name` and `zoho_user_id`.
- **Do NOT change the PM Settings functionality** (theme toggle, home layout).
- **Do NOT remove** the Developer section (`/dev`), Knowledge Base (`/kb`), or Admin routes from the sidebar.
- **Do NOT add real AI chat functionality** — the AI Chat UI is a placeholder that matches the design (Claude-powered, Sprint 5). No actual LLM integration in this task.
- **Do NOT touch** the `src/app/page.tsx` landing page or the `AuroraBackground`.

## Proposed File Changes

| File | Action | Purpose |
|------|--------|---------|
| `src/app/(hub)/layout.tsx` | Modify | Fetch `display_name` and `zoho_user_id` from `hub_users`; pass full user profile to `HubSidebar` and `HubHeader` |
| `src/components/hub/hub-sidebar.tsx` | Modify | Restructure nav groups to match design; remove bottom user area; add minimize button at bottom; remove Onboarding, Classification, Orchestration links; add AI Chat link |
| `src/components/hub/hub-header.tsx` | Modify | Replace separate sign-out button and static avatar with user avatar + dropdown/slide-out panel |
| `src/app/(hub)/pm/page.tsx` | Modify | Remove inline tab bar; render content based on sidebar nav selection |
| `src/app/(hub)/orchestration/page.tsx` | Modify | Replace placeholder with AI Chat UI matching the design |
| `src/app/(hub)/classification/page.tsx` | Modify | Integrate into Tasks section |
| `src/components/hub/pm-tabs/clients-tab.tsx` | Modify | Align table columns with design

## Code Context

### Design — Sidebar tabs per role (PM Dashboard Desktop.html)

PM role tabs: Home, Clients, Tasks, Pipeline, AI Chat, Settings — all as sidebar nav items.

### Design — AI Chat UI (pm-web-screens.jsx)

Header: "AI Assistant" / "Claude-powered · Sprint 5". Greeting card. Prompt suggestion buttons (disabled). Disabled input bar + send button. Footer: "Powered by Claude Haiku · Available Sprint 5".

### Design — Customers table (pm-web-screens.jsx)

Columns: **Client** (avatar + name + ID below), **Status**, **Products**, **Progress**, **View →** button.

Current ClientsTab: ID | Client | Contact | Products | Status | Progress | Created → needs alignment.

### layout.tsx — must fetch additional fields

```tsx
// FROM: .select("email, role")
// TO:   .select("email, role, display_name, zoho_user_id")
```

### hub-sidebar.tsx — remove bottom user area (lines 158-175), move collapse toggle there

### hub-header.tsx — replace signout + static avatar with dropdown avatar

### pm/page.tsx — remove inline TABS bar (lines 99-114), use search params for sub-nav

## Implementation Steps

1. **Update `layout.tsx`** — Fetch `display_name` and `zoho_user_id` from `hub_users` and pass them as props to `HubSidebar` and `HubHeader`.

2. **Update `HubSidebar`** — Remove `Onboarding`, `Classification`, `Orchestration` from sidebar links. Add `AI Chat` link (route: `/orchestration`). Remove the bottom user area entirely (lines 158-175). Move the collapse/minimize toggle to the bottom of the sidebar.

3. **Update `HubHeader`** — Receive `displayName`, `email`, `zohoUserId` props. Replace sign-out button and static avatar with clickable user avatar. On click, open dropdown showing: Display name, Email, Zoho ID, divider, Settings, Sign Out.

4. **Update `pm/page.tsx`** — Remove the inline TABS bar. Use URL search params (`?tab=...`) for sub-navigation. Default to Home. Sidebar links point to `/pm?tab=home`, `/pm?tab=customers`, etc.

5. **Build AI Chat UI** (`orchestration/page.tsx`) — Match design: greeting card + prompt suggestions (disabled) + disabled input + footer.

6. **Integrate Classification into Tasks** — Add classification sub-view inside TasksTab. Remove or redirect standalone `/classification`.

7. **Align Customers table with design** — Embed `customer_id` below company name. Remove standalone ID, Contact, Created columns. Add explicit "View →" button.

## Acceptance Criteria

- [ ] Visiting `/pm` shows the Home tab content directly (no inline tab bar).
- [ ] Sidebar has: Home, Clients, Tasks, Pipeline, AI Chat entries (no Onboarding, Classification, Orchestration).
- [ ] "+ New Client" button in Clients navigates to `/onboarding`.
- [ ] Clicking "AI Chat" shows the chat interface matching the design.
- [ ] Classification is accessible within Tasks section.
- [ ] Bottom-left sidebar shows only minimize/expand button (no user info).
- [ ] Header avatar opens dropdown with display name, email, Zoho ID, Settings, Sign Out.
- [ ] Sign Out triggers `signOut()` and redirects to sign-in.
- [ ] All existing functionality (customer CRUD, onboarding, PM settings) still works.
- [ ] Dark/light theme toggle works across all views.
- [ ] No TypeScript or lint errors. Build passes.

## Verification

```bash
pnpm tsc --noEmit
pnpm build
pnpm lint
```

Manual checks: sign in, click each sidebar item, click "+ New Client", click user avatar, sign out, toggle dark/light theme, collapse/expand sidebar.

## Compatibility Touchpoints

- **Packaging**: No changes to `package.json` or dependencies.
- **Docs**: No changes needed.
- **Adapters**: The proxy (`src/proxy.ts`) is unaffected.
- **Install surface**: No new env vars or config changes.
- **Database**: No migrations needed; `hub_users` already has the required columns.