// Task 450 — pure logic for the Zoho Desk step-down (stages 5–6). Everything here is DORMANT until BOTH a
// non-revoked parity sign-off exists for the ticket's site (task 449) AND the operator has set
// STACKSHIFT_DESK_RECONCILE_ENABLED. No env/DB imports, so _docs/task/450-stepdown.check.ts runs under plain tsx.

import { normSite } from "./parity-logic";

export type ReconcileInput = {
  enabled: boolean; // STACKSHIFT_DESK_RECONCILE_ENABLED
  siteSignedOff: boolean; // the ticket's site has a non-revoked parity sign-off
  hasDeskRow: boolean; // some inbox row already has external_id = this Desk id
  deskRowRetired: boolean; // ...and it was retired by the duplicate cleanup
  hasDirectTwin: boolean; // some inbox row has desk_ticket_id = this Desk id (the direct copy)
};
export type ReconcileDecision = "ingest" | "refresh" | "skip_retired" | "skip_direct" | "miss";

// Normal mode ("ingest") is the pre-step-down behaviour and is the answer whenever EITHER condition is
// missing — so the default, and any revoked sign-off, restores today's flow. In reconcile mode a Desk ticket
// is only ever REFRESHED if the Hub already holds its Desk row (design D5: in-flight tickets keep syncing);
// a ticket the Hub has never seen is a MISS (the direct path failed), never a silent import.
export function reconcileDecision(i: ReconcileInput): ReconcileDecision {
  if (!i.enabled || !i.siteSignedOff) return "ingest";
  if (i.hasDeskRow) return i.deskRowRetired ? "skip_retired" : "refresh";
  if (i.hasDirectTwin) return "skip_direct";
  return "miss";
}

export function isRetired(sourceMeta: unknown): boolean {
  const r = (sourceMeta as { retiredInto?: unknown } | null)?.retiredInto;
  return !!r && typeof r === "object";
}

// --- customer emails (design D4) ---------------------------------------------------------------------
export function parseSiteList(csv: string | undefined): Set<string> {
  return new Set((csv ?? "").split(",").map(normSite).filter(Boolean));
}

// The Hub emails a StackShift customer only when ALL hold: the request allows it (StackShift stopped its own
// notifications), the site has an active sign-off (before the gate Desk/StackShift still notify), and the
// operator opted the site in — either the global flag or the per-site list (`*` = every signed-off site).
export function shouldNotifyCustomer(i: {
  globalFlag: string | undefined;
  sitesCsv: string | undefined;
  site: string | null | undefined;
  siteSignedOff: boolean;
  suppress: boolean;
}): boolean {
  if (i.suppress || !i.siteSignedOff) return false;
  if (i.globalFlag === "true") return true;
  const sites = parseSiteList(i.sitesCsv);
  return sites.has("*") || (!!i.site && sites.has(normSite(i.site)));
}

// --- misses ------------------------------------------------------------------------------------------
// Re-alert about the same miss at most once per cooldown (default 24 h); a never-alerted miss always alerts.
export function shouldAlertMiss(lastAlertedAt: string | null, nowMs: number, cooldownMs = 24 * 3_600_000): boolean {
  if (!lastAlertedAt) return true;
  const t = Date.parse(lastAlertedAt);
  return !Number.isFinite(t) || nowMs - t >= cooldownMs;
}

// --- duplicate cleanup (D6) planning -----------------------------------------------------------------
export type CleanupRow = {
  id: string;
  ticket_number: number;
  status: string;
  sla_due_at: string | null;
  source_meta: Record<string, unknown> | null;
};
export type PairPlan = {
  directId: string;
  deskId: string;
  directTicketNumber: number;
  deskTicketNumber: number;
  // keys ADDED to the direct row's source_meta (never overwrites an existing key)
  directPatch: Record<string, unknown>;
  // key added to the Desk copy's source_meta
  deskPatch: Record<string, unknown>;
  skipReason?: string;
};

const DESK_ONLY_TOP_LEVEL = ["stackShiftSite", "whiteLabel"] as const;

// Keep the direct row, copy the Desk-only context onto it, and mark the Desk copy retired. Nothing is
// deleted and no existing key on either row is overwritten, so apply is additive and rollback is exact.
export function planPair(desk: CleanupRow, direct: CleanupRow, nowIso: string): PairPlan {
  const deskMeta = desk.source_meta ?? {};
  const directMeta = direct.source_meta ?? {};
  const base = {
    directId: direct.id,
    deskId: desk.id,
    directTicketNumber: direct.ticket_number,
    deskTicketNumber: desk.ticket_number,
  };

  if (isRetired(deskMeta)) return { ...base, directPatch: {}, deskPatch: {}, skipReason: "Desk copy is already retired" };
  if (isRetired(directMeta)) return { ...base, directPatch: {}, deskPatch: {}, skipReason: "direct row is itself marked retired — needs a human look" };

  const directPatch: Record<string, unknown> = {};
  for (const k of DESK_ONLY_TOP_LEVEL) {
    if (!(k in directMeta) && deskMeta[k] != null) directPatch[k] = deskMeta[k]; // the ticket page reads these top-level
  }
  if (!("fromDesk" in directMeta)) {
    directPatch.fromDesk = {
      deskInboxId: desk.id,
      deskTicketNumber: (deskMeta.ticketNumber as string | null | undefined) ?? null,
      status: deskMeta.status ?? null,
      statusType: deskMeta.statusType ?? null,
      channel: deskMeta.channel ?? null,
      webUrl: deskMeta.webUrl ?? null,
      cf: deskMeta.cf ?? null,
      customFields: deskMeta.customFields ?? null,
      slaDueAt: desk.sla_due_at,
      copiedAt: nowIso,
    };
  }

  return {
    ...base,
    directPatch,
    deskPatch: { retiredInto: { inboxId: direct.id, ticketNumber: direct.ticket_number, at: nowIso } },
  };
}

const sqlLiteral = (v: unknown) => `'${JSON.stringify(v).replace(/'/g, "''")}'::jsonb`;

// apply.sql: jsonb `||` merges only the NEW top-level keys. Guarded so re-running it is a no-op.
export function applySql(plans: PairPlan[]): string {
  const live = plans.filter((p) => !p.skipReason);
  const lines = live.flatMap((p) => [
    ...(Object.keys(p.directPatch).length
      ? [`update inbox set source_meta = coalesce(source_meta, '{}'::jsonb) || ${sqlLiteral(p.directPatch)} where id = '${p.directId}' and not (coalesce(source_meta, '{}'::jsonb) ? 'fromDesk');`]
      : []),
    `update inbox set source_meta = coalesce(source_meta, '{}'::jsonb) || ${sqlLiteral(p.deskPatch)} where id = '${p.deskId}' and not (coalesce(source_meta, '{}'::jsonb) ? 'retiredInto');`,
  ]);
  return lines.join("\n");
}

// rollback.sql removes exactly the keys apply.sql added (and only those).
export function rollbackSql(plans: PairPlan[]): string {
  const live = plans.filter((p) => !p.skipReason);
  const lines = live.flatMap((p) => [
    ...(Object.keys(p.directPatch).length
      ? [`update inbox set source_meta = source_meta${Object.keys(p.directPatch).map((k) => ` - '${k.replace(/'/g, "''")}'`).join("")} where id = '${p.directId}';`]
      : []),
    `update inbox set source_meta = source_meta - 'retiredInto' where id = '${p.deskId}';`,
  ]);
  return lines.join("\n");
}
