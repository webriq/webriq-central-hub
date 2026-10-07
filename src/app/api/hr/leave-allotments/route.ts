import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { ALLOTMENT_OVERLAP_MESSAGE, guard, jsonError, parseBody } from "@/lib/hr/api";
import { allotmentSchema } from "@/lib/hr/schemas";

export async function POST(req: Request) {
  const g = await guard("manager");
  if ("res" in g) return g.res;
  const body = await parseBody(req, allotmentSchema);
  if ("res" in body) return body.res;

  const supabase = await createClient();
  const { data, error } = await supabase
    
    .from("hr_leave_allotment_periods")
    .insert({ ...body.data, created_by: g.viewer.profileId })
    .select("id, leave_type_id, period_start, period_end, days_allotted")
    .single();
  if (error?.code === "23P01") return jsonError(ALLOTMENT_OVERLAP_MESSAGE, 409); // exclusion_violation
  if (error) return jsonError("Couldn't save the allotment. Try again.", 500);
  return NextResponse.json({ period: data }, { status: 201 });
}
