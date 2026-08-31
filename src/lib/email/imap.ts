import { ImapFlow } from "imapflow";
import { simpleParser } from "mailparser";
import type { ZohoMailMessageSummary } from "@/lib/zoho/mail";

// IMAP fallback for inline (cid-referenced) images on inbound ticket emails (task 321). Zoho
// Mail's REST API (getMessageDetail in ./mail.ts) does not expose inline images as fetchable
// attachments — verified empirically: the attachments array comes back empty for messages with
// real embedded inline images, and the ImageDisplay src the API's HTML contains rejects our
// OAuth token (redirects to Zoho's own login page). Raw MIME via IMAP contains inline image
// parts as real bytes, keyed by Content-ID — no session-cookie problem.
//
// Read-only: ImapFlow's download() issues BODY.PEEK[], which does not mark a message \Seen —
// verified live before writing this file. No send, no delete, no flag mutation anywhere here.
//
// Correlation: Zoho's REST messageId (ticket_messages.email_message_id) has no confirmed IMAP
// counterpart. The ORIGINALLY-PLANNED approach — correlating via a stored ticket_messages row's
// created_at — was tested live and found unreliable (created_at reflects insert time, not the
// email's real arrival time; off by 20 hours to 17 days on real rows). The forward poll path
// (fetchInlineImages) correlates using `summary.receivedTime`/`fromAddress` from the SAME
// listNewMessages() call already driving ticket creation — never a value re-derived from a
// stored DB timestamp. The backfill path (fetchInlineImagesForBackfill, task 322) has no live
// poll cycle, so it prefers an exact RFC822 Message-ID header match and falls back to the same
// FROM correlation. The FROM correlation is `SEARCH FROM <addr>` then nearest IMAP INTERNALDATE
// to the target receipt time within a tight window — NOT `SEARCH SINCE/BEFORE`, which task 341
// verified returns zero results against Zoho's IMAP server even for messages plainly in range.
// No confident match -> [].

export type InlineImage = {
  cid: string;
  content: Buffer;
  contentType: string;
  filename: string;
  size: number;
};

const CONFIDENCE_WINDOW_MS = 5 * 60 * 1000; // 5 minutes
// A single sender's history in a helpdesk mailbox is realistically in the hundreds; cap the
// per-sender envelope fetch defensively so a mailing-list-style address can't blow up the call.
const MAX_FROM_MATCHES_TO_INSPECT = 2000;

type ImapConfig = { host: string; port: number; user: string; pass: string };

function getImapConfig(): ImapConfig | null {
  const host = process.env.ZOHO_MAIL_IMAP_HOST;
  const port = process.env.ZOHO_MAIL_IMAP_PORT;
  const user = process.env.ZOHO_MAIL_FROM_ADDRESS;
  const pass = process.env.ZOHO_MAIL_IMAP_APP_PASSWORD;
  if (!host || !port || !user || !pass) return null;
  return { host, port: Number(port), user, pass };
}

// Whether the IMAP env trio is present. Callers use this only to distinguish "IMAP not
// configured for this environment" from "configured but no confident message match" when
// reporting an unresolved inline image — never to gate behavior (fetchInlineImages already
// degrades to [] on its own). Task 341: prod ran for weeks with these unset and no signal.
export function isImapConfigured(): boolean {
  return getImapConfig() !== null;
}

