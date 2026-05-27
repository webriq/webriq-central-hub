# Task 028 — Sprint 5: Reply Generation (M8)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Auto-generate a PM-editable Cliq reply draft when an execution completes (M8).

**Architecture:** On execution COMPLETED, a non-blocking call to `POST /api/reply` asks Haiku (`reply` layer) to draft a client-facing update using the classification context + `what_was_done` summary. The PM reviews the draft in the orchestration panel, optionally edits it, then sends via Zoho Cliq.

**Tech Stack:** Vercel AI SDK `generateText`, Zod, Supabase `adminClient`, Zoho Cliq webhook

**Prerequisite:** Task 027 (execution engine) must be complete — the reply trigger is a non-blocking `fetch` inside `/api/execution`.

---

## File Map

| File | Action | Responsibility |
|------|--------|----------------|
| `supabase/migrations/015_reply_drafts.sql` | Create | New `reply_drafts` table + RLS |
| `src/lib/ai/reply.ts` | Create | `generateReplyDraft()` — Haiku generation + DB insert |
| `src/app/api/reply/route.ts` | Create | POST — generate Haiku reply draft (internal trigger) |
| `src/app/api/reply/[id]/route.ts` | Create | PATCH — discard a reply draft |
| `src/app/api/reply/[id]/send/route.ts` | Create | POST — send draft via Cliq |
| `src/types/database.ts` | Modify | Add `reply_drafts` table types + `ReplyDraftRow` export |
| `src/app/(hub)/orchestration/page.tsx` | Modify | Add Reply Draft section to task detail panel |

> **No test runner is configured.** Each task validates with `npx tsc --noEmit` plus the browser acceptance test in the final task.

---

## Part 2: Task 028 — Reply Generation (M8)

### Task 8: Migration 015 — reply_drafts table

**Files:**
- Create: `supabase/migrations/015_reply_drafts.sql`

- [ ] **Step 1: Create the migration file**

```sql
-- WebriQ Central Hub — Sprint 5
-- Migration 015: Reply drafts — PM-reviewed client updates before Cliq send (M8)

create table if not exists reply_drafts (
  id                  uuid primary key default gen_random_uuid(),
  classification_id   text not null
                        references classification_records(id) on delete cascade,
  customer_id         text not null
                        references customers(customer_id) on delete cascade,
  execution_record_id uuid
                        references execution_records(id) on delete cascade,
  draft_content       text not null,
  pm_edited_content   text,
  pm_diff             text,
  status              text not null default 'DRAFT'
                        check (status in ('DRAFT', 'SENT', 'DISCARDED')),
  sent_at             timestamptz,
  created_at          timestamptz not null default now()
);

create index if not exists idx_reply_drafts_classification_id
  on reply_drafts (classification_id);

create index if not exists idx_reply_drafts_customer_id
  on reply_drafts (customer_id);

alter table reply_drafts enable row level security;

create policy "authenticated_read_reply_drafts"
  on reply_drafts for select to authenticated using (true);

create policy "authenticated_write_reply_drafts"
  on reply_drafts for all to authenticated using (true) with check (true);
```

- [ ] **Step 2: Apply in Supabase Dashboard**

Paste and run in SQL Editor. Verify the `reply_drafts` table appears in Table Editor.

---

### Task 9: Update database types — reply_drafts

**Files:**
- Modify: `src/types/database.ts`

- [ ] **Step 1: Add reply_drafts table block**

Find the `execution_records` closing block (`};` after its `Relationships`) and insert the new block immediately after it:

```typescript
      reply_drafts: {
        Row: {
          id: string;
          classification_id: string;
          customer_id: string;
          execution_record_id: string | null;
          draft_content: string;
          pm_edited_content: string | null;
          pm_diff: string | null;
          status: string;
          sent_at: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          classification_id: string;
          customer_id: string;
          execution_record_id?: string | null;
          draft_content: string;
          pm_edited_content?: string | null;
          pm_diff?: string | null;
          status?: string;
          sent_at?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          classification_id?: string;
          customer_id?: string;
          execution_record_id?: string | null;
          draft_content?: string;
          pm_edited_content?: string | null;
          pm_diff?: string | null;
          status?: string;
          sent_at?: string | null;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "reply_drafts_classification_id_fkey";
            columns: ["classification_id"];
            isOneToOne: false;
            referencedRelation: "classification_records";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "reply_drafts_customer_id_fkey";
            columns: ["customer_id"];
            isOneToOne: false;
            referencedRelation: "customers";
            referencedColumns: ["customer_id"];
          },
          {
            foreignKeyName: "reply_drafts_execution_record_id_fkey";
            columns: ["execution_record_id"];
            isOneToOne: false;
            referencedRelation: "execution_records";
            referencedColumns: ["id"];
          }
        ];
      };
```

