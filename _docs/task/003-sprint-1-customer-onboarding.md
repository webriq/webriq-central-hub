# Task 003 — Sprint 1: Customer Creation & Onboarding (M1)

> **Type:** feature
> **Version Impact:** minor (new feature module)
> **Priority:** HIGH — first user-facing sprint after infrastructure
> **Status:** PLANNED
> **Depends On:** Task 001 (Sprint 0 — Infrastructure) ✅

---

## Summary

Implement the full Customer Creation & Onboarding module — the first user-facing feature of the WebriQ Central Hub. This sprint delivers the end-to-end flow where a PM creates a customer record, generates a unique login-free onboarding URL, and the customer fills out a dynamic product-specific form with progressive completion, file uploads, and resume-later capability. The PM dashboard surfaces onboarding progress per customer.

**Exit condition (AC1):** A PM can onboard a new customer end-to-end without opening Zoho.

---

## Requirements

### 1. Customer Creation API + `customer_id` Universal Key Logic

**Backend — Supabase + API Route**

- `POST /api/customers` — creates a new customer record
  - Accepts: `company_name` (required), `contact_name`, `contact_email`, `zoho_account_id` (optional)
  - Generates `customer_id` in format `WRQ-CLIENT-XXXX` where XXXX is a unique 4-character alphanumeric sequence
  - Returns: full customer object including `customer_id`, `id`, `created_at`
  - Validates: `company_name` is non-empty, `contact_email` is valid if provided
  - Error handling: 400 for validation errors, 409 if `customer_id` collision (retry), 500 for DB errors

- `GET /api/customers` — list all customers
  - Query params: `?status=active|inactive|onboarding`, `?search=term` (searches company_name)
  - Returns: array of customer objects, ordered by `created_at desc`
  - Pagination: `?limit=20&offset=0`

- `GET /api/customers/[customerId]` — get single customer by `customer_id`
  - Returns: customer object with nested `product_instances` array from `customer_products` table
  - 404 if not found

- `PATCH /api/customers/[customerId]` — update customer fields
  - Accepts partial updates to: `company_name`, `contact_name`, `contact_email`, `zoho_account_id`, `status`
  - Returns: updated customer object

- **`customer_id` generation logic** (shared utility in `src/lib/customers/generate-id.ts`):
  ```typescript
  // Generate WRQ-CLIENT-XXXX format
  // Use nanoid or crypto.randomUUID() → take first 4 alphanumeric chars → uppercase
  // Check uniqueness against customers table before returning
  // Retry up to 5 times on collision
  ```

- **Server-side validation** (shared in `src/lib/customers/validate.ts`):
  - `company_name`: required, 1–200 chars, trimmed
  - `contact_email`: optional, valid email format if provided
  - `status`: must be one of `active | inactive | onboarding`

### 2. `/onboard/{customer_id}` URL Routing

**Frontend — Next.js App Router**

- Dynamic route: `src/app/(hub)/onboarding/[customerId]/page.tsx`
- Route resolves `customerId` param → fetches customer data from Supabase
- If customer not found → show "Customer Not Found" state with link back to PM dashboard
- If customer found → render the appropriate product-specific onboarding form
- URL is publicly accessible (no auth required — login-free by design)
- Page metadata: dynamic title "Onboarding — {company_name}"

### 3. Login-Free Secure Revisitable URL Generation

**Security & Access Pattern**

- Each `/onboard/{customer_id}` URL is accessible without authentication
- Security through obscurity: `customer_id` is an unguessable 4-char code (WRQ-CLIENT-XXXX), making brute-force enumeration impractical at 36^4 = 1.68M combinations
- No session, no JWT, no cookie required for the onboarding form
- PM generates the URL from the Hub and shares it with the customer via email/chat
- URL is permanent — customer can revisit anytime to continue or review
- **Stretch (if time permits):** Add an optional `?token=` query parameter with a short-lived HMAC for additional security on sensitive deployments. Not required for MVP.

### 4. Dynamic Onboarding Form — Product Variants

**Frontend — Form Components**

The onboarding form is **product-specific** — different fields per product line. The product is determined from the `customer_products` record linked to the customer.

