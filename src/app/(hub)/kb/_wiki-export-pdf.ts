import type { jsPDF as JsPDF } from "jspdf";
import type { WikiPageDetail } from "@/types/wiki";
import { buildWikiArticleHtml, downloadBlob, exportFilename } from "./_wiki-export-shared";
import { WIKI_PAGE, WIKI_SPACING, buildWikiCss } from "./_wiki-export-style";
import { fontFaceCss, loadWikiFonts, toBase64, type LoadedWikiFont } from "./_wiki-export-fonts";
import { insertPageBreakSpacers } from "./_wiki-export-pdf-pagination";
import { renderListMarkers } from "./_wiki-export-pdf-markers";

// Task 400 — "Export as PDF" is a direct `.pdf` download: jspdf's `html()` renderer (html2canvas
// layout → vector text, so text stays selectable) over the same `.wiki-export` article + CSS the
// HTML export uses. The Wiki's fonts are embedded in the PDF and also declared as `@font-face`
// for the browser layout pass, so layout and PDF glyphs use identical metrics. A face that
// didn't load falls through the CSS stack to `sans-serif`, which jspdf maps to Helvetica.

const IMAGE_WAIT_MS = 5000;
const EXPORT_STYLE_ATTR = "data-wiki-export-style";

function pdfStyle(font: LoadedWikiFont): string {
  const bold = font.weight === 700;
  const italic = font.style === "italic";
  if (bold && italic) return "bolditalic";
  if (bold) return "bold";
  return italic ? "italic" : "normal";
}

function registerPdfFonts(doc: JsPDF, fonts: LoadedWikiFont[]) {
  for (const font of fonts) {
    doc.addFileToVFS(font.file, toBase64(font.data));
    doc.addFont(font.file, font.family, pdfStyle(font));
  }
}

function waitForImages(root: HTMLElement): Promise<void> {
  const pending = Array.from(root.querySelectorAll("img")).filter((img) => !img.complete);
  const loaded = Promise.all(pending.map((img) => new Promise<void>((resolve) => {
    img.addEventListener("load", () => resolve(), { once: true });
    img.addEventListener("error", () => resolve(), { once: true });
  })));
  return Promise.race([loaded.then(() => undefined), new Promise<void>((r) => setTimeout(r, IMAGE_WAIT_MS))]);
}

// html2canvas 1.4 can't parse modern CSS color functions, and the Hub's global Tailwind v4 /
// shadcn base layer gives every element an `oklch()` border color and a `color-mix()` outline
// (serialized as `lab()`) — "Attempting to parse an unsupported color function". html2canvas
// reads styles from its own cloned document, so strip every stylesheet there except the
// export's own; the article then renders from `buildWikiCss()` alone (hex colors only).
function isolateExportStyles(clone: Document) {
  clone.querySelectorAll('style, link[rel="stylesheet"]').forEach((el) => {
    if (!el.hasAttribute(EXPORT_STYLE_ATTR)) el.remove();
  });
}

// Off-screen render host. Content is sanitized again here because, unlike DOMParser, a live
// element runs inline event handlers — defense in depth even though stored pages are already
// Tiptap output or import-sanitized (task 396).
async function mountRenderHost(detail: WikiPageDetail, fonts: LoadedWikiFont[]): Promise<HTMLElement> {
  const { default: DOMPurify } = await import("dompurify");
  const host = document.createElement("div");
  host.setAttribute("aria-hidden", "true");
  Object.assign(host.style, { position: "fixed", left: "-10000px", top: "0", width: `${WIKI_SPACING.contentWidth}px`, background: "#fff" });
  const style = document.createElement("style");
  style.setAttribute(EXPORT_STYLE_ATTR, "");
  style.textContent = `${fontFaceCss(fonts)}\n${buildWikiCss()}`;
  host.appendChild(style);
  host.insertAdjacentHTML("beforeend", DOMPurify.sanitize(buildWikiArticleHtml(detail), { USE_PROFILES: { html: true } }));
  document.body.appendChild(host);
  return host;
}

export async function exportPdf(detail: WikiPageDetail): Promise<void> {
  const [{ jsPDF }, fonts] = await Promise.all([import("jspdf"), loadWikiFonts()]);
  const host = await mountRenderHost(detail, fonts);
  try {
    // Force every declared face to load now — `document.fonts.ready` alone can resolve before
    // lazily-loaded faces have even started.
    const faceLoads = fonts.map((f) => document.fonts.load(`${f.style} ${f.weight} 16px "${f.family}"`));
    await Promise.all([...faceLoads, waitForImages(host)]);
    const article = host.querySelector<HTMLElement>(".wiki-export");
    if (!article) throw new Error("Render host is empty");

    const { marginPt } = WIKI_PAGE;
    const contentWidthPt = WIKI_PAGE.widthPt - marginPt * 2;
    // One PDF page's text area, in the article's CSS px (jspdf scales px → pt by width ratio).
    const pageHeightPx = (WIKI_PAGE.heightPt - marginPt * 2) / (contentWidthPt / WIKI_SPACING.contentWidth);
    renderListMarkers(article);
    insertPageBreakSpacers(article, pageHeightPx);

    const doc = new jsPDF({ unit: "pt", format: [WIKI_PAGE.widthPt, WIKI_PAGE.heightPt] });
    registerPdfFonts(doc, fonts);
    await doc.html(article, {
      margin: [marginPt, marginPt, marginPt, marginPt],
      // Plain slicing: page breaks were already placed in empty space by insertPageBreakSpacers.
      autoPaging: true,
      width: contentWidthPt,
      windowWidth: WIKI_SPACING.contentWidth,
      html2canvas: { useCORS: true, backgroundColor: "#ffffff", onclone: isolateExportStyles },
    });
    doc.setProperties({ title: detail.title });
    downloadBlob(doc.output("blob"), exportFilename(detail.title, "pdf"));
  } finally {
    host.remove();
  }
}
