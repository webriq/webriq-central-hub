# 347: StackShift Order Form — Hub Intake Endpoint + Submission Review Queue

**Created:** 2026-09-03
**Priority:** HIGH
**Type:** feature
**Recommended Tier:** deep
**Status:** Planned

---

## Overview

WebriQ's public **StackShift Order Form** (source: `~/Downloads/StackShift_Order_Form (1).html`) currently only prints itself to PDF. It needs to live on `webriq.com` and post its answers into the Hub.

This task builds the **Hub side**:

1. A **secret-authenticated intake endpoint** that receives a form submission (server-to-server from a `webriq.com` proxy route), stores the raw answers + uploaded documents, and emails a notification to a fixed recipient list + all PMs.
2. A **submission review queue** under the hub (`/stackshift-orders`, Admin / Super Admin / PM only) where a human reviews each submission and **decides** whether to:
   - create a **new customer + draft project**, or
   - **link to an existing customer** and create a draft project, or
   - **dismiss** it (spam / duplicate / handled elsewhere).

Per the user's direction (2026-09-03), the endpoint does **not** auto-create customers or projects. It records + notifies; project creation is a deliberate human action from the review UI. The Hub still computes an **advisory** "looks like existing customer X" hint for the reviewer.

### Why

- New StackShift clients (and occasional re-onboards of existing clients) currently arrive as ad-hoc PDFs / emails with no system of record.
- The Hub is the operational layer above Zoho/Sanity/GitHub/Supabase — order intake belongs here, feeding the existing customer → `customer_products` → draft `projects` pipeline.
- A review step keeps a human in the loop for the money-and-scope decision while still capturing every submission and its documents.

## Requirements

- [ ] `POST /api/webhooks/stackshift-order` — secret-gated (`x-stackshift-webhook-secret` == `STACKSHIFT_ORDER_WEBHOOK_SECRET`, timing-safe). Accepts JSON. Validates with zod. Inserts one `stackshift_orders` row (`status = 'pending_review'`), stores full raw payload + uploaded file paths. Returns `{ ok: true, orderId }`. No CORS headers (server-to-server only); `OPTIONS`/`GET` → 405.
- [ ] `POST /api/webhooks/stackshift-order/uploads` — secret-gated. Accepts JSON `{ files: [{ field, filename, contentType, size }] }`. Validates type/size/count, returns **signed upload URLs** into the `project-assets` bucket under `stackshift-orders/incoming/{uuid}/`. Sidesteps Vercel's ~4.5 MB Route Handler body cap (see CLAUDE.md "Route handlers accepting large request bodies").
- [ ] Main endpoint **verifies** each referenced storage object (64 KB ranged read, reuse `verifyUploadedObject` pattern) before accepting the row.
- [ ] New `stackshift_orders` table (migration `130_stackshift_orders.sql`, **written; applied by the user via `supabase db push`**) + full `Database` type in `src/types/database.ts` (with `Relationships[]`).
- [ ] Notification email on **every** submission → `STACKSHIFT_ORDER_NOTIFY_EMAILS` (comma-separated env: Philippe, Danielle, Brandon, Alex, Bert — addresses TBD, "more on this later") **plus** every PM's email (resolved via `adminClient.auth.admin.listUsers()` ∩ `profiles.role = 'pm'`). Uses the existing nodemailer transport (`src/lib/email/mailer.ts`, `MAIL_*` env). Email failure logs but does not fail the request.
- [ ] Review list page `src/app/(hub)/stackshift-orders/page.tsx` — server component, gated to `admin | super_admin | pm` (redirect others), columns: submitted date, company, contact, selected services, status, linked customer/project. searchParams-driven search + status filter, mirroring `/customers`.
- [ ] Review detail page `src/app/(hub)/stackshift-orders/[orderId]/page.tsx` — all four form sections rendered read-only, signed download links for the proposal + optional FlowForge spec, the advisory customer-match hint, and the action panel.
- [ ] `POST /api/stackshift-orders/[orderId]/convert` — authenticated (`admin | super_admin | pm`). Body: `{ mode: 'new_customer' | 'existing_customer', existingCustomerId?, classifications: Classification[], projectName?, projectType? }`. Creates customer (if new) + primary contact + `customer_products` row + **draft** `projects` row (no programme auto-start), links them back onto the order (`status = 'converted'`, `customer_id`, `project_id`, `converted_by`, `converted_at`). Idempotent: a re-POST on an already-converted order returns the existing linkage.
- [ ] `PATCH /api/stackshift-orders/[orderId]` — authenticated. Status transitions: `dismiss` (→ `dismissed` + reason), `reopen` (→ `pending_review`). Optional `review_notes`.
- [ ] `GET /api/stackshift-orders/[orderId]/file?which=proposal|spec` — authenticated, returns a short-lived signed URL for the stored object.
- [ ] Sidebar nav: add **"Orders"** (or "StackShift Orders") to `src/app/(hub)/_components/v2-hub-sidebar.tsx` `workItems`, gated `isAdmin || role === 'pm'`; add `V2_ROUTES.STACKSHIFT_ORDERS = "/stackshift-orders"` in `src/config/constants.ts`.
- [ ] `env.example` — document `STACKSHIFT_ORDER_WEBHOOK_SECRET` and `STACKSHIFT_ORDER_NOTIFY_EMAILS`.
- [ ] `webriq.com` proxy contract documented in this doc's appendix (that repo is maintained separately — no code here).
- [ ] All new files respect `nextjs-file-length-best-practices.md`: route handlers stay thin (~50–150 lines), business logic in `src/lib/stackshift-orders/*`, each lib file one concern (~50–150 lines), page components split client/server with page-scoped `_components`.

