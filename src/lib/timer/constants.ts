export type BreakType = "meal" | "coffee" | "few_minutes";

// Task 209 — fixed server-side durations (never trust a client-supplied duration).
export const BREAK_DURATIONS_MIN: Record<BreakType, number> = {
  meal: 60,
  coffee: 15,
  few_minutes: 5,
};

export const BREAK_LABELS: Record<BreakType, string> = {
  meal: "Meal Break",
  coffee: "Coffee Break",
  few_minutes: "Few Minutes Break",
};
