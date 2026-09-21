// Task 379 — "Your ticket has been created" customer confirmation, fired once per new native
// Desk Mailbox ticket (email-poll cron's new-ticket branch only). WebriQ-branded using the
// Design System v2.0 tokens (_final_design/guide/central-hub-design-system.md), not the older
// #F97316 orange still used by a couple of pre-v2.0 transactional emails in mailer.ts.
import { transporter, FROM } from "./mailer";

export type TicketCreatedEmailData = {
  to: string;
  requesterName: string;
  ticketNumber: number;
  subject: string;
  password: string;
  viewUrl: string;
};

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export async function sendTicketCreatedEmail(data: TicketCreatedEmailData): Promise<void> {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://hub.webriq.com";
  const logoUrl = `${appUrl}/webriq_logo.webp`;
  const subject = `[##${data.ticketNumber}##] Your ticket has been created`;

  const text = [
    `Dear ${data.requesterName},`,
    ``,
    `Your ticket has been created with the ticket ID ${data.ticketNumber} and subject "${data.subject}".`,
    ``,
    `We will process your request and update you with a resolution as soon as possible.`,
    ``,
    `View your ticket: ${data.viewUrl}`,
    `Password: ${data.password}`,
    `(You'll be asked to enter this password to view the ticket.)`,
    ``,
    `Regards,`,
    `WebriQ Support Team.`,
  ].join("\n");

  const html = [
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F4F6FB;padding:40px 16px;font-family:Arial,Helvetica,sans-serif;">`,
    `<tr><td align="center">`,
    `<table role="presentation" width="480" cellpadding="0" cellspacing="0" style="max-width:480px;width:100%;background:#FFFFFF;border-radius:14px;overflow:hidden;border:1px solid #E2E7F2;">`,
    `<tr><td style="padding:32px 32px 24px;text-align:center;">`,
    `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 auto;"><tr>`,
    `<td style="padding-right:10px;vertical-align:middle;"><img src="${logoUrl}" width="36" alt="WebriQ" style="display:block;width:36px;height:36px;"></td>`,
    `<td style="vertical-align:middle;"><span style="font-size:18px;font-weight:700;color:#0B1533;font-family:Arial,Helvetica,sans-serif;">WebriQ Central Hub</span></td>`,
    `</tr></table>`,
    `</td></tr>`,
    `<tr><td style="padding:0 32px 32px;">`,
    `<p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:#0B1533;">Dear ${esc(data.requesterName)},</p>`,
    `<p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:#3A4565;">Your ticket has been created with the ticket ID <strong>${data.ticketNumber}</strong> and subject "${esc(data.subject)}".</p>`,
    `<p style="margin:0 0 24px;font-size:15px;line-height:1.6;color:#3A4565;">We will process your request and update you with a resolution as soon as possible.</p>`,
    `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 24px;width:100%;">`,
    `<tr><td style="padding:12px 16px;background:#F4F6FB;border:1px solid #E2E7F2;border-radius:10px;">`,
    `<p style="margin:0 0 4px;font-size:11px;font-weight:600;color:#5F6A88;text-transform:uppercase;letter-spacing:.05em;">Ticket password</p>`,
    `<p style="margin:0;font-size:16px;font-weight:600;color:#0B1533;font-family:'Courier New',monospace;letter-spacing:.04em;">${esc(data.password)}</p>`,
    `</td></tr></table>`,
    `<p style="margin:0 0 20px;font-size:13px;line-height:1.6;color:#5F6A88;">You'll be asked to enter this password to view your ticket.</p>`,
    `<table role="presentation" cellpadding="0" cellspacing="0"><tr><td style="border-radius:999px;background:#FB914E;">`,
    `<a href="${data.viewUrl}" style="display:inline-block;padding:12px 28px;color:#471F02;border-radius:999px;text-decoration:none;font-weight:600;font-size:15px;">View ticket</a>`,
    `</td></tr></table>`,
    `<p style="margin:28px 0 0;font-size:15px;line-height:1.6;color:#0B1533;">Regards,<br>WebriQ Support Team.</p>`,
    `</td></tr>`,
    `</table>`,
    `</td></tr>`,
    `</table>`,
  ].join("");

  await transporter.sendMail({ from: FROM, to: data.to, subject, text, html });
}
