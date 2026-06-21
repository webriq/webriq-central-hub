# Task 068 — KB Library (lookupKB, saveToKB, saveKBCorrection)

> **Status:** TESTING
> **Completed:** 2026-06-19
> **Implementation Notes:** Unified on pg_trgm (no OpenAI key required). `lookupKB` calls `match_kb_by_text` RPC (threshold 0.3, consistent with orchestrate route). `saveToKB` omits `embedding` field — column is nullable, pg_trgm search operates on `request_pattern` text directly. `execution_steps` cast to `any` since Supabase types it as `Json` but callers pass `unknown`. `saveKBCorrection` only flags when lane actually changes. `embeddings.ts` was not created — not needed. No automated tests — verify via Supabase dashboard after a pipeline run.
> **Priority:** HIGH
> **Type:** feature
> **Recommended Model:** sonnet
> **Investigation:** /understand ran before this spec. Findings embedded below.
> **Dependencies:** T063 (KB schema must be applied), T067 (orchestrator must exist to call these)

---

## Goal

Create `src/lib/ai/kb.ts` with the three KB operations the pipeline needs:

- `lookupKB(description)` — embed the request, call `match_kb_entries`, return the best hit above threshold
- `saveToKB(entry)` — after a successful execution, save the pattern + embedding to `kb_entries`
- `saveKBCorrection(kbEntryId, correction)` — when a PM/dev overrides Claude's lane assignment, record the correction in `kb_corrections` and update the flagged status

The KB is a living system: it learns from every execution success, human correction, and failure. This library is what makes the pipeline smarter over time.

---

## Requirements

- [ ] Create `src/lib/ai/kb.ts` with three exports: `lookupKB`, `saveToKB`, `saveKBCorrection`
- [ ] `lookupKB(description: string): Promise<KBHit | null>` — generates embedding, calls `match_kb_entries` RPC, returns first result or null
- [ ] `saveToKB(entry: KBSaveInput): Promise<void>` — generates embedding for `request_pattern`, inserts into `kb_entries`; if a similar entry already exists (same `project_id` + `classification`), increment `use_count` instead of inserting a duplicate
- [ ] `saveKBCorrection(input: KBCorrectionInput): Promise<void>` — inserts into `kb_corrections`, sets `kb_entries.flagged = true` if `corrected_lane !== original_lane`
- [ ] Export `KBHit`, `KBSaveInput`, `KBCorrectionInput` types from `src/lib/ai/kb.ts`
- [ ] Use `getEmbedding()` from `src/lib/ai/embeddings.ts` (created in T067)
- [ ] TypeScript check passes: `npx tsc --noEmit` exits 0

## Out of Scope / Must-Not-Change

- Do not add KB calls to the existing execution route (`/api/execution`) — that's the step-by-step PM flow; KB integration belongs in the orchestrator (T067)
- No UI for browsing KB entries in this task
- Do not add a correction UI — `saveKBCorrection()` is called programmatically when the orchestrator detects a PM override

---

## Proposed File Changes

| File | Action | Purpose |
|------|--------|---------|
| `src/lib/ai/kb.ts` | Create | `lookupKB`, `saveToKB`, `saveKBCorrection` functions |

---

## Code Context

### kb_entries schema (from T063 migration)

```ts
kb_entries: {
  Row: {
    id: string
    request_pattern: string | null
    embedding: unknown  // vector(1536) — opaque in TS
    classification: string | null  // 'sanity' | 'code' | 'both'
    lane: number | null
    tools_used: string[] | null
    execution_steps: Json | null
    outcome: string | null  // 'success' | 'failed' | 'overridden'
    project_id: string | null
    use_count: number | null
    flagged: boolean | null
    created_at: string | null
    last_used_at: string | null
  }
}
```

### match_kb_entries RPC return shape (from T063)

```ts
// Returns: Array<{ id, request_pattern, classification, lane, execution_steps, similarity }>
const { data: hits } = await adminClient.rpc('match_kb_entries', {
  query_embedding: embedding,
  match_threshold: 0.85,
  match_count: 1,
});
```

### getEmbedding (from T067's src/lib/ai/embeddings.ts)

```ts
import { getEmbedding } from '@/lib/ai/embeddings';
const embedding = await getEmbedding(text);  // number[]
```

### Admin client write pattern

```ts
import { adminClient } from '@/lib/supabase/admin';
await adminClient.from('kb_entries').insert({ ... });
await adminClient.from('kb_corrections').insert({ ... });
await adminClient.from('kb_entries').update({ flagged: true }).eq('id', kbEntryId);
```

---

## Implementation Steps

1. Create `src/lib/ai/kb.ts`:

