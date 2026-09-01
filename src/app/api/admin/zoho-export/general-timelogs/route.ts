// dev-only export endpoint — fetches GENERAL (project-level, no task/bug) timelogs per project via SSE.
// Third sibling of zoho-export/timelogs (task) and zoho-export/issue-timelogs (issue) — see task 342 doc.
// Deltas from the issue version: iterates projects.json directly (general logs have no work-item list,
// so no inner entity loop), and the module param is { type: "general" } with no id.
import { NextResponse } from "next/server";
import path from "path";
import fs from "fs";
import { createClient } from "@/lib/supabase/server";
import { adminClient } from "@/lib/supabase/admin";
import { getZohoAccessToken, fetchZohoWithRetry } from "@/lib/zoho";

const BASE = `https://projectsapi.zoho.com/api/v3/portal/${process.env.ZOHO_PORTAL_ID}`;
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

// Floor every window start at 2025-01-01 so general logs match the Hub's task/issue
// time-log coverage — both were exported with since=2025-01-01 (the real
// timelogs-*.json / issue-timelogs-*.json files hold zero pre-2025 entries).
// 168 of 228 projects predate this; without the floor they'd drag in 2020-2024 history.
// Clamp on the date-string (not via windowsFrom's start) so month-alignment + server
// timezone can never leak a Dec-2024 window.
const EXPORT_FLOOR_DATE = "2025-01-01";

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

type ZohoProject = {
  id?: string;
  id_string?: string;
  name?: string;
  created_time?: string;
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
  const projectsFile = path.join(fromZoho, "projects.json");
  if (!fs.existsSync(projectsFile)) {
    return NextResponse.json({ error: "No projects.json found in _from_zoho/" }, { status: 400 });
  }

  const raw = JSON.parse(fs.readFileSync(projectsFile, "utf-8"));
  const projectsRaw: ZohoProject[] = Array.isArray(raw) ? raw : (raw.projects ?? Object.values(raw)[0] as ZohoProject[]);
  const allProjectEntries = (projectsRaw ?? [])
    .map((p) => ({ id: String(p.id_string ?? p.id ?? ""), name: p.name ?? "", createdTime: p.created_time }))
    .filter((p) => p.id);

  if (allProjectEntries.length === 0) {
    return NextResponse.json({ error: "projects.json has no usable project entries" }, { status: 400 });
  }

  const projectEntries = allProjectEntries.slice(fromN, toN ?? undefined);
  console.log(`[general-timelogs] ${allProjectEntries.length} projects — exporting slice [${fromN}–${toN ?? allProjectEntries.length}] (${projectEntries.length} projects)`);

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (obj: object) =>
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(obj)}\n\n`));

      let totalLogs = 0;
      const failedProjectWindows: string[] = [];

      for (let i = 0; i < projectEntries.length; i++) {
        const { id: projectId, name: projectName, createdTime } = projectEntries[i];
        const projectLogs: unknown[] = [];

        const windows = windowsFrom(createdTime ?? "2020-01-01T00:00:00Z")
          .filter((w) => w.end >= EXPORT_FLOOR_DATE)
          .map((w) => (w.start < EXPORT_FLOOR_DATE ? { start: EXPORT_FLOOR_DATE, end: w.end } : w));

        for (const { start, end } of windows) {
          let page = 1;

          while (true) {
            const qp = new URLSearchParams({
              page: String(page),
              per_page: "100",
              view_type: "customdate",
              start_date: start,
              end_date: end,
              module: JSON.stringify({ type: "general" }),
            });
            const url = `${BASE}/projects/${projectId}/timelogs?${qp}`;
            const { res, token: newToken, throttleExhausted } = await fetchZohoWithRetry(url, token, { label: "general-timelogs" });
            token = newToken;

            if (!res.ok) {
              if (throttleExhausted) {
                failedProjectWindows.push(`${projectId} ${start}→${end}`);
                console.log(`[general-timelogs] Giving up on project=${projectId} ${start}→${end} — rolling-throttle retries exhausted`);
              } else {
                console.log(`[general-timelogs] ${res.status} project=${projectId} ${start}→${end}:`, await res.text());
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

        console.log(`[general-timelogs] project="${projectName}" logs=${projectLogs.length}`);
        totalLogs += projectLogs.length;
        send({ type: "progress", current: i + 1, total: projectEntries.length, project: projectName });
        send({ type: "timelogs", logs: projectLogs });
        await sleep(100);
      }

      send({ type: "done", total_logs: totalLogs, failed_windows: failedProjectWindows });
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
