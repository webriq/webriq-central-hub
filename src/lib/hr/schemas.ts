import { z } from "zod";
import { isYmd } from "./dates";

const ymd = z.string().refine(isYmd, "Use a valid date (YYYY-MM-DD)");

export const holidaySchema = z.object({
  name: z.string().trim().min(1, "Name the holiday").max(120),
  holiday_date: ymd,
  kind: z.enum(["regular", "special", "company"]).default("regular"),
  note: z.string().trim().max(500).nullable().optional(),
});

export const allotmentSchema = z
  .object({
    leave_type_id: z.string().uuid(),
    period_start: ymd,
    period_end: ymd,
    days_allotted: z.number().min(0, "Days can't be negative").max(366).nullable(),
  })
  .refine((v) => v.period_end >= v.period_start, { path: ["period_end"], message: "End date must be on or after the start date" });

export const requestSchema = z
  .object({
    leaveTypeId: z.string().uuid(),
    startDate: ymd,
    endDate: ymd,
    halfDay: z.boolean().default(false),
    reason: z.string().trim().max(1000).nullable().optional(),
    teamEmails: z.array(z.string().trim().toLowerCase().email("Enter valid email addresses")).max(10, "Add up to 10 teammates").default([]),
  })
  .refine((v) => v.endDate >= v.startDate, { path: ["endDate"], message: "End date must be on or after the start date" })
  .refine((v) => !v.halfDay || v.startDate === v.endDate, { path: ["halfDay"], message: "A half day applies to a single date" });

export const decisionSchema = z.object({
  action: z.enum(["approve", "deny", "cancel"]),
  decisionNote: z.string().trim().max(1000).nullable().optional(),
});

export const noteSchema = z.object({ body: z.string().trim().min(1, "Write a note first").max(2000) });

export const managerSchema = z.object({ managerId: z.string().uuid().nullable() });

export const adjustmentSchema = z.object({
  employeeId: z.string().uuid(),
  periodId: z.string().uuid(),
  daysUsedBefore: z.number().min(0).max(366),
  note: z.string().trim().max(500).nullable().optional(),
});
