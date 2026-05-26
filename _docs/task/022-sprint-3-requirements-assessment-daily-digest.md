# 022: Sprint 3 — Requirements Assessment (M3) + Daily Digest (M4)

**Created:** 2026-05-25
**Priority:** HIGH
**Type:** feature
**Recommended Model:** sonnet
**Status:** TESTING
**Completed:** 2026-05-25

> **Recommended Model:** sonnet — spans DB migrations, 3 new AI functions, 2 API route replacements, orchestration UI overhaul, and PM home digest wiring. Introduces `buildContextChain()` which all Sprints 4/5 depend on.
>
> **Investigation:** /understand ran before this spec. Findings embedded below.

---

## Overview

Sprint 3 delivers two AI milestones:

**M3 — Requirements Assessment:** Claude Sonnet reviews a classified task, breaks it into subtasks, assigns each a `CLEAR / PARTIAL / BLOCKED` status, and drafts a clarification message when inputs are missing. PM triggers it manually via a "Run Assessment" button in the orchestration UI.

**M4 — Daily Digest:** Claude Haiku compiles a PM situational digest daily via Supabase pg_cron. The digest is stored in `digest_logs` and read on PM home page load — no live LLM call at dashboard render time (fast + predictable cost).

### Decisions (confirmed with PM)
- **Assessment trigger:** PM-manual only (`"Run Assessment"` button) — consistent with Principle P8
- **Cron mechanism:** Supabase pg_cron + pg_net HTTP call to `/api/digest`
- **Digest schedule config:** `DIGEST_CRON_TIME` env var (cron expression, e.g. `"0 8 * * *"`)
- **`raw_response` field:** Add to `requirements_assessments` via migration 011

---

## Implementation Steps

### Step 1 — DB Migrations

**`supabase/migrations/011_assessment_raw_response.sql`** (new)
```sql
alter table requirements_assessments
  add column if not exists raw_response jsonb;
```

**`supabase/migrations/012_pg_cron_digest.sql`** (new)
```sql
-- Enable extensions (Supabase cloud has both; no-op if already enabled)
create extension if not exists pg_cron;
create extension if not exists pg_net;

-- Schedule daily digest. DIGEST_CRON_TIME is read at migration time from env.
-- Default: 08:00 UTC daily. Change via Supabase SQL editor if needed.
select cron.schedule(
  'daily-pm-digest',
  '0 8 * * *',   -- override at deploy time; see env var DIGEST_CRON_TIME
  $$
  select net.http_post(
    url    := current_setting('app.digest_url'),  -- set via: alter system set app.digest_url = '...'
    body   := '{"type":"pm"}'::jsonb,
    headers := '{"x-digest-secret": "' || current_setting('app.digest_secret') || '"}'::jsonb
  )
  $$
);
```

> **Note for deployer:** After running this migration, set the two Postgres config values in the Supabase SQL editor:
> ```sql
> alter system set app.digest_url = 'https://your-vercel-url.vercel.app/api/digest';
> alter system set app.digest_secret = 'your-digest-secret-here';  -- matches DIGEST_SECRET env var
> ```
> In local dev, the cron won't reach localhost — use the manual "Trigger Digest" button added to the PM home page.

---

### Step 2 — `buildContextChain()` (Priority 1 — unlocks all of Sprint 3–5)

**`src/lib/ai/context-chain.ts`** (new file)

This is the load-bearing utility. Every Sonnet prompt from Sprint 3 onward uses it. Build it before `assess.ts`.

```typescript
// Returns a formatted context string for use in LLM prompts.
// Sprint 3: customer profile + classification record only.
// Sprints 4/5 will extend this with assessment + plan data.
export async function buildContextChain(classificationId: string): Promise<string>
```

Implementation:
1. Fetch classification record by ID (adminClient, `classification_records`)
2. Fetch customer record by `customer_id` (adminClient, `customers` + `customer_products`)
3. Assemble and return a structured string:

```
=== CUSTOMER ===
ID: WRQ-CLIENT-XXXX
Products: StackShift, CiteForge
Tone: formal

=== TASK ===
Title: Update hero section copy
Source: zoho_desk
Type: CONTENT_UPDATE
Priority: HIGH
LLM Eligible: YES
Confidence: 88%
Reasoning: Content change scoped to CMS, no code involved

Description: [full description if present]
```

