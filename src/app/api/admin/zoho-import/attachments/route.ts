// dev-only import endpoint — reads _from_zoho/attachment-meta.json, downloads files
// from Zoho CDN, uploads to Supabase Storage (project-assets bucket), upserts to attachments.
// Falls back to source_url with empty storage_path if download fails — UI should prefer
// storage_path when non-empty, else fall back to source_url.
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  readFromZoho,
  resolveTaskId,
  adminClient,
  ImportResult,
} from "@/lib/migrate/zoho-import";
import { getZohoAccessToken } from "@/lib/zoho";

type ZohoAttachmentRaw = {
  id?: string;
  file_name?: string;
  filename?: string;
  file_size?: number;
  size?: number;
  download_url?: string;
  download_link?: string;
  url?: string;
  _zoho_task_id?: string;
  [key: string]: unknown;
};

export async function POST() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: profile } = await adminClient.from("profiles").select("role").eq("id", user.id).maybeSingle();
  if (profile?.role !== "admin" && profile?.role !== "super_admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  let attachments: ZohoAttachmentRaw[];
  try {
    attachments = readFromZoho<ZohoAttachmentRaw>("attachment-meta.json");
  } catch {
    return NextResponse.json({ error: "Could not read _from_zoho/attachment-meta.json" }, { status: 400 });
  }

  const token = await getZohoAccessToken();
  const result: ImportResult = { imported: 0, updated: 0, skipped: 0, errors: [] };

  for (const att of attachments) {
    const externalId = String(att.id ?? "");
    const filename = att.file_name ?? att.filename ?? "";
    if (!externalId || !filename) { result.skipped++; continue; }

    const taskId = await resolveTaskId(String(att._zoho_task_id ?? ""));
    if (!taskId) { result.skipped++; continue; }

    const sourceUrl = att.download_url ?? att.download_link ?? att.url ?? "";

    // Attempt to download from Zoho and upload to Supabase Storage
    let storagePath = "";
    if (token && sourceUrl) {
      try {
        const fileRes = await fetch(sourceUrl, {
          headers: { Authorization: `Zoho-oauthtoken ${token}` },
        });
        if (fileRes.ok) {
          const blob = await fileRes.blob();
          const safeName = `zoho/${att._zoho_task_id}/${externalId}_${filename.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
          const { error: uploadError } = await adminClient.storage
            .from("project-assets")
            .upload(safeName, blob, { upsert: true });
          if (!uploadError) storagePath = safeName;
        }
      } catch {
        // Non-blocking — source_url is the fallback
      }
    }

    const { error } = await adminClient.from("attachments").upsert(
      {
        external_id: externalId,
        entity_type: "task",
        entity_id: taskId,
        storage_path: storagePath,
        filename,
        size: att.file_size ?? att.size ?? null,
        source_url: sourceUrl || null,
      },
      { onConflict: "external_id" }
    );

    if (error) {
      result.errors.push(`attachment ${externalId}: ${error.message}`);
    } else {
      result.imported++;
    }
  }

  return NextResponse.json(result);
}
