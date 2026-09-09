import { getCachedVerdict, setCachedVerdict } from "./cache";
import { logValidationDecision, alertValidationDegraded } from "./logger";
import { normalizeEmail, normalizePhone, hashValue } from "./normalize";
import { scoreEmail, scorePhone } from "./risk-score";
import { ValidationUnavailableError } from "./types";
import type { AbstractCallTally, DecisionContext, FieldVerdict } from "./types";
import { getEmailReputation, hasEmailReputation } from "./email";
import { getPhoneIntelligence, hasPhoneIntelligence } from "./phone";

// Task 353 — orchestrates: cache -> one Abstract call -> hard-block check -> composite
// score -> cache write -> decision log. Any ValidationUnavailableError fails OPEN:
// { allowed: true, riskLevel: "unknown", reasonCode: "validation_unavailable" }.
//
// Abstract's Email Reputation / Phone Intelligence products each return the full picture
// in a single request, so there is no "escalation" second call.

const UNAVAILABLE: FieldVerdict = {
  allowed: true,
  riskLevel: "unknown",
  reasonCode: "validation_unavailable",
};

const blockVoip = () => process.env.CONTACT_VALIDATION_BLOCK_VOIP === "true";

export async function decideEmail(rawEmail: string, ctx: DecisionContext): Promise<FieldVerdict> {
  const normalized = normalizeEmail(rawEmail);
  const valueHash = hashValue(normalized);

  const cached = await getCachedVerdict("email", valueHash);
  if (cached) {
    await logValidationDecision({
      kind: "email",
      valueHash,
      verdict: cached,
      riskScore: null,
      degraded: false,
      cacheHit: true,
      abstractCalls: {},
      source: ctx.source,
    });
    return cached;
  }

  const abstractCalls: AbstractCallTally = {};

  try {
    if (!hasEmailReputation()) {
      throw new ValidationUnavailableError("email reputation not configured");
    }

    const s = await getEmailReputation(normalized);
    abstractCalls.email_reputation = 1;

    let verdict: FieldVerdict | null = null;
    if (!s.isFormatValid) verdict = block("invalid_email");
    else if (s.deliverability === "undeliverable") verdict = block("undeliverable");
    else if (s.isDisposable) verdict = block("disposable");

    let riskScore: number | null = null;
    if (!verdict) {
      const scored = scoreEmail(s);
      riskScore = scored.score;
      verdict = {
        allowed: scored.level !== "high",
        riskLevel: scored.level,
        reasonCode: scored.reasonCode,
      };
    }

    await finish("email", valueHash, normalized, verdict, riskScore, abstractCalls, ctx);
    return verdict;
  } catch (err) {
    if (err instanceof ValidationUnavailableError) {
      return failOpen("email", valueHash, err, abstractCalls, ctx);
    }
    throw err;
  }
}

export async function decidePhone(rawPhone: string, ctx: DecisionContext): Promise<FieldVerdict> {
  const normalized = normalizePhone(rawPhone);
  const valueHash = hashValue(normalized);

  const cached = await getCachedVerdict("phone", valueHash);
  if (cached) {
    await logValidationDecision({
      kind: "phone",
      valueHash,
      verdict: cached,
      riskScore: null,
      degraded: false,
      cacheHit: true,
      abstractCalls: {},
      source: ctx.source,
    });
    return cached;
  }

  const abstractCalls: AbstractCallTally = {};

  try {
    if (!hasPhoneIntelligence()) {
      throw new ValidationUnavailableError("phone intelligence not configured");
    }

    const s = await getPhoneIntelligence(normalized);
    abstractCalls.phone_intelligence = 1;

    let verdict: FieldVerdict | null = s.isValid ? null : block("invalid_phone");

    let riskScore: number | null = null;
    if (!verdict) {
      const scored = scorePhone(s, blockVoip());
      riskScore = scored.score;
      verdict = {
        allowed: scored.level !== "high",
        riskLevel: scored.level,
        reasonCode: scored.reasonCode,
      };
    }

    await finish("phone", valueHash, normalized, verdict, riskScore, abstractCalls, ctx);
    return verdict;
  } catch (err) {
    if (err instanceof ValidationUnavailableError) {
      return failOpen("phone", valueHash, err, abstractCalls, ctx);
    }
    throw err;
  }
}

function block(reasonCode: string): FieldVerdict {
  return { allowed: false, riskLevel: "high", reasonCode };
}

async function failOpen(
  kind: "email" | "phone",
  valueHash: string,
  err: ValidationUnavailableError,
  abstractCalls: AbstractCallTally,
  ctx: DecisionContext
): Promise<FieldVerdict> {
  await alertValidationDegraded(`${kind}: ${err.message}`);
  await logValidationDecision({
    kind,
    valueHash,
    verdict: UNAVAILABLE,
    riskScore: null,
    degraded: true,
    cacheHit: false,
    abstractCalls,
    source: ctx.source,
  });
  return UNAVAILABLE;
}

// Cache + log a decision that completed with a real Abstract result.
async function finish(
  kind: "email" | "phone",
  valueHash: string,
  normalized: string,
  verdict: FieldVerdict,
  riskScore: number | null,
  abstractCalls: AbstractCallTally,
  ctx: DecisionContext
): Promise<void> {
  await setCachedVerdict(kind, valueHash, normalized, verdict);
  await logValidationDecision({
    kind,
    valueHash,
    verdict,
    riskScore,
    degraded: false,
    cacheHit: false,
    abstractCalls,
    source: ctx.source,
  });
}
