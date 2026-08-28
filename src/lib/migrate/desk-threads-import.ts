// dev-only import helper — upserts Desk Thread rows into ticket_messages, matched to a Hub
// ticket via the paginated tickets lookup map (keyed on tickets.external_id). Lifted verbatim
// from the zoho-import/desk-threads route body (task 304) so the live import and the
// archived-ticket threads import (task 332) share one implementation. Archived tickets are
// already rows in `tickets` with a populated external_id (task 325), so no matching change is
// needed — an archived thread carrying _zoho_ticket_id resolves the same way.
//
// Threads are the actual customer<->agent conversation: author_type is derived per row from
// author.type / direction ('staff' for agent-authored, 'client' for customer-authored).
// Customer-authored rows never resolve author_id — Desk contacts have no Hub auth.users row.
// Threads never carry a `plainText` field the way Comments do, so `body` ends up as raw
// `content` (HTML); source_meta.contentType is captured for any future renderer.
import { adminClient, ImportResult } from "@/lib/migrate/zoho-import";

type DeskThreadAuthorRaw = { type?: string; name?: string; email?: string } | null | undefined;

export type DeskThreadRaw = {
  id?: string | number;
  content?: string | null;
  plainText?: string | null;
  contentType?: string | null;
  direction?: string | null;
  visibility?: string | null;
  channel?: string | null;
  author?: DeskThreadAuthorRaw;
  createdTime?: string | null;
  commentedTime?: string | null;
  hasAttach?: boolean | null;
  attachmentCount?: string | number | null;
  attachments?: Array<Record<string, unknown>>;
  _zoho_ticket_id?: string;
  [key: string]: unknown;
};

type TicketMessageRow = {
  ticket_id: string;
  author_type: "staff" | "client";
  author_id: string | null;
  body: string;
  visibility: "public" | "internal";
  external_id: string;
  source_meta: Record<string, unknown>;
  created_at?: string;
};

const CHUNK_SIZE = 50;
const MAX_UPSERT_RETRIES = 3;
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

// Bounded retry with linear backoff — same pattern as desk-ticket-comments import.
async function upsertChunkWithRetry(chunk: TicketMessageRow[]): Promise<{ error: string | null }> {
  let lastError = "";
  for (let attempt = 1; attempt <= MAX_UPSERT_RETRIES; attempt++) {
    const { error } = await adminClient.from("ticket_messages").upsert(chunk, { onConflict: "external_id" });
    if (!error) return { error: null };

    lastError = error.message;
    if (attempt < MAX_UPSERT_RETRIES) {
      const waitMs = attempt * 1000;
      console.log(`[desk-threads] chunk upsert failed (attempt ${attempt}/${MAX_UPSERT_RETRIES}): ${error.message} — retrying in ${waitMs}ms`);
      await sleep(waitMs);
    }
  }
  return { error: lastError };
}

