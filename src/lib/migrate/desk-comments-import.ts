// dev-only import helper — upserts Desk Ticket Comment rows into ticket_messages, matched to
// a Hub ticket via the paginated tickets lookup map (keyed on tickets.external_id). Lifted
// verbatim from the zoho-import/desk-ticket-comments route body (task 304) so the live import
// and the archived-ticket comments import (task 332) share one implementation. Archived
// tickets are already rows in `tickets` with a populated external_id (task 325).
//
// Comments are almost always agent-authored (public or private via isPublic), distinct from
// Threads — but a real export showed the occasional commenter.type: "END_USER" (a customer
// replying directly), so author_type is derived per row from commenter.type rather than
// hardcoded to 'staff'. `commenter` is always present; `commentedBy` never appears (checked
// defensively regardless).
import { adminClient, ImportResult } from "@/lib/migrate/zoho-import";

type DeskCommenterRaw = { name?: string; email?: string; type?: string } | undefined | null;

export type DeskTicketCommentRaw = {
  id?: string | number;
  content?: string;
  plainText?: string;
  isPublic?: boolean;
  commentedTime?: string;
  modifiedTime?: string | null;
  contentType?: string;
  attachments?: Array<Record<string, unknown>>;
  commenter?: DeskCommenterRaw;
  commentedBy?: DeskCommenterRaw;
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

// Bounded retry with linear backoff — same pattern as issue-comments import.
async function upsertChunkWithRetry(chunk: TicketMessageRow[]): Promise<{ error: string | null }> {
  let lastError = "";
  for (let attempt = 1; attempt <= MAX_UPSERT_RETRIES; attempt++) {
    const { error } = await adminClient.from("ticket_messages").upsert(chunk, { onConflict: "external_id" });
    if (!error) return { error: null };

    lastError = error.message;
    if (attempt < MAX_UPSERT_RETRIES) {
      const waitMs = attempt * 1000;
      console.log(`[desk-ticket-comments] chunk upsert failed (attempt ${attempt}/${MAX_UPSERT_RETRIES}): ${error.message} — retrying in ${waitMs}ms`);
      await sleep(waitMs);
    }
  }
  return { error: lastError };
}

export async function importDeskComments(comments: DeskTicketCommentRaw[]): Promise<ImportResult> {
  // Paginated tickets lookup — same 1000-row-default fix as issue-comments import.
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
        console.error("[desk-ticket-comments] failed to fetch tickets for lookup:", ticketFetchError.message);
        throw new Error(`Could not fetch tickets: ${ticketFetchError.message}`);
      }
      if (!page || page.length === 0) break;
      ticketRows.push(...(page as Array<{ id: string; external_id: string }>));
      if (page.length < PAGE) break;
      from += PAGE;
    }
  }
  const ticketMap = new Map(ticketRows.map((t) => [String(t.external_id), t.id]));
  console.log(`[desk-ticket-comments] ticket lookup map built: ${ticketMap.size} tickets`);

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
  console.log(`[desk-ticket-comments] user lookup map built: ${userCache.size} users`);

  const result: ImportResult = { imported: 0, updated: 0, skipped: 0, errors: [] };
  const rows: TicketMessageRow[] = [];

  for (const c of comments) {
    const externalId = String(c.id ?? "");
    // Attachment-only comment: empty body would skip the row and strand its attachments (the
    // ticket-attachments import only scans rows in ticket_messages.source_meta.attachments).
    // Give it a synthetic body; source_meta.syntheticBody flags it. Same as importDeskThreads().
    const commentAttachments = c.attachments ?? [];
    const bodyIsSynthetic = !(c.plainText ?? c.content) && commentAttachments.length > 0;
    const body = bodyIsSynthetic
      ? `[no message body — ${commentAttachments.length} attachment${commentAttachments.length === 1 ? "" : "s"}]`
      : (c.plainText ?? c.content ?? "");
    if (!externalId || !body) { result.skipped++; continue; }

    const ticketId = ticketMap.get(String(c._zoho_ticket_id ?? ""));
    if (!ticketId) {
      result.errors.push(`comment ${externalId}: no Hub ticket found for _zoho_ticket_id=${c._zoho_ticket_id}`);
      result.skipped++;
      continue;
    }

    const commenter = c.commenter ?? c.commentedBy ?? null;
    const isAgent = commenter?.type !== "END_USER";
    const authorType: "staff" | "client" = isAgent ? "staff" : "client";
    const email = isAgent ? commenter?.email?.toLowerCase() : undefined;
    const authorId = email ? (userCache.get(email) ?? null) : null;

    rows.push({
      ticket_id: ticketId,
      author_type: authorType,
      author_id: authorId,
      body,
      visibility: c.isPublic ? "public" : "internal",
      external_id: externalId,
      created_at: c.commentedTime ?? undefined,
      source_meta: {
        commenter: commenter ?? null,
        contentType: c.contentType ?? null,
        modifiedTime: c.modifiedTime ?? null,
        ...(bodyIsSynthetic ? { syntheticBody: true } : {}),
        attachments: commentAttachments.map((a) => ({
          id: a.id, name: a.name, size: a.size, href: a.href, previewurl: a.previewurl,
        })),
        zohoSource: "comment",
      },
    });
  }

  // Dedupe by external_id (the upsert conflict key): Postgres rejects an INSERT ... ON
  // CONFLICT whose payload names the same conflict target twice ("cannot affect row a second
  // time"). The Desk export paginator can hand back a boundary comment on two consecutive
  // `from` pages, so identical rows can occur; last one wins. Same fix as importDeskTickets()
  // (task 325) and importDeskThreads().
  const dedupedRows = Array.from(new Map(rows.map((r) => [r.external_id, r])).values());
  const droppedDupes = rows.length - dedupedRows.length;
  if (droppedDupes > 0) {
    console.log(`[desk-ticket-comments] dropped ${droppedDupes} duplicate external_id row(s) before upsert`);
  }

  console.log(`[desk-ticket-comments] upserting ${dedupedRows.length} rows in chunks of ${CHUNK_SIZE} (${result.skipped} skipped, ${droppedDupes} dupes)`);

  for (let i = 0; i < dedupedRows.length; i += CHUNK_SIZE) {
    const chunk = dedupedRows.slice(i, i + CHUNK_SIZE);
    const { error } = await upsertChunkWithRetry(chunk);
    const chunkNum = Math.floor(i / CHUNK_SIZE) + 1;
    const totalChunks = Math.ceil(dedupedRows.length / CHUNK_SIZE);
    if (error) {
      console.error(`[desk-ticket-comments] chunk ${chunkNum}/${totalChunks} failed after ${MAX_UPSERT_RETRIES} attempts:`, error);
      result.errors.push(`chunk ${chunkNum}: ${error}`);
    } else {
      console.log(`[desk-ticket-comments] chunk ${chunkNum}/${totalChunks} upserted (${chunk.length} rows)`);
      result.imported += chunk.length;
    }
  }

  console.log(`[desk-ticket-comments] done: ${result.imported} imported, ${result.skipped} skipped, ${result.errors.length} error(s)`);
  return result;
}
