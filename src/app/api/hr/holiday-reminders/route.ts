import { NextRequest, NextResponse } from "next/server";
import { adminClient } from "@/lib/supabase/admin";
import { createNotification } from "@/lib/notifications";
import { V2_ROUTES } from "@/config/constants";
import { getHrViewer, isManager } from "@/lib/hr/access";
import { addDays, formatDate, todayInTz } from "@/lib/hr/dates";

const DAYS_BEFORE = 3;
const CHUNK = 25;

// Daily cron target (pg_cron → pg_net, migration 164). Same auth as the other cron routes:
// `x-cron-secret` === CRONJOB_SECRET_KEY, or a signed-in HR manager (manual re-run).
// Dedupe: the (holiday_id, days_before) primary key is inserted FIRST — a unique violation
// means it was already sent, so a second run the same day sends nothing.
export async function POST(req: NextRequest) {
  const secret = process.env.CRONJOB_SECRET_KEY;
  const isCron = !!secret && req.headers.get("x-cron-secret") === secret;
  if (!isCron) {
    const viewer = await getHrViewer();
    if (!viewer || !isManager(viewer)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const today = todayInTz();
  const target = addDays(today, DAYS_BEFORE);
  // adminClient: cron has no session; reads holidays + fans out to every staff profile.
  const db = adminClient;
  const { data: holidays } = await db.from("hr_holidays").select("id, name, holiday_date").eq("holiday_date", target);

  let sent = 0;
  for (const h of holidays ?? []) {
    const { error } = await db.from("hr_holiday_reminders_sent").insert({ holiday_id: h.id, days_before: DAYS_BEFORE });
    if (error) continue; // already sent (or a real error — either way don't send)

    const { data: people } = await adminClient.from("profiles").select("id").neq("role", "client");
    const ids = (people ?? []).map((p) => p.id);
    for (let i = 0; i < ids.length; i += CHUNK) {
      await Promise.all(
        ids.slice(i, i + CHUNK).map((id) =>
          createNotification(id, {
            type: "hr_holiday_reminder",
            title: `Holiday in ${DAYS_BEFORE} days`,
            body: `${h.name} · ${formatDate(h.holiday_date)}. Swap a workday now if you need to.`,
            url: V2_ROUTES.HR_HOLIDAYS,
          })
        )
      );
    }
    sent += ids.length;
  }
  return NextResponse.json({ today, target, holidays: holidays?.length ?? 0, notificationsSent: sent });
}
