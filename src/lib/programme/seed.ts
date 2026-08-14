import { adminClient } from "@/lib/supabase/admin";
import { sendCliqNotification } from "@/lib/zoho";
import {
  PROGRAMME_PHASES,
  INTERNAL_DELIVERABLES,
  getCurrentProgrammeDay,
  scaleDay,
  DEFAULT_PROGRAMME_DAYS,
  resolveEffectivePhaseNumber,
  resolveEffectiveStartDay,
  slugifyDeliverableKey,
  buildOrderedPhasePlan,
  type CustomPhaseSeed,
  type DefaultPhaseOverride,
} from "@/config/customer-phases";

// Task 246: unifies PROGRAMME_PHASES' 5 defaults with any PM-added custom phases into one ordered
// list both seed functions below build their customer_phases/customer_deliverables rows from —
// this is what lets a custom phase participate in the same before/target/after cascade as the
// defaults. Default entries carry no override columns (customName/dayStart/dayEnd stay implicitly
// the static PROGRAMME_PHASES values — the DB row's own custom_name/day_start_override/
// day_end_override are left null, so backward compatibility is exact); custom entries fill them.
type SeedPhaseEntry = {
  number: number;
  sortOrder: number;
  isCustom: boolean;
  name: string;
  dayStart: number;
  dayEnd: number;
  // Task 249: every deliverable now always carries a day range — the 5 static defaults always
  // did, and a custom phase's deliverables now do too (CustomPhaseSeed.deliverables, computed via
  // applyDeliverableDayRanges in the wizard/customPhasesFromDraft) — so seedProgrammeAtPhase's
  // day-based "in_progress" check below can now fire for custom-phase deliverables too, where it
  // previously always fell back to "pending" for them.
  deliverables: { key: string; name: string; dayStart: number; dayEnd: number }[];
};

// Task 249 (Requirement E): the 5 static defaults' own PROGRAMME_PHASES day ranges, keyed by
// phase number, so seedAndStartProgramme/seedProgrammeAtPhase's "did this differ from the static
// default" checks (below) don't re-derive the lookup on every call.
const STATIC_PHASE_BY_NUMBER = new Map(PROGRAMME_PHASES.map((p) => [p.number, p]));

// Task 248: the merge/sort/dense-reindex core moved to buildOrderedPhasePlan (customer-phases.ts),
// shared with the Portfolio Tracker "not started" screen's own dynamic Start button/Jump-to-phase
// menu — this function now only adds the deliverable rows a seed pass needs on top of that shared
// ordering. sortOrder/isCustom/day-range semantics are byte-identical to before this extraction
// (see buildOrderedPhasePlan's own doc comment for the "defaults always sortOrder === phase_number,
// customs dense-reindexed to 1..N" rule this preserves).
//
// Task 249 (Requirement E): `defaultPhaseOverrides` layers the PM's intake-time day-range edits
// (and, for phase 2-5, their computed deliverable day sub-ranges) on top of the 5 static
// defaults' own PROGRAMME_PHASES values — applied here, after buildOrderedPhasePlan's own
// merge/sort, so a default phase's overridden dayStart/dayEnd still participates correctly in
// sort order (unaffected — defaults always sort by phase_number regardless of day range) and in
// resolveEffectivePhaseNumber's before/target/after cascade (unaffected — that only reads
// sortOrder, not day values). Custom phases are untouched by this param (they have no static
// counterpart to override; entry.isCustom short-circuits below).
function buildSeedPhaseEntries(customPhases: CustomPhaseSeed[], defaultPhaseOverrides: DefaultPhaseOverride[] = []): SeedPhaseEntry[] {
  const overrideByNumber = new Map(defaultPhaseOverrides.map((o) => [o.phaseNumber, o]));
  const deliverablesByNumber = new Map<number, SeedPhaseEntry["deliverables"]>();
  for (const p of PROGRAMME_PHASES) {
    const deliverableOverrideByKey = new Map((overrideByNumber.get(p.number)?.deliverables ?? []).map((d) => [d.key, d]));
    deliverablesByNumber.set(
      p.number,
      p.deliverables.map((d) => {
        const override = deliverableOverrideByKey.get(d.key);
        return { key: d.key, name: d.name, dayStart: override?.dayStart ?? d.dayStart, dayEnd: override?.dayEnd ?? d.dayEnd };
      })
    );
  }
  for (const c of customPhases) {
    deliverablesByNumber.set(
      c.phaseNumber,
      c.deliverables.map((d, i) => ({ key: slugifyDeliverableKey(d.name, i), name: d.name, dayStart: d.dayStart, dayEnd: d.dayEnd }))
    );
  }
  return buildOrderedPhasePlan(customPhases).map((entry) => {
    const override = !entry.isCustom ? overrideByNumber.get(entry.number) : undefined;
    return {
      number: entry.number,
      sortOrder: entry.sortOrder,
      isCustom: entry.isCustom,
      name: entry.name,
      dayStart: override?.dayStart ?? entry.dayStart,
      dayEnd: override?.dayEnd ?? entry.dayEnd,
      deliverables: deliverablesByNumber.get(entry.number) ?? [],
    };
  });
}

