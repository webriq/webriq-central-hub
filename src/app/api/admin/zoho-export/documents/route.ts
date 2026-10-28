// dev-only export endpoint — project Documents via SSE. Zoho Projects v3 only lists each project's root folders
// (with a workdrive_folder_id); the files live in Zoho WorkDrive, so the folder tree is walked there.
// ?list=1 returns the project dropdown options from projects.json; ?project=<zoho id> exports one
// project, omitted exports every project. Does NOT download file bytes — same contract as attachment-meta.
import { NextResponse } from "next/server";
import path from "path";
import fs from "fs";
import { createClient } from "@/lib/supabase/server";
import { adminClient } from "@/lib/supabase/admin";
import { getZohoAccessToken, fetchZohoWithRetry } from "@/lib/zoho";

const BASE = `https://projectsapi.zoho.com/api/v3/portal/${process.env.ZOHO_PORTAL_ID}`;
const WORKDRIVE = "https://www.zohoapis.com/workdrive/api/v1";
const WD_PAGE = 50; // WorkDrive max page[limit]
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

type ZohoProject = { id?: string; id_string?: string; name?: string };

export async function GET(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: profile } = await adminClient.from("profiles").select("role").eq("id", user.id).maybeSingle();
  if (profile?.role !== "admin" && profile?.role !== "super_admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const projectsFile = path.join(process.cwd(), "_from_zoho", "projects.json");
  if (!fs.existsSync(projectsFile)) {
    return NextResponse.json({ error: "No projects.json found in _from_zoho/ — export projects first" }, { status: 400 });
  }
  const raw = JSON.parse(fs.readFileSync(projectsFile, "utf-8"));
  const projectsRaw: ZohoProject[] = Array.isArray(raw) ? raw : (raw.projects ?? []);
  const all = projectsRaw
    .map((p) => ({ id: String(p.id_string ?? p.id ?? ""), name: p.name ?? "" }))
    .filter((p) => p.id);

  const params = new URL(request.url).searchParams;
  if (params.get("list")) return NextResponse.json({ projects: all });

  const only = params.get("project");
  // from/to slice the project list (same convention as the other exports) so a long run can be split
  const fromN = parseInt(params.get("from") ?? "0", 10);
  const toRaw = params.get("to");
  const projects = only ? all.filter((p) => p.id === only) : all.slice(fromN, toRaw ? parseInt(toRaw, 10) : undefined);
  if (projects.length === 0) return NextResponse.json({ error: "Project not found in projects.json" }, { status: 400 });

  let token = await getZohoAccessToken();
  if (!token) return NextResponse.json({ error: "No Zoho token" }, { status: 502 });

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (obj: object) => controller.enqueue(encoder.encode(`data: ${JSON.stringify(obj)}\n\n`));
      let total = 0;
      const failed: Array<{ id: string; name: string }> = [];

      for (let i = 0; i < projects.length; i++) {
        const { id: projectId, name } = projects[i];
        const items: unknown[] = [];
        let projectFailed = false;

        // Paginated GET returning the rows under `pick(json)`; flags the project failed on any non-404 error.
        async function getAll(urlBase: string, pick: (j: Record<string, unknown>) => unknown[], more: (j: Record<string, unknown>, got: number) => boolean) {
          const rows: unknown[] = [];
          for (let page = 1; ; page++) {
            const sep = urlBase.includes("?") ? "&" : "?";
            const url = urlBase.startsWith(WORKDRIVE)
              ? `${urlBase}${sep}page%5Blimit%5D=${WD_PAGE}&page%5Boffset%5D=${(page - 1) * WD_PAGE}`
              : `${urlBase}${sep}page=${page}&per_page=100`;
            const { res, token: newToken, throttleExhausted } = await fetchZohoWithRetry(url, token, { label: "documents" });
            token = newToken;
            if (!res.ok) {
              // 404 = project has no Documents module / folder is gone; anything else (incl. throttle) marks the project failed
              if (res.status !== 404) {
                projectFailed = true;
                if (!throttleExhausted) console.log(`[documents] ${res.status} ${url}:`, await res.text().catch(() => ""));
              }
              break;
            }
            const json = await res.json() as Record<string, unknown>;
            const got = pick(json);
            rows.push(...got);
            if (!more(json, got.length)) break;
            await sleep(100);
          }
          await sleep(700); // stay under Zoho's 200 req/2 min rolling limit
          return rows;
        }

        type Root = { folder_id: string; name: string; workdrive_folder_id?: string };
        const roots = (await getAll(
          `${BASE}/projects/${projectId}/documents`,
          (j) => ((j.documents as { folders?: unknown[] } | undefined)?.folders ?? []),
          (j) => Boolean((j.page_info as { has_next_page?: boolean } | undefined)?.has_next_page),
        )) as Root[];

        // Walk each root's WorkDrive tree. `seen` guards against revisiting a folder.
        const seen = new Set<string>();
        for (const root of roots) {
          if (!root.workdrive_folder_id) continue;
          const queue = [root.workdrive_folder_id];
          while (queue.length > 0) {
            const parent = queue.shift()!;
            if (seen.has(parent)) continue;
            seen.add(parent);
            const children = (await getAll(
              `${WORKDRIVE}/files/${parent}/files`,
              (j) => (Array.isArray(j.data) ? j.data : []),
              (_j, got) => got === WD_PAGE,
            )) as Array<{ id: string; attributes?: { type?: string } }>;
            for (const c of children) {
              if (c.attributes?.type === "folder") queue.push(c.id);
              items.push({ ...c, _zoho_project_id: projectId, _zoho_root_folder: root.name, _zoho_parent_workdrive_id: parent });
            }
          }
        }
        if (projectFailed) failed.push({ id: projectId, name });

        total += items.length;
        send({ type: "progress", current: i + 1, total: projects.length, project: name });
        if (items.length > 0) send({ type: "documents", items });
        await sleep(700); // stay under Zoho's 200 req/2 min rolling limit
      }

      send({ type: "done", total_documents: total, failed_projects: failed });
      controller.close();
    },
  });

  return new Response(stream, {
    headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache", "Connection": "keep-alive" },
  });
}
