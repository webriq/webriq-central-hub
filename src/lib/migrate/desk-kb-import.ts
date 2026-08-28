// Shared Desk Knowledge Base import logic (task 336) — reads the { articles, categories }
// object from _from_zoho/desk-kb.json (passed in by the route) and upserts the articles
// into the `kb_articles` table (migration 126). KB articles are global content, so — unlike
// importDeskAccounts / the contacts import — there is no customers lookup and no soft
// matching. Pattern otherwise mirrors importDeskTickets(): external_id dedupe + a
// CHUNK_SIZE=50 upsert on `external_id`. Categories in the file are ignored for now
// (kb_categories table deferred — each article carries its category name+id inline).
import { adminClient, ImportResult } from "@/lib/migrate/zoho-import";

// The Zoho Desk KB article shape from GET /articles/{id} — only the fields we columnize are
// typed; the whole raw object is also stashed in source_meta.
export type DeskKbArticleRaw = {
  id?: string | number;
  title?: string | null;
  permalink?: string | null;
  answer?: string | null;
  summary?: string | null;
  status?: string | null;
  latestVersionStatus?: string | null;
  categoryId?: string | number | null;
  rootCategoryId?: string | number | null;
  category?: { id?: string | number; name?: string | null } | null;
  tags?: unknown;
  authorId?: string | number | null;
  author?: { id?: string | number; name?: string | null } | null;
  permission?: string | null;
  viewCount?: string | number | null;
  likeCount?: string | number | null;
  dislikeCount?: string | number | null;
  webUrl?: string | null;
  portalUrl?: string | null;
  createdTime?: string | null;
  modifiedTime?: string | null;
  [key: string]: unknown;
};

export type DeskKbCategoryRaw = {
  id?: string | number;
  name?: string | null;
  [key: string]: unknown;
};

export type DeskKbFile = {
  articles?: DeskKbArticleRaw[];
  categories?: DeskKbCategoryRaw[];
};

type KbArticleRow = {
  external_id: string;
  title: string;
  permalink: string | null;
  answer: string | null;
  summary: string | null;
  status: string | null;
  latest_version_status: string | null;
  category_name: string | null;
  category_id: string | null;
  root_category_id: string | null;
  tags: string[] | null;
  author_id: string | null;
  author_name: string | null;
  permission: string | null;
  view_count: number | null;
  like_count: number | null;
  dislike_count: number | null;
  web_url: string | null;
  created_time: string | null;
  modified_time: string | null;
  source_meta: Record<string, unknown>;
};

const CHUNK_SIZE = 50;

function toIntOrNull(v: unknown): number | null {
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? Math.trunc(n) : null;
}

function toStrOrNull(v: unknown): string | null {
  return v == null ? null : String(v);
}

// Zoho KB `tags` has been seen both as string[] and as { name }[] across API versions.
function normalizeTags(raw: unknown): string[] | null {
  if (!Array.isArray(raw)) return null;
  const tags = raw
    .map((t) => (typeof t === "string" ? t : (t as { name?: unknown })?.name))
    .filter((t): t is string => typeof t === "string" && t.length > 0);
  return tags.length > 0 ? tags : null;
}

export async function importDeskKb(file: DeskKbFile): Promise<ImportResult> {
  const articles = file.articles ?? [];
  console.log(`[import/desk-kb] ${articles.length} articles`);

  const result: ImportResult = { imported: 0, updated: 0, skipped: 0, errors: [] };
  const rows: KbArticleRow[] = [];

  for (const article of articles) {
    const externalId = article.id != null ? String(article.id) : "";
    const title = (article.title ?? "").trim();
    if (!externalId || !title) {
      result.skipped++;
      continue;
    }

    rows.push({
      external_id: externalId,
      title,
      permalink: article.permalink ?? null,
      answer: article.answer ?? null,
      summary: article.summary ?? null,
      status: article.status ?? null,
      latest_version_status: article.latestVersionStatus ?? null,
      category_name: article.category?.name ?? null,
      category_id: toStrOrNull(article.category?.id ?? article.categoryId),
      root_category_id: toStrOrNull(article.rootCategoryId),
      tags: normalizeTags(article.tags),
      author_id: toStrOrNull(article.author?.id ?? article.authorId),
      author_name: article.author?.name ?? null,
      permission: article.permission ?? null,
      view_count: toIntOrNull(article.viewCount),
      like_count: toIntOrNull(article.likeCount),
      dislike_count: toIntOrNull(article.dislikeCount),
      web_url: article.webUrl ?? article.portalUrl ?? null,
      created_time: article.createdTime ?? null,
      modified_time: article.modifiedTime ?? null,
      source_meta: article as Record<string, unknown>,
    });
  }

  // Dedupe by external_id (the upsert conflict key) — last one wins. Same guard as
  // importDeskTickets() / importDeskAccounts().
  const dedupedRows = Array.from(new Map(rows.map((r) => [r.external_id, r])).values());
  const droppedDupes = rows.length - dedupedRows.length;
  if (droppedDupes > 0) {
    console.log(`[import/desk-kb] dropped ${droppedDupes} duplicate external_id row(s) before upsert`);
  }

  console.log(
    `[import/desk-kb] upserting ${dedupedRows.length} rows in chunks of ${CHUNK_SIZE} (${result.skipped} skipped, ${droppedDupes} dupes)`
  );

  for (let i = 0; i < dedupedRows.length; i += CHUNK_SIZE) {
    const chunk = dedupedRows.slice(i, i + CHUNK_SIZE);
    const { error } = await adminClient.from("kb_articles").upsert(chunk, { onConflict: "external_id" });
    const chunkNum = Math.floor(i / CHUNK_SIZE) + 1;
    const totalChunks = Math.ceil(dedupedRows.length / CHUNK_SIZE);
    if (error) {
      console.error(`[import/desk-kb] chunk ${chunkNum}/${totalChunks} failed:`, error.message);
      result.errors.push(`chunk ${chunkNum}: ${error.message}`);
    } else {
      result.imported += chunk.length;
    }
  }

  console.log(
    `[import/desk-kb] done: ${result.imported} imported, ${result.skipped} skipped, ${result.errors.length} error(s)`
  );
  return result;
}
