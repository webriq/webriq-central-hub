import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { V2_ROUTES } from "@/config/constants";
import ContactsIndex, {
  type PaginationMeta,
  type ContactListItem,
  type AccountListItem,
  type DeskDirectoryTab,
} from "./_contacts-index";

// Desk > Contacts (task 335) — a two-tab directory (Contacts | Accounts) under the sidebar's
// collapsible "Desk" item. Same role gate as Desk > Tickets: admin, super_admin, pm.
// `contacts` is task 117's data; `accounts` is task 335's `desk-accounts` import.
export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Desk · Contacts" };

type ContactRow = {
  id: string;
  external_account_id: string | null;
  full_name: string | null;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  phone: string | null;
  mobile: string | null;
  title: string | null;
  customers: { company_name: string } | null;
};

type AccountRow = {
  id: string;
  account_name: string;
  website: string | null;
  email: string | null;
  phone: string | null;
  customer_happiness: Record<string, unknown> | null;
  customers: { company_name: string } | null;
};

function goodPct(ch: Record<string, unknown> | null): number | null {
  if (!ch) return null;
  const g = Number(ch.goodPercentage ?? 0);
  const o = Number(ch.okPercentage ?? 0);
  const b = Number(ch.badPercentage ?? 0);
  if (!Number.isFinite(g) || (g === 0 && o === 0 && b === 0)) return null;
  return g;
}

// Strip characters that would break PostgREST's `.or()` filter-list syntax.
const escapeOr = (s: string) => s.replace(/[%,()]/g, "");

export default async function DeskContactsPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; page?: string; pageSize?: string; search?: string }>;
}) {
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  if (!claims?.claims) redirect(V2_ROUTES.AUTH_LOGIN);

  const userId = claims.claims.sub as string;
  const { data: profile } = await supabase.from("profiles").select("role").eq("id", userId).maybeSingle();
  const role = profile?.role ?? null;
  if (role !== "admin" && role !== "super_admin" && role !== "pm") redirect(V2_ROUTES.DASHBOARD);

  const params = await searchParams;
  const tab: DeskDirectoryTab = params.tab === "accounts" ? "accounts" : "contacts";
  const page = Math.max(1, parseInt(params.page ?? "1", 10));
  const pageSize = Math.max(1, parseInt(params.pageSize ?? "20", 10));
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;
  const searchQ = params.search?.trim() ?? "";

  let contacts: ContactListItem[] = [];
  let accounts: AccountListItem[] = [];
  let total = 0;

  if (tab === "accounts") {
    let q = supabase
      .from("accounts")
      .select("id, account_name, website, email, phone, customer_happiness, customers(company_name)", {
        count: "exact",
      })
      .order("account_name", { ascending: true });
    if (searchQ) {
      const esc = escapeOr(searchQ);
      q = q.or(`account_name.ilike.%${esc}%,website.ilike.%${esc}%,email.ilike.%${esc}%`);
    }
    const res = await q.range(from, to);
    total = res.count ?? 0;
    accounts = ((res.data ?? []) as AccountRow[]).map((a) => ({
      id: a.id,
      accountName: a.account_name,
      website: a.website,
      email: a.email,
      phone: a.phone,
      goodPercentage: goodPct(a.customer_happiness),
      customerName: a.customers?.company_name ?? null,
    }));
  } else {
    let q = supabase
      .from("contacts")
      .select(
        "id, external_account_id, full_name, first_name, last_name, email, phone, mobile, title, customers(company_name)",
        { count: "exact" }
      )
      .order("last_name", { ascending: true, nullsFirst: false })
      .order("first_name", { ascending: true, nullsFirst: false });
    if (searchQ) {
      const esc = escapeOr(searchQ);
      q = q.or(
        `full_name.ilike.%${esc}%,first_name.ilike.%${esc}%,last_name.ilike.%${esc}%,email.ilike.%${esc}%`
      );
    }
    const res = await q.range(from, to);
    total = res.count ?? 0;
    const rows = (res.data ?? []) as ContactRow[];

    // Account name has no FK from `contacts` to `accounts` (contacts.external_account_id is a
    // plain text column) — resolve it with a scoped lookup Map, same discipline as the ticket
    // list's Contact/Owner lookups.
    const accountExternalIds = [
      ...new Set(rows.map((c) => c.external_account_id).filter((v): v is string => !!v)),
    ];
    const accountNameByExternalId = new Map<string, string>();
    if (accountExternalIds.length > 0) {
      const { data: accountRows } = await supabase
        .from("accounts")
        .select("external_id, account_name")
        .in("external_id", accountExternalIds);
      for (const a of accountRows ?? []) {
        if (a.external_id) accountNameByExternalId.set(a.external_id, a.account_name);
      }
    }

    contacts = rows.map((c) => ({
      id: c.id,
      name:
        c.full_name?.trim() ||
        [c.first_name, c.last_name].filter(Boolean).join(" ").trim() ||
        c.email ||
        "—",
      email: c.email,
      phone: c.phone ?? c.mobile,
      title: c.title,
      accountName: c.external_account_id
        ? accountNameByExternalId.get(c.external_account_id) ?? null
        : null,
      customerName: c.customers?.company_name ?? null,
    }));
  }

  const paginationMeta: PaginationMeta = { page, pageSize, total };

  return (
    <ContactsIndex
      tab={tab}
      contacts={contacts}
      accounts={accounts}
      paginationMeta={paginationMeta}
    />
  );
}
