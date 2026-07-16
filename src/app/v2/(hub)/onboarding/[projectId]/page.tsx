import { redirect, notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { adminClient } from "@/lib/supabase/admin";
import { V2_ROUTES } from "@/config/constants";
import OnboardingDetail from "./_onboarding-detail";

export const dynamic = "force-dynamic";

// pm/developer can view the Timeline (task 146) — Wizard access within it is further split
// by role inside OnboardingDetail/OnboardingWizard, not here.
const DETAIL_ROLES = ["marketing", "admin", "super_admin", "pm", "developer"];

interface PageProps {
  params: Promise<{ projectId: string }>;
}

export default async function OnboardingProjectPage({ params }: PageProps) {
  const { projectId } = await params;
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  if (!data?.claims) redirect(V2_ROUTES.AUTH_LOGIN);

  const userId = data.claims.sub as string;
  const { data: profile } = await supabase.from("profiles").select("role").eq("id", userId).maybeSingle();
  const role = profile?.role ?? null;

  if (!role || !DETAIL_ROLES.includes(role)) {
    redirect(V2_ROUTES.ONBOARDING);
  }

  const { data: project, error } = await supabase
    .from("projects")
    .select("id, name, customer_id, project_id, created_by, scheduled_onboarding_start_at, scheduled_start_phase, customers(company_name)")
    .eq("id", projectId)
    .single();

  if (error || !project) {
    notFound();
  }

  const companyName = (project.customers as unknown as { company_name: string } | null)?.company_name ?? "Customer";

  // adminClient: marketing is in DETAIL_ROLES (can view this page) but isn't covered by
  // contacts_staff_read RLS (admin|super_admin|pm|developer only, migration 056).
  const { data: primaryContact } = await adminClient
    .from("contacts")
    .select("full_name, email, phone")
    .eq("customer_id", project.customer_id)
    .eq("is_primary", true)
    .maybeSingle();

  // Task 153: Phase 1 membership drives the Wizard entry gate + the owner/member display —
  // fetched here (not client-side) so the restricted-access decision is made before any Wizard
  // content would otherwise flash. phase_members SELECT is broadly readable RLS.
  // profiles!phase_members_user_id_fkey: phase_members has two FKs to profiles (user_id and
  // added_by) — PostgREST can't disambiguate a bare `profiles(...)` embed between them
  // (PGRST201), so the FK must be named explicitly. We always want the member's own profile.
  const { data: phase1MembersRaw } = await supabase
    .from("phase_members")
    .select("id, user_id, is_owner, created_at, profiles!phase_members_user_id_fkey(full_name, role)")
    .eq("project_id", projectId)
    .eq("phase_number", 1)
    .order("is_owner", { ascending: false })
    .order("created_at", { ascending: true });

  const phase1Members = (phase1MembersRaw ?? []).map((m) => ({
    id: m.id,
    user_id: m.user_id,
    is_owner: m.is_owner,
    full_name: (m.profiles as unknown as { full_name: string | null; role: string } | null)?.full_name ?? null,
    role: (m.profiles as unknown as { full_name: string | null; role: string } | null)?.role ?? null,
  }));

  // Task 155: project-level membership fetched server-side too, alongside Phase 1's — needed
  // for both the owner display and the tightened canManageProjectMembers check (which now
  // depends on the caller's own membership, not just their role).
  // profiles!project_members_user_id_fkey — same disambiguation as above (project_members also
  // has user_id + added_by both pointing at profiles).
  const { data: projectMembersRaw } = await supabase
    .from("project_members")
    .select("id, user_id, is_owner, created_at, profiles!project_members_user_id_fkey(full_name, role)")
    .eq("project_id", projectId)
    .order("is_owner", { ascending: false })
    .order("created_at", { ascending: true });

  const projectMembers = (projectMembersRaw ?? []).map((m) => ({
    id: m.id,
    user_id: m.user_id,
    is_owner: m.is_owner,
    full_name: (m.profiles as unknown as { full_name: string | null; role: string } | null)?.full_name ?? null,
    role: (m.profiles as unknown as { full_name: string | null; role: string } | null)?.role ?? null,
  }));

  // Task 157: "default to the creator" fallback for the owner display — covers legacy
  // projects that predate task 153 (created_by set, but no project_members row exists at
  // all yet, so `is_owner` never resolves to anyone from projectMembers alone).
  let createdByName: string | null = null;
  if (project.created_by && !projectMembers.some((m) => m.user_id === project.created_by)) {
    const { data: creatorProfile } = await supabase.from("profiles").select("full_name").eq("id", project.created_by).maybeSingle();
    createdByName = creatorProfile?.full_name ?? null;
  }

  return (
    <OnboardingDetail
      project={{
        id: project.id,
        name: project.name,
        customer_id: project.customer_id,
        project_id: project.project_id,
        company_name: companyName,
        contact_name: primaryContact?.full_name ?? null,
        contact_email: primaryContact?.email ?? null,
        primary_contact_phone: primaryContact?.phone ?? null,
        created_by: project.created_by,
        created_by_name: createdByName,
        scheduled_onboarding_start_at: project.scheduled_onboarding_start_at,
        scheduled_start_phase: project.scheduled_start_phase,
      }}
      role={role}
      currentUserId={userId}
      phase1Members={phase1Members}
      projectMembers={projectMembers}
    />
  );
}
