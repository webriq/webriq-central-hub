import { PROGRAMME_PHASES, resolveEffectivePhase } from "@/config/customer-phases";
import { asDisplayDay, createProgrammeCalendar, displayDayToYmd, referenceSpansOf } from "./calendar";

// Task 428 — pure planner for merging `customer_phases` / `customer_deliverables` into the unified
// `project_phases` / `project_deliverables` (+ `phase_programme_state`). No I/O: the dry-run script feeds it rows
// and prints the plan; `backfill-sql.ts` turns the same plan into SQL. Idempotent: a second run over already-merged
// rows plans every row as `unchanged`.

// ─── Inputs ───────────────────────────────────────────────────────────────────────────────────
export type ProjectIn = {
  id: string;
  project_id: string | null;
  programme_started_at: string | null;
  programme_duration_days: number | null;
  draft_skip_phase_numbers: number[] | null;
};
export type CustomerPhaseIn = {
  project_id: string; phase_number: number; status: string; sort_order: number;
  actual_start_date: string | null; actual_completed_date: string | null;
  is_manual_override: boolean; override_note: string | null; delay_note: string | null; wizard_data: unknown;
  custom_name: string | null; day_start_override: number | null; day_end_override: number | null;
};
export type CustomerDeliverableIn = {
  project_id: string; phase_number: number; deliverable_key: string; status: string; completed_at: string | null;
  custom_name: string | null; custom_description: string | null; custom_owner: string | null;
  day_start_override: number | null; day_end_override: number | null;
};
export type ExistingPhase = {
  id: string; project_id: string; external_id: string | null; name: string; description: string | null;
  start_date: string | null; due_date: string | null; status: string; position: number | null;
  day_start: number | null; day_end: number | null; phase_number: number | null; owner_label: string | null;
  actual_start_date: string | null; actual_completed_date: string | null; source: string;
};
export type ExistingDeliverable = {
  id: string; project_id: string; external_id: string | null; phase_id: string | null; name: string; description: string | null;
  owner_label: string | null; start_date: string | null; due_date: string | null; day_start: number | null; day_end: number | null;
  position: number | null; status: string; completed_at: string | null; deliverable_key: string | null; source: string; is_default: boolean | null;
};
export type PlanInput = {
  projects: ProjectIn[]; phases: CustomerPhaseIn[]; deliverables: CustomerDeliverableIn[];
  existingPhases: ExistingPhase[]; existingDeliverables: ExistingDeliverable[];
  taskCountByDeliverable?: Map<string, number>;
  newId: () => string;
};

// ─── Outputs ──────────────────────────────────────────────────────────────────────────────────
export type PhaseRow = Omit<ExistingPhase, "id">;
export type DeliverableRow = Omit<ExistingDeliverable, "id">;
export type StateRow = { phase_id: string; wizard_data: unknown; is_manual_override: boolean; override_note: string | null; delay_note: string | null };
export type Matched = "scoped" | "legacy-unscoped" | "already-merged" | "none";
export type PhaseOp = { action: "insert" | "update" | "unchanged"; id: string; matchedBy: Matched; bucket: string; row: PhaseRow; state: StateRow };
export type DeliverableOp = { action: "insert" | "update" | "unchanged"; id: string; matchedBy: Matched; bucket: string; row: DeliverableRow };
export type OrphanOp = { id: string; project_id: string; external_id: string | null; kind: "deliverable" | "phase"; hasTasks: boolean };
export type Plan = { phases: PhaseOp[]; deliverables: DeliverableOp[]; orphans: OrphanOp[]; ambiguities: string[] };

const countBy = <T,>(items: T[], key: (t: T) => string) => items.reduce<Record<string, number>>((m, t) => ((m[key(t)] = (m[key(t)] ?? 0) + 1), m), {});

export const phaseExternalId = (projectId: string, n: number) => `programme-phase-${projectId}-${n}`;
export const deliverableExternalId = (projectId: string, n: number, key: string) => `programme-deliverable-${projectId}-${n}-${key}`;
const legacyPhaseExternalId = (n: number) => `programme-phase-${n}`;
const legacyDeliverableExternalId = (n: number, key: string) => `programme-deliverable-${n}-${key}`;

const PHASE_STATUS: Record<string, string> = { not_started: "planned", active: "active", completed: "completed" };

function differs(existing: Record<string, unknown>, row: Record<string, unknown>): boolean {
  return Object.keys(row).some((k) => (existing[k] ?? null) !== (row[k] ?? null));
}

