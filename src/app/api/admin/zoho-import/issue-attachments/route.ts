// dev-only import endpoint — matches admin-uploaded files (manually downloaded from Zoho,
// since server-side Zoho Docs/WorkDrive fetch is architecturally blocked — see task 106 doc)
// against _from_zoho/issue-attachment-meta-*.json metadata by (name, size) compound key,
// uploads matched files directly to Supabase Storage (project-assets bucket), upserts to
// attachments via SSE. Issue-scoped sibling of zoho-import/attachments/route.ts — the two
// functional deltas are the compound match key (name-only matching would wrongly skip 20
// real files that share a name but differ in size) and stripping Chrome's local " (N)"
// dedup suffix before matching (see stripDedupSuffix below — confirmed live-necessary).
import { NextRequest, NextResponse } from "next/server";
import path from "path";
import fs from "fs";
import { createClient } from "@/lib/supabase/server";
import { adminClient } from "@/lib/supabase/admin";

type ZohoIssueAttachmentRaw = {
  third_party_file_id?: string; // real unique ID — attachment_id is "-1" on 50/629 real records, do not use it
  name?: string;
  size?: string;
  download_url?: string; // kept only as a short-lived audit reference — not fetchable server-side or from browser JS
  trashed?: boolean;
  _zoho_issue_id?: string;
  [key: string]: unknown;
};

// Chrome appends " (1)", " (2)", etc. to a downloaded file's name when another file with
// the same name already exists locally (either a genuine Zoho duplicate-name attachment,
// or an unrelated pre-existing file in Downloads). Metadata `name` is always the bare
// original Zoho name, so the uploaded file's name must be de-suffixed before matching —
// confirmed live: 9 real files failed "no matching record" on task 114's first live run
// until this stripping was added.
function stripDedupSuffix(filename: string): string {
  const idx = filename.lastIndexOf(".");
  const base = idx > 0 ? filename.slice(0, idx) : filename;
  const ext = idx > 0 ? filename.slice(idx) : "";
  return base.replace(/ \(\d+\)$/, "") + ext;
}

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

  // Multi-file scan of issue-attachment-meta-*.json batches
  const dir = path.join(process.cwd(), "_from_zoho");
  const attachments: ZohoIssueAttachmentRaw[] = [];
  const batchFiles = fs
    .readdirSync(dir)
    .filter((f) => f.startsWith("issue-attachment-meta-") && f.endsWith(".json"))
    .sort();

  if (batchFiles.length > 0) {
    for (const file of batchFiles) {
      const parsed = JSON.parse(fs.readFileSync(path.join(dir, file), "utf-8"));
      if (Array.isArray(parsed)) attachments.push(...(parsed as ZohoIssueAttachmentRaw[]));
    }
  } else {
    const fallback = path.join(dir, "issue-attachment-meta.json");
    if (!fs.existsSync(fallback)) {
      return NextResponse.json({ error: "No issue-attachment-meta files found in _from_zoho/" }, { status: 400 });
    }
    const parsed = JSON.parse(fs.readFileSync(fallback, "utf-8"));
    attachments.push(...(Array.isArray(parsed) ? (parsed as ZohoIssueAttachmentRaw[]) : []));
  }

  if (attachments.length === 0) {
    return NextResponse.json({ error: "No attachments found in metadata files" }, { status: 400 });
  }

  // (name, size) compound key — see task 114 decision #2: name-only matching wrongly
  // skips 20 real files that share a name with another attachment but differ in size.
  const metaByNameSize = new Map<string, ZohoIssueAttachmentRaw[]>();
  for (const att of attachments) {
    const name = att.name ?? "";
    if (!name) continue;
    const key = `${name}::${att.size ?? ""}`;
    if (!metaByNameSize.has(key)) metaByNameSize.set(key, []);
    metaByNameSize.get(key)!.push(att);
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (obj: object) =>
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(obj)}\n\n`));

      try {
        // Pre-built, paginated issue lookup map — issues has 1,049 rows, over Supabase's
        // 1000-row default select cap (same bug class already hit in tasks 103/108/110).
        const issueRows: Array<{ id: string; external_id: string }> = [];
        {
          const PAGE = 1000;
          let from = 0;
          while (true) {
            const { data: page } = await adminClient
              .from("issues")
              .select("id, external_id")
              .not("external_id", "is", null)
              .range(from, from + PAGE - 1);
            if (!page || page.length === 0) break;
            issueRows.push(...(page as Array<{ id: string; external_id: string }>));
            if (page.length < PAGE) break;
            from += PAGE;
          }
        }
        const issueMap = new Map(issueRows.map((i) => [String(i.external_id), i.id]));

        let imported = 0;
        let skipped = 0;
        const errors: string[] = [];
        const total = files.length;

        for (let i = 0; i < files.length; i++) {
          const file = files[i];
          // Try the raw uploaded name first — some real Zoho filenames legitimately
          // contain a literal " (N)" (confirmed live: "1 (6).jpg", "NI-Vol47-Cover(FINAL)
          // (1).pdf" are both genuine metadata names, not Chrome dedup artifacts). Only
          // fall back to the de-suffixed name if the raw name doesn't match anything —
          // that fallback is what recovers actual Chrome-renamed duplicates.
          let canonicalName = file.name;
          let matches = metaByNameSize.get(`${canonicalName}::${file.size}`) ?? [];
          if (matches.length === 0) {
            const stripped = stripDedupSuffix(file.name);
            if (stripped !== file.name) {
              const strippedMatches = metaByNameSize.get(`${stripped}::${file.size}`) ?? [];
              if (strippedMatches.length > 0) {
                canonicalName = stripped;
                matches = strippedMatches;
              }
            }
          }

          if (matches.length === 0) {
            errors.push(`${file.name}: no matching Zoho attachment record found (checked name+size)`);
            skipped++;
            send({ type: "progress", current: i + 1, total });
            continue;
          }
          if (matches.length > 1) {
            errors.push(`${file.name}: ${matches.length} ambiguous matches even after name+size — identical file content attached to multiple issues, skipped, import manually`);
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

          const issueId = issueMap.get(String(att._zoho_issue_id ?? "")) ?? null;
          if (!issueId) {
            errors.push(`${file.name}: unresolved issue ${att._zoho_issue_id} (not yet imported)`);
            skipped++;
            send({ type: "progress", current: i + 1, total });
            continue;
          }

          const safeName = `zoho/issues/${att._zoho_issue_id}/${externalId}_${canonicalName.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
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
              entity_type: "issue",
              entity_id: issueId,
              storage_path: storagePath,
              filename: canonicalName,
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
