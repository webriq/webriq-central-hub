import { redirect, notFound } from "next/navigation";
import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { V2_ROUTES } from "@/config/constants";
import TicketDetail, { type TicketDetailData } from "./_ticket-detail";
import type { MessageItem } from "./_conversation-thread";
import {
  resolveContactName,
  resolveOwnerName,
  resolveDisplayId,
  normalizeName,
  type ContactRow,
  type DeskAgentRow,
} from "../_resolve";

// Ticket Detail (task 303) — routed by tickets.ticket_id (`TKT-<n>`), not the id UUID
// (task 326 — was the bare ticket_number; a deliberate "display value in the route param"
// exception, same as /v2/projects/[projectId]). Same role gate as the list page.
export const dynamic = "force-dynamic";

type TicketDetailRow = {
  id: string;
  ticket_number: number;
  ticket_id: string;
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
  email_message_id: string | null;
};

type AttachmentRow = {
  id: string;
  entity_id: string;
  filename: string;
  size: number | null;
};

// Zoho's unselected-picklist placeholder for the StackShift Site custom field — leaks into
// source_meta as a literal value on some imported tickets (task 330). Treated as empty.
const STACKSHIFT_PLACEHOLDER = "select stackshift site";

// source_meta custom-field values are typed `unknown` (source_meta is Record<string, unknown>);
// narrow to a trimmed non-empty string or null.
function cfString(v: unknown): string | null {
  return typeof v === "string" && v.trim() !== "" ? v.trim() : null;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ ticketId: string }>;
}): Promise<Metadata> {
  const { ticketId } = await params;
  return { title: `Ticket #${ticketId.replace(/^TKT-/, "")} · Desk` };
}

