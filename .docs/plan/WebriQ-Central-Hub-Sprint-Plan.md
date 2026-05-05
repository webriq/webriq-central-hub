# WebriQ Central Hub — Implementation Sprint Plan
**Prepared by:** Brandon  
**For:** Miss Dannea (COO Review — Thursday Meeting)  
**Version:** Draft v1 | April 2026  

---

## 1. Project Overview

The WebriQ Central Hub is an internal operations platform serving three connected purposes:

- **Operational Dashboard** — A unified daily work surface for PMs and Developers, replacing manual Zoho navigation.
- **AI Orchestration Layer** — An intelligent pipeline that classifies tasks, validates requirements, generates plans, and executes lightweight work with human approval gates.
- **Institutional Memory Store** — A self-maintaining LLM Wiki knowledge base that accumulates customer context, product knowledge, playbooks, and documentation — improving every LLM action over time.

**The Hub does not replace Zoho.** It sits above it — synthesizing data from Zoho Projects, Zoho Desk, Sanity, GitHub, and product APIs into a single intelligent operational layer.

---

## 2. Core Modules

| Module | Description |
|--------|-------------|
| **A. Onboarding & Client Hub** | Unified, login-free onboarding entry point per customer. Dynamic, modular forms. Progressive completion. Centralized customer profile. |
| **B. Project Management** | PM dashboard integrated with Zoho Projects and Zoho Desk. Prompt-based queries. Auto-assignment. Round-robin logic. |
| **C. Developer Workflow** | Lightweight daily task/ticket view. Quick Zoho access links. Hours summary. Self-assignment from team open task list. |
| **AI Orchestration** | Classification (Haiku) → Requirements Assessment (Sonnet) → Plan Generation (Sonnet) → Human Gate → Execution → Reply Generation |
| **LLM Wiki / KB** | Two-tier knowledge base: Internal (products, schemas) + Per-Customer (specs, code, playbooks, resolved tickets) |

---

## 3. Tech Stack

| Layer | Technology |
|-------|------------|
| Frontend | Next.js + Vercel AI SDK |
| Database | Supabase (schema, cron, storage) |
| AI Models | Claude Haiku (classification, digest, reply) / Claude Sonnet (assessment, planning, execution) |
| Integrations | Zoho Projects, Zoho Desk, Zoho Cliq, Sanity CMS |
| Dev Tools | GitHub API, Claude Code, Vercel/Netlify |

---

## 4. Phase Roadmap (High Level)

| Phase | Name | Goal | Estimated Duration |
|-------|------|------|--------------------|
| **Phase 0** | Infrastructure | Foundation — no user-facing features | 2 weeks |
| **Phase 1** | MVP | Core operational loop validated on real workloads | 12 weeks (6 sprints) |
| **Phase 2** | Assisted Planning | Automation toggle + broader task types | 6–8 weeks |
| **Phase 3** | Supervised Autonomy | Round-robin, multi-dev, learning flywheel | 6–8 weeks |
| **Phase 4** | Autonomous Operations | Trusted tiers, auto-reply, fine-tuning pipeline | TBD |

**Total estimated time to MVP: ~14 weeks (3.5 months)**

---

## 5. Detailed Sprint Plan

> Sprint cadence: **2 weeks per sprint**  
> All sprints follow the MVP milestones (M1–M10) from the Technical Spec.

---

### PHASE 0 — Sprint 0: Infrastructure Foundation
**Duration:** Weeks 1–2  
**Goal:** Zero user-facing features. Backend infrastructure only. Exit condition: Classification receives a Zoho webhook and produces a structured record.

**Deliverables:**
- Supabase schema deployed (all Phase 1 tables + stubs for future phases — avoids future migration debt)
- Zoho webhook infrastructure tested end-to-end with dummy data
- LLM Wiki directory structure established in Supabase Storage
- `llm_config` table configured with Haiku/Sonnet assignments per orchestration layer
- LLM invocation logging and cost attribution from day one
- Seed content authored for Internal KB (product how-tos, shared Sanity schemas)
- Vercel AI SDK integrated (Next.js project scaffold, chat interface, MCP support)

