import { z } from "zod";
import type { AuthInfo } from "@modelcontextprotocol/sdk/server/auth/types.js";
import { runScopedTool } from "@/lib/mcp/run-tool";

export const getProjectStatusInputSchema = {
  customer_id: z.string().describe("The customer_id (e.g. WRQ-CUST-XXXXXXXX) to look up."),
};

export async function getProjectStatus(
  { customer_id }: { customer_id: string },
  authInfo: AuthInfo | undefined
) {
  return runScopedTool("get_project_status", "projects:read", authInfo, async (client) => {
    const { data: customer, error: customerError } = await client
      .from("customers")
      .select("customer_id, company_name, status, contact_name, contact_email")
      .eq("customer_id", customer_id)
      .maybeSingle();

    if (customerError) throw new Error(customerError.message);

    if (!customer) {
      return {
        content: [
          {
            type: "text" as const,
            text: `No customer found for customer_id "${customer_id}" (or you don't have access to it).`,
          },
        ],
      };
    }

    const { data: projects, error: projectsError } = await client
      .from("projects")
      .select("id, project_id, name, project_type, status, external_project_id, percent_complete")
      .eq("customer_id", customer_id);

    if (projectsError) throw new Error(projectsError.message);

    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify({ customer, projects: projects ?? [] }, null, 2),
        },
      ],
    };
  });
}
