import { z } from "zod";
import type { AuthInfo } from "@modelcontextprotocol/sdk/server/auth/types.js";
import { runScopedTool } from "@/lib/mcp/run-tool";

const CLASSIFICATION_STATUS = [
  "pending",
  "reviewed",
  "planning",
  "planned",
  "approved",
  "open",
  "on_hold",
  "active",
  "review",
  "closed",
] as const;

const LLM_ELIGIBLE = ["YES", "NO", "HUMAN_ONLY"] as const;

export const listClassificationsInputSchema = {
  status: z.enum(CLASSIFICATION_STATUS).optional().describe("Filter by pipeline status"),
  llm_eligible: z.enum(LLM_ELIGIBLE).optional().describe("Filter by LLM eligibility"),
  limit: z.number().min(1).max(50).default(20).describe("Max results to return"),
};

export async function listClassifications(
  {
    status,
    llm_eligible,
    limit,
  }: { status?: (typeof CLASSIFICATION_STATUS)[number]; llm_eligible?: (typeof LLM_ELIGIBLE)[number]; limit: number },
  authInfo: AuthInfo | undefined
) {
  return runScopedTool("list_classifications", "classifications:read", authInfo, async (client) => {
    let q = client
      .from("classification_records")
      .select("id,title,task_type,priority,llm_eligible,status,customer_id,created_at")
      .order("created_at", { ascending: false })
      .limit(limit);
    if (status) q = q.eq("status", status);
    if (llm_eligible) q = q.eq("llm_eligible", llm_eligible);

    const { data, error } = await q;
    if (error) throw new Error(error.message);

    return {
      content: [
        { type: "text" as const, text: JSON.stringify({ records: data ?? [], count: (data ?? []).length }, null, 2) },
      ],
    };
  });
}