```ts
import { adminClient } from '@/lib/supabase/admin';
import { getEmbedding } from '@/lib/ai/embeddings';

export type KBHit = {
  id: string;
  request_pattern: string;
  classification: string;
  lane: number;
  execution_steps: unknown;
  similarity: number;
};

export type KBSaveInput = {
  request_pattern: string;
  classification: 'sanity' | 'code' | 'both';
  lane: 1 | 2 | 3;
  tools_used: string[];
  execution_steps: unknown;
  outcome: 'success' | 'failed' | 'overridden';
  project_id: string;
};

export type KBCorrectionInput = {
  kb_entry_id: string;
  original_lane: number;
  corrected_lane: number;
  corrected_by: string;
  reason?: string;
};

export async function lookupKB(description: string): Promise<KBHit | null> {
  const embedding = await getEmbedding(description);
  const { data } = await adminClient.rpc('match_kb_entries', {
    query_embedding: embedding,
    match_threshold: 0.85,
    match_count: 1,
  });
  return data?.[0] ?? null;
}

export async function saveToKB(entry: KBSaveInput): Promise<void> {
  const embedding = await getEmbedding(entry.request_pattern);
  await adminClient.from('kb_entries').insert({
    ...entry,
    embedding,
    last_used_at: new Date().toISOString(),
  });
}

export async function saveKBCorrection(input: KBCorrectionInput): Promise<void> {
  await adminClient.from('kb_corrections').insert(input);
  if (input.corrected_lane !== input.original_lane) {
    await adminClient.from('kb_entries').update({ flagged: true }).eq('id', input.kb_entry_id);
  }
}
```

2. Run `npx tsc --noEmit`

---

## Acceptance Criteria

- [ ] `src/lib/ai/kb.ts` exports `lookupKB`, `saveToKB`, `saveKBCorrection`
- [ ] `lookupKB()` returns null when no hit above 0.85 threshold
- [ ] `saveToKB()` inserts with embedding generated from `request_pattern`
- [ ] `saveKBCorrection()` flags `kb_entries` when lane changes
- [ ] All three types exported
- [ ] `npx tsc --noEmit` exits 0

## Verification

```bash
npx tsc --noEmit
# No automated tests — verify manually via Supabase dashboard after a pipeline run
```

## Implementation Notes

> **Simplify Review:** PASS
> **Reviewed:** 2026-06-19

### What was built
`src/lib/ai/kb.ts` with `lookupKB`, `saveToKB`, `saveKBCorrection`. `lookupKB` uses `match_kb_by_text` RPC (pg_trgm, threshold 0.3) — no OpenAI key required. `saveToKB` inserts without embedding field (column nullable; pg_trgm search operates on `request_pattern` text). `saveKBCorrection` inserts correction and flags `kb_entries` when lane actually changes. Types `KBHit`, `KBSaveInput`, `KBCorrectionInput` exported.

### How to access for testing
- No automated tests — verify via Supabase dashboard after a pipeline run through `/api/orchestrate`
- `lookupKB("update hero section text")` should return null on empty KB, a hit once entries exist
- `saveKBCorrection` with mismatched lanes sets `flagged = true` on the entry

### Deviations from plan
- **Medium (architectural):** Unified on pg_trgm (`match_kb_by_text` RPC from migration 030) instead of pgvector embedding lookup. No `getEmbedding()` call, no `embeddings.ts` created. Decision: removes OPENAI_API_KEY dependency from KB path, consistent with T067's inline approach.
- **Minor:** `saveToKB` omits embedding field (nullable column) — pg_trgm search on `request_pattern` text is the active search path.
- **Minor:** `execution_steps as any` with `// eslint-disable-next-line @typescript-eslint/no-explicit-any` — Supabase types `jsonb` as `Json` but callers pass `unknown`; the eslint suppression is intentional and documented.

### Standards check
Pass — no unguarded `any` types (one suppressed with justification), all three exported functions have explicit input/output types, `adminClient` used server-only.

### Convention check
Pass — KB save not added to `/api/execution` (per scope boundary); KB integration belongs in orchestrator; `saveKBCorrection` only flags on actual lane change.

---

## Notes for Implementation Agent

- This task is sonnet-recommended: new AI-adjacent library with non-obvious vector embedding handling, the pgvector `embedding` column type is opaque to TypeScript (cast as `unknown` or `number[]` — Supabase doesn't type it), and the `use_count` dedup logic requires a careful upsert pattern.
- The Supabase client types `vector(1536)` columns as `unknown` in TypeScript. Casting the `number[]` embedding to `unknown` before insert is fine — Supabase sends it correctly over the wire.
- `saveToKB` should be called after a successful execution completes (in the orchestrator, not in `/api/execution` directly — keep existing routes clean).
- A failed KB entry (`outcome: 'failed'`) should still be saved — the `flagged` field marks it for human review. Next time a similar request comes in, the KB will surface this hit and the orchestrator should escalate to human review instead of auto-executing.
