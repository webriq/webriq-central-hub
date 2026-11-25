# 504: Rename "Discrete Development" → "FlowForge" (v2 projects), Order Form link + copy password on Orders, PM access to Orders

**Created:** 2026-11-24
**Priority:** MEDIUM
**Type:** enhancement (+ migrations)
**Recommended Tier:** deep (stored-data rename with a CHECK-constraint swap and a written-not-applied fallback, an RLS change, and a secret served to the browser)
**Status:** Planned

---

## Overview

Three changes:

- **A. FlowForge rename.** "Discrete Development" is now marketed as **FlowForge**, which is what the StackShift Order Form already calls it. Rename it everywhere in the v2 projects surface: the classification value, labels, titles, project-type selections, the route slug `/projects/discrete-development` → `/projects/flowforge`, and the data stored in `customer_products` and `stackshift_orders`. Legacy projects are excluded.
- **B. Order Form link.** The Orders page header gets a link to the public StackShift Order Form (`https://www.webriq.com/stackshift-order-form`) and a **Copy password** button with a tooltip. The password lives in a server-only Vercel env var. The button fetches it from a guarded API route on click, so it never appears in page HTML or the client bundle.
- **C. PM access to Orders.** PMs get full Orders access again. This reverses task 375: list, detail, convert, dismiss/reopen, link project, resend and archive. Delete stays super_admin only (task 498).

### Decisions (user, 2026-11-24)
- **D1 — degrade gracefully.**
  - Migration 192 swaps the CHECK constraint and renames stored values.
  - Until 192 is applied, reads map the legacy value to FlowForge, and the listing filter matches both values.
  - A write that hits the old constraint (`23514` on `customer_products_classification_check`) retries with the legacy scalar value.
  - Code is therefore safe to deploy before or after 192.
- **D2 — fetch the password on click.** A guarded `GET` route returns it with `Cache-Control: no-store`. No page prop and no `NEXT_PUBLIC_` variable.
- **D3 — visibility.** Everyone who can open Orders sees the link and can copy the password: admin, super_admin, the Finance department (read-only), and now PMs.
- **D4 — PMs get full Orders access.** Delete stays super_admin only.

## Requirements

### A. FlowForge rename (v2 projects)
- [ ] `CLASSIFICATIONS` in `src/config/customer-phases.ts`: replace `"Discrete Development"` with `"FlowForge"` in the same position (last), so tab order is unchanged. All `=== "Discrete Development"` / `.includes("Discrete Development")` checks switch to `"FlowForge"`. `deriveProjectSuffix`/`deriveProjectType` keep returning `"App"` / `"Custom App"`.
- [ ] Add `LEGACY_CLASSIFICATION_ALIASES = { "Discrete Development": "FlowForge" }` and `normalizeClassification(raw: string | null): string | null` / `normalizeClassifications(raw: string[] | null): string[]` (dedupes) in `customer-phases.ts`. Apply them at every DB read site listed in Code Context.
- [ ] Listing filter (`_v2-listing/_load-list-data.ts`): when the tab is FlowForge, the `.or(...)` also matches `"Discrete Development"` in both columns.
- [ ] Route slug `discrete-development` → `flowforge` (`ClassificationTabId`, `TAB_ID_BY_CLASSIFICATION`). `tabIdForClassification()` accepts the legacy value through the alias. `parseClassificationTab()` maps a stale `?tab=discrete-development` to `flowforge`.
- [ ] `next.config.ts`: permanent redirects `/projects/discrete-development` → `/projects/flowforge` and `/projects/discrete-development/:path*` → `/projects/flowforge/:path*`. These cover bookmarks, notification deep links and task/ticket URLs.
- [ ] New Project intake (`projects/new`): card icon, description, `PRIMARY_TYPES`, and helper copy say FlowForge. The description stays "Custom app — scoped, one-off development work." unless the user changes it at review.
- [ ] CSV import (`api/onboarding/projects/import`): `Type` accepts "FlowForge" and also the legacy "Discrete Development" (aliased to FlowForge), so older spreadsheets still import.
- [ ] Order → classification map (`lib/stackshift-orders/service-map.ts`): `"FlowForge": "FlowForge"`, with the comment updated.
- [ ] Write paths retry once on the old constraint (D1). Shared helper `withClassificationFallback()`: on Postgres `23514` whose message names `customer_products_classification_check`, re-run the write with the scalar `classification` mapped back to `"Discrete Development"`. The `classifications` array has no CHECK, so FlowForge is stored there either way. Sites:
  - `api/onboarding/projects/route.ts` (intake insert)
  - `api/onboarding/projects/import/route.ts` (import insert)
  - `api/v2/projects/[projectId]/classification/route.ts` (PATCH update)
  - `lib/stackshift-orders/create-from-order.ts` (order convert)
