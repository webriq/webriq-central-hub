import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { adminClient } from "@/lib/supabase/admin";
import {
  canManageProjectMembers,
  canSetProjectOwner,
  addProjectMember,
  removeProjectMember,
  getProjectMembership,
  getProjectCreator,
  transferProjectOwnership,
  addPhaseMember,
  transferPhaseOwnership,
  phaseHasMembers,
} from "@/lib/programme/phase-membership";
import { createNotification } from "@/lib/notifications";

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
    // adminClient: the embedded `profiles` sub-select is bound by profiles' own RLS
    // (profiles_read_own, migration 048 — own row, or all rows for admin/super_admin only), so a
    // pm/marketing caller got null back for every other member's profile here, rendering as
    // "Unnamed"/"Unassigned" in the UI. project_members itself is already broadly readable
    // (see comment above), this only bypasses the embedded profiles table's stricter RLS.
    const { data, error } = await adminClient
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

// Task 201 — accepts a batch of user_ids so one "Add Collaborators" confirm can add several
// people and trigger a single combined notification (rather than one add + one notification
// per person). formatNameList below builds the Oxford-comma grammar for that notification.
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
    const rawUserIds: unknown = body?.user_ids;
    const userIds: string[] = Array.isArray(rawUserIds)
      ? [...new Set(rawUserIds.map((v) => String(v)).filter(Boolean))]
      : [];
    if (userIds.length === 0) return NextResponse.json({ error: "user_ids is required" }, { status: 400 });

    const results = await Promise.all(userIds.map((id) => addProjectMember(projectId, id, user.id)));
    const addedIds = userIds.filter((_, i) => !results[i].error);
    if (addedIds.length === 0) {
      console.error("POST /api/projects/[projectId]/members error:", results[0]?.error);
      return NextResponse.json({ error: "Failed to add project members" }, { status: 500 });
    }

    // Notifications — best-effort, mirrors the deliverable_complete call site's placement
    // after the DB write (src/app/api/projects/[projectId]/programme/deliverables/[deliverableKey]/route.ts).
    try {
      const [{ data: actorProfile }, { data: addedProfiles }, { data: project }, { data: allMembers }] = await Promise.all([
        supabase.from("profiles").select("full_name").eq("id", user.id).maybeSingle(),
        supabase.from("profiles").select("id, full_name").in("id", addedIds),
        supabase.from("projects").select("name, project_id").eq("id", projectId).maybeSingle(),
        supabase.from("project_members").select("user_id").eq("project_id", projectId),
      ]);
      const actorName = actorProfile?.full_name ?? "Someone";
      const projectName = project?.name ?? "this project";
      const url = project?.project_id ? `/projects/v2/${project.project_id}` : undefined;
      const addedNames = addedIds.map((id) => addedProfiles?.find((p) => p.id === id)?.full_name ?? "Unnamed");

      await Promise.all(addedIds.map((id) => createNotification(id, {
        type: "project_collaborator_added",
        title: "Added as collaborator",
        body: `${actorName} has added you as a collaborator on ${projectName}.`,
        url,
        actorId: user.id,
      })));

      const otherMemberIds = (allMembers ?? [])
        .map((m) => m.user_id)
        .filter((id) => id !== user.id && !addedIds.includes(id));
      if (otherMemberIds.length > 0) {
        const noun = addedNames.length === 1 ? "collaborator" : "collaborators";
        await Promise.all(otherMemberIds.map((id) => createNotification(id, {
          type: "project_collaborator_added",
          title: "Collaborator added",
          body: `${actorName} has added ${formatNameList(addedNames)} as ${noun} on ${projectName}.`,
          url,
          actorId: user.id,
        })));
      }
    } catch (notifyErr) {
      console.error("POST /api/projects/[projectId]/members notification error:", notifyErr);
    }

    return NextResponse.json({ ok: true, added: addedIds.length }, { status: 201 });
  } catch (err) {
    console.error("POST /api/projects/[projectId]/members unexpected error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// Oxford-comma list join: "A" | "A and B" | "A, B, and C" — local to this route, only caller.
function formatNameList(names: string[]): string {
  if (names.length === 1) return names[0];
  if (names.length === 2) return `${names[0]} and ${names[1]}`;
  return `${names.slice(0, -1).join(", ")}, and ${names[names.length - 1]}`;
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

    // Task 225 — project_members.is_owner and phase_members.is_owner (phase 1) are separate
    // records; Status Report / Status Summary drawer / Portfolio Tracker listing all read the
    // assignee from phase_members, not project_members. Sync them so "Set Project Owner" is a
    // single action from the user's perspective. Only when Phase 1 already has real membership —
    // see phaseHasMembers's own comment for why an empty phase must stay untouched. Best-effort:
    // don't fail the whole ownership transfer if this secondary sync errors.
    if (await phaseHasMembers(projectId, 1)) {
      const { error: addErr } = await addPhaseMember(projectId, 1, targetUserId, user.id);
      if (addErr) console.error("PATCH /api/projects/[projectId]/members Phase 1 sync (add) error:", addErr);
      const { error: phaseTransferErr } = await transferPhaseOwnership(projectId, 1, targetUserId);
      if (phaseTransferErr) console.error("PATCH /api/projects/[projectId]/members Phase 1 sync (transfer) error:", phaseTransferErr);
    }

    // Notifications — best-effort; actor is never notified about their own action (also
    // covers the self-transfer edge case where an admin sets themselves as owner).
    try {
      const [{ data: actorProfile }, { data: targetProfile }, { data: project }, { data: allMembers }] = await Promise.all([
        supabase.from("profiles").select("full_name").eq("id", user.id).maybeSingle(),
        supabase.from("profiles").select("full_name").eq("id", targetUserId).maybeSingle(),
        supabase.from("projects").select("name, project_id").eq("id", projectId).maybeSingle(),
        supabase.from("project_members").select("user_id").eq("project_id", projectId),
      ]);
      const actorName = actorProfile?.full_name ?? "Someone";
      const newOwnerName = targetProfile?.full_name ?? "Unnamed";
      const projectName = project?.name ?? "this project";
      const url = project?.project_id ? `/projects/v2/${project.project_id}` : undefined;

      if (targetUserId !== user.id) {
        await createNotification(targetUserId, {
          type: "project_owner_changed",
          title: "Project owner changed",
          body: `${actorName} set you as the project owner of ${projectName}.`,
          url,
          actorId: user.id,
        });
      }

      const otherMemberIds = (allMembers ?? [])
        .map((m) => m.user_id)
        .filter((id) => id !== user.id && id !== targetUserId);
      await Promise.all(otherMemberIds.map((id) => createNotification(id, {
        type: "project_owner_changed",
        title: "Project owner changed",
        body: `${actorName} has changed the ownership of ${projectName} to ${newOwnerName}.`,
        url,
        actorId: user.id,
      })));
    } catch (notifyErr) {
      console.error("PATCH /api/projects/[projectId]/members notification error:", notifyErr);
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
