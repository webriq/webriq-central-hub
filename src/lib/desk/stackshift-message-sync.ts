// Shared Desk/StackShift ticket-message sync logic (task 390) — extracted from
// src/app/api/cron/desk-ticket-poll/route.ts (task 388/389) so the live cron and the
// backfill-stackshift-messages admin route (task 390) call exactly one implementation instead
// of drifting into two copies. That drift is the exact class of bug task 389 fixed (task 388's
// route reimplemented thread-fetching logic instead of reusing the already-validated
// exportThreadsForTickets() enrichment pattern) — do not duplicate this module's logic
// elsewhere; import it instead.
import { adminClient } from "@/lib/supabase/admin";
import { fetchZohoWithRetry } from "@/lib/zoho";
import { fetchAllDeskPages, enrichThreadContent, DESK_MESSAGE_CONTENT_TYPE, deskHeaders } from "@/lib/zoho/desk";

// Same bucket/limit the dev-only ticket-attachments importer and email-poll's own attachment
// ingestion already use (src/app/api/admin/zoho-import/ticket-attachments/route.ts) — kept in
// sync manually since there's no shared constants module for this.
const ATTACHMENTS_BUCKET = "ticket-attachments";
const MAX_ATTACHMENT_SIZE = 52428800; // 50MB — matches the bucket's file_size_limit (migration 117)

export type DeskAttachment = {
  id?: string | number;
  name?: string;
  size?: string | number;
  href?: string;
  [key: string]: unknown;
};

export type DeskThread = {
  id?: string | number;
  content?: string | null;
  plainText?: string | null;
  contentType?: string | null;
  createdTime?: string | null;
  commentedTime?: string | null;
  sendDateTime?: string | null;
  visibility?: string | null;
  author?: { type?: string | null; email?: string | null; name?: string | null } | null;
  direction?: string | null;
  attachments?: DeskAttachment[];
};

export type DeskComment = {
  id?: string | number;
  content?: string | null;
  plainText?: string | null;
  contentType?: string | null;
  commentedTime?: string | null;
  modifiedTime?: string | null;
  isPublic?: boolean;
  commenter?: { type?: string | null; email?: string | null; name?: string | null } | null;
  attachments?: DeskAttachment[];
};

export type SyncTicketMessagesResult = {
  token: string;
  messagesInserted: number;
  contentTypeRepaired: number;
  attachmentsAdded: number;
};

export type SyncTicketMessagesOptions = {
  // Task 390 — when true, an already-existing inbox_messages row (matched by external_id) gets
  // its stale source_meta.contentType patched to the normalized value. Default false so the
  // live cron's steady-state poll (src/app/api/cron/desk-ticket-poll/route.ts) stays cheap and
  // never rewrites already-correct rows on every run — only the backfill route opts in.
  // Never touches body/created_at/author_type/visibility — Desk message *content* really is
  // immutable once posted; only the ingestion-time contentType bug (task 389) gets repaired.
  repairExistingContentType?: boolean;
};

