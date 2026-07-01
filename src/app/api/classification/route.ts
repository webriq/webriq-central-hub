import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { adminClient } from "@/lib/supabase/admin";
import { classifyTask } from "@/lib/ai/classify";
import { syncTaskToZoho } from "@/lib/zoho";
import type { WebhookSource } from "@/types/hub";

type ClassifyBody = {
  customerId: string;
  title: string;
  description?: string | null;
  source: WebhookSource;
  zoho_ticket_id?: string | null;
  zoho_task_id?: string | null;
  task_type?: string | null;
  priority?: string | null;
  llm_eligible?: string | null;
  confidence_score?: number | null;
  zohoProjectId?: string | null;
  tasklistId?: string | null;
  startDate?: string | null;
  dueDate?: string | null;
  ownerId?: string | null;
  billingType?: string | null;
};

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: caller } = await adminClient
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();
  if (!["pm", "admin", "super_admin"].includes(caller?.role ?? "")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let body: ClassifyBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { customerId, title, source } = body;
  if (!customerId || !title || !source) {
    return NextResponse.json({ error: "customerId, title, and source are required" }, { status: 400 });
  }

  if (source === "hub_manual") {
    const { task_type, priority, llm_eligible, confidence_score, description, zohoProjectId, tasklistId, startDate, dueDate, ownerId, billingType } = body;
    if (!task_type || !priority || !llm_eligible) {
      return NextResponse.json({ error: "task_type, priority, and llm_eligible are required for hub_manual tasks" }, { status: 400 });
    }

    const { data: record, error: insertError } = await adminClient
      .from("classification_records")
      .insert({
        customer_id: customerId,
        title,
        description: description ?? null,
        source,
        task_type,
        priority,
        llm_eligible,
        confidence_score: confidence_score ?? null,
        status: "reviewed",
        model_used: null,
      })
      .select()
      .single();

    if (insertError || !record) {
      console.error("[classification/hub_manual] insert failed:", insertError?.message);
      return NextResponse.json({ error: "Failed to create task" }, { status: 500 });
    }

    // Push to Zoho non-blocking — failure does not fail the creation
    try {
      const zohoTaskId = await syncTaskToZoho({
        customerId,
        title,
        description: description ?? "",
        zohoProjectId: zohoProjectId ?? undefined,
        tasklistId: tasklistId ?? undefined,
        startDate: startDate ?? undefined,
        dueDate: dueDate ?? undefined,
        ownerId: ownerId ?? undefined,
        billingType: billingType ?? undefined,
      });
      if (zohoTaskId) {
        await adminClient
          .from("classification_records")
          .update({ zoho_task_id: zohoTaskId })
          .eq("id", record.id);
        return NextResponse.json({ ...record, zoho_task_id: zohoTaskId }, { status: 201 });
      }
    } catch {
      // Zoho push failed — record is already created, continue
    }

    return NextResponse.json(record, { status: 201 });
  }

  const record = await classifyTask(body);
  if (!record) {
    return NextResponse.json({ error: "Classification failed" }, { status: 500 });
  }

  return NextResponse.json(record, { status: 201 });
}
