// Task 451 — one resolver over the extension-resolved upload types (fonts + design files).
// Extension wins over whatever file.type claims (including empty / octet-stream); every other
// file keeps file.type unchanged, so the strict MIME whitelist is untouched for them.
import { FONT_EXTENSION_MIME } from "@/config/font-types";
import { DESIGN_EXTENSION_MIME } from "@/config/design-file-types";

const EXTENSION_MIME: Record<string, string> = { ...FONT_EXTENSION_MIME, ...DESIGN_EXTENSION_MIME };

// Canonical MIME for a file name's extension, or null when it isn't one of the types above.
// Own-property lookup so names like "constructor" can't hit Object.prototype.
export function extensionMimeForName(name: string): string | null {
  const dot = name.lastIndexOf(".");
  if (dot < 0) return null;
  const ext = name.slice(dot + 1).toLowerCase();
  return Object.prototype.hasOwnProperty.call(EXTENSION_MIME, ext) ? EXTENSION_MIME[ext] : null;
}

export function resolveUploadMime(file: { name: string; type: string }): string {
  return extensionMimeForName(file.name) ?? file.type;
}
