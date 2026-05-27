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
    .select("id, assessment_id, customer_id")
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
    await Promise.all([
      adminClient
        .from("implementation_plans")
        .update({ status: "APPROVED", approved_by: user.id })
        .eq("id", planId),
      adminClient
        .from("classification_records")
        .update({ status: "approved" })
        .eq("id", classificationId),
    ]);

    // Push to Zoho — non-blocking; failure does not fail the approve
    const { data: classificationRecord } = await adminClient
      .from("classification_records")
      .select("title, description")
      .eq("id", classificationId)
      .maybeSingle();

    const customerId = (plan as { id: string; assessment_id: string; customer_id: string }).customer_id;
    if (classificationRecord && customerId) {
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
  } else {
    await Promise.all([
      adminClient
        .from("implementation_plans")
        .update({
          status: "REJECTED",
          rejection_reason: rejectionReason ?? null,
          rejected_by: user.id,
        })
        .eq("id", planId),
      adminClient
        .from("classification_records")
        .update({ status: "pending" })
        .eq("id", classificationId),
    ]);
  }

  return NextResponse.json({ ok: true, zohoTaskId });
}
