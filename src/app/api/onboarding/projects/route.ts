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
  getPhaseByNumber,
} from "@/config/customer-phases";
import { seedAndStartProgramme } from "@/lib/programme/seed";
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
    name,
    customer_id,
    programme_started_at,
    scheduled_onboarding_start_at,
    customer_product_id,
    customers(company_name),
    customer_products(classification)
  `)
  .gte("created_at", "2026-07-06T00:00:00Z")
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
    if (projectIds.length > 0) {
      const { data: phases } = await supabase
        .from("customer_phases")
        .select("project_id, phase_number")
        .in("project_id", projectIds)
        .eq("status", "active");
      for (const row of phases ?? []) activePhaseByProject.set(row.project_id, row.phase_number);
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
      const { data: memberProfiles } = await supabase.from("profiles").select("id, full_name").in("id", allMemberIds);
      for (const row of memberProfiles ?? []) memberFullNameById.set(row.id, row.full_name);
    }

    const items = (projects ?? []).map((p) => {
      const companyName = (p.customers as unknown as { company_name: string } | null)?.company_name ?? "Unknown";
      const classification = (p.customer_products as unknown as { classification: string | null } | null)?.classification ?? null;
      const activePhaseNumber = activePhaseByProject.get(p.id) ?? null;
      const currentDay = p.programme_started_at ? Math.min(120, getCurrentProgrammeDay(p.programme_started_at)) : null;
      const targetHandoverDate = p.programme_started_at
        ? new Date(new Date(p.programme_started_at).getTime() + 14 * 86_400_000).toISOString()
        : p.scheduled_onboarding_start_at
          ? new Date(new Date(p.scheduled_onboarding_start_at).getTime() + 14 * 86_400_000).toISOString()
          : null;

      return {
        project_id: p.id,
        project_name: p.name,
        company_name: companyName,
        customer_id: p.customer_id,
        classification,
        current_phase_number: activePhaseNumber,
        current_phase_name: activePhaseNumber ? getPhaseByNumber(activePhaseNumber).name : null,
        current_day: currentDay,
        progress_pct: currentDay ? Math.min(100, Math.round((currentDay / 120) * 100)) : 0,
        programme_started_at: p.programme_started_at,
        scheduled_onboarding_start_at: p.scheduled_onboarding_start_at,
        target_handover_date: targetHandoverDate,
        status: p.programme_started_at ? "in_progress" : p.scheduled_onboarding_start_at ? "scheduled" : "draft",
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
      })
      .select("id, customer_id")
      .single();
    if (projectError || !project) {
      console.error("POST /api/onboarding/projects project create error:", projectError);
      return NextResponse.json({ error: "Failed to create project" }, { status: 500 });
    }

    // Task 153/155: the creator becomes the project owner — sees it on their own list
    // immediately, without needing anyone to add them.
    const { error: memberError } = await addProjectMember(project.id, user.id, user.id, true);
    if (memberError) console.error("POST /api/onboarding/projects project_members insert error:", memberError);

    if (body.mode === "start") {
      const result = await seedAndStartProgramme({ id: project.id, customer_id: project.customer_id }, companyName, user.id);
      if (result.error) {
        return NextResponse.json({ error: result.error }, { status: 500 });
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

    return NextResponse.json({ project_id: project.id, customer_id: customerId }, { status: 201 });
  } catch (err) {
    console.error("POST /api/onboarding/projects unexpected error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
