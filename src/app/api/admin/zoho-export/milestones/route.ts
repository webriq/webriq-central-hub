// dev-only export endpoint — reads project list from _from_zoho/projects.json,
// fetches milestones from Zoho API, returns JSON for browser download.
import { NextResponse } from "next/server";
import path from "path";
import fs from "fs";
import { createClient } from "@/lib/supabase/server";
import { adminClient } from "@/lib/supabase/admin";
import { getZohoAccessToken } from "@/lib/zoho";

const BASE = `https://projectsapi.zoho.com/api/v3/portal/${process.env.ZOHO_PORTAL_ID}`;
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: profile } = await adminClient.from("profiles").select("role").eq("id", user.id).maybeSingle();
  if (profile?.role !== "admin" && profile?.role !== "super_admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const token = await getZohoAccessToken();
  if (!token) return NextResponse.json({ error: "No Zoho token" }, { status: 502 });

  const projectsFile = path.join(process.cwd(), "_from_zoho", "projects.json");
  if (!fs.existsSync(projectsFile)) {
    return NextResponse.json({ error: "projects.json not found in _from_zoho/" }, { status: 400 });
  }

  const { projects } = JSON.parse(fs.readFileSync(projectsFile, "utf-8")) as { projects: Array<Record<string, unknown>> };
  const all: unknown[] = [];

  for (const project of projects) {
    const projectId = String(project.id_string ?? project.id);
    const res = await fetch(`${BASE}/projects/${projectId}/milestones`, {
      headers: { Authorization: `Zoho-oauthtoken ${token}` },
    });
    if (res.ok) {
      const json = await res.json() as { milestones?: unknown[] };
      const milestones = (json.milestones ?? []).map((m) => ({
        ...(m as Record<string, unknown>),
        _zoho_project_id: projectId,
      }));
      all.push(...milestones);
    }
    await sleep(100);
  }

  return new NextResponse(JSON.stringify(all, null, 2), {
    headers: {
      "Content-Type": "application/json",
      "Content-Disposition": 'attachment; filename="milestones.json"',
    },
  });
}
