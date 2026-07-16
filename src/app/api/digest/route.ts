import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { generateDigest } from "@/lib/ai/digest";

const BodySchema = z.object({
  type: z.enum(["pm", "dev"]).default("pm"),
});

export async function POST(req: Request) {
  // Accept cron calls via x-cron-secret header or authenticated user sessions
  const cronSecret = process.env.CRONJOB_SECRET_KEY;
  const incomingSecret = req.headers.get("x-cron-secret");
  const isCronCall = cronSecret && incomingSecret === cronSecret;

  if (!isCronCall) {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    body = {};
  }

  const parsed = BodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Validation failed", issues: parsed.error.issues }, { status: 400 });
  }

  const record = await generateDigest(parsed.data.type);
  if (!record) {
    return NextResponse.json({ error: "Digest generation failed — check server logs" }, { status: 500 });
  }

  return NextResponse.json(record);
}
