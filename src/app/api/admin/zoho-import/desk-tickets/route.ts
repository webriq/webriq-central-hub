// dev-only import endpoint — reads _from_zoho/desk-tickets.json, upserts to the native
// tickets table (merged, not a separate archival table — task 296). Matches a customer via
// the ticket's Desk contact (contacts.customer_id, already vetted by task 117's import) with
// a fallback via ticket.accountId resolved through desk-accounts.json (task 302 — the Desk API
// documentation's nested contact.account.accountName never actually appears on real ticket
// payloads; fetchAllDeskPages() calls /tickets with no `include` param, so Zoho only returns
// flat IDs). Tickets that can't be matched import anyway with customer_id: null (review queue,
// same precedent as task 117's unmatched contacts). Never writes Zoho's ticketNumber into
// tickets.ticket_number — that column is a `serial` sequence, not an external-id field.
import { NextResponse } from "next/server";
import { adminClient, ImportResult, readFromZoho, normalizeCompanyName, mapPriority, mapTicketStatus } from "@/lib/migrate/zoho-import";
import { createClient } from "@/lib/supabase/server";

type DeskAccountRaw = {
  id?: string | number;
  accountName?: string;
  [key: string]: unknown;
};

// Real ticket payloads only ever carry flat IDs (accountId/departmentId/teamId/contactId/
// assigneeId) — the nested contact/department/team/assignee objects shown in Zoho's Desk API
// docs never appear because fetchAllDeskPages() requests /tickets with no `include` param.
// Confirmed against all 530 records in a real portal export (task 302).
type DeskTicketRaw = {
  id?: string | number;
  ticketNumber?: string;
  subject?: string;
  status?: string;
  statusType?: string;
  priority?: string;
  channel?: string;
  channelCode?: string;
  dueDate?: string | null;
  responseDueDate?: string | null;
  closedTime?: string | null;
  onholdTime?: string | null;
  createdTime?: string | null;
  customerResponseTime?: string | null;
  sharedCount?: string | number;
  threadCount?: string | number;
  commentCount?: string | number;
  isSpam?: boolean;
  isRead?: boolean;
  isArchived?: boolean;
  sentiment?: string | null;
  language?: string | null;
  webUrl?: string | null;
  productId?: string | null;
  departmentId?: string | number | null;
  teamId?: string | number | null;
  contactId?: string | number | null;
  accountId?: string | number | null;
  email?: string | null;
  phone?: string | null;
  assigneeId?: string | number | null;
  lastThread?: Record<string, unknown> | null;
  source?: Record<string, unknown> | null;
  [key: string]: unknown;
};

type TicketRow = {
  customer_id: string | null;
  subject: string;
  channel: "portal" | "email" | "manual";
  priority: "low" | "normal" | "high" | "critical";
  status: "new" | "open" | "waiting_on_client" | "waiting_on_us" | "resolved" | "closed";
  requester_email: string | null;
  sla_due_at: string | null;
  resolved_at: string | null;
  created_at: string | undefined;
  first_response_at: string | null;
  external_id: string;
  external_contact_id: string | null;
  external_account_id: string | null;
  match_method: "contact" | "account_name" | null;
  source_meta: Record<string, unknown>;
};

const CHUNK_SIZE = 50;

