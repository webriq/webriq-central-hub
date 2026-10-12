import { adminClient } from "@/lib/supabase/admin";
import { createNotification } from "@/lib/notifications";
import { sendCliqNotification } from "@/lib/zoho";
import { AUTH_FAILURE_OUTCOMES, authSpikes, shouldAlert } from "./parity-logic";

// Task 449 — alerts for the direct StackShift support API: a spike of failed auths from one key id, and
// outbox events that have gone dead. Delivered as in-app + push notifications to every admin/super_admin
// (the user's choice: Cliq is switched off in code, so `sendCliqNotification` stays wired but is a no-op
// until CLIQ_NOTIFICATIONS_ENABLED is turned on). Dedupe uses rows in email_poll_cursor (free-text id, same
// reuse as the Desk poll cursors): an auth spike re-alerts at most once per hour per key; dead events alert
// once per new batch.

const AUTH_WINDOW_MS = 10 * 60_000;
const DEAD_CURSOR = "stackshift-alert-dead";
const authCursor = (keyId: string) => `stackshift-alert-auth:${keyId}`;

async function readCursor(id: string): Promise<string | null> {
  const { data } = await adminClient.from("email_poll_cursor").select("last_received_time").eq("id", id).maybeSingle();
  return data?.last_received_time ?? null;
}

async function writeCursor(id: string, value: string) {
  const { error } = await adminClient
    .from("email_poll_cursor")
    .upsert({ id, last_received_time: value, updated_at: new Date().toISOString() }, { onConflict: "id" });
  if (error) console.warn(`[stackshift-alerts] could not write cursor ${id}:`, error.message);
}

export async function notifyAdmins(title: string, body: string, url = "/desk/stackshift-parity") {
  const { data: admins } = await adminClient.from("profiles").select("id").in("role", ["admin", "super_admin"]);
  await Promise.all(
    (admins ?? []).map((a) => createNotification(a.id, { type: "stackshift_alert", title, body, url })),
  );
  await sendCliqNotification(`${title}: ${body}`, "dev");
}

export async function runAlertChecks(nowMs = Date.now()): Promise<{ authSpikes: number; deadEvents: number }> {
  const out = { authSpikes: 0, deadEvents: 0 };

  // 1. failed auths from one key id within the last 10 minutes
  const { data: failures, error: authError } = await adminClient
    .from("stackshift_support_audit")
    .select("key_id")
    .in("outcome", [...AUTH_FAILURE_OUTCOMES])
    .gte("at", new Date(nowMs - AUTH_WINDOW_MS).toISOString())
    .limit(1000);
  if (authError) console.warn("[stackshift-alerts] audit unavailable:", authError.message);
  for (const spike of authSpikes(failures ?? [])) {
    if (!shouldAlert(await readCursor(authCursor(spike.keyId)), nowMs)) continue;
    await notifyAdmins(
      "StackShift API: failed authentications",
      `${spike.count} failed signature checks from key "${spike.keyId}" in the last 10 minutes. Check the signing secret / clock skew on the StackShift side.`,
    );
    await writeCursor(authCursor(spike.keyId), new Date(nowMs).toISOString());
    out.authSpikes++;
  }

  // 2. outbox events that went dead since the last alert. The first ever run only seeds the cursor, so
  // historical dead events do not page anyone.
  const deadCursor = await readCursor(DEAD_CURSOR);
  if (!deadCursor) {
    await writeCursor(DEAD_CURSOR, new Date(nowMs).toISOString());
    return out;
  }
  const { data: dead, error: deadError } = await adminClient
    .from("stackshift_outbox")
    .select("last_attempt_at")
    .eq("status", "dead")
    .gt("last_attempt_at", deadCursor)
    .order("last_attempt_at", { ascending: false })
    .limit(500);
  if (deadError) console.warn("[stackshift-alerts] outbox unavailable:", deadError.message);
  if (dead && dead.length > 0) {
    await notifyAdmins(
      "StackShift outbox: events failed permanently",
      `${dead.length} event${dead.length === 1 ? "" : "s"} could not be delivered to StackShift after all retries. Review and replay them under Desk → StackShift outbox.`,
    );
    await writeCursor(DEAD_CURSOR, dead[0].last_attempt_at ?? new Date(nowMs).toISOString());
    out.deadEvents = dead.length;
  }
  return out;
}