## Out of Scope / Must-Not-Change

- **No changes to `webriq.com`** — this repo only exposes the endpoint + documents the proxy contract.
- **No auto-creation of customers/projects from the webhook.** Only the authenticated `/convert` action creates records.
- **No programme auto-start.** Convert creates a *draft* project exactly like the New Project intake's `mode: "save"` path. Starting the 120-day clock stays a separate PM action (`seedAndStartProgramme` is **not** called here).
- Do not modify the existing Zoho webhook (`src/app/api/webhooks/route.ts`), `POST /api/customers`, `POST /api/onboarding/projects`, or the onboarding form engine.
- Do not add a `sonner` toast dependency or `react-hook-form` — follow the codebase's controlled-`useState` + inline-fetch form pattern (see CLAUDE.md "UI Polish Conventions → Rejected").
- Do not introduce `dark:` Tailwind classes into `(hub)` files — use the `isDark`-prop pattern already in v2.
- Billing fields (billing name/email) are stored on `stackshift_orders` only — the `customers` table has no billing columns and none are added here.
- `_hub_(OLD)/` and `src/components/hub/hub-sidebar.tsx` are the retired shell — do not wire nav there.

## Proposed File Changes

| File | Action | Purpose |
|------|--------|---------|
| `supabase/migrations/130_stackshift_orders.sql` | Create | `stackshift_orders` table + indexes + RLS (staff read: `admin/super_admin/pm/marketing`; writes via `adminClient` only, mirroring `accounts`/migration 125). |
| `src/types/database.ts` | Modify | Add `stackshift_orders` `Row/Insert/Update/Relationships`. |
| `src/config/constants.ts` | Modify | `V2_ROUTES.STACKSHIFT_ORDERS`. |
| `src/lib/stackshift-orders/schema.ts` | Create | zod schema for the intake payload + the `/uploads` manifest + the `/convert` body. |
| `src/lib/stackshift-orders/service-map.ts` | Create | Form `services` checkbox value → `Classification[]`; helpers to derive product/project-type/suffix (wrap `src/config/customer-phases.ts`). |
| `src/lib/stackshift-orders/match-customer.ts` | Create | Advisory existing-customer match (company name `ilike`, contact email, email/website domain). Read-only, returns `{ customerId, companyName, matchMethod } | null`. |
| `src/lib/stackshift-orders/recipients.ts` | Create | `getOrderNotificationRecipients()` — env list ∪ PM emails (`auth.admin.listUsers()` paginated ∩ `profiles.role='pm'`), deduped/lowercased. |
| `src/lib/stackshift-orders/create-from-order.ts` | Create | The `/convert` core: create/resolve customer, upsert primary contact, insert `customer_products`, insert draft `projects` (name-collision suffixing), link back onto the order. Pure function taking an authed Supabase client + acting user id. |
| `src/lib/stackshift-orders/uploads.ts` | Create | Signed-upload-URL minting + object verification for the `stackshift-orders/incoming/` prefix of `project-assets` (thin wrappers over `src/lib/uploads/attachment-storage.ts` helpers / `createSignedUploadUrl`). |
| `src/lib/email/mailer.ts` | Modify | Export the shared `transporter` + `FROM` (currently module-private) so the notification builder can reuse them. |
| `src/lib/email/stackshift-order-notification.ts` | Create | Build + send the submission notification email (HTML summary table + download note). |
| `src/app/api/webhooks/stackshift-order/route.ts` | Create | Intake endpoint (secret, zod, verify objects, insert row, fire email). |
| `src/app/api/webhooks/stackshift-order/uploads/route.ts` | Create | Signed-upload-URL endpoint (secret, manifest validation). |
| `src/app/api/stackshift-orders/[orderId]/route.ts` | Create | `PATCH` — dismiss/reopen/notes (authed staff). |
| `src/app/api/stackshift-orders/[orderId]/convert/route.ts` | Create | `POST` — convert to customer/project (authed staff). |
| `src/app/api/stackshift-orders/[orderId]/file/route.ts` | Create | `GET` — signed download URL (authed staff). |
| `src/app/(hub)/stackshift-orders/page.tsx` | Create | Review list (server component, role gate, searchParams). |
| `src/app/(hub)/stackshift-orders/_components/orders-table.tsx` | Create | Client table + search/filter controls. |
| `src/app/(hub)/stackshift-orders/[orderId]/page.tsx` | Create | Review detail (server component — fetch order, run match hint, sign download URLs). |
| `src/app/(hub)/stackshift-orders/[orderId]/_components/order-review.tsx` | Create | Client action panel (convert / dismiss / link-existing customer search). |
| `src/app/(hub)/stackshift-orders/loading.tsx` | Create | Skeleton, matching `customers/loading.tsx`. |
| `src/app/(hub)/_components/v2-hub-sidebar.tsx` | Modify | Add the "Orders" nav item (admin/super_admin/pm). |
| `src/app/(hub)/customers/[customerId]/*` | Modify (small) | Optional: a "StackShift Orders" strip on the customer profile listing orders linked to that `customer_id`. Keep minimal; can be a follow-up if it balloons. |
| `env.example` | Modify | New env vars. |
| `CLAUDE.md` | Modify | One bullet documenting the `stackshift_orders` table + intake/review flow, mirroring the `accounts`/`kb_articles` bullets. |

