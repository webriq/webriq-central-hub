// Optional seed (Zoho People's 2026 Philippine holiday list). Offered as an admin action on the
// Holidays page — never applied automatically.
import type { HolidayKind } from "./types";

export const PH_HOLIDAYS_2026: { name: string; holiday_date: string; kind: HolidayKind }[] = [
  { name: "New Year's Day", holiday_date: "2026-01-01", kind: "regular" },
  { name: "Good Friday", holiday_date: "2026-04-03", kind: "regular" },
  { name: "Labor Day", holiday_date: "2026-05-01", kind: "regular" },
  { name: "Independence Day", holiday_date: "2026-06-12", kind: "regular" },
  { name: "National Heroes Day", holiday_date: "2026-08-31", kind: "regular" },
  { name: "Bonifacio Day", holiday_date: "2026-11-30", kind: "regular" },
  { name: "Christmas Day", holiday_date: "2026-12-25", kind: "regular" },
  { name: "New Year's Eve", holiday_date: "2026-12-31", kind: "special" },
];