export function planBackfill(input: PlanInput): Plan {
  const { projects, existingPhases, existingDeliverables, newId } = input;
  const projectById = new Map(projects.map((p) => [p.id, p]));
  const ambiguities: string[] = [];
  const claimedPhases = new Set<string>();
  const claimedDeliverables = new Set<string>();
  const phaseOps: PhaseOp[] = [];
  const deliverableOps: DeliverableOp[] = [];

  const phasesByProject = new Map<string, CustomerPhaseIn[]>();
  for (const r of input.phases) (phasesByProject.get(r.project_id) ?? phasesByProject.set(r.project_id, []).get(r.project_id)!).push(r);
  const deliverablesByProjectPhase = new Map<string, CustomerDeliverableIn[]>();
  for (const d of input.deliverables) {
    const k = `${d.project_id}|${d.phase_number}`;
    (deliverablesByProjectPhase.get(k) ?? deliverablesByProjectPhase.set(k, []).get(k)!).push(d);
  }
  const phaseByExt = new Map(existingPhases.filter((p) => p.external_id).map((p) => [p.external_id as string, p]));
  const deliverableByExt = new Map(existingDeliverables.filter((d) => d.external_id).map((d) => [d.external_id as string, d]));

  for (const [projectId, cpRows] of phasesByProject) {
    const project = projectById.get(projectId);
    if (!project) { ambiguities.push(`customer_phases rows for unknown project ${projectId}`); continue; }
    const sorted = [...cpRows].sort((a, b) => a.sort_order - b.sort_order);
    const ordered = sorted.map((r) => resolveEffectivePhase(r, deliverablesByProjectPhase.get(`${projectId}|${r.phase_number}`) ?? []));
    const skip = project.draft_skip_phase_numbers ?? [];
    const calendar = createProgrammeCalendar({ durationDays: project.programme_duration_days ?? undefined, skipPhaseNumbers: skip, phases: referenceSpansOf(ordered) });
    const display = new Map(calendar.toDisplayPhases(calendar.compressPhases(ordered)).map((p) => [p.number, p]));
    const startedAt = project.programme_started_at;

    for (const cp of sorted) {
      const n = cp.phase_number;
      const permanentlySkipped = skip.includes(n);
      // ── match an existing project_phases row ─────────────────────────────────────────────
      const merged = existingPhases.filter((p) => p.project_id === projectId && p.phase_number === n && p.source === "programme");
      const scoped = phaseByExt.get(phaseExternalId(projectId, n));
      const legacy = [phaseByExt.get(legacyPhaseExternalId(n))].filter((p): p is ExistingPhase => !!p && p.project_id === projectId);
      const candidates = [...new Set([...merged, ...(scoped ? [scoped] : []), ...legacy])];
      let existing: ExistingPhase | undefined;
      let matchedBy: Matched = "none";
      if (candidates.length > 1) { ambiguities.push(`project ${projectId} phase ${n}: ${candidates.length} candidate project_phases rows (${candidates.map((c) => c.id).join(", ")})`); continue; }
      if (candidates.length === 1) {
        existing = candidates[0];
        matchedBy = merged.includes(existing) ? "already-merged" : existing === scoped ? "scoped" : "legacy-unscoped";
        if (claimedPhases.has(existing.id)) { ambiguities.push(`project_phases ${existing.id} claimed by more than one customer_phases row`); continue; }
        claimedPhases.add(existing.id);
      }
      const dp = display.get(n)!;
      const staticPhase = PROGRAMME_PHASES.find((p) => p.number === n);
      const id = existing?.id ?? newId();
      const row: PhaseRow = {
        project_id: projectId,
        external_id: phaseExternalId(projectId, n),
        name: cp.custom_name ?? existing?.name ?? staticPhase?.name ?? `Phase ${n}`,
        description: existing?.description ?? null,
        start_date: !permanentlySkipped && startedAt ? displayDayToYmd(startedAt, asDisplayDay(dp.dayStart)) : null,
        due_date: !permanentlySkipped && startedAt ? displayDayToYmd(startedAt, asDisplayDay(dp.dayEnd)) : null,
        status: permanentlySkipped ? "skipped" : cp.status === "skipped" ? "bypassed" : (PHASE_STATUS[cp.status] ?? "planned"),
        position: cp.sort_order,
        day_start: permanentlySkipped ? null : dp.dayStart,
        day_end: permanentlySkipped ? null : dp.dayEnd,
        phase_number: n,
        owner_label: staticPhase?.owner ?? existing?.owner_label ?? null,
        actual_start_date: cp.actual_start_date,
        actual_completed_date: cp.actual_completed_date,
        source: "programme",
      };
      const state: StateRow = { phase_id: id, wizard_data: cp.wizard_data ?? {}, is_manual_override: cp.is_manual_override, override_note: cp.override_note, delay_note: cp.delay_note };
      const bucket = existing
        ? `${matchedBy}${permanentlySkipped ? " · permanent skip" : cp.status === "skipped" ? " · bypassed" : ""}`
        : n === 1 ? "created · phase 1 (no milestone ever existed)" : n > 5 ? "created · custom phase" : "created · project has no programme milestones";
      const action = !existing ? "insert" : differs(existing as unknown as Record<string, unknown>, row as unknown as Record<string, unknown>) ? "update" : "unchanged";
      phaseOps.push({ action, id, matchedBy, bucket, row, state });

      // ── this phase's deliverables ────────────────────────────────────────────────────────
      const cdRows = deliverablesByProjectPhase.get(`${projectId}|${n}`) ?? [];
      cdRows.forEach((cd, index) => {
        const mergedD = existingDeliverables.filter((d) => d.phase_id === id && d.deliverable_key === cd.deliverable_key && d.source === "programme");
        const scopedD = deliverableByExt.get(deliverableExternalId(projectId, n, cd.deliverable_key));
        const legacyD = [deliverableByExt.get(legacyDeliverableExternalId(n, cd.deliverable_key))].filter((d): d is ExistingDeliverable => !!d && d.project_id === projectId);
        const cands = [...new Set([...mergedD, ...(scopedD ? [scopedD] : []), ...legacyD])];
        if (cands.length > 1) { ambiguities.push(`project ${projectId} phase ${n} deliverable ${cd.deliverable_key}: ${cands.length} candidate project_deliverables rows`); return; }
        let ex: ExistingDeliverable | undefined;
        let mb: Matched = "none";
        if (cands.length === 1) {
          ex = cands[0];
          mb = mergedD.includes(ex) ? "already-merged" : ex === scopedD ? "scoped" : "legacy-unscoped";
          if (claimedDeliverables.has(ex.id)) { ambiguities.push(`project_deliverables ${ex.id} claimed by more than one customer_deliverables row`); return; }
          claimedDeliverables.add(ex.id);
        }
        const dd = dp.deliverables.find((x) => x.key === cd.deliverable_key);
        const dId = ex?.id ?? newId();
        const dRow: DeliverableRow = {
          project_id: projectId,
          external_id: deliverableExternalId(projectId, n, cd.deliverable_key),
          phase_id: id,
          name: cd.custom_name ?? ex?.name ?? dd?.name ?? cd.deliverable_key,
          description: cd.custom_description ?? ex?.description ?? dd?.description ?? null,
          owner_label: cd.custom_owner ?? dd?.owner ?? null,
          start_date: !permanentlySkipped && startedAt && dd ? displayDayToYmd(startedAt, asDisplayDay(dd.dayStart)) : null,
          due_date: !permanentlySkipped && startedAt && dd ? displayDayToYmd(startedAt, asDisplayDay(dd.dayEnd)) : null,
          day_start: permanentlySkipped || !dd ? null : dd.dayStart,
          day_end: permanentlySkipped || !dd ? null : dd.dayEnd,
          position: ex?.position ?? index,
          status: cd.status,
          completed_at: cd.completed_at,
          deliverable_key: cd.deliverable_key,
          source: "programme",
          is_default: ex?.is_default ?? false,
        };
        const dBucket = ex ? mb : n === 1 ? "created · phase 1 deliverable (workspace item)" : existing ? "created · no tasklist for this deliverable" : "created · project has no programme milestones";
        const dAction = !ex ? "insert" : differs(ex as unknown as Record<string, unknown>, dRow as unknown as Record<string, unknown>) ? "update" : "unchanged";
        deliverableOps.push({ action: dAction, id: dId, matchedBy: mb, bucket: dBucket, row: dRow });
      });
    }
  }

  // ── orphans: programme-tagged rows nobody claimed — kept as manual (decision Q7), never deleted ──
  const orphans: OrphanOp[] = [];
  for (const d of existingDeliverables) {
    if (d.source !== "programme" || claimedDeliverables.has(d.id)) continue;
    orphans.push({ id: d.id, project_id: d.project_id, external_id: d.external_id, kind: "deliverable", hasTasks: (input.taskCountByDeliverable?.get(d.id) ?? 0) > 0 });
  }
  for (const p of existingPhases) {
    if (p.source !== "programme" || claimedPhases.has(p.id)) continue;
    orphans.push({ id: p.id, project_id: p.project_id, external_id: p.external_id, kind: "phase", hasTasks: false });
  }
  return { phases: phaseOps, deliverables: deliverableOps, orphans, ambiguities };
}

