# WEBRIQ Central Hub — AI Automation Pipeline

## Overview

An AI-powered CMS operations pipeline that automates client content and code change requests across multiple Sanity + Next.js projects deployed to Vercel/Netlify. Central Hub is built as a **PWA** — accessible as a Desktop App or Mobile App on any device.

---

## Stack

| Layer | Tool |
|---|---|
| App | Next.js (App Router) — PWA |
| PWA | next-pwa / @ducanh2912/next-pwa |
| Offline + Background Sync | Workbox (service worker) |
| Push Notifications | web-push |
| Orchestration | Vercel AI SDK |
| AI Model | Claude API (claude-sonnet-4-6) |
| CMS | Sanity (via hosted `mcp.sanity.io` — Streamable HTTP) |
| CMS Auth | Shared `SANITY_GLOBAL_TOKEN` (server-side env var) |
| App Auth | Central Hub own auth — NextAuth / Supabase Auth / Clerk |
| Code execution | Claude Sandbox |
| Version control | GitHub (via PAT) |
| CI/CD | GitHub Actions + Vercel/Netlify |
| Preview | Sanity Presentation Tool + Preview URL Secret |
| Knowledge Base | Supabase (pgvector) |
| Task source | Central Hub Internal App |
| Email | Reply Generation → Send to Client |

---

## Environment Variables

```env
ANTHROPIC_API_KEY=
SANITY_GLOBAL_TOKEN=       # Bearer token passed to mcp.sanity.io at runtime
SANITY_PREVIEW_SECRET=     # For Presentation Tool preview URLs
GITHUB_PAT=
VERCEL_API_KEY=
SUPABASE_URL=
SUPABASE_SERVICE_KEY=
NEXT_PUBLIC_APP_URL=       # PWA base URL
VAPID_PUBLIC_KEY=          # Push notifications
VAPID_PRIVATE_KEY=         # Push notifications
```

---

## PWA Setup

### manifest.json

```json
{
  "name": "WEBRIQ Central Hub",
  "short_name": "Central Hub",
  "display": "standalone",
  "start_url": "/",
  "background_color": "#000000",
  "theme_color": "#000000",
  "icons": [
    { "src": "/icon-192.png", "sizes": "192x192", "type": "image/png" },
    { "src": "/icon-512.png", "sizes": "512x512", "type": "image/png" }
  ]
}
```

### next.config.ts

```ts
import withPWA from '@ducanh2912/next-pwa'

export default withPWA({
  dest: 'public',
  cacheOnFrontEndNav: true,
  aggressiveFrontEndNavCaching: true,
  reloadOnOnline: true,
})({
  // your existing next config
})
```

### Per Platform Behavior

| | Desktop PWA | Mobile PWA |
|---|---|---|
| **Auth** | Central Hub session (httpOnly cookie) | Central Hub session (httpOnly cookie) |
| **Notifications** | OS-level push | OS-level push |
| **Offline** | IndexedDB task queue | IndexedDB task queue |
| **Install** | Chrome/Edge install prompt | Add to Home Screen |
| **Session cleared** | Rare | More likely (low storage) |
| **Re-auth** | Central Hub login prompt | Central Hub login prompt |

### Offline Task Queue (Service Worker)

```ts
// service-worker.ts
self.addEventListener('fetch', (event) => {
  if (!navigator.onLine && event.request.url.includes('/api/orchestrate')) {
    event.respondWith(queueTaskForLater(event.request))
    // stored in IndexedDB, replayed when back online
  }
})
```

### Push Notifications

After preview URL is generated, notify the assignee's device:

```ts
await webpush.sendNotification(userSubscription, JSON.stringify({
  title: 'Preview Ready',
  body: `Task #${taskId} — ${taskTitle}`,
  url: previewUrl,
}))
```

---

## Authentication

### Two Separate Auth Concerns

| Concern | Who | Method |
|---|---|---|
| **Central Hub app access** | All users (devs, PMs, etc.) | Central Hub own auth (NextAuth / Supabase Auth / Clerk) |
| **Sanity MCP access** | Server only — never users | `SANITY_GLOBAL_TOKEN` env var |

Users authenticate to **Central Hub** only. Sanity credentials are never exposed to or required from users — Sanity is an implementation detail handled entirely server-side.

---

### Central Hub User Auth Flow

```
User opens Central Hub (any device)
        ↓
