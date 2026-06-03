import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { adminClient } from "@/lib/supabase/admin";
import { generatePlan } from "@/lib/ai/plan";
import { syncTaskToZoho } from "@/lib/zoho";

const PostSchema = z.object({
  classificationId: z.string().uuid(),
  assessmentId: z.string().uuid(),
  customerId: z.string().min(1),
});

const PatchSchema = z.object({
  planId: z.string().uuid(),
  action: z.enum(["approve", "reject"]),
  rejectionReason: z.string().optional(),
});

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  const parsed = PostSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request body", details: parsed.error.flatten() }, { status: 400 });
  }

  const { classificationId, assessmentId, customerId } = parsed.data;
  const plan = await generatePlan({ classificationId, customerId, assessmentId });

  if (!plan) {
    return NextResponse.json({ error: "Plan generation failed" }, { status: 500 });
  }

  return NextResponse.json(plan);
}

export async function PATCH(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  const parsed = PatchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request body", details: parsed.error.flatten() }, { status: 400 });
  }

  const { planId, action, rejectionReason } = parsed.data;

  const { data: plan } = await supabase
    .from("implementation_plans")
    .select("id, assessment_id, customer_id, zoho_task_id")
    .eq("id", planId)
    .maybeSingle();

  if (!plan) {
    return NextResponse.json({ error: "Plan not found" }, { status: 404 });
  }

  const { data: assessment } = await supabase
    .from("requirements_assessments")
    .select("classification_id")
    .eq("id", plan.assessment_id)
    .maybeSingle();

  if (!assessment) {
    return NextResponse.json({ error: "Assessment not found" }, { status: 404 });
  }

  const classificationId = assessment.classification_id;

  let zohoTaskId: string | null = null;

  if (action === "approve") {
    // Atomic guard: only update if plan is still PENDING_APPROVAL — prevents duplicate Zoho pushes on concurrent approvals
    const { data: approvedPlan } = await adminClient
      .from("implementation_plans")
      .update({ status: "APPROVED", approved_by: user.id })
      .eq("id", planId)
      .eq("status", "PENDING_APPROVAL")
      .select("id")
      .maybeSingle();

    if (!approvedPlan) {
      // Already approved (or rejected) by a concurrent request — return current state
      return NextResponse.json({ ok: true, zohoTaskId: plan.zoho_task_id });
    }

    await adminClient
      .from("classification_records")
      .update({ status: "approved" })
      .eq("id", classificationId);

    // Push to Zoho — non-blocking; failure does not fail the approve.
    // If the plan already has a zoho_task_id (retry scenario), skip creation.
    const planRecord = plan as { id: string; assessment_id: string; customer_id: string; zoho_task_id: string | null };
    if (!planRecord.zoho_task_id) {
      const { data: classificationRecord } = await adminClient
        .from("classification_records")
        .select("title, description, zoho_task_id")
        .eq("id", classificationId)
        .maybeSingle();

      const customerId = planRecord.customer_id;
      if (classificationRecord && customerId) {
        // If the task came from Zoho (has zoho_task_id), re-use that ID instead of creating a duplicate.
        const existingZohoTaskId = (classificationRecord as { title: string; description: string | null; zoho_task_id: string | null }).zoho_task_id;
        if (existingZohoTaskId) {
          zohoTaskId = existingZohoTaskId;
          await adminClient
            .from("implementation_plans")
            .update({ zoho_task_id: existingZohoTaskId })
            .eq("id", planId);
        } else {
          const pushed = await syncTaskToZoho({
            customerId,
            title: classificationRecord.title,
            description: classificationRecord.description ?? "",
          });
          if (pushed) {
            zohoTaskId = pushed;
            await adminClient
              .from("implementation_plans")
              .update({ zoho_task_id: pushed })
              .eq("id", planId);
          }
        }
      }
    } else {
      zohoTaskId = planRecord.zoho_task_id;
    }
  } else {
    // Read current classification status — only reset pipeline-owned statuses to avoid clobbering PM-set states
    const { data: currentRecord } = await adminClient
      .from("classification_records")
      .select("status")
      .eq("id", classificationId)
      .maybeSingle();

    const PIPELINE_STATUSES = new Set(["planning", "approved"]);
    const resetStatus = PIPELINE_STATUSES.has(currentRecord?.status ?? "");

    await Promise.all([
      adminClient
        .from("implementation_plans")
        .update({
          status: "REJECTED",
          rejection_reason: rejectionReason ?? null,
          rejected_by: user.id,
        })
        .eq("id", planId),
      resetStatus
        ? adminClient.from("classification_records").update({ status: "pending" }).eq("id", classificationId)
        : Promise.resolve(),
    ]);
  }

  return NextResponse.json({ ok: true, zohoTaskId });
}
