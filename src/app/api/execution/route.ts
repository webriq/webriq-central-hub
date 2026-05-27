import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { adminClient } from "@/lib/supabase/admin";
import { executeSanityPlan, type PlanStep } from "@/lib/sanity";
import { buildContextChain } from "@/lib/ai/context-chain";
import { sendCliqNotification } from "@/lib/zoho";
import { generateReplyDraft } from "@/lib/ai/reply";
import type { Json } from "@/types/database";

const PostSchema = z.object({
  planId: z.string().uuid(),
  customerId: z.string().min(1),
  classificationId: z.string().min(1),
});

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  const parsed = PostSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid request body", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const { planId, customerId, classificationId } = parsed.data;

  // Validate plan is approved
  const { data: plan } = await adminClient
    .from("implementation_plans")
    .select("id, steps")
    .eq("id", planId)
    .eq("status", "APPROVED")
    .maybeSingle();

  if (!plan) {
    return NextResponse.json({ error: "Plan not found or not approved" }, { status: 404 });
  }

  // Check circuit breaker
  const { data: customer } = await adminClient
    .from("customers")
    .select("automation_paused")
    .eq("customer_id", customerId)
    .maybeSingle();

  if (customer?.automation_paused) {
    return NextResponse.json(
      { error: "Automation is paused for this customer due to consecutive failures" },
      { status: 409 }
    );
  }

  // Get Sanity project ID from customer_products
  const { data: product } = await adminClient
    .from("customer_products")
    .select("sanity_project_id")
    .eq("customer_id", customerId)
    .not("sanity_project_id", "is", null)
    .maybeSingle();

  if (!product?.sanity_project_id) {
    return NextResponse.json(
      { error: "No Sanity project configured for this customer" },
      { status: 422 }
    );
  }

  // Create execution record
  const { data: execution, error: insertError } = await adminClient
    .from("execution_records")
    .insert({
      plan_id: planId,
      customer_id: customerId,
      status: "RUNNING",
      started_at: new Date().toISOString(),
    })
    .select("id")
    .single();

  if (insertError || !execution) {
    return NextResponse.json({ error: "Failed to create execution record" }, { status: 500 });
  }

  const steps = (plan.steps as unknown as PlanStep[]) ?? [];

  try {
    const contextChain = await buildContextChain(classificationId);
    const result = await executeSanityPlan(
      product.sanity_project_id,
      steps,
      contextChain
    );

    await adminClient
      .from("execution_records")
      .update({
        status: "COMPLETED",
        outcome: "SUCCESS",
        pre_action_states: result.pre_action_states as unknown as Json,
        post_action_states: result.post_action_states as unknown as Json,
        what_was_done: result.what_was_done,
        what_was_skipped: result.what_was_skipped,
        completed_at: new Date().toISOString(),
      })
      .eq("id", execution.id);

    await Promise.all([
      adminClient
        .from("implementation_plans")
        .update({ status: "COMPLETE" })
        .eq("id", planId),
      adminClient
        .from("classification_records")
        .update({ status: "closed" })
        .eq("id", classificationId),
    ]);

    // Non-blocking: Cliq notification and reply generation
    sendCliqNotification(
      `✅ Execution complete for ${customerId}: ${result.what_was_done}`
    ).catch(() => {});

    generateReplyDraft({
      classificationId,
      customerId,
      executionRecordId: execution.id,
      whatWasDone: result.what_was_done,
    }).catch((err) =>
      console.error("[execution] reply draft generation failed:", err instanceof Error ? err.message : err)
    );

    return NextResponse.json({ ok: true, executionId: execution.id });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    const isPartial = message.toLowerCase().includes("partial");
    const newStatus = isPartial ? "PARTIAL_EXECUTION" : "FAILED";

    await adminClient
      .from("execution_records")
      .update({
        status: newStatus,
        outcome: isPartial ? "PARTIAL" : "FAILED",
        error_message: message,
        completed_at: new Date().toISOString(),
      })
      .eq("id", execution.id);

    if (!isPartial) {
      // Circuit breaker: pause automation if last 3 executions for this customer all failed
      const { data: recent } = await adminClient
        .from("execution_records")
        .select("status")
        .eq("customer_id", customerId)
        .order("created_at", { ascending: false })
        .limit(3);

      if (recent?.length === 3 && recent.every((e) => e.status === "FAILED")) {
        await adminClient
          .from("customers")
          .update({ automation_paused: true })
          .eq("customer_id", customerId);
      }
    }

    return NextResponse.json({ error: message, status: newStatus }, { status: 500 });
  }
}
