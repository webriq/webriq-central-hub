import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  canManagePhase1Membership,
  getPhaseMembership,
  addPhaseMember,
  removePhaseMember,
  transferPhaseOwnership,
  addProjectMember,
} from "@/lib/programme/phase-membership";

// Task 153 — phase-level membership (requirements 2/3). Only Phase 1 has enforcement/UI today,
// but the route is phase-number-general since the schema already supports all 5 (task 153 doc).
// Read access to the member list is handled by phase_members' own permissive RLS — this route
// only needs to authorize writes: add/remove a member, and (PATCH) transfer ownership.
//
// Task 156: adding a phase member also adds them as a project member (non-owner) — anyone with
// phase access should be able to find the project on the Onboarding list too, same reasoning
// as the Phase-1-starter's existing auto-membership ensure in seed.ts.

function parsePhaseNumber(raw: string): number | null {
  const n = Number(raw);
  return Number.isInteger(n) && n >= 1 && n <= 5 ? n : null;
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ projectId: string; phaseNumber: string }> }
) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { projectId, phaseNumber: phaseNumberRaw } = await params;
    const phaseNumber = parsePhaseNumber(phaseNumberRaw);
    if (!phaseNumber) return NextResponse.json({ error: "phaseNumber must be an integer between 1 and 5" }, { status: 400 });

    // profiles!phase_members_user_id_fkey: phase_members has two FKs to profiles (user_id and
    // added_by) — a bare `profiles(...)` embed is ambiguous (PGRST201) without naming which one
    // to follow. We always want the member's own profile, not the adder's.
    const { data, error } = await supabase
      .from("phase_members")
      .select("id, user_id, is_owner, added_by, created_at, profiles!phase_members_user_id_fkey(full_name, role)")
      .eq("project_id", projectId)
      .eq("phase_number", phaseNumber)
      .order("is_owner", { ascending: false })
      .order("created_at", { ascending: true });

    if (error) {
      console.error("GET .../phases/[phaseNumber]/members error:", error);
      return NextResponse.json({ error: "Failed to fetch phase members" }, { status: 500 });
    }

    return NextResponse.json(data ?? []);
  } catch (err) {
    console.error("GET .../phases/[phaseNumber]/members unexpected error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string; phaseNumber: string }> }
) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { projectId, phaseNumber: phaseNumberRaw } = await params;
    const phaseNumber = parsePhaseNumber(phaseNumberRaw);
    if (!phaseNumber) return NextResponse.json({ error: "phaseNumber must be an integer between 1 and 5" }, { status: 400 });

    const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).maybeSingle();
    const myMembership = await getPhaseMembership(supabase, projectId, phaseNumber, user.id);
    if (!canManagePhase1Membership(profile?.role ?? null, myMembership)) {
      return NextResponse.json({ error: "Not permitted to manage this phase's members" }, { status: 403 });
    }

    const body = await request.json();
    const targetUserId = String(body?.user_id ?? "");
    if (!targetUserId) return NextResponse.json({ error: "user_id is required" }, { status: 400 });

    const { error } = await addPhaseMember(projectId, phaseNumber, targetUserId, user.id);
    if (error) {
      console.error("POST .../phases/[phaseNumber]/members error:", error);
      return NextResponse.json({ error: "Failed to add phase member" }, { status: 500 });
    }

    // Task 156: phase access implies project (list) visibility — non-owner, ignoreDuplicates
    // handles the already-a-project-member case (e.g. they're also the creator).
    const { error: projMemberError } = await addProjectMember(projectId, targetUserId, user.id);
    if (projMemberError) console.error("POST .../phases/[phaseNumber]/members auto project_members insert error:", projMemberError);

    return NextResponse.json({ ok: true }, { status: 201 });
  } catch (err) {
    console.error("POST .../phases/[phaseNumber]/members unexpected error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// Transfer ownership to an existing phase member — demotes the current owner to a regular
// member (not removed), promotes the target. Target must already be a phase member.
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string; phaseNumber: string }> }
) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { projectId, phaseNumber: phaseNumberRaw } = await params;
    const phaseNumber = parsePhaseNumber(phaseNumberRaw);
    if (!phaseNumber) return NextResponse.json({ error: "phaseNumber must be an integer between 1 and 5" }, { status: 400 });

    const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).maybeSingle();
    const myMembership = await getPhaseMembership(supabase, projectId, phaseNumber, user.id);
    if (!canManagePhase1Membership(profile?.role ?? null, myMembership)) {
      return NextResponse.json({ error: "Not permitted to manage this phase's members" }, { status: 403 });
    }

    const body = await request.json();
    const targetUserId = String(body?.user_id ?? "");
    if (!targetUserId) return NextResponse.json({ error: "user_id is required" }, { status: 400 });

    const targetMembership = await getPhaseMembership(supabase, projectId, phaseNumber, targetUserId);
    if (!targetMembership.isMember) {
      return NextResponse.json({ error: "Target user must already be a phase member before ownership can transfer" }, { status: 400 });
    }

    const { error } = await transferPhaseOwnership(projectId, phaseNumber, targetUserId);
    if (error) {
      console.error("PATCH .../phases/[phaseNumber]/members error:", error);
      return NextResponse.json({ error: "Failed to transfer ownership" }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("PATCH .../phases/[phaseNumber]/members unexpected error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string; phaseNumber: string }> }
) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { projectId, phaseNumber: phaseNumberRaw } = await params;
    const phaseNumber = parsePhaseNumber(phaseNumberRaw);
    if (!phaseNumber) return NextResponse.json({ error: "phaseNumber must be an integer between 1 and 5" }, { status: 400 });

    const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).maybeSingle();
    const myMembership = await getPhaseMembership(supabase, projectId, phaseNumber, user.id);
    if (!canManagePhase1Membership(profile?.role ?? null, myMembership)) {
      return NextResponse.json({ error: "Not permitted to manage this phase's members" }, { status: 403 });
    }

    const targetUserId = request.nextUrl.searchParams.get("user_id");
    if (!targetUserId) return NextResponse.json({ error: "user_id query param is required" }, { status: 400 });

    // Removing the current owner would leave the phase ownerless — require an explicit
    // transfer (PATCH) first, rather than silently leaving no owner.
    const targetMembership = await getPhaseMembership(supabase, projectId, phaseNumber, targetUserId);
    if (targetMembership.isOwner) {
      return NextResponse.json({ error: "Transfer ownership to someone else before removing the current owner" }, { status: 409 });
    }

    const { error } = await removePhaseMember(projectId, phaseNumber, targetUserId);
    if (error) {
      console.error("DELETE .../phases/[phaseNumber]/members error:", error);
      return NextResponse.json({ error: "Failed to remove phase member" }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("DELETE .../phases/[phaseNumber]/members unexpected error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