// Correlates by `SEARCH FROM <addr>` then picks the match whose IMAP INTERNALDATE is closest to
// `receivedTimeMs` (Zoho REST's receipt time) — returned only if that gap is inside the tight
// confidence window. Ambiguous / nothing close enough -> null (never a guess).
//
// Deliberately does NOT use IMAP `SEARCH SINCE/BEFORE`: verified live (task 341) that Zoho's IMAP
// server returns zero results for a bare `SEARCH SINCE x BEFORE y` even when messages plainly
// exist in that range (a bare `SEARCH FROM` against the same mailbox works fine). INTERNALDATE
// tracks Zoho's `receivedTime` to the second, so a FROM-scoped nearest-INTERNALDATE match is both
// more reliable and more precise than the old date-window approach.
async function findUidByDateAndFrom(
  client: ImapFlow,
  params: { fromAddress: string; receivedTimeMs: number }
): Promise<number | null> {
  const { fromAddress, receivedTimeMs } = params;
  const searchResult = await client.search({ from: fromAddress }, { uid: true });
  const uids = Array.isArray(searchResult) ? searchResult : [];
  if (uids.length === 0) return null;

  // UIDs are ascending (oldest first); the newest slice covers the gap-window backfill and every
  // forward-poll case. An older-message backfill from a prolific sender is the only case this
  // could miss, and that path also has the Message-ID fallback.
  const toInspect = uids.length > MAX_FROM_MATCHES_TO_INSPECT ? uids.slice(-MAX_FROM_MATCHES_TO_INSPECT) : uids;

  let bestUid: number | null = null;
  let bestDiff = Infinity;
  for await (const msg of client.fetch(toInspect, { internalDate: true, uid: true }, { uid: true })) {
    if (!msg.internalDate) continue;
    const diff = Math.abs(new Date(msg.internalDate).getTime() - receivedTimeMs);
    if (diff < bestDiff) {
      bestDiff = diff;
      bestUid = msg.uid;
    }
  }

  return bestUid !== null && bestDiff <= CONFIDENCE_WINDOW_MS ? bestUid : null;
}

// Exact match on the RFC822 Message-ID header. Unambiguous when it hits — used first by the
// backfill path (task 322). Returns null if 0 or >1 matches (a duplicate would mean guessing).
async function findUidByMessageIdHeader(client: ImapFlow, rfc822MessageId: string): Promise<number | null> {
  const normalized = rfc822MessageId.trim().replace(/^<|>$/g, "");
  if (!normalized) return null;
  const uids = await client.search({ header: { "message-id": normalized } }, { uid: true });
  return uids && uids.length === 1 ? uids[0] : null;
}

