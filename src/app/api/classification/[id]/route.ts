import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { adminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

const ReclassifyBody = z.object({
  task_type: z.enum([
    "CONTENT_UPDATE", "SETTINGS_CHANGE", "BLOG_PUBLISH", "ASSET_UPLOAD",
    "CODE_CHANGE_MINOR", "SEO_UPDATE", "BUG_REPORT", "FEATURE_REQUEST",
    "STRATEGIC", "OTHER",
  ]),
  priority: z.enum(["CRITICAL", "HIGH", "NORMAL", "LOW"]),
  llm_eligible: z.enum(["YES", "NO", "HUMAN_ONLY"]),
});

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let rawBody: unknown;
  try {
    rawBody = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = ReclassifyBody.safeParse(rawBody);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid body" }, { status: 400 });
  }
  const { task_type, priority, llm_eligible } = parsed.data;

  const { data, error } = await adminClient
    .from("classification_records")
    .update({
      task_type,
      priority,
      llm_eligible,
      status: "reviewed",
      reviewed_by: user.id,
      reviewed_at: new Date().toISOString(),
    })
    .eq("id", id)
    .select()
    .single();

  if (error || !data) {
    console.error("[classification PATCH] failed:", error?.message);
    return NextResponse.json({ error: "Failed to update classification" }, { status: 500 });
  }

  return NextResponse.json(data);
}
