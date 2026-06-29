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