## Code Context

### Form fields (from `StackShift_Order_Form (1).html`)

Section 1 — Customer information: `name`, `company`, `website` (url), `business_email`, `billing_name` (opt), `billing_email` (opt), `mobile_phone`, `order_datetime` (datetime-local), `company_address` (textarea).
Section 2 — StackShift selection: `services` (checkbox, 1+ of `StackShift Access`, `StackShift I`, `StackShift II`, `PipelineForge`, `FlowForge`); `flowforge_specification` (file, optional, shown when FlowForge checked).
Section 3 — Proposal: `proposal_document` (file, **required**, pdf/doc/docx).
Section 4 — Approval: `approved_by`, `approval_date` (date), `terms_accepted` (checkbox, required true).

### `src/config/customer-phases.ts` — classification helpers (reuse, do not reimplement)

```ts
export const CLASSIFICATIONS = [
  "StackShift I", "StackShift II", "StackShift Access", "StackShift Access Plus",
  "PipelineForge", /* ... "Discrete Development" ... */
] as const;
export type Classification = (typeof CLASSIFICATIONS)[number];
export const STACKSHIFT_VARIANTS: Classification[] =
  ["StackShift I", "StackShift II", "StackShift Access", "StackShift Access Plus"];
export function isValidClassificationCombo(selected: Classification[]): boolean; // ≤1 stackshift variant
export function deriveProductNamesMulti(selected: Classification[]): ("StackShift" | "PipelineForge")[];
export function deriveProjectTypeMulti(selected: Classification[]): "Content Site" | "Custom App";
export function deriveProjectSuffixMulti(selected: Classification[]): "Website" | "App";
```

**Service → classification map** (`service-map.ts`):
`"StackShift Access" → "StackShift Access"`, `"StackShift I" → "StackShift I"`, `"StackShift II" → "StackShift II"`, `"PipelineForge" → "PipelineForge"`, `"FlowForge" → "Discrete Development"` *(assumption — see Open Questions)*.
If the mapped set fails `isValidClassificationCombo` (e.g. both StackShift I and II ticked), the reviewer resolves it manually in the UI — the map result is only a pre-fill.

### New Project intake — the pattern `/convert` mirrors (`src/app/api/onboarding/projects/route.ts`)

```ts
// resolve-or-create customer:
customerId = await generateCustomerId();            // WRQ-CUST-XXXXXXXX
await supabase.from("customers").insert({ customer_id, company_name, status: "onboarding" });
await upsertPrimaryContact(adminClient, customerId, { name, email, phone });   // src/lib/customers/primary-contact.ts

// one customer_products row (single value per DB check constraint):
const productNames = deriveProductNamesMulti(classifications);
const primaryClassification = classifications.find(c => STACKSHIFT_VARIANTS.includes(c)) ?? classifications[0];
await supabase.from("customer_products").insert({
  customer_id, product_name: productNames[0], classification: primaryClassification,
  classifications, status: "active", onboarding_complete: false, onboarding_data: {},
}).select("id").single();

// hidden/draft project (NO seedAndStartProgramme):
await adminClient.from("projects").insert({
  customer_id, name: projectName, project_type: deriveProjectTypeMulti(classifications),
  customer_product_id: product.id, created_by: user.id,
  // onboarding_visible_at stays null; project_id (human code) auto-generated by DB trigger
});
```
Project-name uniqueness: the intake route rejects a duplicate `projects.name` with 409. Here, if `projects.name ilike` already exists, append ` (2)`, ` (3)`, … (cap ~5, then fall back to appending the customer-id suffix). Default `projectName` = `` `${companyName} ${deriveProjectSuffixMulti(classifications)}` `` (e.g. "Acme Corp Website").

