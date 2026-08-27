// Zoho Mail API client (task 318) — replaces Resend as the ticketing email provider.
// helpdesk@webriq.us already lives in Zoho Mail; this polls/sends against Zoho Mail's
// own REST API instead of routing through Resend, eliminating the receiving/sending
// domain-verification blockers tasks 303/316 were stuck on. Separate from src/lib/zoho/index.ts
// (Projects/Desk) in refresh token only (ZOHO_MAIL_REFRESH_TOKEN) — per task 318's Open
// Decision 3, adding/rotating a Mail scope never requires re-touching the already-working
// Projects/Desk token. Client ID/secret are intentionally the SAME as ZOHO_CLIENT_ID/
// ZOHO_CLIENT_SECRET: Zoho allows only one Self Client per account, so both tokens are minted
// from it — a second pair of client env vars would just duplicate the existing ones, a real
// drift risk if the secret is ever rotated in the Zoho console and only one copy gets updated.
// Only the refresh token differs, since each authorization-code exchange (different scopes)
// mints an independent token off the same client.
//
// UNVERIFIED AT IMPLEMENTATION TIME — confirm against a live account before relying on this in
// production (task 318 Open Decisions 1-2 called this out explicitly):
//   - Exact response field names for Get Email Content (getMessageDetail) — endpoint URL is
//     confirmed (zoho.com/mail/help/api/get-email-content.html) but exact JSON field names for
//     body/attachments were not available from public docs during implementation; parsed
//     defensively below with multiple fallback field names.
//   - Attachment download endpoint (downloadAttachment) — no public doc page found; modeled on
//     the nested-resource pattern every other confirmed Zoho Mail endpoint uses. Treat as a
//     best-effort guess, not a confirmed contract.
//   - Reply response's own messageId field name.
//   - Published rate/credit limits — not found; the poll cron interval should be revisited
//     once real limits are confirmed.

const ZOHO_MAIL_API_BASE = process.env.ZOHO_MAIL_API_BASE_URL ?? "https://mail.zoho.com";

function requireAccountId(): string {
  const accountId = process.env.ZOHO_MAIL_ACCOUNT_ID;
  if (!accountId) throw new Error("ZOHO_MAIL_ACCOUNT_ID is not configured");
  return accountId;
}

// Module-level token cache — mirrors src/lib/zoho/index.ts's getZohoAccessToken() pattern.
// Client ID/secret are the same ZOHO_CLIENT_ID/ZOHO_CLIENT_SECRET the Projects/Desk
// integration uses (see file header) — only the refresh token is Mail-specific.
let _tokenCache: { value: string; expiresAt: number } | null = null;
let _tokenRefreshPromise: Promise<string> | null = null;

export async function getZohoMailAccessToken(): Promise<string> {
  if (_tokenCache && Date.now() < _tokenCache.expiresAt - 60_000) {
    return _tokenCache.value;
  }
  if (_tokenRefreshPromise) return _tokenRefreshPromise;

  _tokenRefreshPromise = (async () => {
    try {
      const clientId = process.env.ZOHO_CLIENT_ID;
      const clientSecret = process.env.ZOHO_CLIENT_SECRET;
      const refreshToken = process.env.ZOHO_MAIL_REFRESH_TOKEN;

      if (!clientId || !clientSecret || !refreshToken) {
        console.warn(
          "[zoho-mail] OAuth env vars not configured (ZOHO_CLIENT_ID, ZOHO_CLIENT_SECRET, ZOHO_MAIL_REFRESH_TOKEN) — skipping"
        );
        return "";
      }

      const res = await fetch("https://accounts.zoho.com/oauth/v2/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          grant_type: "refresh_token",
          client_id: clientId,
          client_secret: clientSecret,
          refresh_token: refreshToken,
        }),
      });

      if (!res.ok) {
        console.error("[zoho-mail] token refresh failed:", res.status, await res.text());
        return "";
      }

      const json = await res.json();
      const token = (json.access_token as string) ?? "";
      const expiresIn = (json.expires_in as number) ?? 3600;

      if (token) {
        _tokenCache = { value: token, expiresAt: Date.now() + expiresIn * 1_000 };
      }
      return token;
    } finally {
      _tokenRefreshPromise = null;
    }
  })();

  return _tokenRefreshPromise;
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