// Pulls both the opening message (the ticket's first thread — Zoho auto-creates this from the
// `description` passed to POST /tickets, per web/pages/api/support_desk/create-ticket.ts) and
// every follow-up comment (the ongoing conversation — see
// web/pages/api/support_desk/create-ticket-comment.ts / list-all-ticket-comments.ts).
//
// Idempotent via `inbox_messages.external_id` — the same column + unique constraint
// src/lib/migrate/desk-threads-import.ts / desk-comments-import.ts already use for the
// historical import of these same two Desk concepts (raw Desk thread/comment id), not the
// email-specific `email_message_id` column.
//
// Author-type / visibility field names mirror those two import files exactly, since they're
// already validated against real live Desk data (tasks 296/304): threads use
// `author.type`/`direction` + a top-level `visibility` string; comments use `commenter.type`
// (default to staff/agent UNLESS explicitly "END_USER" — most Desk comments are agent-authored)
// + a boolean `isPublic`.
export async function syncTicketMessages(
  token: string,
  ticketExternalId: string,
  inboxId: string,
  opts?: SyncTicketMessagesOptions
): Promise<SyncTicketMessagesResult> {
  let currentToken = token;
  let messagesInserted = 0;
  let contentTypeRepaired = 0;
  let attachmentsAdded = 0;

  const { items: threadItems, token: threadsToken } = await fetchAllDeskPages(
    `/tickets/${ticketExternalId}/threads`,
    currentToken,
    "desk-message-sync-threads",
    { params: { sortBy: "sendDateTime" } }
  );
  currentToken = threadsToken;

  // Task 389 — List Threads sometimes omits `content` (same gap exportThreadsForTickets()
  // already works around for the historical import); without this fill, any opening/customer
  // message whose list-response body is empty silently never syncs, and re-runs never retry it
  // since the "existing" check below only keys off external_id, not body completeness.
  const { items: enrichedThreadItems, token: enrichedToken } = await enrichThreadContent(
    threadItems,
    ticketExternalId,
    currentToken,
    "desk-message-sync-threads"
  );
  currentToken = enrichedToken;
  const threads = enrichedThreadItems as DeskThread[];

  const openingThread = [...threads].sort((a, b) => {
    const at = Date.parse(String(a.sendDateTime ?? a.createdTime ?? a.commentedTime ?? ""));
    const bt = Date.parse(String(b.sendDateTime ?? b.createdTime ?? b.commentedTime ?? ""));
    return (Number.isFinite(at) ? at : 0) - (Number.isFinite(bt) ? bt : 0);
  })[0];

  const { items: comments, token: commentsToken } = await fetchAllDeskPages(
    `/tickets/${ticketExternalId}/comments`,
    currentToken,
    "desk-message-sync-comments"
  );
  currentToken = commentsToken;

  if (openingThread?.id != null) {
    const isAgent = openingThread.author?.type === "AGENT" || openingThread.direction === "out";
    const upserted = await upsertInboxMessage(
      inboxId,
      String(openingThread.id),
      {
        author_type: isAgent ? "staff" : "client",
        visibility: openingThread.visibility === "public" ? "public" : "internal",
        body: String(openingThread.content ?? openingThread.plainText ?? ""),
        created_at: toIso(openingThread.sendDateTime ?? openingThread.createdTime ?? openingThread.commentedTime),
        source_meta: {
          author: openingThread.author ?? null,
          direction: openingThread.direction ?? null,
          contentType: DESK_MESSAGE_CONTENT_TYPE,
          zohoSource: "thread",
        },
      },
      opts
    );
    if (upserted) {
      if (upserted.inserted) messagesInserted++;
      if (upserted.repaired) contentTypeRepaired++;
      const attachResult = await syncMessageAttachments(currentToken, upserted.id, openingThread.attachments ?? []);
      currentToken = attachResult.token;
      attachmentsAdded += attachResult.added;
    }
  }

  for (const raw of comments as DeskComment[]) {
    if (raw.id == null) continue;
    const isAgent = raw.commenter?.type !== "END_USER";
    const upserted = await upsertInboxMessage(
      inboxId,
      String(raw.id),
      {
        author_type: isAgent ? "staff" : "client",
        visibility: raw.isPublic ? "public" : "internal",
        body: String(raw.content ?? raw.plainText ?? ""),
        created_at: toIso(raw.commentedTime ?? raw.modifiedTime),
        source_meta: {
          commenter: raw.commenter ?? null,
          contentType: DESK_MESSAGE_CONTENT_TYPE,
          zohoSource: "comment",
        },
      },
      opts
    );
    if (upserted) {
      if (upserted.inserted) messagesInserted++;
      if (upserted.repaired) contentTypeRepaired++;
      const attachResult = await syncMessageAttachments(currentToken, upserted.id, raw.attachments ?? []);
      currentToken = attachResult.token;
      attachmentsAdded += attachResult.added;
    }
  }

  return { token: currentToken, messagesInserted, contentTypeRepaired, attachmentsAdded };
}

function toIso(value: string | null | undefined): string | undefined {
  if (!value) return undefined;
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? new Date(ms).toISOString() : undefined;
}

