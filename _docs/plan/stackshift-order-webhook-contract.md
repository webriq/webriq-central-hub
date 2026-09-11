# StackShift Order Form → Central Hub — Integration Contract

**Hub base URL:** `https://hub.webriqs.com`

The public StackShift Order Form lives on **webriq.com**. The browser must **never**
call the Hub directly (no CORS is configured, by design). Instead, a **server-side
proxy on webriq.com** relays each submission to the Hub over server-to-server HTTPS.

The Hub only **records the submission and notifies the review queue** — it never
creates customers or projects. Staff review and convert each order manually inside
the Hub at `/stackshift-orders`.

---

## Authentication

Every request to the endpoints below must carry a shared-secret header:

| | |
|---|---|
| Header | `x-stackshift-webhook-secret: <secret>` |
| Hub env var | `STACKSHIFT_ORDER_WEBHOOK_SECRET` |
| Compare | timing-safe, exact match |

Responses:
- `503 { "error": "Intake endpoint not configured" }` — secret not set on the Hub
- `401 { "error": "Unauthorized" }` — missing/incorrect secret
- Unlike the Zoho webhook, these endpoints return **real 4xx/5xx** on failure (the
  proxy is ours and should surface errors).

---

## Endpoints

### 1. Mint signed upload URLs

```
POST https://hub.webriqs.com/api/webhooks/stackshift-order/uploads
Content-Type: application/json
x-stackshift-webhook-secret: <secret>
```

