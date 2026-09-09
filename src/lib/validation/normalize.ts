import { createHash } from "crypto";

// Task 353 — normalization + hashing for cache keys. Kept deliberately light: the server
// does not carry `libphonenumber-js` (that's webriq.com's client-side concern). The phone
// value is assumed to already be an international-format string from the caller.

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function normalizePhone(phone: string): string {
  // Strip everything except digits and a single leading '+'.
  const trimmed = phone.trim();
  const hasPlus = trimmed.startsWith("+");
  const digits = trimmed.replace(/\D/g, "");
  return hasPlus ? `+${digits}` : digits;
}

/** SHA-256 hex of the normalized value — used as the cache/log key so raw PII isn't the key. */
export function hashValue(normalized: string): string {
  return createHash("sha256").update(normalized).digest("hex");
}
