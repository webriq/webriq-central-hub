import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { guard, jsonError } from "@/lib/hr/api";
import { PH_HOLIDAYS_2026 } from "@/lib/hr/holiday-seed";

// Idempotent: rows that already exist (same date + name) are skipped.
export async function POST() {
  const g = await guard("manager");
  if ("res" in g) return g.res;
  const supabase = await createClient();
  const { data, error } = await supabase
    
    .from("hr_holidays")
    .upsert(PH_HOLIDAYS_2026.map((h) => ({ ...h, created_by: g.viewer.profileId })), {
      onConflict: "holiday_date,name",
      ignoreDuplicates: true,
    })
    .select("id");
  if (error) return jsonError("Couldn't import the holidays. Try again.", 500);
  return NextResponse.json({ added: data?.length ?? 0, total: PH_HOLIDAYS_2026.length });
}