Return the assembled string. If any fetch fails, include `[UNAVAILABLE]` for that section — never throw.

---

### Step 3 — `assessTask()` AI Function

**`src/lib/ai/assess.ts`** (new file)

Pattern mirrors `classify.ts` exactly: `generateObject` + Zod schema + `logLLMInvocation` + DB insert.

**Zod schema:**
```typescript
const SubtaskSchema = z.object({
  title: z.string(),
  status: z.enum(["CLEAR", "PARTIAL", "BLOCKED"]),
  notes: z.string().optional(),
});

const AssessmentSchema = z.object({
  subtasks: z.array(SubtaskSchema).min(1).max(10),
  overall_status: z.enum(["CLEAR", "PARTIAL", "BLOCKED"]),
  clarification_draft: z.string().nullable(),
});
```

**Export:**
```typescript
export type AssessInput = { classificationId: string; customerId: string };
export async function assessTask(input: AssessInput): Promise<RequirementsAssessmentRow | null>
```

**Logic:**
1. Call `buildContextChain(classificationId)`
2. Get model: `await getModel("assessment")` (Sonnet)
3. Call `generateObject` with the assembled context chain as prompt
4. Call `logLLMInvocation({ layer: "assessment", ... })`
5. Insert to `requirements_assessments`:
   - `subtasks`: structured array from schema
   - `overall_status`: from schema
   - `clarification_draft`: from schema (null if CLEAR)
   - `raw_response`: the raw `object` from `generateObject` before mapping
   - `assessment_version`: 1 (increment on re-assess via DB read of latest version)
6. Return the inserted record

**Prompt template:**
```
You are a requirements analyst for a web development agency.

Review the following task context and break it into implementation subtasks.
For each subtask, determine if the requirements are complete.

${contextChain}

For each subtask:
- status CLEAR: all required inputs are present to proceed
- status PARTIAL: some inputs are missing but work can partially begin
- status BLOCKED: a dependency or critical input is missing; work cannot start

If overall_status is PARTIAL or BLOCKED, write a brief, professional clarification_draft
(3–5 sentences) requesting the missing information from the customer.
If CLEAR, set clarification_draft to null.
```

---

### Step 4 — `POST /api/assessment` Route

**`src/app/api/assessment/route.ts`** (replace 501 stub)

```typescript
// POST body: { classificationId: string; customerId: string }
// Returns: RequirementsAssessmentRow | { error: string }
```

Implementation:
1. Parse and validate body with Zod (`classificationId: z.string().uuid()`, `customerId: z.string()`)
2. Verify caller is authenticated (use `createClient()` from `@/lib/supabase/server`, check session)
3. Call `assessTask({ classificationId, customerId })`
4. Return `200` with the record, or `500` if `assessTask` returns null

---

### Step 5 — Orchestration Page — Assessment UI

**`src/app/(hub)/orchestration/page.tsx`** (replace existing placeholder)

Replace the Sprint 5 AI chat shell with a functional assessment UI. The chat shell note can remain as a "Coming Sprint 5" footer.

**Page behavior (client component):**
1. On mount, fetch `classification_records` where `llm_eligible = 'YES'` and `status = 'pending'` (via Supabase browser client)
2. Also fetch existing `requirements_assessments` records for those classification IDs to show previous runs
3. Render a list of eligible tasks; each row shows: title, customer ID, priority badge, task type
4. Each row has a "Run Assessment" button (disabled while loading, shows spinner during POST)
5. On click: POST to `/api/assessment`, on success render the result inline below the row

**Assessment result display (inline):**
- `overall_status` badge: green = CLEAR, yellow = PARTIAL, red = BLOCKED
- Subtask list: each subtask title + its status badge + notes (if present)
- If `clarification_draft` is present: show in a card with a "Copy to Clipboard" button and a note "Send via PM to customer"
- "Re-run Assessment" button (available after first run)

---

### Step 6 — `generateDigest()` AI Function

**`src/lib/ai/digest.ts`** (new file)

```typescript
export type DigestType = "pm" | "dev";
export async function generateDigest(type: DigestType): Promise<DigestLogRow | null>
```

