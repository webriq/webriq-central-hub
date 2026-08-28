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

// Paginates a Zoho Desk list endpoint (`{ data: [...] }` shape, `from`/`limit` params,
// 100 max per page — Desk's documented hard cap) until a short page is returned.
// Returns the refreshed access token alongside the items — needed by callers that make
// several fetchAllDeskPages() calls in a loop (e.g. per-ticket comments export in task 296),
// so a mid-loop token refresh carries forward into the next call instead of being dropped.
export async function fetchAllDeskPages(
  path: string,
  token: string,
  label: string
): Promise<{ items: Record<string, unknown>[]; token: string }> {
  const perPage = 100;
  let from = 1; // Desk's `from` is 1-indexed by default
  let currentToken = token;
  const all: Record<string, unknown>[] = [];

  while (true) {
    const { res, token: nextToken, throttleExhausted } = await fetchDeskPage(
      path,
      currentToken,
      { from: String(from), limit: String(perPage) },
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