#### 4a. StackShift Variant
- Site type (multi-site, single site, landing page)
- Number of pages/sites expected
- Design preferences (existing brand guide upload, reference sites)
- Content migration needs (from existing CMS? which one?)
- Third-party integrations required (CRM, email marketing, analytics)
- SEO requirements (existing rankings to preserve, target keywords)
- Multilingual needs (languages, translation workflow)

#### 4b. PublishForge Variant
- Blog/post volume expectations (posts per week/month)
- Content types (blog posts, case studies, whitepapers, news)
- Author profiles (single author, multi-author, guest authors)
- Editorial workflow (draft → review → publish? who approves?)
- SEO requirements (keyword targets, existing content to migrate)
- Social media auto-publishing (channels, scheduling)
- Newsletter integration (email provider, subscriber list)

#### 4c. CiteForge Variant
- Citation style requirements (APA, MLA, Chicago, custom)
- Source types (academic papers, web pages, books, interviews)
- Bibliography output formats (HTML, PDF, Word, BibTeX)
- Integration with writing tools (Google Docs, Word, Overleaf)
- Collaboration needs (multi-user, review workflow)
- Plagiarism checking integration

#### 4d. PipelineForge Variant
- **Already designed in detail** — see `_design/forms/PipelineForge_Onboarding_Form.html`
- 8 sections: Client Details, ICP Profile, Sales Motion, Infrastructure, Pipeline, Compliance, Goals, Checklist
- This is the most complex variant and serves as the reference implementation
- Fields include: company info, ICP firmographics, buyer personas, scoring weights, value proposition, tone of voice, reply templates, email infrastructure (SmartLead, instantly), CRM integration, pipeline stages, compliance requirements (CAN-SPAM, GDPR), success metrics, DNS/domain setup, and a pre-launch checklist

### 5. Conditional Form Logic

**Shared Form Engine**

- Build a shared `OnboardingFormEngine` component in `src/components/onboarding/`
- Accepts a `productName` prop and a JSON schema defining the form sections
- Renders the correct sections and fields based on the product
- Conditional visibility: some fields shown/hidden based on previous answers
  - Example: "Multilingual?" → if "Yes", show language selection fields
  - Example: "Existing CMS?" → if "Yes", show migration detail fields
- Form state managed via React Context or useReducer for cross-section persistence

**Form Schema Definition** (stored in `src/config/onboarding-schemas.ts`):
```typescript
type FormSchema = {
  productName: string;
  sections: FormSection[];
};

type FormSection = {
  id: string;
  title: string;
  description?: string;
  fields: FormField[];
};

type FormField = {
  name: string;
  label: string;
  type: 'text' | 'email' | 'url' | 'select' | 'textarea' | 'checkbox-group' | 'radio-group' | 'file' | 'table';
  required?: boolean;
  placeholder?: string;
  options?: string[];          // for select/radio
  hint?: string;
  condition?: {                // show this field only when...
    field: string;             // another field
    value: string | boolean;   // equals this value
  };
  span?: 'full' | 'half';     // grid column span
};
```

### 6. Progressive Completion — Save Progress Mid-Form

**Persistence Layer**

- Auto-save form progress to `customer_products.onboarding_data` (jsonb column) on every field change (debounced, 2-second delay)
- Save indicator in header: "Draft auto-saved" with green dot (matches PipelineForge design)
- On page load, pre-populate all fields from `onboarding_data` if it exists
- Track completion percentage: `completedFields / totalRequiredFields * 100`
- Store completion percentage on the `customer_products` record for PM dashboard queries

**API Route:**
- `PATCH /api/customers/[customerId]/products/[productName]/onboarding` — saves partial form data
  - Body: `{ data: Record<string, any>, completedPercentage: number }`
  - Updates `customer_products.onboarding_data` and `onboarding_complete` (if 100%)

### 7. Resume Later + Shareable Customer Link

**Frontend — Share & Resume**

- "Copy Onboarding Link" button in PM dashboard — copies `/onboard/{customer_id}` to clipboard
- Customer can close browser and return to the same URL — form state is restored from Supabase
- No login, no email verification — the URL itself is the access key
- "Resume where you left off" — scroll to the first incomplete required field on load

