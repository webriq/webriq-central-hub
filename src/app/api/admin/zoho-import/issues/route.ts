// dev-only import endpoint — reads _from_zoho/issues-*.json batch files, upserts to issues table.
import { NextResponse } from "next/server";
import path from "path";
import fs from "fs";
import { createClient } from "@/lib/supabase/server";
import { mapTaskStatus, adminClient, ImportResult } from "@/lib/migrate/zoho-import";

type ZohoIssueRaw = {
  id?: string;
  prefix?: string;
  name?: string;
  description?: string;
  status?: { name?: string; is_closed_type?: boolean };
  severity?: { value?: string };
  flag?: string;
  assignee?: { name?: string; email?: string };
  due_date?: string;
  created_time?: string;
  created_by?: Record<string, unknown>;
  added_via?: string;
  subscription_type?: string;
  project?: Record<string, unknown>;
  _zoho_project_id?: string;
  [key: string]: unknown;
};

type IssueRow = {
  external_id: string;
  project_id: string;
  prefix: string | null;
  title: string;
  description: string | null;
  status: string;
  severity: string | null;
  flag: string | null;
  assignee_name: string | null;
  assignee_email: string | null;
  due_date: string | null;
  created_at?: string;
  source_meta: Record<string, unknown>;
};

const CHUNK_SIZE = 50;

function toDateOnly(raw: unknown): string | null {
  if (typeof raw !== "string" || !raw) return null;
  return raw.split("T")[0];
}

function cleanName(raw: string | undefined): string | null {
  if (!raw || raw === "Unassigned User") return null;
  return raw;
}

export async function POST() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: profile } = await adminClient.from("profiles").select("role").eq("id", user.id).maybeSingle();
  if (profile?.role !== "admin" && profile?.role !== "super_admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  // Multi-file scan: pick up all issues-*.json batch files, sorted for deterministic order
  const dir = path.join(process.cwd(), "_from_zoho");
  const allIssues: ZohoIssueRaw[] = [];

  const batchFiles = fs
    .readdirSync(dir)
    .filter((f) => f.startsWith("issues-") && f.endsWith(".json"))
    .sort();

  if (batchFiles.length > 0) {
    for (const file of batchFiles) {
      const parsed = JSON.parse(fs.readFileSync(path.join(dir, file), "utf-8"));
      if (Array.isArray(parsed)) allIssues.push(...(parsed as ZohoIssueRaw[]));
    }
  } else {
    const fallback = path.join(dir, "issues.json");
    if (!fs.existsSync(fallback)) {
      return NextResponse.json({ error: "No issues files found in _from_zoho/" }, { status: 400 });
    }
    const parsed = JSON.parse(fs.readFileSync(fallback, "utf-8"));
    allIssues.push(...(Array.isArray(parsed) ? (parsed as ZohoIssueRaw[]) : []));
  }

  console.log(`[issues] read ${allIssues.length} raw issues from ${batchFiles.length || 1} file(s)`);

  if (allIssues.length === 0) {
    return NextResponse.json({ error: "No issues found in files" }, { status: 400 });
  }

  // Pre-build project lookup — one query instead of one query per issue
  const { data: projectRows, error: projectFetchError } = await adminClient.from("projects").select("id, external_project_id");
  if (projectFetchError) {
    console.error("[issues] failed to fetch projects for lookup:", projectFetchError.message);
    return NextResponse.json({ error: `Could not fetch projects: ${projectFetchError.message}` }, { status: 500 });
  }
  const projectMap = new Map((projectRows ?? []).map((p) => [String(p.external_project_id), p.id as string]));
  console.log(`[issues] project lookup map built: ${projectMap.size} projects`);

  const result: ImportResult = { imported: 0, updated: 0, skipped: 0, errors: [] };
  const rows: IssueRow[] = [];

  for (const issue of allIssues) {
    const externalId = String(issue.id ?? "");
    if (!externalId || !issue.name) { result.skipped++; continue; }

    const projectId = projectMap.get(String(issue._zoho_project_id ?? ""));
    if (!projectId) {
      result.errors.push(`issue ${externalId}: no Hub project found for external_project_id=${issue._zoho_project_id}`);
      result.skipped++;
      continue;
    }

    rows.push({
      external_id: externalId,
      project_id: projectId,
      prefix: issue.prefix ?? null,
      title: issue.name,
      description: issue.description ?? null,
      status: mapTaskStatus(issue.status?.name ?? "", issue.status?.is_closed_type ?? false),
      severity: issue.severity?.value ?? null,
      flag: issue.flag ?? null,
      assignee_name: cleanName(issue.assignee?.name),
      assignee_email: cleanName(issue.assignee?.email),
      due_date: toDateOnly(issue.due_date),
      created_at: issue.created_time ?? undefined,
      source_meta: {
        created_by: issue.created_by ?? null,
        status: issue.status ?? null,
        added_via: issue.added_via ?? null,
        subscription_type: issue.subscription_type ?? null,
        project: issue.project ?? null,
      },
    });
  }

  console.log(`[issues] upserting ${rows.length} rows in chunks of ${CHUNK_SIZE} (${result.skipped} skipped)`);

  for (let i = 0; i < rows.length; i += CHUNK_SIZE) {
    const chunk = rows.slice(i, i + CHUNK_SIZE);
    const { error } = await adminClient.from("issues").upsert(chunk, { onConflict: "external_id" });
    const chunkNum = Math.floor(i / CHUNK_SIZE) + 1;
    const totalChunks = Math.ceil(rows.length / CHUNK_SIZE);
    if (error) {
      console.error(`[issues] chunk ${chunkNum}/${totalChunks} failed:`, error.message);
      result.errors.push(`chunk ${chunkNum}: ${error.message}`);
    } else {
      console.log(`[issues] chunk ${chunkNum}/${totalChunks} upserted (${chunk.length} rows)`);
      result.imported += chunk.length;
    }
  }

  console.log(`[issues] done: ${result.imported} imported, ${result.skipped} skipped, ${result.errors.length} error(s)`);
  return NextResponse.json(result);
}
