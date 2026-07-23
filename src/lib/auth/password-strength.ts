export type Strength = 0 | 1 | 2 | 3;

export function getPasswordStrength(pwd: string): Strength | null {
  if (!pwd) return null;
  let score = 0;
  if (pwd.length >= 8) score++;
  if (/[A-Z]/.test(pwd) && /[a-z]/.test(pwd)) score++;
  if (/\d/.test(pwd)) score++;
  if (/[^A-Za-z0-9]/.test(pwd)) score++;
  if (score <= 1) return 0;
  if (score === 2) return 1;
  if (score === 3) return 2;
  return 3;
}

export const STRENGTH_META: Record<Strength, { label: string; filled: number; bar: string; text: string }> = {
  0: { label: "Too weak", filled: 1, bar: "bg-auth-late/60", text: "text-muted-foreground" },
  1: { label: "Okay",     filled: 2, bar: "bg-auth-warn",    text: "text-auth-warn" },
  2: { label: "Good",     filled: 3, bar: "bg-auth-blue",    text: "text-auth-blue" },
  3: { label: "Strong",   filled: 4, bar: "bg-auth-ok",      text: "text-auth-ok" },
};
