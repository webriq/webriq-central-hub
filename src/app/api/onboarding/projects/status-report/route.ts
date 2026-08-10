import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { adminClient } from "@/lib/supabase/admin";
import {
  buildPhaseBreakdown,
  currentPhaseOf,
  rollupHealth,
  programmeDaysLeft,
  type CustomerPhaseRow,
  type PhaseAssigneeMember,
} from "@/lib/programme/status-report";
import { isRoleGatedByMembership } from "@/lib/programme/phase-membership";

// Task 221 — Portfolio Tracker status report. Same read-role set and marketing/pm
// membership-gating as /api/onboarding/projects (that route's GET), extended to pull *all 5*
// customer_phases rows per project (not just the active one) plus customer_deliverables (for the
// at-risk health heuristic) and every phase's real assignees (phase_members, all members not just
// the owner), not just Phase 1's.
const STAFF_ROLES = ["admin", "super_admin", "marketing", "pm", "developer", "hr"];
const WRITE_ROLES = ["admin", "super_admin", "marketing"];

const ROLE_LABEL: Record<string, string> = {
  admin: "Admin", pm: "PM", developer: "Developer", hr: "HR",
  client: "Client", super_admin: "Super Admin", marketing: "Marketing",
};

export async function GET(request: Request) {
  try {
    // Task 223 — optional single-project scope for the project-detail "Status Summary" drawer,
    // reusing this exact route/derive path instead of a second endpoint. Omitted = today's
    // unfiltered full-list behavior for the Status Report page, unchanged.
    const projectId = new URL(request.url).searchParams.get("projectId");

    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).maybeSingle();
    if (!profile?.role || !STAFF_ROLES.includes(profile.role)) {
      return NextResponse.json({ error: "Not permitted to view the status report" }, { status: 403 });
    }

    let projectsQuery = supabase
      .from("projects")
      .select(`
        id,
        project_id,
        name,
        customer_id,
        programme_started_at,
        customer_product_id,
        customers(company_name),
        customer_products(classification)
      `)
      .not("programme_started_at", "is", null)
      .order("programme_started_at", { ascending: true });
    if (projectId) projectsQuery = projectsQuery.eq("id", projectId);

    const { data: rawProjects, error } = await projectsQuery;

    if (error) {
      console.error("GET /api/onboarding/projects/status-report error:", error);
      return NextResponse.json({ error: "Failed to fetch status report" }, { status: 500 });
    }

    // Same membership-gating as /api/onboarding/projects — marketing/pm only see projects they're
    // a member of (a project with zero project_members rows stays unrestricted).
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
    if (projectIds.length === 0) {
      return NextResponse.json({ projects: [], canEditNotes: WRITE_ROLES.includes(profile.role) });
    }

    const [phasesRes, deliverablesRes, membersRes] = await Promise.all([
      supabase
        .from("customer_phases")
        .select("project_id, phase_number, status, actual_start_date, actual_completed_date, delay_note")
        .in("project_id", projectIds),
      supabase.from("customer_deliverables").select("project_id, phase_number, status").in("project_id", projectIds),
      supabase.from("phase_members").select("id, project_id, phase_number, user_id, is_owner").in("project_id", projectIds),
    ]);

    if (phasesRes.error || deliverablesRes.error || membersRes.error) {
      console.error("GET /api/onboarding/projects/status-report error:", phasesRes.error ?? deliverablesRes.error ?? membersRes.error);
      return NextResponse.json({ error: "Failed to fetch status report" }, { status: 500 });
    }

    // adminClient: profiles_read_own RLS (migration 048) only lets a caller read their own row
    // (or all rows if admin/super_admin) — same workaround as /api/onboarding/projects for
    // resolving other users' names/roles for a pm/marketing/developer caller.
    const memberUserIds = [...new Set((membersRes.data ?? []).map((r) => r.user_id))];
    const memberProfileById = new Map<string, { full_name: string | null; role: string | null }>();
    if (memberUserIds.length > 0) {
      const { data: memberProfiles } = await adminClient.from("profiles").select("id, full_name, role").in("id", memberUserIds);
      for (const row of memberProfiles ?? []) memberProfileById.set(row.id, { full_name: row.full_name, role: row.role });
    }

    const phasesByProject = new Map<string, CustomerPhaseRow[]>();
    for (const row of phasesRes.data ?? []) {
      if (!phasesByProject.has(row.project_id)) phasesByProject.set(row.project_id, []);
      phasesByProject.get(row.project_id)!.push(row);
    }

    const deliverablesByProject = new Map<string, { phase_number: number; status: string }[]>();
    for (const row of deliverablesRes.data ?? []) {
      if (!deliverablesByProject.has(row.project_id)) deliverablesByProject.set(row.project_id, []);
      deliverablesByProject.get(row.project_id)!.push(row);
    }

    // Owner first within each phase (matches .../phases/[phaseNumber]/members GET's own
    // ordering), then insertion order for the rest.
    const sortedMemberRows = [...(membersRes.data ?? [])].sort((a, b) => Number(b.is_owner) - Number(a.is_owner));
    const assigneesByProject = new Map<string, Map<number, PhaseAssigneeMember[]>>();
    for (const row of sortedMemberRows) {
      const memberProfile = memberProfileById.get(row.user_id);
      if (!memberProfile?.full_name) continue;
      if (!assigneesByProject.has(row.project_id)) assigneesByProject.set(row.project_id, new Map());
      const phaseMap = assigneesByProject.get(row.project_id)!;
      if (!phaseMap.has(row.phase_number)) phaseMap.set(row.phase_number, []);
      phaseMap.get(row.phase_number)!.push({
        id: row.user_id,
        fullName: memberProfile.full_name,
        roleLabel: ROLE_LABEL[memberProfile.role ?? ""] ?? (memberProfile.role ?? "Team"),
      });
    }

    const items = projects
      .filter((p) => !!p.programme_started_at)
      .map((p) => {
        const companyName = (p.customers as unknown as { company_name: string } | null)?.company_name ?? "Unknown";
        const classification = (p.customer_products as unknown as { classification: string | null } | null)?.classification ?? null;

        const deliverableRows = deliverablesByProject.get(p.id) ?? [];
        const deliverableRatioByPhase: Record<number, number | null> = {};
        for (let phaseNumber = 1; phaseNumber <= 5; phaseNumber++) {
          const rowsForPhase = deliverableRows.filter((r) => r.phase_number === phaseNumber);
          deliverableRatioByPhase[phaseNumber] =
            rowsForPhase.length === 0 ? null : rowsForPhase.filter((r) => r.status === "done").length / rowsForPhase.length;
        }

        const assigneesByPhase: Record<number, PhaseAssigneeMember[]> = {};
        const projectAssignees = assigneesByProject.get(p.id);
        for (let phaseNumber = 1; phaseNumber <= 5; phaseNumber++) {
          assigneesByPhase[phaseNumber] = projectAssignees?.get(phaseNumber) ?? [];
        }

        const { currentProgrammeDay, phases } = buildPhaseBreakdown({
          programmeStartedAt: p.programme_started_at as string,
          phaseRows: phasesByProject.get(p.id) ?? [],
          deliverableRatioByPhase,
          assigneesByPhase,
        });

        return {
          id: p.id,
          projectId: p.project_id,
          projectName: p.name,
          companyName,
          customerId: p.customer_id,
          classification,
          programmeStartedAt: p.programme_started_at as string,
          currentProgrammeDay,
          programmeDaysLeft: programmeDaysLeft(currentProgrammeDay),
          currentPhase: currentPhaseOf(phases),
          health: rollupHealth(phases.map((ph) => ph.health)),
          phases,
          isFullyCompleted: phases[4]?.status === "completed",
        };
      });

    return NextResponse.json({ projects: items, canEditNotes: WRITE_ROLES.includes(profile.role) });
  } catch (err) {
    console.error("GET /api/onboarding/projects/status-report unexpected error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
