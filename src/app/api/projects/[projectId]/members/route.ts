import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  canManageProjectMembers,
  canSetProjectOwner,
  addProjectMember,
  removeProjectMember,
  getProjectMembership,
  getProjectCreator,
  transferProjectOwnership,
} from "@/lib/programme/phase-membership";

// Task 153 — project-level membership (requirement 6). Gates visibility on the Onboarding
// list for marketing/pm (GET /api/onboarding/projects); admin/super_admin always see
// everything and don't need a row here. Read access to the member list itself is handled by
// project_members' own permissive RLS (any authenticated staff role can SELECT it) — this
// route only needs to authorize writes.
//
// Task 157 (supersedes task 155's membership-gated check): "Add Collaborators"
// (POST/DELETE) is super_admin/admin/pm or the project creator — role-based, no "must already
// be a member" precondition. "Set Project Owner" (PATCH) is narrower: super_admin/admin or the
// creator only (no pm). Both now key off the project's created_by, not the caller's own
// project_members row.

export async function GET(_request: NextRequest, { params }: { params: Promise<{ projectId: string }> }) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { projectId } = await params;
    // profiles!project_members_user_id_fkey: project_members has two FKs to profiles (user_id
    // and added_by) — a bare `profiles(...)` embed is ambiguous (PGRST201) without naming
    // which one to follow. We always want the member's own profile, not the adder's.
    const { data, error } = await supabase
      .from("project_members")
      .select("id, user_id, is_owner, added_by, created_at, profiles!project_members_user_id_fkey(full_name, role)")
      .eq("project_id", projectId)
      .order("is_owner", { ascending: false })
      .order("created_at", { ascending: true });

    if (error) {
      console.error("GET /api/projects/[projectId]/members error:", error);
      return NextResponse.json({ error: "Failed to fetch project members" }, { status: 500 });
    }

    return NextResponse.json(data ?? []);
  } catch (err) {
    console.error("GET /api/projects/[projectId]/members unexpected error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ projectId: string }> }) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { projectId } = await params;
    const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).maybeSingle();
    const createdBy = await getProjectCreator(supabase, projectId);
    if (!canManageProjectMembers(profile?.role ?? null, createdBy === user.id)) {
      return NextResponse.json({ error: "Not permitted to manage project members" }, { status: 403 });
    }

    const body = await request.json();
    const userId = String(body?.user_id ?? "");
    if (!userId) return NextResponse.json({ error: "user_id is required" }, { status: 400 });

    const { error } = await addProjectMember(projectId, userId, user.id);
    if (error) {
      console.error("POST /api/projects/[projectId]/members error:", error);
      return NextResponse.json({ error: "Failed to add project member" }, { status: 500 });
    }

    return NextResponse.json({ ok: true }, { status: 201 });
  } catch (err) {
    console.error("POST /api/projects/[projectId]/members unexpected error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// Task 157 — transfer/set project ownership to an existing member. super_admin/admin/creator
// only (canSetProjectOwner) — narrower than the add/remove-collaborator permission above.
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ projectId: string }> }) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { projectId } = await params;
    const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).maybeSingle();
    const createdBy = await getProjectCreator(supabase, projectId);
    if (!canSetProjectOwner(profile?.role ?? null, createdBy === user.id)) {
      return NextResponse.json({ error: "Not permitted to set the project owner" }, { status: 403 });
    }

    const body = await request.json();
    const targetUserId = String(body?.user_id ?? "");
    if (!targetUserId) return NextResponse.json({ error: "user_id is required" }, { status: 400 });

    const targetMembership = await getProjectMembership(supabase, projectId, targetUserId);
    if (!targetMembership.isMember) {
      return NextResponse.json({ error: "Target user must already be a project member before ownership can transfer" }, { status: 400 });
    }

    const { error } = await transferProjectOwnership(projectId, targetUserId);
    if (error) {
      console.error("PATCH /api/projects/[projectId]/members error:", error);
      return NextResponse.json({ error: "Failed to transfer ownership" }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("PATCH /api/projects/[projectId]/members unexpected error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ projectId: string }> }) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { projectId } = await params;
    const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).maybeSingle();
    const createdBy = await getProjectCreator(supabase, projectId);
    if (!canManageProjectMembers(profile?.role ?? null, createdBy === user.id)) {
      return NextResponse.json({ error: "Not permitted to manage project members" }, { status: 403 });
    }

    const userId = request.nextUrl.searchParams.get("user_id");
    if (!userId) return NextResponse.json({ error: "user_id query param is required" }, { status: 400 });

    // Removing the current owner would leave the project ownerless — require an explicit
    // transfer (PATCH) first, same guard as the phase-members route.
    const targetMembership = await getProjectMembership(supabase, projectId, userId);
    if (targetMembership.isOwner) {
      return NextResponse.json({ error: "Transfer ownership to someone else before removing the current owner" }, { status: 409 });
    }

    const { error } = await removeProjectMember(projectId, userId);
    if (error) {
      console.error("DELETE /api/projects/[projectId]/members error:", error);
      return NextResponse.json({ error: "Failed to remove project member" }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("DELETE /api/projects/[projectId]/members unexpected error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
