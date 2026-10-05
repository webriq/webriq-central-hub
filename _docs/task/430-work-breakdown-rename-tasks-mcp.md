# 430: Work-Breakdown Rename — `tasks.milestone_id/tasklist_id` → `phase_id/deliverable_id`, APIs, MCP Tools, Legacy UIs

**Created:** 2026-10-05
**Priority:** MEDIUM
**Type:** refactor
**Recommended Tier:** balanced
**Status:** Planned
**Depends on:** 429
**Parent:** task 423 (approved design: `_docs/task/423-unify-phases-deliverables-investigation.md`)

---

## Overview

Step 4 (group E of the 423 inventory): align the Tasks/Milestones side with the unified model. `milestone_id` appears in ~32 files and `tasklist_id` in ~13 (grep estimates), including MCP tools used by external clients (`lib/mcp/tools/{create-task,update-task}`), `lib/ai/ops-chat-tools`, and the legacy UI copies (`projects/legacy`, `projects-old`).

## Requirements

- [ ] Migration (written-not-applied): rename `tasks.milestone_id → phase_id`, `tasks.tasklist_id → deliverable_id` (data/FKs untouched), plus any other referencing column found in the file-by-file read.
- [ ] All app code uses the new names; the compat views `milestones`/`tasklists` from 427 are no longer referenced by app code.
- [ ] **External compatibility:** MCP tool inputs and any public API payloads keep accepting `milestone_id`/`tasklist_id` as aliases (mapped at the API layer) and the new names; `_docs/mcp-tools.md` updated in the same change (CLAUDE.md rule); scopes unchanged.
- [ ] Routes keep working: `/projects/v2/[projectId]/milestones/[milestoneId]` URLs stay (UUIDs unchanged); labels in UI say "Phase"/"Deliverable" where the Timeline already does.
- [ ] Tasks tab hides (or labels as "No tasks yet") programme Phase 1 deliverables that have no tasks (decision Q6).
- [ ] CRUD APIs (`api/v2/milestones`, `projects/[id]/milestones`, `tasklists`, `tasks`, `subtasks`) read/write the new tables; creating a manual phase/deliverable sets `source='manual'`.

## Out of Scope

- Dropping compat views and `customer_*` (431); visual redesign of the Milestones tab.

## Acceptance Criteria

- [ ] Task create/update/move across phases and deliverables works from the UI, the MCP tools (old and new field names) and ops-chat; counts per phase/deliverable unchanged vs a before snapshot.
- [ ] `grep` shows no `milestone_id`/`tasklist_id` outside the alias layer and migrations; `tsc`/lint clean.
- [ ] Legacy project pages (`projects/legacy`, `projects-old`) still render.

## Rollback

Reverse column rename migration (rollback script) + revert code; aliases mean external clients are unaffected either way.


## Added from the task-427 spike (2026-10-05)
- Tasks/Milestones UIs and APIs that write **programme-tagged** phases/deliverables as a PM will be denied by RLS under the 427 design (decision D1 in task 427). Surface this as a clear read-only state for those rows instead of a generic error, or change D1.
- Realtime bindings to the legacy names stop working after 427 (views are not published) — rename them here if not already done in 429.
