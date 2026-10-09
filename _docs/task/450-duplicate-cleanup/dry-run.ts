// Task 450 (design D6) — READ-ONLY dry run of the one-time duplicate cleanup. For every correlated pair (a direct
// StackShift row and its Zoho Desk copy) of a SIGNED-OFF site it plans: keep the direct row, copy the Desk-only
// context onto it, and flag the Desk copy as retired. It prints the plan and writes out/plan.json, out/apply.sql and
// out/rollback.sql for REVIEW — this script NEVER executes them, never deletes, and never writes to the database.
// Pattern of _docs/task/434-backfill/dry-run.ts.
//
//   NODE_OPTIONS=--experimental-websocket node --env-file=.env node_modules/tsx/dist/cli.mjs _docs/task/450-duplicate-cleanup/dry-run.ts [--site <site>]
// Local test target:  BACKFILL_SUPABASE_URL=http://127.0.0.1:54321 BACKFILL_SECRET_KEY=<local service key> ...
//
// Refuses to plan anything unless a non-revoked parity sign-off (task 449) exists for the site.
import { createClient } from "@supabase/supabase-js";
import { mkdirSync, writeFileSync } from "node:fs";
import { applySql, planPair, rollbackSql, type CleanupRow, type PairPlan } from "@/lib/stackshift-support/stepdown-logic";
import { normSite } from "@/lib/stackshift-support/parity-logic";

const url = process.env.BACKFILL_SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL!;
const key = process.env.BACKFILL_SECRET_KEY ?? process.env.SUPABASE_SECRET_KEY!;
const target = /127\.0\.0\.1|localhost/.test(url) ? "LOCAL" : "LIVE (read-only)";
const sb = createClient(url, key, { auth: { persistSession: false } });
const OUT = "_docs/task/450-duplicate-cleanup/out";
const onlySite = process.argv.includes("--site") ? normSite(process.argv[process.argv.indexOf("--site") + 1] ?? "") : null;
const esc = (s: string) => s.replace(/[\\%_]/g, (c) => `\\${c}`);

async function paged<T>(build: (from: number, to: number) => PromiseLike<{ data: unknown; error: { message: string } | null }>): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await build(from, from + 999);
    if (error) throw new Error(error.message);
    const page = data as T[];
    rows.push(...page);
    if (page.length < 1000) return rows;
  }
}

type DbRow = CleanupRow & { external_id?: string | null; desk_ticket_id?: string | null };

async function main() {
  console.log(`Target: ${target}\n`);

  const { data: signoffs, error: soError } = await sb.from("stackshift_parity_signoff").select("site").is("revoked_at", null);
  if (soError) throw new Error(`could not read sign-offs (migration 173 applied?): ${soError.message}`);
  let sites = [...new Set((signoffs ?? []).map((s) => normSite(s.site as string)))];
  if (onlySite) sites = sites.filter((s) => s === onlySite);
  if (sites.length === 0) {
    console.log(onlySite ? `REFUSING: no active parity sign-off for site "${onlySite}".` : "REFUSING: no active parity sign-off exists for any site (task 449). Nothing planned.");
    process.exit(1);
  }

  const nowIso = new Date().toISOString();
  const plans: PairPlan[] = [];
  const report: Record<string, { pairs: number; planned: number; skipped: number }> = {};

  for (const site of sites) {
    const desk = await paged<DbRow>((a, b) =>
      sb.from("inbox").select("id, ticket_number, status, sla_due_at, source_meta, external_id")
        .eq("source_meta->>source", "stackshift-desk-poll").ilike("source_meta->>stackShiftSite", esc(site)).range(a, b));
    const direct = await paged<DbRow>((a, b) =>
      sb.from("inbox").select("id, ticket_number, status, sla_due_at, source_meta, desk_ticket_id")
        .eq("channel", "stackshift").ilike("stackshift_site", esc(site)).not("desk_ticket_id", "is", null).range(a, b));

    const directByDeskId = new Map(direct.map((d) => [d.desk_ticket_id as string, d]));
    let planned = 0, skipped = 0, pairs = 0;
    for (const d of desk) {
      const twin = d.external_id ? directByDeskId.get(d.external_id) : undefined;
      if (!twin) continue; // a Desk ticket with no direct copy is a reconcile MISS, not a cleanup candidate
      pairs++;
      const plan = planPair(d, twin, nowIso);
      plans.push(plan);
      if (plan.skipReason) skipped++; else planned++;
    }
    report[site] = { pairs, planned, skipped };
  }

  console.log(JSON.stringify({ sites: report, totalPairs: plans.length, toRetire: plans.filter((p) => !p.skipReason).length }, null, 2));
  const skipped = plans.filter((p) => p.skipReason);
  if (skipped.length) {
    console.log("\nSkipped pairs:");
    for (const p of skipped.slice(0, 40)) console.log(`  direct #${p.directTicketNumber} / desk #${p.deskTicketNumber}: ${p.skipReason}`);
  }
  console.log("\nSample (first 5):");
  for (const p of plans.filter((x) => !x.skipReason).slice(0, 5)) {
    console.log(`  direct #${p.directTicketNumber} <- desk #${p.deskTicketNumber}: copy [${Object.keys(p.directPatch).join(", ") || "nothing new"}], retire Desk copy`);
  }

  mkdirSync(OUT, { recursive: true });
  writeFileSync(`${OUT}/plan.json`, JSON.stringify(plans, null, 2));
  writeFileSync(`${OUT}/apply.sql`, `-- Task 450 duplicate cleanup. REVIEW before running. Additive only: adds keys to inbox.source_meta, deletes nothing.\n-- Generated ${nowIso}\nbegin;\n${applySql(plans)}\ncommit;\n`);
  writeFileSync(`${OUT}/rollback.sql`, `-- Task 450 duplicate cleanup ROLLBACK: removes exactly the keys apply.sql added.\nbegin;\n${rollbackSql(plans)}\ncommit;\n`);
  console.log(`\nWrote ${OUT}/plan.json, apply.sql, rollback.sql. Nothing was applied.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
