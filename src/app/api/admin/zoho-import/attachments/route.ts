// dev-only import endpoint — matches admin-uploaded files (manually downloaded from Zoho,
// since server-side Zoho Docs/WorkDrive fetch is architecturally blocked — see task 106 doc)
// against _from_zoho/attachment-meta-*.json metadata by filename, uploads matched files
// directly to Supabase Storage (project-assets bucket), upserts to attachments via SSE.
import { NextRequest, NextResponse } from "next/server";
import path from "path";
import fs from "fs";
import { createClient } from "@/lib/supabase/server";
import { adminClient } from "@/lib/supabase/admin";

type ZohoAttachmentRaw = {
  third_party_file_id?: string; // real unique ID — attachment_id is always "-1" in this portal, do not use it
  name?: string;
  size?: string;
  download_url?: string; // kept only as a short-lived audit reference — not fetchable server-side (401 INVALID_OAUTHSCOPE) or from browser JS (no CORS headers)
  trashed?: boolean;
  _zoho_task_id?: string;
  [key: string]: unknown;
};

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: profile } = await adminClient.from("profiles").select("role").eq("id", user.id).maybeSingle();
  if (profile?.role !== "admin" && profile?.role !== "super_admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const formData = await request.formData();
  const files = formData.getAll("files").filter((f): f is File => f instanceof File);
  if (files.length === 0) {
    return NextResponse.json({ error: "No files uploaded — select the manually-downloaded attachment files first" }, { status: 400 });
  }

  // Multi-file scan of attachment-meta-*.json batches
  const dir = path.join(process.cwd(), "_from_zoho");
  const attachments: ZohoAttachmentRaw[] = [];
  const batchFiles = fs
    .readdirSync(dir)
    .filter((f) => f.startsWith("attachment-meta-") && f.endsWith(".json"))
    .sort();

  if (batchFiles.length > 0) {
    for (const file of batchFiles) {
      const parsed = JSON.parse(fs.readFileSync(path.join(dir, file), "utf-8"));
      if (Array.isArray(parsed)) attachments.push(...(parsed as ZohoAttachmentRaw[]));
    }
  } else {
    const fallback = path.join(dir, "attachment-meta.json");
    if (!fs.existsSync(fallback)) {
      return NextResponse.json({ error: "No attachment-meta files found in _from_zoho/" }, { status: 400 });
    }
    const parsed = JSON.parse(fs.readFileSync(fallback, "utf-8"));
    attachments.push(...(Array.isArray(parsed) ? (parsed as ZohoAttachmentRaw[]) : []));
  }

  if (attachments.length === 0) {
    return NextResponse.json({ error: "No attachments found in metadata files" }, { status: 400 });
  }

  // Filename → metadata record(s) — the matching index for uploaded files
  const metaByName = new Map<string, ZohoAttachmentRaw[]>();
  for (const att of attachments) {
    const name = att.name ?? "";
    if (!name) continue;
    if (!metaByName.has(name)) metaByName.set(name, []);
    metaByName.get(name)!.push(att);
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (obj: object) =>
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(obj)}\n\n`));

      try {
        // Pre-built, paginated task lookup map — avoids a per-row DB call
        const taskRows: Array<{ id: string; external_id: string }> = [];
        {
          const PAGE = 1000;
          let from = 0;
          while (true) {
            const { data: page } = await adminClient
              .from("tasks")
              .select("id, external_id")
              .not("external_id", "is", null)
              .range(from, from + PAGE - 1);
            if (!page || page.length === 0) break;
            taskRows.push(...(page as Array<{ id: string; external_id: string }>));
            if (page.length < PAGE) break;
            from += PAGE;
          }
        }
        const taskMap = new Map(taskRows.map((t) => [String(t.external_id), t.id]));

        let imported = 0;
        let skipped = 0;
        const errors: string[] = [];
        const total = files.length;

        for (let i = 0; i < files.length; i++) {
          const file = files[i];
          const matches = metaByName.get(file.name) ?? [];

          if (matches.length === 0) {
            errors.push(`${file.name}: no matching Zoho attachment record found in attachment-meta-*.json`);
            skipped++;
            send({ type: "progress", current: i + 1, total });
            continue;
          }
          if (matches.length > 1) {
            errors.push(`${file.name}: ${matches.length} ambiguous matches (same filename on different tasks) — skipped, import manually`);
            skipped++;
            send({ type: "progress", current: i + 1, total });
            continue;
          }

          const att = matches[0];
          const externalId = String(att.third_party_file_id ?? "");
          if (!externalId) {
            errors.push(`${file.name}: metadata record missing third_party_file_id`);
            skipped++;
            send({ type: "progress", current: i + 1, total });
            continue;
          }
          if (att.trashed === true) {
            skipped++;
            send({ type: "progress", current: i + 1, total });
            continue;
          }

          const taskId = taskMap.get(String(att._zoho_task_id ?? "")) ?? null;
          if (!taskId) {
            errors.push(`${file.name}: unresolved task ${att._zoho_task_id} (not yet imported)`);
            skipped++;
            send({ type: "progress", current: i + 1, total });
            continue;
          }

          const safeName = `zoho/${att._zoho_task_id}/${externalId}_${file.name.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
          let storagePath = "";
          const { error: uploadError } = await adminClient.storage
            .from("project-assets")
            .upload(safeName, file, { upsert: true });
          if (uploadError) {
            errors.push(`${file.name}: storage upload failed: ${uploadError.message}`);
          } else {
            storagePath = safeName;
          }

          const fileSize = att.size ? parseInt(att.size, 10) : file.size;

          const { error } = await adminClient.from("attachments").upsert(
            {
              external_id: externalId,
              entity_type: "task",
              entity_id: taskId,
              storage_path: storagePath,
              filename: file.name,
              size: fileSize,
              source_url: att.download_url ?? null,
            },
            { onConflict: "external_id" }
          );

          if (error) {
            errors.push(`${file.name}: ${error.message}`);
          } else {
            imported++;
          }

          send({ type: "progress", current: i + 1, total });
        }

        send({ type: "done", imported, skipped, errors });
      } catch (e) {
        send({ type: "error", message: String(e) });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "Connection": "keep-alive",
    },
  });
}
