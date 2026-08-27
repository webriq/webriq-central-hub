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
import { getMessageMetadata } from "@/lib/zoho/mail";
import { fetchInlineImagesForBackfill } from "@/lib/email/imap";
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
  tickets: { ticket_number: number } | null;
};

type Unresolved = { ticketNumber: number | null; messageId: string; reason: string };

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
      .select("id, ticket_id, body, email_message_id, tickets(ticket_number)")
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

  const unresolved: Unresolved[] = [];
  let matched = 0;
  let imagesStored = 0;
  let messagesRewritten = 0;
  const strategies: Record<string, number> = {};

  for (const row of candidates) {
    const ticketNumber = row.tickets?.ticket_number ?? null;
    const zohoMessageId = row.email_message_id as string;

    let metadata: Awaited<ReturnType<typeof getMessageMetadata>>;
    try {
      metadata = await getMessageMetadata(zohoMessageId, folderId);
    } catch (e) {
      unresolved.push({
        ticketNumber,
        messageId: row.id,
        reason: `Zoho metadata fetch failed: ${e instanceof Error ? e.message : String(e)}`,
      });
      continue;
    }

    const correlation = await fetchInlineImagesForBackfill({
      fromAddress: metadata.fromAddress ?? "",
      receivedTimeMs: metadata.receivedTime ? Number(metadata.receivedTime) : null,
      rfc822MessageId: metadata.rfc822MessageId,
    });

    if (!correlation.matched) {
      unresolved.push({ ticketNumber, messageId: row.id, reason: correlation.reason });
      continue;
    }
    matched++;
    strategies[correlation.strategy] = (strategies[correlation.strategy] ?? 0) + 1;

    if (correlation.images.length === 0) {
      unresolved.push({ ticketNumber, messageId: row.id, reason: "matched, but source message has no inline image parts" });
      continue;
    }

    if (ticketNumber == null) {
      unresolved.push({ ticketNumber, messageId: row.id, reason: "ticket_number unresolved — cannot build serving URL" });
      continue;
    }

    if (dryRun) {
      imagesStored += correlation.images.length;
      continue;
    }

    const newBody = await applyInlineImages({
      messageRowId: row.id,
      ticketNumber,
      inlineImages: correlation.images,
      body: row.body,
    });
    imagesStored += correlation.images.length;

    if (newBody !== row.body) {
      const { error: updateError } = await adminClient
        .from("ticket_messages")
        .update({ body: newBody })
        .eq("id", row.id);
      if (updateError) {
        unresolved.push({ ticketNumber, messageId: row.id, reason: `body update failed: ${updateError.message}` });
        continue;
      }
      messagesRewritten++;
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
