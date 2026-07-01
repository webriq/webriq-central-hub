// dev-only export endpoint — fetches attachment metadata for every task.
// Does NOT download files — only exports the list (id, filename, url, size).
// Requires tasks.json to be exported first.
import { NextResponse } from "next/server";
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
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: profile } = await adminClient.from("profiles").select("role").eq("id", user.id).maybeSingle();
  if (profile?.role !== "admin" && profile?.role !== "super_admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const token = await getZohoAccessToken();
  if (!token) return NextResponse.json({ error: "No Zoho token" }, { status: 502 });

  const tasksFile = path.join(process.cwd(), "_from_zoho", "tasks.json");
  if (!fs.existsSync(tasksFile)) {
    return NextResponse.json({ error: "tasks.json not found in _from_zoho/ — export tasks first" }, { status: 400 });
  }

  const tasks = JSON.parse(fs.readFileSync(tasksFile, "utf-8")) as RawTask[];
  const all: unknown[] = [];

  for (const task of tasks) {
    const taskId = String(task.id_string ?? task.id);
    const projectId = String(task._zoho_project_id ?? "");
    if (!taskId || !projectId) continue;

    const res = await fetch(`${BASE}/projects/${projectId}/tasks/${taskId}/attachments`, {
      headers: { Authorization: `Zoho-oauthtoken ${token}` },
    });

    if (res.ok) {
      const json = await res.json() as { attachments?: unknown[] };
      const attachments = (json.attachments ?? []).map((a) => ({
        ...(a as Record<string, unknown>),
        _zoho_task_id: taskId,
        _zoho_project_id: projectId,
      }));
      all.push(...attachments);
    }

    await sleep(200);
  }

  return new NextResponse(JSON.stringify(all, null, 2), {
    headers: {
      "Content-Type": "application/json",
      "Content-Disposition": 'attachment; filename="attachment-meta.json"',
    },
  });
}
