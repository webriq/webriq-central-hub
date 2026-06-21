# WebriQ Central Hub — Comprehensive Specification & Architectural Plan

**Version:** 2.1 Draft (supersedes v0.1; revision notes below)
**Date:** June 2026
**Status:** For Internal Review
**Major Change:** Zoho suite fully decommissioned.
**Revision 2.1 (post-review):** adds US-PUB-1 StackShift publish → dev URL story (§7B), migration map from the existing v0.1 codebase (§10.6), Phase 0 split into 0A/0B (§12, total ~22 weeks), MVP stats page (M14), AC7, D24/D25, O12. The Hub becomes the company's **system of record** for Project Management, Client Requests, and HR Operations.

---

## Table of Contents

1. Executive Summary
2. Vision & Strategic Goals
3. What Changed from v0.1
4. System Architecture Overview
5. Core Design Principles (Revised)
6. Technology Stack & Key Technical Decisions
7. Feature Modules — Overview Specs
   - 7A. Onboarding & Client Hub
   - 7B. Project Management (native)
   - 7C. Client Request Desk (native ticketing)
   - 7D. Developer Workflow
   - 7E. HR System (native)
   - 7F. AI Orchestration Layer
   - 7G. LLM Wiki / Knowledge Base
   - 7H. Notifications & Realtime
   - 7I. Daily Digest & Reply Generation
   - 7J. Unified AI Chat — Ops Console
8. Technical Specifications
   - 8.1 Application Architecture
   - 8.2 Authentication, Roles & Multi-Tenancy
   - 8.3 Data Model (Full Schema)
   - 8.4 Internal Event Bus (replaces Zoho webhooks)
   - 8.5 Realtime Architecture
   - 8.6 PWA & Cross-Device Strategy
   - 8.7 API Surface
   - 8.8 LLM Model Selection & Observability
   - 8.9 Security & Compliance
9. Integration Map (Revised)
10. Zoho Migration Plan
11. MVP Scope & Acceptance Criteria
12. Phase Roadmap (Revised)
13. Success Metrics
14. Decision Log (v2.0)
15. Open Items

---

## 1. Executive Summary

The WebriQ Central Hub v2.0 is a unified, AI-orchestrated internal operations platform that replaces the entire Zoho suite currently in use:

| Zoho Product | Replaced By |
|---|---|
| Zoho Projects | Native **Projects & Tasks** module |
| Zoho Desk | Native **Client Request Desk** (ticketing + client portal) |
| Zoho People | Native **HR System** (attendance, leaves, timesheets, employee records) |
| Zoho Cliq | In-app **realtime notifications** + announcement feed (Supabase Realtime) |
| Zoho Mail (workflow notifications) | Transactional email service (Resend) — company mailboxes remain on a standard email provider; the Hub only *sends* notifications, it is not a mail client |

The Hub keeps everything that made v0.1 valuable — the AI Orchestration pipeline (classify → assess → plan → human gate → execute → reply), the LLM Wiki institutional memory, Sanity/GitHub execution integrations — but now **owns its own data** rather than synthesizing data from Zoho. This eliminates webhook sync complexity, bidirectional state conflicts (DIRECT_ZOHO_EDIT flags), per-seat Zoho licensing, and gives the AI layer first-party access to every operational record.

The platform is delivered as a **Next.js Progressive Web App** — installable and fully functional on desktop, tablet, and mobile from a single codebase.

---

## 2. Vision & Strategic Goals

1. **One system of record.** Projects, client requests, HR, and knowledge live in one database under one `customer_id` / `employee_id` key space. No sync, no drift, no duplicate truth.
2. **AI-native by design.** Because the Hub owns the data, every LLM action (classification, planning, digest, HR queries) reads and writes first-party records — no API round-trips to external systems for core data.
3. **Operational autonomy roadmap intact.** The phased trust model (manual → assisted → supervised → autonomous) from v0.1 carries forward unchanged.
4. **Any device, anywhere.** PWA with offline-tolerant shell, responsive layouts, installable on iOS/Android/desktop.
5. **Cost ownership.** Replace recurring Zoho per-seat fees with infrastructure the company controls (Supabase + Vercel + Anthropic API usage).

---

## 3. What Changed from v0.1

| Area | v0.1 | v2.0 |
|---|---|---|
| Role of Hub | Orchestration layer *above* Zoho | **System of record** for PM + Desk + HR |
| Principle P4 | "Hub = Intent, Zoho = Execution" | **Retired.** Hub = Intent *and* Execution |
| Task/ticket source | Zoho webhooks → classification | **Internal event bus** (Postgres triggers + pg_net / queue table) → classification |
| Time logs | Pulled read-only from Zoho Projects | Native `time_logs` table, written in-Hub |
| Notifications | Zoho Cliq incoming webhooks | Supabase Realtime Broadcast + in-app inbox + Resend email |
| HR | Out of scope (Zoho People) | **New first-class module**: attendance, leaves, timesheets, employee directory, holidays, announcements |
| Client intake | Zoho Desk tickets | Native client portal: authenticated request submission + email-to-ticket ingestion |
| Realtime | Not specified | Supabase Realtime (decision D16 — see §14) |
| Open item O3 (Zoho webhook setup) | HIGH priority | **Closed — obsolete** |

Everything else — LLM Wiki, two-tier KB, playbooks, orchestration models, Sanity/GitHub execution, multi-tenant design, `customer_id` as universal key — carries forward.

---

## 4. System Architecture Overview

### 4.1 High-Level System Map

```
┌─────────────────────────────────────────────────────────────────────┐
│                      CENTRAL HUB (Next.js PWA)                      │
│                                                                     │
│  Client Portal   PM Dashboard    Dev Dashboard    HR Portal   Admin │
│  (requests,      (+ AI Chat)     (tasks, hours)   (attendance,      │
│   onboarding)                                      leaves, people)  │
├─────────────────────────────────────────────────────────────────────┤
│                     AI ORCHESTRATION LAYER                          │
│   Classifier (Haiku) → Assessment (Sonnet) → Planner (Sonnet)       │
│        → Human Gate → Executor (Sonnet) → Reply (Haiku)             │
│   + HR Assistant (Haiku)  + Prompt Query Engine  + Daily Digest     │
├─────────────────────────────────────────────────────────────────────┤
│                  KNOWLEDGE BASE (LLM Wiki)                          │
│        Internal KB (Products, HR Policies) | Customer KB            │
├─────────────────────────────────────────────────────────────────────┤
│            SUPABASE — single source of truth                        │
│   Postgres (PM + Desk + HR + KB index)  ·  Auth (RBAC)              │
│   Realtime (Broadcast/Presence/Changes) ·  Storage  ·  Cron/Queues  │
│   Internal Event Bus (triggers → orchestration jobs)                │
├─────────────────────────────────────────────────────────────────────┤
│  EXECUTION & DELIVERY INTEGRATIONS (outbound only)                  │
│   Sanity CMS · GitHub + Vercel/Netlify · Product APIs (MCP) · Resend│
└─────────────────────────────────────────────────────────────────────┘
```

