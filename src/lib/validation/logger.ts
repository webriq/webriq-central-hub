import { adminClient } from "@/lib/supabase/admin";
import { sendCliqNotification } from "@/lib/zoho";
import type { AbstractCallTally, FieldVerdict } from "./types";

// Task 353 — one row per decision for audit + risk-weight tuning + the monthly quota check.
// Best-effort: a logging failure never affects the response.

interface LogInput {
  kind: "email" | "phone";
  valueHash: string;
  verdict: FieldVerdict;
  riskScore: number | null;
  degraded: boolean;
  cacheHit: boolean;
  abstractCalls: AbstractCallTally;
  source: string | null;
}

export async function logValidationDecision(input: LogInput): Promise<void> {
  try {
    await adminClient.from("validation_logs").insert({
      kind: input.kind,
      value_hash: input.valueHash,
      allowed: input.verdict.allowed,
      risk_level: input.verdict.riskLevel,
      risk_score: input.riskScore,
      reason_code: input.verdict.reasonCode,
      degraded: input.degraded,
      cache_hit: input.cacheHit,
      abstract_calls: input.abstractCalls as unknown as Record<string, unknown>,
      source: input.source,
    });
  } catch (err) {
    console.warn("[validation] log write skipped:", err instanceof Error ? err.message : err);
  }
}

// Degradation alert — deduped per process instance (serverless: per warm lambda) to avoid
// spamming the channel during an outage. Cliq is globally disabled today, so this is really
// a console signal + a hook for when Cliq/email alerting is turned on.
let lastAlertAt = 0;
const ALERT_COOLDOWN_MS = 10 * 60 * 1000;

export async function alertValidationDegraded(reason: string): Promise<void> {
  console.error(`[validation] DEGRADED — failing open. Reason: ${reason}`);
  const now = Date.now();
  if (now - lastAlertAt < ALERT_COOLDOWN_MS) return;
  lastAlertAt = now;
  try {
    await sendCliqNotification(
      `⚠️ Contact validation is degraded — failing open (allowing submissions). Reason: ${reason}`,
      "dev"
    );
  } catch {
    /* best-effort */
  }
}