### 8. File/Asset Upload Support

**Upload Infrastructure**

- `POST /api/upload` — accepts multipart form data
  - Supported types: `image/*`, `application/pdf`, `application/msword`, `application/vnd.openxmlformats-officedocument.wordprocessingml.document`, `application/vnd.ms-excel`, `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`
  - Max file size: 25MB
  - Stores file in Supabase Storage bucket `onboarding-assets/{customer_id}/{product_name}/`
  - Returns: `{ url: string, filename: string, size: number, mimeType: string }`

- **Supabase Storage bucket setup:**
  - Bucket: `onboarding-assets`
  - Public read access (files are accessed via unauthenticated onboarding URLs)
  - RLS policy: anyone can read, authenticated users can write
  - Folder structure: `{customer_id}/{product_name}/{timestamp}_{filename}`

- **Upload UI component** (`src/components/onboarding/file-upload.tsx`):
  - Drag-and-drop zone with click-to-browse fallback
  - File type validation with user-friendly error messages
  - Upload progress bar
  - Thumbnail preview for images
  - File icon + name for documents
  - Remove/delete uploaded file
  - Matches design system form styling (border, radius, colors)

### 9. PM Dashboard — Customer List View

**Frontend — PM Dashboard Page**

- `src/app/(hub)/pm/page.tsx` — replace stub with full implementation
- Customer table with columns:
  - **ID** — `WRQ-CLIENT-XXXX` (monospace, muted color)
  - **Company** — company name (bold, primary text color)
  - **Contact** — contact name + email
  - **Products** — badge pills for each product (StackShift, PublishForge, etc.)
  - **Status** — status badge (Onboarding / Active / Inactive)
  - **Progress** — progress bar (5px height, blue fill) + percentage
  - **Created** — relative date ("3d ago", "May 2")
- Sortable columns (click header to sort)
- Search/filter bar at top
- "New Customer" button (orange CTA, top-right) → opens creation modal or navigates to creation form
- Click row → navigates to customer profile page

### 10. PM Dashboard — Completion Percentage Per Customer

- Progress bar component in table rows
- Color coding:
  - 0–25%: gray fill
  - 26–75%: blue fill (`#3358F4`)
  - 76–99%: blue fill
  - 100%: green fill (`#22C55E`)
- Percentage text next to bar
- Data sourced from `customer_products.onboarding_complete` and computed percentage

### 11. PM Dashboard — Missing Fields Indicator

- On customer profile page, highlight sections with missing required fields
- Red dot/badge next to incomplete sections
- "X of Y fields complete" summary at top of each section
- "Jump to next incomplete" button that scrolls to the first missing required field

### 12. Customer Profile Page

**Frontend — Dynamic Route**

- `src/app/(hub)/customers/[customerId]/page.tsx`
- Sections:
  - **Header:** Company name, customer ID, status badge, action buttons (Edit, Copy Onboarding Link, View in Zoho)
  - **Contact Info:** Name, email, phone, website, industry
  - **Products:** Cards for each product instance with:
    - Product name + icon
    - Onboarding progress bar
    - Links: Sanity project, Zoho project, GitHub repo
    - Status badge
  - **Recent Activity:** Timeline of classification records, assessments, executions (stub for now — populated in Sprint 2+)
  - **Files/Assets:** Gallery of uploaded onboarding files

### 13. `product_instances[]` Mapping Per Customer

**Backend — Data Relationship**

- When creating a customer, PM selects which products to associate
- Each product association creates a row in `customer_products`
- `customer_products` fields populated:
  - `customer_id` — links to customer
  - `product_name` — one of the four product lines
  - `product_instance_id` — auto-generated or manually entered
  - `sanity_project_id`, `zoho_project_id`, `github_repo` — optional, can be filled later
  - `onboarding_complete` — starts `false`
  - `onboarding_data` — starts `{}`
- API: `POST /api/customers/[customerId]/products` — add a product to a customer
- API: `DELETE /api/customers/[customerId]/products/[productName]` — remove a product

