// 120-Day Customer Programme — static phase/deliverable definitions.
// Identical for every project; only per-project *state* (customer_phases, customer_deliverables,
// onboarding_internal_deliverables) lives in the database.
// Source: _docs/plan-v2/PROJECT ONBOARDING/Project_Onboarding_QBR_120Day_FINAL.html
//
// Phase 1's day *ranges* (vs. task 122's single due-day model) are a deliberate task-123
// breakdown, not derived from the QBR — see task 123 doc's "Key Design Decisions". Phases 2-5
// originally used single-day semantics (dayStart === dayEnd); task 148 widened them to real
// spans that fill the gap since the previous deliverable in the same phase, since the same
// rendering code already handled ranges generically. Per-project drag-resize/move edits are
// stored as an override on customer_deliverables (day_start_override/day_end_override,
// migration 071) read on top of these static defaults — never mutating this config.

export type DeliverableConfig = {
  key: string;
  name: string;
  description: string;
  dayStart: number; // absolute programme day, 1-120 — NOT phase-relative
  dayEnd: number;
  owner: string; // display label only, not a Hub user FK
};

export type PhaseConfig = {
  // Task 246: widened from `1 | 2 | 3 | 4 | 5` — a project can now have custom phases (phase_number
  // 6+, or any number once RESOLVE-time identity is caller-assigned) beyond the fixed 5. Every
  // PROGRAMME_PHASES entry below is still statically 1-5; this widening only affects code that
  // builds a PhaseConfig-shaped object for a project's *actual* phase set (see
  // resolveEffectivePhase below), not this static array itself.
  number: number;
  name: string;
  shortName: string;
  dayStart: number;
  dayEnd: number;
  owner: string;
  deliverables: DeliverableConfig[];
};