- [ ] Comments in v2 code that name "Discrete Development" read FlowForge. These are in `_generic-phase-view.tsx`, `_load-detail-data.ts`, `programme/start`, `generic-phase`, `generic-deliverables`, `scheduled-autostart` and `phase-builder.tsx`.
- [ ] **Migration 192** (`supabase/migrations/192_flowforge_classification.sql`, written, not applied):
  - Drop `customer_products_classification_check`.
  - Rename the scalar value, and `array_replace` the `classifications` array.
  - When `to_regclass('public.stackshift_orders')` is not null, `array_replace` `stackshift_orders.mapped_classifications`.
  - Re-add the check with `'FlowForge'` in place of `'Discrete Development'`.
  - Idempotent. Include a verbatim rollback in a header comment.

### B. Order Form link + copy password
- [ ] New server-only env var `STACKSHIFT_ORDER_FORM_PASSWORD`, added to `env.example` under the StackShift Order block with a comment. The user sets the value in Vercel. Never write `.env` files.
- [ ] New `GET /api/stackshift-orders/form-password` guarded by `requireOrderReviewer()`, so every Orders viewer can use it (Finance and PMs included).
  - Returns `{ password }` with `Cache-Control: no-store`.
  - Env unset or blank → `503 { error: "Order form password is not configured" }`.
  - Never log the value.
- [ ] Orders list header (`orders-table.tsx`): under or beside the `<h1>` and subtitle, an **"Order form"** link with a lucide `ExternalLink` icon, `target="_blank" rel="noopener noreferrer"`, and visible hover and focus states. Next to it, an icon-only **Copy password** button in the existing `CopyLinkButton` pattern (`projects/_shared/_copy-link-button.tsx`):
  - Wrapped in `Tooltip`/`TooltipTrigger`/`TooltipContent` (`@/components/ui/tooltip`).
  - Tooltip reads "Copy password", then "Copied!" for 1.5 s.
  - `aria-label` follows the same states.
  - Shows a spinner or disabled state while fetching (loading state on every async action).
  - On 503 or a network error: `toast.error("Couldn't copy the order form password")`, with the 503 message when present. No checkmark.
- [ ] Shown to every Orders viewer (D3), including read-only Finance.
- [ ] Order form URL kept in a single constant (e.g. `ORDER_FORM_URL` in the component file, or `src/config/constants.ts` if one already holds external URLs).

