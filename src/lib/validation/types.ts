// Task 353 — shared types for the contact-validation service.

export type RiskLevel = "low" | "medium" | "high" | "unknown";

/**
 * The ONLY shape returned to callers. Never leak raw Abstract fields or a specific
 * mailbox-level failure reason — `reasonCode` is a coarse enum, safe to log but not
 * safe to show to an end user verbatim.
 */
export interface FieldVerdict {
  allowed: boolean;
  riskLevel: RiskLevel;
  reasonCode: string;
  /** true when served from `validation_cache` without a fresh Abstract call */
  cached?: boolean;
}

/** Per-product Abstract call tally written to `validation_logs.abstract_calls`. */
export type AbstractCallTally = Partial<
  Record<"email_reputation" | "phone_intelligence", number>
>;

export interface DecisionContext {
  source: string | null;
}

// Thrown whenever Abstract is unreachable, times out, rate-limits, or is not configured.
// The decision layer catches it and fails OPEN (allowed: true, riskLevel: "unknown").
export class ValidationUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ValidationUnavailableError";
  }
}
