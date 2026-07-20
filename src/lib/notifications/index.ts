import { adminClient } from "@/lib/supabase/admin";
import { sendPushNotification } from "@/lib/push";

export type NotificationPayload = {
  type: string;
  title: string;
  body: string;
  url?: string;
  actorId?: string;
};

// The `notifications` table (recipient_id/event_type/link/channels_sent) shipped in
// migration 025 as unused scaffolding — this is its first real writer. Column names
// predate this task; the public NotificationPayload shape here is what callers use.
export async function createNotification(
  profileId: string,
  payload: NotificationPayload
): Promise<void> {
  const channelsSent = ["in_app"];

  try {
    await sendPushNotification(profileId, {
      title: payload.title,
      body: payload.body,
      url: payload.url,
    });
    channelsSent.push("push");
  } catch (err) {
    // Push is best-effort — the in-app notification row is still saved below.
    console.error("createNotification push error:", err);
  }

  const { error } = await adminClient.from("notifications").insert({
    recipient_id: profileId,
    actor_id: payload.actorId ?? null,
    event_type: payload.type,
    title: payload.title,
    body: payload.body,
    link: payload.url ?? null,
    channels_sent: channelsSent,
  });

  if (error) {
    console.error("createNotification insert error:", error);
  }
}

export async function notifyProjectMembers(
  projectId: string,
  payload: NotificationPayload,
  opts: { ownerOnly?: boolean } = {}
): Promise<void> {
  let query = adminClient
    .from("project_members")
    .select("user_id")
    .eq("project_id", projectId);

  if (opts.ownerOnly) {
    query = query.eq("is_owner", true);
  }

  const { data: members, error } = await query;

  if (error) {
    console.error("notifyProjectMembers fetch error:", error);
    return;
  }

  if (!members || members.length === 0) return;

  await Promise.all(members.map((m) => createNotification(m.user_id, payload)));
}