export async function importDeskThreads(threads: DeskThreadRaw[]): Promise<ImportResult> {
  // Paginated tickets lookup — same 1000-row-default fix as desk-ticket-comments import.
  const ticketRows: Array<{ id: string; external_id: string }> = [];
  {
    const PAGE = 1000;
    let from = 0;
    while (true) {
      const { data: page, error: ticketFetchError } = await adminClient
        .from("tickets")
        .select("id, external_id")
        .not("external_id", "is", null)
        .range(from, from + PAGE - 1);
      if (ticketFetchError) {
        console.error("[desk-threads] failed to fetch tickets for lookup:", ticketFetchError.message);
        throw new Error(`Could not fetch tickets: ${ticketFetchError.message}`);
      }
      if (!page || page.length === 0) break;
      ticketRows.push(...(page as Array<{ id: string; external_id: string }>));
      if (page.length < PAGE) break;
      from += PAGE;
    }
  }
  const ticketMap = new Map(ticketRows.map((t) => [String(t.external_id), t.id]));
  console.log(`[desk-threads] ticket lookup map built: ${ticketMap.size} tickets`);

  const userCache = new Map<string, string>();
  let page = 1;
  while (true) {
    const { data, error } = await adminClient.auth.admin.listUsers({ page, perPage: 1000 });
    if (error || !data?.users?.length) break;
    for (const u of data.users) {
      if (u.email) userCache.set(u.email.toLowerCase(), u.id);
    }
    if (data.users.length < 1000) break;
    page++;
  }
  console.log(`[desk-threads] user lookup map built: ${userCache.size} users`);

  const result: ImportResult = { imported: 0, updated: 0, skipped: 0, errors: [] };
  const rows: TicketMessageRow[] = [];

  for (const t of threads) {
    const externalId = String(t.id ?? "");
    // Attachment-only message (e.g. a customer emails just files, no text): the body is
    // empty, and without a placeholder the row is skipped entirely — which also strands its
    // attachments, since the ticket-attachments import only scans rows that made it into
    // ticket_messages.source_meta.attachments. Give it a synthetic body so the row (and its
    // attachment metadata) survives; source_meta.syntheticBody flags it for any renderer.
    const threadAttachments = t.attachments ?? [];
    const bodyIsSynthetic = !(t.plainText ?? t.content) && threadAttachments.length > 0;
    const body = bodyIsSynthetic
      ? `[no message body — ${threadAttachments.length} attachment${threadAttachments.length === 1 ? "" : "s"}]`
      : (t.plainText ?? t.content ?? "");
    if (!externalId || !body) { result.skipped++; continue; }

    const ticketId = ticketMap.get(String(t._zoho_ticket_id ?? ""));
    if (!ticketId) {
      result.errors.push(`thread ${externalId}: no Hub ticket found for _zoho_ticket_id=${t._zoho_ticket_id}`);
      result.skipped++;
      continue;
    }

    const isAgent = t.author?.type === "AGENT" || t.direction === "out";
    const authorType: "staff" | "client" = isAgent ? "staff" : "client";
    const email = isAgent ? t.author?.email?.toLowerCase() : undefined;
    const authorId = email ? (userCache.get(email) ?? null) : null;

    const channelMapped = String(t.channel ?? "").toLowerCase() === "email" ? "email" : "manual";

    rows.push({
      ticket_id: ticketId,
      author_type: authorType,
      author_id: authorId,
      body,
      visibility: t.visibility === "public" ? "public" : "internal",
      external_id: externalId,
      created_at: t.createdTime ?? t.commentedTime ?? undefined,
      source_meta: {
        author: t.author ?? null,
        direction: t.direction ?? null,
        channel: t.channel ?? null,
        channelMapped,
        contentType: t.contentType ?? null,
        zohoSource: "thread",
        ...(bodyIsSynthetic ? { syntheticBody: true } : {}),
        hasAttach: t.hasAttach ?? null,
        attachmentCount: t.attachmentCount ?? null,
        attachments: threadAttachments.map((a) => ({
          id: a.id, name: a.name, size: a.size, status: a.status, href: a.href, previewurl: a.previewurl,
        })),
      },
    });
  }

  // Dedupe by external_id (the upsert conflict key): Postgres rejects an INSERT ... ON
  // CONFLICT whose payload names the same conflict target twice ("cannot affect row a second
  // time"). The Desk export paginator can hand back a boundary thread on two consecutive
  // `from` pages (seen in a real archived-threads export), so identical rows do occur; last
  // one wins. Same fix as importDeskTickets() (task 325).
  const dedupedRows = Array.from(new Map(rows.map((r) => [r.external_id, r])).values());
  const droppedDupes = rows.length - dedupedRows.length;
  if (droppedDupes > 0) {
    console.log(`[desk-threads] dropped ${droppedDupes} duplicate external_id row(s) before upsert`);
  }

  console.log(`[desk-threads] upserting ${dedupedRows.length} rows in chunks of ${CHUNK_SIZE} (${result.skipped} skipped, ${droppedDupes} dupes)`);

  for (let i = 0; i < dedupedRows.length; i += CHUNK_SIZE) {
    const chunk = dedupedRows.slice(i, i + CHUNK_SIZE);
    const { error } = await upsertChunkWithRetry(chunk);
    const chunkNum = Math.floor(i / CHUNK_SIZE) + 1;
    const totalChunks = Math.ceil(dedupedRows.length / CHUNK_SIZE);
    if (error) {
      console.error(`[desk-threads] chunk ${chunkNum}/${totalChunks} failed after ${MAX_UPSERT_RETRIES} attempts:`, error);
      result.errors.push(`chunk ${chunkNum}: ${error}`);
    } else {
      console.log(`[desk-threads] chunk ${chunkNum}/${totalChunks} upserted (${chunk.length} rows)`);
      result.imported += chunk.length;
    }
  }

  console.log(`[desk-threads] done: ${result.imported} imported, ${result.skipped} skipped, ${result.errors.length} error(s)`);
  return result;
}
