// Task 457 (Part E) — relabel ticket attachments stored with an untrusted content type. The live
// bucket query found ~62 Desk-imported/polled files (heic, webp, mp4, csv, ai, eps, …) stored as
// text/html: Zoho Desk's download label for types it doesn't know. The bytes are fine; the label
// breaks webp/mp4 previews and makes browsers render binaries as pages. Each mislabeled object is
// re-uploaded in place with correctedContentType()'s type. Manually triggered, admin-only, bounded,
// re-runnable — same shape as backfill-email-attachments (task 456).
//
// Query params:
//   ?dryRun=1   — list what would change, write nothing
//   ?limit=N    — attachment rows examined this call (default 100, max 500)
//   ?offset=N   — skip the first N rows (rows are ordered by id); use `nextOffset` from the response
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { adminClient } from "@/lib/supabase/admin";
import { correctedContentType } from "@/config/attachment-types";
import { INLINE_IMAGE_BUCKET as BUCKET } from "@/lib/email/inline-images";

export const maxDuration = 300;

const DEFAULT_LIMIT = 100;
const MAX_LIMIT = 500;

type Change = { attachmentId: string; filename: string; from: string; to: string };
type Unresolved = { attachmentId: string; filename: string; reason: string };

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: profile } = await adminClient.from("profiles").select("role").eq("id", user.id).maybeSingle();
  if (profile?.role !== "admin" && profile?.role !== "super_admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const url = new URL(req.url);
  const dryRun = url.searchParams.get("dryRun") === "1" || url.searchParams.get("dryRun") === "true";
  const limitParam = Number(url.searchParams.get("limit"));
  const limit = Number.isInteger(limitParam) && limitParam > 0 ? Math.min(limitParam, MAX_LIMIT) : DEFAULT_LIMIT;
  const offsetParam = Number(url.searchParams.get("offset"));
  const offset = Number.isInteger(offsetParam) && offsetParam > 0 ? offsetParam : 0;

  // Every inbox_message attachment (email, Desk, direct API, historical import) lives in this bucket.
  const { data: rows, error } = await adminClient
    .from("attachments")
    .select("id, filename, storage_path")
    .eq("entity_type", "inbox_message")
    .not("storage_path", "is", null)
    .order("id", { ascending: true })
    .range(offset, offset + limit - 1);
  if (error) return NextResponse.json({ error: `attachments query failed: ${error.message}` }, { status: 500 });

  const bucket = adminClient.storage.from(BUCKET);
  const changes: Change[] = [];
  const unresolved: Unresolved[] = [];
  let repaired = 0;

  for (const row of rows ?? []) {
    const path = row.storage_path as string;
    // list() (POST, reads storage.objects), not info(): after an overwrite info() kept returning the
    // old type for hours (observed live, task 457), so a re-run would re-flag every repaired file.
    const slash = path.lastIndexOf("/");
    const folder = slash >= 0 ? path.slice(0, slash) : "";
    const name = path.slice(slash + 1);
    const { data: listed, error: listError } = await bucket.list(folder, { search: name, limit: 100 });
    const object = listed?.find((o) => o.name === name);
    if (listError || !object) {
      unresolved.push({ attachmentId: row.id, filename: row.filename, reason: `lookup failed: ${listError?.message ?? "object not found"}` });
      continue;
    }
    const stored = (object.metadata?.mimetype as string | undefined) ?? "";
    const to = correctedContentType(stored, row.filename);
    if (!to) continue;
    changes.push({ attachmentId: row.id, filename: row.filename, from: stored, to });
    if (dryRun) continue;

    const { data: blob, error: dlError } = await bucket.download(path);
    if (dlError || !blob) {
      unresolved.push({ attachmentId: row.id, filename: row.filename, reason: `download failed: ${dlError?.message ?? "no data"}` });
      continue;
    }
    // ArrayBuffer, not the Blob: storage-js sends a Blob as FormData and ignores `contentType`.
    const { error: upError } = await bucket.upload(path, await blob.arrayBuffer(), { upsert: true, contentType: to });
    if (upError) {
      unresolved.push({ attachmentId: row.id, filename: row.filename, reason: `upload failed: ${upError.message}` });
      continue;
    }
    repaired++;
  }

  const scanned = rows?.length ?? 0;
  return NextResponse.json({
    dryRun,
    offset,
    scanned,
    mismatched: changes.length,
    repaired,
    nextOffset: offset + scanned,
    done: scanned < limit,
    changes,
    unresolvedCount: unresolved.length,
    unresolved,
  });
}
