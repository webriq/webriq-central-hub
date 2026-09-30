import type { WikiPageDetail } from "@/types/wiki";
import { downloadBlob, exportFilename, parseContentHtml } from "./_wiki-export-shared";
import { WIKI_PAGE, WIKI_SPACING } from "./_wiki-export-style";
import { htmlToDocxBlocks } from "./_wiki-export-docx-nodes";
import { DOCX_FONTS, blockMarks, buildDocxNumbering, buildDocxStyles, paragraphSpacing } from "./_wiki-export-docx-styles";
import { collapseWhitespace } from "./_wiki-export-whitespace";
import type { DocxImage } from "./_wiki-export-docx-types";

// Task 400 — "Export as Word (.docx)": `docx` (dynamically imported) builds a real .docx in the
// browser from the page's saved HTML. Images are public Storage URLs (task-content bucket), so
// they're fetched here up front; one that fails to load becomes a placeholder run instead of
// failing the export. Sizes, colors and spacing follow the Wiki read view; fonts are Arial /
// Courier New (see DOCX_FONTS in `_wiki-export-docx-styles.ts` for why).

const DIRECT_TYPES: Record<string, DocxImage["type"]> = {
  "image/png": "png", "image/jpeg": "jpg", "image/gif": "gif", "image/bmp": "bmp",
};

async function rasterizeToPng(bitmap: ImageBitmap): Promise<ArrayBuffer> {
  const canvas = document.createElement("canvas");
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas 2D context unavailable");
  ctx.drawImage(bitmap, 0, 0);
  const png = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
  if (!png) throw new Error("PNG encode failed");
  return png.arrayBuffer();
}

async function loadImage(src: string): Promise<DocxImage> {
  const res = await fetch(src);
  if (!res.ok) throw new Error(`Image fetch failed: ${res.status}`);
  const blob = await res.blob();
  const bitmap = await createImageBitmap(blob);
  try {
    const direct = DIRECT_TYPES[blob.type];
    // Types Word can't embed directly (webp, avif, …) are re-encoded as PNG.
    const data = direct ? await blob.arrayBuffer() : await rasterizeToPng(bitmap);
    const scale = Math.min(1, WIKI_SPACING.image.maxWidth / bitmap.width);
    return { data, type: direct ?? "png", width: Math.round(bitmap.width * scale), height: Math.round(bitmap.height * scale) };
  } finally {
    bitmap.close();
  }
}

async function prefetchImages(root: HTMLElement): Promise<Map<string, DocxImage>> {
  const srcs = [...new Set(Array.from(root.querySelectorAll("img[src]"), (img) => img.getAttribute("src") ?? ""))].filter(Boolean);
  const results = await Promise.allSettled(srcs.map(loadImage));
  const images = new Map<string, DocxImage>();
  results.forEach((result, i) => {
    if (result.status === "fulfilled") images.set(srcs[i], result.value);
  });
  return images;
}

export async function exportDocx(detail: WikiPageDetail): Promise<void> {
  const docx = await import("docx");
  const { Document, Packer, Paragraph, TextRun, HeadingLevel } = docx;

  const root = parseContentHtml(detail.contentHtml);
  collapseWhitespace(root);
  const images = await prefetchImages(root);
  const fonts = DOCX_FONTS;
  const body = htmlToDocxBlocks(root, docx, images, fonts);
  const toTwips = (pt: number) => Math.round(pt * 20);
  const title = blockMarks(fonts, "title");
  const titleParagraph = new Paragraph({
    heading: HeadingLevel.TITLE,
    keepNext: true,
    spacing: paragraphSpacing(0, WIKI_SPACING.title.after, 1.2),
    children: [new TextRun({ text: detail.title, font: title.font, size: title.size, bold: true, color: title.color, characterSpacing: title.tracking })],
  });

  const document = new Document({
    title: detail.title,
    styles: buildDocxStyles(fonts),
    numbering: buildDocxNumbering(docx, fonts),
    sections: [{
      properties: {
        page: {
          size: { width: toTwips(WIKI_PAGE.widthPt), height: toTwips(WIKI_PAGE.heightPt) },
          margin: { top: toTwips(WIKI_PAGE.marginPt), bottom: toTwips(WIKI_PAGE.marginPt), left: toTwips(WIKI_PAGE.marginPt), right: toTwips(WIKI_PAGE.marginPt) },
        },
      },
      children: [titleParagraph, ...body],
    }],
  });

  const blob = await Packer.toBlob(document);
  downloadBlob(blob, exportFilename(detail.title, "docx"));
}
