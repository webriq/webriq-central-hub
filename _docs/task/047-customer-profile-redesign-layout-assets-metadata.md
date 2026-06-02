# Task 047 — Customer Profile Redesign: Left Nav Layout, Metadata Display, Product Data & Assets Section

> **Recommended Model:** sonnet
> **Type:** minor
> **Priority:** HIGH
> **Status:** TESTING
> **Completed:** 2026-06-02
> **Investigation:** /understand ran before this spec. Findings embedded below.
> **Implementation Notes:** Two-panel layout implemented. Left sidebar nav (w-48) with 6 sections. Outer page container updated to `flex overflow-hidden flex-1`. Assets section lazy-loads on first visit using a `useRef` flag. `customer_assets` table migration at `supabase/migrations/021_customer_assets.sql`. New API at `/api/customers/[customerId]/assets` (GET/POST/DELETE). Credential masking with show/hide toggle. Product onboarding highlights extracted from `onboarding_data` JSON for StackShift and PublishForge. TypeScript clean (no errors).

---

## Goal

Restructure the Customer Profile page from a single long-scroll column into a two-panel layout with a sticky left sidebar nav. Surface company metadata and product-specific onboarding data that is already captured but not displayed. Add a new Assets section backed by a new `customer_assets` DB table.

---

## Requirements

1. **Two-panel layout** — left sidebar nav (~200px fixed) + right scrollable content area, matching the KB page pattern (`kb/page.tsx:75`).
2. **Left nav sections** (in order): Company Info, Primary Contact, Products, Assets, Activity.
3. **Company Info** — display `companyName`, `website`, `industry`, `region`, `companySize` extracted read-only from the best-available `onboarding_data` blob across `customer_products` rows. No migration; no DB edit modal for these fields.
4. **Primary Contact** — existing fields (`contact_name`, `contact_email`) already on `customers` row. Surfaced as its own named section in the right panel.
5. **Products** — one card per product in `customer_products`. Show: product name, status badge, `completed_percentage` progress bar, `onboarding_complete` chip, `zoho_project_id`, `github_repo`, `sanity_project_id`. No live instance URL (deferred). Also show product-specific onboarding highlights: for StackShift show `siteType`, `brandGuide` upload presence, `referenceSites`; for PublishForge show `contentInputs`; extracted from `onboarding_data`.
6. **Assets section** — new `customer_assets` table (migration 021). CRUD: list, add, delete. Three asset types: `file` (label + URL to onboarding-assets bucket), `link` (label + URL), `credential` (label + masked value with show/hide toggle). Add-asset flow via modal. Credentials masked by default (`••••••••`), toggle reveals value.
7. **Activity** — existing classifications table (last 10 records). Stays as-is, moved to its own left-nav section instead of a tab.
8. **Remove the horizontal tab navigation** — the current `profile` / `activity` tabs are replaced by the left sidebar nav sections.
9. **Settings** — the existing automation/LLM/budget settings card stays in the right panel as its own section, accessible via left nav.
10. The outer page container at `src/app/(hub)/dashboard/customers/[customerId]/page.tsx` must change from `p-6 overflow-y-auto flex-1 max-w-240 mx-auto` to `flex overflow-hidden flex-1` to allow the two-panel layout.

---

## File Changes

| File | Action | Notes |
|------|--------|-------|
| `src/app/(hub)/customers/[customerId]/client.tsx` | Modify | Primary edit — all layout + section restructuring |
| `src/app/(hub)/dashboard/customers/[customerId]/page.tsx` | Modify | Outer container class change to `flex overflow-hidden flex-1` |
| `src/app/api/customers/[customerId]/assets/route.ts` | Create | GET + POST + DELETE for customer_assets |
| `supabase/migrations/021_customer_assets.sql` | Create | New customer_assets table + RLS |
| `src/types/database.ts` | Modify | Add customer_assets Row/Insert/Update/Relationships types |

---

## Implementation Steps

### Step 1 — Migration: customer_assets table

Create `supabase/migrations/021_customer_assets.sql`:

```sql
create table if not exists customer_assets (
  id uuid primary key default gen_random_uuid(),
  customer_id text not null references customers(customer_id) on delete cascade,
  type text not null check (type in ('file', 'link', 'credential')),
  label text not null,
  value text not null,
  masked boolean not null default false,
  created_at timestamptz not null default now()
);

alter table customer_assets enable row level security;

create policy "Authenticated users can manage customer assets"
  on customer_assets for all
  using (auth.role() = 'authenticated')
  with check (auth.role() = 'authenticated');
```