- [ ] **Step 2: Add export type near the bottom of the file** (after `export type ExecutionRecordRow = ...`):

```typescript
export type ReplyDraftRow = Database["public"]["Tables"]["reply_drafts"]["Row"];
```

- [ ] **Step 3: TypeScript check**

```bash
npx tsc --noEmit
```

---

### Task 10: Reply generation API — POST /api/reply

**Files:**
- Create: `src/app/api/reply/route.ts`

- [ ] **Step 1: Create the file**

```typescript
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { adminClient } from "@/lib/supabase/admin";
import { buildContextChain } from "@/lib/ai/context-chain";
import { getModel, getModelConfig } from "@/lib/ai/model-config";
import { logLLMInvocation } from "@/lib/ai/logger";
import { generateText } from "ai";

const PostSchema = z.object({
  classificationId: z.string().min(1),
  customerId: z.string().min(1),
  executionRecordId: z.string().uuid(),
  whatWasDone: z.string().min(1),
});

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const parsed = PostSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const { classificationId, customerId, executionRecordId, whatWasDone } = parsed.data;

  const { data: customer } = await adminClient
    .from("customers")
    .select("communication_tone, contact_name")
    .eq("customer_id", customerId)
    .maybeSingle();

  const tone = customer?.communication_tone ?? "formal";
  const contactName = customer?.contact_name ?? "there";

  const toneInstructions: Record<string, string> = {
    formal: "Write in a professional, formal tone. Use complete sentences.",
    casual: "Write in a friendly, conversational tone. Keep it brief and warm.",
    technical: "Write in a concise, technical tone. Include relevant implementation details.",
  };

  const [model, config, contextChain] = await Promise.all([
    getModel("reply"),
    getModelConfig("reply"),
    buildContextChain(classificationId),
  ]);

  const systemPrompt = [
    "You are drafting a client-facing update for a PM to review before sending.",
    toneInstructions[tone] ?? toneInstructions.formal,
    `Address the client as "${contactName}". Do not include a subject line.`,
    "Keep the draft under 150 words.",
  ].join(" ");

  const userPrompt = [
    "Task context:",
    contextChain,
    "",
    "What was completed:",
    whatWasDone,
    "",
    "Draft a brief client update summarising what was done.",
  ].join("\n");

  const startMs = Date.now();
  const { text, usage } = await generateText({
    model,
    system: systemPrompt,
    prompt: userPrompt,
  });

  await logLLMInvocation({
    layer: "reply",
    customerId,
    modelUsed: config.model_id,
    inputTokens: usage.inputTokens,
    outputTokens: usage.outputTokens,
    durationMs: Date.now() - startMs,
    referenceId: classificationId,
    referenceType: "classification_record",
  });

  await adminClient.from("reply_drafts").insert({
    classification_id: classificationId,
    customer_id: customerId,
    execution_record_id: executionRecordId,
    draft_content: text,
    status: "DRAFT",
  });

  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 2: TypeScript check**

```bash
npx tsc --noEmit
```

---

### Task 11: Reply discard API — PATCH /api/reply/[id]

**Files:**
- Create: `src/app/api/reply/[id]/route.ts`

- [ ] **Step 1: Create the directory and file**

```bash
mkdir -p "src/app/api/reply/[id]"
```

Then create `src/app/api/reply/[id]/route.ts`:

```typescript
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { adminClient } from "@/lib/supabase/admin";

const PatchSchema = z.object({
  status: z.literal("DISCARDED"),
});

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const body = await req.json().catch(() => null);
  const parsed = PatchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  await adminClient.from("reply_drafts").update({ status: "DISCARDED" }).eq("id", id);
  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 2: TypeScript check**

```bash
npx tsc --noEmit
```

---

