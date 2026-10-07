import { NextResponse } from "next/server";
import { guard, jsonError } from "@/lib/hr/api";
import { diffDays, isYmd } from "@/lib/hr/dates";
import { loadCalendarLeaves } from "@/lib/hr/queries-requests";
import { loadHolidays } from "@/lib/hr/queries";

// Managers + PMs. Approved leaves only; the payload carries no reason, decision note, or admin notes.
export async function GET(req: Request) {
  const g = await guard("calendar");
  if ("res" in g) return g.res;
  const sp = new URL(req.url).searchParams;
  const from = sp.get("from") ?? "";
  const to = sp.get("to") ?? "";
  if (!isYmd(from) || !isYmd(to) || to < from) return jsonError("Pass a valid from and to date.", 400);
  if (diffDays(from, to) > 100) return jsonError("Pick a range of 100 days or fewer.", 400);

  const [leaves, holidays] = await Promise.all([loadCalendarLeaves(from, to), loadHolidays(from, to)]);
  return NextResponse.json({ leaves, holidays });
}