Check session → Central Hub session valid?
        ↓
  ┌─────────────┬──────────────┐
  │    Valid    │  Expired /   │
  │   session   │   Missing    │
  └─────────────┴──────────────┘
        ↓              ↓
  Dashboard        Central Hub
                   login page
                  (Google / GitHub
                  / email — your choice)
                        ↓
                   Session saved
                   (httpOnly cookie)
                        ↓
                   Push notification
                   permission prompt
                        ↓
                   Dashboard
```

### Central Hub Auth (NextAuth example)

```ts
// app/api/auth/[...nextauth]/route.ts
import NextAuth from 'next-auth'
import GoogleProvider from 'next-auth/providers/google'

export const { handlers, auth } = NextAuth({
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    }),
  ],
  callbacks: {
    session: ({ session, token }) => ({
      ...session,
      user: { ...session.user, id: token.sub },
    }),
  },
})
```

### Token Usage

| Purpose | Token | Held By |
|---|---|---|
| Central Hub session | NextAuth / Supabase Auth / Clerk session | Per user — httpOnly cookie |
| Sanity MCP (`mcp.sanity.io`) | `SANITY_GLOBAL_TOKEN` | Server env var only — never client |
| GitHub operations | `GITHUB_PAT` | Server env var only |
| Vercel operations | `VERCEL_API_KEY` | Server env var only |

> All third-party service credentials live in server env vars. Users only ever interact with Central Hub's own login — no Sanity, GitHub, or Vercel credentials required from them.

### Action Attribution (Audit Trail)

Since all Sanity operations run under one shared token, Central Hub user identity is captured in `task_logs` for full auditability:

```ts
await supabase.from('task_logs').insert({
  task_id,
  description,
  result: text,
  project_id: project.id,
  triggered_by: session.user.email,   // Central Hub user
  triggered_by_id: session.user.id,
})
```

---

## Sanity MCP — Runtime Setup

Sanity MCP is used **at runtime** in the pipeline via the **hosted `mcp.sanity.io`** server. No self-hosting required.

### Transport: Streamable HTTP (not SSE)

The Vercel AI SDK supports three MCP transports:

| Transport | Type | Status | Use Case |
|---|---|---|---|
| `stdio` | Local | Active | Local MCP server on the same machine (dev only) |
| `sse` | Remote | **Deprecated** (since MCP spec 2025-03-26) | Older MCP servers with `/sse` endpoint |
| `http` | Remote | **Current standard** | Modern MCP servers — including `mcp.sanity.io` |

`mcp.sanity.io` uses **Streamable HTTP**, not SSE. Connecting via SSE returns `405 Method Not Allowed` because Sanity expects POST requests, not GET/SSE.

### Connecting at Runtime (Vercel AI SDK)

```ts
import { experimental_createMCPClient } from 'ai'

const sanityMCP = await experimental_createMCPClient({
  transport: {
    type: 'http',                      // ← Streamable HTTP, not 'sse'
    url: 'https://mcp.sanity.io',
    headers: {
      Authorization: `Bearer ${process.env.SANITY_GLOBAL_TOKEN}`,
    },
  },
})
```

> When an `Authorization` header is provided, `mcp.sanity.io` skips OAuth entirely and uses the token directly.

### Always Close the Client

```ts
const sanityMCP = await experimental_createMCPClient({ ... })

try {
  const tools = await sanityMCP.tools()
  const { text } = await generateText({ ... tools ... })
} finally {
  await sanityMCP.close() // always close — even if generateText throws
}
```

### Known Limitation

The Vercel AI SDK MCP client is a **lightweight tool conversion client**. It does not support: session management, resumable streams, or receiving server notifications. For the pipeline this is fine — tool conversion is all that's needed.

### Auth Summary

| Context | MCP Server | Auth Method |
|---|---|---|
| Claude Code CLI (dev) | `mcp.sanity.io` | OAuth login (personal/robot account) |
| Central Hub pipeline (runtime) | `mcp.sanity.io` | `SANITY_GLOBAL_TOKEN` Bearer header |

### Robot Account (Global Access)

Since Sanity API tokens are project-scoped, a **robot/service account** is used for global access across all client projects:

1. Create `automation@webriq.com` Sanity account
2. Add it as **Editor** to every client project
3. Generate a permanent API token for that account from `sanity.io/manage`
4. Store as `SANITY_GLOBAL_TOKEN` in Central Hub env vars
5. Add robot account to new projects as part of new project onboarding checklist

---

## Pipeline Entry Point

```
[Central Hub App]
      ↓
