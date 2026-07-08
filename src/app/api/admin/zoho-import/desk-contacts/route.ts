// dev-only import endpoint — reads _from_zoho/desk-contacts.json (+ desk-accounts.json for
// matching), upserts to the contacts table. Contacts whose Desk account can't be resolved to
// an existing customers.company_name import anyway with customer_id/match_method = null —
// they're the review queue for a future manual-assignment UI (task 117 is data-only).
import { NextResponse } from "next/server";
import { adminClient, ImportResult, readFromZoho, normalizeCompanyName } from "@/lib/migrate/zoho-import";
import { createClient } from "@/lib/supabase/server";

type DeskAccountRaw = {
  id?: string | number;
  accountName?: string;
  [key: string]: unknown;
};

type DeskContactRaw = {
  id?: string | number;
  accountId?: string | number | null;
  firstName?: string | null;
  lastName?: string | null;
  email?: string | null;
  secondaryEmail?: string | null;
  phone?: string | null;
  mobile?: string | null;
  title?: string | null;
  city?: string | null;
  country?: string | null;
  state?: string | null;
  street?: string | null;
  zip?: string | null;
  type?: string | null;
  facebook?: string | null;
  twitter?: string | null;
  ownerId?: string | number | null;
  description?: string | null;
  cf?: Record<string, unknown> | null;
  [key: string]: unknown;
};

type ContactRow = {
  customer_id: string | null;
  external_id: string;
  external_account_id: string | null;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  secondary_email: string | null;
  phone: string | null;
  mobile: string | null;
  title: string | null;
  match_method: "account_name" | null;
  source_meta: Record<string, unknown>;
};

const CHUNK_SIZE = 50;

export async function POST() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: profile } = await adminClient.from("profiles").select("role").eq("id", user.id).maybeSingle();
  if (profile?.role !== "admin" && profile?.role !== "super_admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  let deskContacts: DeskContactRaw[];
  try {
    deskContacts = readFromZoho<DeskContactRaw>("desk-contacts.json");
  } catch {
    return NextResponse.json(
      { error: "Could not read _from_zoho/desk-contacts.json — run the Desk Contacts export first" },
      { status: 400 }
    );
  }

  if (deskContacts.length === 0) {
    return NextResponse.json({ error: "No contacts found in desk-contacts.json" }, { status: 400 });
  }

  let deskAccounts: DeskAccountRaw[] = [];
  try {
    deskAccounts = readFromZoho<DeskAccountRaw>("desk-accounts.json");
  } catch {
    console.warn(
      "[import/desk-contacts] _from_zoho/desk-accounts.json not found — importing contacts unmatched " +
      "(run the Desk Accounts export for account-name matching; requires the Desk.accounts.READ scope)"
    );
  }

  const accountNameById = new Map<string, string>();
  for (const a of deskAccounts) {
    if (a.id != null && a.accountName) accountNameById.set(String(a.id), a.accountName);
  }

  // Paginated customers lookup — table can grow past Supabase's 1000-row default select limit.
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
    `[import/desk-contacts] ${deskContacts.length} contacts, ${deskAccounts.length} accounts, ${customerRows.length} customers`
  );

  const result: ImportResult & { matched: number; unmatched: number } = {
    imported: 0,
    updated: 0,
    skipped: 0,
    errors: [],
    matched: 0,
    unmatched: 0,
  };
  const rows: ContactRow[] = [];

  for (const contact of deskContacts) {
    const externalId = contact.id != null ? String(contact.id) : "";
    if (!externalId) {
      result.skipped++;
      continue;
    }

    const accountId = contact.accountId != null ? String(contact.accountId) : null;
    const accountName = accountId ? accountNameById.get(accountId) : undefined;
    const customerId = accountName ? customerByNormalizedName.get(normalizeCompanyName(accountName)) ?? null : null;

    if (customerId) result.matched++;
    else result.unmatched++;

    rows.push({
      customer_id: customerId,
      external_id: externalId,
      external_account_id: accountId,
      first_name: contact.firstName ?? null,
      last_name: contact.lastName ?? null,
      email: contact.email ?? null,
      secondary_email: contact.secondaryEmail ?? null,
      phone: contact.phone ?? null,
      mobile: contact.mobile ?? null,
      title: contact.title ?? null,
      match_method: customerId ? "account_name" : null,
      source_meta: {
        city: contact.city ?? null,
        country: contact.country ?? null,
        state: contact.state ?? null,
        street: contact.street ?? null,
        zip: contact.zip ?? null,
        type: contact.type ?? null,
        facebook: contact.facebook ?? null,
        twitter: contact.twitter ?? null,
        ownerId: contact.ownerId ?? null,
        description: contact.description ?? null,
        cf: contact.cf ?? null,
      },
    });
  }

  console.log(`[import/desk-contacts] upserting ${rows.length} rows in chunks of ${CHUNK_SIZE} (${result.skipped} skipped)`);

  for (let i = 0; i < rows.length; i += CHUNK_SIZE) {
    const chunk = rows.slice(i, i + CHUNK_SIZE);
    const { error } = await adminClient.from("contacts").upsert(chunk, { onConflict: "external_id" });
    const chunkNum = Math.floor(i / CHUNK_SIZE) + 1;
    const totalChunks = Math.ceil(rows.length / CHUNK_SIZE);
    if (error) {
      console.error(`[import/desk-contacts] chunk ${chunkNum}/${totalChunks} failed:`, error.message);
      result.errors.push(`chunk ${chunkNum}: ${error.message}`);
    } else {
      result.imported += chunk.length;
    }
  }

  console.log(
    `[import/desk-contacts] done: ${result.imported} imported, ${result.matched} matched, ${result.unmatched} unmatched, ${result.errors.length} error(s)`
  );
  return NextResponse.json(result);
}
