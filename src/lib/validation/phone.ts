import { fetchAbstract, abstractBool, abstractNumber, abstractString, abstractObj } from "./abstract-client";
import { ValidationUnavailableError } from "./types";

// Task 353 — Abstract Phone Intelligence API wrapper.
// https://phoneintelligence.abstractapi.com/v1/?api_key=&phone=
//
// One product, one call — returns validation + carrier/line-type + location + risk +
// breaches together (the legacy phonevalidation.abstractapi.com product folded into this).
// Key is server-only.

export type PhoneLineType =
  | "mobile"
  | "landline"
  | "voip"
  | "toll_free"
  | "personal"
  | "pager"
  | "unknown";

const KNOWN_LINE_TYPES: readonly string[] = [
  "mobile",
  "landline",
  "voip",
  "toll_free",
  "personal",
  "pager",
  "unknown",
];

export interface PhoneSignals {
  isValid: boolean;
  lineType: PhoneLineType;
  isVoip: boolean;
  lineStatus: string | null;
  carrier: string | null;
  country: string | null;
  riskLevelHigh: boolean;
  riskLevelMedium: boolean;
  isDisposable: boolean;
  isAbuseDetected: boolean;
  totalBreaches: number;
}

export function hasPhoneIntelligence(): boolean {
  return !!process.env.ABSTRACT_PHONE_INTELLIGENCE_KEY;
}

export async function getPhoneIntelligence(phone: string): Promise<PhoneSignals> {
  const key = process.env.ABSTRACT_PHONE_INTELLIGENCE_KEY;
  if (!key) throw new ValidationUnavailableError("ABSTRACT_PHONE_INTELLIGENCE_KEY not configured");

  const url = new URL("https://phoneintelligence.abstractapi.com/v1/");
  url.searchParams.set("api_key", key);
  url.searchParams.set("phone", phone);

  const raw = (await fetchAbstract(url)) as Record<string, unknown>;

  const carrier = abstractObj(raw.phone_carrier);
  const validation = abstractObj(raw.phone_validation);
  const location = abstractObj(raw.phone_location);
  const risk = abstractObj(raw.phone_risk);
  const breaches = abstractObj(raw.phone_breaches);

  const lineTypeRaw = abstractString(carrier.line_type)?.toLowerCase() ?? "";
  const lineType: PhoneLineType = KNOWN_LINE_TYPES.includes(lineTypeRaw)
    ? (lineTypeRaw as PhoneLineType)
    : "unknown";

  const riskLevel = abstractString(risk.risk_level)?.toLowerCase() ?? null;

  return {
    isValid: abstractBool(validation.is_valid),
    lineType,
    isVoip: abstractBool(validation.is_voip) || lineType === "voip",
    lineStatus: abstractString(validation.line_status),
    carrier: abstractString(carrier.name),
    country: abstractString(location.country_name) ?? abstractString(location.country_code),
    riskLevelHigh: riskLevel === "high",
    riskLevelMedium: riskLevel === "medium",
    isDisposable: abstractBool(risk.is_disposable),
    isAbuseDetected: abstractBool(risk.is_abuse_detected),
    totalBreaches: abstractNumber(breaches.total_breaches) ?? 0,
  };
}
