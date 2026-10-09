import { adminClient } from "@/lib/supabase/admin";
import { notifyAdmins } from "./alerts";
import { activeSignedOffSites } from "./parity";
import { shouldAlertMiss } from "./stepdown-logic";

// Task 450 — runtime side of the Desk step-down. DORMANT by default: reconcile mode needs both the operator
// switch (STACKSHIFT_DESK_RECONCILE_ENABLED=true) and a non-revoked parity sign-off for the ticket's site.

export type ReconcileContext = { enabled: boolean; signedOffSites: Set<string> };

export async function loadReconcileContext(): Promise<ReconcileContext> {
  const enabled = process.env.STACKSHIFT_DESK_RECONCILE_ENABLED === "true";
  // Skip the lookup entirely while the switch is off: the poll then costs nothing extra.
  return { enabled, signedOffSites: enabled ? await activeSignedOffSites() : new Set() };
}

export type MissInput = {
  deskTicketId: string;
  ticketNumber: string | null;
  subject: string;
  site: string | null;
  requesterEmail: string | null;
};

// A StackShift ticket exists in Desk but the Hub has neither its Desk row nor a direct copy: the direct path
// failed for it. Recorded (so it is visible and importable on the step-down page) and admins are notified at
// most once per day per ticket. Never imports.
export async function recordMiss(m: MissInput): Promise<void> {
  const nowIso = new Date().toISOString();
  const { data: existing } = await adminClient
    .from("stackshift_reconcile_misses")
    .select("desk_ticket_id, status, last_alerted_at")
    .eq("desk_ticket_id", m.deskTicketId)
    .maybeSingle();

  // A dismissed or already-imported miss stays quiet.
  if (existing && existing.status !== "open") return;

  const alert = shouldAlertMiss(existing?.last_alerted_at ?? null, Date.now());
  const { error } = await adminClient.from("stackshift_reconcile_misses").upsert(
    {
      desk_ticket_id: m.deskTicketId,
      ticket_number: m.ticketNumber,
      subject: m.subject,
      site: m.site,
      requester_email: m.requesterEmail,
      last_seen_at: nowIso,
      ...(alert ? { last_alerted_at: nowIso } : {}),
    },
    { onConflict: "desk_ticket_id" },
  );
  if (error) {
    console.warn("[stackshift-support] could not record reconcile miss:", error.message);
    return;
  }
  if (alert) {
    await notifyAdmins(
      "StackShift ticket missing from the Hub",
      `Desk ticket ${m.ticketNumber ?? m.deskTicketId} ("${m.subject.slice(0, 80)}") exists in Zoho Desk but never reached the Hub. Review it under Desk → StackShift step-down.`,
      "/desk/stackshift-stepdown",
    );
  }
}
