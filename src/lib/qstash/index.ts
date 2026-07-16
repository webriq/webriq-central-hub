import { Client } from "@upstash/qstash";

// One-shot, exact-time scheduled onboarding start (chat follow-up to task 157) — replaces
// relying solely on the cron poll (migration 079, every 5 min) noticing a project is due.
// QStash delivers exactly at scheduled_onboarding_start_at instead of on the next poll tick.
// The cron poll stays in place as a fallback safety net in case a QStash delivery ever fails —
// this is additive, not a replacement of that mechanism.

function getClient(): Client | null {
  const token = process.env.QSTASH_TOKEN;
  if (!token) return null;
  return new Client({ token });
}

// Publishes a one-shot message that calls back into this app at the exact scheduled instant.
// Returns null (not an error) when QSTASH_TOKEN/NEXT_PUBLIC_APP_URL aren't configured — the
// project still saves fine and the cron poll will pick it up on its next tick, same as before
// this feature existed.
export async function scheduleProjectAutostart(
  projectId: string,
  phaseNumber: 1 | 2 | 3 | 4 | 5,
  scheduledStartAt: string
): Promise<string | null> {
  const client = getClient();
  const appUrl = process.env.NEXT_PUBLIC_APP_URL;
  if (!client || !appUrl) return null;

  try {
    const result = await client.publishJSON({
      url: `${appUrl}/api/onboarding/projects/${projectId}/qstash-start`,
      body: { phase_number: phaseNumber },
      notBefore: Math.floor(new Date(scheduledStartAt).getTime() / 1000),
    });
    return result.messageId;
  } catch (err) {
    console.error("scheduleProjectAutostart: QStash publish error:", err);
    return null;
  }
}

// Best-effort cancel of a pending scheduled-start message — called when a manual override
// (Start Onboarding / Start ... Anyway / Jump to phase) beats the schedule to it. Not calling
// this successfully isn't a correctness bug: the callback route checks programme_started_at
// before doing anything, so a stray late delivery is a harmless no-op, not a duplicate start.
export async function cancelProjectAutostart(messageId: string): Promise<void> {
  const client = getClient();
  if (!client) return;
  try {
    await client.messages.cancel(messageId);
  } catch (err) {
    console.error("cancelProjectAutostart: QStash cancel error:", err);
  }
}