export const PROGRAMME_PHASES: PhaseConfig[] = [
  {
    number: 1,
    name: "Onboard",
    shortName: "Onboard",
    dayStart: 1,
    dayEnd: 15,
    owner: "Bert",
    deliverables: [
      { key: "kickoff", name: "Kickoff", description: "Structured kickoff meeting; goals, timeline, and contacts confirmed.", dayStart: 1, dayEnd: 2, owner: "Bert" },
      { key: "outcome-target", name: "Outcome target", description: "Agreed measurable outcomes for the 120-day programme.", dayStart: 3, dayEnd: 4, owner: "Bert" },
      { key: "migration-checklist", name: "Migration checklist", description: "Full audit of existing site and content ready for migration.", dayStart: 5, dayEnd: 9, owner: "Bert" },
      { key: "content-map", name: "90-day content map", description: "Topics, clusters, and publishing schedule through Day 90.", dayStart: 10, dayEnd: 11, owner: "Bert" },
      { key: "html-mockup", name: "HTML mockup", description: "Visual mockup of new site structure for client approval.", dayStart: 12, dayEnd: 13, owner: "Bert" },
      { key: "storage-kb", name: "Storage folder + KB", description: "Project folder live; knowledge base populated with all assets.", dayStart: 14, dayEnd: 14, owner: "Bert" },
      { key: "client-signoff", name: "Client call — sign-off", description: "Scope, mockup, and migration plan approved. PM joins for handover.", dayStart: 15, dayEnd: 15, owner: "PM + Bert" },
    ],
  },
  {
    number: 2,
    name: "Migrate & Rebrand",
    shortName: "Migrate",
    dayStart: 16,
    dayEnd: 30,
    owner: "PM + Dev",
    deliverables: [
      { key: "tech-docs", name: "Tech docs from Jun", description: "Full technical specification package for the developer.", dayStart: 16, dayEnd: 18, owner: "Jun" },
      { key: "migration-implementation", name: "Migration / Implementation", description: "HTML mockups converted to StackShift I.", dayStart: 16, dayEnd: 23, owner: "Dev" },
      { key: "structure-cleanup", name: "Structure cleanup", description: "URL architecture, redirects, forms, and navigation finalized.", dayStart: 20, dayEnd: 24, owner: "Dev" },
      { key: "branding-review", name: "Branding review", description: "Brand colours, fonts, and voice applied across all pages.", dayStart: 25, dayEnd: 26, owner: "Dev" },
      { key: "foundational-pages", name: "Foundational pages", description: "Home, About, Services, and Contact pages are launch ready.", dayStart: 27, dayEnd: 28, owner: "Dev" },
      { key: "internal-qa", name: "Internal QA", description: "Team review of build against mockup and tech docs.", dayStart: 29, dayEnd: 29, owner: "PM" },
      { key: "client-review-approval", name: "Client review + approval", description: "Client reviews dev URL and approves for launch.", dayStart: 30, dayEnd: 30, owner: "PM" },
    ],
  },
  {
    number: 3,
    name: "Publish",
    shortName: "Publish",
    dayStart: 31,
    dayEnd: 60,
    owner: "Erica + April",
    deliverables: [
      { key: "product-publishing", name: "Product publishing", description: "Dedicated pages per product/service line published.", dayStart: 36, dayEnd: 40, owner: "Erica" },
      { key: "industry-publishing", name: "Industry publishing", description: "Industry-specific content targeting buyer segments.", dayStart: 41, dayEnd: 45, owner: "April" },
      { key: "location-publishing", name: "Location publishing", description: "Local and regional landing pages as per content map.", dayStart: 46, dayEnd: 50, owner: "Erica" },
      { key: "buyer-education-content", name: "Buyer-education content", description: "Blog posts, guides, and FAQs aligned to buyer journey.", dayStart: 51, dayEnd: 55, owner: "April" },
      { key: "publishing-report", name: "Publishing report", description: "Summary of all content published and initial traffic data.", dayStart: 56, dayEnd: 60, owner: "PM" },
    ],
  },
  {
    number: 4,
    name: "AI Visibility",
    shortName: "AI Visibility",
    dayStart: 61,
    dayEnd: 90,
    owner: "April + Eri",
    deliverables: [
      { key: "updated-publishing-plan", name: "Updated Publishing Plan", description: "Based on metrics from the previous publishing report.", dayStart: 61, dayEnd: 62, owner: "April" },
      { key: "gap-publishing", name: "Gap publishing", description: "Identify and fill content gaps found via AI and search data.", dayStart: 63, dayEnd: 70, owner: "Eri" },
      { key: "conversion-refinements", name: "Conversion refinements", description: "CTA, form, and page improvements based on behaviour data.", dayStart: 71, dayEnd: 80, owner: "Dev" },
      { key: "ai-visibility-tracking", name: "AI visibility tracking & reporting", description: "90-day outcome check and analysis.", dayStart: 81, dayEnd: 90, owner: "April + Eri" },
    ],
  },
  {
    number: 5,
    name: "Optimize",
    shortName: "Optimize",
    dayStart: 91,
    dayEnd: 120,
    owner: "PM + Strategy",
    deliverables: [
      { key: "updated-publishing-plan", name: "Updated Publishing Plan", description: "Plans for the last 30 days in this cycle.", dayStart: 91, dayEnd: 92, owner: "PM" },
      { key: "gap-publishing", name: "Gap publishing", description: "Identify and fill remaining content gaps.", dayStart: 93, dayEnd: 115, owner: "Eri" },
      { key: "next-90day-roadmap", name: "Next 90-day roadmap", description: "Content, technical, and strategy plan for the next quarter.", dayStart: 116, dayEnd: 118, owner: "PM" },
      { key: "qbr-presentation", name: "QBR presentation", description: "Live review session with client covering results and next cycle roadmap.", dayStart: 119, dayEnd: 120, owner: "PM" },
    ],
  },
];

