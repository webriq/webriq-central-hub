import { redirect, notFound } from "next/navigation";
import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { V2_ROUTES } from "@/config/constants";
import { ExternalLink } from "lucide-react";
import {
  DetailShell,
  Card,
  FieldGrid,
  Field,
  RelatedTickets,
  RelatedContacts,
  type RelatedTicket,
} from "../../_detail-ui";

// Desk > Contacts > Accounts > [account] (task 335). Routed by accounts.id (UUID). No nav
// entry — reached from the Accounts tab or a contact's "Account" link. Same role gate.
export const dynamic = "force-dynamic";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type AccountRow = {
  id: string;
  external_id: string;
  account_name: string;
  email: string | null;
  website: string | null;
  phone: string | null;
  web_url: string | null;
  customer_happiness: Record<string, unknown> | null;
  zoho_crm_account_id: string | null;
  customer_id: string | null;
  created_time: string | null;
  customers: { company_name: string } | null;
};

type ContactLite = {
  id: string;
  full_name: string | null;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  phone: string | null;
  mobile: string | null;
};

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  if (!UUID_RE.test(id)) return { title: "Account · Desk" };
  const supabase = await createClient();
  const { data } = await supabase.from("accounts").select("account_name").eq("id", id).maybeSingle();
  return { title: `${data?.account_name ?? "Account"} · Desk` };
}

export default async function DeskAccountDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID_RE.test(id)) notFound();

  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  if (!claims?.claims) redirect(V2_ROUTES.AUTH_LOGIN);

  const userId = claims.claims.sub as string;
  const { data: profile } = await supabase.from("profiles").select("role").eq("id", userId).maybeSingle();
  const role = profile?.role ?? null;
  if (role !== "admin" && role !== "super_admin" && role !== "pm") redirect(V2_ROUTES.DASHBOARD);

  const { data: accountData } = await supabase
    .from("accounts")
    .select(
      "id, external_id, account_name, email, website, phone, web_url, customer_happiness, zoho_crm_account_id, customer_id, created_time, customers(company_name)"
    )
    .eq("id", id)
    .maybeSingle();

  if (!accountData) notFound();
  const a = accountData as AccountRow;

  const { data: contactRows } = await supabase
    .from("contacts")
    .select("id, full_name, first_name, last_name, email, phone, mobile")
    .eq("external_account_id", a.external_id)
    .order("last_name", { ascending: true, nullsFirst: false })
    .limit(100);
  const contacts = ((contactRows ?? []) as ContactLite[]).map((c) => ({
    id: c.id,
    name:
      c.full_name?.trim() ||
      [c.first_name, c.last_name].filter(Boolean).join(" ").trim() ||
      c.email ||
      "Unnamed contact",
    email: c.email,
    phone: c.phone ?? c.mobile,
  }));

  const { data: ticketRows } = await supabase
    .from("tickets")
    .select("id, ticket_id, ticket_number, subject, status, created_at")
    .eq("external_account_id", a.external_id)
    .order("created_at", { ascending: false })
    .limit(50);
  const tickets: RelatedTicket[] = (ticketRows ?? []).map((t) => ({
    id: t.id,
    ticketId: t.ticket_id,
    ticketNumber: t.ticket_number,
    subject: t.subject,
    status: t.status,
  }));

  const ch = a.customer_happiness ?? null;
  const happiness = ch
    ? `${Number(ch.goodPercentage ?? 0)}% good · ${Number(ch.okPercentage ?? 0)}% ok · ${Number(ch.badPercentage ?? 0)}% bad`
    : null;
  const happinessAllZero =
    ch != null &&
    Number(ch.goodPercentage ?? 0) === 0 &&
    Number(ch.okPercentage ?? 0) === 0 &&
    Number(ch.badPercentage ?? 0) === 0;

  return (
    <DetailShell
      backHref={`${V2_ROUTES.DESK_CONTACTS}?tab=accounts`}
      backLabel="Accounts"
      title={a.account_name}
      subtitle={a.customers?.company_name ? `Customer: ${a.customers.company_name}` : null}
      actions={
        a.web_url ? (
          <a
            href={a.web_url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-[#E2E7F2] bg-white text-[12px] text-[#3A4565] hover:bg-[#F0F7FF] transition-colors"
          >
            Open in Zoho Desk <ExternalLink size={12} />
          </a>
        ) : null
      }
    >
      <Card title="Details">
        <FieldGrid>
          <Field
            label="Website"
            value={a.website ? a.website.replace(/^https?:\/\//, "") : null}
            href={a.website ?? undefined}
            external
          />
          <Field label="Email" value={a.email} href={a.email ? `mailto:${a.email}` : undefined} />
          <Field label="Phone" value={a.phone} />
          <Field
            label="Customer"
            value={a.customers?.company_name}
            href={a.customer_id ? `/customers/${a.customer_id}` : undefined}
          />
          <Field label="Customer happiness" value={happinessAllZero ? "No ratings" : happiness} />
          <Field label="Zoho CRM account ID" value={a.zoho_crm_account_id} />
        </FieldGrid>
      </Card>

      <Card title={`Contacts${contacts.length ? ` (${contacts.length})` : ""}`}>
        <RelatedContacts contacts={contacts} />
      </Card>

      <Card title={`Tickets${tickets.length ? ` (${tickets.length})` : ""}`}>
        <RelatedTickets tickets={tickets} />
      </Card>
    </DetailShell>
  );
}
