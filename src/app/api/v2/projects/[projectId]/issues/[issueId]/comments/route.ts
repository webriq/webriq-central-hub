import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { adminClient } from "@/lib/supabase/admin";

// Live comment thread for Issue Detail (task 236) — mirrors
// .../tasks/[taskId]/comments/route.ts exactly, adjusted for the issue-side routing shape
// (project_id lookup first, matching .../issues/[issueId]/attachments/route.ts's own pattern,
// since issues don't have a bare /api/v2/issues/[issueId]/comments mount). `issue_comments`
// insert/delete RLS is new (migration 101, task 236) — read/pm-write already existed
// (migration 052).
//
// `issue_comments.author_id` FKs `auth.users(id)`, not `profiles` — same no-embeddable-FK
// situation task_comments has, so author display names are resolved with a second `profiles`
// lookup, falling back to the row's own `author_name`/`author_email` (Zoho-imported comments
// with no Hub account).
// Task 257, Requirement E — `source_meta.attachments` (zoho-import/issue-comments/route.ts) is
// metadata-only (name/size/type, no download_url, no `attachments` table row — the files were
// never migrated). Externally-sourced JSONB, validated defensively rather than trusted as typed.
type LegacyAttachment = { name: string; size: number | null; type: string | null };
function legacyAttachmentsFrom(sourceMeta: unknown): LegacyAttachment[] {
  if (!sourceMeta || typeof sourceMeta !== "object") return [];
  const raw = (sourceMeta as Record<string, unknown>).attachments;
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((a): a is Record<string, unknown> => !!a && typeof a === "object")
    .map((a) => ({
      name: typeof a.name === "string" ? a.name : "Untitled attachment",
      size: typeof a.size === "number" ? a.size : null,
      type: typeof a.type === "string" ? a.type : null,
    }));
}

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

// GET /api/v2/projects/[projectId]/issues/[issueId]/comments — chronological list, author-resolved
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ projectId: string; issueId: string }> }
) {
  const { projectId, issueId } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: project } = await supabase.from("projects").select("id").eq("project_id", projectId).single();
  if (!project) return NextResponse.json({ error: "Project not found" }, { status: 404 });

  const { data: issue } = await supabase.from("issues").select("id").eq("id", issueId).eq("project_id", project.id).maybeSingle();
  if (!issue) return NextResponse.json({ error: "Issue not found" }, { status: 404 });

  const { data: comments, error } = await supabase
    .from("issue_comments")
    .select("id, body, created_at, author_id, author_name, author_email, source_meta")
    .eq("issue_id", issue.id)
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
    author_id: c.author_id,
    author_name: resolveAuthorName(c, profileNames),
    attachments: attachmentsByComment.get(c.id) ?? [],
    legacyAttachments: legacyAttachmentsFrom(c.source_meta),
  }));

  return NextResponse.json(result);
}

// POST /api/v2/projects/[projectId]/issues/[issueId]/comments — create a comment as the current
// user. Not gated by getIssueEditPermission — any staff role with page access may comment
// (commenting is participation, not editing; matches task_comments' own boundary, task 236
// Requirement 3). issue_comments_staff_insert RLS (migration 101) enforces the role check.
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ projectId: string; issueId: string }> }
) {
  const { projectId, issueId } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: project } = await supabase.from("projects").select("id").eq("project_id", projectId).single();
  if (!project) return NextResponse.json({ error: "Project not found" }, { status: 404 });

  const { data: issue } = await supabase.from("issues").select("id").eq("id", issueId).eq("project_id", project.id).maybeSingle();
  if (!issue) return NextResponse.json({ error: "Issue not found" }, { status: 404 });

  const body = await req.json().catch(() => ({}));
  const text = typeof body.body === "string" ? body.body.trim() : "";
  if (!text) return NextResponse.json({ error: "body is required" }, { status: 400 });

  const { data: comment, error } = await supabase
    .from("issue_comments")
    .insert({ issue_id: issue.id, author_id: user.id, body: text })
    .select("id, body, created_at")
    .single();

  if (error) {
    console.error("[api/v2/projects/[id]/issues/[id]/comments] insert failed:", error.message);
    return NextResponse.json({ error: error.message }, { status: 403 });
  }

  const { data: profile } = await supabase.from("profiles").select("full_name").eq("id", user.id).maybeSingle();

  return NextResponse.json(
    { ...comment, author_id: user.id, author_name: profile?.full_name || user.email || "Unknown" },
    { status: 201 }
  );
}
