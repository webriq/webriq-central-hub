import { NextRequest, NextResponse } from "next/server";
import { PDFParse } from "pdf-parse";
import { createClient } from "@/lib/supabase/server";
import { classifyPageComplexity, transcribePage } from "@/lib/ai/wiki-pdf-import";

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

async function mapWithConcurrency<T, R>(items: T[], limit: number, fn: (item: T, index: number) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const index = next++;
      results[index] = await fn(items[index], index);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
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
  const parser = new PDFParse({ data: buffer });
  try {
    const textResult = await parser.getText();

    if (textResult.total > MAX_PAGES) {
      return NextResponse.json(
        { error: `This PDF has ${textResult.total} pages — the Wiki import tool supports up to ${MAX_PAGES} pages. For larger documents, use StackShift's bulk migration service instead.` },
        { status: 400 },
      );
    }

    const screenshotResult = await parser.getScreenshot({ scale: 1.5 });

    const classifications = await mapWithConcurrency(
      screenshotResult.pages,
      CONCURRENCY,
      (page) => classifyPageComplexity(Buffer.from(page.data)),
    );

    const complexPageCount = classifications.filter((c) => c === "complex").length;

    const pageHtmls = await mapWithConcurrency(
      screenshotResult.pages,
      CONCURRENCY,
      async (page, index) => {
        const pageText = textResult.pages.find((p) => p.num === page.pageNumber)?.text ?? "";
        if (classifications[index] === "complex") {
          try {
            return await transcribePage(Buffer.from(page.data));
          } catch {
            // transcribePage already logged the error — fall back to the free text path for
            // this page rather than failing the whole import over one page.
            return textToParagraphs(pageText);
          }
        }
        return textToParagraphs(pageText);
      },
    );

    const contentHtml = pageHtmls.join("\n");

    return NextResponse.json({ contentHtml, pageCount: textResult.total, complexPageCount });
  } catch (err) {
    console.error("POST /api/wiki/pages/import-pdf parse error:", err);
    return NextResponse.json({ error: "Failed to read this PDF — it may be encrypted, corrupted, or image-only." }, { status: 400 });
  } finally {
    await parser.destroy();
  }
}
