import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// POST /api/v2/tasks/[taskId]/timelog
// Creates a time_log entry when the user stops a timer.
// Body: { hours: number; project_id: string }
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ taskId: string }> }
) {
  const { taskId } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const hours = typeof body.hours === "number" ? body.hours : 0;
  const projectId = typeof body.project_id === "string" ? body.project_id : null;

  if (!projectId) return NextResponse.json({ error: "project_id required" }, { status: 400 });
  if (hours <= 0) return NextResponse.json({ error: "hours must be positive" }, { status: 400 });

  const { data, error } = await supabase
    .from("time_logs")
    .insert({
      task_id: taskId,
      project_id: projectId,
      employee_id: user.id,
      date_logged: new Date().toISOString().slice(0, 10),
      hours,
      source: "timer",
      billable: false,
    })
    .select()
    .single();

  if (error) {
    console.error("[api/v2/tasks/timelog] insert failed:", error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data, { status: 201 });
}
