import { adminClient } from "@/lib/supabase/admin";
import { computeLLMCost } from "@/config/constants";
import type { OrchestrationLayer } from "@/types/hub";

type LogParams = {
  customerId?: string;
  layer: OrchestrationLayer;
  modelUsed: string;
  inputTokens: number;
  outputTokens: number;
  durationMs: number;
  status?: "success" | "error" | "timeout";
  errorMessage?: string;
  referenceId?: string;
  referenceType?: string;
};

export async function logLLMInvocation(params: LogParams): Promise<void> {
  const costUsd = computeLLMCost(params.modelUsed, params.inputTokens, params.outputTokens);

  const { error } = await adminClient.from("llm_invocation_logs").insert({
    customer_id: params.customerId ?? null,
    orchestration_layer: params.layer,
    model_used: params.modelUsed,
    input_tokens: params.inputTokens,
    output_tokens: params.outputTokens,
    cost_usd: costUsd,
    duration_ms: params.durationMs,
    status: params.status ?? "success",
    error_message: params.errorMessage ?? null,
    reference_id: params.referenceId ?? null,
    reference_type: params.referenceType ?? null,
  });

  if (error) {
    // Non-fatal — log to stderr but never throw; we must not disrupt the orchestration flow
    console.error("[llm-logger] failed to write invocation log:", error.message);
  }
}