// Returns the inbox_messages row id (new or pre-existing) so the caller can attach attachments
// to it either way — a re-run against an already-synced message must still be able to backfill
// attachments that a prior run (pre-task-389) never downloaded. Returns null only when the row
// has no body to persist (matches the historical import's own skip-empty-body behavior).
async function upsertInboxMessage(
  inboxId: string,
  externalId: string,
  fields: {
    author_type: "client" | "staff";
    visibility: "public" | "internal";
    body: string;
    created_at: string | undefined;
    source_meta: Record<string, unknown>;
  },
  opts?: SyncTicketMessagesOptions
): Promise<{ id: string; inserted: boolean; repaired: boolean } | null> {
  if (!fields.body) return null;

  const { data: existing } = await adminClient
    .from("inbox_messages")
    .select("id, source_meta")
    .eq("external_id", externalId)
    .maybeSingle();

  if (existing) {
    // Body/author/visibility are immutable once posted — Desk threads/comments don't change
    // after the fact — but task 389 found the contentType written at ingestion time was wrong
    // for every Desk-sourced message. Task 390: patch only that one key, opt-in, idempotent.
    let repaired = false;
    if (opts?.repairExistingContentType) {
      const existingMeta = (existing.source_meta ?? {}) as Record<string, unknown>;
      const newContentType = fields.source_meta.contentType;
      if (newContentType != null && existingMeta.contentType !== newContentType) {
        const { error: patchError } = await adminClient
          .from("inbox_messages")
          .update({ source_meta: { ...existingMeta, contentType: newContentType } })
          .eq("id", existing.id as string);
        if (patchError) {
          console.warn(`[desk-message-sync] failed to repair contentType for message ${externalId}`, patchError.message);
        } else {
          repaired = true;
        }
      }
    }
    return { id: existing.id as string, inserted: false, repaired };
  }

  const { data: inserted, error } = await adminClient
    .from("inbox_messages")
    .insert({
      inbox_id: inboxId,
      author_type: fields.author_type,
      visibility: fields.visibility,
      body: fields.body,
      external_id: externalId,
      ...(fields.created_at ? { created_at: fields.created_at } : {}),
      source_meta: fields.source_meta,
    })
    .select("id")
    .single();
  if (error || !inserted) {
    console.error(`[desk-message-sync] failed to insert message ${externalId}`, error?.message);
    return null;
  }
  return { id: inserted.id as string, inserted: true, repaired: false };
}

// Downloads each thread/comment attachment and stores it the same way the dev-only
// ticket-attachments importer and email-poll's own live attachment ingestion already do: the
// `ticket-attachments` Storage bucket + the native `attachments` table
// (entity_type: 'inbox_message', entity_id = the specific inbox_messages row, external_id =
// Zoho's attachment id as the idempotency key). Skips any attachment already downloaded
// (checked before the network call, not just at upsert time) so a backfill re-run over
// already-repaired tickets does no redundant Desk API/Storage work. Per-attachment fault
// isolation — one failed download/upload must not drop the rest of the ticket's messages or
// attachments.
async function syncMessageAttachments(
  token: string,
  messageId: string,
  attachments: DeskAttachment[]
): Promise<{ token: string; added: number }> {
  if (attachments.length === 0) return { token, added: 0 };

  let currentToken = token;
  let added = 0;
  let headers: Record<string, string>;
  try {
    headers = deskHeaders();
  } catch {
    return { token: currentToken, added }; // ZOHO_DESK_ORG_ID not configured — already guarded at request entry, defensive only
  }

  for (const att of attachments) {
    const externalId = String(att.id ?? "");
    const href = att.href ?? "";
    const filename = att.name ?? externalId;
    if (!externalId || !href) continue;

    const { data: existingAttachment } = await adminClient
      .from("attachments")
      .select("id")
      .eq("external_id", externalId)
      .maybeSingle();
    if (existingAttachment) continue; // already downloaded — nothing to do

    try {
      const { res, token: nextToken, throttleExhausted } = await fetchZohoWithRetry(href, currentToken, {
        label: "stackshift-desk-attachment",
        headers,
      });
      currentToken = nextToken;

      if (throttleExhausted || !res.ok) {
        console.warn(`[desk-message-sync] attachment ${externalId} fetch failed (throttled=${throttleExhausted}, status=${res.status})`);
        continue;
      }

      const buffer = await res.arrayBuffer();
      if (buffer.byteLength > MAX_ATTACHMENT_SIZE) {
        console.warn(`[desk-message-sync] attachment ${externalId} exceeds ${MAX_ATTACHMENT_SIZE} bytes, skipping`);
        continue;
      }

      const safeName = `${messageId}/${externalId}_${filename.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
      const { error: uploadError } = await adminClient.storage
        .from(ATTACHMENTS_BUCKET)
        .upload(safeName, buffer, { upsert: true, contentType: res.headers.get("content-type") ?? undefined });
      if (uploadError) {
        console.warn(`[desk-message-sync] attachment ${externalId} storage upload failed`, uploadError.message);
        continue;
      }

      const declaredSize = att.size != null ? parseInt(String(att.size), 10) : null;
      const { error: dbError } = await adminClient.from("attachments").upsert(
        {
          external_id: externalId,
          entity_type: "inbox_message",
          entity_id: messageId,
          storage_path: safeName,
          filename,
          size: declaredSize ?? buffer.byteLength,
          source_url: href,
        },
        { onConflict: "external_id" }
      );
      if (dbError) {
        console.warn(`[desk-message-sync] attachment ${externalId} db upsert failed`, dbError.message);
      } else {
        added++;
      }
    } catch (e) {
      console.error(`[desk-message-sync] attachment ${externalId} processing failed`, e);
    }
  }

  return { token: currentToken, added };
}
