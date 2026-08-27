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
// email's real arrival time; off by 20 hours to 17 days on real rows). The correct approach,
// used below, is to correlate using `summary.receivedTime`/`fromAddress` from the SAME
// listNewMessages() call already driving ticket creation in the poll route — never a value
// re-derived from a stored DB timestamp. IMAP SEARCH SINCE/BEFORE is date-granular, not
// time-precise (RFC 3501), so this narrows by date+FROM first, then cross-checks each
// candidate's envelope date against summary.receivedTime client-side within a tight window.
// If no confident match, returns [] — never guesses at which message is the right one.

export type InlineImage = {
  cid: string;
  content: Buffer;
  contentType: string;
  filename: string;
  size: number;
};

const CONFIDENCE_WINDOW_MS = 5 * 60 * 1000; // 5 minutes
const SEARCH_WINDOW_MS = 24 * 60 * 60 * 1000; // 1 day either side (SINCE/BEFORE is date-granular)

type ImapConfig = { host: string; port: number; user: string; pass: string };

function getImapConfig(): ImapConfig | null {
  const host = process.env.ZOHO_MAIL_IMAP_HOST;
  const port = process.env.ZOHO_MAIL_IMAP_PORT;
  const user = process.env.ZOHO_MAIL_FROM_ADDRESS;
  const pass = process.env.ZOHO_MAIL_IMAP_APP_PASSWORD;
  if (!host || !port || !user || !pass) return null;
  return { host, port: Number(port), user, pass };
}

async function findBestMatchingUid(client: ImapFlow, summary: ZohoMailMessageSummary): Promise<number | null> {
  const receivedMs = Number(summary.receivedTime);
  const uids = await client.search(
    {
      since: new Date(receivedMs - SEARCH_WINDOW_MS),
      before: new Date(receivedMs + SEARCH_WINDOW_MS),
      from: summary.fromAddress,
    },
    { uid: true }
  );
  if (!uids || uids.length === 0) return null;

  let bestUid: number | null = null;
  let bestDiff = Infinity;
  for await (const msg of client.fetch(uids, { envelope: true, uid: true }, { uid: true })) {
    if (!msg.envelope?.date) continue;
    const diff = Math.abs(new Date(msg.envelope.date).getTime() - receivedMs);
    if (diff < bestDiff) {
      bestDiff = diff;
      bestUid = msg.uid;
    }
  }

  return bestUid !== null && bestDiff <= CONFIDENCE_WINDOW_MS ? bestUid : null;
}

// Never throws — any failure (not configured, connect error, no confident match, parse error)
// degrades to an empty result so a poll never fails because of this best-effort enrichment.
export async function fetchInlineImages(summary: ZohoMailMessageSummary): Promise<InlineImage[]> {
  const config = getImapConfig();
  if (!config) return [];

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
    console.warn("[imap] connect failed:", e instanceof Error ? e.message : e);
    return [];
  }

  try {
    const lock = await client.getMailboxLock("INBOX");
    try {
      const bestUid = await findBestMatchingUid(client, summary);
      if (bestUid === null) return [];

      const { content } = await client.download(String(bestUid), undefined, { uid: true });
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
    } finally {
      lock.release();
    }
  } catch (e) {
    console.warn("[imap] fetchInlineImages failed:", e instanceof Error ? e.message : e);
    return [];
  } finally {
    await client.logout().catch(() => {});
  }
}
