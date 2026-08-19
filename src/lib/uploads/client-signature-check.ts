// Lightweight client-side pre-check (task 273, Requirement C) — reads only the first 64 bytes of
// a staged file via File.slice() for instant dropzone rejection feedback before the network
// round-trip. Deliberately dependency-free (no `file-type` import here — that package is
// server-only, used by the authoritative check in verify-file.ts) and reuses the same
// magic-bytes.ts signature table as the server so the two checks can't drift apart. This is a UX
// nicety only; the server-side check in verify-file.ts is the actual security control and cannot
// be bypassed by skipping this one.

import { extensionInfoFor, isHardBlockedFilename, MAX_FILE_SIZE, MAX_SIZE_LABEL } from "@/config/attachment-types";
import { detectDangerousSignature, looksLikeBinary } from "./magic-bytes";

export type ClientCheckResult = { ok: true } | { ok: false; reason: string };

const SAMPLE_BYTES = 64;

export async function clientPreCheckFile(file: File): Promise<ClientCheckResult> {
  const info = extensionInfoFor(file.name);
  if (!info) {
    return { ok: false, reason: `${file.type || "This file type"} isn't supported.` };
  }
  if (isHardBlockedFilename(file.name)) {
    return { ok: false, reason: "This file type isn't allowed." };
  }
  if (file.size > MAX_FILE_SIZE) {
    return { ok: false, reason: `Exceeds the ${MAX_SIZE_LABEL} limit.` };
  }

  const sample = new Uint8Array(await file.slice(0, SAMPLE_BYTES).arrayBuffer());

  const dangerous = detectDangerousSignature(sample);
  if (dangerous) {
    return { ok: false, reason: `File appears to be an executable (${dangerous}), not a ${info.label} file.` };
  }

  if (info.category === "text" && looksLikeBinary(sample)) {
    return { ok: false, reason: "File doesn't look like a valid text file — it may be corrupted or mislabeled." };
  }

  return { ok: true };
}
