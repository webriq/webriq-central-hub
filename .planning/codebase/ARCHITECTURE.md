# ARCHITECTURE.md — System Design & Patterns

> Last mapped: 2026-05-27

## Architectural Pattern

**AI-Powered Operations Platform** — a hub layer that sits above Zoho, Sanity, GitHub, and Supabase. It does not replace these tools; it synthesizes data from them into a unified AI orchestration pipeline.

### Layered Architecture

```
┌─────────────────────────────────────────────────────┐
│             Next.js App Router (UI Layer)            │
│  (hub) auth-gated │ (auth) login │ (public) forms    │
├─────────────────────────────────────────────────────┤
│               API Routes (/api/*)                    │
│  Zod validation → auth check → lib function → DB    │
├─────────────────────────────────────────────────────┤
│         AI Orchestration Pipeline (lib/ai/)          │
│  classify → assess → plan → execute → digest/reply  │
├─────────────────────────────────────────────────────┤
│              Data Layer (Supabase/Postgres)          │
│  customers → classification → assessment → plan →   │
│  execution → llm_invocation_logs                    │
├─────────────────────────────────────────────────────┤
│        External Integrations (lib/zoho, etc.)        │
│  Zoho Projects │ Zoho Desk │ Zoho Cliq │ Sanity(stub)│
└─────────────────────────────────────────────────────┘
```

## AI Pipeline (Core Business Logic)

The orchestration pipeline is **PM-triggered** (not automatic). Each stage inserts into Supabase:

```
Webhook / Manual input
       ↓
[classification] → classification_records
       ↓ (PM clicks "Run Assessment")
[assessment]    → requirements_assessments (CLEAR/PARTIAL/BLOCKED + subtasks)
       ↓ (PM approves)
[planning]      → implementation_plans (PENDING_APPROVAL → APPROVED → EXECUTING → COMPLETE)
       ↓ (plan approved → non-blocking)
[zoho sync]     → zoho_task_id on implementation_plans
       ↓
[execution]     → execution_records (Sprint 5)
       ↓
[digest/reply]  → digest_logs, reply_logs
```

**Context chain:** `buildContextChain(classificationId)` in `src/lib/ai/context-chain.ts` assembles customer + task context string for every Sonnet prompt. Always called before Sprint 3+ Sonnet invocations — never rebuilt inline.

**All LLM calls:** must call `logLLMInvocation()` after completion, writing to `llm_invocation_logs`.

## Route Group Architecture

Three distinct route groups with separate layouts and auth behavior:

| Group | Path | Auth | Layout |
|-------|------|------|--------|
| `(hub)` | `/pm`, `/orchestration`, `/classification`, etc. | Yes — `getClaims()` redirect to `/signin` | Sidebar + header |
| `(auth)` | `/signin`, `/signup` | No | Minimal |
| `(public)` | `/onboarding/[customerId]` | No | Minimal |

Route groups are URL-invisible — `/onboarding/[customerId]` resolves to `(public)/onboarding/[customerId]/page.tsx`.

## Auth Flow

1. User visits `(hub)` page → `HubLayout` calls `supabase.auth.getClaims()` → redirects to `/signin` if not authenticated
2. "Sign in with Zoho" → Supabase custom OIDC provider `custom:zoho` → `/api/auth/callback` PKCE exchange
3. `hub_users` table stores role (`admin | pm | developer | client`), display name, Zoho user ID
4. Session refresh: `proxy.ts` (Next.js 16 convention) — refreshes on every request

## Onboarding Form Engine (Public Route)

Schema-driven form for customers with no session:
- `onboarding-schemas.ts` → per-product `FormSchema` (sections → fields → conditional logic)
- `FormEngine` component reads schema, manages navigation, wires `useOnboardingForm` + `useAutoSave`
- `useAutoSave` (2s debounce) → `PATCH /api/customers/[customerId]/products/[productName]/onboarding`
- API uses `adminClient` (documented exception — customers have no session)
- Sets `onboarding_complete: true` when `completedPercentage >= 100`

## Data Model (Key Tables)

```
customers (customer_id TEXT — universal key across all systems: WRQ-CLIENT-XXXX)
  └── customer_products (zoho_project_id, onboarding_data JSON, completed_percentage)

classification_records (source, task_type, llm_eligible: YES|NO|HUMAN_ONLY, status)
  └── requirements_assessments (subtasks JSON, assessment_status: CLEAR|PARTIAL|BLOCKED)
       └── implementation_plans (status: PENDING_APPROVAL|APPROVED|..., zoho_task_id)
            └── execution_records (outcome: SUCCESS|PARTIAL|FAILED)

llm_invocation_logs (cost_usd, input_tokens, output_tokens, orchestration_layer)
hub_users (id=supabase auth UUID, role, display_name, zoho_user_id)
llm_config (orchestration_layer, provider: anthropic|openai, model_id, is_active)
```

**`customer_id` (TEXT) is the universal key** across all systems — format `WRQ-CLIENT-XXXX`. Never use UUID for cross-system references.

## API Route Pattern

Consistent pattern across all API routes:

```typescript
// 1. Auth check
const supabase = await createClient();
const { data: { user } } = await supabase.auth.getUser();
if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

// 2. Zod validation
const parsed = Schema.safeParse(await req.json());
if (!parsed.success) return NextResponse.json({ error: "..." }, { status: 400 });

// 3. Business logic (lib/ function)
const result = await libFunction(parsed.data);

// 4. Return JSON
return NextResponse.json(result);
```

## Key Abstractions

| Abstraction | Location | Purpose |
|-------------|----------|---------|
| `getModel(layer)` | `src/lib/ai/model-config.ts` | DB-driven model resolution with 5-min cache |
| `logLLMInvocation()` | `src/lib/ai/logger.ts` | Cost attribution, non-fatal |
| `buildContextChain()` | `src/lib/ai/context-chain.ts` | Assembles customer+task context for Sonnet |
| `getLanguageModel()` | `src/lib/ai/providers.ts` | AI SDK provider factory (anthropic/openai) |
| `cn()` | `src/lib/utils.ts` | Tailwind class merging |
| `adminClient` | `src/lib/supabase/admin.ts` | Service role, server-only |

## Entry Points

- **Web:** `src/app/layout.tsx` → root layout (fonts, metadata, PWA manifest)
- **Hub home:** `src/app/page.tsx` — module navigation cards
- **Auth guard:** `src/app/(hub)/layout.tsx` — `getClaims()` check
- **Session refresh:** `proxy.ts` — runs on every request
- **Webhook:** `src/app/api/webhooks/route.ts` — HMAC-verified Zoho events
