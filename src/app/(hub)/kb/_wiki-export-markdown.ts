import type { WikiPageDetail } from "@/types/wiki";
import { downloadBlob, exportFilename, parseContentHtml } from "./_wiki-export-shared";

// Task 400 — "Export as Markdown": turndown + its GFM plugin (tables, strikethrough), both
// dynamically imported so they never land in the /kb initial bundle.

// Reshapes Tiptap's HTML into what turndown expects:
// - Tiptap wraps every list item's and table cell's text in `<p>`, which turndown renders as
//   loose (blank-line-separated) list items and multi-line cells that break the pipe table —
//   so a lone `<p>` inside `li`/`th`/`td` is unwrapped.
// - Tiptap puts header cells as `<th>` in the first `<tbody>` row with no `<thead>`;
//   turndown-plugin-gfm only emits a pipe table when it finds a heading row, so lift it.
function normalizeForMarkdown(root: HTMLElement) {
  root.querySelectorAll("li, th, td").forEach((el) => {
    const paragraphs = Array.from(el.children).filter((c) => c.tagName === "P");
    if (paragraphs.length === 1) paragraphs[0].replaceWith(...Array.from(paragraphs[0].childNodes));
  });
  root.querySelectorAll("table").forEach((table) => {
    if (table.tHead) return;
    const first = table.rows[0];
    if (!first || !Array.from(first.cells).every((cell) => cell.tagName === "TH")) return;
    table.createTHead().appendChild(first);
  });
}

export async function exportMarkdown(detail: WikiPageDetail): Promise<void> {
  const [{ default: TurndownService }, { gfm }] = await Promise.all([
    import("turndown"),
    import("turndown-plugin-gfm"),
  ]);

  const turndown = new TurndownService({
    headingStyle: "atx",
    codeBlockStyle: "fenced",
    bulletListMarker: "-",
    emDelimiter: "_",
  });
  turndown.use(gfm);
  // The GFM plugin emits single-tilde `~x~`; `~~x~~` is the form every Markdown renderer accepts.
  // addRule() prepends, so this overrides the plugin's strikethrough rule.
  turndown.addRule("strikethrough", {
    filter: ["del", "s"],
    replacement: (content) => `~~${content}~~`,
  });

  const root = parseContentHtml(detail.contentHtml);
  normalizeForMarkdown(root);
  const body = turndown.turndown(root).trim();

  const markdown = `# ${detail.title}\n\n${body}\n`;
  downloadBlob(new Blob([markdown], { type: "text/markdown;charset=utf-8" }), exportFilename(detail.title, "md"));
}
