import type { INumberingOptions, IStylesOptions } from "docx";
import { WIKI_COLORS, WIKI_SPACING, px } from "./_wiki-export-style";
import { OL_REFERENCE, UL_REFERENCE, type Docx, type DocxFonts, type Marks } from "./_wiki-export-docx-types";

// Task 400 — Word typography mirroring the Wiki read view (tokens from `_wiki-export-style.ts`).
// Every paragraph and run carries its spacing/font/size/color explicitly (paragraphSpacing,
// blockMarks) — Pages ignores document-default run properties and substitutes a serif — while
// the named styles below still exist so Word's navigation pane / heading outline work.

// Fonts written into the .docx. A Word file has no working font fallback: Pages, TextEdit and
// Quick Look ignore embedded fonts, a font-table family class/altName, and "A;B" name lists, and
// substitute a serif (Times) for any font the reader doesn't have installed — verified against
// macOS's Word importer. So the .docx names fonts every reader has: Arial for text (installed with
// macOS, Windows, Office and Google Docs), Courier New for code. Sizes, colors and spacing still
// follow the Wiki; the PDF/HTML exports keep the Wiki's own Inter / Space Grotesk / JetBrains Mono.
export const DOCX_FONTS: DocxFonts = { body: "Arial", heading: "Arial", mono: "Courier New" };

export type BlockKind = "body" | "title" | "h2" | "h3";

// Base run typography per block kind — only the Wiki's styled headings (title/h2/h3) differ from
// body text; h1 and h4–h6 inside page content render as body text in the read view (Tailwind
// preflight), so they map to "body" too.
export function blockMarks(fonts: DocxFonts, kind: BlockKind): Marks {
  const { body, title, h2, h3 } = WIKI_SPACING;
  const heading = (size: number, tracking = 0): Marks => ({
    font: fonts.heading, size: px.toHalfPoints(size), bold: true, color: WIKI_COLORS.heading,
    tracking: Math.round(tracking * size * 0.75 * 20),
  });
  if (kind === "title") return heading(title.size, title.tracking);
  if (kind === "h2") return heading(h2.size, h2.tracking);
  if (kind === "h3") return heading(h3.size);
  return { font: fonts.body, size: px.toHalfPoints(body.size), color: WIKI_COLORS.body };
}

export function paragraphSpacing(beforePx: number, afterPx: number, lineHeight: number = WIKI_SPACING.body.lineHeight) {
  return { before: px.toTwips(beforePx), after: px.toTwips(afterPx), line: Math.round(240 * lineHeight) };
}

export function buildDocxStyles(fonts: DocxFonts): IStylesOptions {
  const { title, h2, h3 } = WIKI_SPACING;
  const run = (kind: BlockKind) => {
    const m = blockMarks(fonts, kind);
    return { font: m.font, size: m.size, bold: m.bold, color: m.color, characterSpacing: m.tracking };
  };
  return {
    default: {
      document: { run: run("body"), paragraph: { spacing: paragraphSpacing(0, 0) } },
      title: { run: run("title"), paragraph: { spacing: paragraphSpacing(0, title.after, 1.2), keepNext: true } },
      heading2: { run: run("h2"), paragraph: { spacing: paragraphSpacing(h2.before, h2.after), keepNext: true } },
      heading3: { run: run("h3"), paragraph: { spacing: paragraphSpacing(h3.before, h3.after), keepNext: true } },
      hyperlink: { run: { color: WIKI_COLORS.link, underline: {} } },
    },
  };
}

const BULLETS = ["•", "◦", "▪"]; // disc/circle/square by depth, like the browser

export function buildDocxNumbering(docx: Docx, fonts: DocxFonts): INumberingOptions {
  const step = px.toTwips(WIKI_SPACING.list.indent);
  const body = blockMarks(fonts, "body");
  const levels = (ordered: boolean) => Array.from({ length: 9 }, (_, level) => ({
    level,
    format: ordered ? docx.LevelFormat.DECIMAL : docx.LevelFormat.BULLET,
    text: ordered ? `%${level + 1}.` : BULLETS[level % BULLETS.length],
    alignment: docx.AlignmentType.START,
    suffix: docx.LevelSuffix.TAB,
    // The marker itself in body typography (not the app's default font).
    style: {
      run: { font: body.font, size: body.size, color: body.color },
      paragraph: { indent: { left: step * (level + 1), hanging: step } },
    },
  }));
  return {
    config: [
      { reference: OL_REFERENCE, levels: levels(true) },
      { reference: UL_REFERENCE, levels: levels(false) },
    ],
  };
}