### Files — signed upload path (reuse task 339 infra)

`src/lib/uploads/attachment-storage.ts` already does exactly this for `project-assets`:
```ts
const BUCKET = "project-assets";
export async function createAttachmentUploadUrl(supabase, storagePath): Promise<{ path; token; signedUrl }>;
export async function verifyUploadedObject(supabase, storagePath, filename): Promise<VerifyFileResult>; // 64KB ranged read + verifyFile(); removes object on failure
```
`uploads.ts` reuses these with `storagePath = ` `` `stackshift-orders/incoming/${crypto.randomUUID()}/${safeName}` ``. Allowed types: proposal → `pdf | doc | docx`; FlowForge spec → also `txt | md | xls | xlsx | csv`. Size cap 25 MB (well under the bucket's 50 MB `file_size_limit`). Uploads land in the `incoming/` prefix and stay there — the stored path is recorded on the order; `/convert` optionally also inserts `attachments` rows (`entity_type: 'project'`, `entity_id: project.id`).

### Email transport (`src/lib/email/mailer.ts`)

```ts
const transporter = nodemailer.createTransport({ host: process.env.MAIL_HOST, port: Number(process.env.MAIL_PORT ?? 587), secure: false, auth: { user: process.env.MAIL_USER, pass: process.env.MAIL_PASS } });
const FROM = process.env.MAIL_FROM ? `WebriQ Central Hub <${process.env.MAIL_FROM}>` : "WebriQ Central Hub <noreply@webriq.com>";
```
Add `export { transporter, FROM };` (or a small `getTransport()` accessor). `profiles` has **no** email column — PM emails come from `auth.users` via `adminClient.auth.admin.listUsers({ page, perPage: 1000 })`, intersected with `profiles` rows where `role = 'pm'`.

### Webhook auth pattern (`src/app/api/webhooks/route.ts`)

```ts
import { timingSafeEqual } from "crypto";
const secret = process.env.STACKSHIFT_ORDER_WEBHOOK_SECRET;
if (!secret) { console.error("[stackshift-order] secret not configured"); return NextResponse.json({ error: "not configured" }, { status: 503 }); }
const provided = req.headers.get("x-stackshift-webhook-secret") ?? "";
const ok = provided.length === secret.length && timingSafeEqual(Buffer.from(provided), Buffer.from(secret));
if (!ok) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
```
(Unlike the Zoho webhook, return real 4xx/5xx — the `webriq.com` proxy is ours and should surface failures, not silently retry.)

### `stackshift_orders` table (proposed columns)

`id uuid pk` · `created_at timestamptz` · `status text` (`pending_review | converted | dismissed`) · `submitted_at timestamptz` (form `order_datetime`) ·
`contact_name` · `company_name` · `website` · `business_email` · `billing_name` · `billing_email` · `mobile_phone` · `company_address` ·
`services text[]` (raw) · `mapped_classifications text[]` ·
`proposal_path text` · `proposal_filename text` · `flowforge_spec_path text` · `flowforge_spec_filename text` ·
`approved_by text` · `approval_date date` · `terms_accepted boolean` ·
`raw_payload jsonb` · `dedupe_key text` (optional idempotency key from the proxy, unique when present) ·
`notification_sent_at timestamptz` ·
`customer_id text` (fk `customers.customer_id`, null until converted) · `project_id uuid` (fk `projects.id`, null until converted) · `is_new_customer boolean` ·
`review_notes text` · `dismiss_reason text` · `converted_by uuid` (fk `auth.users`) · `converted_at timestamptz`.
Indexes: `status`, `created_at desc`, `customer_id`, unique partial on `dedupe_key`.

### Role gate for hub pages

`src/app/(hub)/layout.tsx` already guards auth (`getClaims()` → redirect `/auth/login`). Page-level role check pattern (from `customers/page.tsx`):
```ts
const { data: claims } = await supabase.auth.getClaims();
const { data: profile } = await supabase.from("profiles").select("role").eq("id", claims.claims.sub).maybeSingle();
if (!profile || !["admin","super_admin","pm"].includes(profile.role)) redirect("/dashboard");
```

## Implementation Steps

**Phase 1 — data + intake**
1. Write `supabase/migrations/130_stackshift_orders.sql` (table, indexes, RLS mirroring migration 125). Add the type to `src/types/database.ts`.
2. `src/lib/stackshift-orders/schema.ts` — zod for intake payload, uploads manifest, convert body.
3. `src/lib/stackshift-orders/service-map.ts` + `uploads.ts`.
4. `src/app/api/webhooks/stackshift-order/uploads/route.ts` — secret + manifest → signed URLs.
5. `src/app/api/webhooks/stackshift-order/route.ts` — secret + zod + `verifyUploadedObject` per file + insert row (`pending_review`) + fire notification (awaited, best-effort) + return `{ ok, orderId }`.

**Phase 2 — notification**
6. Export `transporter`/`FROM` from `mailer.ts`.
7. `src/lib/stackshift-orders/recipients.ts` + `src/lib/email/stackshift-order-notification.ts`. Wire into the intake route; stamp `notification_sent_at`.

**Phase 3 — review queue UI**
8. `V2_ROUTES.STACKSHIFT_ORDERS` + sidebar item.
9. List page + `_components/orders-table.tsx` + `loading.tsx` (role gate, searchParams search/status filter).
10. `src/lib/stackshift-orders/match-customer.ts`.
11. Detail page (render sections, sign download URLs, compute match hint) + `_components/order-review.tsx`.
12. `GET .../[orderId]/file` signed-URL route.

**Phase 4 — convert + lifecycle**
13. `src/lib/stackshift-orders/create-from-order.ts`.
14. `POST .../[orderId]/convert` + `PATCH .../[orderId]` routes.
15. Wire the action panel: "Create new customer + project", "Link existing customer" (customer search via existing `GET /api/customers?search=`), "Dismiss". On success, redirect to the created customer/project.
16. (Optional) customer-profile "StackShift Orders" strip.

**Phase 5 — docs**
17. `env.example` + `CLAUDE.md` bullet + this doc's proxy-contract appendix finalized.

## Acceptance Criteria

- [ ] `POST /api/webhooks/stackshift-order` with a correct secret + valid payload + valid uploaded object paths → 201/200 `{ ok, orderId }`, a `stackshift_orders` row exists with `status='pending_review'` and the full `raw_payload`.
- [ ] Wrong/missing secret → 401 / 503; no row written.
- [ ] Invalid payload (missing required field, `terms_accepted !== true`, empty `services`, unverifiable file path) → 400, no row written.
- [ ] A proposal file > 4.5 MB completes end-to-end (via the signed-URL path) without a `FUNCTION_PAYLOAD_TOO_LARGE`.
- [ ] Every submission sends one email to the env recipients + all current PM addresses; a mail failure logs `[stackshift-order]` and still returns success with `notification_sent_at = null`.
- [ ] `/stackshift-orders` is reachable by admin/super_admin/pm and redirects developer/hr/client/marketing.
- [ ] Detail page shows all four sections, working signed download links, and an advisory "Possible existing customer: X (matched on <method>)" or "No existing customer match".
- [ ] "Create new customer + project" → new `customers` (`WRQ-CUST-…`, status `onboarding`), primary contact in `contacts`, one `customer_products` row, one **draft** `projects` row (`onboarding_visible_at` null, no `programme_started_at`), order flips to `converted` with `customer_id`/`project_id`/`converted_by` set.
- [ ] "Link existing customer" → no new customer; `customer_products` + draft project created under the chosen `customer_id`.
- [ ] Re-running convert on a `converted` order is a no-op that returns the existing linkage.
- [ ] "Dismiss" → `status='dismissed'` + reason; "Reopen" restores `pending_review`.
- [ ] `npx tsc --noEmit` clean; `pnpm lint` clean (no new warnings).
- [ ] No new file exceeds ~300 lines; route handlers ≤ ~150; lib files single-concern.

## Verification

```bash
npx tsc --noEmit
pnpm lint
pnpm build   # --webpack flag is baked into the script

# Local intake smoke test (dev server on :3000, secret set in .env.local):
curl -s -X POST http://localhost:3000/api/webhooks/stackshift-order/uploads \
  -H "x-stackshift-webhook-secret: $STACKSHIFT_ORDER_WEBHOOK_SECRET" \
  -H 'content-type: application/json' \
  -d '{"files":[{"field":"proposal","filename":"proposal.pdf","contentType":"application/pdf","size":1200000}]}'
# → PUT the bytes to the returned signedUrl, then:
curl -s -X POST http://localhost:3000/api/webhooks/stackshift-order \
  -H "x-stackshift-webhook-secret: $STACKSHIFT_ORDER_WEBHOOK_SECRET" \
  -H 'content-type: application/json' \
  -d '{ ...full payload with proposalPath from step 1... }'
```

Browser acceptance: submit via a local copy of the form pointed at a local `webriq.com`-style proxy (or `curl`), then walk the review queue → convert (new + existing) → dismiss/reopen, and confirm the customer/project rows + the notification email (Mailtrap/console transport locally).

`supabase db push` for migration 130 is run **by the user**.

## Compatibility Touchpoints

- **New env vars** (`STACKSHIFT_ORDER_WEBHOOK_SECRET`, `STACKSHIFT_ORDER_NOTIFY_EMAILS`) — must be set in every deployed environment for intake + notifications to work. Absent secret → endpoint 503s (fail-closed).
- **Migration 130** must be applied before the endpoint can write.
- **`project-assets` bucket** is reused (no new bucket). RLS unaffected — uploads go through `adminClient` signed URLs.
- **`webriq.com`** needs a new server-side proxy route + the shared secret in its own env (separate repo — see appendix).
- `src/lib/email/mailer.ts` gains two exports; existing callers unaffected.
- No MCP tool changes (`_docs/mcp-tools.md` untouched).

---

## Open Questions / Assumptions

1. **`FlowForge` → `Discrete Development`** classification mapping — assumed from the form's own description ("Purpose-built application and workflow delivery") matching `deriveProjectTypeMulti`'s "Custom App". Confirm the exact Hub classification name for FlowForge.
2. **Recipient addresses** — the user said "more on this later". Implemented as a comma-separated env list; the five named people (Philippe, Danielle, Brandon, Alex, Bert) + all PMs. Confirm addresses before deploy.
3. **`StackShift Access` / `PipelineForge`-only submissions** (no StackShift I/II) — the reviewer can still convert them to a draft project (Access → Content Site). If some services should *not* produce a project at all, say which.
4. **Existing-client re-onboard** — assumed: link to the existing `customer_id`, keep the customer record, add a new `customer_products` row + new draft project. Primary contact is upserted (may replace the current primary). Confirm whether the primary contact should be touched.
5. **Customer-profile "Orders" strip** — included as optional; drop to a follow-up if it materially grows the task.

---

## Appendix — `webriq.com` proxy contract (separate repo)

The public form must **not** call the Hub directly (would expose the secret + need CORS). `webriq.com` hosts a server-side route (e.g. `POST /api/stackshift-order`) that:

1. Parses the submitted `multipart/form-data`.
2. `POST {HUB_URL}/api/webhooks/stackshift-order/uploads` with header `x-stackshift-webhook-secret: <shared secret>` and JSON body `{ files: [{ field: "proposal", filename, contentType, size }, { field: "flowforge_spec", ... }] }`. Receives `{ uploads: [{ field, path, signedUrl }] }`.
3. `PUT` each file's raw bytes to its `signedUrl` (`content-type` matching, no auth header).
4. `POST {HUB_URL}/api/webhooks/stackshift-order` with the same secret header and JSON:
   ```jsonc
   {
     "idempotencyKey": "<uuid, optional>",
     "contact": { "name": "...", "email": "...", "phone": "...", "billingName": "...", "billingEmail": "..." },
     "company": { "name": "...", "website": "https://...", "address": "..." },
     "orderDateTime": "2026-09-03T14:30",
     "services": ["StackShift I", "PipelineForge"],
     "proposalPath": "stackshift-orders/incoming/<uuid>/proposal.pdf",
     "proposalFilename": "proposal.pdf",
     "flowforgeSpecPath": null,
     "flowforgeSpecFilename": null,
     "approval": { "approvedBy": "...", "approvalDate": "2026-09-03", "termsAccepted": true }
   }
   ```
5. Returns `{ ok, orderId }` to the browser; the form then shows its success state (and may still offer the print-to-PDF).

Secret lives in the `webriq.com` deployment env only. Recommended: add a honeypot field + basic rate-limit on the `webriq.com` route since it is the public edge.

---

## Implementation Notes

### What Changed

- **DB:** new `stackshift_orders` table — `supabase/migrations/130_stackshift_orders.sql` (**written, NOT applied** — user runs `supabase db push`). RLS: staff `SELECT` only (`get_my_role() in admin/super_admin/pm/marketing`), all writes via service-role `adminClient`. `Database` type added to `src/types/database.ts` (Row/Insert/Update + FK Relationships to `customers` and `projects`).
- **Intake endpoints** (`src/app/api/webhooks/stackshift-order/`):
  - `_secret.ts` — shared `assertOrderWebhookSecret()` (timing-safe `x-stackshift-webhook-secret` check; 503 if env unset, 401 on mismatch).
  - `uploads/route.ts` — `POST` exchanges a validated file manifest for signed `project-assets` upload URLs under `stackshift-orders/incoming/<uuid>/`.
  - `route.ts` — `POST` verifies referenced storage objects (`verifyUploadedObject` 64 KB ranged read), inserts one `stackshift_orders` row (`status='pending_review'`, full `raw_payload`, mapped classifications), then best-effort fires the notification email and stamps `notification_sent_at`. Idempotent on `idempotencyKey` → `dedupe_key`. `GET` → 405.
- **Review endpoints** (`src/app/api/stackshift-orders/`):
  - `_auth.ts` — `requireOrderReviewer()` (admin/super_admin/pm via session client + `adminClient` profile read).
  - `[orderId]/route.ts` — `PATCH` dismiss/reopen (+ optional `review_notes`); blocks status change on `converted`.
  - `[orderId]/convert/route.ts` — `POST` → `createFromOrder()`; idempotent on already-`converted`; 409 if `dismissed`.
  - `[orderId]/file/route.ts` — `GET ?which=proposal|spec&download=1` signed URL.
- **Lib** (`src/lib/stackshift-orders/`): `schema.ts` (zod: intake / uploads manifest / convert / patch), `service-map.ts` (form service → `Classification`, `FlowForge`→`Discrete Development`; `deriveProjectShape`), `uploads.ts` (manifest validation + signed-URL minting + prefix-scoped verify, wraps task 339 helpers), `match-customer.ts` (advisory: company-name → contact-email → email/website-domain, skips free mailbox domains), `recipients.ts` (env list ∪ PM emails via `auth.admin.listUsers` ∩ `profiles.role='pm'`), `create-from-order.ts` (customer resolve/create + `upsertPrimaryContact` + `customer_products` + **draft** `projects` with name-collision suffixing + link-back; no `seedAndStartProgramme`).
- **Email:** `src/lib/email/mailer.ts` now `export { transporter, FROM }`; `src/lib/email/stackshift-order-notification.ts` builds + sends the plain-text + HTML summary email with a deep link to the review page.
- **UI** (`src/app/(hub)/stackshift-orders/`): `page.tsx` (server, role gate, searchParams search + status tabs with per-status counts), `_components/orders-table.tsx` (client list), `[orderId]/page.tsx` (server — loads order, runs advisory match, resolves linked customer/project names), `[orderId]/_components/order-review.tsx` (client — read-only sections, signed downloads, classification multiselect, new/existing customer picker with `/api/customers?search=` lookup, convert / dismiss / reopen), `loading.tsx` skeleton.
- **Nav / config:** `V2_ROUTES.STACKSHIFT_ORDERS = "/stackshift-orders"`; sidebar "Orders" item (`ClipboardList`, admin/super_admin/pm) in `v2-hub-sidebar.tsx`.
- **Docs:** `env.example` (`STACKSHIFT_ORDER_WEBHOOK_SECRET`, `STACKSHIFT_ORDER_NOTIFY_EMAILS`); `CLAUDE.md` bullet.

### Files Changed

- `supabase/migrations/130_stackshift_orders.sql` — new (written, not applied)
- `src/types/database.ts` — `stackshift_orders` type
- `src/config/constants.ts` — route constant
- `src/lib/email/mailer.ts` — export `transporter` + `FROM`
- `src/lib/email/stackshift-order-notification.ts` — new
- `src/lib/stackshift-orders/{schema,service-map,uploads,match-customer,recipients,create-from-order}.ts` — new
- `src/app/api/webhooks/stackshift-order/{_secret.ts,route.ts,uploads/route.ts}` — new
- `src/app/api/stackshift-orders/{_auth.ts,[orderId]/route.ts,[orderId]/convert/route.ts,[orderId]/file/route.ts}` — new
- `src/app/(hub)/stackshift-orders/{page.tsx,loading.tsx,_components/orders-table.tsx,[orderId]/page.tsx,[orderId]/_components/order-review.tsx}` — new
- `src/app/(hub)/_components/v2-hub-sidebar.tsx` — nav item + icon import
- `env.example`, `CLAUDE.md` — docs

### Deviations From Plan

- **Notification recipients:** plan said `auth.admin.listUsers()` ∩ `profiles.role='pm'`; implemented exactly that, paginated (perPage 1000, up to 20 pages). Fixed-list addresses still TBD (env var placeholder) per the user's "more on this later".
- **Customer-profile "StackShift Orders" strip** (marked optional in the plan) — **not implemented**; deferred to a follow-up to keep the task bounded. The order links back to the customer/project it creates, and the review detail page links forward, so the linkage is navigable both ways without it.
- Added `src/app/api/stackshift-orders/_auth.ts` and `.../webhooks/stackshift-order/_secret.ts` (not enumerated in the plan) — small shared guards to avoid duplicating auth across 3 + 2 route files.
- `mailer.ts` export added as planned (one line) rather than extracting a separate `transport.ts` — lower risk to the auth-email path, no duplication.

### Design-hook (impeccable) findings

The design hook flagged `text-[13px]/[12px]/[11px]/[10.5px]/[9.5px]` arbitrary font sizes and `#0B1533/#5F6A88/#E2E7F2/...` literal colors in the new UI files, plus Arial / inline hex / 12px-radius in the email template. These are **deliberate consistency with the shipped hub convention** — the new list/detail UI copies the exact type-scale and color tokens from `src/app/(hub)/customers/_customers-index.tsx` / `loading.tsx`, and CLAUDE.md's "UI Polish Conventions" explicitly says to match the hand-rolled hub pattern and not re-tokenize it. The HTML email intentionally uses web-safe Arial + inline literal styles (email clients strip `<style>`/CSS vars), matching the existing `sendHubInviteEmail` in `mailer.ts`. The hook also reports its `.impeccable/design.json` sidecar is stale vs. DESIGN.md. Pre-existing findings in `v2-hub-sidebar.tsx` / `mailer.ts` (lines untouched by this task) were not addressed. No inline-ignore comments added.

### Verification Run

- `npx tsc --noEmit` — PASS (clean)
- `pnpm lint` — PASS (0 errors; 2 pre-existing unrelated warnings in `onboarding-workspace/_checklist-tab.tsx`)
- `pnpm build` — SKIPPED (not run this session; tsc + lint clean, no dynamic-import or webpack-specific code added)
- Browser acceptance — NOT RUN. Blocked on: migration 130 applied (`supabase db push`), `STACKSHIFT_ORDER_WEBHOOK_SECRET` + `MAIL_*` set locally, and a `curl`/proxy to exercise the intake. End-to-end walkthrough (submit → review queue → convert new + existing → dismiss/reopen → notification email) deferred to the test stage.
- Live intake / signed-upload round-trip — NOT RUN (needs the secret + a running dev server; `curl` recipe in the Verification section above).

---

## Quality Gate Notes

### Result

PASS

### Standards Review

- **File length** — `order-review.tsx` came in at 403 lines on first pass (over the guide's ~250 soft cap). Split during the gate into `order-review.tsx` (167, orchestrator), `_convert-panel.tsx` (215, self-contained convert form), `_order-ui.tsx` (69, shared presentational + `ERROR_BOX_CLASS`). All new files now ≤ 215 lines; route handlers ≤ 128; lib files single-concern ≤ 147.
- **PostgREST `ilike` wildcard injection** — `match-customer.ts` interpolated the submitted company name / email / website domain straight into `ilike` filters, where `%`/`_` are wildcards. Advisory-only + RLS-scoped so low severity, but fixed: added `likeEscape()` applied to all three lookups.
- **Duplicate `customer_products` on re-onboard** — `createFromOrder` did a blind `insert` into `customer_products`; the products API confirms there's no DB unique constraint on `(customer_id, product_name)`, so converting an order for an existing customer who already had that product would duplicate the row. Fixed: existing-customer path now reuses the existing row, new-customer path always inserts.
- No `any`, no dead code, no debug logging on production paths, no secrets logged. Secret compare is length-checked + `timingSafeEqual`; missing secret fails closed (503).
- Design-hook `design-system-font-size` / `design-system-color` findings across the new UI files are deliberate consistency with the shipped hub table convention (`_customers-index.tsx` type scale + color literals) per CLAUDE.md "UI Polish Conventions"; the hook's own `.impeccable/design.json` sidecar is reported stale. Left unchanged, no inline-ignore comments added. Email template uses web-safe Arial + inline styles by necessity (matches existing `sendHubInviteEmail`).

### Deviations

- **Medium — `createFromOrder` is not transactional.** Mirrors the existing New Project intake (`/api/onboarding/projects`), which is also non-transactional. If the `projects` insert fails after a fresh customer/`customer_products` insert for a *new* customer, an orphan customer + product row is left and the order stays `pending_review`; a retry mints a new `WRQ-CUST-…`. Narrow failure window, PM-recoverable, consistent with the codebase. Accepted; flagged for the user.
- **Minor — customer-profile "StackShift Orders" strip not implemented.** Marked optional in the plan; linkage is navigable both directions without it (order → created customer/project, and review detail → forward links).
- **Minor — added `src/app/api/stackshift-orders/_auth.ts` and `.../webhooks/stackshift-order/_secret.ts`** (not enumerated in the plan) — shared guards, avoid duplicating auth across 5 route files.
- **Minor — `mailer.ts` gains `export { transporter, FROM }`** rather than extracting a separate transport module. One line, lower risk to the auth-email path, no duplication.
- **Minor — `order-review.tsx` split into 3 files** during the gate (see Standards Review).

### Required Fixes

- None (all gate findings fixed in place; `npx tsc --noEmit` + `pnpm lint` re-run clean).
