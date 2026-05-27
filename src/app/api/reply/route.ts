import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { generateReplyDraft } from "@/lib/ai/reply";

const PostSchema = z.object({
  classificationId: z.string().min(1),
  customerId: z.string().min(1),
  executionRecordId: z.string().uuid(),
  whatWasDone: z.string().min(1),
});

export async function POST(req: NextRequest) {
  // Internal route — requires shared secret when REPLY_SECRET env var is set
  const secret = process.env.REPLY_SECRET;
  if (secret) {
    const provided = req.headers.get("x-reply-secret");
    if (provided !== secret) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  const body = await req.json().catch(() => null);
  const parsed = PostSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  try {
    await generateReplyDraft(parsed.data);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[reply] generateReplyDraft failed:", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: "Reply generation failed" }, { status: 500 });
  }
}
