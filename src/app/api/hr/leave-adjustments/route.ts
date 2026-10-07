import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { guard, jsonError, parseBody } from "@/lib/hr/api";
import { adjustmentSchema } from "@/lib/hr/schemas";

// Upsert "days already used before the Hub" for one employee × allotment period (A11).
export async function PUT(req: Request) {
  const g = await guard("manager");
  if ("res" in g) return g.res;
  const body = await parseBody(req, adjustmentSchema);
  if ("res" in body) return body.res;
  const d = body.data;

  const supabase = await createClient();
  const db = supabase;
  const { data: period } = await db.from("hr_leave_allotment_periods").select("id, leave_type_id").eq("id", d.periodId).maybeSingle();
  if (!period) return jsonError("That allotment period no longer exists.", 404);

  const { error } = await db.from("hr_leave_adjustments").upsert(
    {
      employee_id: d.employeeId,
      leave_type_id: period.leave_type_id,
      period_id: d.periodId,
      days_used_before: d.daysUsedBefore,
      note: d.note ?? null,
      created_by: g.viewer.profileId,
    },
    { onConflict: "employee_id,period_id" }
  );
  if (error) return jsonError("Couldn't save the opening balance. Try again.", 500);
  return NextResponse.json({ ok: true });
}
