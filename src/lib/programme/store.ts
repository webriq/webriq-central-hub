import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, PhaseProgrammeStateRow, ProjectDeliverableRow, ProjectPhaseRow } from "@/types/database";
import { materialiseDates, type DatePatch } from "./programme-dates";
import { inProgrammeOrder } from "./programme-status";

// Task 429 (WP1, decision D-A) — the single data-access module for the unified programme tables. Every programme route/loader goes
// through here instead of hand-writing `.from("customer_phases")` queries. Takes the Supabase client as a parameter: pass the
// signed-in user's server client for user-driven reads/writes (RLS decides: programme rows are admin/super_admin/marketing-writable),
// or `adminClient` only for session-less paths (crons, the seed). Programme rows are `source = 'programme'`.

export type ProgrammeClient = SupabaseClient<Database>;
export type ProgrammePhase = ProjectPhaseRow & { state: PhaseProgrammeStateRow | null; deliverables: ProjectDeliverableRow[] };

/** Pure assembly step (exported for the checks): attach each phase's state row and ordered deliverables. */
export function assembleProgramme(
  phases: ProjectPhaseRow[],
  deliverables: ProjectDeliverableRow[],
  states: PhaseProgrammeStateRow[]
): ProgrammePhase[] {
  const stateByPhase = new Map(states.map((s) => [s.phase_id, s]));
  const byPhase = new Map<string, ProjectDeliverableRow[]>();
  for (const d of deliverables) {
    if (!d.phase_id) continue;
    (byPhase.get(d.phase_id) ?? byPhase.set(d.phase_id, []).get(d.phase_id)!).push(d);
  }
  return inProgrammeOrder(phases).map((p) => ({
    ...p,
    state: stateByPhase.get(p.id) ?? null,
    deliverables: [...(byPhase.get(p.id) ?? [])].sort((a, b) => (a.position ?? 0) - (b.position ?? 0)),
  }));
}

/** All programme phases of a project with their programme state and deliverables, in programme order. */
export async function loadProgramme(client: ProgrammeClient, projectId: string): Promise<ProgrammePhase[]> {
  const { data: phases, error } = await client.from("project_phases").select("*").eq("project_id", projectId).eq("source", "programme");
  if (error) throw new Error(`loadProgramme phases: ${error.message}`);
  if (!phases?.length) return [];
  const ids = phases.map((p) => p.id);
  const [{ data: deliverables, error: dErr }, { data: states, error: sErr }] = await Promise.all([
    client.from("project_deliverables").select("*").in("phase_id", ids).eq("source", "programme"),
    client.from("phase_programme_state").select("*").in("phase_id", ids),
  ]);
  if (dErr) throw new Error(`loadProgramme deliverables: ${dErr.message}`);
  if (sErr) throw new Error(`loadProgramme state: ${sErr.message}`);
  return assembleProgramme(phases, deliverables ?? [], states ?? []);
}

/**
 * Re-derive `start_date`/`due_date` of every programme row from its stored display-scale days and `programme_started_at`.
 * Call after anything that changes `programme_started_at`. Returns how many rows changed.
 */
export async function rematerialiseProgrammeDates(client: ProgrammeClient, projectId: string, programmeStartedAt: string | null): Promise<number> {
  const phases = await loadProgramme(client, projectId);
  const patches = materialiseDates({
    programmeStartedAt,
    phases,
    deliverables: phases.flatMap((p) => p.deliverables),
  });
  const apply = async (table: "project_phases" | "project_deliverables", rows: DatePatch[]) => {
    for (let i = 0; i < rows.length; i += 25) {
      const results = await Promise.all(rows.slice(i, i + 25).map((r) => client.from(table).update({ start_date: r.start_date, due_date: r.due_date }).eq("id", r.id)));
      const failed = results.find((r) => r.error);
      if (failed?.error) throw new Error(`rematerialiseProgrammeDates ${table}: ${failed.error.message}`);
    }
  };
  await apply("project_phases", patches.phases);
  await apply("project_deliverables", patches.deliverables);
  return patches.phases.length + patches.deliverables.length;
}

const PAGE = 1000; // PostgREST's default response cap — paginate every multi-project read (CLAUDE.md convention).
const ID_CHUNK = 100; // keeps `.in()` URLs well under length limits

async function fetchAllPages<T>(query: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>): Promise<T[]> {
  const all: T[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await query(from, from + PAGE - 1);
    if (error) throw new Error(error.message);
    if (!data?.length) break;
    all.push(...data);
    if (data.length < PAGE) break;
  }
  return all;
}

const chunk = <T,>(items: T[]): T[][] => Array.from({ length: Math.ceil(items.length / ID_CHUNK) }, (_, i) => items.slice(i * ID_CHUNK, (i + 1) * ID_CHUNK));

