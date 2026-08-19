import { fileTypeFromBuffer } from "file-type";
import { extensionInfoFor, isHardBlockedFilename, type AttachmentCategory } from "@/config/attachment-types";
import { detectDangerousSignature, detectKnownSignature, looksLikeBinary } from "./magic-bytes";

// Server-side authoritative attachment checker (task 273, Requirement C). This is HEURISTIC
// corruption/mismatch/spoofing detection, NOT virus-signature scanning — it does not check
// against known-malware signatures and is not a substitute for a real AV product. It catches:
//   1. A file renamed to disguise its real type (e.g. payload.exe -> payload.txt), regardless of
//      the claimed extension or the client-supplied MIME type.
//   2. A structurally corrupted or truncated binary file (image/PDF/Office/ZIP/RAR) whose bytes
//      don't match any real signature for its claimed category.
//   3. The explicit executable/script-runtime hard-block list.
// Must run server-side — a client-only check (client-signature-check.ts) is a UX nicety and is
// trivially bypassed by a direct API call.

export type VerifyFileResult = { ok: true } | { ok: false; reason: string };

// Binary categories with a real, checkable magic-byte signature. Plain "text" category files
// (TXT/MD/CSV/JSON/HTML/CSS/JS/TS) have no fixed signature — they're checked differently below.
const BINARY_CATEGORIES: ReadonlySet<AttachmentCategory> = new Set(["image", "pdf", "word", "excel", "zip", "rar", "video"]);

// file-type's detected mime -> the AttachmentCategory bucket(s) it satisfies. DOCX/XLSX are ZIP
// containers file-type usually disambiguates by inspecting internal content; legacy DOC/XLS share
// one OLE compound-file signature file-type can't always split further — both map to either
// "word" or "excel" so a genuine legacy file isn't falsely rejected for imprecise disambiguation.
const DETECTED_MIME_CATEGORIES: Record<string, AttachmentCategory[]> = {
  "image/jpeg": ["image"],
  "image/png": ["image"],
  "image/gif": ["image"],
  "image/webp": ["image"],
  "application/pdf": ["pdf"],
  "application/msword": ["word", "excel"],
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": ["word"],
  "application/vnd.ms-excel": ["word", "excel"],
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": ["excel"],
  "application/zip": ["zip", "word", "excel"],
  "application/x-cfb": ["word", "excel"],
  "application/vnd.rar": ["rar"],
  "application/x-rar-compressed": ["rar"],
  "video/mp4": ["video"],
  "video/quicktime": ["video"],
  "video/webm": ["video"],
  "video/x-matroska": ["video"],
};

const SAMPLE_BYTES = 4096;

export async function verifyFile(buffer: Buffer, filename: string): Promise<VerifyFileResult> {
  if (isHardBlockedFilename(filename)) {
    return { ok: false, reason: "This file type isn't allowed." };
  }

  const info = extensionInfoFor(filename);
  if (!info) {
    return { ok: false, reason: "Unsupported file type." };
  }

  const sample = buffer.subarray(0, Math.min(SAMPLE_BYTES, buffer.length));

  const dangerous = detectDangerousSignature(sample);
  if (dangerous) {
    return { ok: false, reason: `File appears to be an executable (${dangerous}), not a ${info.label} file.` };
  }

  if (BINARY_CATEGORIES.has(info.category)) {
    const detected = await fileTypeFromBuffer(buffer).catch(() => undefined);
    if (!detected) {
      // A quick fallback via the shared signature table for formats file-type didn't resolve
      // (e.g. a minimal/edge-case ZIP) before concluding the file is corrupted.
      const known = detectKnownSignature(sample);
      const fallbackOk =
        known &&
        ((known.category === "zip" && (info.category === "zip" || info.category === "word" || info.category === "excel")) ||
          (known.category === "ole" && (info.category === "word" || info.category === "excel")) ||
          known.category === info.category);
      if (!fallbackOk) {
        return { ok: false, reason: `File appears corrupted — its contents don't match a valid ${info.label} file.` };
      }
      return { ok: true };
    }
    const allowedCategories = DETECTED_MIME_CATEGORIES[detected.mime] ?? [];
    if (!allowedCategories.includes(info.category)) {
      return {
        ok: false,
        reason: `File extension claims ${info.label} but its contents look like a different file type. It may be corrupted or mislabeled.`,
      };
    }
    return { ok: true };
  }

  // Plain-text category (TXT/MD/CSV/JSON/HTML/CSS/JS/TS) — no fixed signature exists, so the
  // check is: does this look like plausible text, and does it NOT match any known binary
  // signature (catches e.g. a renamed image/archive/legacy-office file, not just executables).
  const knownBinary = detectKnownSignature(sample);
  if (knownBinary) {
    return {
      ok: false,
      reason: `File extension claims a text format (${info.label}) but its contents look like ${knownBinary.label}. It may be corrupted or mislabeled.`,
    };
  }
  if (looksLikeBinary(sample)) {
    return { ok: false, reason: "File doesn't look like a valid text file — it may be corrupted or mislabeled." };
  }

  return { ok: true };
}
