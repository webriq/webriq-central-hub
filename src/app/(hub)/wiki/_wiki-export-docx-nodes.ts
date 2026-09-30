import type { FileChild, IParagraphOptions, Paragraph, ParagraphChild } from "docx";
import { WIKI_COLORS, WIKI_SPACING, px } from "./_wiki-export-style";
import { blockquoteToParagraphs, codeBlockToParagraph, dividerParagraph, tableToDocx } from "./_wiki-export-docx-boxes";
import { blockMarks, paragraphSpacing } from "./_wiki-export-docx-styles";
import { OL_REFERENCE, UL_REFERENCE, type Docx, type DocxCtx, type DocxFonts, type DocxImage, type Marks } from "./_wiki-export-docx-types";

// Task 400 — pure HTML → docx walker for "Export as Word": inline runs, paragraphs, headings and
// lists. Every run and paragraph carries its typography/spacing explicitly (see
// `_wiki-export-docx-styles.ts`); spacing mirrors the read view's CSS (`p + p` gap, heading
// margins, list-item gaps). Boxed blocks (code, quote, table, divider) live in `-docx-boxes.ts`.
// Input whitespace is already collapsed (`_wiki-export-whitespace.ts`).

const INLINE_MARKS: Record<string, Marks> = {
  STRONG: { bold: true }, B: { bold: true }, EM: { italics: true }, I: { italics: true },
  U: { underline: true }, S: { strike: true }, DEL: { strike: true }, STRIKE: { strike: true }, CODE: { code: true },
};
const BLOCK_TAGS = new Set(["P", "H1", "H2", "H3", "H4", "H5", "H6", "UL", "OL", "BLOCKQUOTE", "PRE", "TABLE", "HR", "DIV", "SECTION", "ARTICLE", "HEADER", "MAIN", "FOOTER", "NAV", "ASIDE", "FIGURE"]);

function textRun(text: string, marks: Marks, ctx: DocxCtx) {
  return new ctx.docx.TextRun({
    text,
    bold: marks.bold,
    italics: marks.italics,
    strike: marks.strike,
    underline: marks.underline || marks.link ? {} : undefined,
    color: marks.link ? WIKI_COLORS.link : marks.color,
    font: marks.code ? ctx.fonts.mono : marks.font,
    size: marks.code ? px.toHalfPoints(WIKI_SPACING.code.size) : marks.size,
    characterSpacing: marks.tracking || undefined,
  });
}

function imageRun(src: string, ctx: DocxCtx): ParagraphChild {
  const img = ctx.images.get(src);
  if (!img) return new ctx.docx.TextRun({ text: "[image unavailable]", italics: true, color: "94A3B8", font: ctx.body.font, size: ctx.body.size });
  return new ctx.docx.ImageRun({ type: img.type, data: img.data, transformation: { width: img.width, height: img.height } });
}

function inlineRuns(node: Node, marks: Marks, ctx: DocxCtx): ParagraphChild[] {
  if (node.nodeType === Node.TEXT_NODE) {
    const text = node.textContent ?? "";
    return text ? [textRun(text, marks, ctx)] : [];
  }
  if (!(node instanceof Element)) return [];

  const tag = node.tagName;
  if (tag === "BR") return [new ctx.docx.TextRun({ break: 1 })];
  if (tag === "IMG") return [imageRun(node.getAttribute("src") ?? "", ctx)];

  const next = { ...marks, ...INLINE_MARKS[tag], ...(tag === "A" ? { link: true } : {}) };
  const children = Array.from(node.childNodes).flatMap((child) => inlineRuns(child, next, ctx));

  const href = node.getAttribute("href");
  if (tag === "A" && href) return [new ctx.docx.ExternalHyperlink({ link: href, children })];
  return children;
}

function paragraphFrom(el: Element, marks: Marks, ctx: DocxCtx, extra: Omit<IParagraphOptions, "children"> = {}): Paragraph {
  const imageOnly = el.tagName === "IMG" || (el.children.length === 1 && el.children[0].tagName === "IMG" && !el.textContent?.trim());
  // Read view: paragraphs have no margin except `p + p { margin-top: 14px }`; images get 12px.
  const { image, body } = WIKI_SPACING;
  const before = imageOnly ? image.gap : el.tagName === "P" && el.previousElementSibling?.tagName === "P" ? body.paragraphGap : 0;
  return new ctx.docx.Paragraph({
    children: ctx.inline(el, marks),
    spacing: paragraphSpacing(before, imageOnly ? image.gap : 0),
    ...extra,
  });
}

