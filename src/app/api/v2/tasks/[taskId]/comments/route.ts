import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { adminClient } from "@/lib/supabase/admin";

// Comment thread for the task detail page (task 206). `task_comments` already exists (migration
// 025/035) with RLS already scoping staff read/insert (migration 048) — no migration needed here.
// `taskId` is the task's UUID (matches the sibling `[taskId]/route.ts`/`subtasks/route.ts`
// convention), not the page URL's `display_id`.
//
// `task_comments.author_id` FKs `auth.users(id)`, not `profiles` — there is no FK PostgREST can
// embed through, so author display names are resolved with a second `profiles` lookup, falling
// back to the row's own `author_name`/`author_email` (populated for Zoho-imported comments with
// no Hub account, migration 035).
function resolveAuthorName(
  row: { author_id: string | null; author_name: string | null; author_email: string | null },
  profileNames: Map<string, string>
): string {
  if (row.author_id) {
    const name = profileNames.get(row.author_id);
    if (name) return name;
  }
  return row.author_name || row.author_email || "Unknown";
}

// GET /api/v2/tasks/[taskId]/comments — chronological list, author-resolved
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ taskId: string }> }
) {
  const { taskId } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: comments, error } = await supabase
    .from("task_comments")
    .select("id, body, created_at, author_id, author_name, author_email")
    .eq("task_id", taskId)
    .order("created_at", { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  const authorIds = [...new Set((comments ?? []).map((c) => c.author_id).filter((id): id is string => !!id))];
  const profileNames = new Map<string, string>();
  if (authorIds.length > 0) {
    // profiles' own RLS (profiles_read_own) only lets a caller read their own row —
    // adminClient bypasses that for this read-only display lookup.
    const { data: profiles } = await adminClient.from("profiles").select("id, full_name").in("id", authorIds);
    for (const p of profiles ?? []) {
      if (p.full_name) profileNames.set(p.id, p.full_name);
    }
  }

  // Task 212 — batch-fetch every comment's attachments in one query, same reasoning as the
  // author-name resolution above: avoids an N+1 fetch per comment.
  const commentIds = (comments ?? []).map((c) => c.id);
  const attachmentsByComment = new Map<string, { id: string; filename: string; size: number | null }[]>();
  if (commentIds.length > 0) {
    const { data: attachments } = await supabase
      .from("attachments")
      .select("id, filename, size, entity_id")
      .eq("entity_type", "comment")
      .in("entity_id", commentIds)
      .order("created_at", { ascending: true });
    for (const a of attachments ?? []) {
      const list = attachmentsByComment.get(a.entity_id) ?? [];
      list.push({ id: a.id, filename: a.filename, size: a.size });
      attachmentsByComment.set(a.entity_id, list);
    }
  }

  const result = (comments ?? []).map((c) => ({
    id: c.id,
    body: c.body,
    created_at: c.created_at,
    author_name: resolveAuthorName(c, profileNames),
    attachments: attachmentsByComment.get(c.id) ?? [],
  }));

  return NextResponse.json(result);
}

// POST /api/v2/tasks/[taskId]/comments — create a comment as the current user
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ taskId: string }> }
) {
  const { taskId } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Task 301 — body may be empty when the comment is attachment-only (client enforces
  // "text OR at least one attachment", not "text always required"); the attachment itself is
  // uploaded in a follow-up request against the comment id this returns, so there's nothing
  // else to validate here. `body` stays `not null` at the DB level — an empty string satisfies
  // that, no migration needed.
  const body = await req.json().catch(() => ({}));
  const text = typeof body.body === "string" ? body.body.trim() : "";

  const { data: comment, error } = await supabase
    .from("task_comments")
    .insert({ task_id: taskId, author_id: user.id, body: text })
    .select("id, body, created_at")
    .single();

  if (error) {
    console.error("[api/v2/tasks/[id]/comments] insert failed:", error.message);
    return NextResponse.json({ error: error.message }, { status: 403 });
  }

  const { data: profile } = await supabase.from("profiles").select("full_name").eq("id", user.id).maybeSingle();

  return NextResponse.json(
    { ...comment, author_name: profile?.full_name || user.email || "Unknown" },
    { status: 201 }
  );
}
