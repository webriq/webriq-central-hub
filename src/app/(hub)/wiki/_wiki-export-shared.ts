import type { WikiPageDetail } from "@/types/wiki";
import { buildWikiCss } from "./_wiki-export-style";

// Task 400 — primitives shared by every Wiki exporter (HTML / PDF / Word / Markdown), so the
// filename rule, the download plumbing and the standalone document template each exist once.

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function exportFilename(title: string, ext: string): string {
  const slug = title.replace(/[^\w\- ]+/g, "").trim().replace(/\s+/g, "-").toLowerCase();
  return `${slug || "page"}.${ext}`;
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

// The page as one `.wiki-export` article (title + saved content), styled by `buildWikiCss()`.
// Shared by the HTML download and the PDF renderer.
export function buildWikiArticleHtml(detail: WikiPageDetail): string {
  return `<article class="wiki-export">\n<h1 class="wiki-export-title">${escapeHtml(detail.title)}</h1>\n${detail.contentHtml}\n</article>`;
}

// Standalone file for the HTML export. Its fonts are the Wiki's (Inter / Space Grotesk /
// JetBrains Mono) when the reader has them installed, else free/generic sans-serif fallbacks.
export function buildStandaloneHtml(detail: WikiPageDetail): string {
  return (
    `<!DOCTYPE html>\n<html lang="en">\n<head>\n<meta charset="UTF-8">\n<title>${escapeHtml(detail.title)}</title>\n` +
    `<style>body{margin:40px 20px;background:#fff;}\n${buildWikiCss()}</style>\n</head>\n<body>\n` +
    `${buildWikiArticleHtml(detail)}\n</body>\n</html>`
  );
}

// Parses stored page HTML into a detached document for the DOM-walking exporters (Word,
// Markdown). DOMParser never executes scripts or loads resources, so this is inert.
export function parseContentHtml(html: string): HTMLElement {
  return new DOMParser().parseFromString(html, "text/html").body;
}
