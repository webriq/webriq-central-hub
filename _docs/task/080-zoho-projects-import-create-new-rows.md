# Task 080 — Zoho Projects Import: Create New Hub Rows from projects.json

> **Status:** TESTING
> **Completed:** 2026-06-25
> **Implementation Notes:** `customers.name` column doesn't exist — column is `company_name`. Fixed in `buildCustomerNameMap`. Matching logic: Zoho project name is matched case-insensitively against `customers.company_name`. Unmatched rows go to `errors` array. TypeScript clean.
>
> **Type:** feature
> **Priority:** HIGH
> **Version Impact:** patch
> **Recommended Model:** sonnet
> **Investigation:** /understand ran before this spec. Findings embedded below.

---

## Goal

Extend `POST /api/admin/zoho-import/projects` to **create** new `projects` rows for Zoho projects that don't yet have a matching Hub row (currently skipped). The route already handles `updated` (existing row found by `zoho_project_id`). This task adds `imported` (no existing row → create one).

Key decisions:
- **`project_type`**: infer from Zoho tags + layout name; default `"Content Site"` with flag in `source_meta`
- **`customer_id`**: case-insensitive name match against `customers` table; skip row if no match (FK constraint prevents sentinel values)
- **`description`**: store raw HTML as-is
- **`dedicated_developers`**: leave as `{}`
- **Delivery**: admin API endpoint (already exists), no new UI needed

---

## File Changes

| File | Action |
|------|--------|
| `src/app/api/admin/zoho-import/projects/route.ts` | modify — extend to create new rows |
| `src/lib/migrate/zoho-import.ts` | modify — add `buildCustomerNameMap()` + `inferProjectType()` helpers |

---

## Code Context

### Existing route (full file — 89 lines):
`src/app/api/admin/zoho-import/projects/route.ts`

Key behavior gap (line 54): `if (!existing) { result.skipped++; continue; }` — this is where new-row creation goes.

### DB ProjectRow type (`src/types/database.ts:535–558`):
```ts
Row: {
  id: string;                              // uuid, generated
  customer_id: string;                     // NOT NULL — FK to customers(customer_id)
  name: string;                            // NOT NULL
  project_type: string;                    // NOT NULL — CHECK in ('Content Site','Ecommerce (B2C)','Ecommerce (B2C)','Custom App')
  status: "active"|"on_hold"|"completed"|"archived";  // NOT NULL, default 'active'
  customer_product_id: string | null;
  description: string | null;             // raw HTML from Zoho is fine here
  created_by: string | null;              // ALWAYS null for imported rows (Zoho users ≠ Hub users)
  zoho_project_id: string | null;
  dedicated_developers: string[];          // default {}
  start_date: string | null;
  end_date: string | null;
  percent_complete: number;               // default 0
  existing_website: string | null;
  development_site: string | null;
  source_meta: Json;                       // default {}
  created_at: string;
  updated_at: string;
}
```

### Migrate lib (`src/lib/migrate/zoho-import.ts`):
Already contains `readFromZoho()`, `adminClient`, `ImportResult`, `resolveProjectId()`, `buildUserCache()`.
The `readFromZoho("projects.json")` call correctly handles `{"projects":[...]}` shape — returns the array.

### source_meta design intent (`supabase/migrations/035_zoho_decommission_schema.sql:61–64`):
```sql
-- source_meta: Zoho-specific operational data kept for reference during transition.
-- Contents: {status_name, status_id, is_closed, owner_zpuid, owner_email,
--            project_group, tags, modified_at, completed_at, synced_at}
-- Safe to drop this column after migration is fully verified.
```

### Zoho JSON shape (from `_from_zoho/projects.json`):
```json
{
  "id": "1512955000019693111",
  "name": "All About Smiles (Seva Dental)",
  "project_type": "active",              // ← IGNORE: Zoho lifecycle flag, not Hub project_type
  "description": "<div><b>Existing Website:</b>...</div>",
  "owner": { "zpuid": "...", "email": "nina.baraquil@webriq.services", "full_name": "Niña Anjerrie Baraquil" },
  "start_date": "2026-06-25",
  "end_date": null,
  "percent_complete": 0,
  "is_completed": false,
  "completed_time": null,
  "existing_website": "https://allaboutsmilesmiddletown.com/",
  "development_site": null,
  "status": { "id": "...", "name": "Open", "color": "#4fd3e5", "is_closed_type": false },
  "layout": { "id": "...", "name": "2024 April - StackShift Template", "is_default": false },
  "project_group": { "name": "Ungrouped Projects" },
  "tags": [{ "id": "...", "name": "StackShift", "color_class": "..." }],
  "modified_time": "2026-06-24T16:40:52.752Z",
  "created_time": "2026-06-24T16:40:52.752Z"
}
```

