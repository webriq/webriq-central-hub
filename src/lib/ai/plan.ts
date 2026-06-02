import { generateObject } from "ai";
import { z } from "zod";
import { adminClient } from "@/lib/supabase/admin";
import { getModelConfig } from "@/lib/ai/model-config";
import { getLanguageModel } from "@/lib/ai/providers";
import { logLLMInvocation } from "@/lib/ai/logger";
import { buildContextChain } from "@/lib/ai/context-chain";
import type { Database } from "@/types/database";

type ImplementationPlanRow = Database["public"]["Tables"]["implementation_plans"]["Row"];

const PlanStepSchema = z.object({
  order: z.number(),
  title: z.string(),
  description: z.string(),
  estimated_hours: z.number().optional(),
});

const PlanSchema = z.object({
  steps: z.array(PlanStepSchema).min(1).max(20),
  affected_files: z.array(z.string()),
  apis_involved: z.array(z.string()),
  playbooks_used: z.array(z.string()),
  confidence_score: z.number().min(0).max(100),
  risk_flags: z.array(z.string()),
});

export type PlanInput = {
  classificationId: string;
  customerId: string;
  assessmentId: string;
};

export async function generatePlan(input: PlanInput): Promise<ImplementationPlanRow | null> {
  const { classificationId, customerId, assessmentId } = input;

  const start = Date.now();
  let planResult: z.infer<typeof PlanSchema> | null = null;
  let inputTokens = 0;
  let outputTokens = 0;
  let modelId: string | null = null;

  const [contextChain, classificationResult] = await Promise.all([
    buildContextChain(classificationId),
    adminClient
      .from("classification_records")
      .select("task_type")
      .eq("id", classificationId)
      .maybeSingle(),
  ]);

  const taskType = classificationResult.data?.task_type ?? null;

  const playbooksResult = taskType
    ? await adminClient
        .from("playbooks")
        .select("title, content")
        .eq("task_type", taskType)
        .eq("status", "ACTIVE")
        .limit(5)
    : { data: [] };

  const playbooks = playbooksResult.data ?? [];
  const playbooksSection =
    playbooks.length > 0
      ? `=== PLAYBOOKS ===\n${playbooks.map(p => `[${p.title}]\n${p.content}`).join("\n\n")}`
      : "";

  try {
    const config = await getModelConfig("planning");
    const model = getLanguageModel((config.provider ?? "anthropic") as "anthropic" | "openai", config.model_id);
    modelId = config.model_id;

    const { object, usage } = await generateObject({
      model,
      schema: PlanSchema,
      prompt: `You are a senior technical project manager for a web development agency.

Given the following task context (customer, task, and requirements assessment):

${contextChain}

${playbooksSection}

Produce a structured implementation plan:
- Break the work into ordered steps (1–20)
- List all source files likely to be affected
- List all external APIs or integrations involved
- List which playbooks apply (by title)
- Assign a confidence score (0–100) based on how complete the requirements are
- Flag any risks or unknowns as risk_flags

If the assessment overall_status is BLOCKED, set confidence_score below 50 and add a risk flag noting the blocked dependency.`,
    });

    planResult = object;
    inputTokens = usage?.inputTokens ?? 0;
    outputTokens = usage?.outputTokens ?? 0;

    await logLLMInvocation({
      customerId,
      layer: "planning",
      modelUsed: config.model_id,
      inputTokens,
      outputTokens,
      durationMs: Date.now() - start,
      status: "success",
    });
  } catch (err) {
    console.error("[plan] LLM call failed:", err instanceof Error ? err.message : err);
    await logLLMInvocation({
      customerId,
      layer: "planning",
      modelUsed: modelId ?? "unknown",
      inputTokens,
      outputTokens,
      durationMs: Date.now() - start,
      status: "error",
      errorMessage: err instanceof Error ? err.message : String(err),
    });
  }

  const { data: record, error: insertError } = await adminClient
    .from("implementation_plans")
    .insert({
      assessment_id: assessmentId,
      customer_id: customerId,
      steps: planResult?.steps ?? [],
      affected_files: planResult?.affected_files ?? [],
      apis_involved: planResult?.apis_involved ?? [],
      playbooks_used: planResult?.playbooks_used ?? [],
      confidence_score: planResult?.confidence_score ?? null,
      risk_flags: planResult?.risk_flags ?? [],
      status: "PENDING_APPROVAL",
      model_used: modelId,
      input_tokens: inputTokens || null,
      output_tokens: outputTokens || null,
    })
    .select()
    .single();

  if (insertError || !record) {
    console.error("[plan] DB insert failed:", insertError?.message);
    return null;
  }

  await adminClient
    .from("classification_records")
    .update({ status: "planning" })
    .eq("id", classificationId);

  return record;
}
