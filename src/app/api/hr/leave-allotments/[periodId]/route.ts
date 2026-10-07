import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { ALLOTMENT_OVERLAP_MESSAGE, guard, jsonError, parseBody } from "@/lib/hr/api";
import { allotmentSchema } from "@/lib/hr/schemas";

type Ctx = { params: Promise<{ periodId: string }> };

export async function PATCH(req: Request, { params }: Ctx) {
  const g = await guard("manager");
  if ("res" in g) return g.res;
  const body = await parseBody(req, allotmentSchema);
  if ("res" in body) return body.res;
  const { periodId } = await params;

  const supabase = await createClient();
  const { data, error } = await supabase
    
    .from("hr_leave_allotment_periods")
    .update(body.data)
    .eq("id", periodId)
    .select("id, leave_type_id, period_start, period_end, days_allotted")
    .maybeSingle();
  if (error?.code === "23P01") return jsonError(ALLOTMENT_OVERLAP_MESSAGE, 409);
  if (error) return jsonError("Couldn't update the allotment. Try again.", 500);
  if (!data) return jsonError("That allotment no longer exists.", 404);
  return NextResponse.json({ period: data });
}

export async function DELETE(_req: Request, { params }: Ctx) {
  const g = await guard("manager");
  if ("res" in g) return g.res;
  const { periodId } = await params;
  const supabase = await createClient();
  const { error } = await supabase.from("hr_leave_allotment_periods").delete().eq("id", periodId);
  if (error) return jsonError("Couldn't delete the allotment. Try again.", 500);
  return NextResponse.json({ ok: true });
}
