// dev-only export endpoint — fetches attachment metadata for every issue (bug) comment via SSE stream.
// Does NOT download files — only exports the list (id, filename, url, size).
// Requires issue-comments.json to be exported first (task 109's issue comments export).
// Issue-comment-scoped sibling of zoho-export/comment-attachment-meta/route.ts — the functional deltas
// are the source file (issue-comments.json), the tag field (_zoho_issue_id), and entity_type: "bug_comment".
// entity_type "bug_comment" is confirmed from Zoho's own embedded attachment records on raw issue-comment
// objects in issue-comments.json (155/155 read back entity_type: "bug_comment") — NOT "comment" as task 170's
// spec guessed, and analogous to task 113's "task" -> "bug" swap for the issue-level attachment-meta export.
import { NextRequest, NextResponse } from "next/server";
import path from "path";
import fs from "fs";
import { createClient } from "@/lib/supabase/server";
import { adminClient } from "@/lib/supabase/admin";
import { getZohoAccessToken, fetchZohoWithRetry } from "@/lib/zoho";

const BASE = `https://projectsapi.zoho.com/api/v3/portal/${process.env.ZOHO_PORTAL_ID}`;
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

type RawIssueComment = { id?: string; _zoho_issue_id?: string; _zoho_project_id?: string; [key: string]: unknown };

export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: profile } = await adminClient.from("profiles").select("role").eq("id", user.id).maybeSingle();
  if (profile?.role !== "admin" && profile?.role !== "super_admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  let token = await getZohoAccessToken();
  if (!token) return NextResponse.json({ error: "No Zoho token" }, { status: 502 });

  const filePath = path.join(process.cwd(), "_from_zoho", "issue-comments.json");
  if (!fs.existsSync(filePath)) {
    return NextResponse.json({ error: "Could not find _from_zoho/issue-comments.json — export issue comments first" }, { status: 400 });
  }
  const allComments = JSON.parse(fs.readFileSync(filePath, "utf-8")) as RawIssueComment[];

  const params = request.nextUrl.searchParams;
  const fromN = parseInt(params.get("from") ?? "0", 10);
  const toRaw = params.get("to");
  const toN = toRaw ? parseInt(toRaw, 10) : undefined;
  const slice = allComments.slice(fromN, toN ?? undefined);

  console.log(`[issue-comment-attachment-meta] ${allComments.length} issue comments total — exporting slice [${fromN}–${toN ?? allComments.length}] (${slice.length} comments)`);

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (obj: object) =>
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(obj)}\n\n`));

      let totalAttachments = 0;
      const failedCommentIds: string[] = [];

      for (let i = 0; i < slice.length; i++) {
        const comment = slice[i];
        const commentId = String(comment.id ?? "");
        const issueId = String(comment._zoho_issue_id ?? "");
        const projectId = String(comment._zoho_project_id ?? "");

        if (commentId && projectId) {
          const qp = new URLSearchParams({ entity_type: "bug_comment", entity_id: commentId });
          const url = `${BASE}/projects/${projectId}/attachments?${qp}`;
          const { res, token: newToken, throttleExhausted } = await fetchZohoWithRetry(url, token, { label: "issue-comment-attachment-meta" });
          token = newToken;

          if (res.ok) {
            const json = await res.json() as { attachment?: unknown[] };
            const items = (json.attachment ?? []).map((a) => ({
              ...(a as Record<string, unknown>),
              _zoho_comment_id: commentId,
              _zoho_issue_id: issueId,
              _zoho_project_id: projectId,
            }));
            if (items.length > 0) {
              totalAttachments += items.length;
              send({ type: "attachments", items });
            }
          } else if (throttleExhausted) {
            failedCommentIds.push(commentId);
            console.log(`[issue-comment-attachment-meta] Giving up on comment=${commentId} — rolling-throttle retries exhausted`);
          } else if (res.status !== 404) {
            // 404 (per Zoho docs, comment has no attachments module) is expected and not logged;
            // anything else is unexpected but still non-fatal — skip this comment and continue.
            console.log(`[issue-comment-attachment-meta] ${res.status} comment=${commentId}:`, await res.text().catch(() => ""));
          }
        }

        send({ type: "progress", current: i + 1, total: slice.length });
        await sleep(700); // stay under Zoho's 200 req/2 min rolling limit — same calibration as attachment-meta / comment-attachment-meta
      }

      console.log(`[issue-comment-attachment-meta] done: ${totalAttachments} attachments across ${slice.length} comments (${failedCommentIds.length} failed)`);
      send({ type: "done", total_attachments: totalAttachments, failed_comment_ids: failedCommentIds });
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