export function getCurrentProgrammeDay(startedAt: string | Date): number {
  const start = new Date(startedAt);
  const now = new Date();
  // Diff calendar dates (local midnight to local midnight), not raw ms/86_400_000 — programme_started_at
  // carries a time-of-day, and floor-dividing the raw instant gap under-counts until "now" catches up to
  // that same time-of-day each day (e.g. started 3pm, still shows yesterday's day number at 9am today).
  const startDay = new Date(start.getFullYear(), start.getMonth(), start.getDate());
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const diffDays = Math.round((today.getTime() - startDay.getTime()) / 86_400_000);
  return Math.max(1, diffDays + 1);
}

export function getPhaseForDay(day: number): PhaseConfig {
  return PROGRAMME_PHASES.find((p) => day >= p.dayStart && day <= p.dayEnd) ?? PROGRAMME_PHASES[PROGRAMME_PHASES.length - 1];
}

export function getPhaseByNumber(n: number): PhaseConfig {
  const phase = PROGRAMME_PHASES.find((p) => p.number === n);
  if (!phase) throw new Error(`Unknown programme phase number: ${n}`);
  return phase;
}

// Task 244: StackShift I default-phase skip (per project, at intake) — shared by
// seedAndStartProgramme/seedProgrammeAtPhase (seed.ts) and the "Jump to phase" PATCH route's own
// backdate math, so both agree on which phase is actually "active" when the requested target
// phase is itself in the skip set. If every phase is skipped, there's no valid "active" phase —
// the requested phaseNumber is returned as-is, purely for the (now moot) backdate calculation.
//
// Task 246: generalized from "walk PROGRAMME_PHASES in phase_number order" to "walk the caller's
// own ordered phase list" — once a project can have custom phases inserted anywhere, phase_number
// order no longer matches display/adjacency order; only sort_order does (see PhaseOrderEntry).
export type PhaseOrderEntry = { number: number; sortOrder: number };

export function resolveEffectivePhaseNumber(
  phases: PhaseOrderEntry[],
  phaseNumber: number,
  skipPhaseNumbers: number[] = []
): number {
  const skipSet = new Set(skipPhaseNumbers);
  const ordered = [...phases].sort((a, b) => a.sortOrder - b.sortOrder);
  if (ordered.every((p) => skipSet.has(p.number))) return phaseNumber;
  if (!skipSet.has(phaseNumber)) return phaseNumber;
  const targetSortOrder = ordered.find((p) => p.number === phaseNumber)?.sortOrder ?? -Infinity;
  return (
    ordered.find((p) => p.sortOrder >= targetSortOrder && !skipSet.has(p.number)) ??
    ordered.find((p) => !skipSet.has(p.number))
  )!.number;
}

export type PhaseDayRangeEntry = PhaseOrderEntry & { dayStart: number; dayEnd: number };

// Chat follow-up to task 244/248: a skipped phase never happens for this project, so the
// calendar days statically allocated to it (PROGRAMME_PHASES' fixed 1-120 reference scale)
// shouldn't appear on the progress bar/timeline at all, nor count as "already elapsed" the way a
// merely-bypassed-but-real earlier phase's days do. compressReferenceDay maps a static reference
// day (a phase's or deliverable's own dayStart/dayEnd, or the grid's own max reference day) onto
// a "skip-compressed" scale with every entirely-earlier skipped phase's span removed — the same
// scale `currentDay` (via the backdated `programme_started_at`) lives on once a skipped phase
// precedes the active one, and the scale the Portfolio Tracker's Swimlane/progress-bar/timeline
// now render every non-skipped phase and deliverable on. Identity (no-op) when nothing is
// skipped, so every pre-existing call site that never skips a phase is unaffected.
export function compressReferenceDay(
  referenceDay: number,
  phases: PhaseDayRangeEntry[],
  skipPhaseNumbers: number[] = []
): number {
  if (skipPhaseNumbers.length === 0) return referenceDay;
  const skipSet = new Set(skipPhaseNumbers);
  const ordered = [...phases].sort((a, b) => a.sortOrder - b.sortOrder);
  let removed = 0;
  for (const p of ordered) {
    if (p.dayEnd > referenceDay) break;
    if (skipSet.has(p.number)) removed += p.dayEnd - p.dayStart + 1;
  }
  return referenceDay - removed;
}