function headingParagraph(el: Element, ctx: DocxCtx): Paragraph {
  const { h2, h3 } = WIKI_SPACING;
  const kind = el.tagName === "H2" ? "h2" : "h3";
  const gap = kind === "h2" ? h2 : h3;
  return new ctx.docx.Paragraph({
    heading: kind === "h2" ? ctx.docx.HeadingLevel.HEADING_2 : ctx.docx.HeadingLevel.HEADING_3,
    keepNext: true,
    spacing: paragraphSpacing(gap.before, gap.after),
    children: ctx.inline(el, blockMarks(ctx.fonts, kind)),
  });
}

function listToParagraphs(list: Element, level: number, instance: number, marks: Marks, ctx: DocxCtx): Paragraph[] {
  const reference = list.tagName === "OL" ? OL_REFERENCE : UL_REFERENCE;
  const indent = px.toTwips(WIKI_SPACING.list.indent) * (level + 1);
  const out: Paragraph[] = [];
  for (const li of Array.from(list.children).filter((c) => c.tagName === "LI")) {
    const nested = Array.from(li.children).filter((c) => c.tagName === "UL" || c.tagName === "OL");
    const inline = Array.from(li.childNodes).filter((c) => !nested.includes(c as Element));
    const children = inline.flatMap((c, i) => {
      const runs = ctx.inline(c, marks);
      // Tiptap wraps each <li>'s text in <p>; separate multiple paragraphs with a line break.
      return i > 0 && c instanceof Element && c.tagName === "P" ? [new ctx.docx.TextRun({ break: 1 }), ...runs] : runs;
    });
    out.push(new ctx.docx.Paragraph({
      children,
      numbering: { reference, level, instance },
      spacing: paragraphSpacing(WIKI_SPACING.list.itemGap, 0),
      // Explicit tab stop at the text indent, so apps that ignore the hanging indent (Pages) still
      // start the text right after the marker instead of at a far default tab stop.
      tabStops: [{ type: ctx.docx.TabStopType.LEFT, position: indent }],
    }));
    for (const sub of nested) {
      out.push(...listToParagraphs(sub, level + 1, ctx.nextListInstance++, marks, ctx));
    }
  }
  return out;
}

function blockToDocx(el: Element, marks: Marks, ctx: DocxCtx): FileChild[] {
  const tag = el.tagName;
  switch (tag) {
    case "H2": case "H3": return [headingParagraph(el, ctx)];
    case "P": case "H1": case "H4": case "H5": case "H6": return [paragraphFrom(el, marks, ctx)];
    case "UL": case "OL": return listToParagraphs(el, 0, ctx.nextListInstance++, marks, ctx);
    case "BLOCKQUOTE": return blockquoteToParagraphs(el, marks, ctx);
    case "PRE": return [codeBlockToParagraph(el, ctx)];
    case "TABLE": return [tableToDocx(el as HTMLTableElement, ctx)];
    case "HR": return [dividerParagraph(ctx)];
  }
  // Wrapper elements (div/section/header/main…) recurse; anything else is inline content at block level.
  const hasBlockChild = Array.from(el.children).some((c) => BLOCK_TAGS.has(c.tagName));
  return hasBlockChild ? blocksFrom(el, ctx, marks) : [paragraphFrom(el, marks, ctx)];
}

function blocksFrom(parent: Element, ctx: DocxCtx, marks: Marks): FileChild[] {
  return Array.from(parent.childNodes).flatMap((node) => {
    if (node instanceof Element) return blockToDocx(node, marks, ctx);
    const text = node.nodeType === Node.TEXT_NODE ? node.textContent?.trim() : "";
    return text ? [new ctx.docx.Paragraph({ spacing: paragraphSpacing(0, 0), children: [textRun(text, marks, ctx)] })] : [];
  });
}

export function htmlToDocxBlocks(root: Element, docx: Docx, images: Map<string, DocxImage>, fonts: DocxFonts): FileChild[] {
  const body = blockMarks(fonts, "body");
  const ctx: DocxCtx = { docx, images, fonts, body, nextListInstance: 1, inline: (node, marks) => inlineRuns(node, marks, ctx) };
  return blocksFrom(root, ctx, body);
}
