# 012: PM Dashboard — Sub-Routes, Tailwind Cleanup & Active Indicator

**Created:** 2026-05-15
**Priority:** HIGH
**Type:** enhancement
**Recommended Model:** sonnet
**Status:** TESTING
**Completed:** 2026-05-15
**Implementation Notes:** TypeScript and lint both pass zero errors. All 5 sub-route pages created. All 4 PM tab components converted to CSS-vars-on-wrapper + Tailwind pattern. Active indicator fixed with `exact` flag on Home nav item.

> **Investigation:** All source files read directly in session. Findings embedded below.

---

## Overview

Three connected improvements to the PM dashboard:

1. **Sub-routes** — Replace `?tab=` query-param navigation with real Next.js App Router pages:
   `/pm` (home), `/pm/customers`, `/pm/tasks`, `/pm/pipeline`, `/pm/settings`

2. **Tailwind cleanup** — Eliminate all `style={{}}` from every PM tab component using the
   CSS-custom-property pattern established in `home-tab.tsx` (task 011).

3. **Active indicator** — Fix sidebar so `/pm` only highlights when the URL is exactly `/pm`,
   not for every `/pm/*` child route.

---

## Requirements

- [ ] `/pm` renders home content (existing HomeTab)
- [ ] `/pm/customers`, `/pm/tasks`, `/pm/pipeline`, `/pm/settings` each have their own page file
- [ ] Sidebar nav items point to the new routes (no `?tab=` params)
- [ ] Active indicator: exact match for `/pm`, prefix match for all sub-routes
- [ ] Header Settings dropdown link updated to `/pm/settings`
- [ ] `clients-tab.tsx` — zero `style={{}}` (structural → Tailwind, colors → CSS vars)
- [ ] `tasks-tab.tsx` — zero `style={{}}`
- [ ] `pipeline-tab.tsx` — zero `style={{}}`
- [ ] `settings-tab.tsx` — zero `style={{}}`, inline `Seg` component moved outside function
- [ ] `pm/page.tsx` — simplified to home-only page (remove tab routing), keep customer fetch for HomeTab
- [ ] `pnpm lint` and `npx tsc --noEmit` pass with zero errors in changed files

## Out of Scope / Must-Not-Change

- Do NOT touch `home-tab.tsx` — already converted in task 011
- Do NOT touch `shared.tsx` shared components (StatCard, ProgressBar, StatusBadge, etc.) — leave their internals alone; they still accept `tokens` and render inline styles internally
- Do NOT change the DB schema, auth, or API routes
- Do NOT add a PM-level layout (`pm/layout.tsx`) — each page is self-contained
- Do NOT change `/pm/settings` to a global settings route — it is PM-workspace preferences only

---

## Proposed File Changes

| File | Action | Purpose |
|------|--------|---------|
| `src/app/(hub)/pm/page.tsx` | Modify | Remove tab router; render HomeTab directly; keep customer + displayName fetches |
| `src/app/(hub)/pm/customers/page.tsx` | Create | Customers page (ClientsTab + data fetch + realtime) |
| `src/app/(hub)/pm/tasks/page.tsx` | Create | Tasks page (TasksTab) |
| `src/app/(hub)/pm/pipeline/page.tsx` | Create | Pipeline page (PipelineTab) |
| `src/app/(hub)/pm/settings/page.tsx` | Create | Settings page (SettingsTab) |
| `src/components/hub/hub-sidebar.tsx` | Modify | Update hrefs to sub-routes; add `exact` flag; fix active logic |
| `src/components/hub/hub-header.tsx` | Modify | Update Settings link from `?tab=settings` → `/pm/settings` |
| `src/components/hub/pm-tabs/clients-tab.tsx` | Modify | Convert all inline styles → Tailwind + CSS vars; replace ThemeCard with CARD const |
| `src/components/hub/pm-tabs/tasks-tab.tsx` | Modify | Same |
| `src/components/hub/pm-tabs/pipeline-tab.tsx` | Modify | Same |
| `src/components/hub/pm-tabs/settings-tab.tsx` | Modify | Same; move inline `Seg` component outside |

---

## Code Context

### Pattern established by home-tab.tsx (task 011)

