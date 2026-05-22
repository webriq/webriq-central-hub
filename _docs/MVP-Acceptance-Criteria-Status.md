# MVP Acceptance Criteria Status

**Last reviewed:** 2026-05-21
**Reviewer:** Claude Code (automated codebase audit)
**Sprint:** End of Sprint 2 / Start of Sprint 3

---

## Acceptance Criteria

| # | Criteria | Status | Notes |
|---|----------|--------|-------|
| AC1 | A PM can onboard a new customer end-to-end without opening Zoho. | ✅ Done | Sprint 1 complete |
| AC2 | A new Zoho Desk ticket appears in the Hub classified within 60 seconds. | 🟡 Code complete | Needs env setup (see below) |
| AC3 | A Content Update task completes the full loop (classify → plan → execute → reply) without PM touching Zoho. | ❌ Not started | Blocked on Sprints 3–5 |
| AC4 | A PM starts the day from the digest with full situational awareness without opening Zoho. | ❌ Not started | Blocked on Sprint 3 (M4) |
| AC5 | A Developer can see assigned work and self-assign an available task from the Hub. | ❌ Not started | Blocked on Sprint 6 (M9) |

---

## Milestone Status

### M1 — Customer & Onboarding ✅ Complete

- Customer creation with `customer_id` (`WRQ-CLIENT-XXXX` format)
- Dynamic onboarding form — schema-driven, conditional logic per product
- Progressive completion — auto-save, resume, share link
- File/asset upload via Supabase Storage
- PM dashboard — completion % and missing fields per customer
- Customer profile — product instance mapping, progress bars

### M2 — Classification Engine ✅ Complete (TESTING)

- Webhook listener at `POST /api/webhooks` — parses Zoho Desk (`ticketId`) and Zoho Projects (`taskId`) payloads
- Customer resolution via `customers.zoho_account_id` (Desk) and `customer_products.zoho_project_id` (Projects)
- Haiku classification via `classifyTask()` in `src/lib/ai/classify.ts` — `generateObject` with Zod schema
- `classification_records` row inserted with `task_type`, `priority`, `llm_eligible`, `confidence_score`, `raw_response`, token counts
- `llm_invocation_logs` row written on every successful LLM call
- Low-confidence records (< 75%) surfaced in Tasks tab "Needs Review" filter
- Manual re-classification: `ReclassifyModal` in `tasks-tab.tsx` → `PATCH /api/classification/[id]` → sets `status = reviewed`, `reviewed_by`, `reviewed_at`
- Home tab stat cards wired to live counts (Pending Review, Open Tasks, In Pipeline)
- Pipeline tab Classify column wired to live `pending` records
- Customer profile shows that customer's classification history

### M3 — Requirements Assessment ❌ Sprint 3

- Subtask breakdown with CLEAR / PARTIAL / BLOCKED status
- Clarification draft generated for PM review
- Task flagged `CLARIFICATION_NEEDED` in digest when blocked
- Re-assessment triggers when customer replies

### M4 — Daily Digest ❌ Sprint 3

- Supabase cron running at configured time
- PM digest: pending, unassigned, stalled, ready to close
- Dev digest: assigned tasks, overdue, team unassigned
- Digest stored in `digest_logs` — dashboard reads on load
- Digest feedback rating (Useful / Partial / Not Useful)

### M5 — Plan Generation ❌ Sprint 4

- "Generate Plan" button on any LLM-eligible task
- Plan shown: steps, affected files, confidence score, risk flags
- Approve / Reject with structured rejection reason

### M6 — Execution: Content Updates ❌ Sprint 5

- Approved plan triggers execution via Sanity API
- Execution record stored with pre-action state for rollback
- GitHub PR generated for code-type tasks
- Vercel/Netlify preview URL captured and displayed

### M7 — Zoho Sync ⚠️ Partial

| Item | Status |
|------|--------|
| Hub creates Zoho project on product add | ✅ Implemented — env-gated (`ZOHO_CLIENT_ID`, `ZOHO_CLIENT_SECRET`, `ZOHO_REFRESH_TOKEN`, `ZOHO_PORTAL_ID`) |
| Zoho status changes sync back via webhook | ✅ Webhook listener handles inbound events |
| Hub pushes tasks and assignments to Zoho | ❌ Sprint 4 (`syncTaskToZoho` is a stub) |
| One-click direct task/ticket links from Hub to Zoho | ❌ Sprint 4 |

### M8 — Reply Generation ❌ Sprint 5

### M9 — Developer Dashboard ❌ Sprint 6

### M10 — LLM Wiki Knowledge Base ❌ Sprint 6

---

## Required Setup to Validate AC2

The code for AC2 is complete. These are operational steps — no code changes needed.

### 1. Verify `llm_config` rows in Supabase

Open Supabase dashboard → Table Editor → `llm_config`. Confirm there is a row where:
- `orchestration_layer = 'classification'`
- `model_id = 'claude-haiku-4-5-20251001'`
- `is_active = true`

If missing, re-run `supabase/migrations/002_seed_llm_config.sql`.

Without this row, `getModel("classification")` fails silently — records insert but with `task_type = null` and `confidence_score = null`, all stuck at `pending` with no AI output.

### 2. `ANTHROPIC_API_KEY` in `.env.local`

Required for the Haiku call. Obtain from the Anthropic console and add to `.env.local`:

```
ANTHROPIC_API_KEY=sk-ant-...
```

### 3. Populate `customers.zoho_account_id`

The webhook resolver maps `accountId` from Zoho Desk to `customer_id` via `customers.zoho_account_id`. Without this field, all Desk webhooks log "could not resolve customer_id" and skip classification.

Set this for each customer in Supabase — find the Zoho Account ID in Zoho CRM or Desk under the account record.

### 4. Configure Zoho Desk Webhook

In Zoho Desk → Settings → Automation → Webhooks, create a webhook that fires on ticket **Create** (and optionally Update) pointing to:

```
POST https://<your-hub-domain>/api/webhooks
```

No auth headers needed — the endpoint is public and keyed by `zoho_account_id` lookup.

### 5. Zoho Cliq Notifications (optional)

Add to `.env.local` to enable CRITICAL/HIGH alerts in the designated Cliq channel:

```
ZOHO_CLIQ_WEBHOOK_URL=https://cliq.zoho.com/api/v2/channelsbyname/.../message
ZOHO_CLIQ_WEBHOOK_TOKEN=<zapikey>
```

Both must be set — the function is a no-op if either is missing.

---

## What to Build Next — Sprint 3

To unlock AC3 and AC4, Sprint 3 must deliver:

**M3 — Requirements Assessment**
- `POST /api/assessment` — Sonnet call that breaks a classified task into subtasks with CLEAR / PARTIAL / BLOCKED status
- `assessment_records` table (already stubbed in schema)
- UI: Assessment detail view, clarification draft, PM send action

**M4 — Daily Digest**
- Supabase scheduled cron (once daily, configurable time)
- Haiku-generated PM digest and Dev digest
- `digest_logs` table (already stubbed in schema)
- Digest dashboard page with feedback rating (Useful / Partial / Not Useful)

Full Sprint 3 plan: `_docs/plan/WebriQ-Central-Hub-Sprint-Plan.md`
