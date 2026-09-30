import { WIKI_FONTS } from "./_wiki-export-style";

// Task 400 — the Wiki's own fonts (Inter / Space Grotesk / JetBrains Mono, all SIL OFL — license
// texts ship alongside in public/fonts/wiki-export/) as static TTFs, fetched on first PDF export
// and cached for the session. The PDF embeds them so it matches the Wiki regardless of what the
// reader has installed; a face that fails to load is simply absent and the render falls through
// the CSS stack to `sans-serif` (Helvetica in jspdf). The Word export doesn't use these — see
// DOCX_FONTS in `_wiki-export-docx-styles.ts`.

export type WikiFontFace = {
  family: string;
  weight: 400 | 700;
  style: "normal" | "italic";
  file: string;
};

export type LoadedWikiFont = WikiFontFace & { data: ArrayBuffer };

const FONT_BASE = "/fonts/wiki-export/";

export const WIKI_FONT_FACES: WikiFontFace[] = [
  { family: WIKI_FONTS.body, weight: 400, style: "normal", file: "Inter-400.ttf" },
  { family: WIKI_FONTS.body, weight: 700, style: "normal", file: "Inter-700.ttf" },
  { family: WIKI_FONTS.body, weight: 400, style: "italic", file: "Inter-400-italic.ttf" },
  { family: WIKI_FONTS.body, weight: 700, style: "italic", file: "Inter-700-italic.ttf" },
  { family: WIKI_FONTS.heading, weight: 700, style: "normal", file: "SpaceGrotesk-700.ttf" },
  { family: WIKI_FONTS.mono, weight: 400, style: "normal", file: "JetBrainsMono-400.ttf" },
  { family: WIKI_FONTS.mono, weight: 700, style: "normal", file: "JetBrainsMono-700.ttf" },
];

let cache: Promise<LoadedWikiFont[]> | null = null;

async function fetchFace(face: WikiFontFace): Promise<LoadedWikiFont> {
  const res = await fetch(`${FONT_BASE}${face.file}`);
  if (!res.ok) throw new Error(`Font fetch failed (${res.status}): ${face.file}`);
  return { ...face, data: await res.arrayBuffer() };
}

// Resolves with every face that loaded; never rejects (a missing face means fallback, not failure).
export function loadWikiFonts(): Promise<LoadedWikiFont[]> {
  cache ??= Promise.allSettled(WIKI_FONT_FACES.map(fetchFace)).then((results) => {
    const loaded = results.flatMap((r) => (r.status === "fulfilled" ? [r.value] : []));
    if (loaded.length < WIKI_FONT_FACES.length) {
      console.warn(`[wiki-export] ${WIKI_FONT_FACES.length - loaded.length} font face(s) unavailable — using fallback fonts`);
    }
    // Retry on the next export if anything was missing (e.g. a transient network error).
    if (loaded.length < WIKI_FONT_FACES.length) cache = null;
    return loaded;
  });
  return cache;
}

// `@font-face` rules for the faces that loaded (same URLs, so the browser serves them from its
// HTTP cache). Declared as CSS rather than via the FontFace API because html2canvas lays text out
// in a cloned iframe that copies stylesheets but not JS-registered FontFace objects — a face
// missing from the clone makes browser layout and PDF glyphs disagree (words collide).
export function fontFaceCss(fonts: LoadedWikiFont[]): string {
  return fonts
    .map((f) => `@font-face{font-family:"${f.family}";font-weight:${f.weight};font-style:${f.style};src:url("${FONT_BASE}${f.file}") format("truetype");}`)
    .join("\n");
}

export function toBase64(data: ArrayBuffer): string {
  const bytes = new Uint8Array(data);
  let binary = "";
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(binary);
}