// Task 249 (Requirement E): widens the old `p.isCustom ? p.dayStart : null` override-write gate —
// a default phase whose PM-edited day range now differs from its own static PROGRAMME_PHASES
// value also needs day_start_override/day_end_override written (a custom phase, having no static
// counterpart, always writes its own values, same as before this task).
function phaseDayOverride(p: SeedPhaseEntry): { dayStartOverride: number | null; dayEndOverride: number | null } {
  const staticPhase = STATIC_PHASE_BY_NUMBER.get(p.number);
  const differs = p.isCustom || !staticPhase || staticPhase.dayStart !== p.dayStart || staticPhase.dayEnd !== p.dayEnd;
  return { dayStartOverride: differs ? p.dayStart : null, dayEndOverride: differs ? p.dayEnd : null };
}

// Task 249 (Requirement E): same "differs from the static default" widening as phaseDayOverride
// above, at the deliverable level — writes customer_deliverables.day_start_override/
// day_end_override (migration 071, already the drag-resize Timeline's own override columns; this
// is a second writer, at seed time) whenever a phase 2-5 deliverable's computed range differs
// from its own static PROGRAMME_PHASES value, or whenever it belongs to a custom phase (no static
// counterpart, always overridden). Never fires for Phase 1/Onboard deliverables, since their
// `d.dayStart`/`d.dayEnd` are never anything but their own static value (Requirement B's
// exclusion — buildSeedPhaseEntries never applies a deliverable override for phase 1, since
// defaultPhaseOverridesFromDraft never sends one).
function deliverableDayOverride(phaseNumber: number, d: { key: string; dayStart: number; dayEnd: number }, isCustomPhase: boolean) {
  const staticDeliverable = STATIC_PHASE_BY_NUMBER.get(phaseNumber)?.deliverables.find((sd) => sd.key === d.key);
  const differs = isCustomPhase || !staticDeliverable || staticDeliverable.dayStart !== d.dayStart || staticDeliverable.dayEnd !== d.dayEnd;
  return { dayStartOverride: differs ? d.dayStart : null, dayEndOverride: differs ? d.dayEnd : null };
}

