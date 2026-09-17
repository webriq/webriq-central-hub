// Task 359 — extracted from _files-tab.tsx (537 lines, over the hard limit in
// nextjs-file-length-best-practices.md). Data, not logic.
//
// Task 372 follow-up — added .ico/.zip/.rar/.js/.ts/.xml. No malware scanning exists anywhere in
// this upload pipeline (client MIME/size check only — the server never sees the bytes, since
// uploads go browser-direct to Storage via a signed URL). That's a separate, deliberately
// deferred piece of work — see _docs/task/373-malware-scanning-upload-pipeline.md.
//
// `.ico` and `.zip`/`.rar` each get two MIME variants because browsers disagree on which one
// `file.type` reports (legacy vs. IANA-registered). `.ts` is a known landmine: browsers commonly
// report TypeScript files as `video/mp2t` (the MPEG transport-stream video MIME type, since that's
// the OS-level association for the `.ts` extension) rather than any text/script type — so this
// list can't tell a `.ts` source file apart from an actual `.mp2t` video by MIME alone; both get
// the "TS" label as a result. A browser that instead reports an empty `file.type` for either `.ico`
// or `.ts` still fails validation — allowing an empty MIME type would defeat the whitelist entirely.
export const ALLOWED_UPLOAD_TYPES = [
  "image/jpeg", "image/png", "image/gif", "image/webp", "image/svg+xml", "application/pdf",
  "application/msword", "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "text/html", "text/markdown", "text/plain", "text/csv",
  "image/x-icon", "image/vnd.microsoft.icon",
  "application/zip", "application/x-zip-compressed",
  "application/vnd.rar", "application/x-rar-compressed",
  "text/javascript", "application/javascript",
  "video/mp2t",
  "application/xml", "text/xml",
];

// Not exported — only used below to build ALLOWED_TYPES_LABEL; no other file imports it.
const MIME_LABELS: Record<string, string> = {
  "image/jpeg": "JPG", "image/png": "PNG", "image/gif": "GIF", "image/webp": "WEBP", "image/svg+xml": "SVG",
  "application/pdf": "PDF", "application/msword": "DOC",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "DOCX",
  "application/vnd.ms-excel": "XLS", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "XLSX",
  "text/html": "HTML", "text/markdown": "MD", "text/plain": "TXT", "text/csv": "CSV",
  "image/x-icon": "ICO", "image/vnd.microsoft.icon": "ICO",
  "application/zip": "ZIP", "application/x-zip-compressed": "ZIP",
  "application/vnd.rar": "RAR", "application/x-rar-compressed": "RAR",
  "text/javascript": "JS", "application/javascript": "JS",
  "video/mp2t": "TS",
  "application/xml": "XML", "text/xml": "XML",
};

export const ALLOWED_TYPES_LABEL = Array.from(new Set(ALLOWED_UPLOAD_TYPES.map((m) => MIME_LABELS[m] ?? m))).join(", ");
export const MAX_FILE_SIZE = 25 * 1024 * 1024; // matches the customer-assets bucket's file_size_limit (upload/route.ts)
export const MAX_SIZE_LABEL = "25 MB";
