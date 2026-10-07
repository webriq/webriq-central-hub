/** 9 → "9 days", 1 → "1 day", 4.5 → "4.5 days", null → "Unlimited". */
export function formatDays(n: number | null, withUnit = true): string {
  if (n === null) return "Unlimited";
  const v = Number.isInteger(n) ? String(n) : n.toFixed(1).replace(/\.0$/, "");
  return withUnit ? `${v} ${n === 1 ? "day" : "days"}` : v;
}

export function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "??";
  return (parts.length > 1 ? parts[0][0] + parts[parts.length - 1][0] : parts[0].slice(0, 2)).toUpperCase();
}

/** Stable small hash so a person keeps the same avatar colour on every screen. */
export function hashIndex(key: string, mod: number): number {
  let h = 0;
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) >>> 0;
  return h % mod;
}
