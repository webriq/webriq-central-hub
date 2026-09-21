// Task 379 — password-gate for the public "view my ticket" page. Mirrors the hashing +
// lockout shape of src/lib/auth/otp-lockout.ts, but state lives on the `tickets` row itself
// (one ticket = one password = one lockout window) instead of a shared otp_codes-style table.
import { randomBytes, createHash } from "node:crypto";
import { adminClient } from "@/lib/supabase/admin";
import { sendTicketCreatedEmail } from "@/lib/email/ticket-created-notification";
import { resolveContactName, type ContactRow } from "@/app/(hub)/desk/inbox/_resolve";

export const MAX_VIEW_ATTEMPTS = 5;
export const VIEW_LOCK_DURATION_MS = 15 * 60 * 1000; // 15 minutes

// Visually-unambiguous alphabet — hand-typed from an email, so no 0/O or 1/I/l.
const PASSWORD_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
const PASSWORD_LENGTH = 8;

export function generateCustomerViewPassword(): string {
  const bytes = randomBytes(PASSWORD_LENGTH);
  let out = "";
  for (let i = 0; i < PASSWORD_LENGTH; i++) {
    out += PASSWORD_ALPHABET[bytes[i] % PASSWORD_ALPHABET.length];
  }
  return out;
}

export function hashCustomerViewPassword(password: string): string {
  return createHash("sha256").update(password.trim().toUpperCase()).digest("hex");
}

type VerifyResult =
  | { ok: true }
  | { ok: false; locked: boolean; lockedUntil: string | null; attemptsRemaining: number | null };

export async function verifyCustomerViewPassword(
  ticketId: string,
  password: string
): Promise<VerifyResult> {
  const { data: ticket } = await adminClient
    .from("tickets")
    .select("customer_view_password_hash, customer_view_failed_attempts, customer_view_locked_until")
    .eq("id", ticketId)
    .maybeSingle();

  if (!ticket || !ticket.customer_view_password_hash) {
    // No password set — either a pre-task-379 ticket or the create-time email/hash step
    // failed. Treat identically to a wrong password: never reveal ticket existence/state.
    return { ok: false, locked: false, lockedUntil: null, attemptsRemaining: null };
  }

  if (ticket.customer_view_locked_until) {
    if (new Date(ticket.customer_view_locked_until) > new Date()) {
      return {
        ok: false,
        locked: true,
        lockedUntil: ticket.customer_view_locked_until,
        attemptsRemaining: 0,
      };
    }
    // Lazy expiry — clear it before checking the password so a correct guess right after
    // the lock window ends succeeds instead of being rejected on a stale lock.
    await adminClient
      .from("tickets")
      .update({ customer_view_failed_attempts: 0, customer_view_locked_until: null })
      .eq("id", ticketId);
    ticket.customer_view_failed_attempts = 0;
  }

  const candidateHash = hashCustomerViewPassword(password);
  if (candidateHash !== ticket.customer_view_password_hash) {
    const nextCount = (ticket.customer_view_failed_attempts ?? 0) + 1;

    if (nextCount >= MAX_VIEW_ATTEMPTS) {
      const lockedUntil = new Date(Date.now() + VIEW_LOCK_DURATION_MS).toISOString();
      await adminClient
        .from("tickets")
        .update({ customer_view_failed_attempts: nextCount, customer_view_locked_until: lockedUntil })
        .eq("id", ticketId);
      return { ok: false, locked: true, lockedUntil, attemptsRemaining: 0 };
    }

    await adminClient
      .from("tickets")
      .update({ customer_view_failed_attempts: nextCount })
      .eq("id", ticketId);
    return {
      ok: false,
      locked: false,
      lockedUntil: null,
      attemptsRemaining: MAX_VIEW_ATTEMPTS - nextCount,
    };
  }

  if ((ticket.customer_view_failed_attempts ?? 0) > 0) {
    await adminClient
      .from("tickets")
      .update({ customer_view_failed_attempts: 0, customer_view_locked_until: null })
      .eq("id", ticketId);
  }
  return { ok: true };
}

// Orchestrates the "ticket created" confirmation: generate + hash + persist the view password,
// resolve the requester's display name, send the branded email, stamp customer_notified_at.
// Deliberately swallows every failure (logs and returns false) rather than throwing — called
// fire-and-forget right after the new-ticket insert in the email-poll cron, which must never
// fail because this did (the cron call site ignores the return value). The boolean return exists
// for task 380's manual resend route, which — unlike the cron — needs to tell staff whether the
// send actually worked.
export async function notifyCustomerTicketCreated(params: {
  ticketId: string;
  ticketNumber: number;
  subject: string;
  requesterEmail: string;
}): Promise<boolean> {
  try {
    const { data: contact } = await adminClient
      .from("contacts")
      .select("external_id, full_name, first_name, last_name, email")
      .ilike("email", params.requesterEmail)
      .limit(1)
      .maybeSingle<ContactRow>();

    const requesterName = resolveContactName(
      { requester_email: params.requesterEmail },
      contact ?? undefined
    );

    const password = generateCustomerViewPassword();
    const passwordHash = hashCustomerViewPassword(password);

    const { error: updateError } = await adminClient
      .from("tickets")
      .update({
        customer_view_password_hash: passwordHash,
        customer_view_password_set_at: new Date().toISOString(),
        // A new password invalidates any lockout under the old one — matters for task 380's
        // manual resend (a locked ticket must not stay locked once staff issues a fresh
        // password); harmless here on first creation, where these already default to 0/null.
        customer_view_failed_attempts: 0,
        customer_view_locked_until: null,
      })
      .eq("id", params.ticketId);
    if (updateError) {
      console.error("[notifyCustomerTicketCreated] failed to store view password:", updateError.message);
      return false;
    }

    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://hub.webriq.com";
    await sendTicketCreatedEmail({
      to: params.requesterEmail,
      requesterName,
      ticketNumber: params.ticketNumber,
      subject: params.subject,
      password,
      viewUrl: `${appUrl}/tickets/${params.ticketId}`,
    });

    await adminClient
      .from("tickets")
      .update({ customer_notified_at: new Date().toISOString() })
      .eq("id", params.ticketId);
    return true;
  } catch (e) {
    console.error("[notifyCustomerTicketCreated] failed:", e);
    return false;
  }
}