**Logic:**
1. Query Supabase for digest data (adminClient):
   - `customers` count where `status = 'active'`
   - `customers` count where `status = 'completed_onboarding'` (newly submitted, need Zoho project)
   - `classification_records` where `status = 'pending'` (count + top 5 by priority)
   - `classification_records` where `priority IN ('CRITICAL', 'HIGH')` and `status = 'pending'` (attention items)
2. Get model: `await getModel("digest")` (Haiku)
3. Call `generateObject` with a DigestSchema:
   ```typescript
   const DigestSchema = z.object({
     summary: z.string(),           // 2–3 sentence situational overview
     attention_items: z.array(z.object({
       title: z.string(),
       customer_id: z.string(),
       priority: z.string(),
     })).max(5),
     stalled_items: z.array(z.string()).max(3),  // names/titles of stalled items
     ready_to_close: z.number(),    // count of items ready to close
     highlights: z.string(),        // 1 sentence positive signal (e.g. "3 projects on track")
   });
   ```
4. Call `logLLMInvocation({ layer: "digest", ... })`
5. Insert to `digest_logs`:
   - `digest_type`: `type`
   - `content`: the parsed object
   - `digest_date`: today's date (UTC)
   - `model_used`, `input_tokens`, `output_tokens`
6. Send Cliq notification: `sendCliqNotification("📋 PM Daily Digest ready — open the Hub to view")`
7. Return the inserted record

---

### Step 7 — `POST /api/digest` Route

**`src/app/api/digest/route.ts`** (replace 501 stub)

```typescript
// POST body: { type: "pm" | "dev" }
// Auth: check x-digest-secret header matches DIGEST_SECRET env var (for cron calls)
//       OR valid session (for manual PM trigger)
```

Implementation:
1. Check auth: if `x-digest-secret` header matches `process.env.DIGEST_SECRET` → allow (cron path). Otherwise check Supabase session (manual path).
2. Parse body: `{ type: z.enum(["pm", "dev"]) }`
3. Call `generateDigest(type)`
4. Return `200` with the record

---

### Step 8 — Digest Feedback Route

**`src/app/api/digest/[id]/feedback/route.ts`** (new file)

```typescript
// PATCH body: { feedback: "useful" | "partial" | "not_useful" }
```

Implementation:
1. Check session (authenticated PM only)
2. Validate `feedback` with Zod enum
3. Update `digest_logs` row: `feedback`, `feedback_at: new Date().toISOString()`
4. Return `200`

---

### Step 9 — Wire DigestCard to `digest_logs`

**`src/components/hub/pm-tabs/home-tab.tsx`** (modify DigestCard)

Update `DigestCardProps` to accept real digest data:

```typescript
interface DigestCardProps {
  // Keep existing props for fallback when no digest exists yet
  attentionCount: number;
  activeCount: number;
  onboardingCount: number;
  // New: real digest from DB (null if not yet generated today)
  digest?: DigestLogRow | null;
  onFeedback?: (id: string, feedback: "useful" | "partial" | "not_useful") => void;
}
```

- If `digest` is present: show `digest.content.summary` instead of the computed string; show `digest.content.attention_items` as a list; show `digest.content.highlights`
- Add 3 feedback buttons below: "Useful ✓", "Partial", "Not Useful" — disabled after selection, calls `onFeedback`
- If `digest` is null: show existing computed summary as before (graceful fallback)

**`src/app/(hub)/pm/page.tsx`** (modify)

Add a fetch for today's digest on mount:
```typescript
const [latestDigest, setLatestDigest] = useState<DigestLogRow | null>(null);
```
- Fetch latest `digest_logs` row where `digest_type = 'pm'` and `digest_date = today` (Supabase browser client)
- Pass as `digest` to `HomeTab`
- Add a "Trigger Digest" button on the home page (visible to admin role only) that POSTs to `/api/digest` — for local dev and manual refresh

---

## File Changes

