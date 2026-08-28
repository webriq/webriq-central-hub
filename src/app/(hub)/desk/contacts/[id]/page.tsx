import { redirect, notFound } from "next/navigation";
import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { V2_ROUTES } from "@/config/constants";
import {
  DetailShell,
  Card,
  FieldGrid,
  Field,
  RelatedTickets,
  type RelatedTicket,
} from "../../_detail-ui";

// Desk > Contacts > [contact] (task 335). Routed by contacts.id (UUID — the standard routing
// key; no human-readable id exists for contacts). Same role gate as the directory list.
export const dynamic = "force-dynamic";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type ContactRow = {
  id: string;
  external_id: string | null;
  external_account_id: string | null;
  full_name: string | null;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  secondary_email: string | null;
  phone: string | null;
  mobile: string | null;
  title: string | null;
  customer_id: string | null;
  customers: { company_name: string } | null;
  source_meta: Record<string, unknown> | null;
};

function contactName(c: ContactRow): string {
  return (
    c.full_name?.trim() ||
    [c.first_name, c.last_name].filter(Boolean).join(" ").trim() ||
    c.email ||
    "Unnamed contact"
  );
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  if (!UUID_RE.test(id)) return { title: "Contact · Desk" };
  const supabase = await createClient();
  const { data } = await supabase
    .from("contacts")
    .select("full_name, first_name, last_name, email")
    .eq("id", id)
    .maybeSingle();
  const name = data
    ? (data.full_name?.trim() ||
        [data.first_name, data.last_name].filter(Boolean).join(" ").trim() ||
        data.email ||
        "Contact")
    : "Contact";
  return { title: `${name} · Desk` };
}

export default async function DeskContactDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID_RE.test(id)) notFound();

  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  if (!claims?.claims) redirect(V2_ROUTES.AUTH_LOGIN);

  const userId = claims.claims.sub as string;
  const { data: profile } = await supabase.from("profiles").select("role").eq("id", userId).maybeSingle();
  const role = profile?.role ?? null;
  if (role !== "admin" && role !== "super_admin" && role !== "pm") redirect(V2_ROUTES.DASHBOARD);

  const { data: contactData } = await supabase
    .from("contacts")
    .select(
      "id, external_id, external_account_id, full_name, first_name, last_name, email, secondary_email, phone, mobile, title, customer_id, customers(company_name), source_meta"
    )
    .eq("id", id)
    .maybeSingle();

  if (!contactData) notFound();
  const c = contactData as ContactRow;

  // Account (no FK — contacts.external_account_id is plain text)
  let account: { id: string; account_name: string } | null = null;
  if (c.external_account_id) {
    const { data } = await supabase
      .from("accounts")
      .select("id, account_name")
      .eq("external_id", c.external_account_id)
      .maybeSingle();
    account = data;
  }

  // Related tickets (contacts.external_id → tickets.external_contact_id, no declared FK)
  let tickets: RelatedTicket[] = [];
  if (c.external_id) {
    const { data } = await supabase
      .from("tickets")
      .select("id, ticket_id, ticket_number, subject, status, created_at")
      .eq("external_contact_id", c.external_id)
      .order("created_at", { ascending: false })
      .limit(50);
    tickets = (data ?? []).map((t) => ({
      id: t.id,
      ticketId: t.ticket_id,
      ticketNumber: t.ticket_number,
      subject: t.subject,
      status: t.status,
    }));
  }

  const meta = c.source_meta ?? {};
  const metaStr = (k: string): string | null =>
    typeof meta[k] === "string" && (meta[k] as string).trim() !== "" ? (meta[k] as string) : null;
  const location = [metaStr("city"), metaStr("state"), metaStr("country")].filter(Boolean).join(", ");

  return (
    <DetailShell
      backHref={`${V2_ROUTES.DESK_CONTACTS}?tab=contacts`}
      backLabel="Contacts"
      title={contactName(c)}
      subtitle={c.title}
    >
      <Card title="Details">
        <FieldGrid>
          <Field label="Email" value={c.email} href={c.email ? `mailto:${c.email}` : undefined} />
          <Field label="Secondary email" value={c.secondary_email} />
          <Field label="Phone" value={c.phone} />
          <Field label="Mobile" value={c.mobile} />
          <Field
            label="Account"
            value={account?.account_name ?? null}
            href={account ? `/desk/accounts/${account.id}` : undefined}
          />
          <Field
            label="Customer"
            value={c.customers?.company_name}
            href={c.customer_id ? `/customers/${c.customer_id}` : undefined}
          />
          <Field label="Location" value={location} />
        </FieldGrid>
      </Card>

      <Card title={`Tickets${tickets.length ? ` (${tickets.length})` : ""}`}>
        <RelatedTickets tickets={tickets} />
      </Card>
    </DetailShell>
  );
}
