import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { adminClient } from "@/lib/supabase/admin";
import { updateZohoTaskStatus } from "@/lib/zoho";

type PmAction = "open" | "on_hold" | "active" | "review" | "close" | "reopen";

const ACTION_TO_STATUS: Record<PmAction, string> = {
  open: "open",
  on_hold: "on_hold",
  active: "active",
  review: "review",
  close: "closed",
  reopen: "pending",
};

const PatchSchema = z.object({
  classificationId: z.string().uuid(),
  action: z.enum(["open", "on_hold", "active", "review", "close", "reopen"]),
});

export async function PATCH(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const parsed = PatchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid body", details: parsed.error.flatten() }, { status: 400 });
  }

  const { classificationId, action } = parsed.data;
  const newStatus = ACTION_TO_STATUS[action];

  await adminClient
    .from("classification_records")
    .update({ status: newStatus })
    .eq("id", classificationId);

  // Close and Reopen also push to Zoho via `completed` field
  if (action === "close" || action === "reopen") {
    const { data: assessment } = await adminClient
      .from("requirements_assessments")
      .select("id")
      .eq("classification_id", classificationId)
      .order("assessment_version", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (assessment) {
      const { data: plan } = await adminClient
        .from("implementation_plans")
        .select("zoho_task_id, customer_id")
        .eq("assessment_id", assessment.id)
        .eq("status", "APPROVED")
        .maybeSingle();

      if (plan?.zoho_task_id && plan.customer_id) {
        const { data: project } = await adminClient
          .from("projects")
          .select("zoho_project_id")
          .eq("customer_id", plan.customer_id)
          .not("zoho_project_id", "is", null)
          .limit(1)
          .maybeSingle();

        if (project?.zoho_project_id) {
          await updateZohoTaskStatus(
            project.zoho_project_id,
            plan.zoho_task_id,
            action === "close"
          );
        }
      }
    }
  }

  return NextResponse.json({ ok: true });
}
