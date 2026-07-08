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
export async function fetchAllDeskPages(
  path: string,
  token: string,
  label: string
): Promise<Record<string, unknown>[]> {
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

  return all;
}
