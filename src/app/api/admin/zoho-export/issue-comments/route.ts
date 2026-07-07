// dev-only export endpoint — SSE stream of comments per issue from issues-*.json.
// Requires issues to be exported first (task 107). Paginates per issue using page_info.has_next_page.
import path from "path";
import fs from "fs";
import { createClient } from "@/lib/supabase/server";
import { adminClient } from "@/lib/supabase/admin";
import { getZohoAccessToken, fetchZohoWithRetry } from "@/lib/zoho";

const BASE = `https://projectsapi.zoho.com/api/v3/portal/${process.env.ZOHO_PORTAL_ID}`;
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

type RawIssue = { id?: string; id_string?: string; _zoho_project_id?: string; [key: string]: unknown };

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });

  const { data: profile } = await adminClient.from("profiles").select("role").eq("id", user.id).maybeSingle();
  if (profile?.role !== "admin" && profile?.role !== "super_admin") {
    return new Response(JSON.stringify({ error: "Forbidden" }), { status: 403 });
  }

  let token = await getZohoAccessToken();
  if (!token) return new Response(JSON.stringify({ error: "No Zoho token" }), { status: 502 });

  // Multi-file scan: pick up all issues-*.json batch files (task 107's export can slice by from/to),
  // sorted for deterministic order; falls back to a single issues.json.
  const fromZoho = path.join(process.cwd(), "_from_zoho");
  const allFiles = fs.existsSync(fromZoho) ? fs.readdirSync(fromZoho) : [];
  const issueFiles = allFiles
    .filter((f) => (f.startsWith("issues-") && f.endsWith(".json")) || f === "issues.json")
    .sort()
    .map((f) => path.join(fromZoho, f));

  if (issueFiles.length === 0) {
    return new Response(
      JSON.stringify({ error: "No issues files found in _from_zoho/ — export issues first" }),
      { status: 400 }
    );
  }

  const issues = issueFiles.flatMap(
    (f) => JSON.parse(fs.readFileSync(f, "utf-8")) as RawIssue[]
  );

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (obj: object) =>
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(obj)}\n\n`));

      let totalComments = 0;
      const failedIssueIds: string[] = [];

      for (let i = 0; i < issues.length; i++) {
        const issue = issues[i];
        const issueId = String(issue.id_string ?? issue.id);
        const projectId = String(issue._zoho_project_id ?? "");
        if (!issueId || !projectId) continue;

        const issueComments: Array<Record<string, unknown>> = [];
        let page = 1;

        while (true) {
          const qp = new URLSearchParams({ page: String(page), per_page: "100" });
          const url = `${BASE}/projects/${projectId}/issues/${issueId}/comments?${qp}`;
          const { res, token: newToken, throttleExhausted } = await fetchZohoWithRetry(url, token, { label: "issue-comments" });
          token = newToken;

          if (throttleExhausted) {
            failedIssueIds.push(issueId);
            console.log(`[issue-comments] Giving up on issue=${issueId} — rolling-throttle retries exhausted`);
            break;
          }
          if (!res.ok) break;

          const json = await res.json() as {
            comments?: Array<Record<string, unknown>>;
            page_info?: { has_next_page?: boolean };
          };

          const rawBatch = json.comments ?? [];
          issueComments.push(
            ...rawBatch.map((c) => ({ ...c, _zoho_issue_id: issueId, _zoho_project_id: projectId }))
          );

          if (!json.page_info?.has_next_page || rawBatch.length < 100) break;
          page++;
          await sleep(700); // stay under Zoho's 200 req/2 min rolling limit — same calibration as timelogs export
        }

        totalComments += issueComments.length;
        send({ type: "progress", current: i + 1, total: issues.length, issueId });
        send({ type: "comments", comments: issueComments });
        await sleep(700); // stay under Zoho's 200 req/2 min rolling limit — same calibration as timelogs export
      }

      send({ type: "done", total_comments: totalComments, failed_issue_ids: failedIssueIds });
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
