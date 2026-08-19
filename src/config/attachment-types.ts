// Shared MIME/extension allowlist for task & issue attachments (task 273) — single source of
// truth replacing the ~9 independently hand-copied ALLOWED_MIME_TYPES/MAX_FILE_SIZE constants
// that previously lived in _task-attachment-picker.tsx, _attachment-upload-zone.tsx,
// _issue-attachments.tsx, and their matching POST routes. Scoped to the task/issue attachment
// surface only — kb/upload, customers/[id]/assets/upload, and the onboarding workspace's
// _files-tab.tsx keep their own independent allowlists (out of scope, task 273).
//
// `file.type` (the browser-supplied multipart Content-Type) is unreliable: some browsers report
// an empty string for extensions they don't recognize (.ts/.tsx almost always; .md/.json
// inconsistently across OS/browser combos), and `.ts` collides with the *official* IANA
// `video/mp2t` (MPEG transport stream) type on some OS mime databases. Extension is therefore
// the authoritative signal for *category*; `file.type` is only used as a fast client-side hint.
// Byte-level verification (src/lib/uploads/verify-file.ts) is the actual security control.

export type AttachmentCategory = "image" | "pdf" | "word" | "excel" | "zip" | "rar" | "text" | "video";

export interface ExtensionInfo {
  category: AttachmentCategory;
  mime: string;
  label: string;
}

export const EXTENSION_INFO: Record<string, ExtensionInfo> = {
  jpg: { category: "image", mime: "image/jpeg", label: "JPG" },
  jpeg: { category: "image", mime: "image/jpeg", label: "JPG" },
  png: { category: "image", mime: "image/png", label: "PNG" },
  gif: { category: "image", mime: "image/gif", label: "GIF" },
  webp: { category: "image", mime: "image/webp", label: "WEBP" },
  pdf: { category: "pdf", mime: "application/pdf", label: "PDF" },
  doc: { category: "word", mime: "application/msword", label: "DOC" },
  docx: {
    category: "word",
    mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    label: "DOCX",
  },
  xls: { category: "excel", mime: "application/vnd.ms-excel", label: "XLS" },
  xlsx: {
    category: "excel",
    mime: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    label: "XLSX",
  },
  csv: { category: "text", mime: "text/csv", label: "CSV" },
  html: { category: "text", mime: "text/html", label: "HTML" },
  htm: { category: "text", mime: "text/html", label: "HTML" },
  css: { category: "text", mime: "text/css", label: "CSS" },
  js: { category: "text", mime: "text/javascript", label: "JS" },
  mjs: { category: "text", mime: "text/javascript", label: "JS" },
  cjs: { category: "text", mime: "text/javascript", label: "JS" },
  // .ts/.tsx: no registered browser MIME; treated as plain text by extension override
  // regardless of what file.type reports (see file header note on video/mp2t collision).
  ts: { category: "text", mime: "text/plain", label: "TS" },
  tsx: { category: "text", mime: "text/plain", label: "TSX" },
  json: { category: "text", mime: "application/json", label: "JSON" },
  md: { category: "text", mime: "text/markdown", label: "MD" },
  markdown: { category: "text", mime: "text/markdown", label: "MD" },
  txt: { category: "text", mime: "text/plain", label: "TXT" },
  zip: { category: "zip", mime: "application/zip", label: "ZIP" },
  rar: { category: "rar", mime: "application/vnd.rar", label: "RAR" },
  // MHTML — a saved-webpage archive (MIME multipart message, not a binary format with a fixed
  // signature). Chrome reports its file.type as "multipart/related", which explains the
  // pre-addition rejection message ("multipart/related isn't supported") users would have seen.
  // Categorized as "text" like HTML/CSS/etc.: it has no magic-byte signature to check (it's a
  // MIME header block plus base64/quoted-printable text parts, not raw binary), so the existing
  // generic "text" category path (verify-file.ts: reject only on a NUL-heavy binary look or a
  // detected binary/executable signature) is exactly the right check with no special-casing.
  mhtml: { category: "text", mime: "multipart/related", label: "MHTML" },
  mht: { category: "text", mime: "multipart/related", label: "MHTML" },
  // Video — mirrors the video/mp4 support comment attachments already had (_task-comments.tsx),
  // extended here to task/issue attachments and to a real inline <video> viewer (task 273 addendum).
  mp4: { category: "video", mime: "video/mp4", label: "MP4" },
  m4v: { category: "video", mime: "video/mp4", label: "MP4" },
  mov: { category: "video", mime: "video/quicktime", label: "MOV" },
  webm: { category: "video", mime: "video/webm", label: "WEBM" },
};

// Deliberately excluded, not an oversight: image/svg+xml can carry an embedded <script>, a
// stored-XSS vector when served back inline from the signed-URL viewer (the original task
// attachment route's own long-standing decision — carried forward here, not revisited).

// Executable/script-runtime extensions — rejected even if the browser reports an
// allowlisted-looking MIME type for them (spoofable). Cross-checked against real magic bytes in
// verify-file.ts regardless of claimed extension, so renaming e.g. payload.exe to payload.txt
// does not bypass this list.
export const HARD_BLOCKED_EXTENSIONS = [
  "exe", "dll", "msi", "apk", "jar", "sh", "bat", "cmd", "ps1", "scr", "com", "bin",
];

export function extensionOf(filename: string): string {
  return filename.split(".").pop()?.toLowerCase() ?? "";
}

export function extensionInfoFor(filename: string): ExtensionInfo | null {
  return EXTENSION_INFO[extensionOf(filename)] ?? null;
}

export function isHardBlockedFilename(filename: string): boolean {
  return HARD_BLOCKED_EXTENSIONS.includes(extensionOf(filename));
}

// Bucket's actual file_size_limit (supabase/migrations/055_project_assets_size_limit.sql, task
// 114 live-run fix) — every task/issue attachment route's own MAX_FILE_SIZE constant was stale
// at 25MB despite the bucket already supporting this. Centralized here so it can't drift again.
export const MAX_FILE_SIZE = 200 * 1024 * 1024; // 200MB
export const MAX_SIZE_LABEL = "200 MB";
export const MAX_FILES = 10;

export const ALLOWED_TYPES_LABEL = Array.from(
  new Set(Object.values(EXTENSION_INFO).map((info) => info.label))
).join(", ");
