// Task 405 — NDJSON progress events streamed by `POST /api/wiki/pages/import-pdf` and read by the
// Wiki import modal. One JSON object per line; the last line is always `result` or `error`.

export type PdfImportStage = "parsing" | "rendering" | "analyzing" | "transcribing";

export type PdfImportEvent =
  | { type: "stage"; stage: PdfImportStage; done: number; total: number }
  | { type: "result"; contentHtml: string; pageCount: number; complexPageCount: number }
  | { type: "error"; error: string; status: number };

export function encodeEvent(event: PdfImportEvent): string {
  return `${JSON.stringify(event)}\n`;
}

// Splits a streamed text chunk into complete events, returning the unfinished tail to prepend to
// the next chunk.
export function parseEventLines(buffer: string): { events: PdfImportEvent[]; rest: string } {
  const lines = buffer.split("\n");
  const rest = lines.pop() ?? "";
  const events = lines.filter((l) => l.trim()).map((l) => JSON.parse(l) as PdfImportEvent);
  return { events, rest };
}