### Task 12: Reply send API — POST /api/reply/[id]/send

**Files:**
- Create: `src/app/api/reply/[id]/send/route.ts`

- [ ] **Step 1: Create the directory and file**

```bash
mkdir -p "src/app/api/reply/[id]/send"
```

Then create `src/app/api/reply/[id]/send/route.ts`:

```typescript
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { adminClient } from "@/lib/supabase/admin";
import { sendCliqNotification } from "@/lib/zoho";

const PostSchema = z.object({
  content: z.string().min(1),
});

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const body = await req.json().catch(() => null);
  const parsed = PostSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const { content } = parsed.data;

  const { data: draft } = await adminClient
    .from("reply_drafts")
    .select("id, draft_content, status")
    .eq("id", id)
    .maybeSingle();

  if (!draft) {
    return NextResponse.json({ error: "Draft not found" }, { status: 404 });
  }

  if (draft.status !== "DRAFT") {
    return NextResponse.json(
      { error: "Draft has already been sent or discarded" },
      { status: 409 }
    );
  }

  await sendCliqNotification(content, "pm");

  const wasEdited = content !== draft.draft_content;
  await adminClient
    .from("reply_drafts")
    .update({
      status: "SENT",
      sent_at: new Date().toISOString(),
      pm_edited_content: wasEdited ? content : null,
      pm_diff: wasEdited
        ? JSON.stringify({ before: draft.draft_content, after: content })
        : null,
    })
    .eq("id", id);

  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 2: TypeScript check**

```bash
npx tsc --noEmit
```

---

### Task 13: Orchestration page — Reply Draft section

**Files:**
- Modify: `src/app/(hub)/orchestration/page.tsx`

- [ ] **Step 1: Add ReplyDraftRow type import**

After `type ExecutionRecordRow = ...`, add:

```typescript
type ReplyDraftRow = Database["public"]["Tables"]["reply_drafts"]["Row"];
```

- [ ] **Step 2: Add reply drafts state to OrchestrationPage**

After `const [executions, setExecutions] = useState...`:

```typescript
const [replyDrafts, setReplyDrafts] = useState<Record<string, ReplyDraftRow>>({});
```

- [ ] **Step 3: Load reply drafts in the useEffect Promise.all**

Add after the executions and paused queries:

```typescript
supabase
  .from("reply_drafts")
  .select("*")
  .in("status", ["DRAFT", "SENT"])
  .order("created_at", { ascending: false }),
