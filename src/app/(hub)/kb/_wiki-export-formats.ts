import type { WikiPageDetail } from "@/types/wiki";
import { buildStandaloneHtml, downloadBlob, exportFilename } from "./_wiki-export-shared";

// Task 400 — the single source of truth for the Export ▾ menu: each row is one entry here.
// PDF, Word and Markdown load their exporter module (and its library) only on click.

export type WikiExportFormat = {
  id: "html" | "pdf" | "docx" | "md";
  label: string;
  run: (detail: WikiPageDetail) => Promise<void>;
};

async function exportHtml(detail: WikiPageDetail) {
  downloadBlob(new Blob([buildStandaloneHtml(detail)], { type: "text/html" }), exportFilename(detail.title, "html"));
}

export const WIKI_EXPORT_FORMATS: WikiExportFormat[] = [
  { id: "html", label: "HTML", run: exportHtml },
  { id: "pdf", label: "PDF", run: async (d) => (await import("./_wiki-export-pdf")).exportPdf(d) },
  { id: "docx", label: "Word (.docx)", run: async (d) => (await import("./_wiki-export-docx")).exportDocx(d) },
  { id: "md", label: "Markdown", run: async (d) => (await import("./_wiki-export-markdown")).exportMarkdown(d) },
];
