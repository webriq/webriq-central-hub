import { adminClient } from "@/lib/supabase/admin";
import type { FieldVerdict } from "./types";

// Task 353 — Postgres-backed cache (no Redis in this repo). Keyed by SHA-256 of the
// normalized value. 30-day TTL — deliverability / carrier data doesn't change fast.
// All DB access is wrapped so the endpoint keeps working (uncached) if migration 133
// hasn't been applied yet.

const TTL_MS = 30 * 24 * 60 * 60 * 1000;

type CacheKind = "email" | "phone";

export async function getCachedVerdict(
  kind: CacheKind,
  valueHash: string
): Promise<FieldVerdict | null> {
  try {
    const { data, error } = await adminClient
      .from("validation_cache")
      .select("result, expires_at")
      .eq("kind", kind)
      .eq("value_hash", valueHash)
      .maybeSingle();

    if (error || !data) return null;
    if (new Date(data.expires_at).getTime() <= Date.now()) return null;

    const result = data.result as unknown as FieldVerdict;
    return { ...result, cached: true };
  } catch (err) {
    console.warn("[validation] cache read skipped:", err instanceof Error ? err.message : err);
    return null;
  }
}

export async function setCachedVerdict(
  kind: CacheKind,
  valueHash: string,
  normalizedValue: string,
  verdict: FieldVerdict
): Promise<void> {
  // Don't cache "unavailable" verdicts — they're transient (quota/outage), not a real signal.
  if (verdict.reasonCode === "validation_unavailable") return;

  // Store the verdict without the request-scoped `cached` flag.
  const stored = {
    allowed: verdict.allowed,
    riskLevel: verdict.riskLevel,
    reasonCode: verdict.reasonCode,
  };

  try {
    await adminClient.from("validation_cache").upsert(
      {
        kind,
        value_hash: valueHash,
        normalized_value: normalizedValue,
        result: stored,
        expires_at: new Date(Date.now() + TTL_MS).toISOString(),
        updated_at: new Date().toISOString(),
      },
      { onConflict: "kind,value_hash" }
    );
  } catch (err) {
    console.warn("[validation] cache write skipped:", err instanceof Error ? err.message : err);
  }
}
