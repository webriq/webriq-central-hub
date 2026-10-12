import { after } from "next/server";
import { adminClient } from "@/lib/supabase/admin";
import { transporter, FROM } from "@/lib/email/mailer";
import { dispatchTicketSoon } from "./dispatch";
import { shouldNotifyCustomer } from "./stepdown-logic";
import { isSiteSignedOff } from "./parity";

// Task 446 — a staff reply on a direct (channel='stackshift') ticket. There is no Zoho Mail thread to
// reply into, so the reply is just a public staff message: inserting it fires the
// stackshift_enqueue_staff_reply trigger (migration 171), which writes the outbox event in the same
// transaction. Delivery to StackShift is the dispatcher's job. The Hub only emails the customer when
// STACKSHIFT_SUPPORT_NOTIFY_CUSTOMER=true (off during the Desk overlap: StackShift/Desk already notify).
export async function replyOnDirectTicket(params: {
  ticket: { id: string; subject: string; requester_email: string | null };
  staffUserId: string;
  bodyHtml: string;
}): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const { ticket, staffUserId, bodyHtml } = params;

  const { data, error } = await adminClient
    .from("inbox_messages")
    .insert({
      inbox_id: ticket.id,
      author_type: "staff",
      author_id: staffUserId,
      body: bodyHtml,
      visibility: "public",
      source_meta: { contentType: "text/html", source: "stackshift-direct" },
    })
    .select("id")
    .single();
  if (error || !data) {
    console.error("[stackshift-support] direct reply insert failed:", error?.message);
    return { ok: false, error: "Failed to save the reply" };
  }

  after(async () => {
    await dispatchTicketSoon(ticket.id);
    // Task 450: same gate as the ticket-created email — signed-off site + operator opt-in (global flag or the
    // per-site list). Replies carry no per-request suppress flag, so only the first two conditions apply.
    const { data: row } = await adminClient.from("inbox").select("stackshift_site").eq("id", ticket.id).maybeSingle();
    const site = row?.stackshift_site ?? null;
    const notify = shouldNotifyCustomer({
      globalFlag: process.env.STACKSHIFT_SUPPORT_NOTIFY_CUSTOMER,
      sitesCsv: process.env.STACKSHIFT_SUPPORT_NOTIFY_SITES,
      site,
      siteSignedOff: await isSiteSignedOff(site),
      suppress: false,
    });
    if (notify && ticket.requester_email) {
      try {
        await transporter.sendMail({
          from: FROM,
          to: ticket.requester_email,
          subject: /^re:/i.test(ticket.subject) ? ticket.subject : `Re: ${ticket.subject}`,
          html: bodyHtml,
        });
      } catch (err) {
        console.error("[stackshift-support] customer reply email failed:", err);
      }
    }
  });

  return { ok: true, id: data.id };
}