### 14. Acceptance Check AC1 — PM Onboards End-to-End Without Zoho

**QA / Testing**

- Manual test script covering the full flow:
  1. PM creates a new customer from Hub (fills company name, contact, selects products)
  2. System generates `customer_id` and onboarding URL
  3. PM copies onboarding link and sends to customer (simulated)
  4. Customer opens link (no login), fills product-specific form
  5. Customer uploads brand assets (logo, style guide PDF)
  6. Customer saves progress mid-form, closes browser
  7. Customer reopens link — form state is restored
  8. Customer completes all required fields and submits
  9. PM dashboard shows 100% completion for that customer
  10. PM can view full customer profile with all submitted data
  11. At no point did PM open Zoho

---

## File Changes

| Action | File | Notes |
|--------|------|-------|
| CREATE | `src/lib/customers/generate-id.ts` | `customer_id` generation utility |
| CREATE | `src/lib/customers/validate.ts` | Customer data validation |
| CREATE | `src/app/api/customers/route.ts` | `GET /api/customers`, `POST /api/customers` |
| CREATE | `src/app/api/customers/[customerId]/route.ts` | `GET/PATCH /api/customers/:id` |
| CREATE | `src/app/api/customers/[customerId]/products/route.ts` | Product association CRUD |
| CREATE | `src/app/api/upload/route.ts` | File upload endpoint |
| CREATE | `src/config/onboarding-schemas.ts` | Form schemas for all 4 products |
| CREATE | `src/components/onboarding/form-engine.tsx` | Shared dynamic form renderer |
| CREATE | `src/components/onboarding/form-section.tsx` | Individual form section |
| CREATE | `src/components/onboarding/form-field.tsx` | Individual field renderer |
| CREATE | `src/components/onboarding/file-upload.tsx` | Drag-and-drop file upload |
| CREATE | `src/components/onboarding/progress-bar.tsx` | Step/section progress indicator |
| CREATE | `src/components/onboarding/save-indicator.tsx` | Auto-save status display |
| CREATE | `src/components/onboarding/product-selector.tsx` | Product selection for new customers |
| CREATE | `src/components/pm/customer-table.tsx` | PM dashboard customer list |
| CREATE | `src/components/pm/customer-row.tsx` | Individual customer table row |
| CREATE | `src/components/pm/new-customer-modal.tsx` | Customer creation modal/dialog |
| CREATE | `src/components/pm/progress-cell.tsx` | Progress bar table cell |
| CREATE | `src/components/customers/customer-header.tsx` | Customer profile header |
| CREATE | `src/components/customers/product-card.tsx` | Product instance card |
| CREATE | `src/components/customers/activity-timeline.tsx` | Activity feed (stub) |
| CREATE | `src/components/customers/file-gallery.tsx` | Uploaded files display |
| CREATE | `src/hooks/use-onboarding-form.ts` | Form state management hook |
| CREATE | `src/hooks/use-auto-save.ts` | Debounced auto-save hook |
| CREATE | `src/hooks/use-file-upload.ts` | File upload hook |
| CREATE | `src/types/onboarding.ts` | Onboarding-specific types |
| MODIFY | `src/app/(hub)/onboarding/page.tsx` | Replace stub with PM-facing creation flow |
| CREATE | `src/app/(hub)/onboarding/[customerId]/page.tsx` | Customer-facing onboarding form |
| MODIFY | `src/app/(hub)/pm/page.tsx` | Replace stub with full PM dashboard |
| CREATE | `src/app/(hub)/customers/[customerId]/page.tsx` | Customer profile page |
| CREATE | `supabase/migrations/005_onboarding_storage.sql` | Storage bucket + RLS policies |

---

## Implementation Steps

### Phase A — Backend Foundation (Tasks 1–3, 17)

1. **Create `customer_id` generation utility**
   - `src/lib/customers/generate-id.ts`
   - Function: `generateCustomerId()` → `WRQ-CLIENT-XXXX`
   - Uses `crypto.randomUUID()`, takes first 4 alphanumeric chars, uppercases
   - Checks uniqueness via Supabase query, retries up to 5 times