The integration surface shrinks dramatically: in v0.1 the Hub had bidirectional sync with four Zoho products. In v2.0, all *operational* data is internal; only **execution targets** (Sanity, GitHub, product APIs) and **email delivery** (Resend) remain external — and all are outbound-initiated.

### 4.2 Core Task Lifecycle Flow (Revised)

```
Client submits request (portal / email-in)  ──┐
PM creates task manually                    ──┼──► `tickets` / `tasks` row inserted
Recurring task from template (cron)         ──┘            │
                                                           ▼
                                            Postgres trigger → event_bus row
                                                           │
                                                           ▼
                                       Classification (Haiku, always-on)
                                                           │
                            ┌──────────────────────────────┼─────────────┐
                            ▼                              ▼             ▼
                     LLM-eligible                   Human-only     Strategic
                            │                       (assign dev)   (PM only)
                            ▼
              Requirements Assessment (Sonnet)
                 CLEAR / PARTIAL / BLOCKED
                            │
                            ▼
                  Plan Generation (Sonnet)
                            │
                            ▼
                  ── HUMAN APPROVAL GATE ──
                            │
                            ▼
            Execution (Sanity API / GitHub PR / MCP)
                            │
                            ▼
              Reply Generation (Haiku) → PM review → send to client
                            │
                            ▼
        Playbook + LLM Wiki updated · realtime status pushed to dashboards
```

The pipeline itself is unchanged from v0.1 — only the *entry point* changes (internal events instead of Zoho webhooks) and the *status sync-back* step disappears entirely.

---

## 5. Core Design Principles (Revised)

| ID | Principle | Description |
|---|---|---|
| P1 | `customer_id` and `employee_id` are universal keys | Every object references one or both. Created in Hub. Never duplicated. |
| P2 | Classification Always On | Runs on every incoming ticket/task without exception. |
| P3 | Requirements Before Execution | No plan generated for incomplete requirements. |
| **P4 (new)** | **Hub is the System of Record** | All PM, Desk, and HR state lives in Supabase. External systems are execution targets only — never sources of operational truth. |
| P5 | No Autonomous Production Writes | Code → feature branch + PR. API actions log `pre_state` for reversibility. Humans merge. |
| P6 | Context Chain is Sacred | Every task carries full history: description → classification → assessment → clarification → plan → approval → execution → reply. |
| P7 | Model Selection is Configurable | Per-layer via `llm_config` table, no code changes. |
| P8 | Manual First, Autonomous Later | Human gates at MVP; autonomy unlocked by playbook confidence. |
| **P9 (new)** | **HR Data is Privileged** | HR records sit behind dedicated RLS policies and a separate role. LLM access to HR data is read-scoped, per-requester, and never enters customer-facing pipelines or the Customer KB. |
| **P10 (new)** | **Realtime is Additive, Not Required** | Every realtime feature degrades gracefully to fetch-on-load. A dropped websocket never blocks work. |

---

## 6. Technology Stack & Key Technical Decisions

