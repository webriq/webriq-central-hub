import { NextRequest, NextResponse } from "next/server";
import { getDriveViewer, isResponse, json } from "@/lib/drive/access";
import { manifestSchema } from "@/lib/drive/schemas";
import { loadVisibleDrive } from "@/lib/drive/load";
import { buildDriveManifest } from "@/lib/drive/manifest";
import { signDriveFileUrls } from "@/lib/drive/storage";
import { MAX_ZIP_FILES, MAX_ZIP_BYTES, MAX_ZIP_LABEL } from "@/config/download-limits";

// Bulk download plan (zip-relative paths + short-lived signed URLs); the BROWSER fetches the bytes
// and zips them, so no file content passes through this handler. Only rows RLS lets the caller see
// can appear in the plan, so an id they can't access simply yields nothing.
const SIGNED_URL_TTL_SECONDS = 600;
const mb = (n: number) => `${(n / (1024 * 1024)).toFixed(1)} MB`;

export async function POST(request: NextRequest) {
  try {
    const viewer = await getDriveViewer();
    if (isResponse(viewer)) return viewer;

    const parsed = manifestSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return json("Select at least one file or folder.", 400);

    const visible = await loadVisibleDrive(viewer);
    if (!visible) return json("Couldn't prepare the download — try again.", 500);

    const manifest = buildDriveManifest({
      ...visible, fileIds: parsed.data.fileIds, folderIds: parsed.data.folderIds, date: new Date().toISOString().slice(0, 10),
    });
    if (manifest.entries.length === 0) return json("Nothing to download.", 404);
    if (manifest.entries.length > MAX_ZIP_FILES || manifest.totalBytes > MAX_ZIP_BYTES) {
      return json(`This selection is ${manifest.entries.length} files / ${mb(manifest.totalBytes)} (limit ${MAX_ZIP_FILES} files / ${MAX_ZIP_LABEL}). Download a smaller selection or individual sub-folders.`, 413);
    }

    const urls = await signDriveFileUrls(manifest.entries.map((e) => e.filePath), SIGNED_URL_TTL_SECONDS);
    if (!urls) return json("Couldn't prepare the download — try again.", 500);
    const entries = manifest.entries.flatMap((e) => {
      const url = urls.get(e.filePath);
      return url ? [{ path: e.path, url, size: e.size }] : [];
    });
    return NextResponse.json({
      zipName: manifest.zipName, entries, skipped: manifest.entries.length - entries.length, totalBytes: manifest.totalBytes,
    });
  } catch (err) {
    console.error("POST /api/drive/download-manifest unexpected error:", err);
    return json("Internal server error", 500);
  }
}
