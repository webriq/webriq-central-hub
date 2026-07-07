// dev-only export endpoint — fetches attachment metadata for every issue via SSE stream.
// Does NOT download files — only exports the list (id, filename, url, size).
// Requires issues.json (or issues-*.json slice files) to be exported first.
// Issue-scoped sibling of zoho-export/attachment-meta/route.ts — the one functional delta
// is entity_type: "bug" instead of "task" (per user instruction; see task 113 doc for caveats).
import { NextRequest, NextResponse } from "next/server";
import path from "path";
import fs from "fs";
import { createClient } from "@/lib/supabase/server";
import { adminClient } from "@/lib/supabase/admin";
import { getZohoAccessToken, fetchZohoWithRetry } from "@/lib/zoho";

const BASE = `https://projectsapi.zoho.com/api/v3/portal/${process.env.ZOHO_PORTAL_ID}`;
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

type RawIssue = { id?: string; id_string?: string; _zoho_project_id?: string; [key: string]: unknown };

export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: profile } = await adminClient.from("profiles").select("role").eq("id", user.id).maybeSingle();
  if (profile?.role !== "admin" && profile?.role !== "super_admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  let token = await getZohoAccessToken();
  if (!token) return NextResponse.json({ error: "No Zoho token" }, { status: 502 });

  // Multi-file scan: accept both a single issues.json and the issues-*.json slice files
  const dir = path.join(process.cwd(), "_from_zoho");
  const issueFiles = fs.readdirSync(dir).filter((f) => /^issues(-\d.*)?\.json$/.test(f)).sort();
  if (issueFiles.length === 0) {
    return NextResponse.json({ error: "No issues files found in _from_zoho/ — export issues first" }, { status: 400 });
  }

  const allIssues: RawIssue[] = [];
  for (const file of issueFiles) {
    const parsed = JSON.parse(fs.readFileSync(path.join(dir, file), "utf-8"));
    if (Array.isArray(parsed)) allIssues.push(...(parsed as RawIssue[]));
  }

  const params = request.nextUrl.searchParams;
  const fromN = parseInt(params.get("from") ?? "0", 10);
  const toRaw = params.get("to");
  const toN = toRaw ? parseInt(toRaw, 10) : undefined;
  const slice = allIssues.slice(fromN, toN ?? undefined);

  console.log(`[issue-attachment-meta] ${allIssues.length} issues total — exporting slice [${fromN}–${toN ?? allIssues.length}] (${slice.length} issues)`);

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (obj: object) =>
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(obj)}\n\n`));

      let totalAttachments = 0;
      const failedIssueIds: string[] = [];

      for (let i = 0; i < slice.length; i++) {
        const issue = slice[i];
        const issueId = String(issue.id_string ?? issue.id ?? "");
        const projectId = String(issue._zoho_project_id ?? "");

        if (issueId && projectId) {
          const qp = new URLSearchParams({ entity_type: "bug", entity_id: issueId });
          const url = `${BASE}/projects/${projectId}/attachments?${qp}`;
          const { res, token: newToken, throttleExhausted } = await fetchZohoWithRetry(url, token, { label: "issue-attachment-meta" });
          token = newToken;

          if (res.ok) {
            const json = await res.json() as { attachment?: unknown[] };
            const items = (json.attachment ?? []).map((a) => ({
              ...(a as Record<string, unknown>),
              _zoho_issue_id: issueId,
              _zoho_project_id: projectId,
            }));
            if (items.length > 0) {
              totalAttachments += items.length;
              send({ type: "attachments", items });
            }
          } else if (throttleExhausted) {
            failedIssueIds.push(issueId);
            console.log(`[issue-attachment-meta] Giving up on issue=${issueId} — rolling-throttle retries exhausted`);
          } else if (res.status !== 404) {
            // 404 (per Zoho docs, issue has no attachments module) is expected and not logged;
            // anything else is unexpected but still non-fatal — skip this issue and continue.
            console.log(`[issue-attachment-meta] ${res.status} issue=${issueId}:`, await res.text().catch(() => ""));
          }
        }

        send({ type: "progress", current: i + 1, total: slice.length });
        await sleep(700); // stay under Zoho's 200 req/2 min rolling limit — same calibration as attachment-meta
      }

      console.log(`[issue-attachment-meta] done: ${totalAttachments} attachments across ${slice.length} issues (${failedIssueIds.length} failed)`);
      send({ type: "done", total_attachments: totalAttachments, failed_issue_ids: failedIssueIds });
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