---

## Implementation Steps

### Step 1 — Add `buildCustomerNameMap()` to `src/lib/migrate/zoho-import.ts`

Add a function that queries all customers and returns a `Map<normalizedName, customerId>`:

```ts
export async function buildCustomerNameMap(): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  const { data } = await adminClient.from("customers").select("customer_id, name");
  for (const c of data ?? []) {
    map.set(c.name.toLowerCase().trim(), c.customer_id);
  }
  return map;
}
```

### Step 2 — Add `inferProjectType()` to `src/lib/migrate/zoho-import.ts`

Infer Hub `project_type` from Zoho tags and layout name. Returns the type string and how it was resolved:

```ts
type ZohoTag = { name?: string };
type ProjectTypeInference = {
  value: "Content Site" | "Ecommerce (B2C)" | "Ecommerce (B2B)" | "Custom App";
  source: "tag" | "layout" | "default";
};

export function inferProjectType(
  tags: ZohoTag[],
  layoutName: string | undefined
): ProjectTypeInference {
  const tagNames = tags.map((t) => (t.name ?? "").toLowerCase());
  const layout = (layoutName ?? "").toLowerCase();

  if (tagNames.includes("stackshift") || layout.includes("stackshift"))
    return { value: "Content Site", source: tagNames.includes("stackshift") ? "tag" : "layout" };
  if (tagNames.includes("ecommerce b2b") || layout.includes("b2b"))
    return { value: "Ecommerce (B2B)", source: "tag" };
  if (tagNames.includes("ecommerce") || layout.includes("ecommerce"))
    return { value: "Ecommerce (B2C)", source: "tag" };
  if (tagNames.includes("custom app") || layout.includes("custom app"))
    return { value: "Custom App", source: "layout" };

  return { value: "Content Site", source: "default" };
}
```

### Step 3 — Add `mapProjectStatus()` to `src/lib/migrate/zoho-import.ts`

```ts
export function mapProjectStatus(
  statusName: string | undefined,
  isClosedType: boolean | undefined,
  isCompleted: boolean | undefined
): "active" | "on_hold" | "completed" | "archived" {
  if (isCompleted) return "completed";
  if (isClosedType) return "archived";
  const s = (statusName ?? "").toLowerCase();
  if (s.includes("hold")) return "on_hold";
  return "active";
}
```

### Step 4 — Extend `src/app/api/admin/zoho-import/projects/route.ts`

At the top of the `POST` handler, before the loop, build the customer name map:

```ts
const customerMap = await buildCustomerNameMap();
```

Replace the skip branch (currently line 54) with new-row creation logic:

