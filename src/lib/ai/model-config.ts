import { adminClient } from "@/lib/supabase/admin";
import { getLanguageModel } from "@/lib/ai/providers";
import type { OrchestrationLayer } from "@/types/hub";
import type { LLMConfigRow } from "@/types/database";
import type { LanguageModel } from "ai";

// In-memory cache with 5-minute TTL to avoid per-request DB round-trips
const cache = new Map<string, { value: LLMConfigRow; expiresAt: number }>();
const TTL_MS = 5 * 60 * 1000;

export async function getModelConfig(layer: OrchestrationLayer): Promise<LLMConfigRow> {
  const cached = cache.get(layer);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.value;
  }

  // adminClient used — llm_config is internal config, not user data; also required for
  // server-to-server contexts (webhooks) where no user session exists.
  const { data, error } = await adminClient
    .from("llm_config")
    .select("*")
    .eq("orchestration_layer", layer)
    .eq("is_active", true)
    .single();

  if (error || !data) {
    throw new Error(`No active llm_config found for layer: ${layer}`);
  }

  cache.set(layer, { value: data, expiresAt: Date.now() + TTL_MS });
  return data;
}

/** Convenience: get the ready-to-use LanguageModel for a given orchestration layer. */
export async function getModel(layer: OrchestrationLayer): Promise<LanguageModel> {
  const config = await getModelConfig(layer);
  const provider = (config.provider ?? "anthropic") as "anthropic" | "openai";
  return getLanguageModel(provider, config.model_id);
}
