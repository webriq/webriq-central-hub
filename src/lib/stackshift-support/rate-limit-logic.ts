// Task 444 — pure window maths for the per-site, per-minute rate limit.
export const RATE_LIMIT_PER_MINUTE = 120;
const WINDOW_MS = 60_000;

export function windowStart(nowMs: number): Date {
  return new Date(Math.floor(nowMs / WINDOW_MS) * WINDOW_MS);
}

// Seconds until the current minute window rolls over (1–60), for the Retry-After header.
export function retryAfterSeconds(nowMs: number): number {
  return Math.ceil((WINDOW_MS - (nowMs % WINDOW_MS)) / 1000);
}

export function isOverLimit(count: number, limit: number): boolean {
  return count > limit;
}