| File | Action | Notes |
|------|--------|-------|
| `supabase/migrations/011_assessment_raw_response.sql` | Create | Adds `raw_response jsonb` to `requirements_assessments` |
| `supabase/migrations/012_pg_cron_digest.sql` | Create | pg_cron + pg_net schedule for daily digest |
| `src/lib/ai/context-chain.ts` | Create | `buildContextChain(classificationId)` — Sprint 3–5 prerequisite |
| `src/lib/ai/assess.ts` | Create | `assessTask()` — mirrors `classify.ts` pattern |
| `src/lib/ai/digest.ts` | Create | `generateDigest(type)` — Haiku, inserts to `digest_logs` |
| `src/app/api/assessment/route.ts` | Replace stub | `POST { classificationId, customerId }` |
| `src/app/api/digest/route.ts` | Replace stub | `POST { type }` — cron + manual trigger |
| `src/app/api/digest/[id]/feedback/route.ts` | Create | `PATCH { feedback }` — digest rating |
| `src/app/(hub)/orchestration/page.tsx` | Replace | Assessment UI — classified task list + Run Assessment |
| `src/components/hub/pm-tabs/home-tab.tsx` | Modify | `DigestCard` accepts real digest data + feedback buttons |
| `src/app/(hub)/pm/page.tsx` | Modify | Fetch today's digest, pass to `HomeTab`, add Trigger Digest button |

---

## Code Context

### Reference Pattern — `classifyTask()` (`src/lib/ai/classify.ts`)
_All new AI functions (`assessTask`, `generateDigest`) must follow this exact pattern._

```typescript
// 1. Start timer
const start = Date.now();

// 2. Get model from DB config — NEVER hard-code model IDs
const [model, config] = await Promise.all([
  getModel("assessment"),      // or "digest"
  getModelConfig("assessment"),
]);

// 3. Call generateObject with Zod schema
const { object, usage } = await generateObject({ model, schema: ..., prompt: ... });

// 4. Log EVERY invocation — mandatory, non-negotiable
await logLLMInvocation({
  customerId,
  layer: "assessment",   // matches llm_config.orchestration_layer
  modelUsed: config.model_id,
  inputTokens: usage?.inputTokens ?? 0,
  outputTokens: usage?.outputTokens ?? 0,
  durationMs: Date.now() - start,
  status: "success",
});

// 5. Insert to Supabase via adminClient
const { data: record, error } = await adminClient.from("requirements_assessments").insert({...}).select().single();
```

### `requirements_assessments` Schema (`supabase/migrations/001_initial_schema.sql:70–82`)
```sql
create table if not exists requirements_assessments (
  id                    uuid primary key default gen_random_uuid(),
  classification_id     uuid not null references classification_records (id) on delete cascade,
  customer_id           text not null references customers (customer_id) on delete cascade,
  subtasks              jsonb not null default '[]',
  overall_status        text not null check (overall_status in ('CLEAR', 'PARTIAL', 'BLOCKED')),
  clarification_draft   text,
  model_used            text,
  input_tokens          integer,
  output_tokens         integer,
  assessment_version    integer not null default 1,
  created_at            timestamptz not null default now()
  -- raw_response jsonb added by migration 011
);
```

### `digest_logs` Schema (`supabase/migrations/001_initial_schema.sql:178–190`)
```sql
create table if not exists digest_logs (
  id            uuid primary key default gen_random_uuid(),
  digest_type   text not null check (digest_type in ('pm', 'dev')),
  target_user   text,
  content       jsonb not null,
  model_used    text,
  input_tokens  integer,
  output_tokens integer,
  feedback      text check (feedback in ('useful', 'partial', 'not_useful')),
  feedback_at   timestamptz,
  digest_date   date not null,
  created_at    timestamptz not null default now()
);
```

### `getModel()` (`src/lib/ai/model-config.ts:35–39`)
```typescript
export async function getModel(layer: OrchestrationLayer): Promise<LanguageModel> {
  const config = await getModelConfig(layer);
  const provider = (config.provider ?? "anthropic") as "anthropic" | "openai";
  return getLanguageModel(provider, config.model_id);
}
```
`llm_config` already has seeded rows for `"assessment"` (Sonnet) and `"digest"` (Haiku). No DB changes needed.

### Existing `DigestCard` in `home-tab.tsx` (lines 64–96)
Current props: `{ attentionCount, activeCount, onboardingCount }` — computed values.
Sprint 3: add optional `digest?: DigestLogRow | null` and `onFeedback?` — preserve fallback behavior when null.

---

## Implementation Notes

> **Simplify Review:** PASS
> **Reviewed:** 2026-05-25

