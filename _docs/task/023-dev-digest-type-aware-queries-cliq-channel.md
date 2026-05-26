# 023: Dev Digest — Type-Aware Queries, Dev Prompt & Cliq Dev Channel

**Created:** 2026-05-25
**Priority:** HIGH
**Type:** feature
**Recommended Model:** sonnet
**Status:** TESTING
**Completed:** 2026-05-25

> Covers Sprint 3 SCRUM tracker items #15 (Dev Digest: today's tasks), #16 (Dev Digest: overdue items), and #21 (Dev Digest delivery to Zoho Cliq Dev channel).

---

## Overview

`generateDigest("dev")` currently runs the same PM-oriented queries as `generateDigest("pm")`. A developer opening the digest sees PM-centric data (active clients, onboarding count) instead of dev-relevant information: what's ready to work on, what's blocked, and what's been sitting unworked the longest.

This task makes the dev digest type-aware at the query and prompt level, and routes it to a separate Cliq channel.

**Scope constraint:** No Zoho Projects API calls in this task. Dev-specific data is sourced from Hub DB tables (`classification_records`, `requirements_assessments`). Zoho time tracking (#18, medium) is deferred to a later task when the Zoho API client is expanded.

---

## Implementation Steps

### Step 1 — Add `ZOHO_CLIQ_DEV_WEBHOOK_URL` env var

**`env.example`** — add below the existing `ZOHO_CLIQ_WEBHOOK_URL` line:

```
# Separate Cliq channel for dev digest notifications (Sprint 3+)
ZOHO_CLIQ_DEV_WEBHOOK_URL=
```

**`src/lib/zoho/index.ts`** — update `sendCliqNotification` to accept an optional `channel` param:

```typescript
export async function sendCliqNotification(
  message: string,
  channel: "pm" | "dev" = "pm"
): Promise<void> {
  const webhookUrl =
    channel === "dev"
      ? process.env.ZOHO_CLIQ_DEV_WEBHOOK_URL
      : process.env.ZOHO_CLIQ_WEBHOOK_URL;
  const token = process.env.ZOHO_CLIQ_WEBHOOK_TOKEN;
  if (!webhookUrl || !token) return;
  // ... rest unchanged
}
```

Update the call in `digest.ts` to pass `channel: type` (so `"dev"` digest uses the dev channel).

---

### Step 2 — Dev-specific DB queries in `generateDigest()`

**`src/lib/ai/digest.ts`** — add a `buildDevContext()` branch. When `type === "dev"`, replace the PM queries with:

```typescript
// Dev digest queries
const [
  clearAssessmentsResult,
  blockedAssessmentsResult,
  oldestPendingResult,
  recentAssessmentsResult,
] = await Promise.all([
  // Items assessed CLEAR — dev can start immediately
  adminClient
    .from("requirements_assessments")
    .select("id, classification_id, customer_id, overall_status, created_at, assessment_version")
    .eq("overall_status", "CLEAR")
    .order("created_at", { ascending: false })
    .limit(10),

  // Items BLOCKED or PARTIAL — need PM/customer action before dev can proceed
  adminClient
    .from("requirements_assessments")
    .select("id, classification_id, customer_id, overall_status, created_at")
    .in("overall_status", ["BLOCKED", "PARTIAL"])
    .order("created_at", { ascending: false })
    .limit(5),

  // Oldest pending classification_records still not yet assessed — potential overdue items
  adminClient
    .from("classification_records")
    .select("id, title, customer_id, priority, created_at")
    .eq("status", "pending")
    .eq("llm_eligible", "YES")
    .order("created_at", { ascending: true })  // oldest first
    .limit(5),

  // Latest assessments created in last 48h (recently ready)
  adminClient
    .from("requirements_assessments")
    .select("id, classification_id, customer_id, overall_status, created_at")
    .eq("overall_status", "CLEAR")
    .gte("created_at", new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString())
    .order("created_at", { ascending: false })
    .limit(5),
]);
```

Assemble a dev-specific context string:

```
=== DEV OPERATIONAL SNAPSHOT ===
Date: 2026-05-25
Digest Type: DEV

Ready to Work (CLEAR assessment): N items
  - [customer_id] classification_id (assessed X hours ago)
  ...

Waiting on PM / Customer (BLOCKED or PARTIAL): N items
  - ...

Overdue — Pending LLM-Eligible Tasks (oldest first): N items
  - [PRIORITY] title (customer_id) — X days old
  ...

Recently Cleared (last 48h): N items
  - ...
```

---

### Step 3 — Dev-specific LLM prompt

In `generateDigest()`, branch the prompt on `type`:

**PM prompt** (existing — no change)

**Dev prompt:**
```
You are an operational assistant for a web development agency developer.

Generate a concise daily dev digest based on the following operational snapshot.

${devContext}

Guidelines:
- summary: 2–3 sentence dev-focused overview — what can be started today, what is waiting
- attention_items: up to 5 items a developer should prioritize or flag to the PM
- stalled_items: classification IDs or task names that have been pending the longest without assessment
- ready_to_close: count of CLEAR items that appear ready to be picked up immediately
- highlights: one positive signal (e.g. "4 tasks cleared assessment this week and are ready to start")

Be specific. Reference actual customer IDs, classification IDs, and time elapsed where relevant.
```

The output schema (`DigestSchema`) is unchanged — same Zod shape, same `digest_logs` insert.

---

### Step 4 — Wire Cliq channel in `digest.ts`

Update the `sendCliqNotification` call at the end of `generateDigest()`:

```typescript
// Before (always PM channel):
await sendCliqNotification(`📋 PM Daily Digest for ${today} is ready — open the Hub to view your situational overview.`);

// After (type-aware):
const message = type === "dev"
  ? `🛠️ Dev Daily Digest for ${today} is ready — open the Hub to review what's cleared and ready to work.`
  : `📋 PM Daily Digest for ${today} is ready — open the Hub to view your situational overview.`;
await sendCliqNotification(message, type);
```

---

## File Changes

| File | Action | Notes |
|------|--------|-------|
| `env.example` | Modify | Add `ZOHO_CLIQ_DEV_WEBHOOK_URL` |
| `src/lib/zoho/index.ts` | Modify | Add `channel` param to `sendCliqNotification` |
| `src/lib/ai/digest.ts` | Modify | Type-aware context queries + prompt branch; pass channel to Cliq |

---

## Code Context

### Current `generateDigest()` query block (`src/lib/ai/digest.ts:35–62`)

```typescript
const [
  activeCustomersResult,
  completedOnboardingResult,
  pendingClassificationsResult,
  attentionItemsResult,
] = await Promise.all([
  adminClient.from("customers").select("*", { count: "exact", head: true }).eq("status", "active"),
  adminClient.from("customers").select("*", { count: "exact", head: true }).eq("status", "completed_onboarding"),
  adminClient.from("classification_records").select("id, title, customer_id, priority, task_type, created_at").eq("status", "pending").order("created_at", { ascending: false }).limit(10),
  adminClient.from("classification_records").select("id, title, customer_id, priority, created_at").eq("status", "pending").in("priority", ["CRITICAL", "HIGH"]).order("created_at", { ascending: false }).limit(5),
]);
```

Wrap this block in an `if (type === "pm")` branch; add the dev queries in an `else` branch.

### Current `sendCliqNotification` (`src/lib/zoho/index.ts:73–89`)
```typescript
export async function sendCliqNotification(message: string): Promise<void> {
  const webhookUrl = process.env.ZOHO_CLIQ_WEBHOOK_URL;
  const token = process.env.ZOHO_CLIQ_WEBHOOK_TOKEN;
  if (!webhookUrl || !token) return;
  const url = `${webhookUrl}?zapikey=${token}`;
  ...
}
```

### `requirements_assessments` columns relevant to dev queries
- `overall_status`: `"CLEAR" | "PARTIAL" | "BLOCKED"`
- `classification_id`: uuid → join to `classification_records` for title + customer
- `customer_id`: text
- `created_at`: timestamptz

### `classification_records` columns relevant to overdue query
- `llm_eligible`: `"YES" | "NO" | "HUMAN_ONLY"`
- `status`: `"pending" | ...`
- `priority`: `"CRITICAL" | "HIGH" | "NORMAL" | "LOW"`
- `created_at`: timestamptz

---

## Notes

- **No Zoho Projects API calls in this task.** Items #17 (team unassigned tasks) and #18 (hours this week via Zoho) are medium priority and require the Zoho API client to be expanded first — defer to a later task.
- **`DigestSchema` is unchanged** — same Zod output shape. The dev digest produces the same structured object; only the input context and prompt differ.
- **Dev digest route** is already accessible at `POST /api/digest` with `{ type: "dev" }` — no route changes needed.
- **PM home page** only fetches `digest_type = 'pm'` — dev digest won't pollute the PM dashboard.
- **`ZOHO_CLIQ_DEV_WEBHOOK_URL`** can be left empty in dev; the notification will silently skip (same guard as the PM webhook).
- **Overdue definition:** For Hub purposes, any LLM-eligible pending classification_record older than 48h with no assessment is considered "overdue." No Zoho time data needed for this initial signal.
