import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { adminClient } from "@/lib/supabase/admin";
import { generateCustomerId } from "@/lib/customers/generate-id";
import { upsertPrimaryContact } from "@/lib/customers/primary-contact";
import {
  CLASSIFICATIONS,
  type Classification,
  STACKSHIFT_VARIANTS,
  isValidClassificationCombo,
  deriveProductNamesMulti,
  deriveProjectTypeMulti,
  getCurrentProgrammeDay,
  resolveEffectivePhase,
  DEFAULT_PROGRAMME_DAYS,
  type PhasePlanInput,
  type CustomPhaseSeed,
  type DefaultPhaseOverride,
} from "@/config/customer-phases";
import { seedAndStartProgramme } from "@/lib/programme/seed";
import { seedCustomPhases } from "@/lib/programme/seed-custom-phases";
import { addProjectMember, isRoleGatedByMembership } from "@/lib/programme/phase-membership";
import { scheduleProjectAutostart } from "@/lib/qstash";

const STAFF_ROLES = ["admin", "super_admin", "marketing", "pm", "developer", "hr"];
// Mirrors programme/phase/route.ts's WRITE_ROLES exactly — jumping straight to a later phase
// (immediately, or via a scheduled start) is admin/super_admin/marketing-only everywhere else in
// the app (canManagePhases in _onboarding-detail.tsx excludes pm/developer the same way).
const PHASE_WRITE_ROLES = ["admin", "super_admin", "marketing"];
// Task 153: pm can now also create projects (was admin/super_admin/marketing only).
const CREATE_ROLES = ["admin", "super_admin", "marketing", "pm"];

