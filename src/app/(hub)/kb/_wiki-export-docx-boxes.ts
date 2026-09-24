import type { FileChild, IBorderOptions, Paragraph } from "docx";
import { WIKI_COLORS, WIKI_PAGE, WIKI_SPACING, px } from "./_wiki-export-style";
import { paragraphSpacing } from "./_wiki-export-docx-styles";
import type { DocxCtx, Marks } from "./_wiki-export-docx-types";

// Task 400 — the Wiki's "boxed" blocks (code block, blockquote, table, divider) as Word
// equivalents. Word has no padding or rounded corners, so padding is emulated with a same-color
// border whose `space` (pt) insets the text, plus a matching indent so the box's outer edge sits
// on the text margin like the Wiki's. Consecutive paragraphs with identical borders merge into
// one box in Word.

function boxBorders(ctx: DocxCtx, color: string, padX: number, padY: number) {
  const side = (space: number): IBorderOptions => ({ style: ctx.docx.BorderStyle.SINGLE, size: 6, color, space });
  const x = px.toPoints(padX);
  const y = px.toPoints(padY);
  return { top: side(y), bottom: side(y), left: side(x), right: side(x) };
}

export function codeBlockToParagraph(pre: Element, ctx: DocxCtx): Paragraph {
  const { code } = WIKI_SPACING;
  const lines = (pre.textContent ?? "").replace(/\n$/, "").split("\n");
  return new ctx.docx.Paragraph({
    shading: { type: ctx.docx.ShadingType.CLEAR, fill: WIKI_COLORS.codeBg, color: "auto" },
    border: boxBorders(ctx, WIKI_COLORS.codeBg, code.padX, code.padY),
    indent: { left: px.toTwips(code.padX), right: px.toTwips(code.padX) },
    spacing: paragraphSpacing(code.gap + code.padY, code.gap + code.padY, code.lineHeight),
    children: lines.map((line, i) => new ctx.docx.TextRun({
      text: line,
      break: i > 0 ? 1 : undefined,
      font: ctx.fonts.mono,
      size: px.toHalfPoints(code.size),
      color: WIKI_COLORS.codeText,
    })),
  });
}

export function blockquoteToParagraphs(quote: Element, marks: Marks, ctx: DocxCtx): Paragraph[] {
  const { quote: q } = WIKI_SPACING;
  const parts = quote.children.length > 0 ? Array.from(quote.children) : [quote];
  return parts.map((part, i) => new ctx.docx.Paragraph({
    shading: { type: ctx.docx.ShadingType.CLEAR, fill: WIKI_COLORS.quoteBg, color: "auto" },
    border: boxBorders(ctx, WIKI_COLORS.quoteBorder, q.padX, q.padY),
    indent: { left: px.toTwips(q.padX), right: px.toTwips(q.padX) },
    spacing: paragraphSpacing(i === 0 ? q.gap + q.padY : WIKI_SPACING.body.paragraphGap, i === parts.length - 1 ? q.gap + q.padY : 0),
    children: ctx.inline(part, { ...marks, color: WIKI_COLORS.quoteText }),
  }));
}

// One tight paragraph per cell (the Wiki's cells have no inner paragraph spacing; Tiptap's
// `<td><p>` wrapper is flattened by the inline walker).
function cellParagraph(cell: Element, ctx: DocxCtx) {
  if (cell.tagName !== "TH") return new ctx.docx.Paragraph({ spacing: paragraphSpacing(0, 0), children: ctx.inline(cell, ctx.body) });
  const { th } = WIKI_SPACING;
  return new ctx.docx.Paragraph({
    spacing: paragraphSpacing(0, 0),
    children: [new ctx.docx.TextRun({
      text: (cell.textContent ?? "").trim(),
      font: ctx.body.font,
      bold: true,
      allCaps: true,
      size: px.toHalfPoints(th.size),
      color: WIKI_COLORS.thText,
      characterSpacing: Math.round(th.tracking * th.size * 0.75 * 20),
    })],
  });
}

export function tableToDocx(table: HTMLTableElement, ctx: DocxCtx): FileChild {
  const { Table, TableRow, TableCell, TableLayoutType, WidthType, ShadingType, BorderStyle } = ctx.docx;
  const { th } = WIKI_SPACING;
  const rule: IBorderOptions = { style: BorderStyle.SINGLE, size: 4, color: WIKI_COLORS.rule };
  const none: IBorderOptions = { style: BorderStyle.NONE, size: 0, color: "auto" };
  // Word collapses columns to their narrowest content unless every width is explicit, so the
  // text column (page minus margins) is split evenly — the read view's `width:100%` table.
  const columnCount = Math.max(1, ...Array.from(table.rows, (row) => row.cells.length));
  const columnWidth = Math.floor(((WIKI_PAGE.widthPt - WIKI_PAGE.marginPt * 2) * 20) / columnCount);

  const rows = Array.from(table.rows).map((row, rowIndex) => new TableRow({
    tableHeader: rowIndex === 0 && Array.from(row.cells).every((cell) => cell.tagName === "TH"),
    children: Array.from(row.cells).map((cell) => new TableCell({
      width: { size: columnWidth, type: WidthType.DXA },
      children: [cellParagraph(cell, ctx)],
      shading: cell.tagName === "TH" ? { type: ShadingType.CLEAR, fill: WIKI_COLORS.thBg, color: "auto" } : undefined,
    })),
  }));

  return new Table({
    width: { size: columnWidth * columnCount, type: WidthType.DXA },
    columnWidths: Array.from({ length: columnCount }, () => columnWidth),
    layout: TableLayoutType.FIXED,
    borders: { top: none, left: none, right: none, insideVertical: none, bottom: rule, insideHorizontal: rule },
    margins: { top: px.toTwips(th.padY), bottom: px.toTwips(th.padY), left: px.toTwips(th.padX), right: px.toTwips(th.padX) },
    rows,
  });
}

export function dividerParagraph(ctx: DocxCtx): Paragraph {
  const gap = px.toTwips(WIKI_SPACING.h2.before);
  return new ctx.docx.Paragraph({
    spacing: { before: gap, after: gap },
    border: { bottom: { style: ctx.docx.BorderStyle.SINGLE, size: 6, color: WIKI_COLORS.rule, space: 1 } },
  });
}