2. **Create customer validation utility**
   - `src/lib/customers/validate.ts`
   - `validateCustomerCreate(body)` → returns `{ valid, errors }`
   - `validateCustomerUpdate(body)` → returns `{ valid, errors }`

3. **Create Customers API routes**
   - `src/app/api/customers/route.ts` — `GET` (list) + `POST` (create)
   - `src/app/api/customers/[customerId]/route.ts` — `GET` (single) + `PATCH` (update)
   - Use Supabase server client, handle errors with proper status codes
   - Return typed responses matching `src/types/hub.ts`

4. **Create Product Association API**
   - `src/app/api/customers/[customerId]/products/route.ts`
   - `POST` — add product to customer (creates `customer_products` row)
   - `DELETE` — remove product association

5. **Create File Upload API**
   - `src/app/api/upload/route.ts`
   - Multipart form data parsing
   - Validate file type and size
   - Upload to Supabase Storage `onboarding-assets` bucket
   - Return file metadata

6. **Create Supabase Storage migration**
   - `supabase/migrations/005_onboarding_storage.sql`
   - Create `onboarding-assets` bucket
   - Set up RLS policies for public read, authenticated write

### Phase B — Form Engine (Tasks 4–8, 11–12)

7. **Define onboarding form schemas**
   - `src/config/onboarding-schemas.ts`
   - Define `FormSchema` for each product (StackShift, PublishForge, CiteForge, PipelineForge)
   - PipelineForge schema based on `_design/forms/PipelineForge_Onboarding_Form.html` (8 sections)
   - Other three products: define reasonable sections based on product domain knowledge
   - Export a `getOnboardingSchema(productName: string): FormSchema` function

8. **Create form engine components**
   - `src/components/onboarding/form-engine.tsx` — top-level orchestrator
     - Receives `productName` and `customerId` props
     - Fetches schema from config
     - Manages current section index
     - Renders progress steps bar (matching PipelineForge design)
     - Renders current section panel
   - `src/components/onboarding/form-section.tsx` — renders one section
     - Section title, description, divider
     - Maps over fields, renders `FormField` for each
   - `src/components/onboarding/form-field.tsx` — renders one field
     - Switches on `type`: text, email, url, select, textarea, checkbox-group, radio-group, file, table
     - Handles conditional visibility (`condition` prop)
     - Applies design system styling (inputs, labels, selects)

9. **Create file upload component**
   - `src/components/onboarding/file-upload.tsx`
   - Drag-and-drop zone with visual feedback
   - Click to browse fallback
   - File type validation with error messages
   - Upload progress indicator
   - Preview (image thumbnails, document icons)
   - Remove button
   - Integrates with `POST /api/upload`

10. **Create progress indicator components**
    - `src/components/onboarding/progress-bar.tsx` — step navigation bar
      - Horizontal step pills with numbers
      - Active/done/upcoming states
      - Click to navigate between sections
    - `src/components/onboarding/save-indicator.tsx` — auto-save status
      - Green dot + "Draft auto-saved" text
      - Brief "Saving..." state during debounce
      - "Saved at 3:45 PM" timestamp

### Phase C — State Management & Hooks (Tasks 9–10)

11. **Create onboarding form hook**
    - `src/hooks/use-onboarding-form.ts`
    - Manages form state as `Record<string, any>`
    - `setFieldValue(name, value)` — update one field
    - `getFieldValue(name)` — read one field
    - `resetForm()` — clear all fields
    - `getCompletionPercentage()` — calculate from schema required fields
    - Initializes from `onboarding_data` if it exists (fetched on mount)

12. **Create auto-save hook**
    - `src/hooks/use-auto-save.ts`
    - Accepts: `data`, `customerId`, `productName`, `debounceMs` (default 2000)
    - Calls `PATCH /api/customers/[customerId]/products/[productName]/onboarding` on change
    - Tracks save state: 'idle' | 'saving' | 'saved' | 'error'
    - Returns: `saveStatus`, `lastSavedAt`, `error`

13. **Create file upload hook**
    - `src/hooks/use-file-upload.ts`
    - Manages upload queue, progress, and results
    - `uploadFile(file: File)` → `Promise<UploadedFile>`
    - `removeFile(fileId: string)`
    - Tracks upload state per file

