import { transporter, FROM } from "./mailer";

// Task 347 — notification email fired on every StackShift Order Form submission.
// Plain-text + a light HTML summary table. Web-safe fonts only (email clients ignore the
// design system) — Arial is the deliberate, conventional choice for transactional email.

export type OrderNotificationData = {
  orderId: string;
  companyName: string;
  contactName: string | null;
  businessEmail: string | null;
  mobilePhone: string | null;
  website: string | null;
  services: string[];
  mappedClassifications: string[];
  approvedBy: string | null;
  submittedAt: string | null;
  proposalFilename: string | null;
  flowforgeSpecFilename: string | null;
  needsReview: boolean;
};

function reviewUrl(orderId: string): string {
  const base = process.env.NEXT_PUBLIC_APP_URL ?? "https://hub.webriq.com";
  return `${base}/stackshift-orders/${orderId}`;
}

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export async function sendStackShiftOrderNotification(
  to: string[],
  data: OrderNotificationData
): Promise<void> {
  if (to.length === 0) {
    console.warn("[stackshift-order] no notification recipients resolved — skipping email");
    return;
  }

  const url = reviewUrl(data.orderId);
  const rows: [string, string][] = [
    ["Company", data.companyName],
    ["Contact", data.contactName ?? "—"],
    ["Business email", data.businessEmail ?? "—"],
    ["Phone", data.mobilePhone ?? "—"],
    ["Website", data.website ?? "—"],
    ["Services selected", data.services.join(", ") || "—"],
    ["Mapped classification", data.mappedClassifications.join(", ") || "— (reviewer to set)"],
    ["Approved by", data.approvedBy ?? "—"],
    ["Submitted", data.submittedAt ?? "—"],
    ["Proposal", data.proposalFilename ?? "—"],
    ["FlowForge spec", data.flowforgeSpecFilename ?? "none"],
  ];

  const subject = `${data.needsReview ? "[Needs review] " : ""}New StackShift order — ${data.companyName}`;

  const text = [
    `A new StackShift Order Form submission is waiting in the Hub review queue.`,
    ``,
    ...rows.map(([k, v]) => `${k}: ${v}`),
    ``,
    data.needsReview
      ? `NOTE: multiple StackShift tiers were selected — a reviewer must pick one before converting.`
      : ``,
    `Review & convert: ${url}`,
  ]
    .filter(Boolean)
    .join("\n");

  const html = [
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f1f5f9;padding:32px 16px;font-family:Arial,Helvetica,sans-serif;">`,
    `<tr><td align="center">`,
    `<table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;background:#ffffff;border-radius:12px;overflow:hidden;border:1px solid #e2e8f0;">`,
    `<tr><td style="padding:24px 28px 8px;">`,
    `<p style="margin:0;font-size:16px;font-weight:700;color:#0f172a;">New StackShift order — ${esc(data.companyName)}</p>`,
    `<p style="margin:6px 0 0;font-size:13px;color:#64748b;">Waiting in the Hub review queue.</p>`,
    data.needsReview
      ? `<p style="margin:12px 0 0;font-size:13px;color:#b45309;font-weight:600;">Multiple StackShift tiers were selected — a reviewer must pick one before converting.</p>`
      : ``,
    `</td></tr>`,
    `<tr><td style="padding:12px 28px 8px;">`,
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="font-size:13px;color:#0f172a;">`,
    ...rows.map(
      ([k, v]) =>
        `<tr><td style="padding:6px 8px 6px 0;color:#64748b;white-space:nowrap;vertical-align:top;">${esc(k)}</td><td style="padding:6px 0;">${esc(v)}</td></tr>`
    ),
    `</table>`,
    `</td></tr>`,
    `<tr><td style="padding:16px 28px 28px;">`,
    `<table role="presentation" cellpadding="0" cellspacing="0"><tr><td style="border-radius:8px;background:#F97316;">`,
    `<a href="${url}" style="display:inline-block;padding:11px 24px;color:#fff;border-radius:8px;text-decoration:none;font-weight:600;font-size:14px;">Review &amp; convert</a>`,
    `</td></tr></table>`,
    `</td></tr>`,
    `</table>`,
    `</td></tr>`,
    `</table>`,
  ]
    .filter(Boolean)
    .join("");

  await transporter.sendMail({ from: FROM, to: to.join(", "), subject, text, html });
}
