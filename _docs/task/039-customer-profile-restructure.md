# Task 039 — Customer Profile Restructure

> **Type:** minor
> **Priority:** HIGH
> **Recommended Model:** haiku
> **Status:** TESTING
> **Completed:** 2026-06-02
> **Implementation Notes:** Settings section added with communication_tone moved there. Tab switcher (Profile/Activity) controls visibility. Classifications moved to Activity tab. dedicated_developers count shown per product card. Edit modal extended with automation_toggle, llm_excluded, daily_token_budget. PATCH route and validate.ts updated to accept new fields.

## Problem

The customer profile page (`/customers/[customerId]`) has three sections today:
1. **Contact Information** — name, email, communication tone, created date
2. **Products** — cards with progress bar + Zoho/onboarding links
3. **Classifications** — table of tasks embedded at the bottom

This misses most of what the spec defines as the customer profile and buries the classification/activity data in the wrong place.

**Missing from the UI (all fields exist in DB):**
- `automation_toggle` — whether plan generation auto-triggers for this customer
- `llm_excluded` — whether this customer is fully excluded from AI pipeline
- `daily_token_budget` / `automation_paused` — cost controls and circuit breaker state
- `dedicated_developers` per product (in `customer_products` table)

**Structural problems:**
- Classifications/tasks don't belong in the identity profile — they belong in an activity view
- No visual hierarchy between "who is this client" and "what are the PM controls"
- Communication tone is buried in Contact Information but it's an AI/operations setting

## Goal

Restructure the customer profile into clear, purposeful sections with all DB fields surfaced. Move task activity to a tab so the profile itself stays scannable.

---

## New Layout Structure

```
┌─────────────────────────────────────────────────────┐
│ Header: Company name, ID, status badge, Edit button │
│         Copy Onboarding Link button                 │
├─────────────────────────────────────────────────────┤
│ CONTACT                                             │
│ Contact Name · Email · Created date                 │
├─────────────────────────────────────────────────────┤
│ SETTINGS (NEW — currently missing)                  │
│ Communication Tone · Automation Toggle              │
│ LLM Excluded · Daily Token Budget                   │
│ Automation Paused (circuit breaker state)           │
├─────────────────────────────────────────────────────┤
│ PRODUCTS (enhanced)                                 │
│ Per product: progress bar, Zoho/Sanity links,       │
│ dedicated developers list                           │
├─────────────────────────────────────────────────────┤
│ [Activity tab — separate from profile sections]     │
│ Classifications table (moved from profile scroll)   │
└─────────────────────────────────────────────────────┘
```

---

## Implementation Steps

### Step 1 — Add Settings section

**File:** `src/app/(hub)/customers/[customerId]/client.tsx`

Add a new section after Contact Information. The fields come from the already-loaded `customer` object (no new DB query needed).

**Settings section fields:**

| Field | DB column | Display |
|-------|-----------|---------|
| Communication Tone | `communication_tone` | Badge: `formal` / `casual` / `technical` |
| Automation | `automation_toggle` | Toggle indicator (ON/OFF) with label |
| LLM Excluded | `llm_excluded` | Badge: "AI Enabled" / "Human Only" |
| Daily Token Budget | `daily_token_budget` | Number input or display (`null` = unlimited) |
| Automation Paused | `automation_paused` | Warning badge if true (circuit breaker triggered) |

For display-only (not editable inline), render as a 2-column grid of label/value pairs matching the existing `sectionCls` style already defined at L61.

Make `automation_toggle`, `llm_excluded`, and `automation_paused` editable via the existing Edit flow (add these fields to the `EditForm` type at L120 and the edit modal).

Move `communication_tone` out of the Contact section into Settings — it's an operational setting, not a contact detail.

### Step 2 — Show dedicated_developers per product card

**File:** `src/app/(hub)/customers/[customerId]/client.tsx`

The `customer_products` rows (loaded via `select("*, customer_products(*)")`) include a `dedicated_developers` column (UUID array). Add a display row inside each product card:

```tsx
// In the product card render (around L763)
{product.dedicated_developers && product.dedicated_developers.length > 0 ? (
  <div className="text-[11px] text-gray-500 mt-1">
    Dedicated devs: {product.dedicated_developers.length}
  </div>
) : (
  <div className="text-[11px] text-gray-400 mt-1">No dedicated developers</div>
)}
```

For now, show count only (resolving UUIDs to names requires a `hub_users` join — add a note that full name display is a future improvement).

### Step 3 — Move Classifications to Activity tab

**File:** `src/app/(hub)/customers/[customerId]/client.tsx`

