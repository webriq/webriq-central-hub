import { z } from "zod";
import type { AuthInfo } from "@modelcontextprotocol/sdk/server/auth/types.js";
import { runScopedTool } from "@/lib/mcp/run-tool";

const TICKET_STATUS = ["new", "open", "waiting_on_client", "waiting_on_us", "resolved", "closed"] as const;
const TICKET_PRIORITY = ["low", "normal", "high", "critical"] as const;

export const listTicketsInputSchema = {
  status: z.enum(TICKET_STATUS).optional().describe("Filter by ticket status"),
  priority: z.enum(TICKET_PRIORITY).optional().describe("Filter by priority"),
  limit: z.number().min(1).max(50).default(20).describe("Max results to return"),
};

export async function listTickets(
  {
    status,
    priority,
    limit,
  }: { status?: (typeof TICKET_STATUS)[number]; priority?: (typeof TICKET_PRIORITY)[number]; limit: number },
  authInfo: AuthInfo | undefined
) {
  return runScopedTool("list_tickets", "tickets:read", authInfo, async (client) => {
    let q = client
      .from("tickets")
      .select("id,ticket_number,subject,status,priority,customer_id,requester_email,sla_due_at,created_at")
      .order("created_at", { ascending: false })
      .limit(limit);
    if (status) q = q.eq("status", status);
    if (priority) q = q.eq("priority", priority);

    const { data, error } = await q;
    if (error) throw new Error(error.message);

    return {
      content: [
        { type: "text" as const, text: JSON.stringify({ tickets: data ?? [], count: (data ?? []).length }, null, 2) },
      ],
    };
  });
}