### C. PM access to Orders (reverses task 375)
- [ ] `requireOrderReviewer()` `REVIEWER_ROLES` → `["admin", "super_admin", "pm"]`. `requireOrderMutator()` is unchanged, so Finance is still refused.
- [ ] Page guards in `orders/page.tsx` and `orders/[orderId]/page.tsx` allow `pm`.
- [ ] Sidebar `Orders` entry (`v2-hub-sidebar.tsx`) visible to `isAdmin || role === "pm"`, with the comment updated.
- [ ] Delete stays super_admin only (`[orderId]/route.ts:84`, plus the row menu's `isSuperAdmin`). No change there.
- [ ] **Migration 193** (`supabase/migrations/193_stackshift_orders_pm_read.sql`, written, not applied): recreate `stackshift_orders_staff_read` with `get_my_role() in ('admin','super_admin','pm','marketing')`. Use a `to_regclass` guard so it is a no-op when 130 isn't applied, plus a verbatim rollback to migration 140's policy.
  - Without 193, a PM passes the page guard but RLS returns no rows. The page shows the empty state, nothing breaks.

## Out of Scope / Must-Not-Change

- **Legacy projects:**
  - `src/app/(hub)/projects/_legacy-listing/**` (including the "Original StackShift & Discrete Development" subtitle)
  - `src/app/(hub)/projects/legacy/**`, `src/app/(hub)/projects-old/**`, `src/app/_hub_(OLD)/**`
  - Legacy `projects.project_type` values ("Custom App")
- `deriveProjectSuffix`/`deriveProjectType` outputs ("App" / "Custom App") and existing project names.
- `stackshift_orders.services` / `raw_payload` (the form's own submitted values, which already say FlowForge) and the "FlowForge spec" document wording.
- Historical migrations (060, 107, 140), manual script 495, and old task docs are not edited.
- Delete permission (super_admin only) and Finance read-only behaviour.
- The `marketing` role in the stackshift_orders read policy stays as is.
- No `adminClient` for page reads, since the Orders pages read through the session client and RLS. No new recipient pickers. No git commands.
- Wiki `product` values (`src/types/wiki.ts`) are a separate axis and must not change.

## Proposed File Changes

| File | Action | Purpose |
|------|--------|---------|
| `src/config/customer-phases.ts` | Modify | `CLASSIFICATIONS` FlowForge; checks; `LEGACY_CLASSIFICATION_ALIASES`, `normalizeClassification(s)` |
| `src/lib/projects/classification-write.ts` | Create | `withClassificationFallback()` (23514 retry with the legacy scalar) |
| `src/app/(hub)/projects/_classification-tabs.ts` | Modify | slug `flowforge`; alias in `tabIdForClassification` + `parseClassificationTab` |
| `src/app/(hub)/projects/_v2-listing/_load-list-data.ts` | Modify | filter matches the legacy value; normalize row values |
| `src/app/(hub)/projects/[classification]/[projectId]/_project-shell.ts` | Modify | normalize before `tabIdForClassification` (covered by the alias; verify) |
| `src/app/(hub)/projects/[classification]/[projectId]/_load-detail-data.ts` | Modify | normalize the classification read; comment |
| `src/app/(hub)/projects/_shared/_get-project-detail-data.ts` | Modify | normalize the classification read |
| `src/app/(hub)/projects/[classification]/[projectId]/_generic-phase-view.tsx` | Modify | comment |
| `src/app/(hub)/projects/new/_content.tsx`, `_new-project-types.ts` | Modify | card icon/description keys, helper copy, `PRIMARY_TYPES` |
| `src/app/api/onboarding/projects/route.ts` | Modify | normalize reads (l.148); fallback on insert (l.446) |
| `src/app/api/onboarding/projects/status-report/route.ts` | Modify | normalize read (l.151) |
| `src/app/api/onboarding/projects/import/route.ts` | Modify | accept the legacy Type alias; fallback on insert |
| `src/app/api/v2/projects/[projectId]/classification/route.ts` | Modify | normalize existing values; fallback on update |
| `src/components/projects/update-classification-modal.tsx` | Verify | the options come from `CLASSIFICATIONS`; pre-checked values must be normalized by the caller |
| `src/lib/stackshift-orders/service-map.ts` | Modify | `FlowForge → FlowForge` |
| `src/lib/stackshift-orders/create-from-order.ts` | Modify | fallback on the customer_products write |
| `src/app/(hub)/orders/_components/orders-table.tsx` | Modify | display `mapped_classifications` normalized; header link + copy button |
| `src/app/(hub)/orders/[orderId]/page.tsx`, `_components/_convert-panel.tsx`, `order-review.tsx` | Modify | normalize `mapped_classifications` before pre-selecting or displaying; page guard allows pm |
| `src/app/(hub)/orders/_components/order-form-link.tsx` | Create | link + Copy password button (tooltip, loading, toast) |
| `src/app/api/stackshift-orders/form-password/route.ts` | Create | guarded GET, no-store |
| `src/app/api/stackshift-orders/_auth.ts` | Modify | add `pm` to `REVIEWER_ROLES`; comment |
| `src/app/(hub)/orders/page.tsx` | Modify | page guard allows pm |
| `src/app/(hub)/_components/v2-hub-sidebar.tsx` | Modify | Orders visible to pm |
| `src/app/api/projects/[projectId]/programme/{start,generic-phase,generic-deliverables}/route.ts`, `src/app/api/onboarding/scheduled-autostart/route.ts`, `src/components/programme/phase-builder.tsx` | Modify | comments only |
| `next.config.ts` | Modify | `/projects/discrete-development` redirects |
| `env.example` | Modify | `STACKSHIFT_ORDER_FORM_PASSWORD=` |
| `supabase/migrations/192_flowforge_classification.sql` | Create | constraint swap + data rename |
| `supabase/migrations/193_stackshift_orders_pm_read.sql` | Create | RLS read policy adds pm |
| `_docs/task/504-flowforge-classification.check.ts` | Create | pure checks: normalize helpers, tab alias, import parse, fallback trigger detection |

The implement stage must re-grep `Discrete Development|discrete-development|Discrete-Development` in `src` (excluding legacy paths) and handle any hit not listed here.

## Code Context

### `src/config/customer-phases.ts:376-449`
```ts
export const CLASSIFICATIONS = [
  "StackShift I", "StackShift II", "StackShift Access", "StackShift Access Plus",
  "PipelineForge",
  "Discrete Development",
] as const;
export function deriveProjectSuffix(c: Classification) { return c === "Discrete Development" ? "App" : "Website"; }
export function deriveProjectType(c: Classification) { return c === "Discrete Development" ? "Custom App" : "Content Site"; }
// :445 / :449 — the *Multi variants: selected.includes("Discrete Development") ? ...
```

### `src/app/(hub)/projects/_classification-tabs.ts`
```ts
export type ClassificationTabId = "stackshift-i" | … | "pipelineforge" | "discrete-development";
const TAB_ID_BY_CLASSIFICATION: Record<Classification, ClassificationTabId> = { …, "Discrete Development": "discrete-development" };
export function parseClassificationTab(raw) { return isClassificationTabId(raw) ? raw : DEFAULT_CLASSIFICATION_TAB; }
export function tabIdForClassification(value: string): ClassificationTabId | null {
  return Object.hasOwn(TAB_ID_BY_CLASSIFICATION, value) ? TAB_ID_BY_CLASSIFICATION[value as Classification] : null;
}
```
Slugs are URL segments, and the comment above notes that no slug may be "legacy", "v2" or "new". "flowforge" is safe.

### `src/app/(hub)/projects/_v2-listing/_load-list-data.ts:121-124` (listing filter)
```ts
.or(
  `classification.eq."${params.classification}",classifications.cs.{"${params.classification}"}`,
  { referencedTable: "customer_products" }
);
```
For FlowForge, append `,classification.eq."Discrete Development",classifications.cs.{"Discrete Development"}`. Build the extra terms from `LEGACY_CLASSIFICATION_ALIASES` rather than hard-coding them. Rows are normalized at `:237-244`.

### DB read sites to normalize
- `_project-shell.ts:24-31`: `[product.classification, ...product.classifications].flatMap(v => tabIdForClassification(v))`
- `_load-detail-data.ts:75` and `_shared/_get-project-detail-data.ts:63`: `.select("classification")`
- `api/onboarding/projects/route.ts:148` and `status-report/route.ts:151`: `customer_products(classification)`
- `api/v2/projects/[projectId]/classification/route.ts:57`: `existing = …classifications ?? []`. Normalize before merging, so that a legacy entry plus a new FlowForge entry don't produce both values.
- Orders: `mapped_classifications` (`orders/page.tsx:13` select, `orders-table.tsx:217` display, convert-panel pre-selection, `resend/route.ts:44` email)

### Write sites (fallback needed for the scalar column)
- `api/onboarding/projects/route.ts:446-447`: `classification: primaryClassification, classifications: body.classifications`
- `api/onboarding/projects/import/route.ts:164`
- `api/v2/projects/[projectId]/classification/route.ts:90`: `.update({ classification, classifications: nextClassifications })`
- `lib/stackshift-orders/create-from-order.ts:86`: `classification: shape.primaryClassification`
- The webhook's `mapped_classifications` write has no CHECK and needs no fallback.

### Constraint (migration 060:23-24)
```sql
alter table customer_products add column if not exists classification text
  check (classification in ('StackShift I', 'StackShift II', 'StackShift Access', 'StackShift Access Plus', 'PipelineForge', 'Discrete Development'));
```
This is an inline column check, so the auto-generated name is `customer_products_classification_check`. In migration 192, look the name up through `pg_constraint` and drop whatever check exists on `customer_products.classification`, in case it differs live. Order: drop → update → add. Per the task 494 lesson, renaming before dropping fails.

### `src/lib/stackshift-orders/service-map.ts:15-24`
```ts
// "FlowForge" -> "Discrete Development": the form describes FlowForge as …
  "FlowForge": "Discrete Development",
```

### Import parser (`api/onboarding/projects/import/route.ts:37-53`)
```ts
const match = CLASSIFICATIONS.find((c) => c.toLowerCase() === part.toLowerCase());
if (!match) return { classifications: null, error: `Unrecognized Type value: "${part}"` };
```
Run `normalizeClassification(part)` against an alias map that ignores case, before matching. Note that the splitter is `/[,/+&]/`, so "Discrete Development" survives as one part.

### Copy-with-tooltip pattern to follow (`src/app/(hub)/projects/_shared/_copy-link-button.tsx`)
```tsx
<Tooltip>
  <TooltipTrigger render={
    <button type="button" onClick={copy} aria-label={copied ? "Link copied" : "Copy link"} className={className}>
      {copied ? <Check size={size} /> : <Link2 size={size} />}
    </button>
  } />
  <TooltipContent side="top">{copied ? "Copied!" : "Copy link"}</TooltipContent>
</Tooltip>
```
This uses `navigator.clipboard.writeText` and resets after 1.5 s. Use `KeyRound` or `Copy` instead of `Link2`. Fetch first, then write to the clipboard. Safari requires the clipboard write to stay within the user gesture. If that fails, use the `ClipboardItem` with a promise form, or note it as a known limitation in Implementation Notes.

### Orders auth (`src/app/api/stackshift-orders/_auth.ts`)
```ts
const REVIEWER_ROLES = ["admin", "super_admin"];   // → add "pm"
// requireOrderMutator(): requireOrderReviewer() + refuse departmentName === "Finance"
```
Page guards: `orders/page.tsx:41` and `orders/[orderId]/page.tsx:31` both use `if (role !== "admin" && role !== "super_admin") redirect(V2_ROUTES.DASHBOARD);`.
Sidebar: `v2-hub-sidebar.tsx:91-95`: `...(isAdmin ? [{ label: "Orders", … href: V2_ROUTES.ORDERS }] : [])`.

### RLS (migration 140)
```sql
create policy "stackshift_orders_staff_read" on stackshift_orders for select to authenticated
  using (get_my_role() in ('admin', 'super_admin', 'marketing'));
```
Migration 193 restores `'pm'`. Use `get_my_role()`, never inline the role lookup (CLAUDE.md).

### Existing env block (`env.example:130-133`)
`STACKSHIFT_ORDER_WEBHOOK_SECRET=` … `STACKSHIFT_ORDER_NOTIFY_EMAILS=`. Add `STACKSHIFT_ORDER_FORM_PASSWORD=` here.

## Implementation Steps

1. **Constants and helpers.** Update `CLASSIFICATIONS` and the derive helpers, then add the aliases and `normalizeClassification(s)` in `customer-phases.ts`. Create `src/lib/projects/classification-write.ts` with `withClassificationFallback(run: (scalar: string) => PromiseLike<{ error }>, scalar)`. It runs once and, on a `23514` naming the classification check while `scalar === "FlowForge"`, re-runs with `"Discrete Development"`.
2. **Tabs and routing.** Change the slug to `flowforge`, add the alias in `tabIdForClassification` and `parseClassificationTab`, and add the `next.config.ts` redirect pair after the task 503 Orders pair.
3. **Reads.** Normalize at every read site listed above, and extend the listing filter.
4. **Writes.** Wrap the four write sites with the fallback, and make the import parser accept the legacy alias.
5. **Intake UI.** Update the `projects/new` card maps, `PRIMARY_TYPES` and copy. Then update the service map and the v2 comments.
6. **Migration 192.** Write it with a guarded, idempotent swap, the data rename and a rollback comment. Run the PGlite check: create the 060 table shape, insert legacy rows, apply 192 twice, assert values and the constraint, then roll back.
7. **Orders PM access.** Update `_auth.ts`, both page guards and the sidebar, and write migration 193 with a `to_regclass` guard and a rollback. Run the PGlite check on the policy text.
8. **Order form link.** Add the env var to `env.example`, create the `form-password` route, create `order-form-link.tsx`, and render it in the `orders-table.tsx` header.
9. **Check script.** Write `_docs/task/504-flowforge-classification.check.ts` for the normalize helpers, tab alias, import parse and fallback detection, then run `npx tsx`.
10. **Final sweep.** Grep for the old name, run `npx tsc --noEmit`, and run eslint on the changed files.

## Acceptance Criteria

### A
- [ ] The Projects tab strip shows **FlowForge** (last tab) at `/projects/flowforge`, listing every project classified as FlowForge or as the legacy Discrete Development, both before and after migration 192.
- [ ] `/projects/discrete-development` returns 308 to `/projects/flowforge`, and `/projects/discrete-development/<id>/tasks?x=1` returns 308 to `/projects/flowforge/<id>/tasks?x=1`.
- [ ] A project detail page for a legacy-valued project resolves its FlowForge tab and breadcrumb. The Update Classification modal shows FlowForge checked, never "Discrete Development".
- [ ] New Project intake shows a FlowForge card. Creating a FlowForge project succeeds before 192 (the fallback stores the legacy scalar and the FlowForge array) and after 192 (both store FlowForge). The project name suffix is still "App" and the type "Custom App".
- [ ] CSV import accepts `Type` = "FlowForge" and "Discrete Development", and both are stored as FlowForge (or as the legacy scalar via the fallback before 192).
- [ ] A new order with the FlowForge service maps to `["FlowForge"]`. Older orders that show "Discrete Development" in `mapped_classifications` display FlowForge in the list and pre-select FlowForge on convert.
- [ ] After 192: no `customer_products` or `stackshift_orders` row contains "Discrete Development", and inserting `classification = 'Discrete Development'` fails the check.
- [ ] Legacy listing, `projects/legacy`, `projects-old` and `_hub_(OLD)` are unchanged.
- [ ] `grep -rnE "Discrete Development|discrete-development|Discrete-Development" src` matches only legacy paths and the alias map or redirect definitions.

### B
- [ ] The Orders header shows an "Order form" link that opens `https://www.webriq.com/stackshift-order-form` in a new tab.
- [ ] The Copy password button shows the tooltip "Copy password". Clicking it copies the env value, switches to the check icon and "Copied!" for about 1.5 s, and shows a loading state while fetching.
- [ ] With the env var unset, clicking shows an error toast and copies nothing. The route returns 503.
- [ ] `GET /api/stackshift-orders/form-password` returns 401 when signed out and 403 for a role outside admin, super_admin and pm (e.g. developer). It returns 200 for admin, pm and Finance, with `Cache-Control: no-store`.
- [ ] The password does not appear in the Orders page HTML, the RSC payload or any client chunk. Check by grepping view-source and `.next/static` for the value.

### C
- [ ] A PM sees **Orders** in the sidebar, opens `/orders` and `/orders/<id>`, and can convert, dismiss or reopen, link a project, resend and archive. They cannot delete: the menu item is hidden and the API returns 403.
- [ ] A Finance user is still read-only.
- [ ] After 193, a PM's list shows orders. Before 193, it shows the empty state with no error.

## Verification

```bash
npx tsc --noEmit
pnpm exec eslint <changed files>
npx tsx _docs/task/504-flowforge-classification.check.ts
# PGlite checks for 192 (data + constraint, idempotent, rollback) and 193 (policy text, guarded no-op)
grep -rnE "Discrete Development|discrete-development|Discrete-Development" src
# dev server:
curl -sI http://localhost:3000/projects/discrete-development | grep -iE "^HTTP|^location"
curl -sI "http://localhost:3000/projects/discrete-development/<id>/tasks?x=1" | grep -iE "^HTTP|^location"
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000/api/stackshift-orders/form-password   # 401 signed out
```
Browser checks:
- **Admin:** Projects tabs; the FlowForge listing (pre-192, legacy rows visible); a project detail page; the classification modal; New Project intake card; Orders header link and copy (paste to confirm, check tooltip states); error toast with the env unset.
- **PM (if a test account exists):** sidebar entry, list, detail, convert dialog opens; delete is absent.

## Compatibility Touchpoints

- **Operator steps:**
  - Set `STACKSHIFT_ORDER_FORM_PASSWORD` in Vercel (Production and Preview) and in local `.env.local`.
  - Apply migration 192, then 193. Both are written, not applied, and 193 requires 130 (it is a no-op otherwise).
  - The code works before either migration (D1), except that PMs see an empty Orders list until 193 is applied.
- **Redirects:** `/projects/discrete-development…` should stay in place indefinitely, because notification emails and Cliq messages already carry those links.
- **Docs (document stage):**
  - `_docs/context/stackshift-orders.md`: the FlowForge → Discrete Development mapping, the PM access change, and the form link and password.
  - `_docs/context/projects.md`: the slug list, if it enumerates slugs.
  - CLAUDE.md is not affected.
- **MCP:** no MCP tool enumerates classifications, so `_docs/mcp-tools.md` doesn't change. Verify with a grep during implementation.
- **Task 430/423 work-breakdown refactor:** unaffected, since classification is a `customer_products` axis.
- **Security:** CLAUDE.md says "never store credentials in the Hub". This password is an env secret for a public marketing form, not a stored customer credential, and the user explicitly asked for it. It is served only to authenticated Orders viewers, with no-store caching and no logging.

## Implementation Notes

### What Changed
- **A. FlowForge rename.**
  - `CLASSIFICATIONS` now ends with `"FlowForge"`.
  - New helpers in `customer-phases.ts`: `LEGACY_CLASSIFICATION_ALIASES`, `legacyClassificationValues()`, `normalizeClassification(s)()` and `findClassification()` (case-insensitive, accepts the legacy name).
  - The tab slug is now `flowforge`. `parseClassificationTab("discrete-development")` and `tabIdForClassification("Discrete Development")` both resolve to it.
  - `next.config.ts` has permanent redirects for `/projects/discrete-development[/:path*]`.
  - The listing filter also matches the legacy value. Reads are normalized in the listing, detail loaders, onboarding list, status report, the classification PATCH (existing array plus the response), the Orders list display and the resend email.
  - New `withClassificationFallback()` (`src/lib/projects/classification-write.ts`) wraps the four `customer_products` writes: intake, CSV import, classification PATCH and order convert.
  - Both CSV import parsers (server route and client preview) accept the legacy name.
  - Order service map is now `FlowForge → FlowForge`. Intake cards, `PRIMARY_TYPES`, helper copy and v2 comments are updated.
  - Migration 192 is written, not applied.
- **B. Order form link.**
  - New `GET /api/stackshift-orders/form-password`, guarded by `requireOrderReviewer()`, with `Cache-Control: no-store`. Returns 503 when the env var is unset and never logs the value.
  - New `order-form-link.tsx` renders an "Order form" external link and a Copy password icon button with a tooltip ("Copy password", then "Copied!"), a spinner while fetching, and an error toast on failure. It sits in the Orders header, to the right of the title.
  - `STACKSHIFT_ORDER_FORM_PASSWORD=` added to `env.example`.
- **C. PM access.** `pm` added to `REVIEWER_ROLES`, both Orders page guards and the sidebar condition. Delete stays super_admin only (unchanged). Migration 193 is written, not applied.

### Files Changed
- `src/config/customer-phases.ts` - catalog, derive checks, alias and normalize helpers, `findClassification`
- `src/lib/projects/classification-write.ts` (new) - 23514 fallback helper
- `src/app/(hub)/projects/_classification-tabs.ts` - slug, legacy `?tab=` alias, normalized `tabIdForClassification`
- `src/app/(hub)/projects/_v2-listing/_load-list-data.ts` - legacy-aware filter, normalized rows
- `src/app/(hub)/projects/[classification]/[projectId]/_load-detail-data.ts`, `src/app/(hub)/projects/_shared/_get-project-detail-data.ts` - normalized reads (+ comment)
- `src/app/(hub)/projects/[classification]/[projectId]/_generic-phase-view.tsx` - comment
- `src/app/(hub)/projects/new/_content.tsx`, `_new-project-types.ts` - card icon/description keys, helper copy, `PRIMARY_TYPES`
- `src/app/(hub)/projects/import/_content.tsx` - client Type parser uses `findClassification`; comment
- `src/app/api/onboarding/projects/route.ts` - normalized list read; fallback on insert
- `src/app/api/onboarding/projects/status-report/route.ts` - normalized read
- `src/app/api/onboarding/projects/import/route.ts` - `findClassification`; fallback on insert
- `src/app/api/v2/projects/[projectId]/classification/route.ts` - normalized existing array and response; fallback on update
- `src/lib/stackshift-orders/service-map.ts` - FlowForge → FlowForge
- `src/lib/stackshift-orders/create-from-order.ts` - fallback on insert; comment
- `src/app/api/stackshift-orders/[orderId]/resend/route.ts` - normalized `mappedClassifications`
- `src/app/(hub)/orders/_components/orders-table.tsx` - normalized classification display; header renders `OrderFormLink`
- `src/app/(hub)/orders/_components/order-form-link.tsx` (new) - link and copy-password button
- `src/app/api/stackshift-orders/form-password/route.ts` (new) - guarded password route
- `src/app/api/stackshift-orders/_auth.ts` - `pm` reviewer
- `src/app/(hub)/orders/page.tsx`, `src/app/(hub)/orders/[orderId]/page.tsx` - page guards allow pm
- `src/app/(hub)/_components/v2-hub-sidebar.tsx` - Orders visible to pm
- `src/app/api/onboarding/scheduled-autostart/route.ts`, `src/app/api/projects/[projectId]/programme/{start,generic-phase,generic-deliverables}/route.ts`, `src/components/programme/phase-builder.tsx` - comments only
- `next.config.ts` - redirects
- `env.example` - `STACKSHIFT_ORDER_FORM_PASSWORD`
- `supabase/migrations/192_flowforge_classification.sql`, `supabase/migrations/193_stackshift_orders_pm_read.sql` (new)
- `_docs/task/504-flowforge-classification.check.ts`, `_docs/task/504-flowforge.sql-check.mjs` (new) - checks

### Deviations From Plan
- **Minor:** `src/app/(hub)/projects/import/_content.tsx` wasn't in the file table. It has its own client-side copy of the Type parser, which also needed the legacy alias, so the CSV preview recognises "Discrete Development".
- **Minor:** `findClassification()` was added to `customer-phases.ts` so both import parsers share one alias-aware lookup.
- **Minor:** migration 192 also collapses duplicate array entries. A row can hold both `"Discrete Development"` and `"FlowForge"` after a pre-192 fallback write, and renaming would otherwise leave FlowForge in the array twice. The PGlite check covers this case.
- **Minor:** the order detail page needed no change. It recomputes `_mappedClassifications` from `services` through the updated service map, so the convert panel pre-selects FlowForge on its own.
- **Minor:** Safari only allows a clipboard write inside the click itself, so the copy uses `ClipboardItem` with a promise (the write starts during the click and resolves when the fetch does). Where `ClipboardItem` is unavailable, it falls back to `writeText`.
- **Minor:** colors use existing Orders tokens (`#007BFF` link, `#F0F7FF` hover, `#E2E7F2` border) instead of new values.
- **Investigated, no change:**
  - `update-classification-modal.tsx`: its v2 caller passes listing rows, which are now normalized.
  - `pm-dashboard.tsx`: reads `/api/onboarding/projects`, which is now normalized.
  - The deleted-project view: uses `tabs.map(labelForTab)` through the aliased `tabIdForClassification`.
  - `_docs/mcp-tools.md`: no MCP tool enumerates classifications.

### Verification Run
- `npx tsc --noEmit` - PASS for `src` (0 errors outside generated `.next` types)
- `pnpm exec eslint` on all changed files - PASS (the check script is lint-ignored by pattern)
- `npx tsx _docs/task/504-flowforge-classification.check.ts` - PASS (catalog, normalize, import lookup, tab aliases, service map, fallback detection, and fallback retry behaviour)
- `node 504-flowforge.sql-check.mjs …192… …193…` (PGlite 0.2.17, scratchpad) - PASS:
  - Before 192, a `FlowForge` insert fails with 23514 and the error message names `customer_products_classification_check`, which is what the fallback looks for.
  - 192 renames both columns and the orders array, dedupes, swaps the CHECK, rejects the legacy value, is idempotent, and rolls back exactly.
  - 193 adds pm, keeps marketing, is idempotent, and rolls back to the 140 policy. Both migrations are no-ops or succeed when `stackshift_orders` is absent.
- `grep -rnE "Discrete Development|discrete-development|Discrete-Development" src` - PASS. The only hits are alias definitions and task-504 comments; legacy paths are untouched.
- Dev-server curl and browser checks - SKIPPED (test stage)
- Migrations 192/193 - NOT APPLIED (operator)

## Quality Gate Notes

### Result
PASS

### Standards Review
- **Scope:** all three requirement groups (A, B, C) are implemented. The changed-file list came from Implementation Notes; `git diff` was not run because CLAUDE.md forbids git commands. The legacy paths (`_legacy-listing`, `projects/legacy`, `projects-old`, `_hub_(OLD)`) are untouched, and the grep sweep confirms it.
- **Rename centralised:** the legacy name appears in exactly one data structure, `LEGACY_CLASSIFICATION_ALIASES`, plus the retired-slug map `LEGACY_TAB_IDS`. All read, write, filter and import paths go through `normalizeClassification(s)`, `legacyClassificationValues()`, `findClassification()` or `withClassificationFallback()`, with no inline string comparisons. Once 192 has been applied everywhere, removing the alias entries switches all of it off.
- **Fallback is narrow:** it retries only on 23514 whose message names `classification_check`, only once, and only when the value has a legacy alias. Unrelated errors pass through unchanged (covered by the check script). The PGlite run confirmed the real Postgres message matches.
- **Errors handled on purpose:**
  - The password route returns 503 with a message when the env var is unset.
  - The client shows that message in a toast. For the Safari `ClipboardItem` path it reports the fetch error ahead of the generic clipboard error.
  - No silent catches were added.
- **No secrets in code or logs:** the password comes only from `process.env`, isn't logged, and is sent with `Cache-Control: no-store`. `env.example` contains the key only.
- **Conventions:**
  - Tailwind with existing Orders color tokens and `cn()`; no `style={{}}`.
  - lucide icons, `aria-label` on the icon button, visible focus ring, loading state, `toast` for transient errors.
  - The component is page-scoped (`orders/_components/`).
  - `get_my_role()` is used in the RLS policy.
  - Migrations are guarded and idempotent, with a verbatim rollback.
  - No `adminClient` reads were added.
- **Tidy fix applied during the gate:** `_load-detail-data.ts` had two imports from `@/config/customer-phases` (the new value import and the existing `import type`). They are merged into one. `tsc` and eslint still pass.
- **Non-blocking observation:** `normalizeClassification` is applied at each read site rather than in one data-access layer. The project has no shared `customer_products` reader, so adding one would be a refactor outside this task's scope. The alias map keeps the logic itself in one place.

### Deviations
- **Minor:** the client-side CSV parser in `projects/import/_content.tsx` was outside the file table. It needed the same alias as the server parser, and leaving it out would have broken the import preview for legacy sheets.
- **Minor:** `findClassification()` was added as a shared helper for both import parsers.
- **Minor:** migration 192 also removes duplicate array entries, covering a row shape that can only exist because of the D1 fallback.
- **Minor:** Safari's user-gesture rule is handled with `ClipboardItem` and a promise. This is the approach the plan suggested.
- **Minor:** the merged import described above.
- **Medium (approved):** PM access to Orders reverses task 375. The user chose this explicitly (D4) during planning, so it is documented here and not treated as a scope change.

### Required Fixes
- None.
