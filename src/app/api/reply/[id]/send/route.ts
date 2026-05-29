import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { adminClient } from "@/lib/supabase/admin";
import { sendCliqNotification } from "@/lib/zoho";

const PostSchema = z.object({
  content: z.string().min(1),
});

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const body = await req.json().catch(() => null);
  const parsed = PostSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const { content } = parsed.data;

  const { data: draft } = await adminClient
    .from("reply_drafts")
    .select("id, draft_content, status")
    .eq("id", id)
    .maybeSingle();

  if (!draft) {
    return NextResponse.json({ error: "Draft not found" }, { status: 404 });
  }

  if (draft.status !== "DRAFT") {
    return NextResponse.json(
      { error: "Draft already sent or not found" },
      { status: 409 }
    );
  }

  const wasEdited = content !== draft.draft_content;
  const { data: updated, error: updateError } = await adminClient
    .from("reply_drafts")
    .update({
      status: "SENT",
      sent_at: new Date().toISOString(),
      pm_edited_content: wasEdited ? content : null,
      pm_diff: wasEdited
        ? JSON.stringify({ before: draft.draft_content, after: content })
        : null,
    })
    .eq("id", id)
    .eq("status", "DRAFT")
    .select("id")
    .maybeSingle();

  if (updateError) {
    console.error("[reply/send] UPDATE failed:", updateError);
    return NextResponse.json({ error: "Failed to send reply" }, { status: 500 });
  }

  if (!updated) {
    return NextResponse.json(
      { error: "Draft already sent or not found" },
      { status: 409 }
    );
  }

  sendCliqNotification(content, "pm").catch((err) =>
    console.error("[reply/send] Cliq notification failed:", err)
  );

  return NextResponse.json({ ok: true });
}