| Layer | Technology | Notes |
|---|---|---|
| Framework | **Next.js 15+ (App Router)** | Server Components for dashboards, Server Actions for mutations, Route Handlers for APIs/webhooks |
| PWA | **Serwist** (`@serwist/next`) | Successor to next-pwa; service worker, offline shell, install prompts, push-ready |
| Styling | **Tailwind CSS v4** | |
| Components | **shadcn/ui** + **Lucide React** | Data tables, calendars (attendance/leave), command palette, sheets for mobile |
| AI | **Vercel AI SDK + Claude API** | Streaming chat, structured outputs (`generateObject`), tool calling, MCP support |
| Database / Auth / Storage / Cron | **Supabase** | Postgres + RLS, Supabase Auth, Storage (KB files, onboarding assets, HR docs), pg_cron + Queues |
| **Realtime** | **Supabase Realtime** (replaces Socket.io — see D16) | Postgres Changes (live boards), Broadcast (notifications), Presence (who's online / clocked in) |
| CMS execution target | **Sanity API** | Per-tenant `sanity_project_id` isolation |
| Code execution target | **GitHub API + GitHub Actions** | PR automation, Claude Code in CI, preview deploys |
| Transactional email | **Resend** (+ React Email templates) | Leave approvals, ticket replies, digests, magic links; inbound email-to-ticket via Resend Inbound or a Cloudflare Email Worker |
| Hosting | **Vercel** (primary) / Netlify (fallback) | Edge-cached static shell, serverless API routes, Vercel Cron as backup scheduler |
| Push notifications | **Web Push API** (via service worker) | Mobile/desktop push without native apps |

### D16 — Why Supabase Realtime instead of Socket.io

1. **Hosting incompatibility.** Socket.io needs a persistent stateful server. Vercel/Netlify functions are ephemeral — you would need to run and pay for a separate websocket server (Railway/Fly.io), plus Redis adapter for scaling.
2. **Already in the stack.** Supabase Realtime ships with the database you're already paying for; channels are authorized by the same RLS policies that protect the tables.
3. **Covers all three needs.** Postgres Changes → live task boards and ticket queues update automatically on DB writes (no manual emit calls). Broadcast → instant notifications and chat-style events. Presence → online status, "currently clocked in" indicators.
4. **Less code.** With Socket.io every mutation needs an explicit server emit; with Postgres Changes the database *is* the event source.

**Fallback path:** if a future feature genuinely needs sub-50ms bidirectional messaging at high fan-out (e.g., collaborative cursors), add a dedicated websocket service then. Nothing in this architecture forecloses it.

---

## 7. Feature Modules — Overview Specs

### 7A. Onboarding & Client Hub *(carried forward from v0.1, unchanged in intent)*

- Unified, login-free onboarding entry point per customer (tokenized share link).
- Dynamic, modular forms with conditional logic; progressive completion (save/resume).
- File/asset upload to Supabase Storage.
- PM dashboard: completion %, missing fields.
- Centralized customer profile with product instance mapping (StackShift, PublishForge, CiteForge, PipelineForge).
- On completion: Hub auto-creates the **native project** (v0.1 created a Zoho Project — now internal).

### 7B. Project Management (native — replaces Zoho Projects)

**Core objects:** Projects → Milestones → Tasks → Subtasks → Comments → Time Logs → Attachments.

**Capabilities:**
- Project workspace per customer/product instance, linked via `customer_product_id`.
- Task board (Kanban: Backlog / To Do / In Progress / For Review / Done) + list + calendar views — board updates live via Realtime.
- Task fields: title, rich description, type (from Task Taxonomy), priority (LOW/NORMAL/HIGH/CRITICAL), assignees (multi), due date, estimate, labels, linked ticket, linked PR/preview URL.
- Recurring task templates (Supabase Cron instantiates).
- Auto-assignment & round-robin (Phase 3): eligible pool = not on dedicated client, **not on approved leave (native HR check — v0.1 needed Zoho People for this)**, below PM-configured load threshold; assignment reason logged.
- Review & closure workflow: dev marks "For Review" → PM notified in realtime → PM closes from Hub. No external sync step.
- Prompt-based queries (PM): "show all overdue tasks for CiteForge", "compare logged hours by developer for May".
- Activity feed per project (every status change, comment, execution event).

**User Story US-PUB-1 — Publish to StackShift dev URL (PM-visible).** As a PM, when a content task is ready, I click **"Publish to dev"** on the task; the Hub pushes the content to the customer's StackShift staging environment and the resulting dev URL appears on the task and in the client reply — without touching Sanity Studio or Vercel.
- Trigger: "Publish to dev" action on CONTENT_UPDATE / BLOG_PUBLISH / ASSET_UPLOAD tasks at For Review (PM/Admin only, audit-logged).
- Pipeline: Sanity publish (per-tenant `sanity_project_id`) → StackShift rebuild via deploy hook → Vercel/Netlify deploy webhook → dev URL captured to `tasks.preview_url` + `execution_records.preview_url`.
- Surfacing: "Dev preview" chip on task card/detail, included in Reply Generation draft, queryable via Ops Chat.
- States: PUBLISHING → PUBLISHED(dev) → PUBLISHED(prod, later). Build failures surface with deploy-log link; retryable; pre_state captured (revertible, P5).
- **AC7:** dev URL visible on task + in drafted reply within one rebuild cycle.

### 7C. Client Request Desk (native — replaces Zoho Desk)

- **Client portal:** authenticated clients submit requests via structured form (request type pre-mapped to Task Taxonomy where possible), attach files, view status of their open/closed requests, and reply in-thread.
- **Email-to-ticket:** inbound address (e.g., `support@…`) parsed into a ticket; replies threaded by ticket reference.
- Ticket fields: subject, body, channel (portal/email/manual), customer, product, priority, status (NEW / OPEN / WAITING_ON_CLIENT / WAITING_ON_US / RESOLVED / CLOSED), SLA timestamps.
- Every new ticket fires the event bus → Classification within 60 seconds (same AC as v0.1).
- Ticket ↔ Task linkage: a ticket can spawn one or more internal tasks; closing logic configurable (close ticket when all linked tasks done).
- Canned responses + LLM Reply Generation drafts (PM reviews before send; sent via Resend, threaded into the portal).
- SLA timers and breach flags surface in PM digest.

### 7D. Developer Workflow *(carried forward, Zoho links removed)*

- Today view: assigned tasks/tickets, overdue highlighted, due-soon next.
- Team unassigned pool with one-click self-assign (PM notified via Realtime Broadcast).
- Hours summary (today / week) from native `time_logs`; built-in timer + manual entry.
- Prompt queries: "what open tasks do I have?", "how many hours did I log today?"
- Linked GitHub PRs and Vercel/Netlify preview URLs inline on tasks.

### 7E. HR System (NEW — replaces Zoho People + HR flows in Cliq/Mail)

**7E.1 Employee Directory & Records**
- Employee profile: personal info, role, department, employment type, start date, manager, emergency contact, documents (contracts, IDs — Supabase Storage with HR-only RLS).
- Org structure: manager relationships drive approval routing.
- Roles: `admin`, `hr`, `pm`, `developer`, `client` (an employee user can hold pm/developer + employee context; `hr` unlocks the privileged views).

**7E.2 Attendance**
- Web clock-in/clock-out from the PWA (works on phone); each punch stores timestamp, optional geolocation/IP (configurable per policy), device fingerprint.
- Daily attendance status: PRESENT / LATE / HALF_DAY / ABSENT / ON_LEAVE / HOLIDAY — derived nightly by cron from punches + leave records + holiday calendar.
- Presence channel shows who is currently clocked in (team view).
- HR dashboard: daily attendance grid, late/absence trends, exportable (CSV/XLSX).
- Manual correction requests: employee requests fix → manager/HR approves → audit-logged.

**7E.3 Leave Management**
- Configurable leave types (Vacation, Sick, Emergency, Unpaid, etc.) with accrual rules (e.g., PH norms: monthly accrual, carry-over caps — rules table-driven, not hard-coded).
- Leave request flow: employee files → manager approves/rejects (with reason) → balance auto-deducts → calendar + round-robin pool updated automatically.
- Team leave calendar visible to PMs (feeds assignment eligibility, P1 benefit of unification).
- Half-day support; attachment for medical certs.
- Philippine holiday calendar table (regular/special non-working) maintained by HR; drives attendance derivation and digest.

**7E.4 Timesheets**
- Native `time_logs` (the same records powering PM hours views): per task, per day, hours, billable flag, note.
- Weekly timesheet view per employee: auto-filled from task time logs + attendance; employee submits → manager approves → locked.
- Approved timesheets exportable for payroll (CSV/XLSX). *Payroll computation itself is out of scope for MVP — export feeds the existing payroll process.*

**7E.5 Announcements & HR Requests**
- Company announcement feed (replaces Cliq broadcast channel) — pinned posts, read receipts, realtime delivery + push.
- Generic HR request types (certificate of employment, equipment, etc.) with simple approval routing.

**7E.6 HR Assistant (AI)**
- Haiku-powered, RLS-scoped to the requester: "how many vacation days do I have left?", "who's on leave next week?" (manager scope), "summarize attendance issues this month" (HR scope).
- Answers grounded in live tables + the Internal KB HR-policy wiki pages. Never exposed to clients; HR data never enters Customer KB (P9).

### 7F. AI Orchestration Layer *(carried forward — entry points revised)*

Identical pipeline and taxonomy to v0.1 §6 (Classification → Requirements Assessment → Plan Generation → Human Gate → Execution → Reply), with these changes:

- **Trigger source:** internal event bus rows (ticket/task INSERT) instead of Zoho webhooks.
- **Task Type Taxonomy:** unchanged (CONTENT_UPDATE, SETTINGS_CHANGE, BLOG_PUBLISH, ASSET_UPLOAD, CODE_CHANGE_MINOR, SEO_UPDATE, BUG_REPORT, FEATURE_REQUEST, STRATEGIC) **plus new non-client class `HR_REQUEST`** — routed to HR module workflows, never to the client execution pipeline.
- **Execution targets:** Sanity API, GitHub PR, Product APIs (MCP) — unchanged. Status writes that previously synced to Zoho now simply update native task rows (one fewer failure mode; circuit breaker logic unchanged).
- Requirements assessments, plans, executions remain first-class queryable Supabase records (P6, D12).

### 7G. LLM Wiki / Knowledge Base *(carried forward)*

- Two-tier structure unchanged: **Internal KB** (products, shared Sanity schemas, **+ new: HR policies, SOPs**) and **Customer KB** (per tenant: specs, code map, playbooks, resolved tickets).
- Wiki Lint weekly cron unchanged.
- Resolved-ticket distillation now reads native ticket threads (richer than Zoho exports).

### 7H. Notifications & Realtime (replaces Zoho Cliq)

| Need (was Cliq) | v2.0 Mechanism |
|---|---|
| High-priority classification alert | Realtime Broadcast → in-app toast + notification inbox; Web Push if app closed |
| PM/Dev daily digest delivery | In-app digest panel + Resend email (per-user preference) |
| Plan-approval request | Broadcast to PM channel + push |
| Execution complete / failed | Broadcast + inbox; failures also email |
| Leave request / approval | Broadcast to approver + email |
| Team announcements | Announcement feed (7E.5) |

- Central `notifications` table = durable inbox (read/unread, deep link). Realtime is delivery acceleration; the table is truth (P10).
- Per-user notification preferences matrix: event type × channel (in-app / push / email).

### 7I. Daily Digest & Reply Generation *(carried forward)*

- Digest pre-compiled by Supabase Cron into `digest_logs` (D11) — now includes HR signals for managers: who's on leave today, pending leave approvals, missing timesheets, attendance exceptions.
- Reply Generation (Haiku) drafts client-facing replies on task completion; PM edits stored as diffs; sent via Resend into the ticket thread.

### 7J. Unified AI Chat — Ops Console (NEW)

**One conversational surface across every module.** PMs, Developers, HR, and Admins can ask operational questions in plain language — "how many tasks are pending?", "what are today's priority tasks?", "who filed leaves this week?", "who is absent today?" — and get a grounded answer with deep links, without navigating to the Projects, Desk, or HR tabs. This consolidates the prompt features previously scattered across 7B (PM queries), 7D (Dev queries), and 7E.6 (HR Assistant) into a single global console.

- **Global surface:** persistent chat panel + command palette (Ctrl/Cmd-K) on every screen; dedicated tab in the mobile bottom nav. Per-user conversation memory.
- **Grounded in live data:** answers come from tool calls against RLS-respecting RPCs over `tasks`, `tickets`, `time_logs`, and `hr.*` — the same rows the dashboards render, never stale.
- **Connected to the KB:** the LLM Wiki supplies policy and context ("how many leave days can I carry over?" answers from HR-policy pages); customer/product context enriches PM answers.
- **Role-scoped by construction:** the tool registry exposed to the model is filtered by the requester's role, and every tool runs under the requester's RLS context — the chat can only see what the user can see. HR answers follow P9 scoping.
- **Answers as UI:** responses include interactive cards (task lists, leave/absence grids, hours tables) with deep links — tap any item to jump straight to its page.
- **Model routing:** Haiku for single-tool lookups; Sonnet for multi-step cross-module synthesis. Configurable per `llm_config` (P7).
- **Read-only at MVP:** Q&A and navigation only. Phase 2+ adds chat-triggered actions (assign task, approve leave) behind explicit confirmation — consistent with P8.
- **Observability:** every chat invocation logged to `llm_invocation_logs`; one-tap answer rating feeds prompt improvement.


---

## 8. Technical Specifications

### 8.1 Application Architecture

```
src/
  app/
    (auth)/                 # login, magic link, password reset
    (client)/               # client portal: requests, onboarding, status
    (hub)/                  # internal: layout w/ role-aware nav
      dashboard/            # role-based home (PM / Dev / HR variants)
      projects/[id]/        # boards, lists, task detail
      desk/                 # ticket queues, ticket detail/thread
      orchestration/        # classification review, plans, executions
      hr/
        attendance/  leaves/  timesheets/  people/  announcements/
      kb/                   # LLM Wiki browser/editor
      admin/                # roles, llm_config, leave types, holidays, settings
    api/
      events/process/       # event bus worker (cron-invoked, idempotent)
      classification/ assessment/ plan/ execution/ reply/ digest/
      inbound-email/        # email-to-ticket webhook (Resend Inbound)
      cron/                 # digest, attendance derivation, accruals, wiki lint
  components/  ui/ hub/ desk/ hr/ orchestration/ onboarding/
  lib/
    supabase/ (server, client, admin)   ai/ (AI SDK + Anthropic)
    sanity/   github/   resend/   events/ (bus helpers)   rbac/
  types/  hooks/  config/
```

- **Server Components** for all dashboards (fast initial paint, RLS-scoped queries on the server).
- **Server Actions** for mutations (task updates, clock-in, leave filing) — each mutation that matters writes an `event_bus` row in the same transaction.
- **Route Handlers** only for: inbound email webhook, cron endpoints, AI streaming endpoints.
- Long-running LLM work (plan generation, execution) runs via **Supabase Queues + a worker route invoked by cron / pg_net**, never inline in a user request.

### 8.2 Authentication, Roles & Multi-Tenancy

- **Supabase Auth**: email+password and magic links for staff; magic-link / OTP for client portal users. Optional Google OAuth for staff.
- `profiles` table extends `auth.users` with `role` (`admin | hr | pm | developer | client`) and, for clients, `customer_id`.
- **RLS everywhere.** Representative policies:
  - Clients: rows where `customer_id = jwt.customer_id` only (tickets, onboarding, their thread messages). No access to internal tasks, HR, KB.
  - Developers: tasks/tickets assigned to them or unassigned-team-pool; own time logs and HR records; read project data they're assigned to.
  - PMs: all PM/Desk data across customers; team leave calendar (dates only, not HR documents).
  - HR: full HR schema; no special grant on customer execution data.
  - Admin: all.
- HR tables live in a dedicated Postgres schema (`hr`) so policy review is isolated (P9).
- All privileged mutations audit-logged (`audit_logs`: actor, action, entity, before/after).

### 8.3 Data Model (Full Schema)

**Carried forward unchanged from v0.1:** `customers`, `customer_products`, `classification_records`, `requirements_assessments`, `implementation_plans`, `execution_records`, `playbooks`, `llm_invocation_logs`, `digest_logs`, `llm_config` — with `zoho_*` columns dropped and `source` re-enumerated (`portal | email | manual | recurring`).

**New — Project Management core:**

```sql
projects (
  id uuid PK, customer_id text FK, customer_product_id uuid FK,
  name text, description text,
  status text CHECK (status IN ('active','on_hold','completed','archived')),
  dedicated_developers uuid[],         -- carried from v0.1 customer_products
  created_by uuid, created_at, updated_at
)

tasks (
  id uuid PK, project_id uuid FK, ticket_id uuid NULL FK,
  parent_task_id uuid NULL FK,         -- subtasks
  title text, description text,        -- rich text (tiptap JSON)
  task_type text,                      -- Task Taxonomy
  priority text CHECK (... 'low','normal','high','critical'),
  status text CHECK ('backlog','todo','in_progress','for_review','done','cancelled'),
  assignees uuid[], due_date date, estimate_hours numeric,
  labels text[], position numeric,     -- board ordering
  classification_id uuid NULL FK,
  github_pr_url text, preview_url text,
  created_by uuid, created_at, updated_at
)

task_comments (id, task_id FK, author_id, body, created_at)
attachments (id, entity_type, entity_id, storage_path, filename, size, uploaded_by, created_at)

time_logs (
  id uuid PK, task_id FK, project_id FK, employee_id FK,
  date_logged date, hours numeric(5,2), billable boolean,
  note text, source text CHECK ('timer','manual'),
  timesheet_id uuid NULL FK, created_at
)
```

**New — Client Request Desk:**

```sql
tickets (
  id uuid PK, ticket_number serial UNIQUE,   -- human-readable #
  customer_id text FK, customer_product_id uuid NULL FK,
  subject text, channel text CHECK ('portal','email','manual'),
  priority text, status text CHECK ('new','open','waiting_on_client','waiting_on_us','resolved','closed'),
  requester_email text, requester_profile_id uuid NULL,
  sla_due_at timestamptz, first_response_at, resolved_at,
  classification_id uuid NULL FK, created_at, updated_at
)

ticket_messages (
  id, ticket_id FK, author_type text CHECK ('client','staff','system','llm_draft'),
  author_id uuid NULL, body text, email_message_id text NULL,  -- threading
  visibility text CHECK ('public','internal'), created_at
)
```

**New — HR schema (`hr.*`):**

```sql
hr.employees (
  id uuid PK, profile_id uuid FK -> profiles, employee_number text UNIQUE,
  full_name, department, position, employment_type text CHECK ('full_time','part_time','contract'),
  manager_id uuid NULL FK -> hr.employees, date_hired date, date_separated date NULL,
  status text CHECK ('active','on_leave','separated'),
  emergency_contact jsonb, meta jsonb, created_at, updated_at
)

hr.attendance_punches (id, employee_id FK, punched_at timestamptz,
  direction text CHECK ('in','out'), ip inet NULL, geo point NULL, device text NULL)

hr.attendance_days (             -- derived nightly by cron
  id, employee_id FK, work_date date,
  status text CHECK ('present','late','half_day','absent','on_leave','holiday','rest_day'),
  first_in timestamptz, last_out timestamptz, total_hours numeric(5,2),
  correction_of uuid NULL, corrected_by uuid NULL,
  UNIQUE (employee_id, work_date)
)

hr.leave_types (id, name, code, paid boolean, accrual_rule jsonb, carry_over_cap numeric, active boolean)
hr.leave_balances (id, employee_id FK, leave_type_id FK, year int, accrued, used, balance numeric)
hr.leave_requests (
  id, employee_id FK, leave_type_id FK, start_date, end_date, half_day boolean,
  reason text, attachment_path text NULL,
  status text CHECK ('pending','approved','rejected','cancelled'),
  approver_id uuid, decided_at, decision_note, created_at
)

hr.holidays (id, holiday_date date, name, type text CHECK ('regular','special'), year int)
hr.timesheets (id, employee_id FK, week_start date, total_hours numeric,
  status text CHECK ('draft','submitted','approved','locked'),
  submitted_at, approved_by, approved_at, UNIQUE (employee_id, week_start))
hr.announcements (id, title, body, pinned boolean, author_id, published_at)
hr.hr_requests (id, employee_id, request_type, details jsonb, status, approver_id, created_at)
```

**New — platform plumbing:**

```sql
event_bus (
  id bigserial PK, event_type text,            -- 'ticket.created','task.created','task.status_changed',
                                               -- 'leave.requested','execution.completed', ...
  entity_type text, entity_id uuid, payload jsonb,
  status text CHECK ('pending','processing','done','failed') DEFAULT 'pending',
  attempts int DEFAULT 0, available_at timestamptz DEFAULT now(), created_at
)

notifications (id, recipient_id FK, event_type, title, body, link text,
  read_at timestamptz NULL, channels_sent text[], created_at)

notification_preferences (profile_id, event_type, in_app boolean, push boolean, email boolean)
push_subscriptions (id, profile_id, endpoint, keys jsonb, created_at)
audit_logs (id, actor_id, action, entity_type, entity_id, before jsonb, after jsonb, created_at)
```

### 8.4 Internal Event Bus (replaces Zoho webhooks)

- AFTER INSERT/UPDATE triggers on `tickets`, `tasks`, `hr.leave_requests`, `execution_records` write typed rows into `event_bus` (transactional with the mutation — no lost events).
- A worker (`/api/events/process`, invoked every minute by pg_cron via pg_net, and immediately by Server Actions for latency-sensitive events) claims pending rows with `FOR UPDATE SKIP LOCKED`, dispatches to handlers:
  - `ticket.created` / `task.created` → Classification (Haiku)
  - `classification.completed` (high priority) → notification fan-out
  - `leave.approved` → balance deduction, calendar update, assignment-pool refresh
  - `execution.completed|failed` → notifications, circuit-breaker counters
- Idempotent handlers; exponential backoff on `attempts`; rows `failed` after 5 attempts surface in admin dashboard.
- This preserves v0.1's "classification within 60 seconds" acceptance criterion without any external webhook dependency.

### 8.5 Realtime Architecture (Supabase Realtime)

| Feature | Mechanism | Channel scheme |
|---|---|---|
| Live task boards | Postgres Changes on `tasks` | `project:{id}` (RLS-authorized) |
| Ticket queue updates | Postgres Changes on `tickets` | `desk:queue` |
| Notification toasts/inbox | Broadcast | `user:{profile_id}` |
| Clocked-in indicator | Presence | `team:attendance` |
| Plan approval alerts | Broadcast | `role:pm` |

- Client hook pattern: subscribe on mount, reconcile with a refetch on reconnect (P10 graceful degradation).
- Web Push (service worker) for closed-app delivery of HIGH/CRITICAL events, leave decisions, and digest-ready.

### 8.6 PWA & Cross-Device Strategy

- **Serwist** service worker: precached app shell, stale-while-revalidate for static assets, network-first for data.
- `manifest.json`: standalone display, theme `#0F172A`, maskable icons 192/512, app shortcuts (Clock In, New Task, My Tickets).
- Installable on iOS (Add to Home Screen), Android (install prompt), desktop (Chrome/Edge).
- Offline behavior: shell + last-loaded dashboards readable; mutations queued is **out of scope for MVP** except clock-in/out punches, which queue in IndexedDB and sync on reconnect (field-friendly).
- Responsive design rules: bottom tab nav < 768px (Dashboard / Tasks / Clock / Inbox / More), sidebar ≥ 768px; shadcn `Sheet` for mobile detail panes; large touch targets on attendance and approval actions.

### 8.7 API Surface

- Internal data access via Server Components + Server Actions (no public REST needed for the app itself).
- Route handlers (authenticated by secret or Supabase JWT):
  - `POST /api/inbound-email` — Resend Inbound webhook → ticket/message creation
  - `POST /api/cron/*` — digest, attendance-derive, leave-accrual, wiki-lint, event-worker (protected by CRON_SECRET)
  - `POST /api/ai/chat` — the unified Ops Console endpoint (AI SDK streaming with a per-role tool registry over PM, Desk, and HR data plus LLM Wiki retrieval — see 7J)
  - GitHub webhooks `POST /api/github/webhook` — PR status → task `github_pr_url`/preview updates
- All LLM tool calls are read-scoped through RLS-respecting RPCs; the model never receives a service-role client for HR data (P9).

### 8.8 LLM Model Selection & Observability *(carried forward + additions)*

| Layer | Default Model | Notes |
|---|---|---|
| Classification | Claude Haiku (`claude-haiku-4-5-20251001`) | unchanged |
| Daily Digest | Claude Haiku | now includes HR signals |
| Reply Generation | Claude Haiku | unchanged |
| **HR Assistant (new)** | Claude Haiku | RLS-scoped tools, per-requester |
| **Ops Chat / Query Engine (new)** | Claude Haiku → Sonnet | Haiku for single-tool lookups; Sonnet for multi-step cross-module synthesis |
| Requirements Assessment | Claude Sonnet (`claude-sonnet-4-6`) | unchanged |
| Plan Generation | Claude Sonnet | unchanged |
| Code Execution | Claude Sonnet | unchanged |
| Orchestration / Routing | Claude Sonnet | unchanged |

- `llm_config` table per-layer (P7); every invocation logged with model, tokens, latency, cost, `customer_id` (D-series carried forward); soft daily token budget per customer with PM alert.

### 8.9 Security & Compliance

- RLS on every table; HR schema policies reviewed independently (P9).
- Secrets in Vercel env / Supabase Vault — Hub stores no product credentials (D4 carried forward); product access via MCP-provisioned tools.
- Audit log on: role changes, HR record edits, attendance corrections, leave decisions, plan approvals, executions, manual reclassification.
- PII: HR documents in private Storage bucket, signed URLs, short TTL.
- Philippine Data Privacy Act (RA 10173) posture: documented lawful basis for employee data, retention schedule for separated employees, access logs (audit table satisfies).
- Backups: Supabase PITR enabled; weekly logical dump to cold storage.

---

## 9. Integration Map (Revised)

| System | Direction | What | How |
|---|---|---|---|
| Sanity CMS | Hub → Sanity | Create/update/publish documents, assets, scheduling | Sanity API per `sanity_project_id` |
| GitHub | Hub → GitHub | Branch, commit, PR creation (execution engine) | GitHub API / Actions + Claude Code |
| GitHub | GitHub → Hub | PR merged/closed, deploy preview URL | GitHub webhook |
| Vercel/Netlify | → Hub | Preview URL capture | Deploy webhook / GitHub status |
| Product APIs | Hub → Products | Settings changes | MCP tools |
| Resend | Hub → Email | All outbound notifications/replies/digests | Resend API + React Email |
| Resend Inbound | Email → Hub | support@ → ticket | Inbound webhook |
| **Zoho (all)** | — | **Removed** | Migration only (§10) |

---

## 10. Zoho Migration Plan

**Strategy: module-by-module cutover with a short read-only overlap. No long-running bidirectional sync** (building sync to a system being decommissioned is wasted effort; freeze + import per module instead).

| Step | Action |
|---|---|
| 1 | **Export** — Zoho Projects (projects, tasks, time logs CSV/API), Zoho Desk (tickets + threads + attachments via API), Zoho People (employees, leave types, balances, leave history, attendance history), Cliq (nothing to migrate — ephemeral), Mail (no migration; mailboxes stay on email provider) |
| 2 | **Map & import scripts** (Node, run against Supabase service role): Zoho project → `projects`; task → `tasks` (status/priority mapping table); time log → `time_logs`; ticket → `tickets` + `ticket_messages`; employee → `hr.employees`; leave balances → `hr.leave_balances` (opening balances as adjustment rows); 12 months attendance → `hr.attendance_days` (historical, marked `source: 'zoho_import'`) |
| 3 | **ID preservation** — store `zoho_legacy_id` in a `meta jsonb` column on imported rows for traceability; never used operationally |
| 4 | **Dry run** on staging Supabase; PM + HR validate counts and spot-check 20 records per entity |
| 5 | **Cutover order:** (a) HR first at a month boundary (clean accrual start), Zoho People → read-only; (b) Desk second — new support address live, Zoho Desk auto-responder points clients to portal, open tickets imported; (c) Projects last — freeze Friday, import weekend, Monday live |
| 6 | Zoho retained read-only for 60 days, then archived exports to cold storage, licenses cancelled |

### 10.6 Migration from the Existing v0.1 Codebase

Two sprints of v0.1 implementation exist (customer creation, onboarding, classification engine, orchestration page, migrations 001–024). v2.0 **extends** that codebase. Mapping contract (verify in Sprint 0A):

| Existing (v0.1) | Disposition | Notes |
|---|---|---|
| `customers`, `customer_products` | KEEP, extend | Retire `zoho_account_id`/`zoho_project_id` after 1D; `sanity_project_id` + `github_repo` power US-PUB-1 |
| `customer_projects` (migration 024) | RENAME → `projects` | Add status, dedicated_developers[], customer_product_id FK (§8.3); single migration, no data copy |
| `classification_records` | KEEP as-is (NOT renamed) | `tickets` is a new table; FK `tickets.classification_id` → here. Widen `source` check (zoho_desk, zoho_projects) → (portal, email, manual, recurring); zoho_* ids → meta at 1D |
| AI chain tables (assessments, plans, executions, playbooks, logs, llm_config) | KEEP unchanged | `execution_records.preview_url` reused by US-PUB-1 |
| `/(hub)/orchestration` | KEEP as dedicated surface | Remains the AI-pipeline review surface; PM module deep-links to it |
| `/(hub)/classification` | MERGE into orchestration | First tab; route redirects |
| `/(hub)/pm`, `/(hub)/dev` stubs | BECOME dashboard variants | Fold into `(hub)/dashboard` role-based home |
| Onboarding flows | KEEP, change one hook | Completion creates native project row instead of Zoho Project |
| `api/webhooks`, `api/zoho`, `lib/zoho` | RETIRE | Replaced by event bus + `api/inbound-email`; lib/zoho survives only in 1D import scripts |
| Classification engine core | KEEP, swap adapter | Classifier unchanged; input adapter: Zoho webhook payloads → event_bus rows |
| Permissive RLS (migration 003) | REPLACE | Full v2.0 role matrix in Sprint 0A (planned tightening) |
| `@ducanh2912/next-pwa` | KEEP (verify) | Serwist swap optional/deferred |

**Net effect:** ~80% of existing code carries forward. Destructive changes are exactly three: rename `customer_projects`, widen the classification source enum, retire the Zoho webhook/client layer.

**Risks:** attendance history fidelity (mitigate: import summary days, not raw punches), client portal adoption (mitigate: email-to-ticket keeps old habit working), leave balance disputes (mitigate: HR sign-off on opening balances before cutover).

---

## 11. MVP Scope & Acceptance Criteria (v2.0)

MVP validates: *a client request arrives → classified → assessed → planned → human approves → executed → reply sent*, **and** *the team runs a full week of attendance, leaves, and timesheets natively*.

- **M1 — Customer & Onboarding** *(unchanged from v0.1)*
- **M2 — Native Desk + Classification:** portal submission and email-to-ticket both create tickets; classification record within 60s; low-confidence surfaced for PM; manual reclassification.
- **M3 — Requirements Assessment** *(unchanged)*
- **M4 — Daily Digest** *(+ HR signals for managers)*
- **M5 — Plan Generation (manual)** *(unchanged)*
- **M6 — Execution Engine + Reply** *(unchanged; replies sent via Resend into ticket thread)*
- **M7 — Native Project Management:** projects auto-created on onboarding completion; Kanban + list views; task CRUD, comments, attachments; live board updates; review/closure flow.
- **M8 — Time Tracking:** timer + manual logs; PM hours queries by dev/project/task/date range; export.
- **M9 — Developer Dashboard** *(unchanged, native links)*
- **M10 — LLM Wiki Seed** *(unchanged, + HR policy pages in Internal KB)*
- **M11 — HR Core (new):** employee directory; clock in/out (mobile PWA, offline-queued); derived attendance days; leave types + request/approval + balances; weekly timesheet submit/approve; announcements; notification inbox + push.
- **M12 — Migration Complete (new):** all three Zoho cutovers executed per §10; Zoho in read-only.
- **M13 — Unified AI Chat (new):** global chat panel + command palette; role-scoped read tools across PM, Desk, and HR; KB-grounded answers with deep links and interactive cards; per-query logging and answer rating.
- **M14 — MVP Stats Page (new, D25):** minimal read-only reporting from MVP — hours by developer/project, task throughput, ticket volume + SLA hit rate, attendance summary (Supabase views + simple charts). Full reporting dashboard remains Phase 2.

**Acceptance criteria:**
- **AC1:** Client submits a request from a phone via the portal; PM sees it classified in the Hub within 60 seconds.
- **AC2:** A CONTENT_UPDATE completes classify → plan → approve → execute → client reply without leaving the Hub.
- **AC3:** A developer self-assigns from the team pool; the PM receives a realtime notification; hours logged appear in the PM hours view.
- **AC4:** An employee clocks in from mobile, files a half-day leave, gets manager approval, and the balance + team calendar + assignment pool all update automatically.
- **AC5:** A full payroll-period timesheet export is produced from Hub data with zero reference to Zoho.
- **AC6:** A PM asks the chat "what are today's priority tasks, and who is absent?" and receives an accurate, RLS-scoped answer with deep links — without opening the Projects or HR tabs.
- **AC7:** PM clicks "Publish to dev" on a completed content task; the Hub publishes via Sanity, triggers the StackShift staging rebuild, and the dev URL appears on the task and in the drafted client reply (US-PUB-1).

---

## 12. Phase Roadmap (Revised)

| Phase | Name | Scope | Duration |
|---|---|---|---|
| **0A** | Schema & Auth | Full v2.0 schema via migrations on the existing v0.1 DB (§10.6 mapping), Supabase Auth + full role RLS matrix, Zoho export access verified (O5) | 2 wks |
| **0B** | Infra Wiring | Event bus end-to-end (existing classifier + new adapter), Realtime proven, Resend wired, PWA shell verified, Internal KB seeded | 2 wks |
| **1A** | PM + Desk Core | M1, M2, M7, M8, M9 — the team's daily work surface | 6 wks (3 sprints) |
| **1B** | HR Core | M11 — attendance, leaves, timesheets, announcements | 4 wks (2 sprints) |
| **1C** | AI Loop | M3, M4, M5, M6, M10, M13, M14 — full orchestration loop + unified AI chat + MVP stats page | 6 wks (3 sprints) |
| **1D** | Migration & Cutover | M12 per §10, hardening, training | 2 wks |
| **2** | Assisted Planning | Automation toggle, expanded task types, circuit breaker, reporting dashboard *(unchanged from v0.1)* | 6–8 wks |
| **3** | Supervised Autonomy | Round-robin (now leave-aware natively), multi-dev, calibration, wiki health *(unchanged)* | 6–8 wks |
| **4** | Autonomous Operations | Trusted tiers, auto-reply, fine-tuning export *(unchanged)* | TBD |

**Estimated time to full Zoho replacement: ~22 weeks (~5.5 months)** (Phase 0 split per D24). Sequencing rationale: PM+Desk first because it's the team's daily surface and the AI loop depends on it; HR before the AI loop so a full attendance month runs in parallel with AI development; migration last so the team cuts over to a proven system.

> If timeline pressure demands it, 1B and 1C can run in parallel with two workstreams — HR has near-zero coupling to the orchestration pipeline (only the leave → assignment-pool hook, which is one query).

---

## 13. Success Metrics

All v0.1 metrics carry forward (classification accuracy > 75%, plan approval > 60%, digest usefulness > 70%, etc.), minus Zoho-specific ones, plus:

| Metric | Target |
|---|---|
| Ticket first-response SLA hit rate | > 90% |
| Attendance derivation accuracy (vs HR spot-check) | > 99% |
| Leave request → decision median time | < 24 h |
| Timesheet on-time submission rate | > 95% |
| Realtime delivery (event → UI) p95 | < 3 s |
| Ops Chat answer accuracy (user-rated) | > 85% rated accurate |
| Queries resolved in chat without page navigation | Tracked (adoption signal) |
| Zoho licenses remaining 90 days post-cutover | 0 |

---

## 14. Decision Log (v2.0)

| # | Decision | Rationale |
|---|---|---|
| D1–D3, D5, D7, D9–D15 | Carried forward from v0.1 | Unchanged |
| D4 | No credential storage in Hub | Carried forward |
| ~~D6~~ | ~~Hub = Intent, Zoho = Execution~~ | **Superseded → D6.2: Hub is the System of Record** (P4) |
| ~~D8~~ | ~~Status via reply thread, not portal~~ | **Superseded → D8.2: native client portal** with status + thread (now first-party, near-zero marginal cost) |
| **D16** | **Supabase Realtime over Socket.io** | Socket.io incompatible with serverless hosting; Realtime is in-stack, RLS-authorized, covers Changes/Broadcast/Presence; revisit only if sub-50ms collaborative features emerge |
| **D17** | Resend for all outbound email + inbound ticket ingestion | Mailboxes stay on standard provider; Hub is notification sender, not mail client |
| **D18** | Module-by-module cutover, no bidirectional Zoho sync | Sync to a dying system is wasted engineering; freeze + import per module |
| **D19** | HR in dedicated `hr` schema with independent RLS review | P9 — privileged data isolation |
| **D20** | Event bus = transactional Postgres table + worker, not external queue service | Events written in same transaction as mutations (no loss); SKIP LOCKED worker is sufficient at this scale |
| **D21** | Payroll computation out of scope; approved-timesheet export only | Avoids regulatory scope creep at MVP; revisit Phase 3+ |
| **D22** | Offline mutation queue limited to attendance punches at MVP | Highest field value, lowest conflict risk |
| **D23** | **One unified Ops Chat instead of per-module prompt boxes** | A single tool-calling surface with a per-role tool registry is cheaper to build, observe, and improve than three separate prompt features; read-only at MVP per P8 |
| **D24** | **Phase 0 split into 0A (schema + auth) and 0B (infra wiring)** | Single 2–3-week Phase 0 was optimistic for 6+ migrations plus wiring; 2 + 2 weeks is the honest timeline (review finding #3) |
| **D25** | **Minimal read-only stats page in MVP (M14)** | Leadership should not fly blind until the Phase 2 reporting dashboard (review finding #4) |

---

## 15. Open Items

| # | Item | Owner | Priority |
|---|---|---|---|
| O1 | Final Task Type Taxonomy incl. HR_REQUEST sub-types | PM + HR | HIGH |
| O2 | Leave accrual rules + opening balance sign-off (per employee) | HR | HIGH |
| O3 | Attendance policy: grace period, geolocation on/off, correction window | HR + Mgmt | HIGH |
| O4 | Support email address + Resend Inbound domain setup | Dev | HIGH |
| O5 | Zoho API export access for all five products (before licenses lapse) | Admin | HIGH |
| O6 | SLA matrix per priority for Desk | PM | MEDIUM |
| O7 | Notification preference defaults per role | PM | MEDIUM |
| O8 | PH holiday calendar 2026–2027 seed data | HR | MEDIUM |
| O9 | Client portal auth mode: magic link only vs password optional | PM | MEDIUM |
| O10 | Decide 1B/1C parallel workstreams vs sequential (staffing) | Mgmt | MEDIUM |
| O11 | Round-robin load threshold defaults (carried from v0.1) | PM | MEDIUM |
| O12 | Data fidelity sign-off on Zoho Projects export: Zoho → Hub status (Backlog/To Do/In Progress/For Review/Done) + priority mapping table approved by PM before the migration dry run | PM | HIGH |

---

*End of WebriQ Central Hub Specification v2.0 Draft — Confidential, Internal Use Only.*
