// Task 359 — extracted from _files-tab.tsx (537 lines, over the hard limit in
// nextjs-file-length-best-practices.md). Data, not logic.
export const ALLOWED_UPLOAD_TYPES = [
  "image/jpeg", "image/png", "image/gif", "image/webp", "image/svg+xml", "application/pdf",
  "application/msword", "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "text/html", "text/markdown", "text/plain", "text/csv",
];

// Not exported — only used below to build ALLOWED_TYPES_LABEL; no other file imports it.
const MIME_LABELS: Record<string, string> = {
  "image/jpeg": "JPG", "image/png": "PNG", "image/gif": "GIF", "image/webp": "WEBP", "image/svg+xml": "SVG",
  "application/pdf": "PDF", "application/msword": "DOC",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "DOCX",
  "application/vnd.ms-excel": "XLS", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "XLSX",
  "text/html": "HTML", "text/markdown": "MD", "text/plain": "TXT", "text/csv": "CSV",
};

export const ALLOWED_TYPES_LABEL = Array.from(new Set(ALLOWED_UPLOAD_TYPES.map((m) => MIME_LABELS[m] ?? m))).join(", ");
export const MAX_FILE_SIZE = 25 * 1024 * 1024; // matches the customer-assets bucket's file_size_limit (upload/route.ts)
export const MAX_SIZE_LABEL = "25 MB";