Project → Received ticket / Create task
      ↓
Classify task (Claude + KB)
→ Enumerate sub-tasks
→ Tag each: "sanity" | "code" | "both"
      ↓
Route to Lane 1, Lane 2, or Lane 3
```

### Classification Rules

| Request Type | Tag | Lane |
|---|---|---|
| Update page title, SEO, text, slug, body | `sanity` | 1 |
| Create/delete page or document | `sanity` | 1 |
| Publish / unpublish content | `sanity` | 1 |
| New schema type or field | `code` | 2 |
| New component, layout, design change | `code` | 2 |
| Feature development | `code` | 2 |
| Content + schema/component together | `both` | 3 |

> **Key rule:** Sub-task enumeration is critical. One ticket can span multiple lanes. The classifier breaks it into atomic sub-tasks, each tagged independently. KB stores patterns per sub-task type — not per full ticket.

---

## Lane 1 — Content / Sanity Only

### Flow

```
Classification → sub-tasks tagged "sanity"
        ↓
Requirement Assessment (Claude + Sanity MCP)
→ Does schema support this? (list_workspace_schemas)
→ Does the document exist? (query_documents)
→ Are required fields present?
        ↓
  ┌─────────────┬──────────────┐
  │   Ready     │  Not Ready   │
  └─────────────┴──────────────┘
        ↓              ↓
  Plan Generation   Block + notify dev
  (Claude + KB      schema fix needed
  + Sanity MCP)     → escalate to Lane 2
        ↓
  Execute Plan (Claude + Sanity MCP)
  → patch/create as DRAFT only
  (drafts never trigger deploy hook)
        ↓
  Validation check
  (required fields present?)
        ↓
  Generate Preview URL
  (Sanity Presentation Tool + secret, 2hr expiry)
        ↓
  Preview URL → Internal App → Assignee notified
        ↓
  ┌─────────────┬──────────────┐
  │   Approve   │   Reject     │
  └─────────────┴──────────────┘
        ↓              ↓
  Save to KB     discard_drafts
  publish_docs   Feedback → KB
        ↓         Task reopened
  Deploy hook fires
  (Vercel/Netlify — tied to Sanity publish)
        ↓
  Health check (200 on live URL?)
        ↓
  ┌─────────────┬──────────────┐
  │    Pass     │    Fail      │
  └─────────────┴──────────────┘
        ↓              ↓
  Reply Generation  unpublish_documents
  Send Email        Alert assignee
  to Client         KB entry flagged
```

### Sanity MCP Tools Used in Lane 1

| Tool | Purpose |
|---|---|
| `list_workspace_schemas` | Requirement assessment |
| `query_documents` | Check existing content / validation |
| `patch_documents` | Update fields on existing documents |
| `create_documents` | Create new page/post as draft |
| `publish_documents` | Publish on human approval |
| `discard_drafts` | Discard on rejection |
| `unpublish_documents` | Rollback on health check failure |

### Deploy Hook Behavior (Lane 1)

- Sanity is tied to a deploy hook on Vercel/Netlify
- **Drafts never trigger the hook** — safe to create and iterate
- **`publish_documents` triggers the hook** — production deploys on publish
- Claude must **never call `publish_documents` automatically** — always requires human approval

### Preview Setup (Sanity Presentation Tool)

```ts
// app/api/draft-mode/enable/route.ts
import { validatePreviewUrl } from '@sanity/preview-url-secret'
import { client } from '@/sanity/client'
import { draftMode } from 'next/headers'
import { redirect } from 'next/navigation'

