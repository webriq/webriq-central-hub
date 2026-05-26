import { generateObject } from "ai";
import { z } from "zod";
import { adminClient } from "@/lib/supabase/admin";
import { getModel, getModelConfig } from "@/lib/ai/model-config";
import { logLLMInvocation } from "@/lib/ai/logger";
import { buildContextChain } from "@/lib/ai/context-chain";
import type { Database } from "@/types/database";

type RequirementsAssessmentRow = Database["public"]["Tables"]["requirements_assessments"]["Row"];

const SubtaskSchema = z.object({
  title: z.string(),
  status: z.enum(["CLEAR", "PARTIAL", "BLOCKED"]),
  notes: z.string().optional(),
});

const AssessmentSchema = z.object({
  subtasks: z.array(SubtaskSchema).min(1).max(10),
  overall_status: z.enum(["CLEAR", "PARTIAL", "BLOCKED"]),
  clarification_draft: z.string().nullable(),
});

export type AssessInput = {
  classificationId: string;
  customerId: string;
};

export async function assessTask(input: AssessInput): Promise<RequirementsAssessmentRow | null> {
  const { classificationId, customerId } = input;

  const start = Date.now();
  let assessmentResult: z.infer<typeof AssessmentSchema> | null = null;
  let inputTokens = 0;
  let outputTokens = 0;
  let modelId: string | null = null;

  const contextChain = await buildContextChain(classificationId);

  try {
    const [model, config] = await Promise.all([
      getModel("assessment"),
      getModelConfig("assessment"),
    ]);
    modelId = config.model_id;

    const { object, usage } = await generateObject({
      model,
      schema: AssessmentSchema,
      prompt: `You are a requirements analyst for a web development agency.

Review the following task context and break it into implementation subtasks.
For each subtask, determine if the requirements are complete.

${contextChain}

For each subtask, assign a status:
- CLEAR: all required inputs are present to proceed
- PARTIAL: some inputs are missing but work can partially begin
- BLOCKED: a dependency or critical input is missing; work cannot start

Set overall_status to the worst status across all subtasks.

If overall_status is PARTIAL or BLOCKED, write a brief, professional clarification_draft
(3–5 sentences) requesting the missing information from the customer.
If CLEAR, set clarification_draft to null.`,
    });

    assessmentResult = object;
    inputTokens = usage?.inputTokens ?? 0;
    outputTokens = usage?.outputTokens ?? 0;

    await logLLMInvocation({
      customerId,
      layer: "assessment",
      modelUsed: config.model_id,
      inputTokens,
      outputTokens,
      durationMs: Date.now() - start,
      status: "success",
    });
  } catch (err) {
    console.error("[assess] LLM call failed:", err instanceof Error ? err.message : err);
    await logLLMInvocation({
      customerId,
      layer: "assessment",
      modelUsed: modelId ?? "unknown",
      inputTokens,
      outputTokens,
      durationMs: Date.now() - start,
      status: "error",
      errorMessage: err instanceof Error ? err.message : String(err),
    });
  }

  // Get next version number for this classification
  const { data: latestVersion } = await adminClient
    .from("requirements_assessments")
    .select("assessment_version")
    .eq("classification_id", classificationId)
    .order("assessment_version", { ascending: false })
    .limit(1)
    .maybeSingle();

  const nextVersion = (latestVersion?.assessment_version ?? 0) + 1;

  const { data: record, error: insertError } = await adminClient
    .from("requirements_assessments")
    .insert({
      classification_id: classificationId,
      customer_id: customerId,
      subtasks: assessmentResult?.subtasks ?? [],
      overall_status: assessmentResult?.overall_status ?? "BLOCKED",
      clarification_draft: assessmentResult?.clarification_draft ?? null,
      raw_response: assessmentResult ?? null,
      model_used: modelId,
      input_tokens: inputTokens || null,
      output_tokens: outputTokens || null,
      assessment_version: nextVersion,
    })
    .select()
    .single();

  if (insertError || !record) {
    console.error("[assess] DB insert failed:", insertError?.message);
    return null;
  }

  return record;
}
