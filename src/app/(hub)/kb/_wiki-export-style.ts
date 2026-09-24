// Task 400 — the Wiki read view's typography + spacing as plain tokens (CSS px), mirrored from
// `_wiki-doc-panel.tsx`'s read-mode Tailwind classes, so every export format (HTML, PDF, Word)
// is laid out from one spec. If the read view's styling changes, update these tokens with it.

export const WIKI_FONTS = { body: "Inter", heading: "Space Grotesk", mono: "JetBrains Mono" } as const;

// Free (OFL) sans-serif families listed after the Wiki fonts in the HTML/PDF CSS font stacks.
export const WIKI_FALLBACK_FONTS = { sans: "Noto Sans", mono: "Noto Sans Mono" } as const;

// Hex without "#" (docx's format); CSS adds the "#".
export const WIKI_COLORS = {
  heading: "0B1533",
  body: "3A4565",
  link: "007BFF",
  quoteText: "243B6B",
  quoteBg: "EEF3FF",
  quoteBorder: "D7E3FF",
  codeBg: "0F172A",
  codeText: "D7E0F7",
  thText: "5F6A88",
  thBg: "FAFBFE",
  rule: "EDF0F7",
} as const;

export const WIKI_SPACING = {
  contentWidth: 680, // px — the read view's 760px column minus its 40px side padding
  body: { size: 13, lineHeight: 1.7, paragraphGap: 14 },
  title: { size: 22, tracking: -0.015, after: 12 },
  h2: { size: 15, tracking: -0.01, before: 28, after: 10 },
  h3: { size: 13, before: 20, after: 8 },
  list: { indent: 20, itemGap: 4 },
  quote: { padX: 14, padY: 12, gap: 14 },
  code: { size: 12.5, lineHeight: 1.6, padX: 16, padY: 14, gap: 14 },
  th: { size: 9.5, tracking: 0.09, padX: 10, padY: 8 },
  image: { gap: 12, maxWidth: 600 },
} as const;

// Page setup shared by the PDF and Word exports: A4 with 48pt margins, which leaves a ~665px
// text column — close to the read view's 680px.
export const WIKI_PAGE = { widthPt: 595.28, heightPt: 841.89, marginPt: 48 } as const;

// Unit conversions for docx (CSS px → points → Word units).
export const px = {
  toHalfPoints: (value: number) => Math.round(value * 0.75 * 2),
  toTwips: (value: number) => Math.round(value * 0.75 * 20),
  toPoints: (value: number) => Math.round(value * 0.75),
};

const stack = (family: string, fallback: string, generic: string) => `"${family}", "${fallback}", ${generic}`;

// Stylesheet for the HTML + PDF exports, scoped under `.wiki-export` so the PDF renderer can
// inject it into the live page without leaking onto the Hub UI.
export function buildWikiCss(): string {
  const { body, title, h2, h3, list, quote, code, th, image } = WIKI_SPACING;
  const c = (key: keyof typeof WIKI_COLORS) => `#${WIKI_COLORS[key]}`;
  const sans = stack(WIKI_FONTS.body, WIKI_FALLBACK_FONTS.sans, "sans-serif");
  const heading = stack(WIKI_FONTS.heading, WIKI_FALLBACK_FONTS.sans, "sans-serif");
  const mono = stack(WIKI_FONTS.mono, WIKI_FALLBACK_FONTS.mono, "monospace");
  return [
    `.wiki-export{font-family:${sans};font-size:${body.size}px;line-height:${body.lineHeight};color:${c("body")};max-width:${WIKI_SPACING.contentWidth}px;margin:0 auto;}`,
    `.wiki-export .wiki-export-title{font-family:${heading};font-size:${title.size}px;font-weight:700;letter-spacing:${title.tracking}em;line-height:1.2;color:${c("heading")};margin:0 0 ${title.after}px;}`,
    `.wiki-export h2{font-family:${heading};font-size:${h2.size}px;font-weight:700;letter-spacing:${h2.tracking}em;color:${c("heading")};margin:${h2.before}px 0 ${h2.after}px;}`,
    `.wiki-export h3{font-family:${heading};font-size:${h3.size}px;font-weight:700;color:${c("heading")};margin:${h3.before}px 0 ${h3.after}px;}`,
    // The read view gets these from Tailwind's preflight, which the PDF render strips (see
    // isolateExportStyles) — content h1 and h4–h6 read as body text there, not as UA headings.
    `.wiki-export h1:not(.wiki-export-title),.wiki-export h4,.wiki-export h5,.wiki-export h6{font-size:inherit;font-weight:inherit;letter-spacing:normal;margin:0;}`,
    `.wiki-export p{margin:0;}.wiki-export p+p{margin-top:${body.paragraphGap}px;}`,
    `.wiki-export ul,.wiki-export ol{padding-left:${list.indent}px;margin:0;}.wiki-export ul{list-style:disc;}.wiki-export ol{list-style:decimal;}.wiki-export li{margin:${list.itemGap}px 0;}`,
    // PDF only: list markers drawn as inline text on the item's first line (`_wiki-export-pdf-markers.ts`).
    `.wiki-export .wiki-export-marker{display:inline-block;width:${list.indent}px;margin-left:-${list.indent}px;padding-right:6px;box-sizing:border-box;text-align:right;font:inherit;font-weight:400;font-style:normal;letter-spacing:normal;color:${c("body")};}`,
    `.wiki-export a{color:${c("link")};text-decoration:underline;}`,
    `.wiki-export blockquote{background:${c("quoteBg")};border:1px solid ${c("quoteBorder")};border-radius:10px;padding:${quote.padY}px ${quote.padX}px;margin:${quote.gap}px 0;color:${c("quoteText")};}`,
    `.wiki-export pre{background:${c("codeBg")};color:${c("codeText")};border-radius:10px;padding:${code.padY}px ${code.padX}px;margin:${code.gap}px 0;font-size:${code.size}px;line-height:${code.lineHeight};white-space:pre-wrap;word-break:break-word;}`,
    `.wiki-export code{font-family:${mono};font-size:${code.size}px;}`,
    `.wiki-export img{max-width:100%;border-radius:10px;margin:${image.gap}px 0;}`,
    `.wiki-export table{width:100%;border-collapse:collapse;margin:${quote.gap}px 0;}`,
    `.wiki-export th{font-size:${th.size}px;font-weight:700;text-transform:uppercase;letter-spacing:${th.tracking}em;color:${c("thText")};background:${c("thBg")};text-align:left;padding:${th.padY}px ${th.padX}px;border-bottom:1px solid ${c("rule")};}`,
    `.wiki-export td{padding:${th.padY}px ${th.padX}px;border-bottom:1px solid ${c("rule")};}`,
    `.wiki-export th p,.wiki-export td p{margin:0;}`,
    `.wiki-export hr{border:0;border-top:1px solid ${c("rule")};margin:${h2.before}px 0;}`,
    `@media print{.wiki-export h2,.wiki-export h3{break-after:avoid;}.wiki-export tr,.wiki-export img,.wiki-export pre,.wiki-export blockquote{break-inside:avoid;}}`,
  ].join("\n");
}
