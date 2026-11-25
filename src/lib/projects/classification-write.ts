import { legacyClassificationValues, type Classification } from "@/config/customer-phases";

// Task 504 — "Discrete Development" was renamed to "FlowForge". Until migration 192 swaps the
// customer_products.classification CHECK, writing the new value there fails with 23514. This runs
// a write once with the current value and, only on that specific violation, re-runs it with the
// legacy stored value. The `classifications` array column has no CHECK, so callers keep writing
// the new value there either way; reads normalize via normalizeClassification().

type PgErrorLike = { code?: string; message?: string } | null;

export function isClassificationCheckViolation(error: PgErrorLike): boolean {
  return error?.code === "23514" && /classification_check/.test(error.message ?? "");
}

export async function withClassificationFallback<R extends { error: PgErrorLike }>(
  scalar: Classification,
  run: (scalar: string) => PromiseLike<R>
): Promise<R> {
  const result = await run(scalar);
  if (!isClassificationCheckViolation(result.error)) return result;
  const [legacy] = legacyClassificationValues(scalar);
  return legacy ? run(legacy) : result;
}