// The compressed-scale start day of `effectivePhaseNumber` (already resolved via
// resolveEffectivePhaseNumber) — 1 plus the day-span of every earlier, non-skipped phase. Feeds
// the same `scaleDay(..., durationDays)` call every backdate site already made against
// `targetPhase.dayStart` — identical result whenever nothing earlier was skipped, since that sum
// then equals the target phase's own static dayStart exactly.
export function resolveEffectiveStartDay(
  phases: PhaseDayRangeEntry[],
  effectivePhaseNumber: number,
  skipPhaseNumbers: number[] = []
): number {
  const targetPhase = phases.find((p) => p.number === effectivePhaseNumber);
  if (!targetPhase) return 1;
  return compressReferenceDay(targetPhase.dayStart, phases, skipPhaseNumbers);
}

export function getDeliverable(phaseNumber: number, key: string): DeliverableConfig | undefined {
  return getPhaseByNumber(phaseNumber).deliverables.find((d) => d.key === key);
}

// ─── Project-aware phase/deliverable resolution (task 246) ──────────────────
// customer_phases/customer_deliverables (migration 103) carry nullable override columns —
// custom_name/day_start_override/day_end_override/sort_order on customer_phases,
// custom_name/custom_description/custom_owner on customer_deliverables. When every override on a
// row is null (every pre-migration row, and any of the 5 defaults a PM never edited), the
// effective phase/deliverable is identical to its PROGRAMME_PHASES static entry. A phase_number
// with no static entry at all (6+, i.e. any PM-added custom phase) resolves entirely from its own
// row + deliverable rows — there is no PROGRAMME_PHASES fallback for those.

// Deliberately NOT named CustomerPhaseRow/CustomerDeliverableRow — those names are already taken
// by src/types/database.ts's full generated Row types. These are the minimal subset
// resolveEffectivePhase/Deliverable actually need, so a caller can pass a partial select() result
// without pulling in the full Row shape.
export type PhaseOverrideRow = {
  phase_number: number;
  custom_name: string | null;
  day_start_override: number | null;
  day_end_override: number | null;
  sort_order: number;
};

export type DeliverableOverrideRow = {
  deliverable_key: string;
  custom_name: string | null;
  custom_description: string | null;
  custom_owner: string | null;
};

export function resolveEffectiveDeliverable(phaseNumber: number, row: DeliverableOverrideRow): DeliverableConfig {
  const staticDeliverable = PROGRAMME_PHASES.find((p) => p.number === phaseNumber)?.deliverables.find(
    (d) => d.key === row.deliverable_key
  );
  return {
    key: row.deliverable_key,
    name: row.custom_name ?? staticDeliverable?.name ?? row.deliverable_key,
    description: row.custom_description ?? staticDeliverable?.description ?? "",
    dayStart: staticDeliverable?.dayStart ?? 1,
    dayEnd: staticDeliverable?.dayEnd ?? 1,
    owner: row.custom_owner ?? staticDeliverable?.owner ?? "",
  };
}

// deliverableRows should be every customer_deliverables row for this phase — pass `[]` only when
// truly none have been seeded yet (falls back to the static deliverable list for a default phase,
// or an empty list for a custom one, matching "no deliverables configured" rather than guessing).
export function resolveEffectivePhase(row: PhaseOverrideRow, deliverableRows: DeliverableOverrideRow[] = []): PhaseConfig & { sortOrder: number } {
  const staticPhase = PROGRAMME_PHASES.find((p) => p.number === row.phase_number);
  const name = row.custom_name ?? staticPhase?.name ?? `Phase ${row.phase_number}`;
  return {
    number: row.phase_number,
    name,
    shortName: row.custom_name ?? staticPhase?.shortName ?? name,
    dayStart: row.day_start_override ?? staticPhase?.dayStart ?? 1,
    dayEnd: row.day_end_override ?? staticPhase?.dayEnd ?? 1,
    owner: staticPhase?.owner ?? "",
    sortOrder: row.sort_order,
    deliverables:
      deliverableRows.length > 0
        ? deliverableRows.map((d) => resolveEffectiveDeliverable(row.phase_number, d))
        : (staticPhase?.deliverables ?? []),
  };
}

