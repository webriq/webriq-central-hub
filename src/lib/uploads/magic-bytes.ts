// Minimal, dependency-free magic-byte signatures shared by the client-side pre-check
// (client-signature-check.ts, browser bundle — must stay dependency-free) and the server-side
// authoritative checker (verify-file.ts, which additionally uses the `file-type` package for
// precise binary-format disambiguation). Kept as one module so the two checks can't drift apart
// (task 273, Requirement C).
//
// This is heuristic corruption/mismatch/spoofing detection, NOT virus-signature scanning — it
// has no knowledge of known-malware signatures, only of executable/script binary formats and
// plausible-text-vs-binary structure.

export type SignatureMatch = { category: "image" | "pdf" | "zip" | "ole" | "rar" | "video"; label: string };

const KNOWN_SIGNATURES: { bytes: number[]; offset?: number; category: SignatureMatch["category"]; label: string }[] = [
  { bytes: [0xff, 0xd8, 0xff], category: "image", label: "JPEG" },
  { bytes: [0x89, 0x50, 0x4e, 0x47], category: "image", label: "PNG" },
  { bytes: [0x47, 0x49, 0x46, 0x38], category: "image", label: "GIF" },
  { bytes: [0x52, 0x49, 0x46, 0x46], category: "image", label: "WEBP (RIFF container)" },
  { bytes: [0x25, 0x50, 0x44, 0x46], category: "pdf", label: "PDF" },
  { bytes: [0x50, 0x4b, 0x03, 0x04], category: "zip", label: "ZIP/Office" },
  { bytes: [0x50, 0x4b, 0x05, 0x06], category: "zip", label: "ZIP (empty archive)" },
  { bytes: [0x50, 0x4b, 0x07, 0x08], category: "zip", label: "ZIP (spanned archive)" },
  { bytes: [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1], category: "ole", label: "Legacy DOC/XLS (OLE)" },
  { bytes: [0x52, 0x61, 0x72, 0x21, 0x1a, 0x07], category: "rar", label: "RAR" },
  // MP4/MOV (ISO base media format) — the "ftyp" box marker sits at byte offset 4, not 0; the
  // first 4 bytes are a big-endian box-size field that varies per file.
  { bytes: [0x66, 0x74, 0x79, 0x70], offset: 4, category: "video", label: "MP4/MOV" },
  // WebM/MKV — both are EBML-container profiles sharing this header.
  { bytes: [0x1a, 0x45, 0xdf, 0xa3], category: "video", label: "WebM/MKV" },
];

const DANGEROUS_SIGNATURES: { bytes: number[]; label: string }[] = [
  { bytes: [0x4d, 0x5a], label: "Windows executable (PE)" },
  { bytes: [0x7f, 0x45, 0x4c, 0x46], label: "Linux executable (ELF)" },
  { bytes: [0xfe, 0xed, 0xfa, 0xce], label: "macOS executable (Mach-O)" },
  { bytes: [0xfe, 0xed, 0xfa, 0xcf], label: "macOS executable (Mach-O)" },
  { bytes: [0xce, 0xfa, 0xed, 0xfe], label: "macOS executable (Mach-O)" },
  { bytes: [0xcf, 0xfa, 0xed, 0xfe], label: "macOS executable (Mach-O)" },
  { bytes: [0xca, 0xfe, 0xba, 0xbe], label: "macOS universal binary / Java class" },
];

// More than 1% NUL bytes in a sample isn't plausible for real UTF-8/ASCII text — used to catch
// a binary file disguised with a text extension (.txt, .md, .json, .html, .css, .js, .ts, .csv).
const TEXT_SAFE_MAX_NULL_RATIO = 0.01;

function bytesMatchAt(bytes: Uint8Array, sig: number[], offset: number): boolean {
  if (bytes.length < offset + sig.length) return false;
  for (let i = 0; i < sig.length; i++) if (bytes[offset + i] !== sig[i]) return false;
  return true;
}

export function detectDangerousSignature(bytes: Uint8Array): string | null {
  for (const sig of DANGEROUS_SIGNATURES) {
    if (bytesMatchAt(bytes, sig.bytes, 0)) return sig.label;
  }
  return null;
}

export function detectKnownSignature(bytes: Uint8Array): SignatureMatch | null {
  for (const sig of KNOWN_SIGNATURES) {
    if (bytesMatchAt(bytes, sig.bytes, sig.offset ?? 0)) return { category: sig.category, label: sig.label };
  }
  return null;
}

export function looksLikeBinary(bytes: Uint8Array): boolean {
  if (bytes.length === 0) return false;
  let nulCount = 0;
  for (let i = 0; i < bytes.length; i++) {
    if (bytes[i] === 0x00) nulCount++;
  }
  return nulCount / bytes.length > TEXT_SAFE_MAX_NULL_RATIO;
}