// Thin fetch wrapper: 401 -> force-refresh token and retry once; 429 -> respect
// Retry-After and retry once. Mirrors fetchZohoWithRetry's shape (src/lib/zoho/index.ts)
// without the Projects-specific rolling-throttle handling, which is a distinct Zoho Projects
// error shape that doesn't apply here.
async function zohoMailFetch(path: string, init?: RequestInit, retriesLeft = 1): Promise<Response> {
  const token = await getZohoMailAccessToken();
  if (!token) throw new Error("Zoho Mail OAuth is not configured — cannot call Zoho Mail API");

  const res = await fetch(`${ZOHO_MAIL_API_BASE}${path}`, {
    ...init,
    headers: {
      Authorization: `Zoho-oauthtoken ${token}`,
      Accept: "application/json",
      "Content-Type": "application/json",
      ...init?.headers,
    },
  });

  if (res.status === 429 && retriesLeft > 0) {
    const retryAfter = parseInt(res.headers.get("Retry-After") ?? "5", 10);
    console.log(`[zoho-mail] 429 — waiting ${retryAfter}s`);
    await sleep(retryAfter * 1000);
    return zohoMailFetch(path, init, retriesLeft - 1);
  }
  if (res.status === 401 && retriesLeft > 0) {
    console.log("[zoho-mail] 401 — forcing token refresh and retrying");
    _tokenCache = null;
    return zohoMailFetch(path, init, retriesLeft - 1);
  }
  return res;
}

export type ZohoMailMessageSummary = {
  messageId: string;
  threadId: string;
  folderId: string;
  subject: string;
  fromAddress: string;
  receivedTime: string; // epoch ms, as a string per Zoho's List Emails response
  hasAttachment: boolean;
};

// Zoho Mail's from/to address fields are HTML-entity-encoded display strings
// (e.g. "&quot;rebecca&quot;&lt;rebecca@zylker.com&gt;") — decode before use.
export function decodeHtmlEntities(raw: string): string {
  return raw.replace(/&quot;/g, '"').replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");
}

// Unwrap a "Name <addr>" display form to the bare address, if present.
export function extractEmailAddress(raw: string): string {
  const match = raw.match(/<([^>]+)>/);
  return (match ? match[1] : raw).trim();
}

// Lists messages in a folder, optionally filtered to those received after `sinceReceivedTime`
// (epoch ms as a string — the poll cursor). Zoho's List Emails endpoint has no server-side
// "since" filter, so this fetches the most recent `limit` messages and filters client-side —
// a backlog larger than `limit` between polls would be missed; acceptable for a helpdesk
// mailbox's expected volume, revisit if that assumption breaks (task 318 Open Decision 1).
export async function listNewMessages(params: {
  folderId: string;
  sinceReceivedTime?: string | null;
  limit?: number;
}): Promise<ZohoMailMessageSummary[]> {
  const accountId = requireAccountId();
  const qs = new URLSearchParams({
    folderId: params.folderId,
    limit: String(params.limit ?? 50),
    status: "all",
  });

  const res = await zohoMailFetch(`/api/accounts/${accountId}/messages/view?${qs.toString()}`, { method: "GET" });
  if (!res.ok) {
    throw new Error(`Zoho Mail list messages failed: HTTP ${res.status} ${await res.text().catch(() => "")}`);
  }

  const json = await res.json();
  const rows = (json.data ?? []) as Record<string, string>[];

  const messages: ZohoMailMessageSummary[] = rows.map((r) => ({
    messageId: r.messageId,
    // Zoho only assigns a threadId once a reply actually exists on a message — a brand-new,
    // never-replied-to message has no threadId field at all. But once a thread does form,
    // Zoho sets it to the root message's own messageId (observed: a reply's threadId equals
    // the original message's messageId, and the original's own threadId becomes identical to
    // its messageId once it has a reply). Defaulting to our own messageId here means every
    // ticket's stored zoho_mail_thread_id already equals whatever a future reply's real
    // threadId will be — no need to wait for Zoho to backfill it.
    threadId: r.threadId || r.messageId,
    folderId: r.folderId ?? params.folderId,
    subject: r.subject || "(no subject)",
    fromAddress: extractEmailAddress(decodeHtmlEntities(r.fromAddress ?? "")),
    receivedTime: r.receivedTime,
    hasAttachment: r.hasAttachment === "1" || r.hasAttachment === "true",
  }));

  const filtered = params.sinceReceivedTime
    ? messages.filter((m) => Number(m.receivedTime) > Number(params.sinceReceivedTime))
    : messages;

  // Oldest first, so the poll route can advance its cursor incrementally as it processes each.
  return filtered.sort((a, b) => Number(a.receivedTime) - Number(b.receivedTime));
}

export type ZohoMailMessageDetail = {
  htmlContent: string | null;
  textContent: string | null;
  attachments: { attachmentId: string; fileName: string; size: number }[];
};