```ts
if (!existing) {
  // Resolve customer_id by matching Zoho project name to Hub customer name
  const zohoName = String(p.name ?? "").trim();
  const customerId = customerMap.get(zohoName.toLowerCase());
  if (!customerId) {
    result.errors.push(`no customer match for project "${zohoName}" (zoho_id: ${zohoId})`);
    result.skipped++;
    continue;
  }

  const typeInference = inferProjectType(
    (p.tags as ZohoTag[] | undefined) ?? [],
    (p.layout as { name?: string } | undefined)?.name
  );

  const newStatus = mapProjectStatus(
    p.status?.name,
    p.status?.is_closed_type,
    Boolean(p.is_completed)
  );

  const { error: insertError } = await adminClient.from("projects").insert({
    customer_id: customerId,
    name: zohoName,
    project_type: typeInference.value,
    status: newStatus,
    description: (p.description as string | undefined) ?? null,
    created_by: null,    // Zoho users are not Hub users — always null on import
    zoho_project_id: zohoId,
    dedicated_developers: [],
    start_date: (p.start_date as string | undefined) ?? null,
    end_date: (p.end_date as string | undefined) ?? null,
    percent_complete: Number(p.percent_complete ?? 0),
    existing_website: (p.existing_website as string | undefined) ?? null,
    development_site: (p.development_site as string | undefined) ?? null,
    source_meta: {
      status_name: p.status?.name ?? null,
      status_id: p.status?.id ? String(p.status.id) : null,
      is_closed: p.status?.is_closed_type ?? false,
      owner_zpuid: p.owner?.zpuid ? String(p.owner.zpuid) : null,
      owner_email: p.owner?.email ?? null,
      project_group: p.project_group?.name ?? null,
      tags: (p.tags ?? []) as import("@/types/database").Json[],
      modified_at: p.modified_time ?? null,
      completed_at: p.completed_time ?? null,
      synced_at: now,
      project_type_inferred: true,
      project_type_source: typeInference.source,
      customer_name_zoho: zohoName,
    },
  });

  if (insertError) {
    result.errors.push(`create project "${zohoName}" (${zohoId}): ${insertError.message}`);
  } else {
    result.imported++;
  }
  continue;
}
```

Also import the new helpers at the top of the route file:
```ts
import { readFromZoho, adminClient, ImportResult, buildCustomerNameMap, inferProjectType, mapProjectStatus } from "@/lib/migrate/zoho-import";
```

And add the `ZohoTag` and `is_completed` / `is_rollup_project` fields to `ZohoProjectRaw`:
```ts
type ZohoProjectRaw = {
  // ... existing fields ...
  is_completed?: boolean;
  name?: string;
  description?: string;
  layout?: { name?: string; id?: string };
  tags?: Array<{ name?: string }>;
};
```

### Step 5 — TypeScript check

Run `npx tsc --noEmit` and resolve any type errors before considering done.

---

## Notes for Implementation Agent

- **`project_type` name collision (critical)**: Zoho's `project_type` field (e.g., `"active"`, `"inactive"`) is a lifecycle flag, NOT the Hub's `project_type` enum. Never map `zoho.project_type → projects.project_type`. The DB column value must come from `inferProjectType()`.

- **`created_by` must always be `null`**: The DB column is `uuid references auth.users(id)`. Zoho's `created_by` is a Zoho user object with no Hub UUID. Setting it to `null` is correct; do not attempt resolution.

- **FK constraint on `customer_id`**: `projects.customer_id` has a FK to `customers(customer_id)`. A sentinel value like `"WRQ-UNMATCHED"` would fail unless that row exists in `customers`. The correct behavior is to skip unmatched rows and report them in `result.errors`.

- **Customer name matching is exact (case-insensitive)**: The Zoho project name is used directly as the lookup key. No fuzzy matching — exact normalized match only. Unmatched rows go to errors; the PM resolves them manually.

- **Existing-row update path unchanged**: The `updated` path (existing row found by `zoho_project_id`) should not change. Both paths run in the same loop; `imported` is for new rows, `updated` is for existing rows, `skipped` is for rows with no Zoho ID or unresolvable issues other than customer mismatch.

- **`source_meta.project_type_inferred: true`** on all imported rows — helps the PM identify which projects need manual `project_type` review. The `project_type_source` field (`"tag" | "layout" | "default"`) tells them how confident the inference was.

- **Model rationale**: sonnet — customer name matching with FK resolution, project_type inference across 225 rows, new DB row creation alongside existing update path; non-obvious collision risks between Zoho and Hub field semantics.

---

## Acceptance Criteria

- [ ] `POST /api/admin/zoho-import/projects` returns `{ imported: N, updated: M, skipped: K, errors: [] }` where `imported > 0` for Zoho projects with no existing Hub row
- [ ] Rows with no customer name match appear in `errors`, not `imported`
- [ ] New rows have `zoho_project_id` set (enables dedup on re-run — same row found as `existing` next time)
- [ ] `project_type` is always one of the 4 valid enum values (never Zoho's lifecycle string)
- [ ] `created_by` is `null` on all imported rows
- [ ] `source_meta.project_type_inferred: true` on all new rows
- [ ] `npx tsc --noEmit` passes
