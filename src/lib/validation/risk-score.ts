import type { RiskLevel } from "./types";
import type { EmailSignals } from "./email";
import type { PhoneSignals } from "./phone";

// Task 353 — composite risk scoring. Score starts at 100 and signals subtract.
// Weights adapt plan §5 to the Abstract Email Reputation / Phone Intelligence field set
// (one call per contact returns the full picture — there is no base/escalation split).
// Tune against real fraud/chargeback data over time.
//
//   >= 70  -> low     (allow, no friction)
//   40-69  -> medium  (allow, add soft friction — email confirm / OTP)
//   < 40   -> high    (block / route to manual review)
//
// Hard blocks (invalid format, undeliverable, disposable email, invalid phone) are decided
// in decision.ts BEFORE scoring and never reach these functions.

export interface Scored {
  score: number;
  level: RiskLevel;
  reasonCode: string;
}

function bucket(score: number, reasons: string[]): Scored {
  const clamped = Math.max(0, Math.min(100, Math.round(score)));
  // `reasons[0]` is the dominant signal; surfaced even in the "low" band so the caller can
  // see *why* a score isn't a clean 100 (e.g. a VoIP line that's still allowed-no-friction).
  const top = reasons[0];
  if (clamped >= 70) return { score: clamped, level: "low", reasonCode: top ?? "ok" };
  if (clamped >= 40) return { score: clamped, level: "medium", reasonCode: top ?? "elevated_risk" };
  return { score: clamped, level: "high", reasonCode: top ?? "high_risk" };
}

export function scoreEmail(s: EmailSignals): Scored {
  let score = 100;
  const reasons: string[] = [];

  if (s.deliverability === "unknown") {
    // Abstract couldn't SMTP-confirm the mailbox (greylisting, unreachable server, ...).
    score -= 20;
    reasons.push("deliverability_unknown");
  }
  if (s.isCatchall) {
    score -= 15;
    reasons.push("catch_all_domain");
  }
  if (s.qualityScore !== null && s.qualityScore < 0.5) {
    score -= 20;
    reasons.push("low_quality_score");
  }
  if (s.domainAgeDays !== null && s.domainAgeDays < 30) {
    score -= 25;
    reasons.push("new_domain");
  }
  if (s.isRiskyTld) {
    score -= 15;
    reasons.push("risky_tld");
  }
  if (s.totalBreaches > 0) {
    score -= 10;
    reasons.push("breach_history");
  }
  if (s.addressRiskHigh || s.domainRiskHigh) {
    score -= 30;
    reasons.push("high_reputation_risk");
  }

  return bucket(score, reasons);
}

export function scorePhone(s: PhoneSignals, blockVoip: boolean): Scored {
  let score = 100;
  const reasons: string[] = [];

  if (s.isVoip) {
    // blockVoip pushes VoIP hard into the "high" band; otherwise it's a medium-risk signal.
    score -= blockVoip ? 65 : 20;
    reasons.push("voip_line");
  }
  if (s.lineType === "unknown" || s.lineType === "pager" || s.lineType === "personal") {
    score -= 15;
    reasons.push("unusual_line_type");
  }
  if (s.riskLevelHigh) {
    score -= 35;
    reasons.push("high_phone_risk");
  } else if (s.riskLevelMedium) {
    score -= 15;
    reasons.push("elevated_phone_risk");
  }
  if (s.isAbuseDetected) {
    score -= 30;
    reasons.push("abuse_flagged");
  }
  if (s.isDisposable) {
    score -= 25;
    reasons.push("disposable_number");
  }

  return bucket(score, reasons);
}