export async function POST() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: profile } = await adminClient.from("profiles").select("role").eq("id", user.id).maybeSingle();
  if (profile?.role !== "admin" && profile?.role !== "super_admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  let tickets: DeskTicketRaw[];
  try {
    tickets = readFromZoho<DeskTicketRaw>("desk-tickets.json");
  } catch {
    return NextResponse.json(
      { error: "Could not read _from_zoho/desk-tickets.json — run the Desk Tickets export first" },
      { status: 400 }
    );
  }

  if (tickets.length === 0) {
    return NextResponse.json({ error: "No tickets found in desk-tickets.json" }, { status: 400 });
  }

  let deskAccounts: DeskAccountRaw[] = [];
  try {
    deskAccounts = readFromZoho<DeskAccountRaw>("desk-accounts.json");
  } catch {
    console.warn(
      "[import/desk-tickets] _from_zoho/desk-accounts.json not found — account-name fallback " +
      "matching disabled (run the Desk Accounts export for account-name matching; requires the " +
      "Desk.accounts.READ scope)"
    );
  }

  const accountNameById = new Map<string, string>();
  for (const a of deskAccounts) {
    if (a.id != null && a.accountName) accountNameById.set(String(a.id), a.accountName);
  }

  // Paginated contacts lookup (1627 rows in the real portal — exceeds Supabase's 1000-row
  // default select limit, same fix as tasks/timelogs/issues import).
  const contactRows: Array<{ external_id: string | null; customer_id: string | null }> = [];
  {
    const PAGE = 1000;
    let from = 0;
    while (true) {
      const { data: page } = await adminClient
        .from("contacts")
        .select("external_id, customer_id")
        .not("external_id", "is", null)
        .range(from, from + PAGE - 1);
      if (!page || page.length === 0) break;
      contactRows.push(...page);
      if (page.length < PAGE) break;
      from += PAGE;
    }
  }
  const customerIdByContactExternalId = new Map(
    contactRows.filter((c) => c.customer_id).map((c) => [String(c.external_id), c.customer_id as string])
  );

  // Paginated customers lookup — for the account-name fallback match.
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
    `[import/desk-tickets] ${tickets.length} tickets, ${contactRows.length} contacts, ${customerRows.length} customers, ${deskAccounts.length} accounts`
  );

  const result: ImportResult & { matched: number; unmatched: number } = {
    imported: 0,
    updated: 0,
    skipped: 0,
    errors: [],
    matched: 0,
    unmatched: 0,
  };
  const rows: TicketRow[] = [];

  for (const ticket of tickets) {
    const externalId = ticket.id != null ? String(ticket.id) : "";
    if (!externalId || !ticket.subject) {
      result.skipped++;
      continue;
    }

    const contactId = ticket.contactId != null ? String(ticket.contactId) : null;
    const accountId = ticket.accountId != null ? String(ticket.accountId) : null;
    const accountName = accountId ? accountNameById.get(accountId) ?? null : null;

    let customerId: string | null = null;
    let matchMethod: "contact" | "account_name" | null = null;
    if (contactId && customerIdByContactExternalId.has(contactId)) {
      customerId = customerIdByContactExternalId.get(contactId)!;
      matchMethod = "contact";
    } else if (accountName) {
      const viaAccountName = customerByNormalizedName.get(normalizeCompanyName(accountName)) ?? null;
      if (viaAccountName) {
        customerId = viaAccountName;
        matchMethod = "account_name";
      }
    }

    if (customerId) result.matched++;
    else result.unmatched++;

    const channel = String(ticket.channel ?? "").toLowerCase() === "email" ? "email" : "manual";

    rows.push({
      customer_id: customerId,
      subject: ticket.subject,
      channel,
      priority: mapPriority(ticket.priority ?? ""),
      status: mapTicketStatus(ticket.status ?? "", ticket.statusType ?? ""),
      requester_email: ticket.email ?? null,
      sla_due_at: ticket.dueDate ?? null,
      resolved_at: ticket.closedTime ?? null,
      created_at: ticket.createdTime ?? undefined,
      first_response_at: ticket.customerResponseTime ?? null,
      external_id: externalId,
      external_contact_id: contactId,
      external_account_id: accountId,
      match_method: matchMethod,
      source_meta: {
        ticketNumber: ticket.ticketNumber ?? null,
        statusType: ticket.statusType ?? null,
        channel: ticket.channel ?? null,
        channelCode: ticket.channelCode ?? null,
        departmentId: ticket.departmentId ?? null,
        teamId: ticket.teamId ?? null,
        sentiment: ticket.sentiment ?? null,
        phone: ticket.phone ?? null,
        isArchived: ticket.isArchived ?? null,
        lastThread: ticket.lastThread ?? null,
        source: ticket.source ?? null,
        isSpam: ticket.isSpam ?? null,
        isRead: ticket.isRead ?? null,
        threadCount: ticket.threadCount ?? null,
        commentCount: ticket.commentCount ?? null,
        webUrl: ticket.webUrl ?? null,
        language: ticket.language ?? null,
        productId: ticket.productId ?? null,
        responseDueDate: ticket.responseDueDate ?? null,
        onholdTime: ticket.onholdTime ?? null,
        sharedCount: ticket.sharedCount ?? null,
        customerResponseTime: ticket.customerResponseTime ?? null,
        createdTime: ticket.createdTime ?? null,
        assigneeId: ticket.assigneeId ?? null,
      },
    });
  }

  console.log(`[import/desk-tickets] upserting ${rows.length} rows in chunks of ${CHUNK_SIZE} (${result.skipped} skipped)`);

  for (let i = 0; i < rows.length; i += CHUNK_SIZE) {
    const chunk = rows.slice(i, i + CHUNK_SIZE);
    const { error } = await adminClient.from("tickets").upsert(chunk, { onConflict: "external_id" });
    const chunkNum = Math.floor(i / CHUNK_SIZE) + 1;
    const totalChunks = Math.ceil(rows.length / CHUNK_SIZE);
    if (error) {
      console.error(`[import/desk-tickets] chunk ${chunkNum}/${totalChunks} failed:`, error.message);
      result.errors.push(`chunk ${chunkNum}: ${error.message}`);
    } else {
      console.log(`[import/desk-tickets] chunk ${chunkNum}/${totalChunks} upserted (${chunk.length} rows)`);
      result.imported += chunk.length;
    }
  }

  console.log(
    `[import/desk-tickets] done: ${result.imported} imported, ${result.matched} matched, ${result.unmatched} unmatched, ${result.errors.length} error(s)`
  );
  return NextResponse.json(result);
}