// Deterministic, collision-resistant-enough deliverable_key for a PM-typed custom deliverable
// name — customer_deliverables' unique(customer_id, phase_number, deliverable_key) only needs
// uniqueness within one phase, so a slug + short suffix on empty/duplicate input is sufficient.
export function slugifyDeliverableKey(name: string, fallbackIndex: number): string {
  const slug = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug || `custom-deliverable-${fallbackIndex}`;
}

// ─── Configurable programme length (task 239) ────────────────────────────────
// StackShift I's programme length can be overridden per project at intake (default stays 120).
// PROGRAMME_PHASES' dayStart/dayEnd values are never mutated — they stay the fixed 1-120
// "reference" scale shared by every customer; scaleDay() converts a reference day into the real
// programme day for a project whose total length differs from the default, so display sites (Day
// X of Y, progress %, Gantt bar widths) and seed.ts's phase/deliverable day-range seeding can both
// derive the same real-calendar numbers from the one static config.
export const DEFAULT_PROGRAMME_DAYS = 120;

export function scaleDay(referenceDay: number, durationDays: number = DEFAULT_PROGRAMME_DAYS): number {
  if (durationDays === DEFAULT_PROGRAMME_DAYS) return referenceDay;
  return Math.max(1, Math.round((referenceDay * durationDays) / DEFAULT_PROGRAMME_DAYS));
}

// Inverse of scaleDay — converts a project's real elapsed programme day back into the fixed
// 1-120 reference scale, so PROGRAMME_PHASES/getPhaseForDay (which only know the reference
// scale) can be used to look up which phase a real (possibly custom-duration) day falls in.
export function unscaleDay(realDay: number, durationDays: number = DEFAULT_PROGRAMME_DAYS): number {
  if (durationDays === DEFAULT_PROGRAMME_DAYS) return realDay;
  return Math.max(1, Math.round((realDay * DEFAULT_PROGRAMME_DAYS) / durationDays));
}

// ─── Internal deliverables (QBR "2.3 Bert's Internal Deliverables") ─────────
// Marketing/admin-only checklist — never shown to PM/developer/hr. Mapped to whichever Phase 1
// sub-phase it conceptually belongs with (the QBR's own table carries no day/sub-phase
// attribution — see task 123 doc's mapping table for the keyword-match rationale per item).
export type InternalDeliverableConfig = {
  key: string;
  name: string;
  description: string;
  subPhaseKey: string;
};

