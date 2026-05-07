# Task 002 — Resolve Sprint Plan Gaps Before Sprint 0 Kickoff

> **Type:** documentation / planning
> **Version Impact:** patch
> **Priority:** HIGH — must complete before Sprint 2 begins
> **Recommended Model:** haiku
> **Status:** COMPLETED
> **Completed:** 2026-05-04
> **Implementation Notes:** All 7 changes applied to `.docs/plan/WebriQ-Central-Hub-Sprint-Plan.md`. Documentation-only task — no code changes.
> **Investigation:** /understand ran before this spec. Findings embedded below.

---

## Summary

Update `.docs/plan/WebriQ-Central-Hub-Sprint-Plan.md` to close 4 gaps, 1 divergence, and 2 open items identified by cross-referencing the sprint plan against the technical specification. All decisions have been confirmed by the product owner.

**Resolved decisions (owner-confirmed):**
- Q1 → Zoho Cliq is **in-scope for MVP Phase 1** (not Phase 2+)
- Q2 → Product API (MCP) execution for SETTINGS_CHANGE is **part of Sprint 5**
- Q3 → Success metrics instrumentation is **assigned to Sprint 6**
- Q4 → Model string identifiers are **confirmed** (`claude-haiku-4-5-20251001`, `claude-sonnet-4-6`) — O9 closed

---

## Requirements

### 1. Open Items Table (Section 7)

**Close O9** — add a "RESOLVED" marker with confirmed model strings:
```
O9 | ~~Confirm model string identifiers for `llm_config` table~~ **RESOLVED** — confirmed: `claude-haiku-4-5-20251001` (Haiku), `claude-sonnet-4-6` (Sonnet) | Dev | MEDIUM
```

**Add O11** (was missing from sprint plan, present in Spec Section 15):
```
O11 | Load threshold defaults for round-robin developer cap — what is the max open-task count before a dev is excluded from assignment? Required before Phase 3 round-robin build. | PM | MEDIUM
```

**Add O12** (was missing from sprint plan, present in Spec Section 15) — now Sprint 2 scope:
```
O12 | Zoho Cliq notification templates and channel structure — which Cliq channel receives PM digest, Dev digest, plan approval, and execution-complete notifications? **Sprint 2 pre-work.** | PM | MEDIUM → must resolve before Sprint 2
```

### 2. Sprint 2 Deliverables — Add Zoho Cliq Notification Delivery

Cliq is confirmed Phase 1. Add to Sprint 2 deliverables:

```
- Zoho Cliq integration: send notification to configured Cliq channel on classification complete (high-priority tasks) — uses Cliq Incoming Webhook
- Cliq channel structure resolved (O12) before Sprint 2 begins
```

Sprint 2 Acceptance Check annotation — add parenthetical:
```
(Cliq notification fires on high-priority classification within the same 60-second window)
```

### 3. Sprint 3 Deliverables — Add Cliq Digest Delivery + Plan Approval Notification

The spec Integration Map lists four Hub → Cliq flows. Three land in Sprint 3. Add to Sprint 3 deliverables:

```
*Cliq Notification Flows (from Spec Integration Map):*
- PM Digest delivered to PM Cliq channel at configured daily time
- Dev Digest delivered to Dev Cliq channel at configured daily time
- Plan approval request notification sent to PM Cliq channel when a plan is ready for review
```

Note: Execution-complete Cliq notification lands in Sprint 5 (alongside execution engine).

### 4. Sprint 5 Deliverables — Add Product API (MCP) Execution Mode

The spec defines three execution modes (Spec Section 6.4). Sprint 5 currently lists two (Sanity API, GitHub PR). Add the third:

```
- Product API (MCP) execution mode for SETTINGS_CHANGE task type: Hub calls product-exposed MCP tools to apply configuration changes. No direct production write — MCP tool must confirm change applied. Execution record stored with pre/post states for rollback.
- Execution-complete Cliq notification sent to PM channel after any successful execution (all three modes)
```

Update Acceptance Check annotation:
```
(Acceptance Check AC3 covers all three execution modes: Sanity API, GitHub PR, Product API/MCP)
```

### 5. Sprint 6 Deliverables — Add Metrics Instrumentation

Add a new deliverable block to Sprint 6:

```
*Metrics Dashboard (Spec Section 13 — Phase 1 Targets):*
- Supabase view aggregating the 11 tracked metrics from spec: classification accuracy, plan approval rate, reply edit rate, digest usefulness, execution success rate, time-to-plan, time-to-execute, playbook hit rate, KB contribution rate, circuit breaker activations, cost per task
- Simple metrics panel in Hub UI (read-only, PM-visible) surfacing current values vs Phase 1 targets
- Data collection is already automatic via `llm_invocation_logs`, `digest_logs`, and `execution_records` from Sprint 2 onwards — Sprint 6 adds the reporting layer only
```

Phase 1 targets for reference (from Spec Section 13):
- Classification accuracy > 75%
- Plan approval rate > 60%
- Digest usefulness > 70% (Useful rating)
- Execution success rate > 85%
- Reply edit rate < 40%

### 6. Section 9 — Questions for Thursday Meeting

Remove Q7 (now resolved):
```
~~7. **Cliq notifications** — Are we targeting Cliq for PM/Dev digest delivery from MVP, or is that Phase 2+?~~
**RESOLVED: Cliq is Phase 1 in-scope. Confirmed by product owner.**
```

Replace with a note directing to O12 for the remaining Cliq pre-work:
```
See O12 in Section 7 — Cliq channel structure must be resolved before Sprint 2 begins.
```

### 7. Section 8 — Key Design Decisions