```tsx
// 1. Card class constant — replaces ThemeCard everywhere
const CARD = "rounded-[14px] border border-[var(--c-border)] shadow-[0_1px_4px_rgba(0,0,0,0.05)] bg-[var(--c-card)]";

// 2. Wrapper div: single style={} for CSS var declarations only
<div
  style={{
    "--c-text": C.text, "--c-sub": C.sub, "--c-muted": C.muted,
    "--c-card": C.card, "--c-border": C.border,
    "--c-blue": C.blue, "--c-orange": C.orange, "--c-sky": C.sky,
    "--c-violet": C.violet, "--c-green": C.green, "--c-amber": C.amber,
    "--c-red": C.red,
    // derived tints
    "--c-sky-tint": `${C.sky}0d`, "--c-sky-tint2": `${C.sky}0e`,
    "--c-sky-border": `${C.sky}20`, "--c-sky-border2": `${C.sky}22`,
    "--c-blue-tint": `${C.blue}12`, "--c-blue-border": `${C.blue}30`,
    "--c-track": C === DARK ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.06)",
  } as React.CSSProperties}
>

// 3. All children use Tailwind + var() arbitrary values
<div className="text-[var(--c-text)] text-[13px] font-medium" />
<div className={`${CARD} p-5`} />

// 4. Per-item dynamic colors → element-level CSS vars
<span
  className="text-[9px] font-bold rounded-full px-[6px] py-px border text-[var(--bc)] bg-[var(--bb)] border-[var(--bd)]"
  style={{ "--bc": color, "--bb": `${color}12`, "--bd": `${color}22` } as React.CSSProperties}
/>

// 5. Static lookup for Tailwind-scannable classes (not template literals)
const STATUS_CLS: Record<string, { text: string; tint: string; border: string }> = {
  green: { text: "text-[var(--c-green)]", tint: "bg-[var(--c-green-tint)]", border: "border-[var(--c-green-border)]" },
  // ...
};
```

### hub-sidebar.tsx — current nav + active logic (lines 19–30, 79–81)

```tsx
// Current — query params, no exact flag
{ href: `${ROUTES.PM}?tab=home`, ... },
{ href: `${ROUTES.PM}?tab=customers`, ... },

// Current active check (wrong: /pm matches /pm/customers)
const active = pathname === item.href || (item.href !== "/" && pathname.startsWith(item.href));

// Target — sub-routes with exact flag
interface NavItem { href: string; label: string; icon: ComponentType; exact?: boolean; }
{ href: ROUTES.PM, label: "Home", icon: LayoutDashboard, exact: true },
{ href: `${ROUTES.PM}/customers`, label: "Clients", icon: Users },

// Target active check
const active = item.exact
  ? pathname === item.href
  : pathname === item.href || pathname.startsWith(item.href + "/");
```

### hub-header.tsx — settings link (line 126)

```tsx
// FROM:
router.push("/pm?tab=settings");
// TO:
router.push("/pm/settings");
```

### pm/page.tsx — current structure (lines 18–124)

Full client component. State: `displayName`, `customers`, `loading`, `error`, `search`, `statusFilter`, `sortBy`, `sortDir`. After change: remove `activeTab`, `tabParam`, all tab-routing logic. Keep `displayName` fetch, `customers` fetch, Realtime subscription. Remove unused state: `loading`, `error`, `search`, `statusFilter`, `sortBy`, `sortDir`, `retryRef`.

Return JSX: replace multi-tab render with single `<HomeTab customers={customers} settings={settings} displayName={displayName} />`.

### New page pattern — tasks, pipeline, settings (simplest cases)

```tsx
// src/app/(hub)/pm/tasks/page.tsx
"use client";
import React from "react";
import { usePMSettings } from "@/hooks/use-pm-settings";
import { getTokens } from "@/components/hub/pm-tabs/shared";
import TasksTab from "@/components/hub/pm-tabs/tasks-tab";

export default function PMTasksPage() {
  const { settings } = usePMSettings();
  const C = getTokens(settings);
  return (
    <div
      className="flex-1 overflow-y-auto py-[26px] px-8 bg-[var(--c-page-bg)]"
      style={{ "--c-page-bg": C.bg } as React.CSSProperties}
    >
      <TasksTab settings={settings} />
    </div>
  );
}
```

### New page pattern — customers (needs data fetch + realtime)

