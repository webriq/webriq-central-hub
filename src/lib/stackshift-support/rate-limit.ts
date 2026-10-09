import { adminClient } from "@/lib/supabase/admin";
import { RATE_LIMIT_PER_MINUTE, isOverLimit, retryAfterSeconds, windowStart } from "./rate-limit-logic";

export type RateLimitResult = { allowed: true } | { allowed: false; retryAfter: number };

// Task 444 — per-site, per-minute Postgres counter (contract §1 rule 6, default 120/min). The
// increment is one atomic RPC statement. Fails OPEN with a warning if the table/RPC isn't there
// yet (pre-migration 169) or the DB errors — rate limiting must never take the endpoint down.
export async function checkRateLimit(site: string, limit = RATE_LIMIT_PER_MINUTE): Promise<RateLimitResult> {
  const now = Date.now();
  try {
    const { data, error } = await adminClient.rpc("stackshift_rate_limit_hit", {
      p_site: site,
      p_window: windowStart(now).toISOString(),
    });
    if (error || typeof data !== "number") {
      console.warn("[stackshift-support] rate limit unavailable, failing open:", error?.message ?? "no count returned");
      return { allowed: true };
    }
    return isOverLimit(data, limit) ? { allowed: false, retryAfter: retryAfterSeconds(now) } : { allowed: true };
  } catch (err) {
    console.warn("[stackshift-support] rate limit threw, failing open:", err);
    return { allowed: true };
  }
}
