// dev-only export endpoint — fetches timelogs per task via SSE.
// Groups tasks by project for progress; fetches each task's logs with module param (required by API).
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

type ZohoTask = {
  id: string;
  project: { id: string; name: string };
  _zoho_project_id?: string;
  created_time?: string;
  log_hours?: { total_hours?: string };
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
  const taskFiles = fs.readdirSync(fromZoho).filter(f => f.startsWith("tasks-") && f.endsWith(".json"));
  if (taskFiles.length === 0) {
    return NextResponse.json({ error: "No tasks-*.json files found in _from_zoho/" }, { status: 400 });
  }

  // Load all tasks across all task files, filter to those with logged hours
  const allTasks: ZohoTask[] = [];
  for (const fileName of taskFiles) {
    const raw = JSON.parse(fs.readFileSync(path.join(fromZoho, fileName), "utf-8"));
    const tasks: ZohoTask[] = Array.isArray(raw) ? raw : (raw.tasks ?? Object.values(raw)[0] as ZohoTask[]);
    const withLogs = tasks.filter(t => {
      const total = t.log_hours?.total_hours ?? "";
      return total && total !== "00:00";
    });
    allTasks.push(...withLogs);
  }

  // Group tasks by project for progress tracking
  const tasksByProject = new Map<string, { name: string; tasks: ZohoTask[] }>();
  for (const task of allTasks) {
    const pid = task.project.id ?? task._zoho_project_id ?? "";
    if (!pid) continue;
    if (!tasksByProject.has(pid)) tasksByProject.set(pid, { name: task.project.name ?? pid, tasks: [] });
    tasksByProject.get(pid)!.tasks.push(task);
  }

  const allProjectEntries = [...tasksByProject.entries()];
  const projectEntries = allProjectEntries.slice(fromN, toN ?? undefined);
  console.log(`[timelogs] ${allTasks.length} tasks with logs across ${allProjectEntries.length} projects — exporting slice [${fromN}–${toN ?? allProjectEntries.length}] (${projectEntries.length} projects)`);

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (obj: object) =>
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(obj)}\n\n`));

      let totalLogs = 0;
      const failedTaskWindows: string[] = [];

      for (let i = 0; i < projectEntries.length; i++) {
        const [projectId, { name: projectName, tasks }] = projectEntries[i];
        const projectLogs: unknown[] = [];

        for (const task of tasks) {
          const taskId = task.id;
          // Use task creation date as window start; fallback to 2020-01-01
          const windowStart = task.created_time ?? "2020-01-01T00:00:00Z";
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
                module: JSON.stringify({ id: taskId, type: "task" }),
              });
              const url = `${BASE}/projects/${projectId}/timelogs?${qp}`;
              const { res, token: newToken, throttleExhausted } = await fetchZohoWithRetry(url, token, { label: "timelogs" });
              token = newToken;

              if (!res.ok) {
                if (throttleExhausted) {
                  failedTaskWindows.push(`${taskId} ${start}→${end}`);
                  console.log(`[timelogs] Giving up on task=${taskId} ${start}→${end} — rolling-throttle retries exhausted`);
                } else {
                  console.log(`[timelogs] ${res.status} task=${taskId} ${start}→${end}:`, await res.text());
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

        console.log(`[timelogs] project="${projectName}" tasks=${tasks.length} logs=${projectLogs.length}`);
        totalLogs += projectLogs.length;
        send({ type: "progress", current: i + 1, total: projectEntries.length, project: projectName });
        send({ type: "timelogs", logs: projectLogs });
        await sleep(100);
      }

      send({ type: "done", total_logs: totalLogs, failed_windows: failedTaskWindows });
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
