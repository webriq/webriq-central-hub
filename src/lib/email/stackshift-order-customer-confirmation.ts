import { transporter, FROM } from "./mailer";

// Task 354 — confirmation email sent to the StackShift Order Form submitter after a
// submission is successfully recorded by POST /api/webhooks/stackshift-order. Separate
// from and independent of the internal staff notification (stackshift-order-notification.ts).
// Plain-text + a light HTML summary. Web-safe fonts only (email clients ignore the design
// system) — Arial is the deliberate, conventional choice for transactional email.
//
// Deliberately contains NO link to the /stackshift-orders review queue — that is internal.

export type OrderCustomerConfirmationData = {
  to: string[];
  companyName: string;
  contactName: string | null;
  services: string[];
  proposalFilename: string | null;
  flowforgeSpecFilename: string | null;
};

// A monitored inbox the customer can reply to with questions. Falls back to the first
// entry of the staff notify list, then to nothing (the email still sends from FROM).
function resolveReplyTo(): string | undefined {
  const explicit = process.env.STACKSHIFT_ORDER_REPLY_TO?.trim();
  if (explicit && explicit.includes("@")) return explicit;
  for (const raw of (process.env.STACKSHIFT_ORDER_NOTIFY_EMAILS ?? "").split(",")) {
    const email = raw.trim();
    if (email.includes("@")) return email;
  }
  return undefined;
}

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export async function sendStackShiftOrderCustomerConfirmation(
  data: OrderCustomerConfirmationData
): Promise<void> {
  if (data.to.length === 0) {
    console.warn("[stackshift-order] no customer confirmation recipient — skipping email");
    return;
  }

  const greeting = data.contactName ? `Hi ${data.contactName},` : "Hi,";
  const servicesLine = data.services.join(", ") || "—";
  const specLine = data.flowforgeSpecFilename ?? "not included";
  const replyTo = resolveReplyTo();

  const subject = `We've received your StackShift order — ${data.companyName}`;

  const text = [
    greeting,
    ``,
    `Thanks for your StackShift order. We've received it and it's now with our team.`,
    ``,
    `What you ordered`,
    `- Company: ${data.companyName}`,
    `- Services: ${servicesLine}`,
    `- Proposal: ${data.proposalFilename ?? "—"}`,
    `- FlowForge spec: ${specLine}`,
    ``,
    `What happens next`,
    `A WebriQ project manager will review your order and reach out within 1–2 business`,
    `days to confirm scope and get started.${replyTo ? " If you have any questions in the meantime, just reply to this email." : ""}`,
    ``,
    `— The WebriQ team`,
  ].join("\n");

  const rows: [string, string][] = [
    ["Company", data.companyName],
    ["Services", servicesLine],
    ["Proposal", data.proposalFilename ?? "—"],
    ["FlowForge spec", specLine],
  ];

  const html = [
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f1f5f9;padding:32px 16px;font-family:Arial,Helvetica,sans-serif;">`,
    `<tr><td align="center">`,
    `<table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;background:#ffffff;border-radius:12px;overflow:hidden;border:1px solid #e2e8f0;">`,
    `<tr><td style="padding:24px 28px 8px;">`,
    `<p style="margin:0;font-size:16px;font-weight:700;color:#0f172a;">We've received your StackShift order</p>`,
    `<p style="margin:8px 0 0;font-size:13px;color:#334155;">${esc(greeting)}</p>`,
    `<p style="margin:8px 0 0;font-size:13px;color:#334155;">Thanks for your StackShift order — it's now with our team.</p>`,
    `</td></tr>`,
    `<tr><td style="padding:12px 28px 8px;">`,
    `<p style="margin:0 0 6px;font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:0.04em;color:#64748b;">What you ordered</p>`,
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="font-size:13px;color:#0f172a;">`,
    ...rows.map(
      ([k, v]) =>
        `<tr><td style="padding:6px 8px 6px 0;color:#64748b;white-space:nowrap;vertical-align:top;">${esc(k)}</td><td style="padding:6px 0;">${esc(v)}</td></tr>`
    ),
    `</table>`,
    `</td></tr>`,
    `<tr><td style="padding:12px 28px 28px;">`,
    `<p style="margin:0 0 6px;font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:0.04em;color:#64748b;">What happens next</p>`,
    `<p style="margin:0;font-size:13px;color:#334155;line-height:1.6;">A WebriQ project manager will review your order and reach out within 1–2 business days to confirm scope and get started.${replyTo ? " If you have any questions in the meantime, just reply to this email." : ""}</p>`,
    `<p style="margin:16px 0 0;font-size:13px;color:#334155;">— The WebriQ team</p>`,
    `</td></tr>`,
    `</table>`,
    `</td></tr>`,
    `</table>`,
  ].join("");

  await transporter.sendMail({
    from: FROM,
    to: data.to.join(", "),
    subject,
    text,
    html,
    ...(replyTo ? { replyTo } : {}),
  });
}
