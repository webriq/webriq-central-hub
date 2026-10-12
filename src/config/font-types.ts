// Task 451 — font file types, defined once and spread into the customer-asset upload allowlists
// (customer-asset-storage.ts server-side, _file-upload-constants.ts client-side). Mirrors
// powerpoint-types.ts. Browsers report font MIME types inconsistently (OS-registry dependent:
// `font/ttf`, `application/x-font-ttf`, `application/font-sfnt`, or empty for .eot/.woff2), so
// fonts are recognised by EXTENSION and uploaded under one canonical MIME. The extension
// fallback applies to these extensions only — every other type keeps the strict file.type gate.

export const FONT_EXTENSION_MIME = {
  ttf: "font/ttf",
  otf: "font/otf",
  woff: "font/woff",
  woff2: "font/woff2",
  eot: "application/vnd.ms-fontobject",
  ttc: "font/collection", // .ttc and .otc share one MIME
  otc: "font/collection",
} as const;

export const FONT_MIME_TYPES: string[] = [
  ...new Set<string>(Object.values(FONT_EXTENSION_MIME)),
  // legacy / OS-registry variants — accepted server-side so a stale client or the legacy
  // multipart route doesn't 400
  "application/x-font-ttf", "application/x-font-truetype", "application/x-font-otf", "application/x-font-opentype",
  "application/font-sfnt", "application/font-woff", "application/font-woff2", "application/x-font-woff",
];

// MIME -> label for surfaces that build their "allowed types" copy from MIME strings. The
// canonical MIMEs carry the labels; the legacy variants map to the same labels.
export const FONT_MIME_LABELS: Record<string, string> = {
  "font/ttf": "TTF", "font/otf": "OTF", "font/woff": "WOFF", "font/woff2": "WOFF2",
  "application/vnd.ms-fontobject": "EOT", "font/collection": "TTC/OTC",
  "application/x-font-ttf": "TTF", "application/x-font-truetype": "TTF",
  "application/x-font-otf": "OTF", "application/x-font-opentype": "OTF", "application/font-sfnt": "TTF",
  "application/font-woff": "WOFF", "application/x-font-woff": "WOFF", "application/font-woff2": "WOFF2",
};

// Canonical font MIME for a file name, or null if it isn't a font extension.
export function fontMimeForName(name: string): string | null {
  const dot = name.lastIndexOf(".");
  if (dot < 0) return null;
  const ext = name.slice(dot + 1).toLowerCase();
  return Object.prototype.hasOwnProperty.call(FONT_EXTENSION_MIME, ext)
    ? FONT_EXTENSION_MIME[ext as keyof typeof FONT_EXTENSION_MIME]
    : null;
}

// The MIME to validate and upload under: the canonical font MIME when the extension says font
// (whatever file.type claims, including empty), otherwise file.type unchanged.
export function resolveUploadMime(file: { name: string; type: string }): string {
  return fontMimeForName(file.name) ?? file.type;
}
