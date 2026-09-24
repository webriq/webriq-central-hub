// Task 400 — page breaking for the PDF export, done in the DOM before jspdf renders.
//
// Why not jspdf's `autoPaging: "text"`: it tracks a running `prevPageLastElemOffset` and shifts
// every text run drawn *after* a line that overflowed a page — but html2canvas draws in paint
// order, not reading order (plain text first, inline runs like `<strong>` in a later pass), so
// those later runs picked up offsets from page breaks further down the document: bold list-item
// titles collided with their descriptions and markers floated above their text. Instead, every
// unbreakable block that would straddle a page boundary is pushed to the next page with a spacer,
// and jspdf's plain `autoPaging: true` then only ever cuts through empty space.

// Blocks that must never be split across pages (their descendants aren't considered separately).
const ATOMIC = "pre, blockquote, tr, img, hr";
// Text blocks, used only when they contain no other unit (the innermost block wins).
const TEXT_BLOCKS = "p, h1, h2, h3, h4, h5, h6, li";
const HEADING = /^H[1-6]$/;
const SAFETY_PX = 2;

function collectUnits(root: HTMLElement): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>(`${ATOMIC}, ${TEXT_BLOCKS}`)).filter((el) => {
    if (el.parentElement?.closest(ATOMIC)) return false; // inside a box that moves as a whole
    return el.matches(ATOMIC) || !el.querySelector(`${ATOMIC}, ${TEXT_BLOCKS}`);
  });
}

// The element to put the spacer in front of: climbs while the unit is its parent's first child,
// so e.g. a list's first item moves together with the list's own top margin (and its marker).
function breakTarget(unit: HTMLElement, root: HTMLElement): HTMLElement {
  let el = unit;
  while (el.tagName !== "TR" && el.parentElement && el.parentElement !== root && el.parentElement.firstElementChild === el && !/^T[DH]$/.test(el.parentElement.tagName)) {
    el = el.parentElement;
  }
  return el;
}

function insertSpacer(before: HTMLElement, height: number): HTMLElement {
  if (before.tagName === "TR") {
    const row = document.createElement("tr");
    const cell = document.createElement("td");
    cell.colSpan = Math.max(1, (before as HTMLTableRowElement).cells.length);
    cell.style.cssText = `height:${height}px;padding:0;border:0;background:transparent;`;
    row.appendChild(cell);
    before.before(row);
    return cell;
  }
  const spacer = document.createElement("div");
  spacer.setAttribute("aria-hidden", "true");
  spacer.style.cssText = `height:${height}px;margin:0;padding:0;`;
  before.before(spacer);
  return spacer;
}

export function insertPageBreakSpacers(root: HTMLElement, pageHeightPx: number) {
  const origin = () => root.getBoundingClientRect().top;
  let previous: HTMLElement | null = null;

  for (const unit of collectUnits(root)) {
    const rect = unit.getBoundingClientRect();
    const top = rect.top - origin();
    const bottom = top + rect.height;
    const page = Math.floor(top / pageHeightPx);
    const boundary = (page + 1) * pageHeightPx;
    const fits = bottom <= boundary - SAFETY_PX || rect.height >= pageHeightPx - SAFETY_PX * 2;

    if (!fits) {
      // Keep a heading with the block it introduces rather than stranding it at a page bottom.
      const keepWithHeading = previous && HEADING.test(previous.tagName) && previous.getBoundingClientRect().top - origin() >= page * pageHeightPx;
      const moved = keepWithHeading && previous ? previous : unit;
      const movedTop = moved.getBoundingClientRect().top - origin();
      const spacer = insertSpacer(breakTarget(moved, root), boundary - movedTop + SAFETY_PX);
      // Margin collapsing can swallow part of the spacer; top it up until the block clears.
      for (let i = 0; i < 3; i += 1) {
        const shortBy = boundary + SAFETY_PX - (moved.getBoundingClientRect().top - origin());
        if (shortBy <= 0) break;
        spacer.style.height = `${parseFloat(spacer.style.height) + shortBy}px`;
      }
    }
    previous = unit;
  }
}