// Task 241, fixed by task 243: seeds one `milestones` row per Phase 2-5 plus a `tasklists` row
// per deliverable in that phase, so the Timeline's Phase 2-5 deliverable cards can link into
// Projects > Tasks. `external_id` is scoped by `project.id` — both `milestones.external_id` and
// `tasklists.external_id` carry a table-wide UNIQUE constraint (originally sized for Zoho's own
// globally-unique import IDs), so an unscoped key like `programme-phase-2` collides across every
// project that starts its programme after the first one. Uses `upsert(..., ignoreDuplicates)`
// rather than `insert` so this is safe to call more than once for the same project — both from
// `seedAndStartProgramme`'s normal one-time path and from the read-side backfill in
// `GET /api/projects/[projectId]/programme` for projects that hit the pre-fix collision bug.
export async function seedPhase2to5Links(project: { id: string }): Promise<void> {
  for (const phase of PROGRAMME_PHASES.filter((p) => p.number !== 1)) {
    const milestoneExternalId = `programme-phase-${project.id}-${phase.number}`;
    const { data: upsertedRows, error: milestoneError } = await adminClient
      .from("milestones")
      .upsert(
        { project_id: project.id, external_id: milestoneExternalId, name: phase.name, status: "planned" },
        { onConflict: "external_id", ignoreDuplicates: true }
      )
      .select("id");
    if (milestoneError) {
      console.error("seedPhase2to5Links: Phase 2-5 milestone upsert error:", milestoneError);
      continue;
    }
    // ignoreDuplicates skips (and returns no row for) a conflict, e.g. a racing concurrent call
    // that already inserted this project's milestone — look the id up instead of treating that
    // as a failure.
    let milestoneId: string | undefined = upsertedRows?.[0]?.id;
    if (!milestoneId) {
      const { data: existing } = await adminClient
        .from("milestones")
        .select("id")
        .eq("external_id", milestoneExternalId)
        .maybeSingle();
      milestoneId = existing?.id;
    }
    if (!milestoneId) {
      console.error("seedPhase2to5Links: Phase 2-5 milestone id unresolved after upsert for", milestoneExternalId);
      continue;
    }
    const tasklistRows = phase.deliverables.map((d, i) => ({
      project_id: project.id,
      milestone_id: milestoneId,
      external_id: `programme-deliverable-${project.id}-${phase.number}-${d.key}`,
      name: d.name,
      position: i,
    }));
    const { error: tasklistError } = await adminClient
      .from("tasklists")
      .upsert(tasklistRows, { onConflict: "external_id", ignoreDuplicates: true });
    if (tasklistError) console.error("seedPhase2to5Links: Phase 2-5 tasklist upsert error:", tasklistError);
  }
}

