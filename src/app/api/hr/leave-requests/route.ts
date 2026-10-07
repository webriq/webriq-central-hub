import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { guard, jsonError, parseBody } from "@/lib/hr/api";
import { requestSchema } from "@/lib/hr/schemas";
import { countLeaveDays } from "@/lib/hr/leave-days";
import { loadHolidayDates } from "@/lib/hr/queries";
import { notifyRequestCreated } from "@/lib/hr/notify";

// Staff / PM / managers file their OWN request. RLS (hr_leave_requests_self_insert) is the backstop.
export async function POST(req: Request) {
  const g = await guard("staff");
  if ("res" in g) return g.res;
  const { viewer } = g;
  if (!viewer.employeeId) return jsonError("Your employee record isn't set up yet. Ask HR.", 409);
  const body = await parseBody(req, requestSchema);
  if ("res" in body) return body.res;
  const d = body.data;

  const supabase = await createClient();
  const db = supabase;
  const [typeRes, overlapRes, holidays] = await Promise.all([
    db.from("hr_leave_types").select("id, name, active").eq("id", d.leaveTypeId).maybeSingle(),
    db
      .from("hr_leave_requests")
      .select("id", { count: "exact", head: true })
      .eq("employee_id", viewer.employeeId)
      .in("status", ["pending", "approved"])
      .lte("start_date", d.endDate)
      .gte("end_date", d.startDate),
    loadHolidayDates(d.startDate, d.endDate),
  ]);
  if (!typeRes.data?.active) return jsonError("That leave type isn't available.", 400);
  if ((overlapRes.count ?? 0) > 0) return jsonError("You already have leave requested or approved on some of those dates.", 409);
  const days = countLeaveDays({ start: d.startDate, end: d.endDate, halfDay: d.halfDay }, holidays);
  if (days === 0) return jsonError("Those dates fall on weekends or holidays, so no leave days would be used.", 422);

  const { data, error } = await db
    .from("hr_leave_requests")
    .insert({
      employee_id: viewer.employeeId,
      leave_type_id: d.leaveTypeId,
      start_date: d.startDate,
      end_date: d.endDate,
      half_day: d.halfDay,
      reason: d.reason ?? null,
      team_emails: d.teamEmails,
    })
    .select("id")
    .single();
  if (error) return jsonError("Couldn't submit the request. Try again.", 500);

  await notifyRequestCreated({
    employeeId: viewer.employeeId,
    employeeName: viewer.fullName ?? "A teammate",
    actorId: viewer.profileId,
    typeName: typeRes.data.name,
    start: d.startDate,
    end: d.endDate,
  }).catch((e) => console.error("[hr] notifyRequestCreated:", e));

  return NextResponse.json({ id: data.id, days }, { status: 201 });
}