```

After setting `customerPaused`, add:

```typescript
const latestDraftByClassification: Record<string, ReplyDraftRow> = {};
for (const d of (replyDraftsResult.data ?? []) as ReplyDraftRow[]) {
  if (!latestDraftByClassification[d.classification_id]) {
    latestDraftByClassification[d.classification_id] = d;
  }
}
setReplyDrafts(latestDraftByClassification);
```

- [ ] **Step 4: Add ReplyDraftSection component**

Add after the closing `}` of `ExecutionSection`:

```tsx
function ReplyDraftSection({
  draft,
  onUpdate,
}: {
  draft: ReplyDraftRow | null;
  onUpdate: (d: ReplyDraftRow) => void;
}) {
  const [content, setContent] = useState(draft?.draft_content ?? "");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (draft?.draft_content) setContent(draft.draft_content);
  }, [draft?.draft_content]);

  if (!draft || draft.status === "DISCARDED") return null;

  const isSent = draft.status === "SENT";

  async function handleSend() {
    if (!draft) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/reply/${draft.id}/send`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content }),
      });
      if (!res.ok) {
        const data = await res.json();
        setError(data.error ?? "Send failed");
      } else {
        onUpdate({
          ...draft,
          status: "SENT",
          pm_edited_content: content !== draft.draft_content ? content : null,
        });
      }
    } catch {
      setError("Network error");
    } finally {
      setLoading(false);
    }
  }

  async function handleDiscard() {
    if (!draft) return;
    setLoading(true);
    try {
      await fetch(`/api/reply/${draft.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "DISCARDED" }),
      });
      onUpdate({ ...draft, status: "DISCARDED" });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mt-4 border-t border-black/5 pt-4">
      <div className="flex items-center gap-2 mb-2">
        <span className="text-[12px] font-semibold text-slate-700">Reply Draft</span>
        <span
          className={cn(
            "text-[11px] font-medium",
            isSent ? "text-green-600" : "text-blue-600"
          )}
        >
          {draft.status}
        </span>
      </div>

      <textarea
        value={content}
        onChange={(e) => setContent(e.target.value)}
        disabled={isSent}
        rows={4}
        className={cn(
          "w-full text-[12px] text-slate-700 border border-black/10 rounded-lg px-3 py-2 resize-none focus:outline-none focus:ring-1 focus:ring-blue-500/40",
          isSent && "bg-slate-50 text-slate-400 cursor-default"
        )}
      />

      {!isSent && (
        <div className="flex gap-2 mt-2">
          <button
            onClick={handleSend}
            disabled={loading || !content.trim()}
            className="px-3 py-1.5 rounded-lg text-[12px] font-medium bg-green-600 text-white hover:bg-green-700 disabled:opacity-50 transition-colors"
          >
            {loading ? "Sending…" : "Send via Cliq"}
          </button>
          <button
            onClick={handleDiscard}
            disabled={loading}
            className="px-3 py-1.5 rounded-lg text-[12px] font-medium bg-slate-100 text-slate-600 hover:bg-slate-200 disabled:opacity-50 transition-colors"
          >
            Discard
          </button>
        </div>
      )}

      {error && <p className="mt-1.5 text-[12px] text-red-600">{error}</p>}
    </div>
  );
}
```

- [ ] **Step 5: Thread reply draft props through PlanRow and PlanResult**

**5a. Add to PlanRow props:**

```typescript
replyDraft: ReplyDraftRow | null;
onReplyUpdate: (d: ReplyDraftRow) => void;
```

**5b. Pass down to PlanResult:**

```tsx
replyDraft={replyDraft}
onReplyUpdate={onReplyUpdate}
```

**5c. Add to PlanResult props:**

```typescript
replyDraft: ReplyDraftRow | null;
onReplyUpdate: (d: ReplyDraftRow) => void;
```

**5d. Render ReplyDraftSection at the very bottom of PlanResult's JSX** (after `ExecutionSection`):

```tsx
<ReplyDraftSection
  draft={replyDraft}
  onUpdate={onReplyUpdate}
/>
```

**5e. Update planTasks.map in OrchestrationPage:**

```tsx
replyDraft={replyDrafts[task.id] ?? null}
onReplyUpdate={(d) =>
  setReplyDrafts((prev) => ({ ...prev, [d.classification_id]: d }))
}
```

- [ ] **Step 6: TypeScript check**

```bash
npx tsc --noEmit
```

Fix all remaining type errors.

---

### Task 14: Final TASKS.md update + browser acceptance test

**Files:**
- Modify: `TASKS.md`
- Browser: `http://localhost:3000/orchestration`

- [ ] **Step 1: Confirm tasks 027 and 028 are in TASKS.md Testing section**

```markdown
| 027 | Sprint 5 — Execution Engine (M6) | HIGH | feature | _docs/task/027-sprint-5-execution-engine.md | 2026-05-27 |
| 028 | Sprint 5 — Reply Generation (M8) | HIGH | feature | _docs/task/028-sprint-5-reply-generation.md | 2026-05-27 |
```

- [ ] **Step 2: Run the dev server**

```bash
pnpm dev
```

- [ ] **Step 3: Acceptance test — reply draft**

1. After a successful execution (Task 027 AC), confirm the "Reply Draft" card appears below the Execution section
2. Confirm the textarea is pre-filled with Haiku-generated text
3. Edit the text and click "Send via Cliq" — confirm the badge changes to SENT and the textarea locks
4. On a fresh task, click "Discard" — confirm the card disappears

- [ ] **Step 4: Final TypeScript check**

```bash
npx tsc --noEmit
```

Expected: zero errors.

---

## Acceptance Check (AC3 — full loop)

A Content Update task completes the full loop without PM touching Zoho:

1. Classification → `pending` (Sprint 2) ✓
2. Assessment → `CLEAR` (Sprint 3) ✓
3. Plan generated + approved → `APPROVED` (Sprint 4) ✓
4. Execute Plan → Sanity mutations applied, execution record `COMPLETED` (Task 027) ✓
5. **Reply draft auto-generated → PM edits + sends via Cliq (Task 028)**