export default async function TicketDetailPage({ params }: { params: Promise<{ ticketId: string }> }) {
  const { ticketId } = await params;
  if (!/^TKT-\d+$/.test(ticketId)) notFound();

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
      "id, ticket_number, ticket_id, subject, status, priority, channel, requester_email, external_contact_id, source_meta, created_at, resolved_at, first_response_at, sla_due_at, customer_id, customers(company_name)"
    )
    .eq("ticket_id", ticketId)
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
    .select("id, author_type, author_id, body, visibility, source_meta, created_at, email_message_id")
    .eq("ticket_id", t.id)
    .order("created_at", { ascending: true });
  const messageRows = (messagesData ?? []) as MessageRow[];
  const messageIds = messageRows.map((m) => m.id);

  // Task 328 — resolve each message's author to a Hub user for the exact display name + avatar.
  // The importers persist the raw Zoho identity in source_meta: `author` (threads) OR
  // `commenter` (comments), same { name, email, type } shape. `author_id` is only set when the
  // import could match an email to an auth.users row — null for every NON_DESK_USER comment
  // commenter (WebriQ devs commenting from Zoho Projects, no Desk email), which is why those
  // rows used to fall through to the literal "Staff".
  const identityOf = (m: MessageRow): { name: string | null; email: string | null } => {
    const idn = (m.source_meta?.author ?? m.source_meta?.commenter) as
      | { name?: unknown; email?: unknown }
      | null
      | undefined;
    const name = typeof idn?.name === "string" && idn.name.trim() ? idn.name.trim() : null;
    const email = typeof idn?.email === "string" && idn.email.trim() ? idn.email.toLowerCase().trim() : null;
    return { name, email };
  };
  const identities = messageRows.map(identityOf);

  const authorIds = [...new Set(messageRows.map((m) => m.author_id).filter((v): v is string => !!v))];
  const candidateEmails = [...new Set(identities.map((i) => i.email).filter((v): v is string => !!v))];
  const candidateNames = [...new Set(identities.map((i) => i.name).filter((v): v is string => !!v))];

  type ProfileLite = { id: string; full_name: string | null; avatar_url: string | null };
  const profileById = new Map<string, ProfileLite>();
  const profileByNormName = new Map<string, ProfileLite>();
  if (authorIds.length > 0) {
    const { data } = await supabase.from("profiles").select("id, full_name, avatar_url").in("id", authorIds);
    for (const p of (data ?? []) as ProfileLite[]) profileById.set(p.id, p);
  }
  if (candidateNames.length > 0) {
    // profiles has no email column (email lives in auth.users / the JWT), so an exact full_name
    // match is the only key available here for the import-unmatched rows (e.g. NON_DESK_USER
    // comment commenters). Bucketed by normalized key so lookup is case/accent-insensitive.
    const { data } = await supabase.from("profiles").select("id, full_name, avatar_url").in("full_name", candidateNames);
    for (const p of (data ?? []) as ProfileLite[]) {
      if (p.full_name) profileByNormName.set(normalizeName(p.full_name), p);
    }
  }

  // desk_agents is a flat lookup (no avatar column) — a name-only safety net for a staff row
  // whose Zoho identity name is somehow blank but whose email/author_id still resolves.
  const deskAgentByEmail = new Map<string, string>();
  const deskAgentByNormName = new Map<string, string>();
  if (candidateEmails.length > 0) {
    const { data } = await supabase.from("desk_agents").select("full_name, email").in("email", candidateEmails);
    for (const a of data ?? []) if (a.email && a.full_name) deskAgentByEmail.set(a.email.toLowerCase(), a.full_name);
  }
  if (candidateNames.length > 0) {
    const { data } = await supabase.from("desk_agents").select("full_name").in("full_name", candidateNames);
    for (const a of data ?? []) if (a.full_name) deskAgentByNormName.set(normalizeName(a.full_name), a.full_name);
  }

  const attachmentsByMessageId = new Map<string, AttachmentRow[]>();
  if (messageIds.length > 0) {
    // .is("cid", null) excludes inline (cid-referenced) images resolved via IMAP (task 321) —
    // those are embedded directly in the message HTML, not separate downloadable attachments,
    // so they must not show up as attachment chips or in the Attachments tab (task 320).
    const { data: attachmentRows } = await supabase
      .from("attachments")
      .select("id, entity_id, filename, size")
      .eq("entity_type", "ticket_message")
      .in("entity_id", messageIds)
      .is("cid", null);
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

  // Task 330 — ticket custom fields captured by task 329's import. `whiteLabel`
  // (Zoho cf_white_label) is shown in the ticket UI under the label "Business Name".
  const whiteLabel = cfString(t.source_meta?.whiteLabel);
  const stackShiftRaw = cfString(t.source_meta?.stackShiftSite);
  const stackShiftSite =
    stackShiftRaw && stackShiftRaw.toLowerCase() === STACKSHIFT_PLACEHOLDER ? null : stackShiftRaw;

  const contactName = resolveContactName(t, contactRow ?? undefined);

  const ticket: TicketDetailData = {
    id: t.id,
    ticketId: t.ticket_id,
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
    whiteLabel,
    stackShiftSite,
  };

  const messages: MessageItem[] = messageRows.map((m, idx) => {
    const contentTypeMeta = m.source_meta?.contentType;
    // Task 323 — classify into the Threads vs Comments streams. Imported rows carry
    // source_meta.zohoSource ("thread" | "comment"); Hub-native replies/notes don't, so
    // fall back to visibility (internal note -> comment, public reply -> thread).
    const zohoSource = m.source_meta?.zohoSource;
    const kind: MessageItem["kind"] =
      zohoSource === "comment"
        ? "comment"
        : zohoSource === "thread"
          ? "thread"
          : m.visibility === "internal"
            ? "comment"
            : "thread";
    // Task 323/328 — prefer the name Zoho recorded on the imported thread/comment
    // (source_meta.author.name for threads, source_meta.commenter.name for comments —
    // both folded into identities[idx] by identityOf above) over the Hub profile the import
    // resolved by email (which can carry a stale full_name). Falls back to a matched Hub
    // profile / desk_agent, then the ticket contact.
    const { name: zohoName, email: zohoEmail } = identities[idx];
    const isStaff = m.author_type === "staff";
    const prof = isStaff
      ? (m.author_id ? profileById.get(m.author_id) : undefined) ??
        (zohoName ? profileByNormName.get(normalizeName(zohoName)) : undefined)
      : undefined;
    const agentName = isStaff
      ? (zohoEmail ? deskAgentByEmail.get(zohoEmail) : undefined) ??
        (zohoName ? deskAgentByNormName.get(normalizeName(zohoName)) : undefined)
      : undefined;
    const authorName = isStaff
      ? zohoName ?? prof?.full_name ?? agentName ?? "Staff"
      : zohoName ?? contactName;
    return {
      id: m.id,
      authorType: m.author_type,
      authorName,
      // Task 328 — avatar only from a matched Hub profile (re-hosted into the public
      // user-avatars bucket by task 288). Zoho's own photoURL is deliberately unused: those
      // URLs are auth-gated (desk.zoho.com/supportapi, profile.zoho.com) and render broken.
      avatarUrl: prof?.avatar_url ?? null,
      body: m.body,
      isHtml: contentTypeMeta === "text/html",
      visibility: m.visibility,
      kind,
      createdAt: m.created_at,
      attachments: (attachmentsByMessageId.get(m.id) ?? []).map((a) => ({
        id: a.id,
        filename: a.filename,
        size: a.size,
      })),
      emailMessageId: m.email_message_id,
    };
  });

  // Not a secret — same value the reply route already sends the customer From — safe to expose
  // to the client for the reply composer's read-only From row (task 320).
  const fromAddress = process.env.ZOHO_MAIL_FROM_ADDRESS ?? null;

  return <TicketDetail ticket={ticket} messages={messages} fromAddress={fromAddress} />;
}