function parseImapError(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

async function withInboxConnection<T>(
  fn: (client: ImapFlow) => Promise<T>,
  fallback: T
): Promise<T> {
  const config = getImapConfig();
  if (!config) return fallback;

  const client = new ImapFlow({
    host: config.host,
    port: config.port,
    secure: true,
    auth: { user: config.user, pass: config.pass },
    logger: false,
  });

  try {
    await client.connect();
  } catch (e) {
    console.warn("[imap] connect failed:", parseImapError(e));
    return fallback;
  }

  try {
    const lock = await client.getMailboxLock("INBOX");
    try {
      return await fn(client);
    } finally {
      lock.release();
    }
  } catch (e) {
    console.warn("[imap] operation failed:", parseImapError(e));
    return fallback;
  } finally {
    await client.logout().catch(() => {});
  }
}

// BODY.PEEK[] — does not set \Seen. Downloads the whole raw MIME message by uid and returns
// the inline (cid-keyed) image parts.
async function downloadInlineImages(client: ImapFlow, uid: number): Promise<InlineImage[]> {
  const { content } = await client.download(String(uid), undefined, { uid: true });
  const chunks: Buffer[] = [];
  for await (const chunk of content) chunks.push(chunk as Buffer);
  const raw = Buffer.concat(chunks);

  const parsed = await simpleParser(raw);
  return parsed.attachments
    .filter((a) => !!a.cid)
    .map((a) => ({
      cid: a.cid as string,
      content: a.content,
      contentType: a.contentType,
      filename: a.filename ?? `${a.cid}`,
      size: a.size,
    }));
}

// Forward poll path (task 321). Never throws — any failure (not configured, connect error, no
// confident match, parse error) degrades to an empty result so a poll never fails because of
// this best-effort enrichment.
export async function fetchInlineImages(summary: ZohoMailMessageSummary): Promise<InlineImage[]> {
  return withInboxConnection(async (client) => {
    const uid = await findUidByDateAndFrom(client, {
      fromAddress: summary.fromAddress,
      receivedTimeMs: Number(summary.receivedTime),
    });
    if (uid === null) return [];
    return downloadInlineImages(client, uid);
  }, [] as InlineImage[]);
}

// Diagnostic (task 341) — runs the same FROM + nearest-INTERNALDATE correlation as
// fetchInlineImages() but returns a detailed report instead of just the images, so a "found the
// message but got no inline parts" outcome on the backfill route's dry run is explainable
// (wrong candidate? window miss? no Content-ID on the MIME parts?). Not used by the forward poll
// path. Read-only (BODY.PEEK[]).
export async function inspectInlineImageCorrelation(
  summary: ZohoMailMessageSummary
): Promise<Record<string, unknown>> {
  const receivedTimeMs = Number(summary.receivedTime);
  return withInboxConnection<Record<string, unknown>>(
    async (client) => {
      const toUids = (r: unknown) => (Array.isArray(r) ? (r as number[]) : []);
      const fromUids = toUids(await client.search({ from: summary.fromAddress }, { uid: true }));

      const candidates: { uid: number; internalDate: string | null; diffMs: number | null; subject?: string }[] = [];
      const toInspect = fromUids.length > MAX_FROM_MATCHES_TO_INSPECT ? fromUids.slice(-MAX_FROM_MATCHES_TO_INSPECT) : fromUids;
      if (toInspect.length) {
        for await (const msg of client.fetch(toInspect, { envelope: true, internalDate: true, uid: true }, { uid: true })) {
          const d = msg.internalDate ? new Date(msg.internalDate) : null;
          candidates.push({
            uid: msg.uid,
            internalDate: d ? d.toISOString() : null,
            diffMs: d ? Math.abs(d.getTime() - receivedTimeMs) : null,
            subject: msg.envelope?.subject,
          });
        }
      }
      candidates.sort((a, b) => (a.diffMs ?? Infinity) - (b.diffMs ?? Infinity));
      const best = candidates[0];
      const withinWindow = !!best && best.diffMs !== null && best.diffMs <= CONFIDENCE_WINDOW_MS;

      const report: Record<string, unknown> = {
        receivedTimeIso: new Date(receivedTimeMs).toISOString(),
        from: summary.fromAddress,
        confidenceWindowMs: CONFIDENCE_WINDOW_MS,
        fromMatchCount: fromUids.length,
        closestCandidates: candidates.slice(0, 5),
        bestUid: best?.uid ?? null,
        bestDiffMs: best?.diffMs ?? null,
        withinConfidenceWindow: withinWindow,
      };

      if (withinWindow && best) {
        const { content } = await client.download(String(best.uid), undefined, { uid: true });
        const chunks: Buffer[] = [];
        for await (const chunk of content) chunks.push(chunk as Buffer);
        const parsed = await simpleParser(Buffer.concat(chunks));
        report.parsedAttachments = parsed.attachments.map((a) => ({
          cid: a.cid ?? null,
          contentType: a.contentType,
          contentDisposition: a.contentDisposition ?? null,
          filename: a.filename ?? null,
          size: a.size,
        }));
        report.inlineImagePartCount = parsed.attachments.filter((a) => !!a.cid).length;
        report.htmlHasImageDisplay = typeof parsed.html === "string" && parsed.html.includes("/mail/ImageDisplay");
        report.htmlHasCidSrc = typeof parsed.html === "string" && /src=["']cid:/i.test(parsed.html);
      }

      return report;
    },
    { error: "IMAP operation failed or not configured" }
  );
}

export type BackfillCorrelation =
  | { matched: false; reason: string }
  | { matched: true; strategy: "message-id" | "date-from"; images: InlineImage[] };

// Backfill path (task 322). Given whatever correlation data a stored ticket_messages row can
// yield (via Zoho REST metadata — see getMessageMetadata in ./mail.ts), resolve the inline
// images. Prefers an exact RFC822 Message-ID header match; falls back to the date+FROM window.
// Never throws; returns a structured result so the caller can record unresolved messages.
export async function fetchInlineImagesForBackfill(params: {
  fromAddress: string;
  receivedTimeMs?: number | null;
  rfc822MessageId?: string | null;
}): Promise<BackfillCorrelation> {
  if (!getImapConfig()) return { matched: false, reason: "IMAP not configured" };

  return withInboxConnection<BackfillCorrelation>(
    async (client) => {
      if (params.rfc822MessageId) {
        const uid = await findUidByMessageIdHeader(client, params.rfc822MessageId);
        if (uid !== null) {
          return { matched: true, strategy: "message-id", images: await downloadInlineImages(client, uid) };
        }
      }

      if (params.fromAddress && params.receivedTimeMs) {
        const uid = await findUidByDateAndFrom(client, {
          fromAddress: params.fromAddress,
          receivedTimeMs: params.receivedTimeMs,
        });
        if (uid !== null) {
          return { matched: true, strategy: "date-from", images: await downloadInlineImages(client, uid) };
        }
      }

      return { matched: false, reason: "no confident IMAP match" };
    },
    { matched: false, reason: "IMAP operation failed" }
  );
}
