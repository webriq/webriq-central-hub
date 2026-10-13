// Task 451 addendum — design source file types (.eps .psd .ai .fig), same extension-resolved
// approach as font-types.ts: browsers report these inconsistently (.fig has no registered MIME and
// arrives empty/octet-stream; .ai is often reported as application/postscript; .psd varies with
// whether Photoshop is installed), so the extension decides the canonical MIME. Staff-only
// customer-asset surfaces; no content scanning (deferred task 373 — note .eps is PostScript).

export const DESIGN_EXTENSION_MIME = {
  eps: "application/postscript",
  psd: "image/vnd.adobe.photoshop",
  ai: "application/illustrator",
  fig: "application/x-figma",
} as const;

export const DESIGN_MIME_TYPES: string[] = [
  ...Object.values(DESIGN_EXTENSION_MIME),
  // legacy / OS-registry variants — accepted server-side so a stale client or the legacy
  // multipart route doesn't 400
  "application/eps", "application/x-eps", "image/eps", "image/x-eps",
  "application/x-photoshop", "application/photoshop", "image/psd", "image/x-photoshop",
  "application/vnd.adobe.illustrator", "application/x-illustrator",
];

export const DESIGN_MIME_LABELS: Record<string, string> = {
  "application/postscript": "EPS", "application/eps": "EPS", "application/x-eps": "EPS", "image/eps": "EPS", "image/x-eps": "EPS",
  "image/vnd.adobe.photoshop": "PSD", "application/x-photoshop": "PSD", "application/photoshop": "PSD", "image/psd": "PSD", "image/x-photoshop": "PSD",
  "application/illustrator": "AI", "application/vnd.adobe.illustrator": "AI", "application/x-illustrator": "AI",
  "application/x-figma": "FIG",
};

// Photoshop MIMEs start with `image/` but browsers can't render them — previews/thumbnails must
// not feed them to an <img>. Use this instead of a bare `mime.startsWith("image/")`.
const NOT_BROWSER_RENDERABLE = new Set(["image/vnd.adobe.photoshop", "image/psd", "image/x-photoshop", "image/eps", "image/x-eps"]);
export function isBrowserImage(mime: string): boolean {
  return mime.startsWith("image/") && !NOT_BROWSER_RENDERABLE.has(mime);
}
