import { z } from "zod";
import type { AuthInfo } from "@modelcontextprotocol/sdk/server/auth/types.js";
import { runScopedTool } from "@/lib/mcp/run-tool";

// Task 382 — a second, distinct tool alongside list_tickets. That tool reads `inbox`
// (Desk email/support tickets, migration 147's rename of the original `tickets` table);
// this one reads the renamed `tickets` table (filed, assignable work items, formerly
// `issues`). Kept as separate tools rather than repointing/renaming list_tickets, since
// external MCP clients (Claude Desktop, ChatGPT) already depend on that tool's existing
// name and behavior — see task 382 doc's Requirement H.

const FILED_TICKET_STATUS = [
  "open",
  "in_progress",
  "ready_for_qa",
  "testing_completed",
  "for_client_approval",
  "ready_to_merge",
  "post_live_qa",
  "closed",
] as const;
const FILED_TICKET_SEVERITY = ["Show stopper", "Critical", "Major", "Minor", "None"] as const;

export const listFiledTicketsInputSchema = {
  status: z.enum(FILED_TICKET_STATUS).optional().describe("Filter by ticket status"),
  severity: z.enum(FILED_TICKET_SEVERITY).optional().describe("Filter by severity"),
  limit: z.number().min(1).max(50).default(20).describe("Max results to return"),
};

export async function listFiledTickets(
  {
    status,
    severity,
    limit,
  }: {
    status?: (typeof FILED_TICKET_STATUS)[number];
    severity?: (typeof FILED_TICKET_SEVERITY)[number];
    limit: number;
  },
  authInfo: AuthInfo | undefined
) {
  return runScopedTool("list_filed_tickets", "filed-tickets:read", authInfo, async (client) => {
    let q = client
      .from("tickets")
      .select("id,display_id,title,status,severity,project_id,assignee_name,due_date,created_at")
      .order("created_at", { ascending: false })
      .limit(limit);
    if (status) q = q.eq("status", status);
    if (severity) q = q.eq("severity", severity);

    const { data, error } = await q;
    if (error) throw new Error(error.message);

    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify({ tickets: data ?? [], count: (data ?? []).length }, null, 2),
        },
      ],
    };
  });
}