```tsx
// src/app/(hub)/pm/customers/page.tsx — mirrors pm/page.tsx customer fetch
"use client";
import React, { useEffect, useState, useRef } from "react";
import { usePMSettings } from "@/hooks/use-pm-settings";
import { createClient } from "@/lib/supabase/client";
import { getTokens } from "@/components/hub/pm-tabs/shared";
import ClientsTab from "@/components/hub/pm-tabs/clients-tab";
import type { CustomerWithProducts } from "@/components/hub/pm-tabs/clients-tab";
import type { CustomerProductRow } from "@/types/database";

export default function PMCustomersPage() {
  const { settings } = usePMSettings();
  const C = getTokens(settings);
  const [customers, setCustomers] = useState<CustomerWithProducts[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [sortBy, setSortBy] = useState("created_at");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const retryRef = useRef<() => void>(() => {});

  useEffect(() => {
    let cancelled = false;
    const fetch_ = async () => {
      setLoading(true); setError(null);
      try {
        const params = new URLSearchParams({ limit: "100" });
        if (search) params.set("search", search);
        if (statusFilter) params.set("status", statusFilter);
        const res = await fetch(`/api/customers?${params}`);
        if (!res.ok) throw new Error("Failed to load customers");
        const data = await res.json();
        if (!cancelled) setCustomers(data);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Failed");
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    retryRef.current = fetch_;
    fetch_();
    return () => { cancelled = true; };
  }, [search, statusFilter]);

  useEffect(() => {
    const supabase = createClient();
    const ch = supabase.channel("pm_customers_products")
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "customer_products" }, (payload) => {
        const u = payload.new as CustomerProductRow;
        setCustomers(prev => prev.map(c => ({
          ...c,
          customer_products: c.customer_products.map(p => p.id === u.id ? { ...p, ...u } : p),
        })));
      }).subscribe();
    return () => { supabase.removeChannel(ch); };
  }, []);

  const handleSort = (col: string) => {
    if (sortBy === col) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortBy(col); setSortDir("asc"); }
  };

  return (
    <div
      className="flex-1 overflow-y-auto py-[26px] px-8 bg-[var(--c-page-bg)]"
      style={{ "--c-page-bg": C.bg } as React.CSSProperties}
    >
      <ClientsTab
        customers={customers} loading={loading} error={error}
        search={search} onSearchChange={setSearch}
        statusFilter={statusFilter} onStatusFilterChange={setStatusFilter}
        sortBy={sortBy} sortDir={sortDir} onSort={handleSort}
        onRetry={() => retryRef.current()} settings={settings}
      />
    </div>
  );
}
```

### clients-tab.tsx — inline style patterns to convert

```tsx
// Header row (line 47-53)
style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}
→ className="flex items-center justify-between mb-5"

style={{ fontSize: 22, fontWeight: 700, color: C.text, letterSpacing: "-0.02em" }}
→ className="text-[22px] font-bold text-[var(--c-text)] tracking-[-0.02em]"

style={{ fontSize: 12, color: C.sub, marginTop: 2 }}
→ className="text-xs text-[var(--c-sub)] mt-[2px]"

// "+ New Client" button (line 52)
style={{ fontSize: 12, fontWeight: 600, color: "#fff", background: C.orange, border: "none", borderRadius: 9, padding: "9px 18px", cursor: "pointer", fontFamily: "inherit" }}
→ className="text-xs font-semibold text-white bg-[var(--c-orange)] rounded-[9px] px-[18px] py-[9px] cursor-pointer border-0"

// Filters (lines 71-82)
style={{ display: "flex", gap: 10, marginBottom: 16, alignItems: "center" }}
→ className="flex gap-[10px] mb-4 items-center"

style={{ position: "relative", flex: 1, maxWidth: 300 }}
→ className="relative flex-1 max-w-[300px]"

// search input style: background, border, color are token-dependent — use CSS vars
// input className: "w-full text-[13px] py-2 pr-3 pl-[34px] bg-[var(--c-card)] border border-[var(--c-border)] rounded-[9px] text-[var(--c-text)] outline-none box-border"

// Filter buttons: active state via conditional className (not inline)
const btnCls = active
  ? "text-white bg-[var(--c-blue)] border-[var(--c-blue)]"
  : "text-[var(--c-sub)] bg-[var(--c-card)] border-[var(--c-border)]";
// + base: "text-xs font-semibold rounded-lg px-[14px] py-[7px] cursor-pointer border"

// Table header (th style — line 90)
// padding, fontSize, fontWeight, letterSpacing, textTransform, borderBottom, cursor, whiteSpace → all Tailwind
// color and borderBottom color → CSS vars

// Table rows — dynamic border (line 107): use conditional className
className={i < data.length - 1 ? "border-b border-[var(--c-border)]" : ""}

// View → button (line 123)
style={{ fontSize: 12, fontWeight: 600, color: C.sky, background: `${C.sky}0d`, border: `1px solid ${C.sky}25`, borderRadius: 7, padding: "6px 12px", cursor: "pointer" }}
→ className="text-xs font-semibold text-[var(--c-sky)] bg-[var(--c-sky-tint)] border border-[var(--c-sky-border3)] rounded-[7px] px-3 py-[6px] cursor-pointer"
```

