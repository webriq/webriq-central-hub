import { generateObject } from "ai";
import { z } from "zod";
import { adminClient } from "@/lib/supabase/admin";
import { getModelConfig } from "@/lib/ai/model-config";
import { getLanguageModel } from "@/lib/ai/providers";
import { logLLMInvocation } from "@/lib/ai/logger";
import { sendCliqNotification } from "@/lib/zoho";
import type { WebhookSource } from "@/types/hub";
import type { Database, Json } from "@/types/database";

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

const SubTaskSchema = z.object({
  id: z.string(),
  description: z.string(),
  classification: z.enum(["sanity", "code", "both"]),
  lane: z.union([z.literal(1), z.literal(2), z.literal(3)]),
  order: z.number().int().positive(),
});

const SubTaskEnumerationSchema = z.object({
  sub_tasks: z.array(SubTaskSchema).min(1),
  reasoning: z.string(),
});

export type SubTask = z.infer<typeof SubTaskSchema>;

const SUB_TASK_CLASSIFICATION_RULES = `
Sub-task classification rules:
| Request Type                                  | Tag    | Lane |
|-----------------------------------------------|--------|------|
| Update page title, SEO, text, slug, body      | sanity | 1    |
| Create or delete a page or document           | sanity | 1    |
| Publish or unpublish content                  | sanity | 1    |
| New schema type or field                      | code   | 2    |
| New component, layout, or design change       | code   | 2    |
| Feature development                           | code   | 2    |
| Content update AND schema/component together  | both   | 3    |

Lane 3 (both) tasks must be broken into at least two sub-tasks:
one code/lane-2 sub-task first, then the sanity/lane-1 sub-task that depends on it.
`.trim();

export async function enumerateSubTasks(classificationId: string): Promise<SubTask[]> {
  const { data: record, error } = await adminClient
    .from("classification_records")
    .select("title, description, task_type")
    .eq("id", classificationId)
    .single();

  if (error || !record) {
    throw new Error(`[enumerateSubTasks] classification record not found: ${classificationId}`);
  }

  const config = await getModelConfig("classification");
  const model = getLanguageModel(
    (config.provider ?? "anthropic") as "anthropic" | "openai",
    config.model_id,
  );

  const start = Date.now();
  const { object, usage } = await generateObject({
    model,
    schema: SubTaskEnumerationSchema,
    prompt: `You are a task decomposition assistant for a web development agency.

Break the following task into atomic sub-tasks, each tagged with a classification and lane.

Task title: ${record.title}
${record.description ? `Description: ${record.description}` : ""}
${record.task_type ? `Pre-classified type: ${record.task_type}` : ""}

${SUB_TASK_CLASSIFICATION_RULES}

Rules:
- A pure content request produces 1 sub-task tagged sanity/lane-1.
- A pure code request produces 1 sub-task tagged code/lane-2.
- A request that requires BOTH a code change AND a content update produces 2+ sub-tasks:
  code/lane-2 sub-task(s) first (order 1, 2, ...), then sanity/lane-1 (higher order numbers).
- Each sub-task id must be a short kebab-case slug (e.g. "update-seo-title").
- Order drives sequencing — lower order executes first.
- Provide concise reasoning for the overall decomposition.`,
  });

  await logLLMInvocation({
    customerId: undefined,
    layer: "classification",
    modelUsed: config.model_id,
    inputTokens: usage?.inputTokens ?? 0,
    outputTokens: usage?.outputTokens ?? 0,
    durationMs: Date.now() - start,
    status: "success",
  } as Parameters<typeof logLLMInvocation>[0]);

  await adminClient
    .from("classification_records")
    .update({ sub_tasks: object.sub_tasks as unknown as Json })
    .eq("id", classificationId);

  return object.sub_tasks;
}

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
    const config = await getModelConfig("classification");
    const model = getLanguageModel((config.provider ?? "anthropic") as "anthropic" | "openai", config.model_id);
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
- llm_eligible: YES = task is clearly understood AND confidence ≥ 60; NO = needs human judgment or confidence < 60; HUMAN_ONLY = never automate (billing, credentials, sensitive client decisions). When in doubt, use NO.
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