**Key Tables to Deploy:**
`customers`, `customer_products`, `classification_records`, `requirements_assessments`, `implementation_plans`, `execution_records`, `playbooks`, `llm_invocation_logs`, `digest_logs`

**Dependencies:**
- Zoho API credentials and sandbox access
- Sanity project IDs per tenant confirmed
- GitHub Actions / Claude Code execution environment

---

### PHASE 1 — Sprint 1: Customer Creation & Onboarding (M1)
**Duration:** Weeks 3–4  
**Milestone:** M1 — Customer & Onboarding  

**Deliverables:**
- Customer creation flow with `customer_id` as universal key
- `/onboard/{customer_id}` — unique, login-free, secure, revisitable URL per customer
- Dynamic onboarding form with conditional logic (sections vary by product: StackShift / PublishForge / CiteForge / PipelineForge)
- Progressive completion: save progress, resume later, share link to customer
- File/asset upload support (images, PDFs, Word docs, spreadsheets)
- PM dashboard: completion percentage + missing fields indicator
- Customer profile with product instance mapping (`product_instances[]`)

**Acceptance Check (from Spec AC1):**  
A PM can onboard a new customer end-to-end without opening Zoho.

---

### PHASE 1 — Sprint 2: Classification Engine + Zoho Webhook (M2 + M7 partial)
**Duration:** Weeks 5–6  
**Milestones:** M2 (Classification), M7 (Zoho Sync — project creation side)

**Deliverables:**
- Webhook listener for Zoho Desk and Zoho Projects (new task/ticket triggers)
- Classification Engine always-on — runs Claude Haiku on every incoming task/ticket
- Full `classification_records` record stored in Supabase (priority, task_type, llm_eligible, confidence_score, model_used, token counts)
- Low-confidence classifications surfaced in PM UI for manual review
- Manual re-classification available from Hub UI
- Hub auto-creates Zoho Project after customer onboarding completes
- `zoho_project_id` linked back to `customer_products` table
- Zoho Cliq integration: send notification to configured Cliq channel on classification complete (high-priority tasks) — uses Cliq Incoming Webhook
- Cliq channel structure resolved (O12) before Sprint 2 begins

**Acceptance Check (from Spec AC2):**  
A new Zoho Desk ticket appears in the Hub classified within 60 seconds. (Cliq notification fires on high-priority classification within the same 60-second window)

---

### PHASE 1 — Sprint 3: Requirements Assessment + Daily Digest (M3 + M4)
**Duration:** Weeks 7–8  
**Milestones:** M3 (Requirements Assessment), M4 (Daily Digest)

**Deliverables:**

*Requirements Assessment (Claude Sonnet):*
- Subtask breakdown with CLEAR / PARTIAL / BLOCKED statuses
- `requirements_assessments` record stored in Supabase (queryable, not just a prompt instruction)
- Clarification draft auto-generated for PM to review and send to customer
- Task flagged `CLARIFICATION_NEEDED` in digest when blocked
- Re-assessment triggers automatically when customer replies

*Daily Digest Engine (Claude Haiku):*
- Supabase Cron job running at configured time each day
- Digest pre-compiled and stored in `digest_logs` — dashboard reads on load (no live LLM call = fast + cost-predictable)
- PM Digest: pending tasks, unassigned tickets, stalled items, automation queue, ready to close
- Dev Digest: today's tasks, overdue items, team unassigned tasks, hours this week
- One-tap digest feedback rating (Useful / Partial / Not Useful) stored for future prompt improvement

*Cliq Notification Flows (from Spec Integration Map):*
- PM Digest delivered to PM Cliq channel at configured daily time
- Dev Digest delivered to Dev Cliq channel at configured daily time
- Plan approval request notification sent to PM Cliq channel when a plan is ready for review

**Note for Sprint 3 implementer:** Context chain assembly (Spec P6) must be built here, not in Sprint 4/5. Every Sonnet prompt for assessment, planning, and execution must receive the full chain: ticket description → classification record → assessment record → any clarification → plan record. Build `buildContextChain(classificationId)` as a shared utility in Sprint 3.