### Step 2 — Update database.ts

Add `customer_assets` table types to `src/types/database.ts` after the `customer_products` block (around line 113). Follow the exact same pattern as adjacent table types:

```typescript
customer_assets: {
  Row: {
    id: string;
    customer_id: string;
    type: "file" | "link" | "credential";
    label: string;
    value: string;
    masked: boolean;
    created_at: string;
  };
  Insert: {
    id?: string;
    customer_id: string;
    type: "file" | "link" | "credential";
    label: string;
    value: string;
    masked?: boolean;
    created_at?: string;
  };
  Update: {
    id?: string;
    customer_id?: string;
    type?: "file" | "link" | "credential";
    label?: string;
    value?: string;
    masked?: boolean;
  };
  Relationships: [
    {
      foreignKeyName: "customer_assets_customer_id_fkey";
      columns: ["customer_id"];
      isOneToOne: false;
      referencedRelation: "customers";
      referencedColumns: ["customer_id"];
    }
  ];
};
```

### Step 3 — Assets API route

Create `src/app/api/customers/[customerId]/assets/route.ts`:

- `GET` — fetch all assets for the customer (use `createClient()` with session auth)
- `POST` — insert a new asset (`{ type, label, value, masked }`)
- `DELETE` — delete an asset by `id` (query param `?id=...`)
- Auth: all three methods require a valid session via `createClient()`; return 401 if no session

Pattern to follow: `src/app/api/customers/[customerId]/route.ts` (lines 1–34 for GET pattern).

### Step 4 — Outer page container

In `src/app/(hub)/dashboard/customers/[customerId]/page.tsx`, find the wrapper div that has `p-6 overflow-y-auto flex-1 max-w-240 mx-auto` and change it to `flex overflow-hidden flex-1`. This enables the two-panel layout inside `client.tsx`.

### Step 5 — client.tsx: layout restructure

In `src/app/(hub)/customers/[customerId]/client.tsx`:

**a. New state:**
```typescript
type NavSection = "company" | "contact" | "products" | "assets" | "activity" | "settings";
const [activeSection, setActiveSection] = useState<NavSection>("company");
```

**b. Remove** the existing horizontal tab state (`activeTab`) and tab navigation JSX (lines 772–787). Replace with the two-panel layout.

**c. New outer structure** (replace the existing single-column container):
```tsx
<div className="flex gap-0 flex-1 overflow-hidden">
  {/* Left sidebar nav */}
  <div className="w-48 shrink-0 border-r border-slate-100 bg-white flex flex-col overflow-hidden">
    <div className="px-4 py-3 border-b border-slate-100">
      <div className="text-[10px] font-bold text-slate-400 tracking-[0.06em] uppercase">Customer</div>
      <div className="text-sm font-semibold text-slate-900 mt-0.5 truncate">{customer.company_name}</div>
      <div className="text-[11px] text-slate-400">{customer.customer_id}</div>
    </div>
    <nav className="flex-1 overflow-y-auto py-2">
      {navItems.map(item => (
        <button key={item.id} onClick={() => setActiveSection(item.id)}
          className={cn(
            "w-full text-left px-4 py-2 text-[12px] font-medium border-none cursor-pointer font-[inherit] transition-colors",
            activeSection === item.id
              ? "bg-indigo-50 text-brand font-semibold"
              : "bg-transparent text-slate-600 hover:bg-slate-50 hover:text-slate-900"
          )}>
          {item.label}
        </button>
      ))}
    </nav>
  </div>

  {/* Right content panel */}
  <div className="flex-1 overflow-y-auto p-6">
    {/* render active section */}
  </div>
</div>
```

**d. Nav items array** (define near component top, after state):
```typescript
const navItems: { id: NavSection; label: string }[] = [
  { id: "company", label: "Company Info" },
  { id: "contact", label: "Primary Contact" },
  { id: "products", label: "Products" },
  { id: "assets", label: "Assets" },
  { id: "activity", label: `Activity (${classifications.length})` },
  { id: "settings", label: "Settings" },
];
```

**e. Section rendering** — each `activeSection` value renders its card in the right panel:
- `"company"` → new Company Info card (read-only metadata from `onboarding_data`)
- `"contact"` → existing contact fields card
- `"products"` → existing products section + new product-specific highlights
- `"assets"` → new Assets section (list + add button)
- `"activity"` → existing classifications table (currently in the `activity` tab)
- `"settings"` → existing Settings card (automation/LLM/budget)

