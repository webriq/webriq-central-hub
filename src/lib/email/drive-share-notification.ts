// Task 437 — "X shared something with you on Drive". One email per recipient (never a shared To/Cc
// list). Design System v2.0 transactional style, mirroring ticket-created-notification.ts: web-safe
// fonts only, one orange pill CTA. Wording comes from buildShareCopy() so it matches the in-app row.
import { transporter, FROM } from "./mailer";
import type { ShareCopy } from "@/lib/drive/share-copy";

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export type DriveShareEmail = { to: string; recipientName: string | null; sharerName: string; itemName: string; copy: ShareCopy };

export async function sendDriveShareEmail({ to, recipientName, sharerName, itemName, copy }: DriveShareEmail): Promise<void> {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://hub.webriq.com";
  const openUrl = `${appUrl}${copy.path}`;
  const greeting = `Hi ${recipientName?.trim().split(/\s+/)[0] || "there"},`;
  const footer = `You're receiving this because ${sharerName} shared an item with you on WebriQ Central Hub.`;

  const text = [
    greeting, ``, copy.headline + `.`, ``, `“${itemName}”`, copy.accessLine, ``, `Open in Drive: ${openUrl}`, ``, footer,
  ].join("\n");

  const html = [
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F4F6FB;padding:40px 16px;font-family:Arial,Helvetica,sans-serif;">`,
    `<tr><td align="center">`,
    `<table role="presentation" width="480" cellpadding="0" cellspacing="0" style="max-width:480px;width:100%;background:#FFFFFF;border-radius:14px;overflow:hidden;border:1px solid #E2E7F2;">`,
    `<tr><td style="padding:32px 32px 24px;text-align:center;">`,
    `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 auto;"><tr>`,
    `<td style="padding-right:10px;vertical-align:middle;"><img src="${appUrl}/webriq_logo.webp" width="36" alt="WebriQ" style="display:block;width:36px;height:36px;"></td>`,
    `<td style="vertical-align:middle;"><span style="font-size:18px;font-weight:700;color:#0B1533;">WebriQ Central Hub</span></td>`,
    `</tr></table>`,
    `</td></tr>`,
    `<tr><td style="padding:0 32px 32px;">`,
    `<p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:#0B1533;">${esc(greeting)}</p>`,
    `<p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:#3A4565;"><strong>${esc(copy.headline)}.</strong></p>`,
    `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 24px;width:100%;"><tr><td style="padding:12px 16px;background:#F4F6FB;border:1px solid #E2E7F2;border-radius:10px;">`,
    `<p style="margin:0 0 4px;font-size:15px;font-weight:600;color:#0B1533;">${esc(itemName)}</p>`,
    `<p style="margin:0;font-size:13px;line-height:1.6;color:#5F6A88;">${esc(copy.accessLine)}</p>`,
    `</td></tr></table>`,
    `<table role="presentation" cellpadding="0" cellspacing="0"><tr><td style="border-radius:999px;background:#FB914E;">`,
    `<a href="${openUrl}" style="display:inline-block;padding:12px 28px;color:#471F02;border-radius:999px;text-decoration:none;font-weight:600;font-size:15px;">Open in Drive</a>`,
    `</td></tr></table>`,
    `<p style="margin:24px 0 0;font-size:12px;line-height:1.6;color:#5F6A88;">${esc(footer)}</p>`,
    `</td></tr>`,
    `</table>`,
    `</td></tr>`,
    `</table>`,
  ].join("");

  await transporter.sendMail({ from: FROM, to, subject: copy.subject, text, html });
}
