-- Task 253: backfill day_start_override/day_end_override on customer_phases/customer_deliverables
-- for existing rows that predate this task, where both columns are still NULL (i.e. every project
-- that never customized a phase/deliverable's schedule at intake — resolveEffectivePhase/
-- resolveEffectiveDeliverable, src/config/customer-phases.ts, already fall back to these exact
-- static PROGRAMME_PHASES values when the override columns are NULL, so this backfill changes no
-- resolved/displayed value — it only makes the static default explicit on-row instead of implicit).
--
-- Scope: only the 5 static default phases (phase_number 1-5) and their known deliverable_keys —
-- a custom phase (phase_number 6+, customer_phases.is_custom = true per migration 246/103) has no
-- PROGRAMME_PHASES entry to backfill from and is left untouched by the `phase_number IN (1,2,3,4,5)`
-- filter below. Values are the static reference scale (1-120), never scaled per project's own
-- programme_duration_days — scaling happens at render time via scaleDay(), matching how seed.ts's
-- phaseDayOverride/deliverableDayOverride already write this column for newly-seeded projects.

-- ─── customer_phases ─────────────────────────────────────────────────────────
UPDATE customer_phases
SET
  day_start_override = CASE phase_number
    WHEN 1 THEN 1
    WHEN 2 THEN 16
    WHEN 3 THEN 31
    WHEN 4 THEN 61
    WHEN 5 THEN 91
  END,
  day_end_override = CASE phase_number
    WHEN 1 THEN 15
    WHEN 2 THEN 30
    WHEN 3 THEN 60
    WHEN 4 THEN 90
    WHEN 5 THEN 120
  END
WHERE day_start_override IS NULL
  AND day_end_override IS NULL
  AND phase_number IN (1, 2, 3, 4, 5);

-- ─── customer_deliverables ────────────────────────────────────────────────────
-- One UPDATE per phase_number — deliverable_key is only unique within a phase (phase 4 and phase 5
-- both define "updated-publishing-plan"/"gap-publishing" with different day ranges), so each
-- statement is scoped to its own phase_number to avoid cross-phase key collisions.

-- Phase 1 — Onboard
UPDATE customer_deliverables
SET
  day_start_override = CASE deliverable_key
    WHEN 'kickoff' THEN 1
    WHEN 'outcome-target' THEN 3
    WHEN 'migration-checklist' THEN 5
    WHEN 'content-map' THEN 10
    WHEN 'html-mockup' THEN 12
    WHEN 'storage-kb' THEN 14
    WHEN 'client-signoff' THEN 15
  END,
  day_end_override = CASE deliverable_key
    WHEN 'kickoff' THEN 2
    WHEN 'outcome-target' THEN 4
    WHEN 'migration-checklist' THEN 9
    WHEN 'content-map' THEN 11
    WHEN 'html-mockup' THEN 13
    WHEN 'storage-kb' THEN 14
    WHEN 'client-signoff' THEN 15
  END
WHERE phase_number = 1
  AND day_start_override IS NULL
  AND day_end_override IS NULL
  AND deliverable_key IN ('kickoff', 'outcome-target', 'migration-checklist', 'content-map', 'html-mockup', 'storage-kb', 'client-signoff');

-- Phase 2 — Migrate & Rebrand
UPDATE customer_deliverables
SET
  day_start_override = CASE deliverable_key
    WHEN 'tech-docs' THEN 16
    WHEN 'migration-implementation' THEN 16
    WHEN 'structure-cleanup' THEN 20
    WHEN 'branding-review' THEN 25
    WHEN 'foundational-pages' THEN 27
    WHEN 'internal-qa' THEN 29
    WHEN 'client-review-approval' THEN 30
  END,
  day_end_override = CASE deliverable_key
    WHEN 'tech-docs' THEN 18
    WHEN 'migration-implementation' THEN 23
    WHEN 'structure-cleanup' THEN 24
    WHEN 'branding-review' THEN 26
    WHEN 'foundational-pages' THEN 28
    WHEN 'internal-qa' THEN 29
    WHEN 'client-review-approval' THEN 30
  END
WHERE phase_number = 2
  AND day_start_override IS NULL
  AND day_end_override IS NULL
  AND deliverable_key IN ('tech-docs', 'migration-implementation', 'structure-cleanup', 'branding-review', 'foundational-pages', 'internal-qa', 'client-review-approval');

-- Phase 3 — Publish
UPDATE customer_deliverables
SET
  day_start_override = CASE deliverable_key
    WHEN 'product-publishing' THEN 36
    WHEN 'industry-publishing' THEN 41
    WHEN 'location-publishing' THEN 46
    WHEN 'buyer-education-content' THEN 51
    WHEN 'publishing-report' THEN 56
  END,
  day_end_override = CASE deliverable_key
    WHEN 'product-publishing' THEN 40
    WHEN 'industry-publishing' THEN 45
    WHEN 'location-publishing' THEN 50
    WHEN 'buyer-education-content' THEN 55
    WHEN 'publishing-report' THEN 60
  END
WHERE phase_number = 3
  AND day_start_override IS NULL
  AND day_end_override IS NULL
  AND deliverable_key IN ('product-publishing', 'industry-publishing', 'location-publishing', 'buyer-education-content', 'publishing-report');

-- Phase 4 — AI Visibility
UPDATE customer_deliverables
SET
  day_start_override = CASE deliverable_key
    WHEN 'updated-publishing-plan' THEN 61
    WHEN 'gap-publishing' THEN 63
    WHEN 'conversion-refinements' THEN 71
    WHEN 'ai-visibility-tracking' THEN 81
  END,
  day_end_override = CASE deliverable_key
    WHEN 'updated-publishing-plan' THEN 62
    WHEN 'gap-publishing' THEN 70
    WHEN 'conversion-refinements' THEN 80
    WHEN 'ai-visibility-tracking' THEN 90
  END
WHERE phase_number = 4
  AND day_start_override IS NULL
  AND day_end_override IS NULL
  AND deliverable_key IN ('updated-publishing-plan', 'gap-publishing', 'conversion-refinements', 'ai-visibility-tracking');

-- Phase 5 — Optimize
UPDATE customer_deliverables
SET
  day_start_override = CASE deliverable_key
    WHEN 'updated-publishing-plan' THEN 91
    WHEN 'gap-publishing' THEN 93
    WHEN 'next-90day-roadmap' THEN 116
    WHEN 'qbr-presentation' THEN 119
  END,
  day_end_override = CASE deliverable_key
    WHEN 'updated-publishing-plan' THEN 92
    WHEN 'gap-publishing' THEN 115
    WHEN 'next-90day-roadmap' THEN 118
    WHEN 'qbr-presentation' THEN 120
  END
WHERE phase_number = 5
  AND day_start_override IS NULL
  AND day_end_override IS NULL
  AND deliverable_key IN ('updated-publishing-plan', 'gap-publishing', 'next-90day-roadmap', 'qbr-presentation');
