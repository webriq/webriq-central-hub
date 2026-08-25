import { redirect, notFound } from "next/navigation";
import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { V2_ROUTES } from "@/config/constants";
import TicketDetail, { type TicketDetailData } from "./_ticket-detail";
import type { MessageItem } from "./_conversation-thread";
import { resolveContactName, resolveOwnerName, resolveDisplayId, type ContactRow, type DeskAgentRow } from "../_resolve";

// Ticket Detail (task 303) — routed by tickets.ticket_number, not the id UUID (per explicit
// request; see task doc Requirements B). Same role gate as the list page.
export const dynamic = "force-dynamic";

type TicketDetailRow = {
  id: string;
  ticket_number: number;
  subject: string;
  status: TicketDetailData["status"];
  priority: TicketDetailData["priority"];
  channel: string;
  requester_email: string | null;
  external_contact_id: string | null;
  source_meta: Record<string, unknown> | null;
  created_at: string;
  resolved_at: string | null;
  first_response_at: string | null;
  sla_due_at: string | null;
  customer_id: string | null;
  customers: { company_name: string } | null;
};

type MessageRow = {
  id: string;
  author_type: MessageItem["authorType"];
  author_id: string | null;
  body: string;
  visibility: MessageItem["visibility"];
  source_meta: Record<string, unknown> | null;
  created_at: string;
};

type AttachmentRow = {
  id: string;
  entity_id: string;
  filename: string;
  size: number | null;
};

export async function generateMetadata({
  params,
}: {
  params: Promise<{ ticketNumber: string }>;
}): Promise<Metadata> {
  const { ticketNumber } = await params;
  return { title: `Ticket #${ticketNumber} · Desk` };
}

export default async function TicketDetailPage({ params }: { params: Promise<{ ticketNumber: string }> }) {
  const { ticketNumber: ticketNumberParam } = await params;
  const ticketNumber = Number(ticketNumberParam);
  if (!Number.isInteger(ticketNumber)) notFound();

  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  if (!claims?.claims) redirect(V2_ROUTES.AUTH_LOGIN);

  const userId = claims.claims.sub as string;
  const { data: profile } = await supabase.from("profiles").select("role").eq("id", userId).maybeSingle();
  const role = profile?.role ?? null;
  if (role !== "admin" && role !== "super_admin" && role !== "pm") redirect(V2_ROUTES.DASHBOARD);

  const { data: ticketData, error } = await supabase
    .from("tickets")
    .select(
      "id, ticket_number, subject, status, priority, channel, requester_email, external_contact_id, source_meta, created_at, resolved_at, first_response_at, sla_due_at, customer_id, customers(company_name)"
    )
    .eq("ticket_number", ticketNumber)
    .maybeSingle();

  if (error || !ticketData) notFound();
  const t = ticketData as TicketDetailRow;

  let contactRow: (ContactRow & { phone: string | null }) | null = null;
  if (t.external_contact_id) {
    const { data } = await supabase
      .from("contacts")
      .select("external_id, full_name, first_name, last_name, email, phone")
      .eq("external_id", t.external_contact_id)
      .maybeSingle();
    contactRow = data;
  }

  const assigneeIdMeta = t.source_meta?.assigneeId;
  let agentRow: DeskAgentRow | null = null;
  if (assigneeIdMeta != null) {
    const { data } = await supabase
      .from("desk_agents")
      .select("external_id, full_name, email")
      .eq("external_id", String(assigneeIdMeta))
      .maybeSingle();
    agentRow = data;
  }

  const { data: messagesData } = await supabase
    .from("ticket_messages")
    .select("id, author_type, author_id, body, visibility, source_meta, created_at")
    .eq("ticket_id", t.id)
    .order("created_at", { ascending: true });
  const messageRows = (messagesData ?? []) as MessageRow[];
  const messageIds = messageRows.map((m) => m.id);

  const staffAuthorIds = [...new Set(messageRows.map((m) => m.author_id).filter((v): v is string => !!v))];
  const staffByAuthorId = new Map<string, string | null>();
  if (staffAuthorIds.length > 0) {
    const { data: staffProfiles } = await supabase.from("profiles").select("id, full_name").in("id", staffAuthorIds);
    for (const p of staffProfiles ?? []) staffByAuthorId.set(p.id, p.full_name);
  }

  const attachmentsByMessageId = new Map<string, AttachmentRow[]>();
  if (messageIds.length > 0) {
    const { data: attachmentRows } = await supabase
      .from("attachments")
      .select("id, entity_id, filename, size")
      .eq("entity_type", "ticket_message")
      .in("entity_id", messageIds);
    for (const a of (attachmentRows ?? []) as AttachmentRow[]) {
      const list = attachmentsByMessageId.get(a.entity_id) ?? [];
      list.push(a);
      attachmentsByMessageId.set(a.entity_id, list);
    }
  }

  const phoneMeta = t.source_meta?.phone;
  const contactPhone = contactRow?.phone ?? (typeof phoneMeta === "string" ? phoneMeta : null);
  const zohoNumberMeta = t.source_meta?.ticketNumber;
  const zohoTicketNumber = typeof zohoNumberMeta === "string" ? zohoNumberMeta : null;

  const contactName = resolveContactName(t, contactRow ?? undefined);

  const ticket: TicketDetailData = {
    id: t.id,
    ticketNumber: t.ticket_number,
    displayId: resolveDisplayId(t),
    subject: t.subject,
    status: t.status,
    priority: t.priority,
    channel: t.channel,
    contactName,
    contactEmail: contactRow?.email ?? t.requester_email,
    contactPhone,
    accountName: t.customers?.company_name ?? null,
    owner: resolveOwnerName(agentRow ?? undefined),
    createdAt: t.created_at,
    resolvedAt: t.resolved_at,
    firstResponseAt: t.first_response_at,
    slaDueAt: t.sla_due_at,
    zohoTicketNumber,
  };

  const messages: MessageItem[] = messageRows.map((m) => {
    const contentTypeMeta = m.source_meta?.contentType;
    return {
      id: m.id,
      authorType: m.author_type,
      authorName: m.author_type === "staff" ? staffByAuthorId.get(m.author_id ?? "") ?? "Staff" : contactName,
      body: m.body,
      isHtml: contentTypeMeta === "text/html",
      visibility: m.visibility,
      createdAt: m.created_at,
      attachments: (attachmentsByMessageId.get(m.id) ?? []).map((a) => ({
        id: a.id,
        filename: a.filename,
        size: a.size,
      })),
    };
  });

  return <TicketDetail ticket={ticket} messages={messages} />;
}
