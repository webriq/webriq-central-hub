import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { touchProjectForTask } from "@/lib/projects/touch-project";

// PATCH/DELETE /api/v2/tasks/[taskId]/comments/[commentId] — task 411. Task Detail's Comments
// tab previously had neither (task 206 Decision #6). Edit is author-only (admins may delete
// others' comments but not rewrite them); the session client keeps RLS in force underneath
// (task_comments_author_update / task_comments_delete, migrations 048/155).
//
// `task_comments.updated_at` arrives with migration 155 (written, not applied by the agent), so
// the update retries without it if the column isn't there yet — editing still works pre-migration,
// it just can't show the "(edited)" marker.
type RouteParams = { params: Promise<{ taskId: string; commentId: string }> };

async function loadOwnedComment(taskId: string, commentId: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) } as const;

  const { data: comment } = await supabase
    .from("task_comments")
    .select("id, author_id")
    .eq("id", commentId)
    .eq("task_id", taskId)
    .maybeSingle();
  if (!comment) return { error: NextResponse.json({ error: "Comment not found" }, { status: 404 }) } as const;

  return { supabase, user, comment } as const;
}

export async function PATCH(req: NextRequest, { params }: RouteParams) {
  const { taskId, commentId } = await params;
  const ctx = await loadOwnedComment(taskId, commentId);
  if ("error" in ctx) return ctx.error;
  const { supabase, user, comment } = ctx;

  if (comment.author_id !== user.id) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const payload = await req.json().catch(() => ({}));
  const text = typeof payload.body === "string" ? payload.body.trim() : "";
  if (!text) {
    // Attachment-only comments are legal (task 301), so an emptied body is only rejected when
    // there is nothing else left in the comment.
    const { count } = await supabase
      .from("attachments")
      .select("id", { count: "exact", head: true })
      .eq("entity_type", "comment")
      .eq("entity_id", commentId);
    if (!count) return NextResponse.json({ error: "Comment cannot be empty" }, { status: 400 });
  }

  const now = new Date().toISOString();
  let res = await supabase
    .from("task_comments")
    .update({ body: text, updated_at: now })
    .eq("id", commentId)
    .select("id, body, updated_at")
    .maybeSingle();
  if (res.error?.message.includes("updated_at")) {
    res = await supabase
      .from("task_comments")
      .update({ body: text })
      .eq("id", commentId)
      .select("id, body")
      .maybeSingle() as typeof res;
  }

  if (res.error) {
    console.error("[api/v2/tasks/[id]/comments/[id]] update failed:", res.error.message);
    return NextResponse.json({ error: res.error.message }, { status: 400 });
  }
  // RLS filtering an UPDATE yields zero rows rather than an error.
  if (!res.data) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  touchProjectForTask(taskId);
  return NextResponse.json({ id: res.data.id, body: res.data.body, updated_at: res.data.updated_at ?? now });
}

export async function DELETE(_req: NextRequest, { params }: RouteParams) {
  const { taskId, commentId } = await params;
  const ctx = await loadOwnedComment(taskId, commentId);
  if ("error" in ctx) return ctx.error;
  const { supabase, user, comment } = ctx;

  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).maybeSingle();
  const isAdmin = profile?.role === "admin" || profile?.role === "super_admin";
  if (comment.author_id !== user.id && !isAdmin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { error } = await supabase.from("task_comments").delete().eq("id", commentId);
  if (error) {
    console.error("[api/v2/tasks/[id]/comments/[id]] delete failed:", error.message);
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
  return NextResponse.json({ ok: true });
}
