import { adminClient } from "@/lib/supabase/admin";
import { createNotification } from "@/lib/notifications";
import { transporter, FROM } from "@/lib/email/mailer";
import { V2_ROUTES } from "@/config/constants";
import { formatRange } from "./dates";

/**
 * A13 — on approval, tell the teammates the requester listed: an in-app notification for any
 * address that belongs to a Hub user (looked up via hub_users with adminClient — the session
 * cannot read other users' rows) and a plain email to every address. Best-effort: never throws.
 */
export async function notifyTeamOfLeave(args: {
  emails: string[];
  employeeName: string;
  typeName: string;
  start: string;
  end: string;
  actorId: string;
}): Promise<void> {
  if (!args.emails.length) return;
  const range = formatRange(args.start, args.end);
  const lower = args.emails.map((e) => e.toLowerCase());

  try {
    const { data: users } = await adminClient.from("hub_users").select("id, email").in("email", lower);
    await Promise.all(
      (users ?? []).map((u) =>
        createNotification(u.id, {
          type: "hr_team_leave",
          title: `${args.employeeName} will be out`,
          body: `${args.typeName} · ${range}`,
          url: V2_ROUTES.HR_CALENDAR,
          actorId: args.actorId,
        })
      )
    );
  } catch (err) {
    console.error("[hr] team in-app notify failed:", err);
  }

  await Promise.all(
    lower.map((to) =>
      transporter
        .sendMail({
          from: FROM,
          to,
          subject: `${args.employeeName} will be out — ${range}`,
          text: `${args.employeeName} has approved leave (${args.typeName}) for ${range}.\n\nThis is an automated heads-up from WebriQ Central Hub.`,
        })
        .catch((err: unknown) => console.error("[hr] team email failed:", err))
    )
  );
}