export const INTERNAL_DELIVERABLES: InternalDeliverableConfig[] = [
  { key: "implementation-file", name: "Implementation file", description: "Full implementation plan document.", subPhaseKey: "migration-checklist" },
  { key: "html-md-files", name: "HTML and MD files", description: "Mockup files and markdown source content.", subPhaseKey: "html-mockup" },
  { key: "branding-guides", name: "Branding guides", description: "Logo, colour palette, typography specs.", subPhaseKey: "storage-kb" },
  { key: "kb-info-raw", name: "KB info (raw)", description: "Raw knowledge base content before formatting.", subPhaseKey: "storage-kb" },
  { key: "cluster-topics-schedules", name: "Cluster topics & schedules", description: "Content clusters and publishing schedule.", subPhaseKey: "content-map" },
  { key: "publishing-plan", name: "Publishing plan", description: "Planned content calendar and approval flow.", subPhaseKey: "content-map" },
  { key: "dns-details", name: "DNS details", description: "Access to their domain management.", subPhaseKey: "storage-kb" },
  { key: "credentials-external", name: "Credentials (for external integrations)", description: "e.g. HubSpot, payment gateway access.", subPhaseKey: "storage-kb" },
  // Kickoff completion checklist (task 129) — gates the Kickoff sub-phase's own status via the
  // same auto-derive-from-siblings logic used above; not part of the original QBR table.
  { key: "kickoff-meeting-held", name: "Kickoff meeting held", description: "A structured kickoff call took place with the client.", subPhaseKey: "kickoff" },
  { key: "kickoff-contacts-confirmed", name: "Contacts confirmed", description: "At least one verified client contact is on file.", subPhaseKey: "kickoff" },
  { key: "kickoff-goals-timeline-filed", name: "Goals, timeline and other important details filed", description: "Captured in Business Facts / meeting notes.", subPhaseKey: "kickoff" },
  // Outcome Target completion checklist (task 130) — gates the sub-phase's own status via the
  // same auto-derive-from-siblings logic used above; not part of the original QBR table.
  { key: "outcome-target-filed", name: "Agreed measurable outcomes for the 120-day programme filed", description: "Recorded as text or an attached document.", subPhaseKey: "outcome-target" },
  // Client sign-off completion checklist (task 135) — gates the sub-phase's own status via the
  // same auto-derive-from-siblings logic used above; not part of the original QBR table.
  { key: "signoff-call-held", name: "Sign-off call held with the client, PM joining for handover", description: "A structured sign-off call took place.", subPhaseKey: "client-signoff" },
  { key: "signoff-agreement-filed", name: "Scope, mockup, and migration plan approval recorded", description: "Recorded as notes or a signed agreement.", subPhaseKey: "client-signoff" },
];

export function getInternalDeliverable(key: string): InternalDeliverableConfig | undefined {
  return INTERNAL_DELIVERABLES.find((d) => d.key === key);
}

export function internalDeliverablesForSubPhase(subPhaseKey: string): InternalDeliverableConfig[] {
  return INTERNAL_DELIVERABLES.filter((d) => d.subPhaseKey === subPhaseKey);
}

// ─── Classification (New Project intake) ────────────────────────────────────
// Service-tier/engagement-type axis — distinct from customer_products.product_name (the
// underlying software platform). See task 123 doc's "Key Design Decisions" for the rationale.
export const CLASSIFICATIONS = [
  "StackShift I",
  "StackShift II",
  "StackShift Access",
  "StackShift Access Plus",
  "PipelineForge",
  "Discrete Development",
] as const;
export type Classification = (typeof CLASSIFICATIONS)[number];

export function deriveProductName(classification: Classification): "StackShift" | "PipelineForge" {
  return classification === "PipelineForge" ? "PipelineForge" : "StackShift";
}

export function deriveProjectSuffix(classification: Classification): "Website" | "App" {
  return classification === "Discrete Development" ? "App" : "Website";
}

export function deriveProjectType(classification: Classification): "Content Site" | "Custom App" {
  return classification === "Discrete Development" ? "Custom App" : "Content Site";
}

// Task 157: multi-select classification support. At most one StackShift variant may be
// selected at a time (swap, not blocked, on the picker's UI side); PipelineForge and Discrete
// Development are free to combine with it or with each other. These *Multi functions generalize
// the single-value ones above to arrays — the single-value functions are kept for any other call
// sites, not removed.
export const STACKSHIFT_VARIANTS: Classification[] = ["StackShift I", "StackShift II", "StackShift Access", "StackShift Access Plus"];

export function isValidClassificationCombo(selected: Classification[]): boolean {
  if (selected.length === 0) return false;
  return selected.filter((c) => STACKSHIFT_VARIANTS.includes(c)).length <= 1;
}

