import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { guard, jsonError, parseBody } from "@/lib/hr/api";
import { decisionSchema } from "@/lib/hr/schemas";
import { loadCreditsFor } from "@/lib/hr/queries-requests";
import { todayInTz } from "@/lib/hr/dates";
import { notifyDecision } from "@/lib/hr/notify";
import { notifyTeamOfLeave } from "@/lib/hr/team-email";
import { isManager } from "@/lib/hr/access";
import type { LeaveStatus } from "@/lib/hr/types";

type Ctx = { params: Promise<{ requestId: string }> };

// Review-drawer detail: the requester's credit position for this leave type (RLS decides visibility).
export async function GET(_req: Request, { params }: Ctx) {
  const g = await guard("staff");
  if ("res" in g) return g.res;
  const { requestId } = await params;
  const supabase = await createClient();
  const { data: row } = await supabase
    
    .from("hr_leave_requests")
    .select("employee_id, leave_type_id")
    .eq("id", requestId)
    .maybeSingle();
  if (!row) return jsonError("That request isn't available to you.", 404);
  const credits = await loadCreditsFor(row.employee_id, todayInTz()).catch(() => []);
  return NextResponse.json({ credit: credits.find((c) => c.type.id === row.leave_type_id) ?? null });
}
const NEXT_STATUS = { approve: "approved", deny: "rejected", cancel: "cancelled" } as const;

export async function PATCH(req: Request, { params }: Ctx) {
  const g = await guard("staff");
  if ("res" in g) return g.res;
  const { viewer } = g;
  const body = await parseBody(req, decisionSchema);
  if ("res" in body) return body.res;
  const { action, decisionNote } = body.data;
  const { requestId } = await params;

  const supabase = await createClient();
  const db = supabase;
  const { data: current } = await db
    .from("hr_leave_requests")
    .select("id, employee_id, leave_type_id, start_date, end_date, half_day, status, team_emails, employees:hr_employees(full_name), leave_types:hr_leave_types(name)")
    .eq("id", requestId)
    .maybeSingle();
  if (!current) return jsonError("That request isn't available to you.", 404);

  const isOwn = current.employee_id === viewer.employeeId;
  const canDecide = isManager(viewer) || (viewer.hasDirectReports && !isOwn); // RLS enforces the direct-report scope
  const from = current.status as LeaveStatus;

  // Owners may only cancel their own pending request; deciders follow the state machine below.
  if (!canDecide && !(isOwn && action === "cancel" && from === "pending")) {
    return jsonError("You can only cancel your own pending request.", 403);
  }
  if ((action === "approve" || action === "deny") && from !== "pending") {
    return jsonError(`This request was already ${from === "rejected" ? "denied" : from}.`, 409);
  }
  if (action === "cancel" && from !== "pending" && from !== "approved") {
    return jsonError(`A ${from === "rejected" ? "denied" : from} request can't be cancelled.`, 409);
  }

  const status = NEXT_STATUS[action];
  const { data: updated } = await db
    .from("hr_leave_requests")
    .update({ status, approver_id: viewer.profileId, decided_at: new Date().toISOString(), decision_note: decisionNote ?? null })
    .eq("id", requestId)
    .eq("status", from) // optimistic guard: someone else decided first → no row
    .select("id")
    .maybeSingle();
  if (!updated) return jsonError("Someone else just changed this request. Refresh to see the latest.", 409);

  // A7 — warn, never block, when an approval takes the balance below zero.
  let warning: string | null = null;
  if (action === "approve") {
    const credits = await loadCreditsFor(current.employee_id, todayInTz()).catch(() => []);
    const c = credits.find((x) => x.type.id === current.leave_type_id);
    if (c && c.remaining !== null && c.remaining < 0) {
      warning = `${Math.abs(c.remaining)} day${Math.abs(c.remaining) === 1 ? "" : "s"} over the ${c.type.name} allotment.`;
    }
  }

  const typeName = (current.leave_types as { name: string } | null)?.name ?? "Leave";
  const name = (current.employees as { full_name: string } | null)?.full_name ?? "A teammate";
  await notifyDecision({
    employeeId: current.employee_id, actorId: viewer.profileId, status, typeName,
    start: current.start_date, end: current.end_date, note: decisionNote ?? null,
  }).catch((e) => console.error("[hr] notifyDecision:", e));
  if (action === "approve") {
    await notifyTeamOfLeave({
      emails: current.team_emails ?? [], employeeName: name, typeName,
      start: current.start_date, end: current.end_date, actorId: viewer.profileId,
    });
  }
  return NextResponse.json({ status, warning });
}
