import webpush from "web-push";
import { adminClient } from "@/lib/supabase/admin";

if (
  process.env.NEXT_PUBLIC_APP_URL &&
  process.env.VAPID_PUBLIC_KEY &&
  process.env.VAPID_PRIVATE_KEY
) {
  webpush.setVapidDetails(
    process.env.NEXT_PUBLIC_APP_URL,
    process.env.VAPID_PUBLIC_KEY,
    process.env.VAPID_PRIVATE_KEY
  );
}

export type PushPayload = {
  title: string;
  body: string;
  url?: string;
};

export async function sendPushNotification(
  profileId: string,
  payload: PushPayload
): Promise<void> {
  const { data: subscription } = await adminClient
    .from("push_subscriptions")
    .select("endpoint, keys")
    .eq("profile_id", profileId)
    .maybeSingle();

  if (!subscription) return;

  const keys = subscription.keys as { p256dh: string; auth: string };

  try {
    await webpush.sendNotification(
      { endpoint: subscription.endpoint, keys },
      JSON.stringify(payload)
    );
  } catch (err) {
    // 410 Gone — subscription expired or revoked; remove stale row
    if (
      err &&
      typeof err === "object" &&
      "statusCode" in err &&
      (err as { statusCode: number }).statusCode === 410
    ) {
      await adminClient
        .from("push_subscriptions")
        .delete()
        .eq("endpoint", subscription.endpoint);
    } else {
      throw err;
    }
  }
}
