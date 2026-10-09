import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { adminClient } from "@/lib/supabase/admin";
import { V2_ROUTES } from "@/config/constants";
import { buildReport, latestSignoff, listDirectSites } from "@/lib/stackshift-support/parity";
import { normSite } from "@/lib/stackshift-support/parity-logic";
import ParityView, { type SignoffView } from "./_parity-view";

// Desk > StackShift parity (task 449) — the evidence for the go/no-go on stepping Zoho Desk down (task 450).
// admin / super_admin only, matching the sign-off API routes. The report is computed on the server for the
// chosen site + window and is read-only; signing off is a separate, explicit action.
export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Desk · StackShift parity" };

const DAY = 86_400_000;

// Server component rendered per request (force-dynamic); the clock read lives outside the component body.
function currentTimeMs() {
  return Date.now();
}

function parseDay(raw: string | undefined): number | null {
  if (!raw || !/^\d{4}-\d{2}-\d{2}$/.test(raw)) return null;
  const ms = Date.parse(`${raw}T00:00:00.000Z`);
  return Number.isFinite(ms) ? ms : null;
}

export default async function StackShiftParityPage({
  searchParams,
}: {
  searchParams: Promise<{ site?: string; from?: string; to?: string }>;
}) {
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  if (!claims?.claims) redirect(V2_ROUTES.AUTH_LOGIN);

  const userId = claims.claims.sub as string;
  const { data: profile } = await supabase.from("profiles").select("role").eq("id", userId).maybeSingle();
  if (profile?.role !== "admin" && profile?.role !== "super_admin") redirect(V2_ROUTES.DASHBOARD);

  const params = await searchParams;
  let setupError: string | null = null;
  let sites: Awaited<ReturnType<typeof listDirectSites>> = [];
  try {
    sites = await listDirectSites();
  } catch (err) {
    // Migration 169 (stackshift_site column) not applied yet — show a setup note, not a raw error.
    setupError = err instanceof Error ? err.message : "Could not load sites";
  }

  const site = params.site ? normSite(params.site) : sites[0]?.site ?? null;
  const siteInfo = sites.find((s) => s.site === site);
  const now = currentTimeMs();
  // Default window starts when dual-write began for the site (its first direct ticket), so the 14-day
  // threshold measures real overlap, not an arbitrary lookback.
  const fromMs = parseDay(params.from) ?? (siteInfo ? Date.parse(siteInfo.firstAt) : now - 14 * DAY);
  const toDay = parseDay(params.to);
  const toMs = toDay === null ? now : Math.min(toDay + DAY - 1, now);

  let report = null;
  let reportError: string | null = null;
  let signoff: SignoffView | null = null;
  if (site && !setupError) {
    try {
      report = await buildReport(site, fromMs, toMs);
    } catch (err) {
      console.error("[desk/stackshift-parity] report failed:", err);
      reportError = "The report could not be computed. Check that migrations 169–173 are applied.";
    }
    const row = await latestSignoff(site).catch(() => null);
    if (row) {
      const { data: signer } = await adminClient.from("profiles").select("full_name").eq("id", row.signed_by).maybeSingle();
      signoff = {
        id: row.id,
        signedAt: row.signed_at,
        signedByName: signer?.full_name ?? "Unknown",
        windowFrom: row.window_from,
        windowTo: row.window_to,
        ticketCount: row.ticket_count,
        note: row.note,
        revokedAt: row.revoked_at,
        revokeReason: row.revoke_reason,
        acknowledgementCount: Array.isArray(row.acknowledgements) ? row.acknowledgements.length : 0,
      };
    }
  }

  return (
    <ParityView
      sites={sites}
      site={site}
      fromDay={new Date(fromMs).toISOString().slice(0, 10)}
      toDay={new Date(toMs).toISOString().slice(0, 10)}
      report={report}
      signoff={signoff}
      setupError={setupError}
      reportError={reportError}
    />
  );
}
