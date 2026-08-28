// Zoho Desk API client — task 117 (Desk Contacts export/import/matching)
// Separate from the Zoho Projects client in src/lib/zoho/index.ts: different base URL,
// and every Desk call (except org-level ones) requires an additional "orgId" header.
import { fetchZohoWithRetry } from "@/lib/zoho";

const DESK_API_BASE = "https://desk.zoho.com/api/v1";

export function deskHeaders(): Record<string, string> {
  const orgId = process.env.ZOHO_DESK_ORG_ID;
  if (!orgId) throw new Error("ZOHO_DESK_ORG_ID not configured");
  return { orgId };
}

export async function fetchDeskPage(
  path: string,
  token: string,
  params: Record<string, string>,
  label: string
) {
  const url = `${DESK_API_BASE}${path}?${new URLSearchParams(params)}`;
  return fetchZohoWithRetry(url, token, { label, headers: deskHeaders() });
}

// Paginates a Zoho Desk list endpoint (`{ data: [...] }` shape, `from`/`limit` params)
// until a short page is returned. Returns the refreshed access token alongside the items —
// needed by callers that make several fetchAllDeskPages() calls in a loop (e.g. per-ticket
// comments export in task 296), so a mid-loop token refresh carries forward into the next
// call instead of being dropped.
//
// `opts.perPage` defaults to 100 (Desk's cap for most list endpoints) but some endpoints
// cap lower and 422 on anything above it — the Knowledge Base `/articles` endpoint caps at
// 50 (task 336). `opts.params` adds extra query params (e.g. `permission=all`).
export async function fetchAllDeskPages(
  path: string,
  token: string,
  label: string,
  opts: { params?: Record<string, string>; perPage?: number } = {}
): Promise<{ items: Record<string, unknown>[]; token: string }> {
  const perPage = opts.perPage ?? 100;
  const extraParams = opts.params ?? {};
  let from = 1; // Desk's `from` is 1-indexed by default
  let currentToken = token;
  const all: Record<string, unknown>[] = [];

  while (true) {
    const { res, token: nextToken, throttleExhausted } = await fetchDeskPage(
      path,
      currentToken,
      { from: String(from), limit: String(perPage), ...extraParams },
      label
    );
    currentToken = nextToken;

    if (throttleExhausted) throw new Error(`[${label}] Zoho rolling throttle exhausted`);
    if (!res.ok) throw new Error(`[${label}] Desk API error ${res.status}: ${await res.text()}`);

    const json = (await res.json()) as { data?: Record<string, unknown>[] };
    const page = json.data ?? [];
    all.push(...page);

    if (page.length < perPage) break;
    from += perPage;
  }

  return { items: all, token: currentToken };
}

// --- Archived tickets (task 325) -------------------------------------------------
// GET /api/v1/tickets/archivedTickets only returns non-live tickets and is skipped
// entirely by the live /tickets export. It has no server-side date filter (only
// from/limit/departmentId/viewType), so "2025 onward" is applied here on createdTime.

// Lists every Desk department (GET /api/v1/departments — `{ data: [{ id, name }] }`).
// Typical portals have < 20, but page defensively. Needs the Desk.departments.READ scope.
export async function fetchDeskDepartments(
  token: string,
  label: string
): Promise<{ items: { id: string; name: string }[]; token: string }> {
  const perPage = 100;
  let from = 1;
  let currentToken = token;
  const all: { id: string; name: string }[] = [];

  while (true) {
    const { res, token: nextToken, throttleExhausted } = await fetchDeskPage(
      "/departments",
      currentToken,
      { from: String(from), limit: String(perPage) },
      label
    );
    currentToken = nextToken;

    if (throttleExhausted) throw new Error(`[${label}] Zoho rolling throttle exhausted`);
    if (res.status === 204) break;
    if (!res.ok) throw new Error(`[${label}] Desk departments error ${res.status}: ${await res.text()}`);

    const page = ((await res.json()) as { data?: { id?: string | number; name?: string }[] }).data ?? [];
    for (const d of page) {
      if (d.id != null) all.push({ id: String(d.id), name: d.name ?? String(d.id) });
    }

    if (page.length < perPage) break;
    from += perPage;
  }

  return { items: all, token: currentToken };
}

const ARCHIVED_FROM_MAX = 4999; // Zoho hard cap on `from` → ≤ 5,000 archived tickets/department