### Step 6 — Company Info section

Extract metadata from `onboarding_data` across all `customer_products` rows. Use the first product that has a non-null value for each field:

```typescript
function extractMetadata(products: CustomerProduct[]) {
  const data = products.find(p => p.onboarding_data)?.onboarding_data as Record<string, unknown> | null;
  return {
    companyName: data?.companyName as string | undefined,
    website: data?.website as string | undefined,
    industry: data?.industry as string | undefined,
    region: data?.region as string | undefined,
    companySize: data?.companySize as string | undefined,
  };
}
```

Display in a `sectionCls` card with labeled read-only rows. Use `labelCls` and `text-sm text-slate-900`. If a field is not set, show `—`.

### Step 7 — Products section with onboarding highlights

For each product card, after the existing progress bar, add an "Onboarding Highlights" row that extracts these fields from `onboarding_data`:

- **StackShift:** `siteType`, `brandGuide` (show "Uploaded" if present, "None" if not), `referenceSites`
- **PublishForge:** `contentInputs` (truncated to 80 chars)
- **PipelineForge:** no highlights (onboarding schema has none)

Use the existing product card container and `sectionTitleCls` for section labels within the card.

### Step 8 — Assets section

**State additions:**
```typescript
type Asset = Database["public"]["Tables"]["customer_assets"]["Row"];
const [assets, setAssets] = useState<Asset[]>([]);
const [assetsLoading, setAssetsLoading] = useState(false);
const [showAddAsset, setShowAddAsset] = useState(false);
const [addAssetForm, setAddAssetForm] = useState({ type: "link" as Asset["type"], label: "", value: "", masked: false });
const [revealedAssets, setRevealedAssets] = useState<Set<string>>(new Set());
```

**Load assets** when `activeSection === "assets"` and `assets.length === 0` (lazy load — only fetch when tab is first visited). Use a `useEffect` that watches `activeSection`.

**Asset list display:**
- Group by type with a small label chip: `FILE`, `LINK`, `CREDENTIAL`
- Each row: label, type chip, value (masked with `••••••••` if `masked === true` and not in `revealedAssets`), action buttons (reveal/hide for credentials, delete for all)
- Delete calls `DELETE /api/customers/[customerId]/assets?id={id}`

**Add Asset modal** — follow the existing modal pattern from `client.tsx` (fixed overlay, max-w-130 card, header/body/footer). Fields: type selector (link / credential / file), label text input, value input (with note: "for credentials, value is stored in plain text — only store references or partial tokens, not full secrets"), masked toggle (only shown when type = credential).

**Important:** Do NOT store actual secrets like DNS passwords or full API keys. The masked toggle is for obscuring short references (e.g. partial token, vault path). Add a helper text in the modal: "Store references (e.g. LastPass item name) — not actual secrets."

### Step 9 — Wire asset loading into fetch

Update the initial data fetch in `client.tsx` (the `useEffect` that fetches the customer) to also fetch assets on mount OR load assets lazily on first visit to the Assets section (lazy preferred to avoid an extra API call on every profile open).

---

## Code Context

### Style constants (client.tsx:62–65)
```typescript
const sectionCls = "bg-white border border-slate-200 rounded-xl p-5 shadow-[0_1px_4px_rgba(0,0,0,0.05)] mb-4";
const sectionTitleCls = "text-[10px] font-bold text-slate-400 tracking-[0.06em] uppercase mb-3.5";
const inputCls = "font-[inherit] w-full text-sm py-2.5 px-3.5 border border-slate-200 rounded-lg text-slate-900 bg-white outline-none transition-[border-color,box-shadow] duration-200 focus:border-brand focus:shadow-[0_0_0_3px_rgba(51,88,244,0.1)]";
const labelCls = "block text-xs font-semibold text-slate-600 mb-1.5";
```

### Tab navigation being replaced (client.tsx:772–787)
```tsx
<div className="flex gap-2 border-b border-slate-200 mb-4 px-1">
  {(["profile", "activity"] as const).map(tab => (
    <button key={tab} onClick={() => setActiveTab(tab)}
      className={cn("font-[inherit] text-[12px] font-medium pb-2 px-1 border-b-2 -mb-px transition-colors capitalize bg-transparent cursor-pointer",
        activeTab === tab ? "border-brand text-brand" : "border-transparent text-slate-500 hover:text-slate-700"
      )}>
      {tab === "profile" ? "Profile" : `Activity (${classifications.length})`}
    </button>
  ))}
</div>
```