export async function GET(req: Request) {
  const { isValid, redirectTo = '/' } = await validatePreviewUrl(client, req.url)
  if (!isValid) return new Response('Invalid preview secret', { status: 401 })
  draftMode().enable()
  redirect(redirectTo)
}
```

```ts
// sanity/client.ts
export function getSanityClient() {
  const { isEnabled } = draftMode()
  return createClient({
    ...config,
    useCdn: !isEnabled,
    perspective: isEnabled ? 'drafts' : 'published',
    token: isEnabled ? process.env.SANITY_READ_TOKEN : undefined,
  })
}
```

```ts
// sanity.config.ts
presentationTool({
  previewUrl: {
    origin: process.env.NEXT_PUBLIC_SITE_URL!,
    draftMode: {
      enable: '/api/draft-mode/enable',
    },
  },
})
```

```ts
// orchestrator — generate preview URL after draft created
const previewUrl = await createPreviewSecret(client, {
  secret: process.env.SANITY_PREVIEW_SECRET!,
  redirectTo: `/${slug}`,
  expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 2), // 2hr expiry
})
// → https://project.vercel.app/api/draft-mode/enable?secret=xxx&redirectTo=/home
```

---

## Lane 2 — Code Changes

### On Claude Sandbox

Claude Sandbox provides an isolated environment to write, run, and test code before touching the actual repo.

| Claude Sandbox Does | Claude Sandbox Does NOT |
|---|---|
| Write new components | Run full Next.js dev server |
| Write schema type files | Access `.env` secrets |
| Run lint / type checks | Deploy anything |
| Generate test files | Push to GitHub directly |
| Validate file structure | |

> GitHub PAT handles the actual push — Sandbox generates the code, orchestrator commits via GitHub API.

### Flow

```
Classification → sub-tasks tagged "code"
        ↓
Requirement Assessment
→ Which repo? Which project?
→ Which files are affected?
→ Existing pattern in KB?
        ↓
Plan Generation (Claude + KB)
→ Files to create/modify
→ Dependencies needed
→ Estimated complexity
        ↓
Human Plan Review (Internal App)
→ Dev reviews + approves or adjusts scope
        ↓
  ┌─────────────┬──────────────┐
  │   Approve   │   Adjust     │
  └─────────────┴──────────────┘
        ↓              ↓
Claude Sandbox        Update plan
→ Generate code       → Re-review
→ Lint + type check
→ Validate structure
        ↓
GitHub API (PAT)
→ Create feat/branch
→ Commit generated files
→ Open Draft PR with description
        ↓
GitHub Actions CI
→ Lint, type check, build
        ↓
  ┌─────────────┬──────────────┐
  │   CI Pass   │   CI Fail    │
  └─────────────┴──────────────┘
        ↓              ↓
Vercel/Netlify      Claude analyzes
Preview Deploy      CI logs + fixes
(auto on PR)        → re-push to branch
        ↓           (max 3 retries)
Preview URL →       → escalate to human
Internal App        if retries exceeded
        ↓
Dev reviews Vercel Preview
        ↓
  ┌─────────────┬──────────────┐
  │   Approve   │   Changes    │
  └─────────────┴──────────────┘
        ↓              ↓
  Merge PR to       Claude iterates
  production        in Sandbox
        ↓           → re-push
  Production Deploy
  (auto on merge)
        ↓
  Health check
        ↓
  Save to KB
  Reply Generation
  Send Email to Client
```

### CI Failure Recovery

```ts
if (ciStatus === 'failed') {
  const logs = await fetchCILogs(repo, runId)
  const fix = await generateText({
    model: anthropic('claude-sonnet-4-6'),
    system: 'You are a senior developer. Analyze CI failure logs and fix the code.',
    prompt: `CI failed:\n${logs}\n\nFix the issue.`,
    tools: { sandboxExec, githubPush },
  })
  // Auto-push fix to same branch — CI re-runs
  // Max 3 retries before escalating to human
}
```

---

## Lane 3 — Mixed (Sanity + Code)

When a task has both content and code sub-tasks, always run **code first, content second**.

```
Classification → sub-tasks tagged "both"
        ↓
┌──────────────────────────────────────┐
│  Code sub-tasks → Lane 2 first      │
│  (schema types, components, fields)  │
└──────────────────────────────────────┘
        ↓
Lane 2 PR merged + deployed
        ↓
┌──────────────────────────────────────┐
│  Content sub-tasks → Lane 1         │
│  (schema is now ready)              │
└──────────────────────────────────────┘
        ↓
