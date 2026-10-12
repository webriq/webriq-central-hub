import { adminClient } from "@/lib/supabase/admin";
import { fail, loadTicketForSite, type InboundResult } from "./inbound";
import { clampCreatedAt, statusPatch } from "./inbound-logic";
import { insertAttachmentRows, verifyRegistered } from "./attachments";
import { appendStatusLog } from "./read-model";
import type { CreateCommentInput, UpdateStatusInput } from "./schema";

// Task 445 — customer comment + customer status change (contract §3). Only customer-authored input is
// accepted inbound; staff replies originate in the Hub.
export async function addCustomerComment(ticketRef: string, input: CreateCommentInput): Promise<InboundResult> {
  const found = await loadTicketForSite(ticketRef, input.actor.site);
  if (found.error) return found.error;
  const { ticket } = found;

  const { data: existing } = await adminClient
    .from("inbox_messages")
    .select("id, inbox_id")
    .eq("external_ref", input.commentRef)
    .maybeSingle();
  if (existing && existing.inbox_id !== ticket.id) {
    return fail(409, "idempotency_conflict", "commentRef already belongs to another ticket", undefined, ticketRef);
  }

  // Task 447 — verify uploaded files before writing; a retried comment may re-register its own paths.
  const attachments = input.attachments ?? [];
  const verified = await verifyRegistered(attachments, input.actor.site, ticketRef, existing?.id);
  if (!verified.ok) {
    return fail(400, "invalid_payload", `Attachment rejected: ${verified.message}`, { path: verified.path }, ticketRef);
  }

  let messageId: string;
  if (existing) {
    const { error } = await adminClient.from("inbox_messages").update({ body: input.bodyHtml }).eq("id", existing.id);
    if (error) throw new Error(`comment update failed: ${error.message}`);
    messageId = existing.id;
  } else {
    const { data, error } = await adminClient
      .from("inbox_messages")
      .insert({
        inbox_id: ticket.id,
        author_type: "client",
        visibility: "public",
        body: input.bodyHtml,
        external_ref: input.commentRef,
        created_at: clampCreatedAt(input.createdAt, Date.now()),
        source_meta: {
          contentType: "text/html",
          source: "stackshift-direct",
          author: { userRef: input.actor.userRef, email: input.actor.email, name: input.actor.name ?? null },
        },
      })
      .select("id")
      .single();
    if (error || !data) throw new Error(`comment insert failed: ${error?.message}`);
    messageId = data.id;
  }

  await insertAttachmentRows(messageId, attachments);

  // A customer reply reopens a closed ticket (same rule as the email poll, task 327).
  if (ticket.status === "closed") {
    await adminClient.from("inbox").update(statusPatch("open", new Date().toISOString())).eq("id", ticket.id);
  }

  return { status: 201, outcome: "comment_added", ticketRef, body: { ok: true, messageId } };
}

export async function setCustomerStatus(ticketRef: string, input: UpdateStatusInput): Promise<InboundResult> {
  const found = await loadTicketForSite(ticketRef, input.actor.site);
  if (found.error) return found.error;

  // Task 448 — customer-initiated changes are not outbox events, so keep a small capped log in source_meta
  // for the Support Center's activity list (read-modify-write; a lost entry in a rare race is cosmetic).
  const nowIso = new Date().toISOString();
  const { data: current } = await adminClient.from("inbox").select("source_meta").eq("id", found.ticket.id).maybeSingle();
  const { error } = await adminClient
    .from("inbox")
    .update({
      ...statusPatch(input.status, nowIso),
      source_meta: appendStatusLog(current?.source_meta ?? null, { at: nowIso, status: input.status }),
    })
    .eq("id", found.ticket.id);
  if (error) throw new Error(`status update failed: ${error.message}`);

  return { status: 200, outcome: `status_${input.status}`, ticketRef, body: { ok: true, status: input.status } };
}