### tasks-tab.tsx — inline style patterns

```tsx
// Header (line 26-37): same pattern as clients-tab header
// Task type chip: color: C.sky, background: ${C.sky}0e, border: ${C.sky}20 → CSS vars
// AI Confidence chip: color is dynamic (cc(t.conf)), background: cc10, border: cc20
//   → per-element CSS vars: style={{ "--cc": cc(t.conf), "--cc-bg": `${cc(t.conf)}10`, "--cc-bd": `${cc(t.conf)}20` }}
//   → className: "text-[11px] font-semibold rounded-[6px] px-2 py-px font-mono text-[var(--cc)] bg-[var(--cc-bg)] border border-[var(--cc-bd)]"
// Classified badge: static classes for green text + classify button for blue bg
```

### pipeline-tab.tsx — inline style patterns

```tsx
// Stage dot: background: s.color → element-level CSS var
<div className="w-2 h-2 rounded-full bg-[var(--sc)]" style={{ "--sc": s.color } as React.CSSProperties} />

// Stage count badge: color: s.color, bg: ${s.color}12, border: ${s.color}20
<span className="..." style={{ "--sc": s.color, "--sc-bg": `${s.color}12`, "--sc-bd": `${s.color}20` } as React.CSSProperties}>

// Pipeline item cards: replace ThemeCard with CARD const
<div className={`${CARD} py-[11px] px-[13px] cursor-pointer`}>

// Status badges in items: sc[item.status] is dynamic
<span className="..." style={{ "--bc": sc[item.status], "--bb": `${sc[item.status]}12`, "--bd": `${sc[item.status]}22` } as React.CSSProperties}>
```

### settings-tab.tsx — inline `Seg` component must move outside

```tsx
// CURRENT (triggers react-hooks/static-components lint error):
export default function SettingsTab(...) {
  function Seg(...) { ... }  // ← defined inside render, lint error
}

// FIX: move Seg outside SettingsTab, pass C as prop
interface SegProps {
  label: string; desc?: string;
  options: { value: string; label: string; icon: string }[];
  value: string; onChange: (v: string) => void;
  tokens: Tokens;
  isDark: boolean;
}
function Seg({ label, desc, options, value, onChange, tokens: C, isDark }: SegProps) { ... }

// Then in SettingsTab:
<Seg ... tokens={C} isDark={C === DARK_C} />
```

---

## Implementation Steps

1. **`hub-sidebar.tsx`** — Add `exact?: boolean` to nav item type. Change hrefs to sub-routes. Update active logic to `item.exact ? pathname === item.href : pathname === item.href || pathname.startsWith(item.href + "/")`.

2. **`hub-header.tsx`** — Change `router.push("/pm?tab=settings")` → `router.push("/pm/settings")`.

3. **`pm/page.tsx`** — Remove `useSearchParams`, `initialTab`, `activeTab`, `loading`, `error`, `search`, `statusFilter`, `sortBy`, `sortDir`, `retryRef`, `handleSort`, `clientsProps`. Remove all tab-routing conditional renders. Keep: `usePMSettings`, `displayName` fetch, `customers` fetch + realtime. Return a single scrollable wrapper + `<HomeTab>`.

4. **Create `pm/customers/page.tsx`** — Full customers page with fetch + realtime + sort/filter state, renders `<ClientsTab>`. Use the CSS var wrapper pattern.