// Paginates archived tickets for one department, keeping only `createdTime >= createdAfter`.
// Zoho Desk list endpoints return newest-first by default, so we can stop a department the
// moment a full page arrives entirely before the cutoff — but only while a runtime sanity
// check still trusts the order (older-then-newer within a page disables the optimisation and
// pages the whole department, still bounded by the 4,999 cap and still correctly filtered).
export async function fetchAllArchivedTicketsForDept(
  departmentId: string,
  token: string,
  label: string,
  opts: { createdAfter: string } // ISO8601; caller defaults to 2025-01-01
): Promise<{
  items: Record<string, unknown>[];
  token: string;
  truncated: boolean; // hit the 4,999 cap before the department was exhausted
  orderUnreliable: boolean; // response was not newest-first → early-stop disabled
}> {
  const perPage = 100;
  const cutoff = Date.parse(opts.createdAfter);
  let from = 0; // archived endpoint accepts from=0
  let currentToken = token;
  let orderUnreliable = false;
  let lastSeen = Infinity; // for the descending-order sanity check
  const all: Record<string, unknown>[] = [];

  while (true) {
    const { res, token: next, throttleExhausted } = await fetchDeskPage(
      "/tickets/archivedTickets",
      currentToken,
      { from: String(from), limit: String(perPage), departmentId, viewType: "2" },
      label
    );
    currentToken = next;

    if (throttleExhausted) throw new Error(`[${label}] Zoho rolling throttle exhausted (dept ${departmentId})`);
    if (res.status === 204) break; // Zoho returns 204 (no body) on an empty page
    if (!res.ok) throw new Error(`[${label}] archivedTickets ${res.status} (dept ${departmentId}): ${await res.text()}`);

    const page = ((await res.json()) as { data?: Record<string, unknown>[] }).data ?? [];
    if (page.length === 0) break;

    const times = page.map((t) => Date.parse(String(t.createdTime ?? "")));
    for (const ts of times) {
      if (!Number.isFinite(ts)) continue;
      if (ts > lastSeen) orderUnreliable = true;
      lastSeen = ts;
    }

    const kept = page.filter((_, i) => !Number.isFinite(times[i]) || times[i] >= cutoff);
    all.push(...kept.map((t) => ({ ...t, _zoho_department_id: departmentId })));

    // early stop only while the order is still trusted: a full page entirely before the cutoff
    const wholePageStale =
      times.length === perPage && times.every((ts) => Number.isFinite(ts) && ts < cutoff);
    if (!orderUnreliable && wholePageStale) {
      return { items: all, token: currentToken, truncated: false, orderUnreliable };
    }

    if (page.length < perPage) {
      return { items: all, token: currentToken, truncated: false, orderUnreliable };
    }
    from += perPage;
    if (from > ARCHIVED_FROM_MAX) {
      return { items: all, token: currentToken, truncated: true, orderUnreliable };
    }
  }

  return { items: all, token: currentToken, truncated: false, orderUnreliable };
}

// --- Per-ticket conversation exports (threads + comments) -----------------------
// Shared by the live exports (iterate desk-tickets.json — tasks 296/304) and the
// archived-ticket exports (iterate desk-archived-tickets.json — task 332). The two
// walks are identical apart from the source id list and the SSE event names, so
// these helpers own the Zoho pagination + per-ticket fault isolation and the route
// owns the SSE framing via the onBatch / onProgress callbacks.
//
// Fault isolation mirrors the original inline loops: a ticket whose fetch throws
// (rolling-throttle exhausted, non-OK status, network error) is pushed to
// failedTicketIds and the loop continues; the refreshed token always carries forward.

type DeskConversationCallbacks = {
  onBatch: (rows: Record<string, unknown>[]) => void;
  onProgress: (current: number, total: number, ticketId: string) => void;
};