// Preserves today's single-value fallback (a Discrete-Development-only selection resolves to
// "StackShift", same pre-existing quirk as deriveProductName) — confirmed with the user rather
// than silently changed.
export function deriveProductNamesMulti(selected: Classification[]): ("StackShift" | "PipelineForge")[] {
  const hasStackShift = selected.some((c) => STACKSHIFT_VARIANTS.includes(c));
  const hasPipelineForge = selected.includes("PipelineForge");
  const names: ("StackShift" | "PipelineForge")[] = [];
  if (hasStackShift) names.push("StackShift");
  if (hasPipelineForge) names.push("PipelineForge");
  if (names.length === 0) names.push("StackShift");
  return names;
}

export function deriveProjectSuffixMulti(selected: Classification[]): "Website" | "App" {
  return selected.includes("Discrete Development") ? "App" : "Website";
}

export function deriveProjectTypeMulti(selected: Classification[]): "Content Site" | "Custom App" {
  return selected.includes("Discrete Development") ? "Custom App" : "Content Site";
}

// ─── Generic phase plan (task 239) ───────────────────────────────────────────
// Every classification except StackShift I stores its phases/deliverables/checklist in the
// generic milestones/tasklists/tasks tables (see seed-custom-phases.ts) instead of
// customer_phases/customer_deliverables. This is the shape a New Project wizard submission
// sends for that seeding.
//
// dayStart/dayEnd (task 252): the free-form phase builder now captures a day range per phase
// (PM-editable, same "Day X to Y" control fixed-phases mode already had) — required here, not
// nullable, since phasePlanDraftToInput always resolves a value before submission (falls back to
// a sensible default if a PM somehow leaves it unset). A deliverable's own range is never
// separately PM-edited — auto-distributed across its phase's range via applyDeliverableDayRanges,
// mirroring how StackShift I's own Phase 2-5 deliverables are already distributed.
export type ChecklistItemPlan = { title: string };
export type DeliverablePlan = { name: string; dayStart: number; dayEnd: number; checklist: ChecklistItemPlan[] };
export type PhasePlan = { name: string; dayStart: number; dayEnd: number; deliverables: DeliverablePlan[] };
export type PhasePlanInput = { phases: PhasePlan[] };

// ─── Custom phases beyond the fixed 5 (task 246) ─────────────────────────────
// Wire shape carried from the New Project wizard (fixed-phases mode's "Add custom phase") through
// POST /api/onboarding/projects into seed.ts. `phaseNumber` is a caller-assigned stable identity
// (must not collide with 1-5 or any other custom phase in the same submission — the wizard assigns
// these via a running counter, see _new-project-types.ts); `sortOrder` is purely display position
// among the full phase set (defaults + customs) for this project. Deliverables carry no day range
// (matches the generic phase_plan's DeliverablePlan shape, task 239) — a custom phase's day range
// lives on the phase itself only.
export type CustomPhaseSeed = {
  phaseNumber: number;
  sortOrder: number;
  name: string;
  dayStart: number;
  dayEnd: number;
  // Task 249: every custom phase (always number 6+, never "Onboard") gets its deliverables'
  // day sub-ranges computed via applyDeliverableDayRanges below, same as a default phase 2-5 —
  // day granularity is no longer optional/absent for custom deliverables.
  deliverables: { name: string; dayStart: number; dayEnd: number }[];
};

// ─── Auto-distributed deliverable day ranges (task 249) ──────────────────────
// Largest-remainder method: split `totalDays` as evenly as possible across `count` deliverables,
// giving the extra day(s) to the first entries in order. `count <= 0` returns `[]`. `base` is
// floored at 1 — a phase span shorter than its own deliverable count is a validation error
// surfaced in the wizard (see _new-project-types.ts's phasePlanValidationErrors), not a silent
// clamp; distributeDaysAcrossCount itself just never returns a non-positive size.
//
// Worked example (from the request): distributeDaysAcrossCount(15, 6) -> [3, 3, 3, 2, 2, 2].
export function distributeDaysAcrossCount(totalDays: number, count: number): number[] {
  if (count <= 0) return [];
  const base = Math.max(1, Math.floor(totalDays / count));
  const remainder = Math.max(0, totalDays - base * count);
  return Array.from({ length: count }, (_, i) => base + (i < remainder ? 1 : 0));
}

