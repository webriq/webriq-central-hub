// dev-only import endpoint — reads _from_zoho/desk-threads.json, upserts to ticket_messages.
// Unlike Desk Ticket Comments (always agent-authored, author_type: 'staff'), Threads are the
// actual customer<->agent conversation — author_type is derived per row from `direction`/
// `author.type` (task 304): 'staff' for agent-authored, 'client' for customer-authored.
// Customer-authored rows never resolve author_id — Desk contacts have no Hub auth.users row
// (same precedent as tickets.requester_profile_id staying null for imports, task 296).
//
// NOTE: the exact field names for a Desk thread's timestamp were not confirmed from
// documentation during planning — this checks a couple of plausible field names defensively
// (createdTime, commentedTime) and falls back to the upsert-time default if none match.
// Confirm against a real desk-threads.json sample and adjust if needed.
//
// Confirmed against a real 1,150-thread export (task 304 follow-up): Threads never carry a
// `plainText` field the way Comments do, so `body` always ends up as raw `content` (HTML,
// contentType is "text/html" on every record seen) — `source_meta.contentType` is captured so
// any future renderer of `ticket_messages.body` knows to treat it as HTML, not plain text.
import { NextResponse } from "next/server";
import path from "path";
import fs from "fs";
import { createClient } from "@/lib/supabase/server";
import { adminClient, ImportResult } from "@/lib/migrate/zoho-import";

type DeskThreadAuthorRaw = { type?: string; name?: string; email?: string } | null | undefined;

type DeskThreadRaw = {
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

export async function POST() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: profile } = await adminClient.from("profiles").select("role").eq("id", user.id).maybeSingle();
  if (profile?.role !== "admin" && profile?.role !== "super_admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const filePath = path.join(process.cwd(), "_from_zoho", "desk-threads.json");
  if (!fs.existsSync(filePath)) {
    return NextResponse.json({ error: "Could not find _from_zoho/desk-threads.json — export Desk Threads first" }, { status: 400 });
  }

  const threads = JSON.parse(fs.readFileSync(filePath, "utf-8")) as DeskThreadRaw[];
  console.log(`[desk-threads] read ${threads.length} raw threads from desk-threads.json`);

  if (threads.length === 0) {
    return NextResponse.json({ error: "No threads found in desk-threads.json" }, { status: 400 });
  }

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
        return NextResponse.json({ error: `Could not fetch tickets: ${ticketFetchError.message}` }, { status: 500 });
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
    const body = t.plainText ?? t.content ?? "";
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
        hasAttach: t.hasAttach ?? null,
        attachmentCount: t.attachmentCount ?? null,
        attachments: (t.attachments ?? []).map((a) => ({
          id: a.id, name: a.name, size: a.size, status: a.status, href: a.href, previewurl: a.previewurl,
        })),
      },
    });
  }

  console.log(`[desk-threads] upserting ${rows.length} rows in chunks of ${CHUNK_SIZE} (${result.skipped} skipped)`);

  for (let i = 0; i < rows.length; i += CHUNK_SIZE) {
    const chunk = rows.slice(i, i + CHUNK_SIZE);
    const { error } = await upsertChunkWithRetry(chunk);
    const chunkNum = Math.floor(i / CHUNK_SIZE) + 1;
    const totalChunks = Math.ceil(rows.length / CHUNK_SIZE);
    if (error) {
      console.error(`[desk-threads] chunk ${chunkNum}/${totalChunks} failed after ${MAX_UPSERT_RETRIES} attempts:`, error);
      result.errors.push(`chunk ${chunkNum}: ${error}`);
    } else {
      console.log(`[desk-threads] chunk ${chunkNum}/${totalChunks} upserted (${chunk.length} rows)`);
      result.imported += chunk.length;
    }
  }

  console.log(`[desk-threads] done: ${result.imported} imported, ${result.skipped} skipped, ${result.errors.length} error(s)`);
  return NextResponse.json(result);
}