// Threads = the actual customer<->agent conversation. The list endpoint sometimes
// omits `content`, so a per-thread detail fetch fills it in defensively (confirmed
// necessary against a real export during task 304).
export async function exportThreadsForTickets(
  ticketIds: string[],
  token: string,
  label: string,
  cb: DeskConversationCallbacks
): Promise<{ token: string; total: number; failedTicketIds: string[] }> {
  let currentToken = token;
  let total = 0;
  const failedTicketIds: string[] = [];

  for (let i = 0; i < ticketIds.length; i++) {
    const ticketId = String(ticketIds[i] ?? "");
    if (!ticketId) continue;

    try {
      const { items, token: listToken } = await fetchAllDeskPages(
        `/tickets/${ticketId}/threads`,
        currentToken,
        label
      );
      currentToken = listToken;

      const enriched: Record<string, unknown>[] = [];
      for (const raw of items) {
        const threadId = String(raw.id ?? "");
        if ((raw.content != null && raw.content !== "") || !threadId) {
          enriched.push({ ...raw, _zoho_ticket_id: ticketId });
          continue;
        }

        try {
          const { res, token: detailToken, throttleExhausted } = await fetchDeskPage(
            `/tickets/${ticketId}/threads/${threadId}`,
            currentToken,
            {},
            `${label}-detail`
          );
          currentToken = detailToken;
          if (throttleExhausted || !res.ok) {
            enriched.push({ ...raw, _zoho_ticket_id: ticketId });
          } else {
            const detail = (await res.json()) as Record<string, unknown>;
            enriched.push({ ...raw, ...detail, _zoho_ticket_id: ticketId });
          }
        } catch {
          enriched.push({ ...raw, _zoho_ticket_id: ticketId });
        }
      }

      total += enriched.length;
      cb.onProgress(i + 1, ticketIds.length, ticketId);
      cb.onBatch(enriched);
    } catch (e) {
      failedTicketIds.push(ticketId);
      console.log(`[${label}] Giving up on ticket=${ticketId}:`, e instanceof Error ? e.message : e);
      cb.onProgress(i + 1, ticketIds.length, ticketId);
    }
  }

  return { token: currentToken, total, failedTicketIds };
}

// Comments = agent-authored notes/replies (isPublic true/false) — mostly, but a real
// export has shown the occasional END_USER row. No detail-fill pass needed.
export async function exportCommentsForTickets(
  ticketIds: string[],
  token: string,
  label: string,
  cb: DeskConversationCallbacks
): Promise<{ token: string; total: number; failedTicketIds: string[] }> {
  let currentToken = token;
  let total = 0;
  const failedTicketIds: string[] = [];

  for (let i = 0; i < ticketIds.length; i++) {
    const ticketId = String(ticketIds[i] ?? "");
    if (!ticketId) continue;

    try {
      const { items, token: nextToken } = await fetchAllDeskPages(
        `/tickets/${ticketId}/comments`,
        currentToken,
        label
      );
      currentToken = nextToken;

      const withTicket = items.map((c) => ({ ...c, _zoho_ticket_id: ticketId }));
      total += withTicket.length;
      cb.onProgress(i + 1, ticketIds.length, ticketId);
      cb.onBatch(withTicket);
    } catch (e) {
      failedTicketIds.push(ticketId);
      console.log(`[${label}] Giving up on ticket=${ticketId}:`, e instanceof Error ? e.message : e);
      cb.onProgress(i + 1, ticketIds.length, ticketId);
    }
  }

  return { token: currentToken, total, failedTicketIds };
}

