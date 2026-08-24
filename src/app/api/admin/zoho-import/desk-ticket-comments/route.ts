// dev-only import endpoint — reads _from_zoho/desk-ticket-comments.json, upserts to
// ticket_messages. Desk ticket Comments are always agent-authored (public or private via
// isPublic) — author_type is always 'staff' here, distinct from Threads (the actual
// customer↔agent conversation, out of scope for this task, see task 296 doc).
//
// NOTE: the exact "who wrote this" field name on a Desk comment was not confirmed from
// documentation during planning — this checks a few plausible field names defensively
// (commenter, commentedBy) and falls back to no author if none match. Confirm against a
// real desk-ticket-comments.json sample and adjust if needed.
import { NextResponse } from "next/server";
import path from "path";
import fs from "fs";
import { createClient } from "@/lib/supabase/server";
import { adminClient, ImportResult } from "@/lib/migrate/zoho-import";

type DeskCommenterRaw = { name?: string; email?: string; type?: string } | undefined | null;

type DeskTicketCommentRaw = {
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
  author_type: "staff";
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

export async function POST() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: profile } = await adminClient.from("profiles").select("role").eq("id", user.id).maybeSingle();
  if (profile?.role !== "admin" && profile?.role !== "super_admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const filePath = path.join(process.cwd(), "_from_zoho", "desk-ticket-comments.json");
  if (!fs.existsSync(filePath)) {
    return NextResponse.json({ error: "Could not find _from_zoho/desk-ticket-comments.json — export Desk Ticket Comments first" }, { status: 400 });
  }

  const comments = JSON.parse(fs.readFileSync(filePath, "utf-8")) as DeskTicketCommentRaw[];
  console.log(`[desk-ticket-comments] read ${comments.length} raw comments from desk-ticket-comments.json`);

  if (comments.length === 0) {
    return NextResponse.json({ error: "No comments found in desk-ticket-comments.json" }, { status: 400 });
  }

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
        return NextResponse.json({ error: `Could not fetch tickets: ${ticketFetchError.message}` }, { status: 500 });
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
    const body = c.plainText ?? c.content ?? "";
    if (!externalId || !body) { result.skipped++; continue; }

    const ticketId = ticketMap.get(String(c._zoho_ticket_id ?? ""));
    if (!ticketId) {
      result.errors.push(`comment ${externalId}: no Hub ticket found for _zoho_ticket_id=${c._zoho_ticket_id}`);
      result.skipped++;
      continue;
    }

    const commenter = c.commenter ?? c.commentedBy ?? null;
    const email = commenter?.email?.toLowerCase();
    const authorId = email ? (userCache.get(email) ?? null) : null;

    rows.push({
      ticket_id: ticketId,
      author_type: "staff",
      author_id: authorId,
      body,
      visibility: c.isPublic ? "public" : "internal",
      external_id: externalId,
      created_at: c.commentedTime ?? undefined,
      source_meta: {
        commenter: commenter ?? null,
        contentType: c.contentType ?? null,
        modifiedTime: c.modifiedTime ?? null,
        attachments: (c.attachments ?? []).map((a) => ({ name: a.name, size: a.size, id: a.id })),
      },
    });
  }

  console.log(`[desk-ticket-comments] upserting ${rows.length} rows in chunks of ${CHUNK_SIZE} (${result.skipped} skipped)`);

  for (let i = 0; i < rows.length; i += CHUNK_SIZE) {
    const chunk = rows.slice(i, i + CHUNK_SIZE);
    const { error } = await upsertChunkWithRetry(chunk);
    const chunkNum = Math.floor(i / CHUNK_SIZE) + 1;
    const totalChunks = Math.ceil(rows.length / CHUNK_SIZE);
    if (error) {
      console.error(`[desk-ticket-comments] chunk ${chunkNum}/${totalChunks} failed after ${MAX_UPSERT_RETRIES} attempts:`, error);
      result.errors.push(`chunk ${chunkNum}: ${error}`);
    } else {
      console.log(`[desk-ticket-comments] chunk ${chunkNum}/${totalChunks} upserted (${chunk.length} rows)`);
      result.imported += chunk.length;
    }
  }

  console.log(`[desk-ticket-comments] done: ${result.imported} imported, ${result.skipped} skipped, ${result.errors.length} error(s)`);
  return NextResponse.json(result);
}
