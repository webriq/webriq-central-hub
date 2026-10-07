import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { guard, jsonError, parseBody } from "@/lib/hr/api";
import { managerSchema } from "@/lib/hr/schemas";

type Ctx = { params: Promise<{ employeeId: string }> };

// Set / clear an employee's reporting manager (A12). Managers only.
export async function PATCH(req: Request, { params }: Ctx) {
  const g = await guard("manager");
  if ("res" in g) return g.res;
  const body = await parseBody(req, managerSchema);
  if ("res" in body) return body.res;
  const { employeeId } = await params;
  const { managerId } = body.data;

  if (managerId === employeeId) return jsonError("Someone can't report to themselves.", 400);
  const supabase = await createClient();
  const db = supabase;
  if (managerId) {
    // Block the direct loop A → B → A; deeper cycles are harmless (approval is one level only).
    const { data: mgr } = await db.from("hr_employees").select("manager_id").eq("id", managerId).maybeSingle();
    if (!mgr) return jsonError("That manager no longer exists.", 404);
    if (mgr.manager_id === employeeId) return jsonError("That person already reports to this employee.", 409);
  }
  const { error } = await db.from("hr_employees").update({ manager_id: managerId }).eq("id", employeeId);
  if (error) return jsonError("Couldn't update the reporting manager. Try again.", 500);
  return NextResponse.json({ ok: true });
}