The classifications table (currently rendered around L879+) clutters the profile. Replace it with a tab switcher.

Add a `activeTab` state: `"profile" | "activity"` (default `"profile"`).

```tsx
const [activeTab, setActiveTab] = useState<"profile" | "activity">("profile");
```

Render tab pills below the Products section:

```tsx
<div className="flex gap-2 mt-4 border-b border-gray-100 pb-0">
  {["profile", "activity"].map(tab => (
    <button
      key={tab}
      onClick={() => setActiveTab(tab as "profile" | "activity")}
      className={cn(
        "text-[12px] font-medium pb-2 px-1 border-b-2 -mb-px transition-colors capitalize",
        activeTab === tab
          ? "border-brand-blue text-brand-blue"
          : "border-transparent text-gray-500 hover:text-gray-700"
      )}
    >
      {tab === "profile" ? "Profile" : `Activity (${classifications.length})`}
    </button>
  ))}
</div>
```

Under the tab:
- **Profile tab** — Contact + Settings + Products (as restructured above)
- **Activity tab** — existing classifications table, unchanged

### Step 4 — Remove communication_tone from Contact section

**File:** `src/app/(hub)/customers/[customerId]/client.tsx`

Remove `communication_tone` from the Contact fields array (around L718–720):

```tsx
// Remove this entry:
{ label: "Communication Tone", value: customer.communication_tone || "—" },
```

It will now appear in the Settings section (Step 1).

### Step 5 — Minor: Edit modal — add Settings fields

**File:** `src/app/(hub)/customers/[customerId]/client.tsx`

The `EditForm` type (L120) and the edit modal currently only edit `contact_name`, `contact_email`, `communication_tone`. Extend to include:
- `automation_toggle: boolean`
- `llm_excluded: boolean`

Render these as checkboxes or toggle switches in the existing edit dialog. `daily_token_budget` can be a number input (allow empty = unlimited).

The existing save logic at `PATCH /api/customers/[customerId]` should already accept these fields — verify it passes them through to the Supabase update.

---

## File Changes

| File | Action |
|------|--------|
| `src/app/(hub)/customers/[customerId]/client.tsx` | Add Settings section, move tone, add dedicated_devs display, add tab switcher, extend edit modal |
| `src/app/(hub)/customers/[customerId]/page.tsx` | No change needed (data already fetched) |
| `src/app/api/customers/[customerId]/route.ts` | Verify PATCH handler passes `automation_toggle`, `llm_excluded`, `daily_token_budget` to Supabase |

---

## Code Context

### client.tsx — EditForm type and initial state (L120–140)
```tsx
const [form, setForm] = useState<EditForm>({
  // ...
  contact_name: customer.contact_name ?? "",
  contact_email: customer.contact_email ?? "",
  communication_tone: customer.communication_tone ?? "",
  // automation_toggle, llm_excluded to be added
});
```

### client.tsx — section CSS constants (L61–62)
```tsx
const sectionCls = "bg-white border border-slate-200 rounded-xl p-5 shadow-[0_1p...";
const sectionTitleCls = "text-[10px] font-bold text-slate-400 tracking-[0.06em] ...";
```

### customers DB row — all relevant columns
```ts
{
  automation_toggle: boolean;    // controls plan auto-trigger
  llm_excluded: boolean;         // excludes from AI pipeline
  communication_tone: string;    // formal | casual | technical
  daily_token_budget: number | null;  // null = unlimited
  automation_paused: boolean;    // circuit breaker state
}
```

### customer_products DB row — dedicated_developers
```ts
// In Database["public"]["Tables"]["customer_products"]["Row"]
dedicated_developers: string[] | null;  // UUID array
```

---

## Notes for Implementation Agent

- Haiku recommended: purely UI restructuring of an existing component. No new DB queries, no schema changes, no new routes.
- `client.tsx` is 1050 lines — be surgical. Only touch the sections described above.
- The `sectionCls` and `sectionTitleCls` constants (L61–62) define the visual style — use them for the new Settings section to stay consistent.
- The existing classifications fetch (L80, `useState<ClassificationRow[]>([])`) stays unchanged — just conditionally render it based on `activeTab`.
- `automation_paused` is read-only (set by the circuit breaker, not by PMs) — display as a warning indicator, do not put it in the edit modal.
- Do not add a stakeholders/assets section — those require schema changes and are out of scope for this task.
- Verify `PATCH /api/customers/[customerId]/route.ts` accepts `automation_toggle` and `llm_excluded` before adding them to the edit modal.
