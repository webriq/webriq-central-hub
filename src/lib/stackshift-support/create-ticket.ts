import { adminClient } from "@/lib/supabase/admin";
import { notifyCustomerTicketCreated } from "@/lib/desk/customer-view-access";
import { computeDueAt } from "./sla";
import { insertAttachmentRows, verifyRegistered } from "./attachments";
import { fail, type InboundResult } from "./inbound";
import { clampCreatedAt, isSameCreateRetry, mapPriority, pickDuplicateOf } from "./inbound-logic";
import { shouldNotifyCustomer } from "./stepdown-logic";
import { isSiteSignedOff } from "./parity";
import { escapeLike } from "./like";
import type { CreateTicketInput } from "./schema";

// Task 445 — create a StackShift-native ticket (contract §3 POST /tickets). Overlap rules (design §6):
// the direct path owns its OWN row and never writes inbox.external_id (that is the Desk poll's upsert key),
// correlates to the Desk copy by exact deskTicketId, flags both sides, and never merges or skips.
export async function createStackShiftTicket(input: CreateTicketInput, afterConflict = false): Promise<InboundResult> {
  const { ticketRef, actor } = input;
  const now = Date.now();
  const createdAt = clampCreatedAt(input.createdAt, now);

  const { data: existing } = await adminClient
    .from("inbox")
    .select("id, ticket_number, ticket_id, subject, status, sla_due_at, stackshift_site, source_meta")
    .eq("external_ref", ticketRef)
    .maybeSingle();
  if (existing) {
    if (isSameCreateRetry(existing, actor.site, input.subject)) {
      // Same request retried (e.g. the response was lost and the idempotency row was never stored): answer
      // with the ticket that already exists. handleInbound then stores the idempotency row, healing the gap.
      return {
        status: 200,
        outcome: "deduped",
        ticketRef,
        body: {
          ok: true,
          deduped: true,
          hubTicketId: existing.id,
          ticketNumber: existing.ticket_number,
          displayId: existing.ticket_id,
          dueAt: existing.sla_due_at,
          status: existing.status,
          duplicateOf: (existing.source_meta as { duplicateOf?: unknown } | null)?.duplicateOf ?? null,
        },
      };
    }
    return fail(409, "idempotency_conflict", "ticketRef already exists for a different request", undefined, ticketRef);
  }

  // Task 447 — verify uploaded files BEFORE writing anything: a bad attachment fails the whole request
  // (400 naming the path) and leaves no ticket behind.
  const attachments = input.attachments ?? [];
  const verified = await verifyRegistered(attachments, actor.site, ticketRef);
  if (!verified.ok) {
    return fail(400, "invalid_payload", `Attachment rejected: ${verified.message}`, { path: verified.path }, ticketRef);
  }

  const { data: contactMatches } = await adminClient
    .from("contacts")
    .select("customer_id")
    .ilike("email", escapeLike(actor.email))
    .not("customer_id", "is", null)
    .limit(1);

  let deskRow: { id: string; ticket_number: number; source_meta: Record<string, unknown> } | null = null;
  if (input.deskTicketId) {
    const { data } = await adminClient
      .from("inbox")
      .select("id, ticket_number, source_meta")
      .eq("external_id", input.deskTicketId)
      .maybeSingle();
    deskRow = data;
  }

  const priority = mapPriority(input.priority);
  const dueAt = (await computeDueAt(priority, new Date(createdAt))).toISOString();

  // The new row's own id/ticket_number are unknown until insert, so duplicateOf (which points at the
  // OTHER row) can be computed up front.
  const duplicateOf = pickDuplicateOf(deskRow, null);

  const { data: ticket, error: ticketError } = await adminClient
    .from("inbox")
    .insert({
      customer_id: contactMatches?.[0]?.customer_id ?? null,
      subject: input.subject,
      channel: "stackshift",
      priority,
      status: "open",
      requester_email: actor.email,
      sla_due_at: dueAt,
      created_at: createdAt,
      external_ref: ticketRef,
      stackshift_site: actor.site,
      stackshift_actor_ref: actor.userRef,
      desk_ticket_id: input.deskTicketId ?? null,
      source_meta: {
        source: "stackshift-direct",
        requesterName: actor.name ?? null,
        deskTicketNumber: input.deskTicketNumber ?? null,
        ...(duplicateOf ? { duplicateOf } : {}),
      },
    })
    .select("id, ticket_number, ticket_id")
    .single();

  if (ticketError || !ticket) {
    if (ticketError?.code === "23505") {
      // Lost a race with an identical concurrent create: run once more so the winner's ticket is answered as a
      // retry (or a real 409 if it is a different request). `afterConflict` stops any chance of looping.
      if (!afterConflict) return createStackShiftTicket(input, true);
      return fail(409, "idempotency_conflict", "ticketRef already exists", undefined, ticketRef);
    }
    throw new Error(`inbox insert failed: ${ticketError?.message}`);
  }

  const { data: firstMessage, error: messageError } = await adminClient.from("inbox_messages").insert({
    inbox_id: ticket.id,
    author_type: "client",
    visibility: "public",
    body: input.bodyHtml,
    external_ref: `${ticketRef}#body`,
    created_at: createdAt,
    source_meta: {
      contentType: "text/html",
      source: "stackshift-direct",
      author: { userRef: actor.userRef, email: actor.email, name: actor.name ?? null },
    },
  }).select("id").single();
  if (messageError || !firstMessage) {
    // PostgREST has no multi-statement transaction: undo the ticket so a retry starts clean.
    await adminClient.from("inbox").delete().eq("id", ticket.id);
    throw new Error(`first message insert failed: ${messageError?.message}`);
  }

  try {
    await insertAttachmentRows(firstMessage.id, attachments);
  } catch (err) {
    await adminClient.from("inbox").delete().eq("id", ticket.id); // cascades the message
    throw err;
  }

  // Reverse side of the exact correlation: flag the Desk copy too. Best-effort — the poll also
  // flags both sides when the Desk row arrives later, so a failure here self-heals.
  if (deskRow) {
    const { error: flagError } = await adminClient
      .from("inbox")
      .update({
        source_meta: {
          ...deskRow.source_meta,
          duplicateOf: { inboxId: ticket.id, ticketNumber: ticket.ticket_number, via: "desk_ticket_id" },
        },
      })
      .eq("id", deskRow.id);
    if (flagError) console.warn("[stackshift-support] could not flag Desk copy:", flagError.message);
  }

  // Task 450 (design D4): the Hub emails the customer only for a signed-off site the operator opted in, and
  // only when this request says StackShift stopped sending its own. Before the gate: silent, as before.
  if (
    shouldNotifyCustomer({
      globalFlag: process.env.STACKSHIFT_SUPPORT_NOTIFY_CUSTOMER,
      sitesCsv: process.env.STACKSHIFT_SUPPORT_NOTIFY_SITES,
      site: actor.site,
      siteSignedOff: await isSiteSignedOff(actor.site),
      suppress: input.suppressCustomerNotifications,
    })
  ) {
    await notifyCustomerTicketCreated({
      ticketId: ticket.id,
      ticketNumber: ticket.ticket_number,
      subject: input.subject,
      requesterEmail: actor.email,
    });
  }

  return {
    status: 201,
    outcome: "created",
    ticketRef,
    body: {
      ok: true,
      hubTicketId: ticket.id,
      ticketNumber: ticket.ticket_number,
      displayId: ticket.ticket_id,
      dueAt,
      status: "open",
      duplicateOf,
    },
  };
}
