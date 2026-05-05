import { anthropic } from "@ai-sdk/anthropic";
import { openai } from "@ai-sdk/openai";
import type { LanguageModel } from "ai";

export type AIProvider = "anthropic" | "openai";

/**
 * Returns a Vercel AI SDK LanguageModel instance for the given provider and model ID.
 * Model IDs must match the provider's format:
 *   Anthropic: "claude-haiku-4-5-20251001", "claude-sonnet-4-6", etc.
 *   OpenAI:    "gpt-4o", "gpt-4o-mini", "gpt-4-turbo", etc.
 */
export function getLanguageModel(provider: AIProvider, modelId: string): LanguageModel {
  switch (provider) {
    case "anthropic":
      return anthropic(modelId);
    case "openai":
      return openai(modelId);
    default:
      throw new Error(`Unsupported AI provider: ${provider}`);
  }
}
