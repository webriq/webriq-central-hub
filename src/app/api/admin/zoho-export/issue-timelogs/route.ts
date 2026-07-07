// dev-only export endpoint — fetches timelogs per issue via SSE.
// Groups issues by project for progress; fetches each issue's logs with module param (type: "issue").
// Mirrors zoho-export/timelogs/route.ts (Tasks version) — see task 111 doc for the two deltas:
// no log_hours pre-filter available on issues (must query all), and module.type is "issue" not "task".
import { NextResponse } from "next/server";
import path from "path";
import fs from "fs";
import { createClient } from "@/lib/supabase/server";
import { adminClient } from "@/lib/supabase/admin";
import { getZohoAccessToken, fetchZohoWithRetry } from "@/lib/zoho";

const BASE = `https://projectsapi.zoho.com/api/v3/portal/${process.env.ZOHO_PORTAL_ID}`;
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

// API caps customdate at 6 months — generate windows from a start date to today
function windowsFrom(startIso: string) {
  const windows: Array<{ start: string; end: string }> = [];
  const now = new Date();
  const cursor = new Date(startIso);
  cursor.setDate(1); // align to month start

  while (cursor <= now) {
    const start = cursor.toISOString().split("T")[0];
    const endCursor = new Date(cursor);
    endCursor.setMonth(endCursor.getMonth() + 6);
    endCursor.setDate(endCursor.getDate() - 1);
    const end = endCursor > now ? now.toISOString().split("T")[0] : endCursor.toISOString().split("T")[0];
    windows.push({ start, end });
    cursor.setMonth(cursor.getMonth() + 6);
  }

  return windows;
}

type ZohoIssue = {
  id?: string;
  id_string?: string;
  _zoho_project_id?: string;
  created_time?: string;
  project?: { id?: string; name?: string };
};

export async function GET(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: profile } = await adminClient.from("profiles").select("role").eq("id", user.id).maybeSingle();
  if (profile?.role !== "admin" && profile?.role !== "super_admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  let token = await getZohoAccessToken();
  if (!token) return NextResponse.json({ error: "No Zoho token" }, { status: 502 });

  const params = new URL(request.url).searchParams;
  const fromN = parseInt(params.get("from") ?? "0", 10);
  const toRaw = params.get("to");
  const toN = toRaw ? parseInt(toRaw, 10) : undefined;

  const fromZoho = path.join(process.cwd(), "_from_zoho");
  const issueFiles = fs.readdirSync(fromZoho).filter(f => (f.startsWith("issues-") && f.endsWith(".json")) || f === "issues.json");
  if (issueFiles.length === 0) {
    return NextResponse.json({ error: "No issues-*.json files found in _from_zoho/" }, { status: 400 });
  }

  // Load all issues across all issue files — no log_hours pre-filter available (see task 111 decision #1)
  const allIssues: ZohoIssue[] = [];
  for (const fileName of issueFiles) {
    const raw = JSON.parse(fs.readFileSync(path.join(fromZoho, fileName), "utf-8"));
    const issues: ZohoIssue[] = Array.isArray(raw) ? raw : (raw.issues ?? Object.values(raw)[0] as ZohoIssue[]);
    allIssues.push(...issues);
  }

  // Group issues by project for progress tracking — same shape as the Tasks version
  const issuesByProject = new Map<string, { name: string; issues: ZohoIssue[] }>();
  for (const issue of allIssues) {
    const pid = issue._zoho_project_id ?? issue.project?.id ?? "";
    if (!pid) continue;
    if (!issuesByProject.has(pid)) issuesByProject.set(pid, { name: issue.project?.name ?? pid, issues: [] });
    issuesByProject.get(pid)!.issues.push(issue);
  }

  const allProjectEntries = [...issuesByProject.entries()];
  const projectEntries = allProjectEntries.slice(fromN, toN ?? undefined);
  console.log(`[issue-timelogs] ${allIssues.length} issues across ${allProjectEntries.length} projects — exporting slice [${fromN}–${toN ?? allProjectEntries.length}] (${projectEntries.length} projects)`);

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (obj: object) =>
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(obj)}\n\n`));

      let totalLogs = 0;
      const failedIssueWindows: string[] = [];

      for (let i = 0; i < projectEntries.length; i++) {
        const [projectId, { name: projectName, issues }] = projectEntries[i];
        const projectLogs: unknown[] = [];

        for (const issue of issues) {
          const issueId = String(issue.id_string ?? issue.id);
          const windowStart = issue.created_time ?? "2020-01-01T00:00:00Z";
          const windows = windowsFrom(windowStart);

          for (const { start, end } of windows) {
            let page = 1;

            while (true) {
              const qp = new URLSearchParams({
                page: String(page),
                per_page: "100",
                view_type: "customdate",
                start_date: start,
                end_date: end,
                module: JSON.stringify({ id: issueId, type: "issue" }),
              });
              const url = `${BASE}/projects/${projectId}/timelogs?${qp}`;
              const { res, token: newToken, throttleExhausted } = await fetchZohoWithRetry(url, token, { label: "issue-timelogs" });
              token = newToken;

              if (!res.ok) {
                if (throttleExhausted) {
                  failedIssueWindows.push(`${issueId} ${start}→${end}`);
                  console.log(`[issue-timelogs] Giving up on issue=${issueId} ${start}→${end} — rolling-throttle retries exhausted`);
                } else {
                  console.log(`[issue-timelogs] ${res.status} issue=${issueId} ${start}→${end}:`, await res.text());
                }
                break;
              }

              const json = await res.json() as {
                time_logs?: Array<{ log_details?: unknown[] }>;
                page_info?: { has_next_page?: boolean };
              };
              const logDetails = (json.time_logs ?? []).flatMap((day) =>
                (day.log_details ?? []).map((entry) => ({
                  ...(entry as Record<string, unknown>),
                  _zoho_project_id: projectId,
                }))
              );
              projectLogs.push(...logDetails);

              if (!json.page_info?.has_next_page) break;
              page++;
              await sleep(100);
            }

            await sleep(700); // stay under Zoho's 200 req/2 min rolling limit
          }
        }

        console.log(`[issue-timelogs] project="${projectName}" issues=${issues.length} logs=${projectLogs.length}`);
        totalLogs += projectLogs.length;
        send({ type: "progress", current: i + 1, total: projectEntries.length, project: projectName });
        send({ type: "timelogs", logs: projectLogs });
        await sleep(100);
      }

      send({ type: "done", total_logs: totalLogs, failed_windows: failedIssueWindows });
      controller.close();
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
