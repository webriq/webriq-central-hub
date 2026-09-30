// Task 400 — HTML whitespace collapsing for the DOM-walking Word exporter. Browsers collapse
// source whitespace (newlines, indentation) when rendering; a .docx run keeps every character, so
// pretty-printed stored HTML (e.g. AI-imported pages, whose `<li>`s are indented over several
// source lines) turned into stray line breaks and large gaps in Word/Pages. This mirrors the
// browser: runs of whitespace become one space, dropped at the start/end of a line.

const BLOCK = /^(P|H[1-6]|LI|UL|OL|DIV|SECTION|ARTICLE|HEADER|MAIN|FOOTER|NAV|ASIDE|FIGURE|BLOCKQUOTE|TABLE|THEAD|TBODY|TR|TD|TH|BODY)$/;

function isLineBoundary(node: Node | null): boolean {
  return node instanceof Element && (node.tagName === "BR" || BLOCK.test(node.tagName));
}

function isBlankText(node: Node): boolean {
  return node.nodeType === Node.TEXT_NODE && !(node.textContent ?? "").trim();
}

// True when nothing but blank text sits between `node` and the start (or end) of its line.
function atLineEdge(node: Node, direction: "previous" | "next"): boolean {
  let current: Node = node;
  for (;;) {
    let sibling = direction === "previous" ? current.previousSibling : current.nextSibling;
    while (sibling && isBlankText(sibling)) sibling = direction === "previous" ? sibling.previousSibling : sibling.nextSibling;
    if (sibling) return isLineBoundary(sibling);
    const parent = current.parentElement;
    if (!parent || BLOCK.test(parent.tagName)) return true;
    current = parent; // inline wrapper (strong/em/a…) — keep looking outside it
  }
}

export function collapseWhitespace(root: Element) {
  const walker = root.ownerDocument.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const nodes: Text[] = [];
  while (walker.nextNode()) nodes.push(walker.currentNode as Text);

  for (const node of nodes) {
    if (node.parentElement?.closest("pre")) continue; // code keeps its formatting
    let text = node.data.replace(/\s+/g, " ");
    if (text.startsWith(" ") && atLineEdge(node, "previous")) text = text.slice(1);
    if (text.endsWith(" ") && atLineEdge(node, "next")) text = text.slice(0, -1);
    node.data = text;
  }
}
