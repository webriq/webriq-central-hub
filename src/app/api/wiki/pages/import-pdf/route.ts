import { NextRequest, NextResponse } from "next/server";
import { PDFParse } from "pdf-parse";
import { createClient } from "@/lib/supabase/server";
import { classifyPageComplexity, transcribePage } from "@/lib/ai/wiki-pdf-import";
import { encodeEvent, type PdfImportEvent } from "@/lib/wiki/pdf-import-events";

// Task 396 — server-side half of Wiki Import: `.pdf` needs Node (`pdf-parse` reads `fs`), so
// unlike the `.docx`/`.md` paths (client-side mammoth/marked, see `_wiki-import-modal.tsx`),
// this one route runs on the server.
//
// Task 398 — classify-then-conditionally-transcribe: `pdf-parse`'s `getText()` follows content-
// stream order, which jumbles genuinely multi-column/designed layouts. Each page's rendered
// screenshot is classified ("simple"/"complex") by a cheap Haiku vision pass; "simple" pages stay
// on the free `pdf-parse` text path (self-escaped, never treated as HTML), "complex" pages get a
// Sonnet vision transcription pass that returns real HTML — the client-side import modal now
// sanitizes every import type's `contentHtml` uniformly, so untrusted HTML from this path is safe.
export const runtime = "nodejs";
export const maxDuration = 180;

const MAX_FILE_SIZE = 15 * 1024 * 1024; // 15MB — matches the client-side Import modal's own cap
const MAX_PAGES = 20; // quick-import tool, not a bulk migration path — reject, don't truncate
const CONCURRENCY = 4; // bounded burst against the Anthropic API for one request

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function textToParagraphs(text: string): string {
  return text
    .split(/\n\s*\n/)
    .map((block) => block.replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .map((block) => `<p>${escapeHtml(block)}</p>`)
    .join("\n");
}

// Lines (or bare page numbers) that recur on most pages are running headers/footers, not content.
function stripRunningHeadersFooters(pages: string[]): string[] {
  if (pages.length < 3) return pages;
  const norm = (l: string) => l.trim().replace(/\d+/g, "#");
  const counts = new Map<string, number>();
  for (const text of pages) {
    const edge = text.split("\n").map(norm).filter(Boolean);
    for (const l of new Set([...edge.slice(0, 3), ...edge.slice(-3)])) counts.set(l, (counts.get(l) ?? 0) + 1);
  }
  const repeated = new Set([...counts].filter(([, n]) => n >= Math.ceil(pages.length * 0.6)).map(([l]) => l));
  return pages.map((text) => {
    const lines = text.split("\n");
    const idx = lines.map((l, i) => [norm(l), i] as const).filter(([l]) => l);
    const edgeIdx = new Set([...idx.slice(0, 3), ...idx.slice(-3)].map(([, i]) => i));
    return lines.filter((l, i) => !(edgeIdx.has(i) && repeated.has(norm(l)))).join("\n");
  });
}

async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>,
  signal: AbortSignal,
  onSettled?: () => void,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      // Client closed the modal — stop spending LLM calls.
      signal.throwIfAborted();
      const index = next++;
      results[index] = await fn(items[index], index);
      onSettled?.();
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

// Streams progress events, then a final `result`/`error` event. Errors after this point can't
// change the HTTP status (already 200), so they travel as an `error` event carrying the status.
async function runImport(parser: PDFParse, emit: (e: PdfImportEvent) => void, signal: AbortSignal) {
  emit({ type: "stage", stage: "parsing", done: 0, total: 0 });
  const textResult = await parser.getText();

  if (textResult.total > MAX_PAGES) {
    emit({
      type: "error",
      status: 400,
      error: `This PDF has ${textResult.total} pages — the Wiki import tool supports up to ${MAX_PAGES} pages. For larger documents, use StackShift's bulk migration service instead.`,
    });
    return;
  }

  emit({ type: "stage", stage: "rendering", done: 0, total: textResult.total });
  const screenshotResult = await parser.getScreenshot({ scale: 1.5 });
  const pages = screenshotResult.pages;

  const pageTexts = stripRunningHeadersFooters(
    pages.map((page) => textResult.pages.find((p) => p.num === page.pageNumber)?.text ?? ""),
  );

  // A page with no text layer (scanned / image-only / outlined-text export) can't be served by
  // the free pdf-parse path at all — the classifier only judges layout, so it happily calls
  // such pages "simple". Skip the classify call and force transcription for them.
  let analyzed = 0;
  emit({ type: "stage", stage: "analyzing", done: 0, total: pages.length });
  const classifications = await mapWithConcurrency(
    pages,
    CONCURRENCY,
    async (page, index): Promise<"simple" | "complex"> =>
      pageTexts[index].trim() ? classifyPageComplexity(Buffer.from(page.data)) : "complex",
    signal,
    () => emit({ type: "stage", stage: "analyzing", done: ++analyzed, total: pages.length }),
  );

  const complexPageCount = classifications.filter((c) => c === "complex").length;

  let transcribed = 0;
  emit({ type: "stage", stage: "transcribing", done: 0, total: complexPageCount });
  const pageHtmls = await mapWithConcurrency(
    pages,
    CONCURRENCY,
    async (page, index) => {
      const pageText = pageTexts[index];
      if (classifications[index] !== "complex") return textToParagraphs(pageText);
      try {
        return await transcribePage(Buffer.from(page.data));
      } catch {
        // transcribePage already logged the error — fall back to the free text path for
        // this page rather than failing the whole import over one page.
        return textToParagraphs(pageText);
      } finally {
        emit({ type: "stage", stage: "transcribing", done: ++transcribed, total: complexPageCount });
      }
    },
    signal,
  );

  const contentHtml = pageHtmls.join("\n");

  if (!contentHtml.replace(/<[^>]*>/g, "").trim()) {
    emit({
      type: "error",
      status: 422,
      error: "No text could be extracted from this PDF — it appears to be image-only and the AI transcription failed. Please try again.",
    });
    return;
  }

  emit({ type: "result", contentHtml, pageCount: textResult.total, complexPageCount });
}

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const formData = await req.formData().catch(() => null);
  const file = formData?.get("file") as File | null;
  if (!file) return NextResponse.json({ error: "No file provided" }, { status: 400 });

  if (!file.name.toLowerCase().endsWith(".pdf")) {
    return NextResponse.json({ error: "Only .pdf files are accepted here" }, { status: 400 });
  }
  if (file.size > MAX_FILE_SIZE) {
    return NextResponse.json({ error: `File size exceeds 15MB limit (${(file.size / (1024 * 1024)).toFixed(1)}MB)` }, { status: 400 });
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const encoder = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let closed = false;
      const emit = (e: PdfImportEvent) => {
        if (!closed) controller.enqueue(encoder.encode(encodeEvent(e)));
      };
      const parser = new PDFParse({ data: buffer });
      try {
        await runImport(parser, emit, req.signal);
      } catch (err) {
        if (!req.signal.aborted) {
          console.error("POST /api/wiki/pages/import-pdf parse error:", err);
          emit({ type: "error", status: 400, error: "Failed to read this PDF — it may be encrypted, corrupted, or image-only." });
        }
      } finally {
        await parser.destroy();
        closed = true;
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      "X-Accel-Buffering": "no",
    },
  });
}
