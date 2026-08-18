import { Utensils, Coffee, Clock } from "lucide-react";
import type { LucideIcon } from "lucide-react";

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

export const BREAK_ICONS: Record<BreakType, LucideIcon> = {
  meal: Utensils,
  coffee: Coffee,
  few_minutes: Clock,
};
