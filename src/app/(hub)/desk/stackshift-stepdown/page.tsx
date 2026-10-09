import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { adminClient } from "@/lib/supabase/admin";
import { V2_ROUTES } from "@/config/constants";
import { siteStepdownStatus } from "@/lib/stackshift-support/stepdown";
import StepdownView, { type MissView, type SiteView } from "./_stepdown-view";

// Desk > StackShift step-down (task 450) — the control surface for stepping Zoho Desk down AFTER the parity gate.
// Read-only status plus the two deliberate actions on a reconcile miss (import / dismiss). admin / super_admin
// only. Nothing here changes Desk configuration; those steps are operator actions in the runbook.
export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Desk · StackShift step-down" };

export default async function StackShiftStepdownPage() {
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  if (!claims?.claims) redirect(V2_ROUTES.AUTH_LOGIN);

  const userId = claims.claims.sub as string;
  const { data: profile } = await supabase.from("profiles").select("role").eq("id", userId).maybeSingle();
  if (profile?.role !== "admin" && profile?.role !== "super_admin") redirect(V2_ROUTES.DASHBOARD);

  let setupNeeded = false;
  let sites: SiteView[] = [];
  let misses: MissView[] = [];
  const missCounts = { open: 0, imported: 0, dismissed: 0 };

  const { data: signoffs, error: signoffError } = await adminClient
    .from("stackshift_parity_signoff")
    .select("site, signed_at, signed_by")
    .is("revoked_at", null)
    .order("signed_at", { ascending: false });
  if (signoffError) setupNeeded = true;

  if (!setupNeeded) {
    const signerIds = [...new Set((signoffs ?? []).map((s) => s.signed_by))];
    const names = new Map<string, string>();
    if (signerIds.length) {
      const { data: profiles } = await adminClient.from("profiles").select("id, full_name").in("id", signerIds);
      for (const p of profiles ?? []) names.set(p.id, p.full_name ?? "Unknown");
    }
    const seen = new Set<string>();
    for (const s of signoffs ?? []) {
      if (seen.has(s.site)) continue;
      seen.add(s.site);
      const status = await siteStepdownStatus(s.site).catch(() => null);
      sites.push({
        site: s.site,
        signedAt: s.signed_at,
        signedByName: names.get(s.signed_by) ?? "Unknown",
        inFlight: status?.inFlight ?? null,
        inFlightSample: status?.inFlightSample ?? [],
        unretiredPairs: status?.unretiredPairs ?? null,
      });
    }

    const { data: missRows, error: missError } = await adminClient
      .from("stackshift_reconcile_misses")
      .select("desk_ticket_id, ticket_number, subject, site, requester_email, first_seen_at, last_seen_at, status")
      .order("last_seen_at", { ascending: false })
      .limit(500);
    if (missError) {
      // Migration 174 is not applied yet.
      setupNeeded = true;
      sites = [];
    } else {
      for (const m of missRows ?? []) missCounts[m.status]++;
      misses = (missRows ?? [])
        .filter((m) => m.status === "open")
        .map((m) => ({
          deskTicketId: m.desk_ticket_id,
          ticketNumber: m.ticket_number,
          subject: m.subject,
          site: m.site,
          requesterEmail: m.requester_email,
          firstSeenAt: m.first_seen_at,
          lastSeenAt: m.last_seen_at,
        }));
    }
  }

  return (
    <StepdownView
      sites={sites}
      misses={misses}
      missCounts={missCounts}
      setupNeeded={setupNeeded}
      reconcileEnabled={process.env.STACKSHIFT_DESK_RECONCILE_ENABLED === "true"}
      notifyGlobal={process.env.STACKSHIFT_SUPPORT_NOTIFY_CUSTOMER === "true"}
      notifySites={process.env.STACKSHIFT_SUPPORT_NOTIFY_SITES ?? ""}
    />
  );
}
