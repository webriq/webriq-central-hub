import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import { adminClient } from "@/lib/supabase/admin";

// Task 153 — project/phase membership DB-mutation helpers (server-only, uses adminClient — do
// not import this file from a Client Component; import "./membership-rules" directly instead
// for the pure permission checks, which is safe client-side).
//
//   project_members — visibility on the Onboarding list, for marketing/pm only (admin/super_admin
//                      always see everything and never need a row here).
//   phase_members    — entry into a phase's management UI (today: Phase 1's Wizard only), for
//                       marketing/pm only. Phase 1 has exactly one is_owner = true row.
//
// A project/phase with zero membership rows is treated as unrestricted everywhere this module's
// read helpers are used — see task 153 doc's "Backward compatibility" section. That check lives
// at each call site (it depends on what "unrestricted" means for that specific caller), not here.

export * from "./membership-rules";

// Looks up the caller's own membership row for a project+phase — used both by the API route's
// permission checks (POST/PATCH/DELETE) and the server-rendered detail page (to decide whether
// to show the restricted-access message). Accepts any Supabase client (session-scoped or
// adminClient) since project_members/phase_members SELECT is broadly readable RLS.
export async function getPhaseMembership(
  supabase: SupabaseClient<Database>,
  projectId: string,
  phaseNumber: number,
  userId: string
): Promise<{ isMember: boolean; isOwner: boolean }> {
  const { data } = await supabase
    .from("phase_members")
    .select("is_owner")
    .eq("project_id", projectId)
    .eq("phase_number", phaseNumber)
    .eq("user_id", userId)
    .maybeSingle();
  return { isMember: !!data, isOwner: !!data?.is_owner };
}

// isOwner (task 155): the project creator is inserted with isOwner: true; every other caller
// (e.g. the Phase-1 starter's auto-membership upsert in seed.ts) stays a plain, non-owner
// member — a project only gets an owner via creation or an explicit Super Admin transfer.
export async function addProjectMember(projectId: string, userId: string, addedBy: string, isOwner = false) {
  return adminClient
    .from("project_members")
    .upsert(
      { project_id: projectId, user_id: userId, added_by: addedBy, is_owner: isOwner },
      { onConflict: "project_id,user_id", ignoreDuplicates: true }
    );
}

export async function removeProjectMember(projectId: string, userId: string) {
  return adminClient.from("project_members").delete().eq("project_id", projectId).eq("user_id", userId);
}

// Task 157 — canManageProjectMembers/canSetProjectOwner now key off "is this caller the
// project creator" rather than plain membership; this resolves that check server-side.
export async function getProjectCreator(
  supabase: SupabaseClient<Database>,
  projectId: string
): Promise<string | null> {
  const { data } = await supabase.from("projects").select("created_by").eq("id", projectId).maybeSingle();
  return data?.created_by ?? null;
}

// Mirrors getPhaseMembership — looks up the caller's own project_members row.
export async function getProjectMembership(
  supabase: SupabaseClient<Database>,
  projectId: string,
  userId: string
): Promise<{ isMember: boolean; isOwner: boolean }> {
  const { data } = await supabase
    .from("project_members")
    .select("is_owner")
    .eq("project_id", projectId)
    .eq("user_id", userId)
    .maybeSingle();
  return { isMember: !!data, isOwner: !!data?.is_owner };
}

// Task 155 — mirrors transferPhaseOwnership exactly, scoped by project_id only (no
// phase_number). targetUserId must already be a project member (add first if not).
export async function transferProjectOwnership(projectId: string, targetUserId: string): Promise<{ error: string | null }> {
  const { error: demoteError } = await adminClient
    .from("project_members")
    .update({ is_owner: false })
    .eq("project_id", projectId)
    .eq("is_owner", true);
  if (demoteError) return { error: demoteError.message };

  const { error: promoteError } = await adminClient
    .from("project_members")
    .update({ is_owner: true })
    .eq("project_id", projectId)
    .eq("user_id", targetUserId);
  if (promoteError) return { error: promoteError.message };

  return { error: null };
}

export async function addPhaseMember(projectId: string, phaseNumber: number, userId: string, addedBy: string) {
  return adminClient
    .from("phase_members")
    .upsert(
      { project_id: projectId, phase_number: phaseNumber, user_id: userId, added_by: addedBy },
      { onConflict: "project_id,phase_number,user_id", ignoreDuplicates: true }
    );
}

export async function removePhaseMember(projectId: string, phaseNumber: number, userId: string) {
  return adminClient
    .from("phase_members")
    .delete()
    .eq("project_id", projectId)
    .eq("phase_number", phaseNumber)
    .eq("user_id", userId);
}

// Demote-then-promote, same transaction shape as upsertPrimaryContact (src/lib/customers/
// primary-contact.ts, task 151). targetUserId must already be a phase member (add first if not).
export async function transferPhaseOwnership(
  projectId: string,
  phaseNumber: number,
  targetUserId: string
): Promise<{ error: string | null }> {
  const { error: demoteError } = await adminClient
    .from("phase_members")
    .update({ is_owner: false })
    .eq("project_id", projectId)
    .eq("phase_number", phaseNumber)
    .eq("is_owner", true);
  if (demoteError) return { error: demoteError.message };

  const { error: promoteError } = await adminClient
    .from("phase_members")
    .update({ is_owner: true })
    .eq("project_id", projectId)
    .eq("phase_number", phaseNumber)
    .eq("user_id", targetUserId);
  if (promoteError) return { error: promoteError.message };

  return { error: null };
}
