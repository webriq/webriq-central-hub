// Task 468 — shared auth + project resolution for the merge routes.
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import type { Db } from "./load";
import type { MergePlan } from "./types";

export const MERGE_ROLES = ["admin", "pm", "super_admin"];
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The `[projectId]` segment is the display `project_id` on v2 and the UUID on legacy — accept both. */
export async function resolveProjectId(db: Db, key: string): Promise<string | null> {
  const { data } = await db.from("projects").select("id").eq(UUID.test(key) ? "id" : "project_id", key).neq("status", "deleted").maybeSingle();
  return (data?.id as string) ?? null;
}

export async function authorizeMerge(projectKey: string): Promise<
  | { ok: true; db: Db; userId: string; role: string; sourceId: string }
  | { ok: false; res: NextResponse }
> {
  const db = await createClient();
  const { data: { user } } = await db.auth.getUser();
  if (!user) return { ok: false, res: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  const { data: profile } = await db.from("profiles").select("role").eq("id", user.id).maybeSingle();
  const role = (profile?.role as string) ?? "";
  if (!MERGE_ROLES.includes(role)) return { ok: false, res: NextResponse.json({ error: "Not permitted to merge projects" }, { status: 403 }) };
  const sourceId = await resolveProjectId(db, projectKey);
  if (!sourceId) return { ok: false, res: NextResponse.json({ error: "Project not found" }, { status: 404 }) };
  return { ok: true, db, userId: user.id, role, sourceId };
}

/** D2 — cross-customer merges are admin/super_admin only. Mutates and returns the plan. */
export function applyRoleRules(plan: MergePlan, role: string): MergePlan {
  if (plan.crossCustomer && role === "pm") {
    plan.headsUp.unshift({ tone: "block", text: "These projects belong to different customers. Only an admin can merge across customers." });
    plan.blocked = true;
  }
  return plan;
}
