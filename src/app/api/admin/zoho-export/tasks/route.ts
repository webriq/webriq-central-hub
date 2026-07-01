// dev-only export endpoint — SSE stream of tasks per project with from/to slice and since date filter.
import { NextRequest } from "next/server";
import path from "path";
import fs from "fs";
import { createClient } from "@/lib/supabase/server";
import { adminClient } from "@/lib/supabase/admin";
import { getZohoAccessToken } from "@/lib/zoho";

const BASE = `https://projectsapi.zoho.com/api/v3/portal/${process.env.ZOHO_PORTAL_ID}`;
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });

  const { data: profile } = await adminClient.from("profiles").select("role").eq("id", user.id).maybeSingle();
  if (profile?.role !== "admin" && profile?.role !== "super_admin") return new Response(JSON.stringify({ error: "Forbidden" }), { status: 403 });

  const token = await getZohoAccessToken();
  if (!token) return new Response(JSON.stringify({ error: "No Zoho token" }), { status: 502 });

  const projectsFile = path.join(process.cwd(), "_from_zoho", "projects.json");
  if (!fs.existsSync(projectsFile)) {
    return new Response(JSON.stringify({ error: "projects.json not found in _from_zoho/" }), { status: 400 });
  }

  const params = request.nextUrl.searchParams;
  const fromN = parseInt(params.get("from") ?? "0", 10);
  const toRaw = params.get("to");
  const toN = toRaw ? parseInt(toRaw, 10) : undefined;
  const since = params.get("since") ?? null;
  const sinceMs = since ? new Date(since).getTime() : null;

  const { projects: rawProjects } = JSON.parse(fs.readFileSync(projectsFile, "utf-8")) as {
    projects: Array<Record<string, unknown>>;
  };

  // Sort newest first then slice to requested range
  const sorted = [...rawProjects].sort((a, b) => {
    const ta = new Date(String(a.created_time ?? "")).getTime();
    const tb = new Date(String(b.created_time ?? "")).getTime();
    return tb - ta;
  });
  const slice = sorted.slice(fromN, toN ?? undefined);

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (obj: object) =>
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(obj)}\n\n`));

      let totalTasks = 0;

      for (let i = 0; i < slice.length; i++) {
        const project = slice[i];
        const projectId = String(project.id_string ?? project.id);
        const projectName = String(project.name ?? projectId);
        const projectTasks: unknown[] = [];
        let page = 1;

        while (true) {
          const qp = new URLSearchParams({ page: String(page), per_page: "100" });
          let res = await fetch(`${BASE}/projects/${projectId}/tasks?${qp}`, {
            headers: { Authorization: `Zoho-oauthtoken ${token}` },
          });

          // 429: wait Retry-After then one retry
          if (res.status === 429) {
            const retryAfter = parseInt(res.headers.get("Retry-After") ?? "5", 10);
            await sleep(retryAfter * 1000);
            res = await fetch(`${BASE}/projects/${projectId}/tasks?${qp}`, {
              headers: { Authorization: `Zoho-oauthtoken ${token}` },
            });
          }

          if (!res.ok) break;

          const json = await res.json() as {
            tasks?: Array<Record<string, unknown>>;
            page_info?: { has_next_page?: boolean };
          };

          const rawBatch = json.tasks ?? [];
          let batch: Array<Record<string, unknown>> = rawBatch.map((t) => ({
            ...t,
            _zoho_project_id: projectId,
          }));

          if (sinceMs !== null) {
            batch = batch.filter((t) => {
              const ct = t.created_time;
              if (!ct) return true;
              return new Date(String(ct)).getTime() >= sinceMs;
            });
          }

          projectTasks.push(...batch);

          if (!json.page_info?.has_next_page || rawBatch.length < 100) break;
          page++;
          await sleep(100);
        }

        totalTasks += projectTasks.length;
        send({ type: "progress", current: i + 1, total: slice.length, project: projectName });
        send({ type: "tasks", tasks: projectTasks });
        await sleep(100);
      }

      send({ type: "done", total_tasks: totalTasks });
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