### What was built
- `buildContextChain(classificationId)` — assembles customer + task context string for all Sprint 3–5 Sonnet prompts
- `assessTask()` — Claude Sonnet breaks a classified task into subtasks with CLEAR/PARTIAL/BLOCKED status; inserts to `requirements_assessments` with versioning; drafts clarification message when blocked
- `generateDigest()` — Claude Haiku queries live DB data, generates PM situational digest, stores to `digest_logs`, sends Cliq notification
- `/api/assessment` — authenticated POST endpoint; replaces 501 stub
- `/api/digest` — dual-auth POST (pg_cron secret header or user session); replaces 501 stub
- `/api/digest/[id]/feedback` — PATCH endpoint for Useful/Partial/Not Useful rating
- Orchestration page — replaced Sprint 5 placeholder with real assessment UI: lists LLM-eligible pending tasks, Run Assessment button per task, inline subtask breakdown + clarification draft display
- DigestCard in home-tab — now accepts real `digest` data and renders LLM-generated summary + feedback buttons, with fallback to computed values when no digest exists yet
- PM home page — fetches today's digest on mount, passes to HomeTab, includes dev-only "Trigger Digest" button
- Migrations 011 and 012 applied to Supabase (confirmed via `supabase db push`)

### How to access for testing
- **Assessment UI:** `/orchestration` — requires at least one classified task with `llm_eligible = YES` and `status = pending` in DB
- **Digest trigger (dev):** PM home page (`/pm`) → "Trigger Digest (dev)" button (only visible in `NODE_ENV=development`)
- **Env var required:** `DIGEST_SECRET` must be set in `.env` for the digest route's cron auth path
- **pg_cron job:** Update URL + secret via `cron.alter_job()` in Supabase SQL editor after Vercel deployment; scheduled daily at 22:00 UTC (6:00 AM PHT)

### Deviations from plan
- **Minor:** `context-chain.ts` initially used `Promise.all` with a single item (corrected during simplify review — now a direct `await`)
- **Minor:** `key={i}` used for subtask list in orchestration page. Acceptable — list is static per assessment result and never reorders

### Standards check
Pass — no `any` types, no `console.log` (only `console.error` in error paths, consistent with `classify.ts` reference pattern), all hooks called unconditionally, all components have explicit prop types, loading/error/empty states handled in orchestration page.

### Convention check
Pass — all LLM calls log via `logLLMInvocation()`, no hard-coded model IDs (`getModel()` used throughout), `adminClient` only in server-side lib files, `createClient()` from `@/lib/supabase/server` used in API routes for auth, `buildContextChain()` called before every Sonnet prompt.

---

## Notes for Implementation Agent

- **Build `buildContextChain()` first** — it is a prerequisite for `assessTask()` and for every Sprint 4/5 AI function. If skipped, the assessment prompt will be context-free and useless.
- **Never hard-code model IDs.** Use `getModel("assessment")` and `getModel("digest")`. Both layers already exist in `llm_config`.
- **Always call `logLLMInvocation()` after every LLM call.** Non-negotiable per CLAUDE.md. Use the `referenceId` param to link logs to their assessment/digest record ID.
- **`subtasks` jsonb must be structured** as `[{ title, status, notes? }]` — not a blob or raw LLM text. Enforce via Zod before inserting.
- **`raw_response` needs migration 011** before `assess.ts` can write to it. Run migrations in order.
- **pg_cron won't reach localhost in dev.** The "Trigger Digest" button on the PM home page (admin only) is the local dev path. Cron runs on Supabase cloud against the Vercel deployment URL only.
- **`DIGEST_SECRET` env var** must be added to `env.example` and `.env.local`. The `/api/digest` route checks this header for cron calls as a bypass for session auth.
- **DigestCard is already in `home-tab.tsx`** — do not create a new component. Update its props in place and preserve the fallback (computed values) for when `digest` is null (first day before any digest exists).
- **`assessment_version`**: on re-assessment, fetch the latest version for this `classification_id` and increment by 1. The DB stores all versions — latest is the one used in UI.
- **Orchestration page**: the Sprint 5 AI chat shell content should be removed or collapsed to a small "Coming in Sprint 5" note. Sprint 3 owns this page.
- **`OrchestrationLayer` type** in `src/types/hub.ts` must include `"assessment"` and `"digest"` if not already present — check before writing `getModel()` calls.