// Shared by the manual "Start Onboarding" route, the New Project intake's `mode: "start"` path,
// and the scheduled auto-start cron — all three need identical seed semantics. Uses adminClient
// throughout (not just for the projects update) because the cron caller has no user session at
// all; this is the documented server-only, session-less write path exception (CLAUDE.md).
//
// startedByUserId (task 153): the user who clicked "Start Onboarding" becomes Phase 1's owner.
// Optional because the scheduled auto-start cron has no user session — a cron-started project's
// Phase 1 simply has zero members, which the app treats as unrestricted (see task 153 doc's
// "Backward compatibility" section), not an error.
//
// phaseNumber (chat follow-up to task 157): lets a scheduled start land on Phase 2-5 instead of
// always Day 1/Phase 1 — mirrors the Timeline's existing manual "Jump to phase" override
// (PATCH .../programme/phase) exactly: earlier phases marked "skipped", the target phase
// "active" and backdated so "today" lands on its first day, later phases "not_started". Phase
// membership (phase_members) stays Phase-1-only, matching every other phase_members call site in
// this codebase — phases 2-5 have no Wizard/membership-gated entry concept to assign.
//
// durationDays (task 239): StackShift I's configurable programme length. PROGRAMME_PHASES' own
// dayStart/dayEnd stay the fixed 1-120 reference scale; scaleDay() converts each reference day
// into the real calendar day for this project before it's used to backdate `startedAt`. Default
// 120 behaves byte-identical to before this param existed.
//
// skipPhaseNumbers (task 244): the phase numbers a PM opted this one project out of at intake —
// never removed from the phase_number model (every project still gets a `customer_phases` row
// for each phase in its plan), just seeded with `status: "skipped"` and zero `customer_deliverables`
// rows, reusing the exact status value the "jump to phase" override below already produces for
// phases bypassed by time. If the requested target `phaseNumber` itself is in the skip set (e.g.
// the default Phase 1 is explicitly excluded), the earliest (by sort_order) non-skipped phase
// becomes the effective "active"/backdated phase instead — so `startedAt` never backdates against
// a phase that was never going to run. If every phase is skipped, there's no valid "active" phase;
// the requested phaseNumber is used as-is purely for the (now moot) backdate math, and every phase
// row is seeded "skipped".
//
// customPhases (task 246): any phases the PM added beyond the fixed 5 at intake, via the New
// Project wizard's PhaseBuilder — merged with PROGRAMME_PHASES into one sort_order-ordered list
// (buildSeedPhaseEntries) that both the seeding below and the before/target/after cascade operate
// over uniformly. Empty by default — a project with no custom phases seeds byte-identically to
// pre-task-246 behavior.
//
// defaultPhaseOverrides (task 249): the PM's intake-time day-range edits to the 5 default phases
// (and, for phase 2-5, their computed deliverable day sub-ranges) — see buildSeedPhaseEntries's
// own doc comment. Empty by default — a project with no default-phase overrides seeds
// byte-identically to pre-task-249 behavior.
export async function seedAndStartProgramme(
  project: { id: string; customer_id: string },
  companyName: string,
  startedByUserId?: string | null,
  phaseNumber: number = 1,
  durationDays: number = DEFAULT_PROGRAMME_DAYS,
  skipPhaseNumbers: number[] = [],
  customPhases: CustomPhaseSeed[] = [],
  defaultPhaseOverrides: DefaultPhaseOverride[] = []
): Promise<{ error?: string }> {
  const skipSet = new Set(skipPhaseNumbers);
  const entries = buildSeedPhaseEntries(customPhases, defaultPhaseOverrides);
  const allSkipped = entries.every((p) => skipSet.has(p.number));
  const effectivePhaseNumber = resolveEffectivePhaseNumber(entries, phaseNumber, skipPhaseNumbers);
  const targetPhase = entries.find((p) => p.number === effectivePhaseNumber)!;
  const today = new Date().toISOString().slice(0, 10);

  // Chat follow-up to task 244: backdates against the skip-compressed start day, not
  // targetPhase's own static dayStart — an earlier skipped phase's days never happened for this
  // project, so they shouldn't count as already-elapsed time either (see resolveEffectiveStartDay's
  // own doc comment). Identical to the old `targetPhase.dayStart` whenever nothing earlier is
  // skipped.
  const effectiveStartDay = resolveEffectiveStartDay(entries, effectivePhaseNumber, skipPhaseNumbers);
  const startedAt = new Date();
  startedAt.setDate(startedAt.getDate() - (scaleDay(effectiveStartDay, durationDays) - 1));

  const { error: updateError } = await adminClient
    .from("projects")
    .update({ programme_started_at: startedAt.toISOString() })
    .eq("id", project.id);
  if (updateError) {
    console.error("seedAndStartProgramme: projects update error:", updateError);
    return { error: "Failed to start programme" };
  }

  const phaseRows = entries.map((p) => {
    const { dayStartOverride, dayEndOverride } = phaseDayOverride(p);
    return {
      customer_id: project.customer_id,
      project_id: project.id,
      phase_number: p.number,
      sort_order: p.sortOrder,
      custom_name: p.isCustom ? p.name : null,
      day_start_override: dayStartOverride,
      day_end_override: dayEndOverride,
      status: skipSet.has(p.number)
        ? "skipped"
        : p.number === effectivePhaseNumber
          ? "active"
          : p.sortOrder < targetPhase.sortOrder
            ? "skipped"
            : "not_started",
      actual_start_date: !skipSet.has(p.number) && p.number === effectivePhaseNumber ? today : null,
      is_manual_override: effectivePhaseNumber !== 1 && p.number === effectivePhaseNumber,
    };
  });
  // Excluded phases get zero deliverable rows — they were never applicable to this engagement
  // (unlike a phase merely bypassed by a time-based "jump to phase", which did happen, just
  // before "now", and keeps its deliverable rows).
  const deliverableRows = entries
    .filter((p) => !skipSet.has(p.number))
    .flatMap((p) =>
      p.deliverables.map((d) => {
        const { dayStartOverride, dayEndOverride } = deliverableDayOverride(p.number, d, p.isCustom);
        return {
          customer_id: project.customer_id,
          project_id: project.id,
          phase_number: p.number,
          deliverable_key: d.key,
          custom_name: p.isCustom ? d.name : null,
          day_start_override: dayStartOverride,
          day_end_override: dayEndOverride,
          // Kickoff is Phase 1's first sub-phase — it starts "in_progress" the moment onboarding
          // begins, rather than sitting at "pending" until the first checklist item is touched.
          // Only ever matches when effectivePhaseNumber is 1, since "kickoff" only exists in
          // Phase 1's list.
          status: p.number === effectivePhaseNumber && d.key === "kickoff" ? "in_progress" : "pending",
        };
      })
    );
  const internalDeliverableRows = INTERNAL_DELIVERABLES.map((d) => ({
    project_id: project.id,
    deliverable_key: d.key,
  }));

  const [phasesRes, deliverablesRes, internalRes] = await Promise.all([
    adminClient.from("customer_phases").insert(phaseRows),
    adminClient.from("customer_deliverables").insert(deliverableRows),
    adminClient.from("onboarding_internal_deliverables").insert(internalDeliverableRows),
  ]);
  if (phasesRes.error || deliverablesRes.error || internalRes.error) {
    console.error(
      "seedAndStartProgramme: seed error:",
      phasesRes.error ?? deliverablesRes.error ?? internalRes.error
    );
    return { error: "Failed to seed programme phases" };
  }

  // Task 241 (bug fix: task 243): parallel generic-model rows for Phase 2-5 (Phase 1 has no
  // generic-model presence — task 222's Onboarding Workspace is its equivalent surface) so the
  // Timeline's Phase 2-5 deliverable cards can link into Projects > Tasks. Non-fatal: losing
  // these rows shouldn't block the actual programme start (the function's primary job) — the
  // swimlane redirect degrades to a bare /tasks link when a mapping is missing.
  await seedPhase2to5Links(project);

  if (startedByUserId) {
    // Task 244: only grant Phase 1 ownership when Phase 1 is actually the active phase. In the
    // all-skipped edge case, effectivePhaseNumber falls back to the raw requested phaseNumber
    // (default 1) purely for the backdate math above — Phase 1's customer_phases row is still
    // seeded "skipped" in that case, so inserting phase_members here would claim ownership of a
    // phase that never runs.
    if (effectivePhaseNumber === 1 && !allSkipped) {
      await adminClient.from("phase_members").insert({
        project_id: project.id,
        phase_number: 1,
        user_id: startedByUserId,
        is_owner: true,
        added_by: startedByUserId,
      });
    }
    // Starting onboarding should never leave the starter unable to find their own project on
    // the list afterward — ensure project-level membership too, regardless of which (if any)
    // phase ended up active. ignoreDuplicates: the starter may already be a project member (e.g.
    // they created it). Deliberately non-owner (task 155) — a project only gets an owner via
    // creation or an explicit Super Admin transfer, not implicitly via starting Phase 1.
    await adminClient
      .from("project_members")
      .upsert(
        { project_id: project.id, user_id: startedByUserId, added_by: startedByUserId },
        { onConflict: "project_id,user_id", ignoreDuplicates: true }
      );
  }

  await sendCliqNotification(
    allSkipped
      ? `120-Day Programme created for ${companyName} — every default phase was excluded for this project; no phase is active.`
      : effectivePhaseNumber === 1
        ? `120-Day Programme started for ${companyName} — Day 1, Phase 1: Onboard (owner: Bert).`
        : `120-Day Programme started for ${companyName} at Phase ${effectivePhaseNumber}: ${targetPhase.name}.`,
    "pm"
  );
  return {};
}

