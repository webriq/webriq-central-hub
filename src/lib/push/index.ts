import webpush from "web-push";
import { adminClient } from "@/lib/supabase/admin";

// VAPID "subject" is a contact point for the push service to reach the app operator if
// needed — web-push requires it to be an https: or mailto: URL. It is NOT the app's own
// URL: using NEXT_PUBLIC_APP_URL here breaks in every http:// dev environment (including
// the standard http://localhost:3000), since setVapidDetails() validates and throws
// synchronously at module load, crashing the entire importing module graph. mailto: is
// valid in every environment, so it's used unconditionally — reuses the same contact
// email + fallback pattern as src/lib/email/mailer.ts's FROM constant.
const VAPID_SUBJECT = `mailto:${process.env.MAIL_FROM ?? "noreply@webriq.com"}`;

if (process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) {
  webpush.setVapidDetails(
    VAPID_SUBJECT,
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
