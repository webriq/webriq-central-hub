import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { adminClient } from "@/lib/supabase/admin";
import { canAccessAsset } from "@/lib/uploads/asset-access";
import { buildManifest, type ManifestAsset, type ManifestFolder } from "@/lib/uploads/download-manifest";
import { MAX_ZIP_FILES, MAX_ZIP_BYTES, MAX_ZIP_LABEL } from "@/config/download-limits";

// Task 419 — Files tab bulk download. Returns a plan (zip-relative paths + short-lived signed
// URLs); the BROWSER fetches the bytes and zips them, so no file content passes through this
// handler (Vercel's ~4.5 MB body / function-duration limits never apply). Reads use the session
// client (RLS); adminClient only signs URLs — same split as file-url/route.ts.
const bodySchema = z.object({
  assetIds: z.array(z.string().uuid()).max(2000).default([]),
  folderIds: z.array(z.string().uuid()).max(500).default([]),
}).refine((b) => b.assetIds.length + b.folderIds.length > 0, { message: "Nothing selected" });

const PAGE = 1000;
const SIGNED_URL_TTL_SECONDS = 600;

// CLAUDE.md: PostgREST caps responses at 1000 rows silently — page through with .range().
async function fetchAll<T>(page: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>): Promise<T[] | null> {
  const rows: T[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await page(from, from + PAGE - 1);
    if (error || !data) return null;
    rows.push(...data);
    if (data.length < PAGE) return rows;
  }
}

const mb = (n: number) => `${(n / (1024 * 1024)).toFixed(n >= 1024 * 1024 * 1024 ? 0 : 1)} MB`;

export async function POST(request: NextRequest, { params }: { params: Promise<{ customerId: string }> }) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const parsed = bodySchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: "Select at least one file or folder." }, { status: 400 });
    const { assetIds, folderIds } = parsed.data;
    const { customerId } = await params;

    const [profileRes, customerRes, assets, folders] = await Promise.all([
      supabase.from("profiles").select("role").eq("id", user.id).maybeSingle(),
      supabase.from("customers").select("company_name").eq("customer_id", customerId).maybeSingle(),
      fetchAll<ManifestAsset>((from, to) => supabase.from("customer_assets")
        .select("id, file_path, file_name, label, file_size, folder_id, created_at, allowed_roles, allowed_user_ids")
        .eq("customer_id", customerId).eq("type", "file").order("id").range(from, to)),
      fetchAll<ManifestFolder>((from, to) => supabase.from("customer_asset_folders")
        .select("id, parent_folder_id, name, allowed_roles, allowed_user_ids")
        .eq("customer_id", customerId).order("id").range(from, to)),
    ]);
    if (!assets || !folders) return NextResponse.json({ error: "Failed to load files" }, { status: 500 });

    const role = profileRes.data?.role ?? null;
    const manifest = buildManifest({
      assets, folders, assetIds, folderIds,
      canSee: (p) => canAccessAsset(role, user.id, p.allowed_roles, p.allowed_user_ids),
      baseName: customerRes.data?.company_name ?? "files",
      date: new Date().toISOString().slice(0, 10),
    });

    if (manifest.entries.length === 0) {
      return NextResponse.json({ error: "Nothing to download.", skipped: manifest.skipped }, { status: 404 });
    }
    if (manifest.entries.length > MAX_ZIP_FILES || manifest.totalBytes > MAX_ZIP_BYTES) {
      return NextResponse.json({
        error: `This selection is ${manifest.entries.length} files / ${mb(manifest.totalBytes)} (limit ${MAX_ZIP_FILES} files / ${MAX_ZIP_LABEL}). Download a smaller selection or individual sub-folders.`,
      }, { status: 413 });
    }

    const { data: signed, error: signError } = await adminClient.storage
      .from("customer-assets")
      .createSignedUrls(manifest.entries.map((e) => e.filePath), SIGNED_URL_TTL_SECONDS);
    if (signError || !signed) {
      console.error("download-manifest sign error:", signError);
      return NextResponse.json({ error: "Failed to prepare download" }, { status: 500 });
    }
    const urlByPath = new Map(signed.map((s) => [s.path, s.signedUrl]));
    const entries = manifest.entries.flatMap((e) => {
      const url = urlByPath.get(e.filePath);
      return url ? [{ path: e.path, url, size: e.size }] : [];
    });

    return NextResponse.json({
      zipName: manifest.zipName,
      entries,
      skipped: manifest.skipped + (manifest.entries.length - entries.length),
      totalBytes: manifest.totalBytes,
    });
  } catch (err) {
    console.error("POST .../assets/download-manifest unexpected error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
