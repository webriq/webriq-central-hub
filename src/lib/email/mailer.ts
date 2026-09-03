import nodemailer from "nodemailer";

const transporter = nodemailer.createTransport({
  host: process.env.MAIL_HOST,
  port: Number(process.env.MAIL_PORT ?? 587),
  secure: false,
  auth: {
    user: process.env.MAIL_USER,
    pass: process.env.MAIL_PASS,
  },
});

const FROM = process.env.MAIL_FROM ? `WebriQ Central Hub <${process.env.MAIL_FROM}>` : "WebriQ Central Hub <noreply@webriq.com>";

// Shared with other transactional-email modules (e.g. stackshift-order-notification.ts, task
// 347) so the nodemailer transport + From header are configured in exactly one place.
export { transporter, FROM };

export async function sendInvitationEmail(to: string, fullName: string, tempPassword: string) {
  await transporter.sendMail({
    from: FROM,
    to,
    subject: "You've been invited to WebriQ Central Hub",
    text: [
      `Hi ${fullName},`,
      ``,
      `You've been invited to join WebriQ Central Hub.`,
      ``,
      `Email: ${to}`,
      `Temporary Password: ${tempPassword}`,
      ``,
      `Sign in at: ${process.env.NEXT_PUBLIC_APP_URL ?? "https://hub.webriq.com"}/auth/login`,
      `You will be prompted to set a new password after your first login.`,
    ].join("\n"),
  });
}

export async function sendHubInviteEmail(to: string, firstName: string, inviteUrl: string) {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://hub.webriq.com";
  const companyLogoUrl = `${appUrl}/company_logo.webp`;
  const appLogoUrl = `${appUrl}/logo.png`;

  await transporter.sendMail({
    from: FROM,
    to,
    subject: "You've been invited to WebriQ Central Hub",
    text: [
      `Hi ${firstName},`,
      ``,
      `You've been invited to join WebriQ Central Hub.`,
      ``,
      `Click the link below to set your password and get started:`,
      `${inviteUrl}`,
      ``,
      `This link expires in 10 minutes.`,
      `If you did not expect this invitation, you can safely ignore this email.`,
    ].join("\n"),
    html: [
      `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f1f5f9;padding:40px 16px;font-family:Arial,Helvetica,sans-serif;">`,
      `<tr><td align="center">`,
      `<table role="presentation" width="480" cellpadding="0" cellspacing="0" style="max-width:480px;width:100%;background:#ffffff;border-radius:12px;overflow:hidden;border:1px solid #e2e8f0;">`,
      `<tr><td style="padding:32px 32px 24px;text-align:center;">`,
      `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 auto;"><tr>`,
      `<td style="padding-right:8px;vertical-align:middle;"><img src="${companyLogoUrl}" width="36" alt="WebriQ" style="display:block;width:36px;height:36px;"></td>`,
      `<td style="padding-right:10px;vertical-align:middle;"><img src="${appLogoUrl}" width="36" alt="" style="display:block;width:48px;height:48px;"></td>`,
      `<td style="vertical-align:middle;"><span style="font-size:18px;font-weight:700;color:#1e293b;font-family:Arial,Helvetica,sans-serif;">WebriQ Central Hub</span></td>`,
      `</tr></table>`,
      `</td></tr>`,
      `<tr><td style="padding:0 32px 32px;">`,
      `<p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:#1e293b;">Hi ${firstName},</p>`,
      `<p style="margin:0 0 24px;font-size:15px;line-height:1.6;color:#1e293b;">You've been invited to join <strong>WebriQ Central Hub</strong>. Click below to set your password and get started.</p>`,
      `<table role="presentation" cellpadding="0" cellspacing="0"><tr><td style="border-radius:8px;background:#F97316;">`,
      `<a href="${inviteUrl}" style="display:inline-block;padding:12px 28px;color:#fff;border-radius:8px;text-decoration:none;font-weight:600;font-size:15px;">Accept Invitation</a>`,
      `</td></tr></table>`,
      `<p style="margin:24px 0 0;font-size:12px;line-height:1.6;color:#94a3b8;">This link expires in 10 minutes. If you did not expect this invitation, you can safely ignore this email.</p>`,
      `</td></tr>`,
      `</table>`,
      `</td></tr>`,
      `</table>`,
    ].join(""),
  });
}

export async function sendOtpEmail(to: string, code: string) {
  await transporter.sendMail({
    from: FROM,
    to,
    subject: `${code} — Your WebriQ Hub verification code`,
    text: [
      `Your verification code is: ${code}`,
      ``,
      `This code expires in 10 minutes.`,
      `If you did not request this, contact your administrator.`,
    ].join("\n"),
  });
}

export async function sendPasswordResetOtpEmail(to: string, code: string) {
  await transporter.sendMail({
    from: FROM,
    to,
    subject: `${code} — Reset your WebriQ Hub password`,
    text: [
      `Your password reset code is: ${code}`,
      ``,
      `This code expires in 10 minutes.`,
      `If you did not request a password reset, you can safely ignore this email.`,
    ].join("\n"),
  });
}

export async function sendAccountLockedEmail(to: string) {
  await transporter.sendMail({
    from: FROM,
    to,
    subject: "Your WebriQ Central Hub account has been temporarily locked",
    text: [
      `We detected too many failed verification attempts on your account.`,
      ``,
      `As a security precaution, your account has been temporarily locked for 1 hour.`,
      ``,
      `If this wasn't you, contact your administrator immediately. Otherwise, you can try again after the lock period ends.`,
    ].join("\n"),
  });
}