### Phase D — Customer-Facing Onboarding Page (Tasks 2–3, 10)

14. **Create dynamic onboarding route**
    - `src/app/(hub)/onboarding/[customerId]/page.tsx`
    - Server component that fetches customer + product data
    - Passes data to client component `OnboardingFormEngine`
    - Handles: customer not found, no products associated, multiple products
    - If multiple products: show product selector first, then form for selected product
    - Page metadata: dynamic title

15. **Update PM-facing onboarding page**
    - `src/app/(hub)/onboarding/page.tsx`
    - Replace current generic form with customer creation flow
    - Step 1: Company info (name, contact, email)
    - Step 2: Product selection (checkboxes for StackShift, PublishForge, CiteForge, PipelineForge)
    - Step 3: Review → Create
    - On submit: calls `POST /api/customers`, then redirects to customer profile
    - Shows generated `customer_id` and onboarding URL after creation

### Phase E — PM Dashboard (Tasks 13–16)

16. **Create PM dashboard page**
    - `src/app/(hub)/pm/page.tsx`
    - Fetches customer list from `GET /api/customers`
    - Renders `CustomerTable` component
    - Search/filter bar
    - "New Customer" CTA button

17. **Create customer table components**
    - `src/components/pm/customer-table.tsx`
      - Table with sortable columns
      - Maps over customers, renders `CustomerRow` for each
    - `src/components/pm/customer-row.tsx`
      - Individual row with all columns
      - Click handler → navigate to customer profile
    - `src/components/pm/progress-cell.tsx`
      - Progress bar + percentage
      - Color-coded by completion level

18. **Create new customer modal**
    - `src/components/pm/new-customer-modal.tsx`
    - Modal dialog with customer creation form
    - Product selector checkboxes
    - Submit → create customer → close modal → refresh table
    - Alternatively: navigate to `/onboarding` page

### Phase F — Customer Profile (Tasks 16–17)

19. **Create customer profile page**
    - `src/app/(hub)/customers/[customerId]/page.tsx`
    - Fetches customer + products data
    - Renders profile sections

20. **Create customer profile components**
    - `src/components/customers/customer-header.tsx`
      - Company name, ID, status badge
      - Action buttons: Edit, Copy Link, View in Zoho (stub)
    - `src/components/customers/product-card.tsx`
      - Product name, icon, progress bar
      - Links to Sanity, Zoho, GitHub
    - `src/components/customers/activity-timeline.tsx`
      - Stub — "Activity will appear here once classification is active (Sprint 2)"
    - `src/components/customers/file-gallery.tsx`
      - Grid of uploaded file thumbnails/previews

### Phase G — TypeScript Types

21. **Create onboarding types**
    - `src/types/onboarding.ts`
    - `FormSchema`, `FormSection`, `FormField` types
    - `OnboardingData` — the shape of `onboarding_data` jsonb
    - `UploadedFile` — file metadata from upload API
    - `CustomerCreateInput`, `CustomerUpdateInput`

### Phase H — Integration & Polish

22. **Wire up all navigation**
    - Sidebar "Onboarding" link → PM onboarding creation page
    - Sidebar "PM Dashboard" link → PM dashboard
    - PM dashboard row click → customer profile
    - Customer profile "Copy Onboarding Link" → copies to clipboard with toast

23. **Add loading states**
    - Skeleton loaders for customer table
    - Skeleton for form sections while schema loads
    - Spinner for file uploads
    - Disabled buttons during API calls

24. **Add error states**
    - API error toasts
    - Form validation error messages (inline, below fields)
    - "Customer not found" page
    - "Failed to load form" with retry button
    - Upload failure with retry

25. **Verify build**
    - `npm run build` must succeed with zero TypeScript errors
    - `npm run lint` must pass

---

## Code Context

### Design System Compliance