Exchange a file manifest for signed Supabase Storage upload URLs. The proxy then
PUTs the file bytes **straight to Storage** (the bytes never pass through a Hub
handler — this sidesteps Vercel's ~4.5 MB request-body cap).

**Request body**

```json
{
  "files": [
    { "field": "proposal",       "filename": "proposal.pdf", "contentType": "application/pdf", "size": 182734 },
    { "field": "flowforge_spec",  "filename": "spec.docx",    "contentType": "application/vnd.openxmlformats-officedocument.wordprocessingml.document", "size": 44210 }
  ]
}
```

- `files`: 1–2 entries.
- `field`: `"proposal"` (required doc) or `"flowforge_spec"` (optional doc). Each may appear at most once.
- `filename`: 1–255 chars. Accepted extensions:
  - `proposal`: `pdf`, `doc`, `docx`
  - `flowforge_spec`: `pdf`, `doc`, `docx`, `txt`, `md`, `xls`, `xlsx`, `csv`
- `size`: bytes, > 0, max **25 MB** (`26214400`).

**Response** `200`

```json
{
  "uploads": [
    {
      "field": "proposal",
      "path": "stackshift-orders/incoming/<uuid>/proposal-proposal.pdf",
      "signedUrl": "https://<supabase>/storage/v1/object/upload/sign/project-assets/...",
      "token": "<upload-token>"
    }
  ]
}
```

**Errors**
- `400 { "error": "Invalid manifest", "details": ... }` — schema failure
- `400 { "error": "<field>: .<ext> is not an accepted type (...)" }`
- `400 { "error": "Duplicate file field: <field>" }`
- `500 { "error": "Failed to create upload URLs" }`

**Uploading the bytes** — for each returned entry, PUT the raw file to `signedUrl`:

```
PUT <signedUrl>
Content-Type: <the file's content type>
<binary file body>
```

Keep the returned `path` values — they go into the next request.

---

### 2. Submit the order

```
POST https://hub.webriqs.com/api/webhooks/stackshift-order
Content-Type: application/json
x-stackshift-webhook-secret: <secret>
```

Records the submission and emails the review queue. **JSON, not multipart.**

**Request body**

```json
{
  "idempotencyKey": "webriq-order-2026-09-04-abc123",
  "contact": {
    "name": "Jane Doe",
    "email": "jane@acme.com",
    "phone": "+1 555 010 1234",
    "billingName": "Acme Accounts Payable",
    "billingEmail": "ap@acme.com"
  },
  "company": {
    "name": "Acme Corp",
    "website": "https://acme.com",
    "address": "123 Main St, Springfield, USA"
  },
  "orderDateTime": "2026-09-04T14:30:00Z",
  "services": ["StackShift II", "FlowForge"],
  "proposalPath": "stackshift-orders/incoming/<uuid>/proposal-proposal.pdf",
  "proposalFilename": "proposal.pdf",
  "flowforgeSpecPath": "stackshift-orders/incoming/<uuid>/flowforge_spec-spec.docx",
  "flowforgeSpecFilename": "spec.docx",
  "approval": {
    "approvedBy": "Jane Doe",
    "approvalDate": "2026-09-04",
    "termsAccepted": true
  }
}
```

**Field reference**

| Field | Req | Notes |
|---|---|---|
| `idempotencyKey` | optional | 1–200 chars. A retry with the same key returns the existing order (`deduped: true`). Strongly recommended. |
| `contact.name` | ✅ | 1–200 |
| `contact.email` | ✅ | valid email, ≤ 320 |
| `contact.phone` | ✅ | 1–64 |
| `contact.billingName` | optional | ≤ 200, may be `null` |
| `contact.billingEmail` | optional | valid email or `""`, may be `null` |
| `company.name` | ✅ | 1–300 |
| `company.website` | ✅ | valid URL, ≤ 500 |
| `company.address` | ✅ | 1–2000 |
| `orderDateTime` | optional | 1–64 chars; any parseable date string (stored as ISO, else `null`) |
| `services` | ✅ | 1–10 strings, each 1–120 chars. Use the exact marketing names below. |
| `proposalPath` | ✅ | the `path` from endpoint 1 for `field: "proposal"` |
| `proposalFilename` | ✅ | 1–255 |
| `flowforgeSpecPath` | optional | `path` from endpoint 1 for `field: "flowforge_spec"`; omit/`null` if none |
| `flowforgeSpecFilename` | optional | required if `flowforgeSpecPath` is present |
| `approval.approvedBy` | ✅ | 1–200 |
| `approval.approvalDate` | ✅ | 1–32 chars |
| `approval.termsAccepted` | ✅ | must be literally `true` |

**`services` — accepted values** (exact strings; anything else is kept verbatim for
the reviewer but not auto-mapped):

- `StackShift Access`
- `StackShift Access Plus`
- `StackShift I`
- `StackShift II`
- `PipelineForge`
- `FlowForge`  → mapped internally to "Discrete Development"

**Response** `201`

```json
{ "ok": true, "orderId": "<uuid>" }
```

Idempotent hit: `200 { "ok": true, "orderId": "<uuid>", "deduped": true }`

**Errors**
- `400 { "error": "Invalid JSON body" }`
- `400 { "error": "Invalid payload", "details": ... }`
- `400 { "error": "Proposal document: <reason>" }` — storage object missing/invalid
- `400 { "error": "FlowForge spec: <reason>" }`
- `500 { "error": "Failed to record submission" }`

`GET` on either endpoint returns `405`.

---

## End-to-end flow (webriq.com proxy)

1. User completes the StackShift Order Form on webriq.com and submits.
2. Proxy → `POST /api/webhooks/stackshift-order/uploads` with the file manifest.
3. Proxy → `PUT` each file's bytes to its `signedUrl` (direct to Supabase Storage).
4. Proxy → `POST /api/webhooks/stackshift-order` with the form fields + the storage
   `path`s from step 2.
5. Hub verifies the uploaded objects, inserts a `stackshift_orders` row
   (`status: "pending_review"`), and emails the review queue
   (`STACKSHIFT_ORDER_NOTIFY_EMAILS` + every PM).
6. Staff review and convert at `https://hub.webriqs.com/stackshift-orders`.

## Notes

- Send the `idempotencyKey` and reuse it on retries — the proxy should retry on
  network failure or 5xx, and the key prevents duplicate orders.
- If a submission fails after files are uploaded (step 3 done, step 4 failed),
  retrying step 4 with the same `path`s and `idempotencyKey` is safe.
- Orphaned uploads (files uploaded, order never submitted) are harmless — no UI
  surfaces them and the bucket has its own size limits.
