import { diffArrays, diffWords } from "diff";

// Task 402 — rich-text diff for wiki revisions. Browser-only (uses DOMParser) — import from
// client components and call inside an effect/memo that only runs client-side.
//
// Strategy: flatten each HTML document into "blocks" (paragraphs, headings, list items,
// quotes, code blocks, tables, images), diff the block sequences with jsdiff's `diffArrays`,
// then pair up removed/added blocks of the same kind and word-diff their text with
// `diffWords`. Unchanged blocks keep their original HTML (formatting intact); a modified text
// block is re-rendered as plain text with <ins>/<del> spans; tables/code/images that changed
// are shown whole (old struck, new highlighted) since a word diff would destroy their layout.
//
// Output is untrusted page HTML re-assembled — callers must DOMPurify it before rendering.

export type DiffRowType = "equal" | "added" | "removed" | "modified";

export type DiffRow = {
  type: DiffRowType;
  left: string | null; // old side (side-by-side)
  right: string | null; // new side (side-by-side)
  inline: string; // single-column rendering
};

export type HtmlDiff = { rows: DiffRow[]; added: number; removed: number; modified: number };

type Block = { tag: string; html: string; text: string; key: string };

const LEAF_TAGS = new Set(["P", "H1", "H2", "H3", "H4", "H5", "H6", "LI", "BLOCKQUOTE", "PRE", "TABLE", "IMG", "HR", "FIGURE"]);
const WORD_DIFF_TAGS = new Set(["P", "H1", "H2", "H3", "H4", "H5", "H6", "LI", "BLOCKQUOTE"]);

function escapeHtml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function collapse(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function toBlocks(html: string): Block[] {
  const doc = new DOMParser().parseFromString(html, "text/html");
  const blocks: Block[] = [];

  const push = (tag: string, outer: string, text: string) => {
    // A list item is emitted inside its own <ul> so it still renders as a bullet when shown
    // outside its original list (ordered lists lose their numbering in the diff view only).
    const rendered = tag === "LI" ? `<ul>${outer}</ul>` : outer;
    blocks.push({ tag, html: rendered, text: collapse(text), key: `${tag}|${collapse(outer)}` });
  };

  const walk = (parent: ParentNode) => {
    parent.childNodes.forEach((node) => {
      if (node.nodeType === Node.TEXT_NODE) {
        const text = node.textContent ?? "";
        if (text.trim()) push("P", `<p>${escapeHtml(text)}</p>`, text);
        return;
      }
      if (node.nodeType !== Node.ELEMENT_NODE) return;
      const el = node as Element;
      if (LEAF_TAGS.has(el.tagName)) push(el.tagName, el.outerHTML, el.textContent ?? "");
      else if (el.children.length === 0 && (el.textContent ?? "").trim()) push("P", `<p>${el.innerHTML}</p>`, el.textContent ?? "");
      else walk(el);
    });
  };

  walk(doc.body);
  return blocks;
}

function wrap(tag: string, inner: string): string {
  const t = tag.toLowerCase();
  return tag === "LI" ? `<ul><li>${inner}</li></ul>` : `<${t}>${inner}</${t}>`;
}

// Word-level diff of two strings → { inline, left, right } inner-HTML fragments.
export function diffText(oldText: string, newText: string) {
  let inline = "";
  let left = "";
  let right = "";
  for (const part of diffWords(oldText, newText)) {
    const value = escapeHtml(part.value);
    if (part.added) {
      inline += `<ins>${value}</ins>`;
      right += `<ins>${value}</ins>`;
    } else if (part.removed) {
      inline += `<del>${value}</del>`;
      left += `<del>${value}</del>`;
    } else {
      inline += value;
      left += value;
      right += value;
    }
  }
  return { inline, left, right };
}

function addedRow(block: Block): DiffRow {
  const html = `<div class="wiki-diff-added">${block.html}</div>`;
  return { type: "added", left: null, right: html, inline: html };
}

function removedRow(block: Block): DiffRow {
  const html = `<div class="wiki-diff-removed">${block.html}</div>`;
  return { type: "removed", left: html, right: null, inline: html };
}

function modifiedRows(oldBlock: Block, newBlock: Block): DiffRow[] {
  if (oldBlock.tag !== newBlock.tag || !WORD_DIFF_TAGS.has(newBlock.tag)) {
    return [removedRow(oldBlock), addedRow(newBlock)];
  }
  if (oldBlock.text === newBlock.text) {
    // Same words, different markup (bold/link/etc.) — show the new block flagged as a
    // formatting change rather than an empty word diff.
    const html = `<div class="wiki-diff-format">${newBlock.html}</div>`;
    return [{ type: "modified", left: `<div class="wiki-diff-format">${oldBlock.html}</div>`, right: html, inline: html }];
  }
  const { inline, left, right } = diffText(oldBlock.text, newBlock.text);
  return [{
    type: "modified",
    left: `<div class="wiki-diff-modified">${wrap(oldBlock.tag, left)}</div>`,
    right: `<div class="wiki-diff-modified">${wrap(newBlock.tag, right)}</div>`,
    inline: `<div class="wiki-diff-modified">${wrap(newBlock.tag, inline)}</div>`,
  }];
}

function alignRun(removed: Block[], added: Block[]): DiffRow[] {
  const rows: DiffRow[] = [];
  let oi = 0;
  let ni = 0;
  for (const part of diffArrays(removed.map((b) => b.tag), added.map((b) => b.tag))) {
    const count = part.value.length;
    for (let k = 0; k < count; k++) {
      if (part.removed) rows.push(removedRow(removed[oi++]));
      else if (part.added) rows.push(addedRow(added[ni++]));
      else rows.push(...modifiedRows(removed[oi++], added[ni++]));
    }
  }
  return rows;
}

export function diffHtml(oldHtml: string, newHtml: string): HtmlDiff {
  const oldBlocks = toBlocks(oldHtml);
  const newBlocks = toBlocks(newHtml);
  const changes = diffArrays(oldBlocks, newBlocks, { comparator: (a, b) => a.key === b.key });

  const rows: DiffRow[] = [];
  for (let i = 0; i < changes.length; i++) {
    const change = changes[i];
    if (!change.added && !change.removed) {
      for (const block of change.value) rows.push({ type: "equal", left: block.html, right: block.html, inline: block.html });
      continue;
    }
    // A removed run immediately followed by an added run (or vice versa) is a set of edits.
    // Align the two runs by block kind (a second diff over tag names) so a changed paragraph
    // pairs with a paragraph, not with whatever happens to sit at the same position.
    const next = changes[i + 1];
    const pairsWithNext = next && (change.removed ? next.added : next.removed);
    if (!pairsWithNext) {
      for (const block of change.value) rows.push(change.added ? addedRow(block) : removedRow(block));
      continue;
    }
    const removed = change.removed ? change.value : next.value;
    const added = change.added ? change.value : next.value;
    rows.push(...alignRun(removed, added));
    i++;
  }

  return {
    rows,
    added: rows.filter((r) => r.type === "added").length,
    removed: rows.filter((r) => r.type === "removed").length,
    modified: rows.filter((r) => r.type === "modified").length,
  };
}

export function diffTags(oldTags: string[], newTags: string[]) {
  const oldSet = new Set(oldTags.map((t) => t.toLowerCase()));
  const newSet = new Set(newTags.map((t) => t.toLowerCase()));
  return {
    added: newTags.filter((t) => !oldSet.has(t.toLowerCase())),
    removed: oldTags.filter((t) => !newSet.has(t.toLowerCase())),
    kept: newTags.filter((t) => oldSet.has(t.toLowerCase())),
  };
}
