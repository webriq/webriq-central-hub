# TESTING.md — Test Structure & Practices

> Last mapped: 2026-05-27

## Test Framework

**None configured.** No test runner (Jest, Vitest, Playwright, Cypress) is set up in this project.

There are no test files in `src/` — only tests in `node_modules/` (third-party packages).

## Verification Approach

Per CLAUDE.md, verification is done via two methods:

### 1. TypeScript Type Check
```bash
npx tsc --noEmit
```
Catches type errors across the entire codebase. Run before treating any implementation as complete.

### 2. Browser-Based Acceptance Testing
Manual testing in the browser at `http://localhost:3000`. Start the dev server:
```bash
pnpm dev
```

There is no automated test suite. All functional verification is manual.

## Type Safety as Testing

The codebase uses TypeScript strict mode as the primary correctness mechanism:

- **`Database` type** (`src/types/database.ts`) — full Supabase schema typed; any column mismatch is a compile error
- **Zod schemas** — runtime validation at all API boundaries; `safeParse` with explicit error handling
- **`OrchestrationLayer`** type — string literal union prevents invalid layer names reaching `llm_config` lookup
- **Status enums** — typed as string literal unions in `src/types/hub.ts`

## Testing Constraints

- No mocking setup — no DI container, no injectable clients
- `adminClient` is a module-level singleton; cannot be easily mocked without Jest module mocking
- Supabase operations are coupled to live DB in all current code paths

## What Should Be Tested (Future)

If a test runner is added, priority areas:

1. **`classifyTask()`** — AI prompt construction, schema validation of LLM output
2. **`buildContextChain()`** — context string format correctness
3. **API route input validation** — Zod schema edge cases
4. **`computeLLMCost()`** — pricing calculation correctness
5. **`generateId()`** — `WRQ-CLIENT-XXXX` format validation
6. **Onboarding form completion %** — `useOnboardingForm` hook logic

## Recommended Test Stack (If Added)

```json
{
  "vitest": "^1.0.0",
  "@testing-library/react": "^14.0.0",
  "msw": "^2.0.0"
}
```

- **Vitest** — compatible with Vite/Next.js, fast, native TypeScript
- **Testing Library** — component testing
- **MSW** — mock Supabase/Zoho API calls at the network layer (better than mocking modules)

## Lint

```bash
pnpm lint
```

ESLint 9 with `eslint-config-next@16.2.4`. No custom rules beyond Next.js defaults.
