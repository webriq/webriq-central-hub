import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { assessTask } from "@/lib/ai/assess";

const BodySchema = z.object({
  classificationId: z.string().uuid(),
  customerId: z.string().min(1),
});

export async function POST(req: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = BodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Validation failed", issues: parsed.error.issues }, { status: 400 });
  }

  const { classificationId, customerId } = parsed.data;

  const record = await assessTask({ classificationId, customerId });
  if (!record) {
    return NextResponse.json({ error: "Assessment failed — check server logs" }, { status: 500 });
  }

  return NextResponse.json(record);
}
