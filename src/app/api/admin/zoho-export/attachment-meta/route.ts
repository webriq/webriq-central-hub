// dev-only export endpoint — fetches attachment metadata for every task via SSE stream.
// Does NOT download files — only exports the list (id, filename, url, size).
// Requires tasks.json (or tasks-*.json slice files) to be exported first.
// Supports from/to task-index slicing (safer for large runs — avoids losing all progress
// on a crash) and auto-refreshes the Zoho token on a 401 mid-export.
import { NextRequest, NextResponse } from "next/server";
import path from "path";
import fs from "fs";
import { createClient } from "@/lib/supabase/server";
import { adminClient } from "@/lib/supabase/admin";
import { getZohoAccessToken, fetchZohoWithRetry } from "@/lib/zoho";

const BASE = `https://projectsapi.zoho.com/api/v3/portal/${process.env.ZOHO_PORTAL_ID}`;
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

type RawTask = { id?: string; id_string?: string; _zoho_project_id?: string; [key: string]: unknown };

export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: profile } = await adminClient.from("profiles").select("role").eq("id", user.id).maybeSingle();
  if (profile?.role !== "admin" && profile?.role !== "super_admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  let token = await getZohoAccessToken();
  if (!token) return NextResponse.json({ error: "No Zoho token" }, { status: 502 });

  // Multi-file scan: accept both a single tasks.json and the tasks-*.json slice files
  const dir = path.join(process.cwd(), "_from_zoho");
  const taskFiles = fs.readdirSync(dir).filter((f) => /^tasks(-\d.*)?\.json$/.test(f)).sort();
  if (taskFiles.length === 0) {
    return NextResponse.json({ error: "No tasks files found in _from_zoho/ — export tasks first" }, { status: 400 });
  }

  const allTasks: RawTask[] = [];
  for (const file of taskFiles) {
    const parsed = JSON.parse(fs.readFileSync(path.join(dir, file), "utf-8"));
    if (Array.isArray(parsed)) allTasks.push(...(parsed as RawTask[]));
  }

  const params = request.nextUrl.searchParams;
  const fromN = parseInt(params.get("from") ?? "0", 10);
  const toRaw = params.get("to");
  const toN = toRaw ? parseInt(toRaw, 10) : undefined;
  const slice = allTasks.slice(fromN, toN ?? undefined);

  console.log(`[attachment-meta] ${allTasks.length} tasks total — exporting slice [${fromN}–${toN ?? allTasks.length}] (${slice.length} tasks)`);

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (obj: object) =>
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(obj)}\n\n`));

      let totalAttachments = 0;
      const failedTaskIds: string[] = [];

      for (let i = 0; i < slice.length; i++) {
        const task = slice[i];
        const taskId = String(task.id_string ?? task.id ?? "");
        const projectId = String(task._zoho_project_id ?? "");

        if (taskId && projectId) {
          const qp = new URLSearchParams({ entity_type: "task", entity_id: taskId });
          const url = `${BASE}/projects/${projectId}/attachments?${qp}`;
          const { res, token: newToken, throttleExhausted } = await fetchZohoWithRetry(url, token, { label: "attachment-meta" });
          token = newToken;

          if (res.ok) {
            const json = await res.json() as { attachment?: unknown[] };
            const items = (json.attachment ?? []).map((a) => ({
              ...(a as Record<string, unknown>),
              _zoho_task_id: taskId,
              _zoho_project_id: projectId,
            }));
            if (items.length > 0) {
              totalAttachments += items.length;
              send({ type: "attachments", items });
            }
          } else if (throttleExhausted) {
            failedTaskIds.push(taskId);
            console.log(`[attachment-meta] Giving up on task=${taskId} — rolling-throttle retries exhausted`);
          } else if (res.status !== 404) {
            // 404 (per Zoho docs, task has no attachments module) is expected and not logged;
            // anything else is unexpected but still non-fatal — skip this task and continue.
            console.log(`[attachment-meta] ${res.status} task=${taskId}:`, await res.text().catch(() => ""));
          }
        }

        send({ type: "progress", current: i + 1, total: slice.length });
        await sleep(700); // stay under Zoho's 200 req/2 min rolling limit — same calibration as timelogs export
      }

      console.log(`[attachment-meta] done: ${totalAttachments} attachments across ${slice.length} tasks (${failedTaskIds.length} failed)`);
      send({ type: "done", total_attachments: totalAttachments, failed_task_ids: failedTaskIds });
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