**Note for Sprint 3 implementer:** `requirements_assessments` must be a structured, queryable Supabase record — not a blob of LLM output text. Parse the Sonnet response into the `subtasks jsonb` schema (`[{title, status: CLEAR|PARTIAL|BLOCKED, notes}]`) before inserting. Raw LLM response can be stored in a `raw_response` field for debugging but the canonical record is the structured version.

**Acceptance Check (from Spec AC4):**  
A PM starts the day from the digest with full situational awareness without opening Zoho.

---

### PHASE 1 — Sprint 4: Plan Generation + Full Zoho Sync (M5 + M7 complete)
**Duration:** Weeks 9–10  
**Milestones:** M5 (Plan Generation), M7 (Full Zoho Sync)

**Deliverables:**

*Plan Generation (Claude Sonnet — manual trigger):*
- "Generate Plan" button on any LLM-eligible task
- Plan displayed: steps, affected files/APIs, confidence score (0–100), risk flags, playbooks referenced
- Approve / Reject flow with structured rejection reason options (PLAN_INCOMPLETE, WRONG_APPROACH, SCOPE_EXCEEDED, KNOWLEDGE_GAP, MISCLASSIFICATION)
- Rejection reasons linked to KB gap stubs for future learning

*Zoho Sync — Full:*
- Hub pushes tasks and developer assignments to Zoho Projects
- Zoho status changes sync back to Hub via webhook
- DIRECT_ZOHO_EDIT flagging when task is modified directly in Zoho
- One-click direct task/ticket links from Hub to Zoho (no manual searching in Zoho)
- PM project actions from Hub: Open / Put on Hold / Mark Active / Mark for Review / Close / Reopen

---

### PHASE 1 — Sprint 5: Execution Engine + Reply Generation (M6 + M8)
**Duration:** Weeks 11–12  
**Milestones:** M6 (Execution), M8 (Reply Generation)

**Deliverables:**

*Execution Engine (Claude Sonnet via Claude Code / API):*
- Approved plan triggers execution via Sanity API (content updates, asset uploads, SEO updates, blog publishing)
- GitHub PR generated automatically for code-type tasks (feature branch only — no direct production write)
- Vercel/Netlify preview URL captured and displayed in Hub
- Product API (MCP) execution mode for SETTINGS_CHANGE task type: Hub calls product-exposed MCP tools to apply configuration changes. No direct production write — MCP tool must confirm change applied. Execution record stored with pre/post states for rollback.
- Execution record stored with `pre_action_states` for rollback
- "Revert" button replays inverse state
- `PARTIAL_EXECUTION` state: flagged for manual review, never auto-retried
- Circuit breaker: 3 consecutive plan failures → automation auto-paused per customer
- Execution-complete Cliq notification sent to PM channel after any successful execution (all three modes)

*Reply Generation (Claude Haiku):*
- Reply draft auto-generated when task reaches COMPLETED state
- Draft displayed in Hub for PM review and editing before sending
- PM edits stored as diffs — common patterns fed back into reply system prompt

**Acceptance Check (from Spec AC3):**  
A Content Update task completes the full loop (classify → plan → execute → reply) without PM touching Zoho. (Acceptance Check AC3 covers all three execution modes: Sanity API, GitHub PR, Product API/MCP)

---

### PHASE 1 — Sprint 6: Developer Dashboard + KB Seed (M9 + M10)
**Duration:** Weeks 13–14  
**Milestones:** M9 (Developer Dashboard), M10 (LLM Wiki Seed)

**Deliverables:**

*Developer Dashboard:*
- Today's assigned tasks and tickets with direct Zoho links
- Overdue items highlighted prominently
- Team unassigned tasks list — any dev can self-assign; PM notified on assignment
- Hours logged this week (pulled read-only from Zoho Projects)
- Prompt-based queries: "What open tasks do I have?", "Show my pending tickets", "How many hours did I log today?"