// Converts distributeDaysAcrossCount's sizes into absolute, sequential [dayStart, dayEnd] pairs
// starting at `dayStart` — the shape both the wizard's read-only deliverable badges and
// customPhasesFromDraft/defaultPhaseOverridesFromDraft (_new-project-types.ts) need. Deliberately
// takes primitive dayStart/dayEnd/count (not a PhaseDraft) so this stays here alongside
// distributeDaysAcrossCount without importing the wizard-only PhaseDraft type (which itself
// imports from this module — a PhaseDraft param would be a circular import).
export function applyDeliverableDayRanges(dayStart: number, dayEnd: number, count: number): { dayStart: number; dayEnd: number }[] {
  const sizes = distributeDaysAcrossCount(dayEnd - dayStart + 1, count);
  let cursor = dayStart;
  return sizes.map((size) => {
    const start = cursor;
    const end = cursor + size - 1;
    cursor = end + 1;
    return { dayStart: start, dayEnd: end };
  });
}

// ─── Per-phase day-range + deliverable-distribution overrides for the 5 defaults (task 249) ──
// Wire shape carried from the New Project wizard through POST /api/onboarding/projects into
// seed.ts — the default-phase counterpart to CustomPhaseSeed above. `deliverables` is omitted for
// Phase 1/Onboard (its deliverables' day ranges are never redistributed, per the request) and for
// any phase 2-5 entry the PM didn't touch; when present, `key` must match that phase's static
// PROGRAMME_PHASES deliverable key so seed.ts's override lookup can match it.
export type DefaultPhaseOverride = {
  phaseNumber: number;
  dayStart: number;
  dayEnd: number;
  deliverables?: { key: string; dayStart: number; dayEnd: number }[];
};

// ─── Ordered phase plan: defaults + customs merged (task 248) ───────────────
// Shared core of "merge PROGRAMME_PHASES' 5 defaults with any PM-added custom phases into one
// sort_order-ordered list" — extracted from seed.ts's buildSeedPhaseEntries (task 246) so the
// same merge+sort+dense-reindex logic isn't duplicated between the server-side seed path and the
// Portfolio Tracker "not started" screen's dynamic Start button / skip-aware Jump-to-phase menu
// (task 248), which both need to agree on phase order and day ranges before any customer_phases
// row exists yet. seed.ts's buildSeedPhaseEntries wraps this, adding its own deliverable rows on
// top — this function only carries what a phase-level (not deliverable-level) consumer needs.
export type OrderedPhaseSummary = {
  number: number;
  name: string;
  dayStart: number;
  dayEnd: number;
  sortOrder: number;
  isCustom: boolean;
};

export function buildOrderedPhasePlan(customPhases: CustomPhaseSeed[] = []): OrderedPhaseSummary[] {
  const defaults: OrderedPhaseSummary[] = PROGRAMME_PHASES.map((p) => ({
    number: p.number,
    name: p.name,
    dayStart: p.dayStart,
    dayEnd: p.dayEnd,
    sortOrder: p.number,
    isCustom: false,
  }));
  const customs: OrderedPhaseSummary[] = customPhases.map((c) => ({
    number: c.phaseNumber,
    name: c.name,
    dayStart: c.dayStart,
    dayEnd: c.dayEnd,
    sortOrder: c.sortOrder,
    isCustom: true,
  }));
  // Dense-reindexed to 1..N here (not left as the fractional sortOrder custom phases carry) —
  // mirrors seed.ts's own existing behavior exactly, so a custom phase's sortOrder colliding with
  // a default's resolves the same way in both places (stable sort keeps the default first).
  return [...defaults, ...customs]
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((entry, i) => ({ ...entry, sortOrder: i + 1 }));
}
