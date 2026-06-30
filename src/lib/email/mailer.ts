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
      `Sign in at: ${process.env.NEXT_PUBLIC_APP_URL ?? "https://hub.webriq.com"}/v2/auth/login`,
      `You will be prompted to set a new password after your first login.`,
    ].join("\n"),
  });
}

export async function sendHubInviteEmail(to: string, firstName: string, inviteUrl: string) {
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
      `This link expires in 24 hours.`,
      `If you did not expect this invitation, you can safely ignore this email.`,
    ].join("\n"),
    html: [
      `<p>Hi ${firstName},</p>`,
      `<p>You've been invited to join <strong>WebriQ Central Hub</strong>.</p>`,
      `<p><a href="${inviteUrl}" style="display:inline-block;padding:10px 20px;background:#1e293b;color:#fff;border-radius:6px;text-decoration:none;font-weight:600;">Accept Invitation</a></p>`,
      `<p style="color:#94a3b8;font-size:12px;">This link expires in 24 hours. If you did not expect this invitation, you can safely ignore this email.</p>`,
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