*LLM Wiki / Knowledge Base:*
- Internal KB directory structure established in Supabase Storage
- Seed playbooks authored for Content Update and Settings Change task types
- Customer KB scaffold — PM and Dev file upload working
- Weekly Wiki Lint Cron job scheduled (LLM audits for contradictions, stale references, orphan pages)
- LLM invocation logging active for all calls with per-customer cost attribution

*Metrics Dashboard (Spec Section 13 — Phase 1 Targets):*
- Supabase view aggregating the 11 tracked metrics from spec: classification accuracy, plan approval rate, reply edit rate, digest usefulness, execution success rate, time-to-plan, time-to-execute, playbook hit rate, KB contribution rate, circuit breaker activations, cost per task
- Simple metrics panel in Hub UI (read-only, PM-visible) surfacing current values vs Phase 1 targets
- Data collection is already automatic via `llm_invocation_logs`, `digest_logs`, and `execution_records` from Sprint 2 onwards — Sprint 6 adds the reporting layer only

Phase 1 targets (from Spec Section 13): Classification accuracy > 75% | Plan approval rate > 60% | Digest usefulness > 70% (Useful rating) | Execution success rate > 85% | Reply edit rate < 40%

**Acceptance Check (from Spec AC5):**  
A Developer can see assigned work and self-assign an available task from the Hub.

---

### PHASE 2 — Assisted Planning (Post-MVP)
**Duration:** ~6–8 weeks after MVP exit  
**Entry condition:** All 5 MVP acceptance criteria met. Team using Hub as primary daily interface for 2+ weeks.

**Scope:**
- Automation toggle per customer (plan auto-triggers when toggle is ON)
- Expanded task types: Settings Change, SEO Update, Asset Upload
- Playbook library accumulating from real executions
- Rejection reason data feeding KB gap identification workflow
- Per-customer circuit breaker (3 failures → auto-pause)
- Basic reporting dashboard (classification accuracy, approval rate, reply edit rate)

**Exit Condition:** 20+ executions in playbook library. Classification accuracy > 80%.

---

### PHASE 3 — Supervised Autonomy (Post-Phase 2)
**Duration:** ~6–8 weeks after Phase 2 exit

**Scope:**
- Round-robin auto-assignment with developer pool configuration
- Multiple developer assignment per task
- Workload-aware assignment with PM-configurable load thresholds
- Confidence calibration reporting (predicted vs actual outcomes)
- Wiki health dashboard (stale content, lint findings, KB coverage)
- Knowledge gap closure workflow (rejection → KB stub → PM fills → re-test)

**Exit Condition:** Confidence measurably improving. Digest rating > 75% Useful.

---

### PHASE 4 — Autonomous Operations (Post-Phase 3)
**Scope:**
- Full autonomous execution for Tier 3 customers (PM notified post-execution)
- Auto-send reply with configurable review window
- LLM Wiki fine-tuning data export
- Cross-customer pattern recognition from aggregate execution data
- PM Handoff briefing: one-click project briefing generation for new PMs

**Exit Condition:** One customer at full autonomous tier, 0 failures over 30 days.

---

## 6. MVP Summary View

| Sprint | Weeks | Key Deliverable | MVP Milestone |
|--------|-------|-----------------|---------------|
| Sprint 0 | 1–2 | Infrastructure & schema | Phase 0 |
| Sprint 1 | 3–4 | Customer creation + onboarding forms | M1 |
| Sprint 2 | 5–6 | Classification engine + Zoho webhook | M2, M7 (partial) |
| Sprint 3 | 7–8 | Requirements assessment + daily digest | M3, M4 |
| Sprint 4 | 9–10 | Plan generation + full Zoho sync | M5, M7 (complete) |
| Sprint 5 | 11–12 | Execution engine + reply generation | M6, M8 |
| Sprint 6 | 13–14 | Developer dashboard + KB seed | M9, M10 |

**Total: ~14 weeks to MVP exit**

---

## 7. Open Items to Resolve (from Spec)

These are flagged HIGH priority in the technical specification and will need alignment before or during Sprint 0:

