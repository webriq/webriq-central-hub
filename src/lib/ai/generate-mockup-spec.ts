import { generateText } from "ai";
import { getModel, getModelConfig } from "@/lib/ai/model-config";
import { logLLMInvocation } from "@/lib/ai/logger";

export interface GenerateMockupSpecInput {
  html: string;
  fileName: string;
  customerId: string;
  sourceAssetId: string;
}

const SYSTEM_PROMPT = `You are a senior frontend engineer writing a build spec for another developer who will
rebuild an HTML mockup as real, production components (e.g. with Claude Code). You are not
writing marketing copy or a design review — you are writing instructions a developer can act on
directly.

Given the raw HTML of a mockup, produce a Markdown document with exactly these sections:

## Overview
1-2 sentences: what page/view this mockup represents.

## Section / Component Breakdown
A list of the distinct sections or components visible in the markup (header, hero, pricing
table, footer, etc.), with a short note on what each one contains and any natural component
boundary (what should probably become its own reusable component vs. inline markup).

## Interactive & Dynamic Elements
Call out anything in the mockup that is static markup standing in for real behavior: forms,
tabs, carousels, modals, accordions, dropdowns, anything with onclick/data- attributes, or
content that looks like it should come from a CMS/API rather than be hard-coded. If there is
nothing dynamic, say so explicitly rather than omitting the section.

## Responsive Notes
Breakpoints, responsive classes, or layout behavior implied by the markup/inline styles. If
nothing indicates responsive intent, say so explicitly.

## Build Prompt
A single, ready-to-paste instruction block (as its own fenced code block) that a developer
could hand directly to an AI coding assistant to implement this mockup as real components,
referencing the breakdown above.

Be concrete and specific to what is actually in the HTML — never generic boilerplate.`;

export async function generateMockupSpec(input: GenerateMockupSpecInput): Promise<{ markdown: string } | null> {
  const { html, fileName, customerId, sourceAssetId } = input;
  const start = Date.now();
  // Tracked outside the try block (same as assess.ts) so the error path below can still
  // attribute the log to the resolved model even when only the generateText call itself
  // fails after config resolution succeeded.
  let modelId: string | null = null;

  try {
    const [model, config] = await Promise.all([
      getModel("mockup_spec"),
      getModelConfig("mockup_spec"),
    ]);
    modelId = config.model_id;

    const { text, usage } = await generateText({
      model,
      system: SYSTEM_PROMPT,
      prompt: `Mockup file: ${fileName}\n\nHTML:\n\n${html}`,
    });

    await logLLMInvocation({
      customerId,
      layer: "mockup_spec",
      modelUsed: config.model_id,
      inputTokens: usage.inputTokens ?? 0,
      outputTokens: usage.outputTokens ?? 0,
      durationMs: Date.now() - start,
      status: "success",
      referenceId: sourceAssetId,
      referenceType: "customer_asset",
    });

    return { markdown: text };
  } catch (err) {
    console.error("[generate-mockup-spec] LLM call failed:", err instanceof Error ? err.message : err);
    await logLLMInvocation({
      customerId,
      layer: "mockup_spec",
      modelUsed: modelId ?? "unknown",
      inputTokens: 0,
      outputTokens: 0,
      durationMs: Date.now() - start,
      status: "error",
      errorMessage: err instanceof Error ? err.message : String(err),
      referenceId: sourceAssetId,
      referenceType: "customer_asset",
    });
    return null;
  }
}
