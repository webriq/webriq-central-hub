import { generateObject, generateText, type ModelMessage } from "ai";
import { z } from "zod";
import { getModel, getModelConfig } from "@/lib/ai/model-config";
import { logLLMInvocation } from "@/lib/ai/logger";

// Task 398 — first multimodal (image-input) LLM call in this codebase. Classify-then-
// conditionally-transcribe: a cheap Haiku vision pass decides per page whether the existing
// free `pdf-parse` text path is good enough ("simple") or whether the page's visual layout
// (columns, sidebars, icon+text rows) carries reading-order meaning that only a Sonnet vision
// transcription pass can recover ("complex").

const ClassifySchema = z.object({
  complexity: z.enum(["simple", "complex"]),
});

const CLASSIFY_SYSTEM_PROMPT = `You are looking at a single page rendered from a PDF document. Decide whether its layout
is simple or complex for the purpose of plain-text extraction.

"simple" — a single linear column of body text (headings, paragraphs, a plain list) where
reading top-to-bottom, left-to-right recovers the correct reading order.

"complex" — multiple columns, sidebars, mixed icon+text arrangements, colored panels/boxes,
numbered circles or other standalone visual elements, tables, or any layout where the visual
position of content carries reading-order meaning that a naive top-to-bottom text scan would
scramble.

Respond with your classification only.`;

const TRANSCRIBE_SYSTEM_PROMPT = `You are looking at a single page rendered from a PDF document. Transcribe its content in the
correct visual reading order as clean semantic HTML — headings, paragraphs, lists, and tables
where appropriate. Follow the page's actual visual flow (e.g. read a left column fully before
a right column, or follow a numbered sequence in order) rather than any raw underlying text
order. Output HTML only — no commentary, no markdown code fences, no explanation.`;

function imageMessage(imageBuffer: Buffer): ModelMessage[] {
  return [
    {
      role: "user",
      content: [{ type: "image", image: imageBuffer, mediaType: "image/png" }],
    },
  ];
}

export async function classifyPageComplexity(imageBuffer: Buffer): Promise<"simple" | "complex"> {
  const start = Date.now();
  let modelId: string | null = null;

  try {
    const [model, config] = await Promise.all([
      getModel("wiki_pdf_classify"),
      getModelConfig("wiki_pdf_classify"),
    ]);
    modelId = config.model_id;

    const { object, usage } = await generateObject({
      model,
      schema: ClassifySchema,
      system: CLASSIFY_SYSTEM_PROMPT,
      messages: imageMessage(imageBuffer),
    });

    await logLLMInvocation({
      layer: "wiki_pdf_classify",
      modelUsed: config.model_id,
      inputTokens: usage?.inputTokens ?? 0,
      outputTokens: usage?.outputTokens ?? 0,
      durationMs: Date.now() - start,
      status: "success",
      referenceType: "wiki_pdf_page_classify",
    });

    return object.complexity;
  } catch (err) {
    console.error("[wiki-pdf-import] classifyPageComplexity failed:", err instanceof Error ? err.message : err);
    await logLLMInvocation({
      layer: "wiki_pdf_classify",
      modelUsed: modelId ?? "unknown",
      inputTokens: 0,
      outputTokens: 0,
      durationMs: Date.now() - start,
      status: "error",
      errorMessage: err instanceof Error ? err.message : String(err),
      referenceType: "wiki_pdf_page_classify",
    });
    // Fail open to the cheaper, free pdf-parse text path rather than more AI cost.
    return "simple";
  }
}

export async function transcribePage(imageBuffer: Buffer): Promise<string> {
  const start = Date.now();
  let modelId: string | null = null;

  try {
    const [model, config] = await Promise.all([
      getModel("wiki_pdf_transcribe"),
      getModelConfig("wiki_pdf_transcribe"),
    ]);
    modelId = config.model_id;

    const { text, usage } = await generateText({
      model,
      system: TRANSCRIBE_SYSTEM_PROMPT,
      messages: imageMessage(imageBuffer),
    });

    await logLLMInvocation({
      layer: "wiki_pdf_transcribe",
      modelUsed: config.model_id,
      inputTokens: usage.inputTokens ?? 0,
      outputTokens: usage.outputTokens ?? 0,
      durationMs: Date.now() - start,
      status: "success",
      referenceType: "wiki_pdf_page_transcribe",
    });

    return text;
  } catch (err) {
    console.error("[wiki-pdf-import] transcribePage failed:", err instanceof Error ? err.message : err);
    await logLLMInvocation({
      layer: "wiki_pdf_transcribe",
      modelUsed: modelId ?? "unknown",
      inputTokens: 0,
      outputTokens: 0,
      durationMs: Date.now() - start,
      status: "error",
      errorMessage: err instanceof Error ? err.message : String(err),
      referenceType: "wiki_pdf_page_transcribe",
    });
    throw err;
  }
}
