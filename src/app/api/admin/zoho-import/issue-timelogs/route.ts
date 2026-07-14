// dev-only import endpoint — reads _from_zoho/issue-timelogs-*.json (or issue-timelogs.json fallback),
// upserts to time_logs via chunked SSE stream. Issue-scoped sibling of zoho-import/timelogs/route.ts —
// sets issue_id instead of task_id; never touches task_id.
import { NextResponse } from "next/server";
import path from "path";
import fs from "fs";
import { createClient } from "@/lib/supabase/server";
import {
  buildUserCache,
  clearUserCache,
  resolveUserId,
  parseHours,
  adminClient,
} from "@/lib/migrate/zoho-import";

type ZohoIssueTimelogRaw = {
  id?: string;
  date?: string;
  log_hour?: string;
  billing_status?: string;
  notes?: string;
  log_notes?: string;
  owner?: { name?: string; email?: string };
  module_detail?: { id?: string; type?: string; name?: string };
  type?: string;
  _zoho_project_id?: string;
  [key: string]: unknown;
};

type IssueTimelogRow = {
  external_id: string;
  issue_id: string | null;
  project_id: string;
  employee_id: string | null;
  owner_name: string | null;
  owner_email: string | null;
  date_logged: string;
  hours: number;
  billable: boolean;
  note: string | null;
  source: "manual";
};

const CHUNK_SIZE = 50;
const CHUNK_DELAY_MS = 100;

function stripHtml(s: string | null | undefined): string | null {
  if (!s) return null;
  const stripped = s.replace(/<[^>]*>/g, "").trim();
  return stripped || null;
}

export async function POST() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: profile } = await adminClient.from("profiles").select("role").eq("id", user.id).maybeSingle();
  if (profile?.role !== "admin" && profile?.role !== "super_admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  // Multi-file scan: pick up all issue-timelogs-*.json batch files, sorted for deterministic order
  const dir = path.join(process.cwd(), "_from_zoho");
  const allLogs: ZohoIssueTimelogRaw[] = [];

  const batchFiles = fs
    .readdirSync(dir)
    .filter((f) => f.startsWith("issue-timelogs-") && f.endsWith(".json"))
    .sort();

  if (batchFiles.length > 0) {
    for (const file of batchFiles) {
      const parsed = JSON.parse(fs.readFileSync(path.join(dir, file), "utf-8"));
      if (Array.isArray(parsed)) allLogs.push(...(parsed as ZohoIssueTimelogRaw[]));
    }
  } else {
    const fallback = path.join(dir, "issue-timelogs.json");
    if (!fs.existsSync(fallback)) {
      return NextResponse.json({ error: "No issue-timelogs files found in _from_zoho/" }, { status: 400 });
    }
    const parsed = JSON.parse(fs.readFileSync(fallback, "utf-8"));
    allLogs.push(...(Array.isArray(parsed) ? (parsed as ZohoIssueTimelogRaw[]) : []));
  }

  if (allLogs.length === 0) {
    return NextResponse.json({ error: "No issue timelogs found in files" }, { status: 400 });
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (obj: object) =>
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(obj)}\n\n`));

      try {
        clearUserCache();
        const userCache = await buildUserCache();

        console.log(`[import/issue-timelogs] ${allLogs.length} log records from ${batchFiles.length || 1} file(s)`);

        // Pre-built lookup maps — two bulk queries instead of one per row.
        // issues has 1,049 rows, over Supabase/PostgREST's 1000-row default select cap
        // (same class of bug task 103/110 hit) — paginate.
        const { data: projectRows } = await adminClient.from("projects").select("id, external_project_id");
        const projectMap = new Map((projectRows ?? []).map((p) => [String(p.external_project_id), p.id as string]));

        const issueRows: Array<{ id: string; external_id: string }> = [];
        {
          const PAGE = 1000;
          let from = 0;
          while (true) {
            const { data: page } = await adminClient
              .from("issues")
              .select("id, external_id")
              .not("external_id", "is", null)
              .range(from, from + PAGE - 1);
            if (!page || page.length === 0) break;
            issueRows.push(...(page as Array<{ id: string; external_id: string }>));
            if (page.length < PAGE) break;
            from += PAGE;
          }
        }
        const issueMap = new Map(issueRows.map((i) => [String(i.external_id), i.id]));

        console.log(`[import/issue-timelogs] projectMap: ${projectMap.size} projects, issueMap: ${issueMap.size} issues`);

        let imported = 0;
        let skipped = 0;
        const errors: string[] = [];

        const rows: IssueTimelogRow[] = [];

        for (const log of allLogs) {
          const externalId = String(log.id ?? "");
          const dateLogged = log.date ?? null;
          if (!externalId || !dateLogged) { skipped++; continue; }

          const projectId = projectMap.get(String(log._zoho_project_id ?? ""));
          if (!projectId) {
            errors.push(`timelog ${externalId}: no Hub project for external_project_id=${log._zoho_project_id}`);
            skipped++;
            continue;
          }

          const zohoIssueId = log.module_detail?.id;
          let issueId: string | null = null;
          if (zohoIssueId) {
            issueId = issueMap.get(String(zohoIssueId)) ?? null;
            if (!issueId) {
              errors.push(`timelog ${externalId}: unresolved issue module_detail.id=${zohoIssueId} (not yet imported)`);
            }
          }

          const employeeId = await resolveUserId(log.owner?.email, userCache);

          rows.push({
            external_id: externalId,
            issue_id: issueId,
            project_id: projectId,
            employee_id: employeeId,
            owner_name: log.owner?.name ?? null,
            owner_email: log.owner?.email ?? null,
            date_logged: dateLogged,
            hours: parseHours(log.log_hour ?? "0:00"),
            billable: log.billing_status === "Billable",
            note: stripHtml(log.notes ?? log.log_notes ?? null),
            source: "manual",
          });
        }

        console.log(`[import/issue-timelogs] built ${rows.length} rows to upsert (${skipped} skipped, ${errors.length} unresolved-issue warnings so far)`);

        const total = Math.ceil(rows.length / CHUNK_SIZE);

        for (let i = 0; i < rows.length; i += CHUNK_SIZE) {
          const chunk = rows.slice(i, i + CHUNK_SIZE);
          const { error } = await adminClient.from("time_logs").upsert(chunk, { onConflict: "external_id" });
          const current = Math.floor(i / CHUNK_SIZE) + 1;
          if (error) {
            console.error(`[import/issue-timelogs] chunk ${current}/${total} upsert failed:`, error.message);
            errors.push(`chunk ${current}: ${error.message}`);
          } else {
            imported += chunk.length;
          }
          send({ type: "progress", current, total });
          if (i + CHUNK_SIZE < rows.length) {
            await new Promise<void>((r) => setTimeout(r, CHUNK_DELAY_MS));
          }
        }

        console.log(`[import/issue-timelogs] done: ${imported} imported, ${skipped} skipped, ${errors.length} errors`);
        send({ type: "done", imported, skipped, errors });
      } catch (e) {
        console.error("[import/issue-timelogs] fatal error:", e);
        send({ type: "error", message: String(e) });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "Connection": "keep-alive",
    },
  });
}
