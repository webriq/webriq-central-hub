import { fetchAbstract, abstractBool, abstractNumber, abstractString, abstractObj } from "./abstract-client";
import { ValidationUnavailableError } from "./types";

// Task 353 — Abstract Email Reputation API wrapper.
// https://emailreputation.abstractapi.com/v1/?api_key=&email=
//
// This ONE product is a superset — a single call returns deliverability + quality +
// domain + risk + breaches. There is no separate "Email Validation" call anymore (the
// legacy emailvalidation.abstractapi.com product was folded into this one). Key is
// server-only; never NEXT_PUBLIC_*.
//
// NOTE: `email_quality`, `email_risk`, and `email_breaches` may be limited or absent on
// Abstract's free tier (Professional adds full quality/risk/breach data) — the parse and
// the scorer both treat every missing field as the safe/absent value, so a thinner free
// response simply yields a less granular score, never an error.

export interface EmailSignals {
  isFormatValid: boolean;
  isSmtpValid: boolean;
  isMxValid: boolean;
  deliverability: "deliverable" | "undeliverable" | "unknown";
  deliverabilityDetail: string | null;
  qualityScore: number | null;
  isDisposable: boolean;
  isCatchall: boolean;
  isRole: boolean;
  domainAgeDays: number | null;
  isRiskyTld: boolean;
  addressRiskHigh: boolean;
  domainRiskHigh: boolean;
  totalBreaches: number;
}

export function hasEmailReputation(): boolean {
  return !!process.env.ABSTRACT_EMAIL_REPUTATION_KEY;
}

export async function getEmailReputation(email: string): Promise<EmailSignals> {
  const key = process.env.ABSTRACT_EMAIL_REPUTATION_KEY;
  if (!key) throw new ValidationUnavailableError("ABSTRACT_EMAIL_REPUTATION_KEY not configured");

  const url = new URL("https://emailreputation.abstractapi.com/v1/");
  url.searchParams.set("api_key", key);
  url.searchParams.set("email", email);

  const raw = (await fetchAbstract(url)) as Record<string, unknown>;

  const deliv = abstractObj(raw.email_deliverability);
  const quality = abstractObj(raw.email_quality);
  const domain = abstractObj(raw.email_domain);
  const risk = abstractObj(raw.email_risk);
  const breaches = abstractObj(raw.email_breaches);

  const statusRaw = abstractString(deliv.status)?.toLowerCase() ?? null;
  const deliverability: EmailSignals["deliverability"] =
    statusRaw === "deliverable"
      ? "deliverable"
      : statusRaw === "undeliverable"
        ? "undeliverable"
        : "unknown";

  return {
    isFormatValid: abstractBool(deliv.is_format_valid),
    isSmtpValid: abstractBool(deliv.is_smtp_valid),
    isMxValid: abstractBool(deliv.is_mx_valid),
    deliverability,
    deliverabilityDetail: abstractString(deliv.status_detail),
    qualityScore: abstractNumber(quality.score),
    isDisposable: abstractBool(quality.is_disposable),
    isCatchall: abstractBool(quality.is_catchall),
    isRole: abstractBool(quality.is_role),
    domainAgeDays: abstractNumber(domain.domain_age),
    isRiskyTld: abstractBool(domain.is_risky_tld),
    addressRiskHigh: abstractString(risk.address_risk_status)?.toLowerCase() === "high",
    domainRiskHigh: abstractString(risk.domain_risk_status)?.toLowerCase() === "high",
    totalBreaches: abstractNumber(breaches.total_breaches) ?? 0,
  };
}
