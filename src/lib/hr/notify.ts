import { adminClient } from "@/lib/supabase/admin";
import { createNotification } from "@/lib/notifications";
import { V2_ROUTES } from "@/config/constants";
import { MANAGER_ROLES } from "./roles";
import { formatRange } from "./dates";
import { STATUS_LABEL, type LeaveStatus } from "./types";

// adminClient is used here on purpose: notification fan-out must resolve other users' profile
// rows (the actor's session cannot read them) — it only reads ids, never returns them to a client.

async function managerProfileIds(): Promise<string[]> {
  const { data } = await adminClient.from("profiles").select("id").in("role", [...MANAGER_ROLES]);
  return (data ?? []).map((p) => p.id);
}

async function profileIdForEmployee(employeeId: string): Promise<string | null> {
  const { data } = await adminClient.from("hr_employees").select("profile_id").eq("id", employeeId).maybeSingle();
  return data?.profile_id ?? null;
}

/** New request → the reporting manager (A12), else every HR manager. */
export async function notifyRequestCreated(args: {
  employeeId: string;
  employeeName: string;
  actorId: string;
  typeName: string;
  start: string;
  end: string;
}): Promise<void> {
  const { data: emp } = await adminClient.from("hr_employees").select("manager_id").eq("id", args.employeeId).maybeSingle();
  const managerProfile = emp?.manager_id ? await profileIdForEmployee(emp.manager_id) : null;
  const recipients = managerProfile ? [managerProfile] : await managerProfileIds();
  await Promise.all(
    recipients
      .filter((id) => id !== args.actorId)
      .map((id) =>
        createNotification(id, {
          type: "hr_leave_requested",
          title: "Leave request waiting",
          body: `${args.employeeName} requested ${args.typeName} · ${formatRange(args.start, args.end)}`,
          url: V2_ROUTES.HR_LEAVE_REQUESTS,
          actorId: args.actorId,
        })
      )
  );
}

/** Decision → the employee who asked. */
export async function notifyDecision(args: {
  employeeId: string;
  actorId: string;
  status: LeaveStatus;
  typeName: string;
  start: string;
  end: string;
  note: string | null;
}): Promise<void> {
  const profileId = await profileIdForEmployee(args.employeeId);
  if (!profileId || profileId === args.actorId) return;
  await createNotification(profileId, {
    type: "hr_leave_decided",
    title: `Leave ${STATUS_LABEL[args.status].toLowerCase()}`,
    body: `${args.typeName} · ${formatRange(args.start, args.end)}${args.note ? ` — ${args.note}` : ""}`,
    url: V2_ROUTES.HR_MY_LEAVE,
    actorId: args.actorId,
  });
}
