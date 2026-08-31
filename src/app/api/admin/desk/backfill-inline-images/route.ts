// Backfill inline (cid-referenced) images for ticket_messages that predate task 321 (task 322).
// Manually triggered, admin-only, bounded, re-runnable. Walks already-stored client messages
// whose body still carries a dead Zoho inline-image reference (/mail/ImageDisplay?...cid=... or
// raw src="cid:..."), resolves the image bytes over the same read-only IMAP path the forward
// poll uses, stores them via the shared applyInlineImages() helper, and rewrites the stored
// body to point at task 321's inline-image serving route.
//
// Not a cron. No schema change (attachments.cid exists, migration 123). Read-only IMAP only.
//
// Query params:
//   ?dryRun=1        — report what would happen, write nothing
//   ?limit=N         — cap messages processed this call (default 25)
//   ?ticketNumber=N  — restrict to a single ticket (use this to verify before a wider run)
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { adminClient } from "@/lib/supabase/admin";
import { getMessageMetadata, listNewMessages, type ZohoMailMessageSummary } from "@/lib/zoho/mail";
import {
  fetchInlineImages,
  fetchInlineImagesForBackfill,
  inspectInlineImageCorrelation,
  type InlineImage,
} from "@/lib/email/imap";
import { applyInlineImages } from "@/lib/email/inline-images";
import { UNRESOLVED_INLINE_IMAGE_PATTERN } from "@/lib/email/inbound";

const PAGE = 1000;
const DEFAULT_LIMIT = 25;
const SCAN_CAP = 10000; // hard ceiling on rows examined per call, independent of `limit`

type CandidateRow = {
  id: string;
  ticket_id: string;
  body: string;
  email_message_id: string | null;
  tickets: { ticket_id: string } | null;
};

