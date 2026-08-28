// Shared Desk-account import logic (task 335) — reads _from_zoho/desk-accounts.json rows
// (passed in by the route) and upserts them into the `accounts` table (migration 125).
// Each account is soft-matched to a `customers` row by normalized name, exactly like the
// `contacts` import (task 117 / desk-contacts route): unmatched accounts import anyway with
// customer_id / match_method = null. Pattern mirrors importDeskTickets(): paginated
// customers lookup (Supabase 1000-row cap → `.range()` loop), external_id dedupe, and a
// CHUNK_SIZE=50 upsert on `external_id`.
import {
  adminClient,
  ImportResult,
  normalizeCompanyName,
} from "@/lib/migrate/zoho-import";

// The Zoho Desk "account" (company) shape from GET /accounts — only the fields we columnize
// are typed; the whole raw object is also stashed in source_meta.
export type DeskAccountRaw = {
  id?: string | number;
  accountName?: string | null;
  email?: string | null;
  website?: string | null;
  phone?: string | null;
  webUrl?: string | null;
  createdTime?: string | null;
  customerHappiness?: Record<string, unknown> | null;
  zohoCRMAccount?: { id?: string | number } | null;
  [key: string]: unknown;
};

type AccountRow = {
  external_id: string;
  account_name: string;
  email: string | null;
  website: string | null;
  phone: string | null;
  web_url: string | null;
  customer_happiness: Record<string, unknown> | null;
  zoho_crm_account_id: string | null;
  customer_id: string | null;
  match_method: "account_name" | null;
  created_time: string | null;
  source_meta: Record<string, unknown>;
};

const CHUNK_SIZE = 50;

export async function importDeskAccounts(
  accounts: DeskAccountRaw[]
): Promise<ImportResult & { matched: number; unmatched: number }> {
  // Paginated customers lookup — for the account-name soft match. The table can grow past
  // Supabase's 1000-row default select limit (CLAUDE.md rule).
  const customerRows: Array<{ customer_id: string; company_name: string }> = [];
  {
    const PAGE = 1000;
    let from = 0;
    while (true) {
      const { data: page } = await adminClient
        .from("customers")
        .select("customer_id, company_name")
        .range(from, from + PAGE - 1);
      if (!page || page.length === 0) break;
      customerRows.push(...page);
      if (page.length < PAGE) break;
      from += PAGE;
    }
  }
  const customerByNormalizedName = new Map(
    customerRows.map((c) => [normalizeCompanyName(c.company_name), c.customer_id])
  );

  console.log(
    `[import/desk-accounts] ${accounts.length} accounts, ${customerRows.length} customers`
  );

  const result: ImportResult & { matched: number; unmatched: number } = {
    imported: 0,
    updated: 0,
    skipped: 0,
    errors: [],
    matched: 0,
    unmatched: 0,
  };
  const rows: AccountRow[] = [];

  for (const account of accounts) {
    const externalId = account.id != null ? String(account.id) : "";
    const accountName = (account.accountName ?? "").trim();
    if (!externalId || !accountName) {
      result.skipped++;
      continue;
    }

    const customerId =
      customerByNormalizedName.get(normalizeCompanyName(accountName)) ?? null;
    if (customerId) result.matched++;
    else result.unmatched++;

    const crmId = account.zohoCRMAccount?.id;

    rows.push({
      external_id: externalId,
      account_name: accountName,
      email: account.email ?? null,
      website: account.website ?? null,
      phone: account.phone ?? null,
      web_url: account.webUrl ?? null,
      customer_happiness: account.customerHappiness ?? null,
      zoho_crm_account_id: crmId != null ? String(crmId) : null,
      customer_id: customerId,
      match_method: customerId ? "account_name" : null,
      created_time: account.createdTime ?? null,
      source_meta: account as Record<string, unknown>,
    });
  }

  // Dedupe by external_id (the upsert conflict key) — the source file could carry a repeated
  // account id; last one wins. Same guard as importDeskTickets().
  const dedupedRows = Array.from(new Map(rows.map((r) => [r.external_id, r])).values());
  const droppedDupes = rows.length - dedupedRows.length;
  if (droppedDupes > 0) {
    console.log(`[import/desk-accounts] dropped ${droppedDupes} duplicate external_id row(s) before upsert`);
    result.matched = dedupedRows.filter((r) => r.match_method !== null).length;
    result.unmatched = dedupedRows.length - result.matched;
  }

  console.log(
    `[import/desk-accounts] upserting ${dedupedRows.length} rows in chunks of ${CHUNK_SIZE} (${result.skipped} skipped, ${droppedDupes} dupes)`
  );

  for (let i = 0; i < dedupedRows.length; i += CHUNK_SIZE) {
    const chunk = dedupedRows.slice(i, i + CHUNK_SIZE);
    const { error } = await adminClient.from("accounts").upsert(chunk, { onConflict: "external_id" });
    const chunkNum = Math.floor(i / CHUNK_SIZE) + 1;
    const totalChunks = Math.ceil(dedupedRows.length / CHUNK_SIZE);
    if (error) {
      console.error(`[import/desk-accounts] chunk ${chunkNum}/${totalChunks} failed:`, error.message);
      result.errors.push(`chunk ${chunkNum}: ${error.message}`);
    } else {
      result.imported += chunk.length;
    }
  }

  console.log(
    `[import/desk-accounts] done: ${result.imported} imported, ${result.matched} matched, ${result.unmatched} unmatched, ${result.errors.length} error(s)`
  );
  return result;
}