All UI must follow `_design/design-system.md`:
- **Colors:** Navy sidebar (`#070E1F`), white cards on `#F7F8FA` page bg, blue (`#3358F4`) for interactive, orange (`#F97316`) for primary CTAs only
- **Typography:** Sora font, 13px body/UI, 10px eyebrow ALL CAPS, monospace for IDs
- **Spacing:** 24px page padding, 14–16px card gaps, 12px card radius
- **Buttons:** Pill shape (9999px radius), orange for "New Customer"/"Submit", blue for "Continue", ghost for "Back"/"Cancel"
- **Forms:** 13px inputs, 9px 12px padding, 8px radius, 1px `#E2E8F0` border, blue focus ring
- **Tables:** 10px uppercase headers, 13px body, 5px progress bars
- **Badges:** 4px radius, 11px font, status colors per design system

### PipelineForge Form Reference

The `_design/forms/PipelineForge_Onboarding_Form.html` is the most complete form design. It uses a dark theme (not the Hub's light theme) — when implementing, adapt the structure and field definitions to the Hub's light design system while preserving the form logic and section organization.

Key structural patterns from PipelineForge form:
- Sticky header with logo + auto-save indicator
- Horizontal step progress bar (clickable)
- Section panels with fade-slide animation
- Subsection titles with colored left-border accents (indigo, green, amber)
- Form grids: 2-column and 3-column layouts
- Info boxes (blue, amber, red variants)
- Specialized tables: persona table, scoring table, tone table, reply table, pipeline table, credentials table, metrics table, checklist table
- Fixed bottom nav bar with Back/Continue buttons + progress ring

### Supabase Server Client Pattern

```typescript
// src/lib/supabase/server.ts — already exists, use as-is
import { createClient } from "@/lib/supabase/server";

export async function GET() {
  const supabase = await createClient();
  const { data, error } = await supabase.from("customers").select("*");
  // ...
}
```

### API Route Pattern (Next.js App Router)

```typescript
// src/app/api/customers/route.ts
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const { searchParams } = new URL(request.url);
  const status = searchParams.get("status");
  // ... query, return NextResponse.json(data)
}

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const body = await request.json();
  // ... validate, insert, return NextResponse.json(data, { status: 201 })
}
```

### Dynamic Route Pattern

```typescript
// src/app/(hub)/onboarding/[customerId]/page.tsx
export default async function OnboardingPage({
  params,
}: {
  params: Promise<{ customerId: string }>;
}) {
  const { customerId } = await params;
  const supabase = await createClient();
  const { data: customer } = await supabase
    .from("customers")
    .select("*, customer_products(*)")
    .eq("customer_id", customerId)
    .single();
  // ...
}
```

---

## Notes for Implementation Agent

- **Sonnet recommended** — this sprint spans 25+ new files across backend (API routes, validation, storage), frontend (form engine, dashboard, profile pages), and database (migrations). It establishes the form engine pattern that all future product-specific forms will use. Architecture decisions made here cascade through all subsequent sprints.

- **Form engine is the critical path** — the shared `FormEngine` component and schema system must be designed for extensibility. Future sprints may add new products or modify existing form schemas without changing the engine code. Invest time in getting the schema definition format right.

- **PipelineForge form is the reference** — implement this variant first and most completely since the design is already done. The other three product variants can start with reasonable field sets and be refined later with PM input.

- **Dark theme → Light theme adaptation** — the PipelineForge HTML design uses a dark background (`#080912`). The Hub uses a light theme (`#F7F8FA` page bg, white cards). Adapt colors accordingly while preserving layout, spacing, and interaction patterns.

- **`customer_id` format** — the spec says `WRQ-CLIENT-XXXX`. The current onboarding stub generates a similar format. Standardize on this format across all customer creation paths.

- **No authentication on onboarding URLs** — this is by design (Spec Decision: "login-free"). The `customer_id` acts as a bearer token. Ensure the onboarding route and upload API work without auth cookies/headers.

- **RLS for storage** — the `onboarding-assets` bucket needs public read access (unauthenticated customers need to see their uploaded files). Write access should be unrestricted for MVP (the URL itself is the access control). Tighten in Phase 2 if needed.

- **Mobile-responsive** — the onboarding form must work on mobile (customers may fill it out on phones). Test form grid layouts at 320px width. The PipelineForge design already has responsive breakpoints — adapt them.

- **Auto-save debounce** — 2 seconds is the default. Ensure the save indicator shows "Saving..." during the debounce period and "Saved" after the API call completes. Handle offline scenarios gracefully (queue saves, show "Offline — changes saved locally" message).

- **File upload size limit** — 25MB per file. Enforce both client-side (before upload) and server-side (in API route). Show clear error if file exceeds limit.

- **Progress percentage calculation** — count only `required: true` fields. Sections with all required fields complete count as 100% for that section. Overall percentage = completed required fields / total required fields across all sections.

- **Stub pages to keep** — the classification, orchestration, kb, and dev pages remain stubs. Only onboarding, PM dashboard, and customer profile get real implementations in this sprint.

- **No Zoho integration yet** — Sprint 1 is purely Hub-internal. Zoho sync comes in Sprint 2. The `zoho_account_id` and `zoho_project_id` fields are stored but not synced.

---

## Automation

Automation: manual

---

## Implementation Notes

> **Simplify Review:** PASS
> **Reviewed:** 2026-05-07 (re-reviewed after fixes)

### What was built

Full Sprint 1 customer creation and onboarding module: `POST/GET /api/customers`, `GET/PATCH /api/customers/[customerId]`, product association APIs, `/api/upload` endpoint, Supabase Storage migration, onboarding form engine (4 product schemas), auto-save hook, file upload hook, PM dashboard, customer profile page, and the login-free `/onboarding/[customerId]` customer-facing route.

### How to access for testing
- Entry point: `/onboarding` (PM creates customer) → `/pm` (PM dashboard) → `/customers/{id}` (profile) → `/onboarding/{id}` (customer-facing form)
- Setup required: run `supabase/migrations/005_onboarding_storage.sql`, ensure env vars set per `env.example`

### Deviations from plan

**Medium — Component consolidation:** Task spec called for 8 separate files under `src/components/pm/` and `src/components/customers/` (customer-table, customer-row, new-customer-modal, progress-cell, customer-header, product-card, activity-timeline, file-gallery). Instead, these were inlined into `pm/page.tsx` and `customers/[customerId]/client.tsx`. Onboarding components (`src/components/onboarding/`) were split correctly per plan.

**Minor — Fallback ID format:** `generate-id.ts` fallback (triggered after 5 collisions) generates `WRQ-CLIENT-XXXXXX` (6 chars) instead of spec's `WRQ-CLIENT-XXXX` (4 chars).

### Standards check

Pass — all previously flagged issues resolved:
- `window.location.origin` moved inside `handleCopyLink` callback (no longer at render-time)
- `"use server"` directive removed from `generate-id.ts`
- `completedPercentage` now accepted as a prop in `useAutoSave` instead of hardcoded to 0

### Convention check

Pass — previously flagged CLAUDE.md violation resolved:
- GET handler in `customers/[customerId]/route.ts` now uses `createClient()` instead of `adminClient`

---

## Acceptance Criteria

- [ ] `POST /api/customers` creates a customer with unique `WRQ-CLIENT-XXXX` ID
- [ ] `GET /api/customers` returns paginated, filterable customer list
- [ ] `/onboard/{customer_id}` renders product-specific form for the customer
- [ ] Onboarding form auto-saves progress to Supabase every 2 seconds
- [ ] Customer can close and reopen the onboarding URL — form state is restored
- [ ] File upload accepts images, PDFs, Word docs, and spreadsheets up to 25MB
- [ ] Uploaded files stored in Supabase Storage under correct customer/product path
- [ ] PM dashboard shows all customers with status, products, and progress bars
- [ ] Customer profile page displays all submitted onboarding data organized by section
- [ ] "Copy Onboarding Link" copies the correct URL to clipboard
- [ ] Full AC1 flow passes: PM creates customer → customer fills form → PM sees 100% completion — all without Zoho
- [ ] `npm run build` succeeds with zero TypeScript errors
- [ ] `npm run lint` passes
- [ ] All new components follow design system (colors, typography, spacing, radius)
- [ ] Mobile-responsive: onboarding form usable at 320px width