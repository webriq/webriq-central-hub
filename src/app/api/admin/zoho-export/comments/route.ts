// dev-only export endpoint — SSE stream of comments per task from tasks.json.
// Requires tasks.json to be exported first. Paginates per task using page_info.has_next_page.
import path from "path";
import fs from "fs";
import { createClient } from "@/lib/supabase/server";
import { adminClient } from "@/lib/supabase/admin";
import { getZohoAccessToken } from "@/lib/zoho";

const BASE = `https://projectsapi.zoho.com/api/v3/portal/${process.env.ZOHO_PORTAL_ID}`;
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

type RawTask = { id?: string; id_string?: string; _zoho_project_id?: string; [key: string]: unknown };

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });

  const { data: profile } = await adminClient.from("profiles").select("role").eq("id", user.id).maybeSingle();
  if (profile?.role !== "admin" && profile?.role !== "super_admin") {
    return new Response(JSON.stringify({ error: "Forbidden" }), { status: 403 });
  }

  const token = await getZohoAccessToken();
  if (!token) return new Response(JSON.stringify({ error: "No Zoho token" }), { status: 502 });

  // Support both a single tasks.json and multiple slice files (tasks-0-50-2025.json, etc.)
  const fromZoho = path.join(process.cwd(), "_from_zoho");
  const allFiles = fs.existsSync(fromZoho) ? fs.readdirSync(fromZoho) : [];
  const taskFiles = allFiles
    .filter((f) => f === "tasks.json" || /^tasks-\d/.test(f))
    .map((f) => path.join(fromZoho, f));

  if (taskFiles.length === 0) {
    return new Response(
      JSON.stringify({ error: "No tasks files found in _from_zoho/ — export tasks first" }),
      { status: 400 }
    );
  }

  const tasks = taskFiles.flatMap(
    (f) => JSON.parse(fs.readFileSync(f, "utf-8")) as RawTask[]
  );

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (obj: object) =>
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(obj)}\n\n`));

      let totalComments = 0;

      for (let i = 0; i < tasks.length; i++) {
        const task = tasks[i];
        const taskId = String(task.id_string ?? task.id);
        const projectId = String(task._zoho_project_id ?? "");
        if (!taskId || !projectId) continue;

        const taskComments: Array<Record<string, unknown>> = [];
        let page = 1;

        while (true) {
          const qp = new URLSearchParams({ page: String(page), per_page: "100" });
          let res = await fetch(
            `${BASE}/projects/${projectId}/tasks/${taskId}/comments?${qp}`,
            { headers: { Authorization: `Zoho-oauthtoken ${token}` } }
          );

          if (res.status === 429) {
            const retryAfter = parseInt(res.headers.get("Retry-After") ?? "5", 10);
            await sleep(retryAfter * 1000);
            res = await fetch(
              `${BASE}/projects/${projectId}/tasks/${taskId}/comments?${qp}`,
              { headers: { Authorization: `Zoho-oauthtoken ${token}` } }
            );
          }

          if (!res.ok) break;

          const json = await res.json() as {
            comments?: Array<Record<string, unknown>>;
            page_info?: { has_next_page?: boolean };
          };

          const rawBatch = json.comments ?? [];
          taskComments.push(
            ...rawBatch.map((c) => ({ ...c, _zoho_task_id: taskId, _zoho_project_id: projectId }))
          );

          if (!json.page_info?.has_next_page || rawBatch.length < 100) break;
          page++;
          await sleep(100);
        }

        totalComments += taskComments.length;
        send({ type: "progress", current: i + 1, total: tasks.length, taskId });
        send({ type: "comments", comments: taskComments });
        await sleep(200);
      }

      send({ type: "done", total_comments: totalComments });
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
