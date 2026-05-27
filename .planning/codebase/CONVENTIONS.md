# CONVENTIONS.md — Code Style & Patterns

> Last mapped: 2026-05-27

## TypeScript

- **Strict mode** — `tsconfig.json` has `"strict": true`
- **Path aliases** — `@/` maps to `src/`
- **Type-first** — all DB operations use `Database` type from `src/types/database.ts`; Zod schemas infer types
- **No `any`** — use `unknown` at boundaries, then narrow
- **Type assertions** — only when narrowing is not possible; prefer `satisfies` operator

## File & Directory Naming

| Pattern | Convention | Example |
|---------|-----------|---------|
| Source files | `kebab-case.ts/tsx` | `model-config.ts`, `hub-sidebar.tsx` |
| React components | `kebab-case.tsx`, export default `PascalCase` | `form-engine.tsx` → `FormEngine` |
| React hooks | `use-kebab-case.ts`, export `useKebabCase` | `use-auto-save.ts` → `useAutoSave` |
| API routes | `route.ts` per directory | `src/app/api/plan/route.ts` |
| Types files | PascalCase type names | `OrchestrationLayer`, `TaskPriority` |
| Constants | `SCREAMING_SNAKE_CASE` | `ROUTES`, `LLM_PRICING` |
| Functions | `camelCase` | `classifyTask`, `logLLMInvocation` |

## Component Patterns

### "use client" Placement
- Server Components by default (no directive needed)
- Add `"use client"` only when using hooks, event handlers, or browser APIs
- Split server/client: `page.tsx` (server) + `client.tsx` (client) when data fetching is needed server-side but UI needs interactivity

### Page-Scoped Components
- Inline small components into the page file rather than extracting to `src/components/`
- Only extract when a component is shared across multiple pages
- Example: `StatusBadge`, `PriorityChip` defined inside `orchestration/page.tsx`

### Props Interface Pattern
```typescript
interface ComponentNameProps {
  required: string;
  optional?: number | null;
}

export default function ComponentName({ required, optional }: ComponentNameProps) { ... }
```

## Styling Conventions

### Always Tailwind, Never `style={{}}`
```typescript
// ✅ Correct
<div className="flex items-center gap-2 text-sm text-muted-foreground">

// ❌ Wrong
<div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
```

### Dynamic Classes — Static Lookup Maps
```typescript
// ✅ Correct — Tailwind can tree-shake complete strings
const STATUS_CLASSES = {
  CLEAR: "text-green-600",
  PARTIAL: "text-yellow-700",
  BLOCKED: "text-red-600",
};
const cls = STATUS_CLASSES[status] ?? "text-gray-500";

// ❌ Wrong — Tailwind can't tree-shake dynamic construction
const cls = `text-${color}-600`;
```

### `cn()` for Conditional Classes
```typescript
import { cn } from "@/lib/utils";

<div className={cn(
  "base-class other-class",
  condition && "conditional-class",
  variant === "active" ? "active-class" : "inactive-class"
)}>
```

### Tailwind Scale Over Arbitrary Values
```typescript
// ✅ Prefer
className="py-6.5 w-14 h-10 mt-3"

// ❌ Avoid
className="py-[26px] w-[56px] h-[40px] mt-[12px]"
```

## API Route Patterns

### Standard Authenticated Route
```typescript
export async function POST(req: NextRequest) {
  // 1. Auth
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // 2. Validate
  const parsed = Schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "..." }, { status: 400 });

  // 3. Business logic
  const result = await libFunction(parsed.data);
  if (!result) return NextResponse.json({ error: "..." }, { status: 500 });

  // 4. Return
  return NextResponse.json(result);
}
```

### Public Routes (adminClient Exception)
```typescript
// adminClient used — customers have no session on (public) routes.
// Documented exception per CLAUDE.md.
const result = await adminClient.from("...").select("...");
```

## AI Call Pattern

All LLM calls follow this pattern in `src/lib/ai/`:

```typescript
const start = Date.now();
const [model, config] = await Promise.all([
  getModel("classification"),
  getModelConfig("classification"),
]);

const { object, usage } = await generateObject({ model, schema, prompt });

await logLLMInvocation({
  layer: "classification",
  modelUsed: config.model_id,
  inputTokens: usage.promptTokens,
  outputTokens: usage.completionTokens,
  durationMs: Date.now() - start,
  customerId,
});
```

**Key rules:**
- Always use `getModel(layer)` — never hardcode model IDs
- Always call `logLLMInvocation()` after every LLM call (non-fatal)
- Sprint 3+ Sonnet prompts: always call `buildContextChain(classificationId)` first

## Zod Validation

```typescript
const Schema = z.object({
  classificationId: z.string().uuid(),
  customerId: z.string().min(1),
  action: z.enum(["approve", "reject"]),
});

const parsed = Schema.safeParse(body);
if (!parsed.success) {
  return NextResponse.json({ error: "Validation failed", issues: parsed.error.issues }, { status: 400 });
}
```

## Supabase Client Selection

| Context | Client | Why |
|---------|--------|-----|
| Server component / API route (user session) | `createClient()` from `@/lib/supabase/server` | Reads cookies, respects RLS |
| Client component | `createClient()` from `@/lib/supabase/client` | Browser singleton |
| Webhook handlers, pg_cron, public onboarding | `adminClient` from `@/lib/supabase/admin` | No session available |
| Regular reads in API routes | `createClient()` (server) | RLS enforced — prefer over adminClient |

## Realtime Subscriptions

Pattern for Supabase realtime in page components:

```typescript
useEffect(() => {
  const supabase = createClient();
  let cancelled = false;

  function fetchData() { ... }
  fetchData();

  const channel = supabase
    .channel("unique_channel_name")
    .on("postgres_changes", { event: "*", schema: "public", table: "table_name" }, fetchData)
    .subscribe();

  return () => {
    cancelled = true;
    supabase.removeChannel(channel);
  };
}, []);
```

## Status/Enum Casing

| Field | Values | Casing |
|-------|--------|--------|
| `llm_eligible` | `YES`, `NO`, `HUMAN_ONLY` | UPPERCASE |
| `priority` | `CRITICAL`, `HIGH`, `NORMAL`, `LOW` | UPPERCASE (NORMAL not MEDIUM) |
| `plan_status` | `PENDING_APPROVAL`, `APPROVED`, `REJECTED`, `EXECUTING`, `COMPLETE`, `FAILED` | UPPERCASE |
| `assessment_status` | `CLEAR`, `PARTIAL`, `BLOCKED` | UPPERCASE |
| `task_status` | `pending`, `classifying`, `classified`, etc. | lowercase |
| `classification_status` | `pending`, `reviewed`, `rejected` | lowercase |
| `user_role` | `admin`, `pm`, `developer`, `client` | lowercase |
| `playbook_status` | `ACTIVE`, `STALE`, `ARCHIVED` | UPPERCASE |

## Error Handling

- API routes: return `NextResponse.json({ error: "..." }, { status: N })` — never throw
- AI calls: `logLLMInvocation()` is non-fatal (logs to stderr, never throws)
- Zoho calls: non-blocking — Zoho failure does not fail the approve action; `zoho_task_id` stays `null`
- Never skip `logLLMInvocation()` even on error paths

## Comments

- Default: **no comments**
- Only add when the WHY is non-obvious: hidden constraint, subtle invariant, framework quirk
- One short line max — no multi-paragraph blocks
- Exception pattern example:
  ```typescript
  // adminClient used — customers have no session on (public) routes.
  ```

## `"use server"` Directive

Only for React Server Actions (functions called from client components). Never add to:
- Utility modules
- API route helpers
- Library functions
