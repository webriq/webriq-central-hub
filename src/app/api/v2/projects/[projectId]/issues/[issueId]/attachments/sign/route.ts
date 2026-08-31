import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getIssueEditPermission } from "@/lib/issues/permissions";
import { extensionInfoFor, isHardBlockedFilename, MAX_FILE_SIZE, MAX_FILES } from "@/config/attachment-types";
import { createAttachmentUploadUrl } from "@/lib/uploads/attachment-storage";

// Task 339 — mints a short-lived signed upload URL so the browser can send attachment bytes
// straight to Supabase Storage, bypassing Vercel's ~4.5 MB request-body cap that made the old
// multipart POST to `../attachments` return 413 for anything larger (e.g. retina screenshots).
// Every gate check the old POST ran before touching storage lives here; byte verification and
// the `attachments` row insert stay in `../attachments` POST (now a JSON "register" call).
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ projectId: string; issueId: string }> }
) {
  const { projectId, issueId } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).maybeSingle();

  const { data: project } = await supabase.from("projects").select("id").eq("project_id", projectId).single();
  if (!project) return NextResponse.json({ error: "Project not found" }, { status: 404 });

  const { data: issue } = await supabase
    .from("issues")
    .select("id, created_by, assignee_id")
    .eq("id", issueId)
    .eq("project_id", project.id)
    .maybeSingle();
  if (!issue) return NextResponse.json({ error: "Issue not found" }, { status: 404 });

  const perm = getIssueEditPermission(profile?.role, user.id, issue);
  if (!perm.canEditDetails) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json().catch(() => null);
  const filename = typeof body?.filename === "string" ? body.filename : "";
  const size = typeof body?.size === "number" ? body.size : NaN;
  if (!filename || !Number.isFinite(size)) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const info = extensionInfoFor(filename);
  if (!info || isHardBlockedFilename(filename)) {
    return NextResponse.json({ error: "Unsupported file type." }, { status: 400 });
  }
  if (size > MAX_FILE_SIZE) {
    return NextResponse.json({ error: `File size exceeds the ${(MAX_FILE_SIZE / (1024 * 1024)).toFixed(0)}MB limit (${(size / (1024 * 1024)).toFixed(1)}MB)` }, { status: 400 });
  }

  const { count: existingCount } = await supabase
    .from("attachments")
    .select("id", { count: "exact", head: true })
    .eq("entity_type", "issue")
    .eq("entity_id", issue.id);
  if ((existingCount ?? 0) >= MAX_FILES) {
    return NextResponse.json({ error: `Only up to ${MAX_FILES} files can be attached.` }, { status: 400 });
  }

  const safeFilename = filename.replace(/[^a-zA-Z0-9._-]/g, "_");
  const storagePath = `issues/${issue.id}/${Date.now()}_${safeFilename}`;

  try {
    const signed = await createAttachmentUploadUrl(supabase, storagePath);
    return NextResponse.json(signed);
  } catch (e) {
    console.error("[api/v2/projects/[id]/issues/[issueId]/attachments/sign] failed:", e instanceof Error ? e.message : e);
    return NextResponse.json({ error: "Could not start upload" }, { status: 500 });
  }
}