Lane 1 executes normally
```

> **Rule:** Code always before content. You cannot patch a field that doesn't exist in the schema yet.

---

## Supabase — Knowledge Base Schema

```sql
-- Enable vector extension
create extension if not exists vector;

-- KB entries
create table kb_entries (
  id uuid primary key default gen_random_uuid(),
  request_pattern text,
  embedding vector(1536),
  classification text,         -- 'sanity' | 'code' | 'both'
  lane int,                    -- 1 | 2 | 3
  tools_used text[],
  execution_steps jsonb,
  outcome text,                -- 'success' | 'failed' | 'overridden'
  project_id text,
  use_count int default 1,
  flagged bool default false,
  created_at timestamptz default now(),
  last_used_at timestamptz default now()
);

-- Similarity search function
create function match_kb_entries(
  query_embedding vector(1536),
  match_threshold float,
  match_count int
)
returns table(
  id uuid,
  request_pattern text,
  classification text,
  lane int,
  execution_steps jsonb,
  similarity float
)
language sql stable as $$
  select id, request_pattern, classification, lane, execution_steps,
    1 - (embedding <=> query_embedding) as similarity
  from kb_entries
  where 1 - (embedding <=> query_embedding) > match_threshold
  order by similarity desc
  limit match_count;
$$;

-- Audit log
create table task_logs (
  id uuid primary key default gen_random_uuid(),
  task_id text,
  project_id text,
  description text,
  lane int,
  tools_called text[],
  result text,
  kb_hit bool,
  created_at timestamptz default now()
);

-- Human corrections feed back into KB
create table kb_corrections (
  id uuid primary key default gen_random_uuid(),
  kb_entry_id uuid references kb_entries(id),
  original_lane int,
  corrected_lane int,
  corrected_by text,
  reason text,
  corrected_at timestamptz default now()
);
```

### KB as a Living System

- **Learn from success** — every successful execution gets saved; future similar requests skip reclassification
- **Learn from corrections** — if dev overrides Claude's lane, correction saved back to KB
- **Learn from failure** — failed entries get flagged; next occurrence routes to human review automatically
- **Semantic matching** — pgvector embeddings match similar requests even if wording differs

---

## Orchestrator — Core Logic

```ts
// app/api/orchestrate/route.ts
import { auth } from '@/app/api/auth/[...nextauth]/route'
import { experimental_createMCPClient } from 'ai'

export async function POST(req: Request) {
  // 0. Verify Central Hub session
  const session = await auth()
  if (!session?.user) {
    return Response.json({ error: 'Not authenticated' }, { status: 401 })
  }

  const { task_id, title, description, project } = await req.json()

  // 1. KB lookup
  const embedding = await getEmbedding(description)
  const { data: kbHit } = await supabase.rpc('match_kb_entries', {
    query_embedding: embedding,
    match_threshold: 0.85,
    match_count: 1,
  })

  const context = kbHit?.length
    ? `KB Match found: ${JSON.stringify(kbHit[0])}`
    : 'No KB match. Classify from scratch.'

  // 2. Connect to mcp.sanity.io via Streamable HTTP + shared global token
  const sanityMCP = await experimental_createMCPClient({
    transport: {
      type: 'http',                        // Streamable HTTP — not 'sse'
      url: 'https://mcp.sanity.io',
      headers: {
        Authorization: `Bearer ${process.env.SANITY_GLOBAL_TOKEN}`, // server-side only
      },
    },
  })

  try {
    // 3. Claude classifies + executes via MCP tools
    const { text } = await generateText({
      model: anthropic('claude-sonnet-4-6'),
      system: SYSTEM_PROMPT,
      prompt: `Task: ${title}\nDescription: ${description}\nProject: ${JSON.stringify(project)}\n\n${context}`,
      tools: {
        ...await sanityMCP.tools(), // all mcp.sanity.io tools available at runtime
        createGithubPR,
        flagForHuman,
      },
      maxSteps: 10,
    })

    // 4. Log outcome with Central Hub user attribution
    await supabase.from('task_logs').insert({
      task_id,
      description,
      result: text,
      project_id: project.id,
      triggered_by: session.user.email,    // Central Hub user — not Sanity user
      triggered_by_id: session.user.id,
    })

    return Response.json({ success: true })
  } finally {
    await sanityMCP.close() // always close Streamable HTTP connection
  }
}
```

### System Prompt

```
You are an AI operations assistant for WEBRIQ managing multiple Sanity + Next.js client projects.

