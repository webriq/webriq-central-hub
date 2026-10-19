// Backfill regular email attachments for inbox_messages polled before task 456. Until then
// getMessageDetail() read attachments from Zoho's /content endpoint, which never returns them,
// so every polled email was stored with zero attachments. Manually triggered, admin-only,
// bounded, re-runnable — same shape as backfill-inline-images (task 322).
//
// inbox_messages.email_message_id IS the Zoho messageId, so no IMAP/metadata correlation is
// needed; only the folder can be wrong (message moved/deleted), which surfaces as a Zoho error
// in `unresolved` and leaves the message unstamped for a later retry. A checked message is
// stamped source_meta.attachmentsBackfilledAt so ones with no attachments aren't re-checked.
//
// Query params:
//   ?dryRun=1        — list what would be stored (calls Zoho attachmentinfo), write nothing
//   ?limit=N         — cap messages checked this call (default 25)
//   ?ticketNumber=N  — restrict to a single ticket (use this to verify before a wider run)
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { adminClient } from "@/lib/supabase/admin";
import { getAttachmentInfo } from "@/lib/zoho/mail";
import { storeEmailAttachments } from "@/lib/email/attachments";

const PAGE = 1000;
const DEFAULT_LIMIT = 25;
const SCAN_CAP = 10000; // hard ceiling on rows examined per call, independent of `limit`

type CandidateRow = {
  id: string;
  email_message_id: string;
  source_meta: Record<string, unknown> | null;
  inbox: { ticket_number: number | null } | null;
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
    const { data: ticket } = await adminClient.from("inbox").select("id").eq("ticket_number", n).maybeSingle();
    if (!ticket) return NextResponse.json({ error: "Ticket not found" }, { status: 404 });
    ticketIdFilter = ticket.id;
  }

  // Candidates: unstamped client email messages that hold no regular attachment row yet.
  const candidates: CandidateRow[] = [];
  let scanned = 0;
  for (let from = 0; from < SCAN_CAP && candidates.length < limit; from += PAGE) {
    let q = adminClient
      .from("inbox_messages")
      .select("id, email_message_id, source_meta, inbox(ticket_number)")
      .eq("author_type", "client")
      .not("email_message_id", "is", null)
      .is("source_meta->>attachmentsBackfilledAt", null)
      .order("created_at", { ascending: false })
      .range(from, from + PAGE - 1);
    if (ticketIdFilter) q = q.eq("inbox_id", ticketIdFilter);

    const { data, error } = await q;
    if (error) return NextResponse.json({ error: `candidate query failed: ${error.message}` }, { status: 500 });
    const rows = (data ?? []) as unknown as CandidateRow[];
    scanned += rows.length;
    if (rows.length === 0) break;

    const { data: existing, error: attError } = await adminClient
      .from("attachments")
      .select("entity_id")
      .eq("entity_type", "inbox_message")
      .is("cid", null)
      .in(
        "entity_id",
        rows.map((r) => r.id)
      );
    if (attError) return NextResponse.json({ error: `attachments lookup failed: ${attError.message}` }, { status: 500 });
    const hasFiles = new Set((existing ?? []).map((a) => a.entity_id));

    for (const row of rows) {
      if (candidates.length >= limit) break;
      if (!hasFiles.has(row.id)) candidates.push(row);
    }
    if (rows.length < PAGE) break;
  }

  const unresolved: Unresolved[] = [];
  const found: { ticketNumber: number | null; messageId: string; files: string[] }[] = [];
  let checked = 0;
  let attachmentsStored = 0;

  for (const row of candidates) {
    const ticketNumber = row.inbox?.ticket_number ?? null;

    let attachments: Awaited<ReturnType<typeof getAttachmentInfo>>;
    try {
      attachments = await getAttachmentInfo(row.email_message_id, folderId);
    } catch (e) {
      unresolved.push({ ticketNumber, messageId: row.id, reason: e instanceof Error ? e.message : String(e) });
      continue;
    }
    checked++;
    if (attachments.length > 0) found.push({ ticketNumber, messageId: row.id, files: attachments.map((a) => a.fileName) });
    if (dryRun) continue;

    const { stored, failed } = await storeEmailAttachments({
      messageRowId: row.id,
      zohoMessageId: row.email_message_id,
      folderId,
      attachments,
    });
    attachmentsStored += stored;
    if (failed.length > 0) {
      // Leave unstamped so the next run retries; already-stored files are upserts.
      unresolved.push({
        ticketNumber,
        messageId: row.id,
        reason: failed.map((f) => `${f.attachmentId}: ${f.reason}`).join("; "),
      });
      continue;
    }

    const { error: stampError } = await adminClient
      .from("inbox_messages")
      .update({ source_meta: { ...(row.source_meta ?? {}), attachmentsBackfilledAt: new Date().toISOString() } })
      .eq("id", row.id);
    if (stampError) unresolved.push({ ticketNumber, messageId: row.id, reason: `stamp failed: ${stampError.message}` });
  }

  return NextResponse.json({
    dryRun,
    scanned,
    candidates: candidates.length,
    checked,
    withAttachments: found.length,
    attachmentsStored,
    found,
    unresolvedCount: unresolved.length,
    unresolved,
  });
}
