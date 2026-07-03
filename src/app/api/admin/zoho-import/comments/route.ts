// dev-only import endpoint — reads _from_zoho/comments.json, upserts to task_comments.
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  readFromZoho,
  resolveTaskId,
  resolveUserId,
  buildUserCache,
  clearUserCache,
  adminClient,
  ImportResult,
} from "@/lib/migrate/zoho-import";

type ZohoCommentRaw = {
  id?: string;
  comment?: string;
  created_by?: { full_name?: string; name?: string; email?: string };
  created_time?: string;
  _zoho_task_id?: string;
  [key: string]: unknown;
};

export async function POST() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: profile } = await adminClient.from("profiles").select("role").eq("id", user.id).maybeSingle();
  if (profile?.role !== "admin" && profile?.role !== "super_admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  let comments: ZohoCommentRaw[];
  try {
    comments = readFromZoho<ZohoCommentRaw>("comments.json");
  } catch {
    return NextResponse.json({ error: "Could not read _from_zoho/comments.json" }, { status: 400 });
  }

  clearUserCache();
  const userCache = await buildUserCache();
  const result: ImportResult = { imported: 0, updated: 0, skipped: 0, errors: [] };

  for (const c of comments) {
    const externalId = String(c.id ?? "");
    const body = c.comment ?? "";
    if (!externalId || !body) { result.skipped++; continue; }

    const taskId = await resolveTaskId(String(c._zoho_task_id ?? ""));
    if (!taskId) { result.skipped++; continue; }

    const authorId = await resolveUserId(c.created_by?.email, userCache);

    const { error } = await adminClient.from("task_comments").upsert(
      {
        external_id: externalId,
        task_id: taskId,
        author_id: authorId,
        author_name: c.created_by?.full_name ?? c.created_by?.name ?? null,
        author_email: c.created_by?.email ?? null,
        body,
        created_at: c.created_time ?? new Date().toISOString(),
      },
      { onConflict: "external_id" }
    );

    if (error) {
      result.errors.push(`comment ${externalId}: ${error.message}`);
    } else {
      result.imported++;
    }
  }

  return NextResponse.json(result);
}