// Task 159 — shared by the manual "Jump to phase" override's not-started branch (PATCH
// .../programme/phase) and the CSV/Excel bulk-import route, which both need to seed all 5
// phases at an explicit, caller-supplied start date/phase rather than "now"/"today" (that's
// seedAndStartProgramme's job, above). is_manual_override mirrors seedAndStartProgramme's own
// convention: landing on Phase 1 is a normal onboarding start, not a manual override; only
// landing on Phase 2-5 counts as one.
//
// skipPhaseNumbers (task 244): same semantics as seedAndStartProgramme's own param — see that
// function's doc comment. The caller (programme/phase/route.ts) resolves the same effective
// phase number via `resolveEffectivePhaseNumber` before computing `startedAt`'s backdate, so the
// `phaseNumber` this function receives is already the effective one — it doesn't re-resolve here
// (unlike seedAndStartProgramme, which owns its own backdate math end-to-end).
//
// customPhases (task 246): same semantics as seedAndStartProgramme's own param — see that
// function's doc comment.
//
// defaultPhaseOverrides (task 249): same semantics as seedAndStartProgramme's own param — see
// buildSeedPhaseEntries's doc comment.
export async function seedProgrammeAtPhase(
  project: { id: string; customer_id: string },
  phaseNumber: number,
  startedAt: Date,
  note?: string | null,
  durationDays: number = DEFAULT_PROGRAMME_DAYS,
  skipPhaseNumbers: number[] = [],
  customPhases: CustomPhaseSeed[] = [],
  defaultPhaseOverrides: DefaultPhaseOverride[] = []
): Promise<{ error?: string }> {
  const skipSet = new Set(skipPhaseNumbers);
  const entries = buildSeedPhaseEntries(customPhases, defaultPhaseOverrides);
  const targetPhase = entries.find((p) => p.number === phaseNumber);
  const targetSortOrder = targetPhase?.sortOrder ?? -Infinity;
  const today = startedAt.toISOString().slice(0, 10);

  const { error: updateError } = await adminClient
    .from("projects")
    .update({ programme_started_at: startedAt.toISOString() })
    .eq("id", project.id);
  if (updateError) {
    console.error("seedProgrammeAtPhase: projects update error:", updateError);
    return { error: "Failed to set programme start date" };
  }

  const phaseRows = entries.map((p) => {
    const { dayStartOverride, dayEndOverride } = phaseDayOverride(p);
    return {
      customer_id: project.customer_id,
      project_id: project.id,
      phase_number: p.number,
      sort_order: p.sortOrder,
      custom_name: p.isCustom ? p.name : null,
      day_start_override: dayStartOverride,
      day_end_override: dayEndOverride,
      status: skipSet.has(p.number)
        ? "skipped"
        : p.number === phaseNumber
          ? "active"
          : p.sortOrder < targetSortOrder
            ? "skipped"
            : "not_started",
      actual_start_date: !skipSet.has(p.number) && p.number === phaseNumber ? today : null,
      is_manual_override: phaseNumber !== 1 && p.number === phaseNumber,
      override_note: p.number === phaseNumber ? (note ?? null) : null,
    };
  });
  // Which sub-phase is "active" — the one whose day range contains the programme's current
  // elapsed day (from `startedAt`, which may be backdated: a CSV import's real Kickoff Date, or
  // a Jump-to-Phase landing) — generalizes seedAndStartProgramme's hardcoded "kickoff starts
  // in_progress on Day 1" convention to work for any starting day, not just Day 1. Task 249: a
  // custom phase's deliverables now carry a computed day range too (previously always undefined,
  // so this could never fire for them) — this now applies uniformly to every deliverable.
  const currentDay = getCurrentProgrammeDay(startedAt);
  const deliverableRows = entries
    .filter((p) => !skipSet.has(p.number))
    .flatMap((p) =>
      p.deliverables.map((d) => {
        const { dayStartOverride, dayEndOverride } = deliverableDayOverride(p.number, d, p.isCustom);
        return {
          customer_id: project.customer_id,
          project_id: project.id,
          phase_number: p.number,
          deliverable_key: d.key,
          custom_name: p.isCustom ? d.name : null,
          day_start_override: dayStartOverride,
          day_end_override: dayEndOverride,
          status:
            currentDay >= scaleDay(d.dayStart, durationDays) && currentDay <= scaleDay(d.dayEnd, durationDays) ? "in_progress" : "pending",
        };
      })
    );
  const internalDeliverableRows = INTERNAL_DELIVERABLES.map((d) => ({
    project_id: project.id,
    deliverable_key: d.key,
  }));

  const [phasesRes, deliverablesRes, internalRes] = await Promise.all([
    adminClient.from("customer_phases").insert(phaseRows),
    adminClient.from("customer_deliverables").insert(deliverableRows),
    adminClient.from("onboarding_internal_deliverables").insert(internalDeliverableRows),
  ]);
  if (phasesRes.error || deliverablesRes.error || internalRes.error) {
    console.error(
      "seedProgrammeAtPhase: seed error:",
      phasesRes.error ?? deliverablesRes.error ?? internalRes.error
    );
    return { error: "Failed to seed programme phases" };
  }

  return {};
}