type Unresolved = { ticketId: string | null; messageId: string; reason: string; debug?: Record<string, unknown> };

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: profile } = await adminClient.from("profiles").select("role").eq("id", user.id).maybeSingle();
  if (profile?.role !== "admin" && profile?.role !== "super_admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const folderId = process.env.ZOHO_MAIL_INBOX_FOLDER_ID;
  if (!folderId) {
    return NextResponse.json({ error: "ZOHO_MAIL_INBOX_FOLDER_ID is not configured" }, { status: 500 });
  }

  const url = new URL(req.url);
  const dryRun = url.searchParams.get("dryRun") === "1" || url.searchParams.get("dryRun") === "true";
  const limitParam = Number(url.searchParams.get("limit"));
  const limit = Number.isInteger(limitParam) && limitParam > 0 ? limitParam : DEFAULT_LIMIT;
  const ticketNumberParam = url.searchParams.get("ticketNumber");

  let ticketIdFilter: string | null = null;
  if (ticketNumberParam != null) {
    const n = Number(ticketNumberParam);
    if (!Number.isInteger(n)) return NextResponse.json({ error: "Invalid ticketNumber" }, { status: 400 });
    const { data: ticket } = await adminClient.from("tickets").select("id").eq("ticket_number", n).maybeSingle();
    if (!ticket) return NextResponse.json({ error: "Ticket not found" }, { status: 404 });
    ticketIdFilter = ticket.id;
  }

  // Collect candidates: client messages with a Zoho message id whose body still carries an
  // unresolved inline-image reference. The .or() ilike is a coarse pre-filter; the real gate
  // is the UNRESOLVED_INLINE_IMAGE_PATTERN re-test below (avoids ilike false positives).
  const candidates: CandidateRow[] = [];
  let scanned = 0;
  for (let from = 0; from < SCAN_CAP && candidates.length < limit; from += PAGE) {
    let q = adminClient
      .from("ticket_messages")
      .select("id, ticket_id, body, email_message_id, tickets(ticket_id)")
      .eq("author_type", "client")
      .not("email_message_id", "is", null)
      .or("body.ilike.%ImageDisplay%,body.ilike.%cid:%")
      .order("created_at", { ascending: false })
      .range(from, from + PAGE - 1);
    if (ticketIdFilter) q = q.eq("ticket_id", ticketIdFilter);

    const { data, error } = await q;
    if (error) return NextResponse.json({ error: `candidate query failed: ${error.message}` }, { status: 500 });
    const rows = (data ?? []) as unknown as CandidateRow[];
    scanned += rows.length;

    for (const row of rows) {
      if (candidates.length >= limit) break;
      if (UNRESOLVED_INLINE_IMAGE_PATTERN.test(row.body)) candidates.push(row);
    }
    if (rows.length < PAGE) break;
  }

  // Preferred correlation (task 341): reconstruct the real ZohoMailMessageSummary from a fresh
  // INBOX list and run the exact trusted forward path (fetchInlineImages) — the poll cron
  // correlates on summary.receivedTime/fromAddress from listNewMessages() and that is reliable.
  // getMessageMetadata's /details endpoint shape is UNVERIFIED and was observed returning
  // insufficient fields for recent gap-window messages (dry run -> "no confident IMAP match").
  // Fall back to the metadata path only for messages that have aged out of the recent window.
  let recentByMessageId = new Map<string, ZohoMailMessageSummary>();
  try {
    const recent = await listNewMessages({ folderId, limit: 200 });
    recentByMessageId = new Map(recent.map((m) => [m.messageId, m]));
  } catch (e) {
    console.warn("[backfill-inline-images] listNewMessages failed — metadata fallback only:", e);
  }

  const unresolved: Unresolved[] = [];
  let matched = 0;
  let imagesStored = 0;
  let messagesRewritten = 0;
  const strategies: Record<string, number> = {};

  for (const row of candidates) {
    const ticketDisplayId = row.tickets?.ticket_id ?? null;
    const zohoMessageId = row.email_message_id as string;

    let images: InlineImage[];
    let strategy: string;
    let debug: Record<string, unknown> | undefined;
    const summary = recentByMessageId.get(zohoMessageId);

    if (summary) {
      // Trusted forward path — identical to what the poll cron runs.
      images = await fetchInlineImages(summary);
      strategy = "list-summary";
      if (dryRun) debug = { path: "list-summary", from: summary.fromAddress, receivedTime: summary.receivedTime };
      if (images.length === 0) {
        // Dig into WHY: window miss vs. no Content-ID on the MIME parts vs. wrong candidate.
        const inspection = dryRun ? await inspectInlineImageCorrelation(summary) : undefined;
        unresolved.push({
          ticketId: ticketDisplayId,
          messageId: row.id,
          reason: "found in recent INBOX list but IMAP returned no inline parts (source moved out of INBOX, or has no cid parts)",
          ...(debug || inspection ? { debug: { ...debug, inspection } } : {}),
        });
        continue;
      }
    } else {
      // Metadata fallback — message aged out of the recent INBOX list.
      let metadata: Awaited<ReturnType<typeof getMessageMetadata>>;
      try {
        metadata = await getMessageMetadata(zohoMessageId, folderId);
      } catch (e) {
        unresolved.push({
          ticketId: ticketDisplayId,
          messageId: row.id,
          reason: `Zoho metadata fetch failed: ${e instanceof Error ? e.message : String(e)}`,
        });
        continue;
      }

      if (dryRun) debug = { path: "metadata-fallback", metadata };

      const correlation = await fetchInlineImagesForBackfill({
        fromAddress: metadata.fromAddress ?? "",
        receivedTimeMs: metadata.receivedTime ? Number(metadata.receivedTime) : null,
        rfc822MessageId: metadata.rfc822MessageId,
      });

      if (!correlation.matched) {
        unresolved.push({ ticketId: ticketDisplayId, messageId: row.id, reason: correlation.reason, ...(debug ? { debug } : {}) });
        continue;
      }
      if (correlation.images.length === 0) {
        unresolved.push({
          ticketId: ticketDisplayId,
          messageId: row.id,
          reason: "matched, but source message has no inline image parts",
          ...(debug ? { debug } : {}),
        });
        continue;
      }
      images = correlation.images;
      strategy = correlation.strategy;
    }

    matched++;
    strategies[strategy] = (strategies[strategy] ?? 0) + 1;

    if (ticketDisplayId == null) {
      unresolved.push({ ticketId: ticketDisplayId, messageId: row.id, reason: "ticket_id unresolved — cannot build serving URL" });
      continue;
    }

    if (dryRun) {
      imagesStored += images.length;
      continue;
    }

    const { body: newBody, storedButUnmatchedCids } = await applyInlineImages({
      messageRowId: row.id,
      ticketId: ticketDisplayId,
      inlineImages: images,
      body: row.body,
    });
    imagesStored += images.length;

    if (newBody !== row.body) {
      const { error: updateError } = await adminClient
        .from("ticket_messages")
        .update({ body: newBody })
        .eq("id", row.id);
      if (updateError) {
        unresolved.push({ ticketId: ticketDisplayId, messageId: row.id, reason: `body update failed: ${updateError.message}` });
        continue;
      }
      messagesRewritten++;
    }

    // Bytes stored + attachments row upserted, but rewriteInlineImageSrc left (some of) the
    // <img src> untouched because the mailparser Content-ID does not appear in the stored src.
    // Previously invisible — counted toward imagesStored, no unresolved entry, body still
    // broken. Task 341: surface it (the message may still be partially rewritten above).
    if (storedButUnmatchedCids.length > 0) {
      unresolved.push({
        ticketId: ticketDisplayId,
        messageId: row.id,
        reason: `images stored but body <img src> not rewritten — cid token absent from stored src: ${storedButUnmatchedCids.join(", ")}`,
      });
    }
  }

  return NextResponse.json({
    dryRun,
    scanned,
    candidates: candidates.length,
    matched,
    strategies,
    imagesStored,
    messagesRewritten,
    unresolvedCount: unresolved.length,
    unresolved,
  });
}
