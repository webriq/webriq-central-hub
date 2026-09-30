import type { ParagraphChild } from "docx";

// Task 400 — types shared by the Word export modules. `docx` itself is only ever loaded via a
// dynamic import in `_wiki-export-docx.ts` and handed around on `ctx`, so these modules import
// its types only and it stays out of the /kb initial bundle.

export type Docx = typeof import("docx");

export type DocxImage = { data: ArrayBuffer; width: number; height: number; type: "png" | "jpg" | "gif" | "bmp" };

// Run formatting inherited down the inline tree. `font`/`size` (half-points)/`color`/`tracking`
// are the block's base typography; every run writes them explicitly (see textRun) because some
// apps (Pages) ignore the document-default run properties and fall back to a serif.
export type Marks = {
  bold?: boolean; italics?: boolean; underline?: boolean; strike?: boolean; code?: boolean; link?: boolean;
  color?: string; font?: string; size?: number; tracking?: number;
};

// Font family names written into the .docx (DOCX_FONTS in `_wiki-export-docx-styles.ts`).
export type DocxFonts = { body: string; heading: string; mono: string };

export type DocxCtx = {
  docx: Docx;
  images: Map<string, DocxImage>;
  fonts: DocxFonts;
  body: Marks; // body-text run typography, the base for content outside headings
  nextListInstance: number;
  // Bound inline walker, so block builders in other modules can use it without circular imports.
  inline: (node: Node, marks: Marks) => ParagraphChild[];
};

export const OL_REFERENCE = "wiki-ol";
export const UL_REFERENCE = "wiki-ul";