### Two-panel layout pattern (kb/page.tsx:75–102)
```tsx
<div className="p-6 flex gap-4 flex-1 overflow-hidden">
  <div className={cn(cardCls, "w-56 shrink-0 flex flex-col overflow-hidden")}>
    <div className="px-4 py-3 border-b border-slate-100">
      <span className="text-sm font-bold text-slate-900">Customers</span>
    </div>
    <div className="flex-1 overflow-y-auto">
      {customers.map((c) => (
        <button key={c.customer_id} onClick={() => setSelectedId(c.customer_id)}
          className={cn("w-full text-left px-4 py-2.5 text-sm border-none cursor-pointer font-[inherit] border-b border-slate-50 transition-colors",
            selectedId === c.customer_id ? "bg-indigo-50 text-brand font-semibold" : "bg-white text-slate-700 hover:bg-slate-50"
          )}>
          {c.company_name}
          <div className="text-[11px] text-slate-400 font-normal">{c.customer_id}</div>
        </button>
      ))}
    </div>
  </div>
  {/* Right panel */}
</div>
```

### customers Row (database.ts:7–22) — no metadata columns
```typescript
Row: {
  id: string;
  customer_id: string;
  company_name: string;
  contact_name: string | null;
  contact_email: string | null;
  status: string;
  automation_toggle: boolean;
  llm_excluded: boolean;
  communication_tone: string;
  onboarding_status: Json;
  daily_token_budget: number | null;
  automation_paused: boolean;
  created_at: string;
  updated_at: string;
};
```

### customer_products Row (database.ts:57–72) — onboarding_data is Json
```typescript
Row: {
  id: string;
  customer_id: string;
  product_name: string;
  product_instance_id: string | null;
  sanity_project_id: string | null;
  zoho_project_id: string | null;
  github_repo: string | null;
  status: string;
  onboarding_complete: boolean;
  onboarding_data: Json;
  completed_percentage: number;
  dedicated_developers: string[];
  created_at: string;
  updated_at: string;
};
```

### Onboarding metadata fields (onboarding-schemas.ts:8–46)
Fields captured in `onboarding_data.companyName`, `.website`, `.industry`, `.region`, `.companySize` (companyInfoSection), plus `.primaryContactName`, `.primaryContactEmail`, `.primaryContactPhone`, `.primaryContactRole` (stakeholdersSection).

---

## Notes for Implementation Agent

- **sonnet recommended** — this task spans DB migration, new API route, and a structural overhaul of the largest file in the codebase (client.tsx is 1216 lines). Multiple architectural judgment calls required.
- **Edit only `(hub)/customers/[customerId]/client.tsx`** — the dashboard route (`(hub)/dashboard/customers/[customerId]/page.tsx`) imports it via `@ts-ignore` cross-route-group import. Changes to `client.tsx` propagate automatically to the dashboard route.
- **Outer container change is required** — if the `p-6 overflow-y-auto flex-1 max-w-240 mx-auto` wrapper on the dashboard page is not changed to `flex overflow-hidden flex-1`, the two-panel layout will not render correctly (it will scroll as a block rather than having independent panel scrolling).
- **`industry`, `region`, `website`, `companySize` do NOT exist as DB columns** — they are only in `onboarding_data` JSON on `customer_products`. Display as read-only. Do not add an edit modal for these fields.
- **All modals must follow the existing pattern** in `client.tsx` (fixed overlay, `max-w-130` card, header/body/footer structure). See lines 344–500 for reference.
- **Assets credentials safety note** — the modal must display helper text warning PMs not to store actual secrets. The masked toggle only adds visual obscuring in the UI; values are stored in plain text in the DB.
- **Assets lazy-load** — only fetch assets when `activeSection === "assets"` first becomes true (use a `useEffect` with a `hasFetchedAssets` ref flag). This avoids an extra round-trip on every profile open.
- **Migration file** is `021_customer_assets.sql` — the last migration is `020_hub_users_pending_role.sql`.
- **Tailwind classes only** — no `style={{}}` except for genuinely non-expressible values. Use `cn()` from `@/lib/utils` for conditional classes.
- **Do not run git commands** — user manages version control manually.