Your job:
1. Classify the incoming task into sub-tasks, each tagged: "sanity" | "code" | "both"
2. For each sub-task, determine the lane:
   - Lane 1 (AI Only): Pure content updates. Execute via Sanity MCP. Always draft first, never auto-publish.
   - Lane 2 (AI + Human): Code changes. Generate plan → human approves → Claude Sandbox → GitHub PR.
   - Lane 3 (Mixed): Code first (Lane 2), then content (Lane 1).
3. If a KB match is provided with high confidence, follow saved execution steps.
4. If no KB match, reason carefully before acting.
5. Always report: what you did, tools called, outcome.

Rules:
- Never guess a Sanity project ID — it must be provided in task context.
- Never call publish_documents automatically — always wait for human approval.
- Never push directly to main — always create a feat/ branch and open a PR.
- Never exceed 3 CI fix retries — escalate to human if exceeded.
- When in doubt, escalate and explain why.
```

---

## Lane Summary

| | Lane 1 | Lane 2 | Lane 3 |
|---|---|---|---|
| **Trigger** | Content/Sanity tasks | Code tasks | Both |
| **AI Tool** | Claude + Sanity MCP | Claude + Sandbox | Both in sequence |
| **Human touchpoint** | Preview approval | Plan review + PR review | Both |
| **Preview** | Sanity Presentation Tool | Vercel/Netlify PR preview | Both |
| **Deploy** | Via Sanity publish hook | Via PR merge | Sequential |
| **Rollback** | `unpublish_documents` | Revert PR / revert merge | Both |
| **KB saves** | After publish | After PR merge | After all steps |
| **Email to client** | After health check passes | After health check passes | After all steps pass |

---

## General Rules

1. **Sub-task enumeration first** — always break tickets into atomic sub-tasks before routing
2. **Draft before publish** — Claude only creates drafts; human approval triggers publish
3. **Code before content** — in mixed tasks, schema/component must exist before content updates
4. **Every action is logged** — Sanity MCP calls, GitHub pushes, CI runs, deploys, emails → Supabase `task_logs`
5. **Email to client is always last** — only after health check passes
6. **Claude Sandbox is stateless** — always pass full context (file contents, schema, patterns) per session
7. **Max 3 CI retries** — escalate to human if Claude cannot fix CI failure in 3 attempts
8. **Project routing is explicit** — `sanity_project_id`, `dataset`, `repo`, `vercel_project_id` must always be passed in task context; never inferred
9. **Preview URL expires in 2hrs** — regenerate if assignee needs more time
10. **`SANITY_GLOBAL_TOKEN` is server-side only** — never exposed to client; users never need Sanity credentials
11. **Robot account added to every new project** — part of new project onboarding checklist
12. **Push notifications for all async events** — preview ready, approval needed, deploy complete, health check failed
13. **Offline tasks queue in IndexedDB** — replayed automatically when device is back online
14. **All actions attributed to Central Hub user** — `triggered_by` logged on every task, not the Sanity robot account

---

## Build Order (Recommended)

1. PWA setup (manifest, next-pwa, service worker, offline queue)
2. Central Hub auth (NextAuth / Supabase Auth / Clerk — Google or GitHub login)
3. Push notification setup (VAPID keys, web-push, permission prompt)
4. Robot account setup (`automation@webriq.com` → added to all Sanity projects → `SANITY_GLOBAL_TOKEN` in env)
5. Supabase schema (`kb_entries`, `task_logs` with `triggered_by`, `kb_corrections`, `match_kb_entries` function)
6. Orchestrator API route (session-gated, `mcp.sanity.io` via Streamable HTTP, hardcode one project first)
7. Classifier + sub-task enumerator (most critical — everything depends on this)
8. Lane 1 tools (via `mcp.sanity.io` at runtime: `patch`, `create`, `publish`, `discard`)
9. Draft-first + validation + preview URL generation
10. KB save/lookup integration
11. Health check + rollback logic
12. Lane 2 tools (Claude Sandbox + GitHub PAT + CI webhook)
13. Lane 3 sequencing
14. Reply generation + email to client
15. Central Hub internal app integration (task creation → orchestrator webhook)
