// Task 468 (D4) — Haiku only PHRASES facts the deterministic planner already computed; it never decides or writes.
// Returns null on any failure so callers fall back to templated copy — a merge never depends on the LLM.
import { generateText } from "ai";
import { getModel, getModelConfig } from "@/lib/ai/model-config";
import { logLLMInvocation } from "@/lib/ai/logger";

const SYSTEM =
  "You are the Merge Assistant inside an internal project-management tool. Rewrite the given FACTS as 2-3 short, calm, plain sentences for a project manager. " +
  "Sentence case, no exclamation points, no emoji, no markdown. Only use numbers and names present in FACTS. Never invent items or promise anything not in FACTS.";

export async function narrate(kind: "review" | "summary", facts: string, referenceId: string): Promise<string | null> {
  const start = Date.now();
  let modelId = "unknown";
  try {
    const [model, config] = await Promise.all([getModel("project_merge"), getModelConfig("project_merge")]);
    modelId = config.model_id;
    const { text, usage } = await generateText({ model, system: SYSTEM, prompt: `KIND: ${kind}\nFACTS:\n${facts}`, maxOutputTokens: 300, abortSignal: AbortSignal.timeout(8000) });
    await logLLMInvocation({ layer: "project_merge", modelUsed: modelId, inputTokens: usage.inputTokens ?? 0, outputTokens: usage.outputTokens ?? 0, durationMs: Date.now() - start, referenceId, referenceType: `project_merge_${kind}` });
    return text.trim() || null;
  } catch (err) {
    await logLLMInvocation({ layer: "project_merge", modelUsed: modelId, inputTokens: 0, outputTokens: 0, durationMs: Date.now() - start, status: "error", errorMessage: err instanceof Error ? err.message : String(err), referenceId, referenceType: `project_merge_${kind}` });
    return null;
  }
}
