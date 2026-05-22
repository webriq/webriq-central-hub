import { NextRequest, NextResponse } from "next/server";
import { adminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import type { LLMEligibility, TaskPriority, TaskType } from "@/types/hub";

type ReclassifyBody = {
  task_type: TaskType;
  priority: TaskPriority;
  llm_eligible: LLMEligibility;
};

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

  let body: ReclassifyBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { task_type, priority, llm_eligible } = body;
  if (!task_type || !priority || !llm_eligible) {
    return NextResponse.json({ error: "task_type, priority, and llm_eligible are required" }, { status: 400 });
  }

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
