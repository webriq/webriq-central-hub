// Task 400 — list markers for the PDF render. html2canvas 1.4 draws `list-style` markers with its
// own positioning, which sits noticeably above the item's text baseline. Native markers are turned
// off on the render host and each item gets a real inline-block marker (`.wiki-export-marker`,
// styled in `buildWikiCss`) as the first thing on its first line, so it shares that line's
// baseline like any other text. Only the off-screen PDF render host is modified.

const BULLETS = ["•", "◦", "▪"]; // disc / circle / square by nesting depth, like the browser
const DESCEND_INTO = /^(P|H[1-6]|DIV|SECTION|HEADER)$/;

// The element whose first line is the item's first line: descend through leading block wrappers
// (Tiptap's `<li><p>`, imported `<li><h4>`) but stop at inline content.
function firstLineHost(li: HTMLElement): HTMLElement {
  let host = li;
  for (;;) {
    const first = Array.from(host.childNodes).find((n) => n.nodeType !== Node.TEXT_NODE || (n.textContent ?? "").trim());
    if (!(first instanceof HTMLElement) || !DESCEND_INTO.test(first.tagName)) return host;
    host = first;
  }
}

export function renderListMarkers(root: HTMLElement) {
  for (const list of Array.from(root.querySelectorAll<HTMLElement>("ul, ol"))) {
    list.style.listStyle = "none";
    const depth = Array.from(root.querySelectorAll("ul, ol")).filter((other) => other !== list && other.contains(list)).length;
    const ordered = list.tagName === "OL";
    let index = ordered ? (list as HTMLOListElement).start || 1 : 0;

    for (const li of Array.from(list.children).filter((c): c is HTMLElement => c.tagName === "LI")) {
      const marker = document.createElement("span");
      marker.className = "wiki-export-marker";
      marker.setAttribute("aria-hidden", "true");
      marker.textContent = ordered ? `${index++}.` : BULLETS[depth % BULLETS.length];
      const host = firstLineHost(li);
      // Leading source whitespace (pretty-printed HTML) would otherwise render as a space after
      // the marker — it's only collapsed away while it sits at the very start of the line.
      while (host.firstChild?.nodeType === Node.TEXT_NODE && !(host.firstChild.textContent ?? "").trim()) host.firstChild.remove();
      host.prepend(marker);
    }
  }
}
