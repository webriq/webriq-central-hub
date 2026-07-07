// dev-only import endpoint — reads _from_zoho/issue-comments.json, upserts to issue_comments table.
import { NextResponse } from "next/server";
import path from "path";
import fs from "fs";
import { createClient } from "@/lib/supabase/server";
import { adminClient, ImportResult } from "@/lib/migrate/zoho-import";

type ZohoIssueCommentRaw = {
  id?: string;
  comment?: string;
  added_by?: { full_name?: string; name?: string; email?: string };
  added_via?: string;
  created_time?: string;
  last_modified_time?: string;
  attachments?: Array<Record<string, unknown>>;
  _zoho_issue_id?: string;
  [key: string]: unknown;
};

type IssueCommentRow = {
  external_id: string;
  issue_id: string;
  author_id: string | null;
  author_name: string | null;
  author_email: string | null;
  body: string;
  created_at?: string;
  updated_at?: string;
  source_meta: Record<string, unknown>;
};

const CHUNK_SIZE = 50;
const MAX_UPSERT_RETRIES = 3;
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

// Bounded retry with linear backoff for the Supabase write side. This route makes no Zoho
// API calls (fetchZohoWithRetry doesn't apply here), but a chunked upsert can still transiently
// fail — connection pool pressure, a momentary network blip, project-level rate limiting.
// No existing import route retries a failed chunk at all; this is the first to add it.
async function upsertChunkWithRetry(
  chunk: IssueCommentRow[]
): Promise<{ error: string | null }> {
  let lastError = "";
  for (let attempt = 1; attempt <= MAX_UPSERT_RETRIES; attempt++) {
    const { error } = await adminClient.from("issue_comments").upsert(chunk, { onConflict: "external_id" });
    if (!error) return { error: null };

    lastError = error.message;
    if (attempt < MAX_UPSERT_RETRIES) {
      const waitMs = attempt * 1000;
      console.log(`[issue-comments] chunk upsert failed (attempt ${attempt}/${MAX_UPSERT_RETRIES}): ${error.message} — retrying in ${waitMs}ms`);
      await sleep(waitMs);
    }
  }
  return { error: lastError };
}

export async function POST() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: profile } = await adminClient.from("profiles").select("role").eq("id", user.id).maybeSingle();
  if (profile?.role !== "admin" && profile?.role !== "super_admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const filePath = path.join(process.cwd(), "_from_zoho", "issue-comments.json");
  if (!fs.existsSync(filePath)) {
    return NextResponse.json({ error: "Could not find _from_zoho/issue-comments.json — export issue comments first" }, { status: 400 });
  }

  const comments = JSON.parse(fs.readFileSync(filePath, "utf-8")) as ZohoIssueCommentRaw[];
  console.log(`[issue-comments] read ${comments.length} raw comments from issue-comments.json`);

  if (comments.length === 0) {
    return NextResponse.json({ error: "No comments found in issue-comments.json" }, { status: 400 });
  }

  // Pre-build issue lookup — issues table can exceed Supabase's 1000-row default select
  // limit (1049 issues in this portal), so paginate. Same fix as tasks/timelogs import.
  const issueRows: Array<{ id: string; external_id: string }> = [];
  {
    const PAGE = 1000;
    let from = 0;
    while (true) {
      const { data: page, error: issueFetchError } = await adminClient
        .from("issues")
        .select("id, external_id")
        .not("external_id", "is", null)
        .range(from, from + PAGE - 1);
      if (issueFetchError) {
        console.error("[issue-comments] failed to fetch issues for lookup:", issueFetchError.message);
        return NextResponse.json({ error: `Could not fetch issues: ${issueFetchError.message}` }, { status: 500 });
      }
      if (!page || page.length === 0) break;
      issueRows.push(...(page as Array<{ id: string; external_id: string }>));
      if (page.length < PAGE) break;
      from += PAGE;
    }
  }
  const issueMap = new Map(issueRows.map((i) => [String(i.external_id), i.id]));
  console.log(`[issue-comments] issue lookup map built: ${issueMap.size} issues`);

  const userCache = new Map<string, string>();
  let page = 1;
  while (true) {
    const { data, error } = await adminClient.auth.admin.listUsers({ page, perPage: 1000 });
    if (error || !data?.users?.length) break;
    for (const u of data.users) {
      if (u.email) userCache.set(u.email.toLowerCase(), u.id);
    }
    if (data.users.length < 1000) break;
    page++;
  }
  console.log(`[issue-comments] user lookup map built: ${userCache.size} users`);

  const result: ImportResult = { imported: 0, updated: 0, skipped: 0, errors: [] };
  const rows: IssueCommentRow[] = [];

  for (const c of comments) {
    const externalId = String(c.id ?? "");
    const body = c.comment ?? "";
    if (!externalId || !body) { result.skipped++; continue; }

    const issueId = issueMap.get(String(c._zoho_issue_id ?? ""));
    if (!issueId) {
      result.errors.push(`comment ${externalId}: no Hub issue found for _zoho_issue_id=${c._zoho_issue_id}`);
      result.skipped++;
      continue;
    }

    const email = c.added_by?.email?.toLowerCase();
    const authorId = email ? (userCache.get(email) ?? null) : null;

    rows.push({
      external_id: externalId,
      issue_id: issueId,
      author_id: authorId,
      author_name: c.added_by?.full_name ?? c.added_by?.name ?? null,
      author_email: c.added_by?.email ?? null,
      body,
      created_at: c.created_time ?? undefined,
      updated_at: c.last_modified_time ?? undefined,
      source_meta: {
        added_by: c.added_by ?? null,
        added_via: c.added_via ?? null,
        attachments: (c.attachments ?? []).map((a) => ({
          name: a.name,
          size: a.size,
          type: a.type,
        })),
      },
    });
  }

  console.log(`[issue-comments] upserting ${rows.length} rows in chunks of ${CHUNK_SIZE} (${result.skipped} skipped)`);

  for (let i = 0; i < rows.length; i += CHUNK_SIZE) {
    const chunk = rows.slice(i, i + CHUNK_SIZE);
    const { error } = await upsertChunkWithRetry(chunk);
    const chunkNum = Math.floor(i / CHUNK_SIZE) + 1;
    const totalChunks = Math.ceil(rows.length / CHUNK_SIZE);
    if (error) {
      console.error(`[issue-comments] chunk ${chunkNum}/${totalChunks} failed after ${MAX_UPSERT_RETRIES} attempts:`, error);
      result.errors.push(`chunk ${chunkNum}: ${error}`);
    } else {
      console.log(`[issue-comments] chunk ${chunkNum}/${totalChunks} upserted (${chunk.length} rows)`);
      result.imported += chunk.length;
    }
  }

  console.log(`[issue-comments] done: ${result.imported} imported, ${result.skipped} skipped, ${result.errors.length} error(s)`);
  return NextResponse.json(result);
}