// --- Ticket custom-field (`cf`) enrichment (task 329, shared task 334) ---------
// Zoho Desk's list endpoints (List Tickets, archivedTickets) never return the `cf`
// custom-field object — only GET /api/v1/tickets/{id} does. This walks a list of ticket
// stubs and grafts `{ ...stub, cf: detail.cf ?? null }` (+ `customFields` when returned)
// onto each via a per-ticket Get Ticket call. Per-ticket fault isolation: a stub whose
// Get Ticket fails (non-OK / throttle exhausted / network) still comes back as
// `{ ...stub, cf: null }` and its id lands in `failedTicketIds`; the loop never aborts and
// the refreshed token always carries forward. No new OAuth scope — Desk.tickets.READ covers it.
//
// Callbacks are optional: the live `desk-tickets` SSE export streams per ticket via
// onEnriched/onProgress; the archived export ignores the callbacks and takes the returned
// `enriched` array.
export async function enrichTicketsWithCf(
  stubs: Record<string, unknown>[],
  token: string,
  label: string,
  cb?: {
    onEnriched?: (ticket: Record<string, unknown>) => void;
    onProgress?: (current: number, total: number, ticketId: string) => void;
  }
): Promise<{ token: string; enriched: Record<string, unknown>[]; failedTicketIds: string[] }> {
  let currentToken = token;
  const enriched: Record<string, unknown>[] = [];
  const failedTicketIds: string[] = [];

  for (let i = 0; i < stubs.length; i++) {
    const stub = stubs[i];
    const ticketId = String(stub.id ?? "");

    if (!ticketId) {
      cb?.onProgress?.(i + 1, stubs.length, "");
      enriched.push(stub);
      cb?.onEnriched?.(stub);
      continue;
    }

    try {
      const { res, token: detailToken, throttleExhausted } = await fetchDeskPage(
        `/tickets/${ticketId}`,
        currentToken,
        {},
        `${label}-detail`
      );
      currentToken = detailToken;

      if (throttleExhausted) throw new Error("Zoho rolling throttle exhausted");

      if (!res.ok) {
        failedTicketIds.push(ticketId);
        cb?.onProgress?.(i + 1, stubs.length, ticketId);
        const row = { ...stub, cf: null };
        enriched.push(row);
        cb?.onEnriched?.(row);
        continue;
      }

      const detail = (await res.json()) as { cf?: Record<string, unknown> | null; customFields?: unknown };
      const row: Record<string, unknown> = { ...stub, cf: detail.cf ?? null };
      if (detail.customFields != null) row.customFields = detail.customFields;

      cb?.onProgress?.(i + 1, stubs.length, ticketId);
      enriched.push(row);
      cb?.onEnriched?.(row);
    } catch (e) {
      failedTicketIds.push(ticketId);
      console.log(`[${label}] Giving up on ticket=${ticketId}:`, e instanceof Error ? e.message : e);
      cb?.onProgress?.(i + 1, stubs.length, ticketId);
      const row = { ...stub, cf: null };
      enriched.push(row);
      cb?.onEnriched?.(row);
    }
  }

  return { token: currentToken, enriched, failedTicketIds };
}

// --- Knowledge Base article body enrichment (task 336) -------------------------
// GET /api/v1/articles (List Articles) returns article stubs without the HTML `answer`
// body (and without the full `category` / version detail). Only GET /api/v1/articles/{id}
// carries `answer`. This walks a list of stubs and merges the full Get Article object onto
// each. Per-article fault isolation mirrors enrichTicketsWithCf(): a stub whose Get Article
// fails (non-OK / throttle exhausted / network) still comes back as `{ ...stub, answer:
// stub.answer ?? null }` and its id lands in failedArticleIds; the loop never aborts and the
// refreshed token always carries forward. Scope: Desk.articles.READ (same as List Articles).
export async function enrichArticlesWithBody(
  stubs: Record<string, unknown>[],
  token: string,
  label: string,
  cb?: {
    onEnriched?: (article: Record<string, unknown>) => void;
    onProgress?: (current: number, total: number, articleId: string) => void;
  }
): Promise<{ token: string; enriched: Record<string, unknown>[]; failedArticleIds: string[] }> {
  let currentToken = token;
  const enriched: Record<string, unknown>[] = [];
  const failedArticleIds: string[] = [];

  for (let i = 0; i < stubs.length; i++) {
    const stub = stubs[i];
    const articleId = String(stub.id ?? "");

    if (!articleId) {
      cb?.onProgress?.(i + 1, stubs.length, "");
      enriched.push(stub);
      cb?.onEnriched?.(stub);
      continue;
    }

    try {
      const { res, token: detailToken, throttleExhausted } = await fetchDeskPage(
        `/articles/${articleId}`,
        currentToken,
        {},
        `${label}-detail`
      );
      currentToken = detailToken;

      if (throttleExhausted) throw new Error("Zoho rolling throttle exhausted");

      if (!res.ok) {
        failedArticleIds.push(articleId);
        cb?.onProgress?.(i + 1, stubs.length, articleId);
        const row = { ...stub, answer: stub.answer ?? null };
        enriched.push(row);
        cb?.onEnriched?.(row);
        continue;
      }

      const detail = (await res.json()) as Record<string, unknown>;
      const row: Record<string, unknown> = { ...stub, ...detail, answer: detail.answer ?? stub.answer ?? null };

      cb?.onProgress?.(i + 1, stubs.length, articleId);
      enriched.push(row);
      cb?.onEnriched?.(row);
    } catch (e) {
      failedArticleIds.push(articleId);
      console.log(`[${label}] Giving up on article=${articleId}:`, e instanceof Error ? e.message : e);
      cb?.onProgress?.(i + 1, stubs.length, articleId);
      const row = { ...stub, answer: stub.answer ?? null };
      enriched.push(row);
      cb?.onEnriched?.(row);
    }
  }

  return { token: currentToken, enriched, failedArticleIds };
}