export async function getMessageDetail(messageId: string, folderId: string): Promise<ZohoMailMessageDetail> {
  const accountId = requireAccountId();
  const res = await zohoMailFetch(`/api/accounts/${accountId}/folders/${folderId}/messages/${messageId}/content`, {
    method: "GET",
  });
  if (!res.ok) {
    throw new Error(`Zoho Mail get message content failed: HTTP ${res.status} ${await res.text().catch(() => "")}`);
  }

  const json = await res.json();
  const data = json.data ?? {};
  // Field names not confirmed against live docs (see file header) — accept the most plausible
  // variants rather than assuming one exact shape.
  const htmlContent = (data.content ?? data.htmlContent ?? null) as string | null;
  const textContent = (data.textContent ?? data.plainContent ?? null) as string | null;
  const rawAttachments = (data.attachments ?? []) as Record<string, unknown>[];

  return {
    htmlContent,
    textContent,
    attachments: rawAttachments.map((a) => ({
      attachmentId: String(a.attachmentId ?? a.storeName ?? ""),
      fileName: String(a.attachmentName ?? a.fileName ?? "attachment"),
      size: Number(a.attachmentSize ?? a.size ?? 0),
    })),
  };
}

export type ZohoMailMessageMetadata = {
  receivedTime: string | null; // epoch ms as a string, matching ZohoMailMessageSummary
  fromAddress: string | null; // bare address
  rfc822MessageId: string | null; // the original RFC822 Message-ID header, angle brackets stripped
};

// Metadata for a single already-known message id (task 322 backfill correlation). The forward
// poll path gets receivedTime/fromAddress straight off listNewMessages(); a stored
// ticket_messages row only has the Zoho messageId, so this re-derives the correlation inputs.
// Field names are UNVERIFIED against live docs (same caveat as getMessageDetail — see file
// header): parsed defensively across the plausible variants, and against a `headers`/`header`
// map if Zoho returns one. Callers treat a null field as "correlation input unavailable", not
// an error.
export async function getMessageMetadata(messageId: string, folderId: string): Promise<ZohoMailMessageMetadata> {
  const accountId = requireAccountId();
  const res = await zohoMailFetch(
    `/api/accounts/${accountId}/folders/${folderId}/messages/${messageId}/details`,
    { method: "GET" }
  );
  if (!res.ok) {
    throw new Error(`Zoho Mail get message metadata failed: HTTP ${res.status} ${await res.text().catch(() => "")}`);
  }

  const json = await res.json();
  const data = (json.data ?? {}) as Record<string, unknown>;

  const receivedRaw = data.receivedTime ?? data.receivedDate ?? data.sentDateInGMT ?? data.time ?? null;
  const receivedTime = receivedRaw != null ? String(receivedRaw) : null;

  const fromRaw = (data.fromAddress ?? data.sender ?? data.from ?? "") as string;
  const fromAddress = fromRaw ? extractEmailAddress(decodeHtmlEntities(fromRaw)) : null;

  // The RFC822 Message-ID may surface as a top-level field or inside a header map, depending on
  // the endpoint's shape. Accept either; strip angle brackets so it feeds IMAP HEADER search.
  const headerMap = (data.headers ?? data.header ?? {}) as Record<string, unknown>;
  const rawMessageId =
    (data.messageIdHeader ?? data.rfc822MessageId ?? headerMap["Message-ID"] ?? headerMap["Message-Id"] ?? headerMap["message-id"] ?? null) as
      | string
      | null;
  const rfc822MessageId = rawMessageId ? String(rawMessageId).trim().replace(/^<|>$/g, "") || null : null;

  return { receivedTime, fromAddress, rfc822MessageId };
}

// Best-effort — no public doc page found for this endpoint during implementation. Modeled on
// the nested-resource pattern every other confirmed Zoho Mail endpoint follows. Callers must
// treat a failure here as non-fatal (skip the attachment, keep the message) per the poll
// route's existing per-attachment try/catch.
export async function downloadAttachment(
  messageId: string,
  folderId: string,
  attachmentId: string
): Promise<ArrayBuffer> {
  const accountId = requireAccountId();
  const res = await zohoMailFetch(
    `/api/accounts/${accountId}/folders/${folderId}/messages/${messageId}/attachments/${attachmentId}`,
    { method: "GET" }
  );
  if (!res.ok) {
    throw new Error(`Zoho Mail attachment download failed: HTTP ${res.status}`);
  }
  return res.arrayBuffer();
}

export async function sendReply(input: {
  replyToMessageId: string;
  from: string;
  to: string;
  subject: string;
  content: string;
}): Promise<{ messageId: string | null }> {
  const accountId = requireAccountId();
  const res = await zohoMailFetch(`/api/accounts/${accountId}/messages/${input.replyToMessageId}`, {
    method: "POST",
    body: JSON.stringify({
      fromAddress: input.from,
      toAddress: input.to,
      subject: input.subject,
      content: input.content,
      action: "reply",
    }),
  });

  if (!res.ok) {
    throw new Error(`Zoho Mail send reply failed: HTTP ${res.status} ${await res.text().catch(() => "")}`);
  }

  const json = await res.json();
  const data = Array.isArray(json.data) ? json.data[0] : json.data;
  const messageId = data?.messageId ? String(data.messageId) : null;
  return { messageId };
}
