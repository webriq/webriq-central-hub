import { generateObject } from "ai";
import { z } from "zod";
import { adminClient } from "@/lib/supabase/admin";
import { getModel, getModelConfig } from "@/lib/ai/model-config";
import { logLLMInvocation } from "@/lib/ai/logger";
import { sendCliqNotification } from "@/lib/zoho";
import type { WebhookSource } from "@/types/hub";
import type { Database } from "@/types/database";

type ClassificationRow = Database["public"]["Tables"]["classification_records"]["Row"];

const ClassificationSchema = z.object({
  task_type: z.enum([
    "CONTENT_UPDATE", "SETTINGS_CHANGE", "BLOG_PUBLISH", "ASSET_UPLOAD",
    "CODE_CHANGE_MINOR", "SEO_UPDATE", "BUG_REPORT", "FEATURE_REQUEST", "STRATEGIC", "OTHER",
  ]),
  priority: z.enum(["CRITICAL", "HIGH", "NORMAL", "LOW"]),
  llm_eligible: z.enum(["YES", "NO", "HUMAN_ONLY"]),
  confidence_score: z.number().min(0).max(100),
  reasoning: z.string(),
});

export type ClassifyInput = {
  customerId: string;
  title: string;
  description?: string | null;
  source: WebhookSource;
  zoho_ticket_id?: string | null;
  zoho_task_id?: string | null;
};

export async function classifyTask(input: ClassifyInput): Promise<ClassificationRow | null> {
  const { customerId, title, description, source, zoho_ticket_id, zoho_task_id } = input;

  const start = Date.now();
  let classificationResult: z.infer<typeof ClassificationSchema> | null = null;
  let inputTokens = 0;
  let outputTokens = 0;
  let modelId: string | null = null;

  try {
    const [model, config] = await Promise.all([
      getModel("classification"),
      getModelConfig("classification"),
    ]);
    modelId = config.model_id;

    const { object, usage } = await generateObject({
      model,
      schema: ClassificationSchema,
      prompt: `You are a task classification assistant for a web development agency.

Classify the following task or support ticket:

Title: ${title}
${description ? `Description: ${description}` : ""}

Guidelines:
- task_type: choose the most specific type (CONTENT_UPDATE, SETTINGS_CHANGE, BLOG_PUBLISH, ASSET_UPLOAD, CODE_CHANGE_MINOR, SEO_UPDATE, BUG_REPORT, FEATURE_REQUEST, STRATEGIC, OTHER)
- priority: CRITICAL (blocking production), HIGH (urgent, same-day), NORMAL (standard SLA), LOW (nice to have)
- llm_eligible: YES (safe for AI automation), NO (needs human judgment), HUMAN_ONLY (never automate — billing, credentials, sensitive client decisions)
- confidence_score: 0–100 representing your certainty in this classification
- reasoning: one concise sentence explaining your classification choice`,
    });

    classificationResult = object;
    inputTokens = usage?.inputTokens ?? 0;
    outputTokens = usage?.outputTokens ?? 0;

    await logLLMInvocation({
      customerId,
      layer: "classification",
      modelUsed: config.model_id,
      inputTokens,
      outputTokens,
      durationMs: Date.now() - start,
      status: "success",
    });
  } catch (err) {
    console.error("[classify] LLM call failed:", err instanceof Error ? err.message : err);
    // Non-fatal — insert record with null classification fields so PM can review manually
  }

  const { data: record, error: insertError } = await adminClient
    .from("classification_records")
    .insert({
      customer_id: customerId,
      zoho_ticket_id: zoho_ticket_id ?? null,
      zoho_task_id: zoho_task_id ?? null,
      source,
      title,
      description: description ?? null,
      task_type: classificationResult?.task_type ?? null,
      priority: classificationResult?.priority ?? null,
      llm_eligible: classificationResult?.llm_eligible ?? "NO",
      confidence_score: classificationResult?.confidence_score ?? null,
      model_used: modelId,
      input_tokens: inputTokens || null,
      output_tokens: outputTokens || null,
      raw_response: classificationResult ?? null,
      status: "pending",
    })
    .select()
    .single();

  if (insertError || !record) {
    console.error("[classify] DB insert failed:", insertError?.message);
    return null;
  }

  if (
    classificationResult?.priority === "CRITICAL" ||
    classificationResult?.priority === "HIGH"
  ) {
    await sendCliqNotification(
      `${classificationResult.priority === "CRITICAL" ? "🔴 CRITICAL" : "🟠 HIGH"} task classified: "${title}" (${classificationResult.task_type}) — Customer: ${customerId} — Confidence: ${classificationResult.confidence_score}% — ID: ${record.id}`
    );
  }

  return record;
}