5. **Create `pm/tasks/page.tsx`** — Thin wrapper + `<TasksTab>`.

6. **Create `pm/pipeline/page.tsx`** — Thin wrapper + `<PipelineTab>`.

7. **Create `pm/settings/page.tsx`** — Thin wrapper + `<SettingsTab>`.

8. **`clients-tab.tsx`** — Add CSS var wrapper. Replace all ThemeCard with CARD const. Convert all inline styles per the Code Context patterns above.

9. **`tasks-tab.tsx`** — Same pattern. For AI Confidence chip use per-element `--cc` vars. For classified/classify status use static conditional classes.

10. **`pipeline-tab.tsx`** — Same pattern. Per-element `--sc` vars for stage colors, `--bc/--bb/--bd` vars for status badge colors.

11. **`settings-tab.tsx`** — Move `Seg` outside `SettingsTab` with `tokens` + `isDark` props. Add CSS var wrapper. Convert all inline styles.

---

## Notes for Implementation Agent

- **Sonnet recommended**: This task touches 10+ files across app routes, components, and nav. Cross-cutting changes with multiple interaction points between files.
- **CSS var pattern** (established in task 011, `home-tab.tsx`): wrapper div gets one `style={{}}` containing only CSS custom property declarations (no appearance values). All child elements use `className` with Tailwind arbitrary values referencing `var(--c-*)`.
- **CARD constant**: `"rounded-[14px] border border-[var(--c-border)] shadow-[0_1px_4px_rgba(0,0,0,0.05)] bg-[var(--c-card)]"` — defined per file, replaces every `<ThemeCard>` usage.
- **Per-element vars for dynamic colors**: when color depends on runtime data (status, confidence score, stage color), set `--bc`/`--bb`/`--bd` (badge color/bg/border) on the element itself. The style prop at the element level contains only CSS var declarations.
- **Tailwind static scan**: never use template literals to build class names. When color classes vary per data item, define a complete lookup object (string literals as values) so Tailwind includes them in output.
- **Remove `fontFamily: "inherit"`** from all buttons — Tailwind preflight already applies this.
- **`Seg` in settings-tab**: currently defined inside `SettingsTab`, triggering `react-hooks/static-components` lint error. Must be moved outside. Pass `tokens` and `isDark` as explicit props.
- **Table borders**: replace `style={{ borderBottom: i < n-1 ? ... : "none" }}` with conditional `className`: `i < data.length - 1 ? "border-b border-[var(--c-border)]" : ""`.
- **Unused imports**: after removing ThemeCard usages, remove it from each file's import line.

---

## Acceptance Criteria

- [ ] Navigating to `/pm/customers` renders the Clients page directly (no query params)
- [ ] Navigating to `/pm/tasks`, `/pm/pipeline`, `/pm/settings` each render their page
- [ ] Sidebar: "Home" item active **only** when pathname is exactly `/pm`
- [ ] Sidebar: "Clients" item active when on `/pm/customers` or `/pm/customers/anything`
- [ ] No sidebar item erroneously highlights `/pm` when on `/pm/customers`
- [ ] Header Settings button navigates to `/pm/settings`
- [ ] Zero `style={{ ... }}` in clients-tab, tasks-tab, pipeline-tab, settings-tab that contain appearance values (only CSS var declarations allowed)
- [ ] `npx tsc --noEmit` — zero errors
- [ ] `pnpm lint` — zero errors in all changed files

---

## Verification

```bash
npx tsc --noEmit
pnpm lint
```

Manual:
- Visit `/pm` → Home loads, sidebar "Home" highlighted
- Visit `/pm/customers` → Clients table loads, sidebar "Clients" highlighted, "Home" NOT highlighted
- Visit `/pm/tasks`, `/pm/pipeline`, `/pm/settings` → each loads, correct sidebar item highlighted
- Header avatar dropdown → Settings → lands on `/pm/settings`
- Check dark/light theme toggle works on all pages

---

## Compatibility Touchpoints

- No new env vars or DB migrations
- `hub-header.tsx` Settings link changes from `?tab=settings` → `/pm/settings`
- `pm/page.tsx` no longer reads `useSearchParams` — any bookmarked `?tab=` URLs will fall back to Home
