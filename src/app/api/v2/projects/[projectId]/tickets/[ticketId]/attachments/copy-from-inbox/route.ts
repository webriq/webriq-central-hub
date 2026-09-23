import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getTicketEditPermission } from "@/lib/tickets/permissions";
import { isHardBlockedFilename, MAX_FILES } from "@/config/attachment-types";

// Task 394 — copies attachments from a Desk Inbox message onto a newly-filed project Ticket
// ("File a Ticket" — src/app/(hub)/desk/inbox/[inboxId]/_thread-to-project-modal.tsx). The two
// domains live in different Storage buckets (`ticket-attachments` for Desk Inbox vs
// `project-assets` for project Tickets) and different `attachments.entity_type` values
// (`inbox_message` vs the legacy-preserved `issue` string, migration 147) — there's no
// in-Storage cross-bucket copy operation, so this does a real server-to-server
// download-then-upload, using the session client for both buckets (their storage RLS already
// grants admin/super_admin/pm/developer `select`/`insert` directly — same posture the sibling
// file-url and attachments POST routes already document).
//
// Fault-isolated per attachment: a ticket has already been created by the time this is called
// (mirrors the modal's existing post-creation `attachmentFiles` upload step, which is equally
// non-fatal to the ticket's own creation) — one bad copy must not roll anything back or block
// the rest.
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ projectId: string; ticketId: string }> }
) {
  const { projectId, ticketId } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).maybeSingle();

  const { data: project } = await supabase.from("projects").select("id").eq("project_id", projectId).single();
  if (!project) return NextResponse.json({ error: "Project not found" }, { status: 404 });

  const { data: ticket } = await supabase
    .from("tickets")
    .select("id, created_by, assignee_id, assignees")
    .eq("id", ticketId)
    .eq("project_id", project.id)
    .maybeSingle();
  if (!ticket) return NextResponse.json({ error: "Ticket not found" }, { status: 404 });

  const perm = getTicketEditPermission(profile?.role, user.id, ticket);
  if (!perm.canEditDetails) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json().catch(() => null);
  const attachmentIds: string[] = Array.isArray(body?.attachmentIds)
    ? body.attachmentIds.filter((v: unknown): v is string => typeof v === "string")
    : [];
  if (attachmentIds.length === 0) {
    return NextResponse.json({ copied: 0, errors: [] });
  }

  const { count: existingCount } = await supabase
    .from("attachments")
    .select("id", { count: "exact", head: true })
    .eq("entity_type", "issue")
    .eq("entity_id", ticket.id);
  let remaining = MAX_FILES - (existingCount ?? 0);

  let copied = 0;
  const errors: string[] = [];

  for (const attachmentId of attachmentIds) {
    if (remaining <= 0) {
      errors.push(`${attachmentId}: skipped — ticket already has ${MAX_FILES} attachments`);
      continue;
    }

    try {
      const { data: source } = await supabase
        .from("attachments")
        .select("storage_path, filename, size")
        .eq("id", attachmentId)
        .eq("entity_type", "inbox_message")
        .maybeSingle();
      if (!source) {
        errors.push(`${attachmentId}: source attachment not found`);
        continue;
      }
      if (isHardBlockedFilename(source.filename)) {
        errors.push(`${source.filename}: unsupported file type`);
        continue;
      }

      const { data: blob, error: downloadError } = await supabase.storage
        .from("ticket-attachments")
        .download(source.storage_path);
      if (downloadError || !blob) {
        errors.push(`${source.filename}: failed to read source file`);
        continue;
      }

      const safeName = `${attachmentId}_${source.filename.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
      const storagePath = `issues/${ticket.id}/${safeName}`;
      const { error: uploadError } = await supabase.storage
        .from("project-assets")
        .upload(storagePath, blob, { upsert: true, contentType: blob.type || undefined });
      if (uploadError) {
        errors.push(`${source.filename}: failed to store copy`);
        continue;
      }

      const { error: insertError } = await supabase.from("attachments").insert({
        entity_type: "issue",
        entity_id: ticket.id,
        storage_path: storagePath,
        filename: source.filename,
        size: source.size,
        uploaded_by: user.id,
      });
      if (insertError) {
        await supabase.storage.from("project-assets").remove([storagePath]);
        errors.push(`${source.filename}: failed to register copy`);
        continue;
      }

      copied++;
      remaining--;
    } catch (e) {
      console.error(`[copy-from-inbox] attachment ${attachmentId} failed`, e);
      errors.push(`${attachmentId}: unexpected error`);
    }
  }

  return NextResponse.json({ copied, errors });
}