export type PhaseSummary = Pick<
  ProjectPhaseRow,
  "id" | "project_id" | "phase_number" | "name" | "status" | "position" | "day_start" | "day_end" | "actual_start_date" | "actual_completed_date" | "owner_label"
> & { delay_note: string | null };
export type DeliverableSummary = Pick<ProjectDeliverableRow, "project_id" | "phase_id" | "deliverable_key" | "status" | "day_end">;
export type ProgrammeSummary = { phases: PhaseSummary[]; deliverables: DeliverableSummary[] };

/**
 * Lean, paginated programme read across many projects (portfolio/status report, listing, reminders). Phases come back in programme
 * order with the state row's delay note folded in; deliverables are the slim columns those callers need.
 */
export async function loadProgrammeSummaries(client: ProgrammeClient, projectIds: string[]): Promise<Map<string, ProgrammeSummary>> {
  const result = new Map<string, ProgrammeSummary>(projectIds.map((id) => [id, { phases: [], deliverables: [] }]));
  const phaseCols = "id, project_id, phase_number, name, status, position, day_start, day_end, actual_start_date, actual_completed_date, owner_label";
  const chunks = chunk(projectIds);
  const phases = (
    await Promise.all(
      chunks.map((ids) =>
        fetchAllPages<Omit<PhaseSummary, "delay_note">>((from, to) =>
          client.from("project_phases").select(phaseCols).eq("source", "programme").in("project_id", ids).order("id").range(from, to)
        )
      )
    )
  ).flat();
  const states = (
    await Promise.all(
      chunk(phases.map((p) => p.id)).map((ids) =>
        fetchAllPages<Pick<PhaseProgrammeStateRow, "phase_id" | "delay_note">>((from, to) =>
          client.from("phase_programme_state").select("phase_id, delay_note").in("phase_id", ids).order("phase_id").range(from, to)
        )
      )
    )
  ).flat();
  const delayByPhase = new Map(states.map((s) => [s.phase_id, s.delay_note]));
  const deliverables = (
    await Promise.all(
      chunks.map((ids) =>
        fetchAllPages<DeliverableSummary>((from, to) =>
          client.from("project_deliverables").select("project_id, phase_id, deliverable_key, status, day_end").eq("source", "programme").in("project_id", ids).order("id").range(from, to)
        )
      )
    )
  ).flat();
  for (const p of phases) result.get(p.project_id)?.phases.push({ ...p, delay_note: delayByPhase.get(p.id) ?? null });
  for (const entry of result.values()) entry.phases = inProgrammeOrder(entry.phases);
  for (const d of deliverables) result.get(d.project_id)?.deliverables.push(d);
  return result;
}

// ── WP4 write helpers ───────────────────────────────────────────────────────────────────────────────────────────────

/** One programme phase row by its stable `phase_number` (null when the project has none). */
export async function getProgrammePhase(client: ProgrammeClient, projectId: string, phaseNumber: number): Promise<ProjectPhaseRow | null> {
  const { data, error } = await client.from("project_phases").select("*").eq("project_id", projectId).eq("source", "programme").eq("phase_number", phaseNumber).maybeSingle();
  if (error) throw new Error(`getProgrammePhase: ${error.message}`);
  return data;
}

/** One programme deliverable row, resolved through its phase's `phase_number` + its `deliverable_key`. */
export async function getProgrammeDeliverable(
  client: ProgrammeClient,
  projectId: string,
  phaseNumber: number,
  deliverableKey: string
): Promise<ProjectDeliverableRow | null> {
  const phase = await getProgrammePhase(client, projectId, phaseNumber);
  if (!phase) return null;
  const { data, error } = await client.from("project_deliverables").select("*").eq("phase_id", phase.id).eq("deliverable_key", deliverableKey).maybeSingle();
  if (error) throw new Error(`getProgrammeDeliverable: ${error.message}`);
  return data;
}

export type PhaseStatePatch = Partial<Pick<PhaseProgrammeStateRow, "wizard_data" | "delay_note" | "is_manual_override" | "override_note">>;

/** Create-or-update a phase's programme state row (wizard data, override flag/note, delay note). */
export async function upsertPhaseState(client: ProgrammeClient, phaseId: string, patch: PhaseStatePatch): Promise<PhaseProgrammeStateRow> {
  const { data, error } = await client
    .from("phase_programme_state")
    .upsert({ phase_id: phaseId, ...patch, updated_at: new Date().toISOString() }, { onConflict: "phase_id" })
    .select()
    .single();
  if (error) throw new Error(`upsertPhaseState: ${error.message}`);
  return data;
}