Add one new row:
```
| Cliq is the Phase 1 notification channel | All four Hub→Cliq flows (classification alert, PM digest, Dev digest, plan approval, execution complete) are MVP Phase 1. Channel structure defined in O12 pre-work. |
```

---

## File Changes

| Action | File | Notes |
|--------|------|-------|
| MODIFY | `.docs/plan/WebriQ-Central-Hub-Sprint-Plan.md` | All 7 changes above |

---

## Implementation Steps

1. **Open Items table (Section 7):** Mark O9 resolved with confirmed model strings. Append O11 and O12 as new rows. Add "must resolve before Sprint 2" urgency marker to O12.

2. **Sprint 2 deliverables:** Add Cliq webhook integration line. Annotate Acceptance Check with Cliq timing requirement.

3. **Sprint 3 deliverables:** Add `*Cliq Notification Flows*` block after the Daily Digest block. List all three Sprint 3 Cliq flows (PM digest, Dev digest, plan approval).

4. **Sprint 5 deliverables:** Add Product API (MCP) execution mode line under Execution Engine block. Add execution-complete Cliq notification line. Update Acceptance Check annotation to reference all three execution modes.

5. **Sprint 6 deliverables:** Add `*Metrics Dashboard*` block after LLM Wiki block. List the Supabase view, Hub UI panel, and Phase 1 targets.

6. **Section 9:** Strike Q7 text. Add RESOLVED note and pointer to O12.

7. **Section 8:** Append Cliq design decision row to the table.

---

## Code Context

No code files involved — this is a documentation-only task. The sprint plan is a Markdown file at:

```
.docs/plan/WebriQ-Central-Hub-Sprint-Plan.md
```

Key sections and their approximate line ranges (from investigation):
- Section 7 (Open Items): lines 279–295
- Sprint 2 deliverables: lines 107–122
- Sprint 3 deliverables: lines 124–146
- Sprint 5 deliverables: lines 170–191
- Sprint 6 deliverables: lines 193–216
- Section 8 (Design Decisions): lines 298–309
- Section 9 (Thursday Questions): lines 311–321

---

## Notes for Implementation Agent

- **Haiku is fine** — this is 7 targeted Markdown edits to a single document. No judgment calls required; all decisions are recorded above.

- **O12 urgency:** Cliq channel structure (O12) is now on the critical path for Sprint 2. Mark it more visibly than other open items — suggest adding a `⚠️` marker or bolding "must resolve before Sprint 2."

- **Don't add Sprint 7 for metrics** — metrics instrumentation goes inside Sprint 6. The data already flows automatically from Sprint 2 via `llm_invocation_logs`; Sprint 6 only adds the reporting layer.

- **Context Chain enforcement (P6) — for /implement of Sprint 3:**
  The spec's P6 principle ("Context Chain is Sacred") requires every task to carry its full history: description → classification → assessment → clarification → plan → approval → execution → reply. This is not an emergent property of the data model — it must be actively assembled when constructing LLM prompts in Sprints 3, 4, and 5. The sprint plan does not call this out explicitly. When implementing Sprint 3 (Requirements Assessment), the implementation agent must build the context chain assembly function from day one, not retrofit it in Sprint 5.

  Add this as a NOTE in Sprint 3 deliverables:
  ```
  **Note for Sprint 3 implementer:** Context chain assembly (Spec P6) must be built here, not in Sprint 4/5. Every Sonnet prompt for assessment, planning, and execution must receive the full chain: ticket description → classification record → assessment record → any clarification → plan record. Build `buildContextChain(classificationId)` as a shared utility in Sprint 3.
  ```

- **requirements_assessments first-class record — for /implement of Sprint 3:**
  The spec (Section 6.2, callout box, Decision D12) explicitly flags this as an implementation trap: teams build it as a prompt output (text in a field), not as a queryable Supabase record with structured subtasks. The schema already has the correct structure (`subtasks jsonb`, `overall_status`, `assessment_version`). Enforce this by storing the parsed, structured assessment — not the raw LLM output text — as the canonical record.

  Add this as a NOTE in Sprint 3 deliverables:
  ```
  **Note for Sprint 3 implementer:** `requirements_assessments` must be a structured, queryable Supabase record — not a blob of LLM output text. Parse the Sonnet response into the `subtasks jsonb` schema (`[{title, status: CLEAR|PARTIAL|BLOCKED, notes}]`) before inserting. Raw LLM response can be stored in a `raw_response` field for debugging but the canonical record is the structured version.
  ```

- **Product API (MCP) execution mode** needs clarification before Sprint 5 begins: which specific MCP tools does each product (StackShift, PublishForge, etc.) expose for SETTINGS_CHANGE execution? This is product-API-specific and not defined in the spec. Raise as a pre-Sprint-5 question.

---

## Acceptance Criteria

- [ ] O9 marked resolved in Section 7 with confirmed model strings
- [ ] O11 and O12 added to Section 7 open items table
- [ ] O12 has a visible "must resolve before Sprint 2" marker
- [ ] Sprint 2 deliverables include Cliq webhook integration
- [ ] Sprint 3 deliverables include Cliq PM digest, Dev digest, and plan approval notification flows
- [ ] Sprint 5 deliverables include Product API (MCP) execution mode and execution-complete Cliq notification
- [ ] Sprint 6 deliverables include metrics dashboard (Supabase view + Hub UI panel)
- [ ] Section 9 Q7 struck through with RESOLVED note
- [ ] Section 8 includes Cliq design decision row
- [ ] Context chain (P6) note added to Sprint 3 deliverables
- [ ] requirements_assessments first-class record note added to Sprint 3 deliverables
- [ ] Document reads consistently — no contradictions introduced between sections
