// Task 401 — wiki tag helpers, shared by the /kb client (pill input, tree filter) and the
// /api/wiki/pages routes (server-side normalization). No `wiki_tags` table: the tag catalog is
// just the distinct values across `wiki_pages.tags`.

export const WIKI_TAG_MAX_LENGTH = 40;

export type WikiTagCount = { tag: string; count: number };

export function cleanWikiTag(raw: string): string {
  return raw.trim().replace(/\s+/g, " ").slice(0, WIKI_TAG_MAX_LENGTH).trim();
}

// Trims, collapses whitespace, drops empties/non-strings, caps length and dedupes
// case-insensitively (first casing wins). Accepts `unknown` so routes can pass the raw body.
export function normalizeWikiTags(input: unknown): string[] {
  if (!Array.isArray(input)) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const value of input) {
    if (typeof value !== "string") continue;
    const tag = cleanWikiTag(value);
    const key = tag.toLowerCase();
    if (!tag || seen.has(key)) continue;
    seen.add(key);
    out.push(tag);
  }
  return out;
}

// Distinct tags across pages (archived pages excluded), most-used first, then alphabetical.
// Case variants collapse onto the first casing seen.
export function collectWikiTags(pages: { tags: string[]; status: string }[]): WikiTagCount[] {
  const byKey = new Map<string, WikiTagCount>();
  for (const page of pages) {
    if (page.status === "archived") continue;
    for (const tag of normalizeWikiTags(page.tags)) {
      const key = tag.toLowerCase();
      const entry = byKey.get(key);
      if (entry) entry.count += 1;
      else byKey.set(key, { tag, count: 1 });
    }
  }
  return [...byKey.values()].sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag));
}

// Returns the catalog's casing for `tag` when a case-insensitive match exists, else `tag`.
export function resolveWikiTagCasing(tag: string, catalog: WikiTagCount[]): string {
  const key = tag.toLowerCase();
  return catalog.find((c) => c.tag.toLowerCase() === key)?.tag ?? tag;
}

// With a query: catalog tags containing it (prefix matches first). Without one: tags that
// appear in `title` first, then the rest by usage — "suggestions depending on the title".
export function rankTagSuggestions(
  catalog: WikiTagCount[],
  query: string,
  title: string,
  exclude: string[],
  limit = 8
): string[] {
  const excluded = new Set(exclude.map((t) => t.toLowerCase()));
  const candidates = catalog.filter((c) => !excluded.has(c.tag.toLowerCase()));
  const q = query.trim().toLowerCase();

  if (q) {
    return candidates
      .filter((c) => c.tag.toLowerCase().includes(q))
      .sort((a, b) => {
        const aPrefix = a.tag.toLowerCase().startsWith(q) ? 0 : 1;
        const bPrefix = b.tag.toLowerCase().startsWith(q) ? 0 : 1;
        return aPrefix - bPrefix || b.count - a.count || a.tag.localeCompare(b.tag);
      })
      .slice(0, limit)
      .map((c) => c.tag);
  }

  const t = title.toLowerCase();
  const inTitle = (tag: string) => t.length > 0 && t.includes(tag.toLowerCase());
  return [...candidates]
    .sort((a, b) => Number(inTitle(b.tag)) - Number(inTitle(a.tag)))
    .slice(0, limit)
    .map((c) => c.tag);
}
