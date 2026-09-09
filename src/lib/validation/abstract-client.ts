import { ValidationUnavailableError } from "./types";

// Task 353 — thin fetch wrapper for Abstract's REST products. Every non-2xx / timeout /
// network error becomes a ValidationUnavailableError so the decision layer can fail open.
//
// NOTE: endpoint hostnames and response field names must be confirmed against
// docs.abstractapi.com before production — Abstract varies the response shape by plan tier,
// and "Phone Intelligence" may not be a distinct product (see task doc §Feasibility).

const TIMEOUT_MS = 4000;

export async function fetchAbstract(url: URL): Promise<unknown> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  let res: Response;
  try {
    res = await fetch(url.toString(), { signal: controller.signal });
  } catch (err) {
    const reason = err instanceof Error && err.name === "AbortError" ? "timeout" : "network error";
    throw new ValidationUnavailableError(`Abstract request failed: ${reason}`);
  } finally {
    clearTimeout(timer);
  }

  // Abstract's documented quota/rate signals: 422 = free-plan credits exhausted,
  // 429 = >1 req/sec on free, 402 = paid-plan quota.
  if (res.status === 422 || res.status === 429 || res.status === 402) {
    throw new ValidationUnavailableError(`Abstract quota/rate limit (${res.status})`);
  }
  if (!res.ok) {
    throw new ValidationUnavailableError(`Abstract responded ${res.status}`);
  }

  try {
    return await res.json();
  } catch {
    throw new ValidationUnavailableError("Abstract returned a non-JSON body");
  }
}

/** Abstract booleans arrive as `true`, `{ value: true }`, or `"TRUE"` depending on product. */
export function abstractBool(raw: unknown): boolean {
  if (raw === true) return true;
  if (typeof raw === "string") return raw.toUpperCase() === "TRUE";
  if (raw && typeof raw === "object" && "value" in raw) {
    return abstractBool((raw as { value: unknown }).value);
  }
  return false;
}

/** `quality_score` / risk scores arrive as strings ("0.95") or numbers. */
export function abstractNumber(raw: unknown): number | null {
  if (typeof raw === "number" && Number.isFinite(raw)) return raw;
  if (typeof raw === "string" && raw.trim() !== "") {
    const n = Number(raw);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

export function abstractString(raw: unknown): string | null {
  if (typeof raw === "string" && raw.trim() !== "") return raw.trim();
  if (raw && typeof raw === "object" && "value" in raw) {
    return abstractString((raw as { value: unknown }).value);
  }
  return null;
}

/** Narrow an unknown nested field to a plain object (Abstract responses are deeply nested). */
export function abstractObj(raw: unknown): Record<string, unknown> {
  return raw && typeof raw === "object" && !Array.isArray(raw)
    ? (raw as Record<string, unknown>)
    : {};
}