// ─── Report ───────────────────────────────────────────────────────────────────────────────────
export function summarisePlan(plan: Plan) {
  return {
    phases: { total: plan.phases.length, byAction: countBy(plan.phases, (p) => p.action), byBucket: countBy(plan.phases, (p) => `${p.action} · ${p.bucket}`), byStatus: countBy(plan.phases, (p) => p.row.status),
      withDates: plan.phases.filter((p) => p.row.start_date).length, withoutDates: plan.phases.filter((p) => !p.row.start_date).length },
    deliverables: { total: plan.deliverables.length, byAction: countBy(plan.deliverables, (d) => d.action), byBucket: countBy(plan.deliverables, (d) => `${d.action} · ${d.bucket}`), byStatus: countBy(plan.deliverables, (d) => d.row.status),
      withDates: plan.deliverables.filter((d) => d.row.start_date).length, withoutDates: plan.deliverables.filter((d) => !d.row.start_date).length },
    orphans: { total: plan.orphans.length, deliverables: plan.orphans.filter((o) => o.kind === "deliverable").length, phases: plan.orphans.filter((o) => o.kind === "phase").length, withTasks: plan.orphans.filter((o) => o.hasTasks).length },
    stateRows: plan.phases.length,
    ambiguities: plan.ambiguities,
  };
}
