import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { guard, jsonError, parseBody } from "@/lib/hr/api";
import { holidaySchema } from "@/lib/hr/schemas";

export async function POST(req: Request) {
  const g = await guard("manager");
  if ("res" in g) return g.res;
  const body = await parseBody(req, holidaySchema);
  if ("res" in body) return body.res;

  const supabase = await createClient();
  const { data, error } = await supabase
    
    .from("hr_holidays")
    .insert({ ...body.data, note: body.data.note ?? null, created_by: g.viewer.profileId })
    .select("id, name, holiday_date, kind, note")
    .single();
  if (error?.code === "23505") return jsonError("A holiday with that name already exists on that date.", 409);
  if (error) return jsonError("Couldn't save the holiday. Try again.", 500);
  return NextResponse.json({ holiday: data }, { status: 201 });
}
