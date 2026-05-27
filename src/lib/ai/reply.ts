import { adminClient } from "@/lib/supabase/admin";
import { buildContextChain } from "@/lib/ai/context-chain";
import { getModel, getModelConfig } from "@/lib/ai/model-config";
import { logLLMInvocation } from "@/lib/ai/logger";
import { generateText } from "ai";

export interface GenerateReplyDraftInput {
  classificationId: string;
  customerId: string;
  executionRecordId: string;
  whatWasDone: string;
}

export async function generateReplyDraft(input: GenerateReplyDraftInput): Promise<void> {
  const { classificationId, customerId, executionRecordId, whatWasDone } = input;

  const { data: customer, error: customerError } = await adminClient
    .from("customers")
    .select("communication_tone, contact_name")
    .eq("customer_id", customerId)
    .maybeSingle();

  if (customerError) {
    console.error("[reply] failed to fetch customer:", customerError.message);
  }

  const tone = customer?.communication_tone ?? "formal";
  const contactName = customer?.contact_name ?? "there";

  const toneInstructions: Record<string, string> = {
    formal: "Write in a professional, formal tone. Use complete sentences.",
    casual: "Write in a friendly, conversational tone. Keep it brief and warm.",
    technical: "Write in a concise, technical tone. Include relevant implementation details.",
  };

  const [model, config, contextChain] = await Promise.all([
    getModel("reply"),
    getModelConfig("reply"),
    buildContextChain(classificationId),
  ]);

  const systemPrompt = [
    "You are drafting a client-facing update for a PM to review before sending.",
    toneInstructions[tone] ?? toneInstructions.formal,
    `Address the client as "${contactName}". Do not include a subject line.`,
    "Keep the draft under 150 words.",
  ].join(" ");

  const userPrompt = [
    "Task context:",
    contextChain,
    "",
    "What was completed:",
    whatWasDone,
    "",
    "Draft a brief client update summarising what was done.",
  ].join("\n");

  const startMs = Date.now();
  const { text, usage } = await generateText({
    model,
    system: systemPrompt,
    prompt: userPrompt,
  });

  await logLLMInvocation({
    layer: "reply",
    customerId,
    modelUsed: config.model_id,
    inputTokens: usage.inputTokens ?? 0,
    outputTokens: usage.outputTokens ?? 0,
    durationMs: Date.now() - startMs,
    referenceId: classificationId,
    referenceType: "classification_record",
  });

  const { error: insertError } = await adminClient.from("reply_drafts").insert({
    classification_id: classificationId,
    customer_id: customerId,
    execution_record_id: executionRecordId,
    draft_content: text,
    status: "DRAFT",
  });

  if (insertError) {
    console.error("[reply] draft insert failed:", insertError.message);
    throw new Error("Failed to save reply draft");
  }
}