// GET — role-conditional list of every project that has started onboarding, tracked for its
// full 120-day programme (Phases 1-5), not just Phase 1. Projects don't roll off this list
// once Phase 1 hands over (onboarding_visible_at set) or even once the full programme
// completes — customer_phases RLS restricts phase 2-5 read/write to admin|super_admin|marketing
// (migration 060), so this page is the only surface that can track those phases at all.
// Marketing/admin/super_admin see the same shape as pm/developer/hr — this is a status-only
// list either way; the wizard/detail route is where the real access split happens
// (marketing|admin|super_admin only, see [projectId]/page.tsx).
export async function GET() {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).maybeSingle();
    if (!profile?.role || !STAFF_ROLES.includes(profile.role)) {
      return NextResponse.json({ error: "Not permitted to view onboarding projects" }, { status: 403 });
    }

    const { data: rawProjects, error } = await supabase
  .from("projects")
  .select(`
    id,
    project_id,
    name,
    customer_id,
    programme_started_at,
    programme_duration_days,
    scheduled_onboarding_start_at,
    customer_product_id,
    created_at,
    customers(company_name),
    customer_products(classification)
  `)
  .gte("created_at", "2026-07-06T00:00:00Z")
  // Soft-deleted projects (task 231) never appear on the Portfolio Tracker list.
  .neq("status", "deleted")
  .order("created_at", { ascending: false });

    if (error) {
      console.error("GET /api/onboarding/projects error:", error);
      return NextResponse.json({ error: "Failed to fetch onboarding projects" }, { status: 500 });
    }

    // Task 153: marketing/pm only see projects they're a member of. A project with zero
    // project_members rows is unrestricted (backward compatibility for already in-progress
    // projects that predate this feature) — see task 153 doc. admin/super_admin/developer/hr
    // are untouched, matching the confirmed scope (developer/hr's list access isn't part of
    // this task; they already reach this point via STAFF_ROLES above, unfiltered).
    let projects = rawProjects ?? [];
    if (isRoleGatedByMembership(profile.role)) {
      const allProjectIds = projects.map((p) => p.id);
      const { data: memberRows } = await supabase
        .from("project_members")
        .select("project_id, user_id")
        .in("project_id", allProjectIds.length > 0 ? allProjectIds : ["00000000-0000-0000-0000-000000000000"]);
      const projectsWithMembers = new Set((memberRows ?? []).map((r) => r.project_id));
      const myMemberProjectIds = new Set((memberRows ?? []).filter((r) => r.user_id === user.id).map((r) => r.project_id));
      projects = projects.filter((p) => !projectsWithMembers.has(p.id) || myMemberProjectIds.has(p.id));
    }

    const projectIds = projects.map((p) => p.id);
    const activePhaseByProject = new Map<string, number>();
    const activePhaseNameByProject = new Map<string, string>();
    // Task 168 follow-up: a project whose *last* phase (by sort_order — task 246; was hardcoded
    // phase_number === 5) is marked `completed` has finished its full programme — the `status`
    // field below distinguishes this from `in_progress` so completed programmes graduate out of
    // "currently in the programme" views (Programme board/Clients table on `/v2/dashboard`, stat
    // tiles) instead of appearing active forever. Fetches every phase row (not just
    // active/completed) since determining "last by sort_order" needs the full per-project set.
    const completedProjectIds = new Set<string>();
    if (projectIds.length > 0) {
      const { data: phases } = await supabase
        .from("customer_phases")
        .select("project_id, phase_number, status, custom_name, day_start_override, day_end_override, sort_order")
        .in("project_id", projectIds);
      const phasesByProject = new Map<string, typeof phases>();
      for (const row of phases ?? []) {
        if (row.status === "active") {
          activePhaseByProject.set(row.project_id, row.phase_number);
          activePhaseNameByProject.set(row.project_id, resolveEffectivePhase(row).name);
        }
        if (!phasesByProject.has(row.project_id)) phasesByProject.set(row.project_id, []);
        phasesByProject.get(row.project_id)!.push(row);
      }
      for (const [projectId, rows] of phasesByProject) {
        const last = rows!.reduce((max, r) => (r.sort_order > max.sort_order ? r : max), rows![0]);
        if (last.status === "completed") completedProjectIds.add(projectId);
      }
    }

    // Task 154: member avatar chips on each card — the deduped union of project_members and
    // Phase 1 phase_members (only phase with real membership use today, per task 153's scope).
    const memberIdsByProject = new Map<string, Set<string>>();
    if (projectIds.length > 0) {
      const [projMembersRes, phase1MembersRes] = await Promise.all([
        supabase.from("project_members").select("project_id, user_id").in("project_id", projectIds),
        supabase.from("phase_members").select("project_id, user_id").eq("phase_number", 1).in("project_id", projectIds),
      ]);
      for (const row of [...(projMembersRes.data ?? []), ...(phase1MembersRes.data ?? [])]) {
        if (!memberIdsByProject.has(row.project_id)) memberIdsByProject.set(row.project_id, new Set());
        memberIdsByProject.get(row.project_id)!.add(row.user_id);
      }
    }
    const allMemberIds = [...new Set([...memberIdsByProject.values()].flatMap((s) => [...s]))];
    const memberFullNameById = new Map<string, string | null>();
    if (allMemberIds.length > 0) {
      // adminClient: profiles_read_own RLS (migration 048) only lets a caller read their own row
      // or all rows if admin/super_admin — pm/marketing/developer callers otherwise get nothing
      // back for teammates' rows here, which silently rendered every other member as "Unnamed".
      const { data: memberProfiles } = await adminClient.from("profiles").select("id, full_name").in("id", allMemberIds);
      for (const row of memberProfiles ?? []) memberFullNameById.set(row.id, row.full_name);
    }

    const items = (projects ?? []).map((p) => {
      const companyName = (p.customers as unknown as { company_name: string } | null)?.company_name ?? "Unknown";
      const classification = (p.customer_products as unknown as { classification: string | null } | null)?.classification ?? null;
      const activePhaseNumber = activePhaseByProject.get(p.id) ?? null;
      const durationDays = p.programme_duration_days ?? DEFAULT_PROGRAMME_DAYS;
      const currentDay = p.programme_started_at ? Math.min(durationDays, getCurrentProgrammeDay(p.programme_started_at)) : null;
      const targetHandoverDate = p.programme_started_at
        ? new Date(new Date(p.programme_started_at).getTime() + 14 * 86_400_000).toISOString()
        : p.scheduled_onboarding_start_at
          ? new Date(new Date(p.scheduled_onboarding_start_at).getTime() + 14 * 86_400_000).toISOString()
          : null;

      return {
        id: p.id,
        project_id: p.project_id, // real human-readable code, may be null on legacy rows
        project_name: p.name,
        company_name: companyName,
        customer_id: p.customer_id,
        classification,
        current_phase_number: activePhaseNumber,
        current_phase_name: activePhaseNumber ? (activePhaseNameByProject.get(p.id) ?? null) : null,
        current_day: currentDay,
        programme_duration_days: durationDays,
        progress_pct: currentDay ? Math.min(100, Math.round((currentDay / durationDays) * 100)) : 0,
        programme_started_at: p.programme_started_at,
        scheduled_onboarding_start_at: p.scheduled_onboarding_start_at,
        target_handover_date: targetHandoverDate,
        created_at: p.created_at,
        status: completedProjectIds.has(p.id)
          ? "completed"
          : p.programme_started_at ? "in_progress" : p.scheduled_onboarding_start_at ? "scheduled" : "draft",
        members: [...(memberIdsByProject.get(p.id) ?? [])].map((id) => ({ id, full_name: memberFullNameById.get(id) ?? null })),
      };
    });

    return NextResponse.json({ projects: items, canCreate: CREATE_ROLES.includes(profile.role) });
  } catch (err) {
    console.error("GET /api/onboarding/projects unexpected error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

type NewProjectBody = {
  mode: "save" | "save_scheduled" | "start";
  scheduled_start_at?: string;
  start_phase?: number;
  customer: { existing_customer_id: string } | { company_name: string };
  contact: { name: string; email?: string; phone?: string };
  classifications: Classification[];
  project_name: string;
  // Task 246 (Requirement G) — StackShift II only, ignored for every other classification: opts
  // this card into the same specialized `customer_phases` engine StackShift I always uses,
  // instead of the generic `milestones`/`tasklists` model every other classification (including
  // StackShift II with this unset/false) uses. Mirrors the wizard's own "Generate default phases"
  // checkbox — sent `true` only when that checkbox is on. StackShift II with this unset/false
  // behaves exactly as before this task (fully free-form via `phase_plan`).
  use_default_phase_engine?: boolean;
  // Task 239 — StackShift I (and, per Requirement G, StackShift II with use_default_phase_engine)
  // only: overrides the default 120-day programme length.
  programme_duration_days?: number;
  // Task 239 — every classification NOT on the customer_phases engine: custom phases/
  // deliverables/checklist items, seeded into the generic milestones/tasklists/tasks tables
  // instead of customer_phases/customer_deliverables. Omitted/empty is valid ("skip for now").
  phase_plan?: PhasePlanInput;
  // Task 244 — customer_phases engine only: the default phase numbers this specific project opts
  // out of. Every project still gets a `customer_phases` row for every phase in its plan —
  // excluded phases are seeded `status: "skipped"` with zero deliverable rows, instead of being
  // removed. Omitted/empty is valid (all default phases included, today's behavior).
  skip_phase_numbers?: number[];
  // Task 246 — customer_phases engine only: phases the PM added beyond the fixed 5 at intake, via
  // the New Project wizard's PhaseBuilder "Add custom phase" control. Omitted/empty is valid (no
  // custom phases, today's behavior, byte-identical seeding).
  custom_phases?: CustomPhaseSeed[];
  // Task 249 — customer_phases engine only: PM-edited day ranges for the 5 default phases (and,
  // for phase 2-5, their computed deliverable day sub-ranges), via the New Project wizard's now
  // per-phase-editable Day X to Y inputs. Omitted/empty is valid (no default-phase overrides,
  // today's behavior, byte-identical seeding).
  default_phase_overrides?: DefaultPhaseOverride[];
};

// POST — the "New Project" intake (marketing/admin/super_admin only). Explicitly NOT the same
// action as starting the 120-day clock — see task 123 doc. Creates/reuses the customer, creates
// a customer_products row (classification + derived product_name) and a hidden projects row
// (onboarding_visible_at stays null until Phase 1 handover), then branches on `mode`.
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).maybeSingle();
    if (!profile?.role || !CREATE_ROLES.includes(profile.role)) {
      return NextResponse.json({ error: "Not permitted to create onboarding projects" }, { status: 403 });
    }

    const body = (await request.json()) as NewProjectBody;

    if (!["save", "save_scheduled", "start"].includes(body.mode)) {
      return NextResponse.json({ error: "mode must be one of save, save_scheduled, start" }, { status: 400 });
    }
    if (
      !Array.isArray(body.classifications) ||
      body.classifications.length === 0 ||
      !body.classifications.every((c) => CLASSIFICATIONS.includes(c)) ||
      !isValidClassificationCombo(body.classifications)
    ) {
      return NextResponse.json({ error: "Invalid classification combination" }, { status: 400 });
    }
    if (!body.project_name?.trim()) {
      return NextResponse.json({ error: "project_name is required" }, { status: 400 });
    }
    if (body.mode === "save_scheduled" && !body.scheduled_start_at) {
      return NextResponse.json({ error: "scheduled_start_at is required when mode is save_scheduled" }, { status: 400 });
    }

    // Task 239: programme_duration_days/skip_phase_numbers/custom_phases only apply to the
    // specialized customer_phases engine; phase_plan only applies to the generic milestones/
    // tasklists/tasks model every other card uses instead. Each card sent by the wizard only ever
    // contains one primary classification (+ optionally PipelineForge), so `isStackShiftI` is
    // exact. Task 246 (Requirement G): StackShift II opts into the same engine by sending
    // `use_default_phase_engine: true` — this re-points its "Generate default phases" path onto
    // customer_phases instead of the generic model it used before this task; StackShift II
    // without that flag is unaffected (still the generic model, exactly as before).
    const isStackShiftI = body.classifications.includes("StackShift I");
    const isStackShiftII = body.classifications.includes("StackShift II");
    if (body.use_default_phase_engine !== undefined && !isStackShiftII) {
      return NextResponse.json({ error: "use_default_phase_engine only applies to StackShift II" }, { status: 400 });
    }
    const usesCustomerPhasesEngine = isStackShiftI || (isStackShiftII && body.use_default_phase_engine === true);
    if (body.programme_duration_days !== undefined) {
      if (!usesCustomerPhasesEngine) {
        return NextResponse.json({ error: "programme_duration_days only applies to the customer_phases engine" }, { status: 400 });
      }
      if (!Number.isInteger(body.programme_duration_days) || body.programme_duration_days < 1) {
        return NextResponse.json({ error: "programme_duration_days must be a positive integer" }, { status: 400 });
      }
    }
    if (body.phase_plan !== undefined && usesCustomerPhasesEngine) {
      return NextResponse.json({ error: "phase_plan is not supported for the customer_phases engine" }, { status: 400 });
    }
    // Task 244: mirrors programme_duration_days' own per-classification validation pattern above.
    if (body.skip_phase_numbers !== undefined) {
      if (!usesCustomerPhasesEngine) {
        return NextResponse.json({ error: "skip_phase_numbers only applies to the customer_phases engine" }, { status: 400 });
      }
      if (
        !Array.isArray(body.skip_phase_numbers) ||
        !body.skip_phase_numbers.every((n) => Number.isInteger(n) && n > 0)
      ) {
        return NextResponse.json({ error: "skip_phase_numbers must be an array of positive integers" }, { status: 400 });
      }
    }
    // Task 246: same per-classification pattern — custom phases only apply to the customer_phases
    // engine.
    if (body.custom_phases !== undefined) {
      if (!usesCustomerPhasesEngine) {
        return NextResponse.json({ error: "custom_phases only applies to the customer_phases engine" }, { status: 400 });
      }
      const valid =
        Array.isArray(body.custom_phases) &&
        body.custom_phases.every(
          (c) =>
            c &&
            typeof c === "object" &&
            Number.isInteger(c.phaseNumber) &&
            c.phaseNumber > 0 &&
            Number.isFinite(c.sortOrder) &&
            typeof c.name === "string" &&
            c.name.trim().length > 0 &&
            Number.isInteger(c.dayStart) &&
            Number.isInteger(c.dayEnd) &&
            c.dayStart <= c.dayEnd &&
            Array.isArray(c.deliverables) &&
            c.deliverables.every((d) => d && typeof d.name === "string")
        );
      if (!valid) {
        return NextResponse.json({ error: "custom_phases is malformed" }, { status: 400 });
      }
    }
    // Task 249: same per-classification pattern as custom_phases above.
    if (body.default_phase_overrides !== undefined) {
      if (!usesCustomerPhasesEngine) {
        return NextResponse.json({ error: "default_phase_overrides only applies to the customer_phases engine" }, { status: 400 });
      }
      const valid =
        Array.isArray(body.default_phase_overrides) &&
        body.default_phase_overrides.every(
          (o) =>
            o &&
            typeof o === "object" &&
            Number.isInteger(o.phaseNumber) &&
            o.phaseNumber > 0 &&
            Number.isInteger(o.dayStart) &&
            Number.isInteger(o.dayEnd) &&
            o.dayStart <= o.dayEnd &&
            (o.deliverables === undefined ||
              (Array.isArray(o.deliverables) &&
                o.deliverables.every(
                  (d) =>
                    d &&
                    typeof d.key === "string" &&
                    Number.isInteger(d.dayStart) &&
                    Number.isInteger(d.dayEnd) &&
                    d.dayStart <= d.dayEnd
                )))
        );
      if (!valid) {
        return NextResponse.json({ error: "default_phase_overrides is malformed" }, { status: 400 });
      }
    }

    // Task 195: the wizard's own check-name pre-check (GET .../check-name) only runs once,
    // client-side, at the Step 2 -> 3 transition — it never re-validates at the moment of actual
    // creation. This is the authoritative guard, mirroring that route's exact ilike semantics, so
    // any repeat POST (double click, retry, back-and-forth navigation, second tab) is rejected
    // here regardless of what the client did or didn't catch first.
    const { data: existingProject, error: nameCheckError } = await supabase
      .from("projects")
      .select("id")
      .ilike("name", body.project_name.trim())
      .limit(1)
      .maybeSingle();
    if (nameCheckError) {
      console.error("POST /api/onboarding/projects name check error:", nameCheckError);
      return NextResponse.json({ error: "Failed to validate project name" }, { status: 500 });
    }
    if (existingProject) {
      return NextResponse.json({ error: "A project with this name already exists" }, { status: 409 });
    }

    // Task 157 follow-up: which phase a scheduled start should land on. Undefined/1 is always
    // fine (the existing default); anything else requires the same phase-management permission
    // the immediate "Start at phase" flow already gates on client-side — never trust that alone.
    let scheduledStartPhase: number | null = null;
    if (body.mode === "save_scheduled" && body.start_phase !== undefined) {
      if (!Number.isInteger(body.start_phase) || body.start_phase < 1 || body.start_phase > 5) {
        return NextResponse.json({ error: "start_phase must be an integer between 1 and 5" }, { status: 400 });
      }
      if (body.start_phase !== 1 && !PHASE_WRITE_ROLES.includes(profile.role)) {
        return NextResponse.json({ error: "Not permitted to schedule a start at this phase" }, { status: 403 });
      }
      scheduledStartPhase = body.start_phase !== 1 ? body.start_phase : null;
    }

    // Resolve or create the customer.
    let customerId: string;
    let companyName: string;
    if ("existing_customer_id" in body.customer) {
      const { data: existing, error: existingError } = await supabase
        .from("customers")
        .select("customer_id, company_name")
        .eq("customer_id", body.customer.existing_customer_id)
        .single();
      if (existingError || !existing) {
        return NextResponse.json({ error: "Customer not found" }, { status: 404 });
      }
      customerId = existing.customer_id;
      companyName = existing.company_name;
    } else {
      if (!body.customer.company_name?.trim()) {
        return NextResponse.json({ error: "company_name is required for a new customer" }, { status: 400 });
      }
      customerId = await generateCustomerId();
      companyName = body.customer.company_name.trim();
      const { error: createError } = await supabase.from("customers").insert({
        customer_id: customerId,
        company_name: companyName,
        status: "onboarding",
      });
      if (createError) {
        console.error("POST /api/onboarding/projects customer create error:", createError);
        return NextResponse.json({ error: "Failed to create customer" }, { status: 500 });
      }
    }

    // Upsert the submitted primary contact into `contacts` (task 151) — covers both the
    // new-customer and existing-customer-reuse branches identically. Uses adminClient: the
    // marketing role can create onboarding projects (CREATE_ROLES above) but isn't covered by
    // contacts_pm_write RLS (admin|super_admin|pm only, migration 056).
    if (body.contact?.name || body.contact?.email || body.contact?.phone) {
      const { error: contactError } = await upsertPrimaryContact(adminClient, customerId, {
        name: body.contact?.name,
        email: body.contact?.email,
        phone: body.contact?.phone,
      });
      if (contactError) console.error("POST /api/onboarding/projects primary contact error:", contactError);
    }

    // Task 157: multi-select classifications. `classification` (scalar) keeps a single
    // backward-compatible value for existing read sites — the selected StackShift variant if
    // one was chosen, else the first selected classification. `product_name` also keeps a
    // single value (DB check constraint); productNames[0] is "StackShift" whenever any
    // StackShift variant is selected (including combos with PipelineForge), else "PipelineForge".
    const productNames = deriveProductNamesMulti(body.classifications);
    const primaryClassification = body.classifications.find((c) => STACKSHIFT_VARIANTS.includes(c)) ?? body.classifications[0];
    const { data: product, error: productError } = await supabase
      .from("customer_products")
      .insert({
        customer_id: customerId,
        product_name: productNames[0],
        classification: primaryClassification,
        classifications: body.classifications,
        status: "active",
        onboarding_complete: false,
        onboarding_data: {},
      })
      .select("id")
      .single();
    if (productError || !product) {
      console.error("POST /api/onboarding/projects product create error:", productError);
      return NextResponse.json({ error: "Failed to create product" }, { status: 500 });
    }

    const programmeDurationDays = body.programme_duration_days ?? DEFAULT_PROGRAMME_DAYS;

    const { data: project, error: projectError } = await supabase
      .from("projects")
      .insert({
        customer_id: customerId,
        name: body.project_name.trim(),
        project_type: deriveProjectTypeMulti(body.classifications),
        customer_product_id: product.id,
        created_by: user.id,
        onboarding_visible_at: null,
        scheduled_onboarding_start_at: body.mode === "save_scheduled" ? body.scheduled_start_at : null,
        scheduled_start_phase: scheduledStartPhase,
        programme_duration_days: programmeDurationDays,
        uses_customer_phases_engine: usesCustomerPhasesEngine,
        // Task 248: persisted for every mode (not just "start") — closes the previously-silent
        // gap where a Draft/Scheduled project's skip/custom-phase intake selection was discarded,
        // only ever seeded correctly when the wizard submitted mode: "start" directly. Empty
        // arrays for a non-customer_phases-engine project (usesCustomerPhasesEngine already
        // guards skip_phase_numbers/custom_phases being set on the request body above).
        draft_skip_phase_numbers: body.skip_phase_numbers ?? [],
        draft_custom_phases: body.custom_phases ?? [],
        // Task 249: same "persisted for every mode" pattern as the two fields above.
        draft_default_phase_overrides: body.default_phase_overrides ?? [],
      })
      .select("id, project_id, customer_id")
      .single();
    if (projectError || !project) {
      console.error("POST /api/onboarding/projects project create error:", projectError);
      return NextResponse.json({ error: "Failed to create project" }, { status: 500 });
    }

    // Task 153/155: the creator becomes the project owner — sees it on their own list
    // immediately, without needing anyone to add them.
    const { error: memberError } = await addProjectMember(project.id, user.id, user.id, true);
    if (memberError) console.error("POST /api/onboarding/projects project_members insert error:", memberError);

    // Task 239/240, extended by task 246 Requirement G: the 120-day customer_phases/
    // customer_deliverables engine covers StackShift I always, and StackShift II when it opted in
    // via use_default_phase_engine — every other card (including StackShift II without that flag)
    // has no "programme started" concept and must not seed those tables (the phase_plan block
    // below is its equivalent initial structure, seeded regardless of mode).
    if (body.mode === "start" && usesCustomerPhasesEngine) {
      const result = await seedAndStartProgramme(
        { id: project.id, customer_id: project.customer_id },
        companyName,
        user.id,
        1,
        programmeDurationDays,
        body.skip_phase_numbers ?? [],
        body.custom_phases ?? [],
        body.default_phase_overrides ?? []
      );
      if (result.error) {
        return NextResponse.json({ error: result.error }, { status: 500 });
      }
    }
    // Task 248 (closes the gap formerly noted here for task 246/244): skip_phase_numbers/
    // custom_phases are now also written onto `draft_skip_phase_numbers`/`draft_custom_phases`
    // above (the `projects` insert), regardless of mode — so a save_scheduled (or plain "save")
    // submission's skip/custom-phase configuration survives to whenever the programme actually
    // starts (qstash-start / scheduled-autostart cron / the manual "Start Onboarding" button),
    // instead of always seeding the 5 vanilla defaults.

    // Task 239: seed the generic phase plan (any classification except StackShift I) regardless
    // of `mode` — these project types have no separate "programme started" concept the way
    // StackShift I's 120-day clock does; the plan is just this project's initial PM structure.
    if (body.phase_plan && body.phase_plan.phases.length > 0) {
      const customPhaseResult = await seedCustomPhases(project.id, user.id, body.phase_plan);
      if (customPhaseResult.error) {
        return NextResponse.json({ error: customPhaseResult.error }, { status: 500 });
      }
    }

    // One-shot QStash message fires exactly at the scheduled instant (chat follow-up to task
    // 157) — best-effort, never blocks project creation. If QStash isn't configured or the
    // publish fails, the 5-minute cron poll (migration 079) still catches it, just later.
    if (body.mode === "save_scheduled" && body.scheduled_start_at) {
      const messageId = await scheduleProjectAutostart(project.id, (scheduledStartPhase ?? 1) as 1 | 2 | 3 | 4 | 5, body.scheduled_start_at);
      if (messageId) {
        await supabase.from("projects").update({ qstash_message_id: messageId }).eq("id", project.id);
      }
    }

    // project_id may be null immediately post-insert only if the display-code trigger somehow
    // didn't fire (shouldn't happen per migration 066) — fall back to the UUID rather than
    // sending the "New Project" success screen's View link into a broken /portfolio-tracker/null.
    return NextResponse.json({ project_id: project.project_id ?? project.id, customer_id: customerId }, { status: 201 });
  } catch (err) {
    console.error("POST /api/onboarding/projects unexpected error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
