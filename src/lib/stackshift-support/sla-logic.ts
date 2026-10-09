// Task 444 — pure SLA helpers. Keys match inbox.priority (low|normal|high|critical).
export const DEFAULT_SLA_HOURS: Record<string, number> = { critical: 4, high: 8, normal: 24, low: 72 };

export function resolveHours(priority: string | null | undefined, config: Record<string, number> | null): number {
  const key = priority && priority in DEFAULT_SLA_HOURS ? priority : "normal";
  const configured = config?.[key];
  return typeof configured === "number" && Number.isFinite(configured) && configured > 0
    ? configured
    : DEFAULT_SLA_HOURS[key];
}

export function addHours(from: Date, hours: number): Date {
  return new Date(from.getTime() + hours * 3_600_000);
}
