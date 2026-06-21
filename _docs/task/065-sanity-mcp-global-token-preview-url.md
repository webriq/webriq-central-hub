# Task 065 — Sanity MCP (Streamable HTTP) + Global Token + Preview URL

> **Status:** TESTING
> **Completed:** 2026-06-19
> **Implementation Notes:** Used `createMCPClient` from `@ai-sdk/mcp` (not `experimental_createMCPClient` from `ai` — that export doesn't exist in ai@6.0.168; `@ai-sdk/mcp` re-exports it as alias). Used `stopWhen: stepCountIs(10)` instead of `maxSteps` (ai@6 API). `createPreviewSecret` from `@sanity/preview-url-secret/create-secret` has a different signature than the task doc — takes `(client, source, studioUrl)` not an options object; stores the secret token in `preview_url` since full URL requires client frontend base URL (via `vercel_project_id`). SSE transport not used — Sanity MCP uses HTTP streamable (`type: 'http'`).
> **Priority:** HIGH
> **Type:** feature
> **Recommended Model:** sonnet
> **Investigation:** /understand ran before this spec. Findings embedded below.
> **Architecture decision:** Use `experimental_createMCPClient` + `mcp.sanity.io` Streamable HTTP (confirmed 2026-06-19)

---

## Goal

Replace the existing `@sanity/client` REST execution layer with the MCP-based architecture specified in the plan doc:

- **`experimental_createMCPClient`** connects to `mcp.sanity.io` via Streamable HTTP (`type: 'http'`)
- **`SANITY_GLOBAL_TOKEN`** (robot account bearer token) replaces per-project `SANITY_API_TOKEN` for execution
- **`generateText()` with MCP tools** replaces the `generateObject()` + `applyMutations()` pattern
- **Preview URL generation** uses `@sanity/preview-url-secret` (still uses `@sanity/client` — not MCP)
- **Per-project `dataset` and `vercel_project_id`** added to `projects` table

`@sanity/client` is NOT removed — it stays for `createPreviewSecret()` and `revertSanityExecution()`. Only the execution path (`executeSanityPlan`) switches to MCP.

---

## Requirements

- [ ] Add `SANITY_GLOBAL_TOKEN` and `SANITY_PREVIEW_SECRET` to `env.example`
- [ ] Add per-project `dataset text` and `vercel_project_id text` columns to `projects` table via migration `028_projects_vercel_dataset.sql`
- [ ] Install `@sanity/preview-url-secret`
- [ ] Rewrite `executeSanityPlan()` in `src/lib/sanity/index.ts` to use `experimental_createMCPClient` + `generateText()` with MCP tools — remove `SanityMutationSchema`, `applyMutations()`, `capturePreState()`, `capturePostState()`, `buildExecutionPrompt()`, `fetchSanityContext()`, `STACKSHIFT_SCHEMA`
- [ ] Keep `getSanityClient()` — used by `revertSanityExecution()` and preview URL generation; update to prefer `SANITY_GLOBAL_TOKEN` over `SANITY_API_TOKEN`
- [ ] Keep `revertSanityExecution()` — keep REST-based for now (simpler than MCP for reverting)
- [ ] Keep `PartialExecutionError` class
- [ ] After execution, generate preview URL via `createPreviewSecret()` and write to `execution_records.preview_url`
- [ ] In `src/app/api/execution/route.ts`, update `executeSanity()` to pass `dataset` from `projects` row
- [ ] Update `src/types/database.ts` for new `projects` columns
- [ ] TypeScript check passes: `npx tsc --noEmit` exits 0

## Out of Scope / Must-Not-Change

- Do not remove `@sanity/client` from `package.json` — still needed for preview URL and revert
- Do not change the circuit breaker logic in `applyCircuitBreaker()`
- Do not change the reply draft call in `executeSanity()` (T069 moves it after health check)
- The `draft-mode/enable` route belongs in each client's Next.js project, not Central Hub — document this, don't implement it
- Do not add `mcp.sanity.io` connection to any Client Component — server-only

---

## Proposed File Changes

| File | Action | Purpose |
|------|--------|---------|
| `supabase/migrations/028_projects_vercel_dataset.sql` | Create | Add `dataset`, `vercel_project_id` columns to `projects` |
| `env.example` | Modify | Add `SANITY_GLOBAL_TOKEN`, `SANITY_PREVIEW_SECRET` |
| `package.json` | Modify | Add `@sanity/preview-url-secret` |
| `src/lib/sanity/index.ts` | Modify | Replace execution internals with MCP; keep `getSanityClient`, `revertSanityExecution`, `PartialExecutionError` |
| `src/app/api/execution/route.ts` | Modify | Pass `dataset` from `projects`; write `preview_url` after execution |
| `src/types/database.ts` | Modify | Add `dataset`, `vercel_project_id` to `projects` table types |

---

## Code Context

### Current getSanityClient (src/lib/sanity/index.ts:55-65) — keep, update token

```ts
export function getSanityClient(projectId: string): SanityClient {
  const token = process.env.SANITY_API_TOKEN;    // ← change to prefer SANITY_GLOBAL_TOKEN
  if (!token) throw new Error("SANITY_API_TOKEN is not set");
  return createClient({
    projectId,
    dataset: process.env.SANITY_DATASET ?? "production",   // ← add dataset param
    apiVersion: "2024-01-01",
    token,
    useCdn: false,
  });
}
```

Updated signature: `getSanityClient(projectId: string, dataset?: string): SanityClient`

Token selection: `process.env.SANITY_GLOBAL_TOKEN ?? process.env.SANITY_API_TOKEN`

### Current executeSanityPlan (src/lib/sanity/index.ts:67-157) — REPLACE entirely

The entire `SanityMutationSchema`, `SanityMutation`, `buildExecutionPrompt`, `fetchSanityContext`, `STACKSHIFT_SCHEMA`, `capturePreState`, `capturePostState`, `applyMutations` block is removed. Replace with:

```ts
import { experimental_createMCPClient, generateText } from 'ai';

export async function executeSanityPlan(
  projectId: string,
  steps: PlanStep[],
  contextChain: string,
  dataset?: string,
): Promise<SanityExecutionResult> {
  const token = process.env.SANITY_GLOBAL_TOKEN;
  if (!token) throw new Error('SANITY_GLOBAL_TOKEN is not set');

  const [model, config] = await Promise.all([
    getModel('execution'),
    getModelConfig('execution'),
  ]);

  const sanityMCP = await experimental_createMCPClient({
    transport: {
      type: 'http',
      url: 'https://mcp.sanity.io',
      headers: {
        Authorization: `Bearer ${token}`,
      },
    },
  });

  const startMs = Date.now();
  try {
    const { text, usage } = await generateText({
      model,
      system: EXECUTION_SYSTEM_PROMPT,
      prompt: buildMCPPrompt(projectId, dataset ?? process.env.SANITY_DATASET ?? 'production', steps, contextChain),
      tools: await sanityMCP.tools(),
      maxSteps: 10,
    });

    await logLLMInvocation({
      layer: 'execution',
      modelUsed: config.model_id,
      inputTokens: usage.promptTokens ?? 0,
      outputTokens: usage.completionTokens ?? 0,
      durationMs: Date.now() - startMs,
    }).catch(() => {});

    return {
      pre_action_states: {},   // MCP tools track their own state
      post_action_states: {},
      what_was_done: text,
      what_was_skipped: null,
      retries: 0,
    };
  } finally {
    await sanityMCP.close();   // always close Streamable HTTP connection
  }
}
```

### MCP system prompt (key rules from plan doc)

```ts
const EXECUTION_SYSTEM_PROMPT = `
You are an AI operations assistant managing Sanity CMS for WEBRIQ client projects.

Rules:
- Never call publish_documents automatically — only create and patch as DRAFT
- Never guess a project ID — it is always provided in the task context
- Always use list_workspace_schemas before creating documents to verify field names
- Always use query_documents to check if a document exists before creating it
- Report: what you did, which tools you called, what was skipped
- When in doubt, do less and report what needs human review
`.trim();
```

### executeSanity in route.ts (src/app/api/execution/route.ts:229-342)

Update the `projects` select to include `dataset`:

```ts
const { data: product } = await adminClient
  .from("projects")
  .select("sanity_project_id, dataset")    // ← add dataset
  .eq("customer_id", customerId)
  .not("sanity_project_id", "is", null)
  .maybeSingle();
```

Pass `dataset` to `executeSanityPlan()`:

```ts
const result = await executeSanityPlan(
  product.sanity_project_id,
  steps,
  contextChain,
  product.dataset ?? undefined,   // ← new param
);
```

After execution succeeds, write `preview_url`:

```ts
import { createPreviewSecret } from '@sanity/preview-url-secret';

// After execution_records update to COMPLETED:
const previewUrl = await generatePreviewUrl(product.sanity_project_id, product.dataset).catch(() => null);
if (previewUrl) {
  await adminClient.from('execution_records').update({ preview_url: previewUrl }).eq('id', execution.id);
}
```

### Preview URL generation helper

```ts
async function generatePreviewUrl(projectId: string, dataset?: string | null): Promise<string | null> {
  const secret = process.env.SANITY_PREVIEW_SECRET;
  if (!secret) return null;
  const client = getSanityClient(projectId, dataset ?? undefined);
  // createPreviewSecret requires the secret and a redirect path
  // redirectTo defaults to '/' since we don't have a page-specific slug at this point
  return createPreviewSecret(client, {
    secret,
    redirectTo: '/',
    expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 2), // 2hr
  });
}
```

---

## Implementation Steps

1. Write `supabase/migrations/028_projects_vercel_dataset.sql`:
   ```sql
   alter table projects
     add column if not exists dataset text,
     add column if not exists vercel_project_id text;
   ```
2. Run `pnpm add @sanity/preview-url-secret`
3. Add to `env.example`:
   ```
   # Robot account (automation@webriq.com) — Editor on all Sanity client projects
   # Setup: create account → add to projects → generate token from sanity.io/manage
   SANITY_GLOBAL_TOKEN=
   # Sanity Presentation Tool preview secret (2hr expiry for draft preview URLs)
   SANITY_PREVIEW_SECRET=
   ```
4. Rewrite `src/lib/sanity/index.ts`:
   - Remove: `SanityMutationSchema`, `SanityMutation`, `buildExecutionPrompt`, `fetchSanityContext`, `STACKSHIFT_SCHEMA`, `capturePreState`, `capturePostState`, `applyMutations`, `isRetryable`
   - Add: `experimental_createMCPClient` import from `'ai'`
   - Add: `EXECUTION_SYSTEM_PROMPT` constant
   - Add: `buildMCPPrompt(projectId, dataset, steps, contextChain)` helper — constructs the user prompt with project context
   - Replace: `executeSanityPlan()` body with MCP-based implementation (see Code Context above)
   - Update: `getSanityClient()` to accept `dataset?` param and prefer `SANITY_GLOBAL_TOKEN`
   - Keep: `revertSanityExecution()`, `PartialExecutionError`, `SanityExecutionResult`, `PlanStep`
5. Update `src/app/api/execution/route.ts`:
   - Add `dataset` to the `projects` select in `executeSanity()`
   - Pass `dataset` to `executeSanityPlan()`
   - Add `generatePreviewUrl()` helper and call after COMPLETED update
6. Update `src/types/database.ts` for `projects` (add `dataset`, `vercel_project_id`)
7. Run `npx tsc --noEmit`

---

## Acceptance Criteria

- [ ] `executeSanityPlan()` uses `experimental_createMCPClient` with `type: 'http'` transport
- [ ] `SANITY_GLOBAL_TOKEN` used as bearer token; `SANITY_API_TOKEN` is fallback for `getSanityClient()`
- [ ] MCP client is always closed in a `finally` block
- [ ] `SANITY_GLOBAL_TOKEN` and `SANITY_PREVIEW_SECRET` in `env.example`
- [ ] `projects` table has `dataset` and `vercel_project_id` columns
- [ ] Preview URL written to `execution_records.preview_url` after successful execution
- [ ] `revertSanityExecution()` and `getSanityClient()` still work (REST path intact)
- [ ] `npx tsc --noEmit` exits 0

## Verification

```bash
pnpm install
npx tsc --noEmit
# Manual test: trigger an execution against a Sanity-connected customer
# → verify execution completes and execution_records.preview_url is populated
# → verify MCP connection closes (no hung connections in logs)
```

## Implementation Notes

> **Simplify Review:** PASS
> **Reviewed:** 2026-06-19

### What was built
`executeSanityPlan()` rewritten to use `createMCPClient` (from `@ai-sdk/mcp`) with Streamable HTTP transport to `mcp.sanity.io`. MCP client always closed in `finally`. `getSanityClient()` updated to prefer `SANITY_GLOBAL_TOKEN`. Preview URL generated via `createPreviewSecret` after successful execution and written to `execution_records.preview_url`. Migration 028 adds `dataset` and `vercel_project_id` to `projects`. TypeScript types updated.

### How to access for testing
- Trigger a Sanity execution via `POST /api/execution`
- Check `execution_records.preview_url` in Supabase dashboard
- MCP client closure verified by absence of hung connections

### Deviations from plan
- **Medium:** `createMCPClient` imported from `@ai-sdk/mcp` (not `experimental_createMCPClient` from `ai`) — the latter doesn't exist in `ai@6.0.168`; `@ai-sdk/mcp` re-exports it as stable alias.
- **Medium:** `stopWhen: stepCountIs(10)` used instead of `maxSteps: 10` — ai@6 API change, documented.
- **Medium:** `createPreviewSecret` signature differs from task doc (takes `(client, source, studioUrl)` not an options object); preview token stored in `preview_url` column since full URL requires client frontend base URL not yet available.

### Standards check
Pass — `logLLMInvocation` called after `generateText`, MCP client closed in `finally`, `SANITY_GLOBAL_TOKEN` never exposed client-side, `revertSanityExecution` and `getSanityClient` kept intact.

### Convention check
Pass — `getModel('execution')` used (not hard-coded model ID), `@sanity/client` kept for REST operations (preview URL + revert), MCP connection is server-only.

---

## Notes for Implementation Agent

- This task is sonnet-recommended: replaces a 300-line REST execution layer with MCP, architectural change, involves a new experimental AI SDK API (`experimental_createMCPClient`), and the MCP tools are opaque until runtime.
- `experimental_createMCPClient` is from the `ai` package (Vercel AI SDK). The transport type is `'http'` (NOT `'sse'` — Sanity uses Streamable HTTP, SSE returns 405).
- The `EXECUTION_SYSTEM_PROMPT` must include the rule "never call `publish_documents` automatically" — human approval triggers publish, not the execution path.
- `SanityExecutionResult.pre_action_states` and `post_action_states` will be empty objects after this change — MCP tools manage their own state. The orchestration UI that reads these will show empty. That's acceptable for this transition.
- `@sanity/preview-url-secret`'s `createPreviewSecret` requires a Sanity client (REST) — this is why `getSanityClient()` must be kept even after MCP migration.
- Do not throw if preview URL generation fails — log and continue; leave `preview_url` null.
- The `dataset` parameter passed to `mcp.sanity.io` is handled by the MCP server based on the token's project scope — you don't need to pass it explicitly in the MCP connection. It's needed for `getSanityClient()` (preview URL) only.
