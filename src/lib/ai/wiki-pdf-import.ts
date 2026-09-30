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

const TRANSCRIBE_SYSTEM_PROMPT = `You convert one rendered PDF page into clean HTML for a wiki editor. The editor only supports
this tag set: h2, h3, p, strong, em, u, a, ul, ol, li, blockquote, pre, code, hr, table, thead, tbody,
tr, th, td, img, plus ul[data-type=taskList] / li[data-type=taskItem][data-checked]. Anything else is stripped. Output the HTML fragment only — no commentary, no markdown
fences, no <html>/<body>, no <h1> (the page title is stored separately), and NEVER style, class, font,
color or size attributes: the wiki applies one consistent typography, so every heading of the same
level and every paragraph must look identical across pages.

READING ORDER
Follow the page's visual flow (finish a column before the next, follow numbered sequences in order).

HEADINGS — the most common mistake is leaving a heading as a plain paragraph. Decide by visual role:
- Any line that is visibly larger, bolder, in a display/serif face, or set apart as a section title
  is a heading, even if it is a single short line. That includes numbered/labelled titles such as
  "3: The Newsletter Checklist", "Step 2: Set up the flow", "1. Reader-first strategy", "Entry template".
  Keep the exact text, numbering and punctuation as printed.
- Top-level section titles -> <h2>. Sub-sections beneath them, small step labels and sub-headings -> <h3>.
- Never make a whole sentence/paragraph a heading, and never bold a paragraph as a fake heading.
- A thin horizontal rule printed directly under a heading -> emit <hr> right after that heading.

RUNNING HEADERS, FOOTERS AND PAGE FURNITURE — OMIT ENTIRELY
Do not output the strip repeated at the top or bottom of each page (document/brand name, "Combined"
titles, section names, dates, page numbers like "12" or "Page 3 of 17", confidentiality lines, and the
rule under/over them). Only transcribe the page body.

PARAGRAPHS & MUTED TEXT
- Body text -> <p>. Keep inline emphasis: <strong> for bold, <em> for italic.
- Small, grey, caption-like, helper or note text (e.g. an intro line under a heading, a "Note:" line,
  fine print) -> <p><em>…</em></p>. Do not promote it to a heading and do not merge it into
  the heading line; keep it as its own paragraph directly after the heading, in the printed position.

LISTS
- Bulleted items -> <ul><li>. Numbered/lettered steps -> <ol><li>. Keep every item, in order, as ONE
  list per visual group (do not split a list per page-line, do not turn list items into paragraphs).
- CHECKLISTS: when each item is preceded by an empty square / checkbox (☐, □, [ ]), emit a task list
  instead of a bullet list, exactly like this and with no ☐/□ character in the text:
  <ul data-type="taskList"><li data-type="taskItem" data-checked="false"><p>Item text</p></li></ul>
  Always data-checked="false" unless the box is visibly ticked. Do NOT also add a bullet.
- For ordinary bullets, reproduce the item text exactly and never type the marker (•, -, *) into it.
- Nested/indented items -> nested <ul>/<ol> inside the parent <li>.

TABLES
- Any grid of aligned rows/columns (even with no visible borders) is a real <table>: header row in
  <thead><tr><th>…, body rows in <tbody>. Preserve every column and row and cell text exactly,
  including empty cells, in the printed order. Header text keeps its printed casing (do not upper-case it).
- Never flatten a table into paragraphs or lists, and never use a table for layout of ordinary prose.

CALLOUTS, CODE, IMAGES
- A shaded/bordered callout box (tip, note, warning, template) -> <blockquote><p>…</p></blockquote>.
- Monospace or code/template blocks -> <pre><code>…</code></pre>, preserving line breaks.
- Do not describe images/logos/decorative graphics; omit them.

Transcribe every word of the page body faithfully — do not summarize, reword, translate or invent
text. If part of the page is unreadable, skip it rather than guessing.`;

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

    return text.replace(/^\s*```(?:html)?\s*/i, "").replace(/\s*```\s*$/, "").trim();
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
