// Zoho → Hub tasklists sync.
// Callable by admin session or pg_cron via x-cron-secret header.
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { adminClient } from "@/lib/supabase/admin";
import { getZohoAccessToken } from "@/lib/zoho";

const BASE = `https://projectsapi.zoho.com/api/v3/portal/${process.env.ZOHO_PORTAL_ID}`;
const CHUNK_SIZE = 50;
const CHUNK_DELAY_MS = 100;
const BETWEEN_PROJECTS_MS = 100;

type ZohoTasklistRaw = {
  id?: string | number;
  id_string?: string;
  name?: string;
  sequence?: { project_sequence?: number } | number;
  is_default?: boolean;
  milestone?: { id?: string; id_string?: string; name?: string };
  meta_info?: { is_none_milestone_tasklist?: boolean };
};

type TasklistRow = {
  external_id: string;
  project_id: string;
  name: string;
  position: number | null;
  is_default: boolean;
  milestone_id: string | null;
};

async function fetchWithRateLimitRetry(url: string, headers: HeadersInit): Promise<Response> {
  const res = await fetch(url, { headers });
  if (res.status !== 429) return res;

  const retryAfterSec = parseInt(res.headers.get("Retry-After") ?? "60", 10);
  await new Promise<void>((r) => setTimeout(r, retryAfterSec * 1000));
  return fetch(url, { headers });
}

export async function POST(req: Request) {
  // Accept cron calls via x-cron-secret or authenticated admin session
  const cronSecret = process.env.CRONJOB_SECRET_KEY;
  const incomingSecret = req.headers.get("x-cron-secret");
  const isCronCall = cronSecret && incomingSecret === cronSecret;

  if (!isCronCall) {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { data: profile } = await adminClient.from("profiles").select("role").eq("id", user.id).maybeSingle();
    if (profile?.role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const token = await getZohoAccessToken();
  if (!token) return NextResponse.json({ error: "No Zoho access token" }, { status: 502 });

  // Fetch all Hub projects that have a Zoho project ID
  const { data: projects, error: projectsError } = await adminClient
    .from("projects")
    .select("id, external_project_id")
    .not("external_project_id", "is", null);

  if (projectsError) return NextResponse.json({ error: projectsError.message }, { status: 500 });

  // Pre-build milestone lookup map
  const { data: milestoneRows } = await adminClient.from("milestones").select("id, external_id");
  const milestoneMap = new Map((milestoneRows ?? []).map((m) => [String(m.external_id), m.id]));

  let synced = 0;
  const errors: string[] = [];

  for (const project of (projects ?? [])) {
    const zohoProjectId = String(project.external_project_id);
    const url = `${BASE}/projects/${zohoProjectId}/tasklists`;

    let res: Response;
    try {
      res = await fetchWithRateLimitRetry(url, { Authorization: `Zoho-oauthtoken ${token}` });
    } catch (err) {
      errors.push(`project ${zohoProjectId}: fetch error — ${String(err)}`);
      continue;
    }

    if (!res.ok) {
      errors.push(`project ${zohoProjectId}: Zoho returned ${res.status}`);
      await new Promise<void>((r) => setTimeout(r, BETWEEN_PROJECTS_MS));
      continue;
    }

    const json = (await res.json()) as { tasklists?: ZohoTasklistRaw[] };
    const rows: TasklistRow[] = [];

    for (const tl of (json.tasklists ?? [])) {
      const externalId = String(tl.id_string ?? tl.id ?? "");
      if (!externalId || !tl.name) continue;

      const position = typeof tl.sequence === "object"
        ? (tl.sequence?.project_sequence ?? null)
        : (tl.sequence ?? null);

      const isNoneMilestone =
        tl.meta_info?.is_none_milestone_tasklist === true ||
        tl.milestone?.name === "None";
      const milestoneExternalId = !isNoneMilestone
        ? String(tl.milestone?.id_string ?? tl.milestone?.id ?? "")
        : "";
      const milestoneId = milestoneExternalId ? (milestoneMap.get(milestoneExternalId) ?? null) : null;

      rows.push({
        external_id: externalId,
        project_id: project.id,
        name: tl.name,
        position,
        is_default: tl.is_default ?? false,
        milestone_id: milestoneId,
      });
    }

    // Batch upsert in chunks
    for (let i = 0; i < rows.length; i += CHUNK_SIZE) {
      const chunk = rows.slice(i, i + CHUNK_SIZE);
      const { error } = await adminClient.from("tasklists").upsert(chunk, { onConflict: "external_id" });
      if (error) {
        errors.push(`project ${zohoProjectId} chunk ${i}: ${error.message}`);
      } else {
        synced += chunk.length;
      }
      if (i + CHUNK_SIZE < rows.length) {
        await new Promise<void>((r) => setTimeout(r, CHUNK_DELAY_MS));
      }
    }

    await new Promise<void>((r) => setTimeout(r, BETWEEN_PROJECTS_MS));
  }

  return NextResponse.json({ synced, errors });
}
