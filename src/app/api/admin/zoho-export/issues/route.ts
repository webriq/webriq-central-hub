// dev-only export endpoint — SSE stream of issues per project (paginated within each project),
// with from/to project slice and since date filter — same as tasks/route.ts.
import { NextRequest } from "next/server";
import path from "path";
import fs from "fs";
import { createClient } from "@/lib/supabase/server";
import { adminClient } from "@/lib/supabase/admin";
import { getZohoAccessToken, fetchZohoWithRetry } from "@/lib/zoho";

const BASE = `https://projectsapi.zoho.com/api/v3/portal/${process.env.ZOHO_PORTAL_ID}`;
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });

  const { data: profile } = await adminClient.from("profiles").select("role").eq("id", user.id).maybeSingle();
  if (profile?.role !== "admin" && profile?.role !== "super_admin") return new Response(JSON.stringify({ error: "Forbidden" }), { status: 403 });

  let token = await getZohoAccessToken();
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

      let totalIssues = 0;
      const failedProjectIds: string[] = [];
      const perPage = 100;

      for (let i = 0; i < slice.length; i++) {
        const project = slice[i];
        const projectId = String(project.id_string ?? project.id);
        const projectName = String(project.name ?? projectId);
        const projectIssues: unknown[] = [];
        let page = 1;

        while (true) {
          const qp = new URLSearchParams({ page: String(page), per_page: String(perPage) });
          const url = `${BASE}/projects/${projectId}/issues?${qp}`;
          const { res, token: newToken, throttleExhausted } = await fetchZohoWithRetry(url, token, { label: "issues" });
          token = newToken;

          if (throttleExhausted) {
            failedProjectIds.push(projectId);
            console.log(`[issues] Giving up on project=${projectId} — rolling-throttle retries exhausted`);
            break;
          }
          if (!res.ok) {
            console.log(`[issues] ${res.status} project=${projectId}:`, await res.text().catch(() => ""));
            break;
          }

          const json = await res.json() as {
            issues?: Array<Record<string, unknown>>;
            page_info?: { has_next_page?: boolean };
          };
          const rawBatch = json.issues ?? [];
          let batch: Array<Record<string, unknown>> = rawBatch.map((it) => ({
            ...it,
            _zoho_project_id: projectId,
          }));

          if (sinceMs !== null) {
            batch = batch.filter((it) => {
              const ct = it.created_time;
              if (!ct) return true;
              return new Date(String(ct)).getTime() >= sinceMs;
            });
          }

          projectIssues.push(...batch);

          if (json.page_info?.has_next_page === false || rawBatch.length < perPage) break;
          page++;
          await sleep(100);
        }

        totalIssues += projectIssues.length;
        send({ type: "progress", current: i + 1, total: slice.length, project: projectName });
        send({ type: "issues", issues: projectIssues });
        await sleep(100);
      }

      send({ type: "done", total_issues: totalIssues, failed_project_ids: failedProjectIds });
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