| # | Item | Owner | Priority |
|---|------|-------|----------|
| O1 | Complete Task Type Taxonomy — full Phase 1 list with requirements checklists | PM + Dev | HIGH |
| O2 | Complete Tenant Configuration Schema — all product-specific IDs per product line | PM + Dev | HIGH |
| O3 | Zoho API access and webhook setup (test environment) | Dev | HIGH |
| O4 | Sanity API access per tenant — confirm `sanity_project_id` as isolation key | Dev | HIGH |
| O5 | Claude Code execution environment (GitHub Actions, cloud runtime) | Dev | HIGH |
| O6 | Seed playbook content for Content Update and Settings task types | PM + Dev | HIGH |
| O7 | Internal KB initial content (product how-tos, shared schemas, workflow docs) | Dev Team | HIGH |
| O8 | Vercel AI SDK evaluation and project scaffold | Dev | MEDIUM |
| O9 | ~~Confirm model string identifiers for `llm_config` table~~ **RESOLVED** — confirmed: `claude-haiku-4-5-20251001` (Haiku), `claude-sonnet-4-6` (Sonnet) | Dev | MEDIUM |
| O10 | Developer pool configuration UI for Phase 2 round-robin | PM | MEDIUM |
| O11 | Load threshold defaults for round-robin developer cap — what is the max open-task count before a dev is excluded from assignment? Required before Phase 3 round-robin build. | PM | MEDIUM |
| ⚠️ O12 | Zoho Cliq notification templates and channel structure — which Cliq channel receives PM digest, Dev digest, plan approval, and execution-complete notifications? **Sprint 2 pre-work — must resolve before Sprint 2 begins.** | PM | MEDIUM |

---

## 8. Key Design Decisions (Already Made in Spec)

| Decision | What It Means Practically |
|----------|--------------------------|
| `customer_id` is the universal key | Every system — Zoho, Sanity, Hub — references this. Never duplicated. |
| Classification is always-on | No manual toggle. Every task/ticket is classified. No exceptions. |
| Hub = Intent, Zoho = Execution | Status and intent flow Hub → Zoho. Direct Zoho edits are flagged. |
| No autonomous production writes at MVP | All code changes go to a feature branch. PRs require human merge. |
| Haiku for high-frequency, Sonnet for reasoning | Cost-optimized. Configurable per layer via DB (no code change needed). |
| Digest pre-compiled by Cron | Dashboard reads stored digest — not a live LLM call. Fast and predictable cost. |
| Manual first, autonomous later | All gates require human initiation at MVP. Autonomy unlocked incrementally. |
| Cliq is the Phase 1 notification channel | All four Hub→Cliq flows (classification alert, PM digest, Dev digest, plan approval, execution complete) are MVP Phase 1. Channel structure defined in O12 pre-work. |

---

## 9. Questions for Thursday Meeting

1. **Zoho access** — Do we currently have API keys and sandbox environments for Zoho Projects, Desk, and Cliq ready? This is the critical path for Sprint 2.
2. **Sanity setup** — Do we have `sanity_project_id` values confirmed for each product line (StackShift, PublishForge, etc.)?
3. **Round-robin Phase timing** — Is Phase 2 (round-robin assignment) expected within a specific timeframe, or is Phase 1 MVP the primary delivery goal for now?
4. **Internal KB content** — Who is responsible for authoring the initial Internal KB (product how-tos, schemas)? Dev team or shared?
5. **Developer pool** — For the round-robin engine in Phase 2, is there a current definition of which developers belong to which pools?
6. **Client access** — The onboarding form needs to be accessible to clients without login. Are there any security or branding requirements for those URLs?
7. ~~**Cliq notifications** — Are we targeting Cliq for PM/Dev digest delivery from MVP, or is that Phase 2+?~~  
   **RESOLVED: Cliq is Phase 1 in-scope. Confirmed by product owner.** See O12 in Section 7 — Cliq channel structure must be resolved before Sprint 2 begins.
8. **Credentials handling** — The spec flags credentials (DNS access, email tool access) as needing careful handling. Should we define a vault or permissions model before Sprint 1?

---

*Document prepared for internal use. WebriQ © 2026*
