import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { guard, jsonError, parseBody } from "@/lib/hr/api";
import { holidaySchema } from "@/lib/hr/schemas";

type Ctx = { params: Promise<{ holidayId: string }> };

export async function PATCH(req: Request, { params }: Ctx) {
  const g = await guard("manager");
  if ("res" in g) return g.res;
  const body = await parseBody(req, holidaySchema);
  if ("res" in body) return body.res;
  const { holidayId } = await params;

  const supabase = await createClient();
  const { data, error } = await supabase
    
    .from("hr_holidays")
    .update({ ...body.data, note: body.data.note ?? null })
    .eq("id", holidayId)
    .select("id, name, holiday_date, kind, note")
    .maybeSingle();
  if (error?.code === "23505") return jsonError("A holiday with that name already exists on that date.", 409);
  if (error) return jsonError("Couldn't update the holiday. Try again.", 500);
  if (!data) return jsonError("That holiday no longer exists.", 404);
  return NextResponse.json({ holiday: data });
}

export async function DELETE(_req: Request, { params }: Ctx) {
  const g = await guard("manager");
  if ("res" in g) return g.res;
  const { holidayId } = await params;
  const supabase = await createClient();
  const { error } = await supabase.from("hr_holidays").delete().eq("id", holidayId);
  if (error) return jsonError("Couldn't delete the holiday. Try again.", 500);
  return NextResponse.json({ ok: true });
}
