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

export const updateClassificationStatusInputSchema = {
  classification_id: z.string().uuid().describe("UUID of the classification record"),
  status: z.enum(CLASSIFICATION_STATUS).describe("New status to set"),
};

export async function updateClassificationStatus(
  { classification_id, status }: { classification_id: string; status: (typeof CLASSIFICATION_STATUS)[number] },
  authInfo: AuthInfo | undefined
) {
  // classification_records has no updated_at column — only status is written.
  // classification_records_pm_write RLS policy (admin/super_admin/pm) covers this
  // UPDATE — no adminClient needed, unlike the Ops Chat implementation this was
  // ported from.
  return runScopedTool("update_classification_status", "classifications:write", authInfo, async (client) => {
    const { data, error } = await client
      .from("classification_records")
      .update({ status })
      .eq("id", classification_id)
      .select("id,title,status")
      .single();
    if (error) throw new Error(error.message);
    if (!data) throw new Error("Classification record not found");

    return {
      content: [{ type: "text" as const, text: JSON.stringify({ updated: data }, null, 2) }],
    };
  });
}
