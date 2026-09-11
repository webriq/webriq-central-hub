"use client";

import { useCallback, useMemo, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { copyLink } from "./_copy-link-button";
import type { AssetRow, AssetFolder } from "@/app/(hub)/projects/v2/[projectId]/onboarding-workspace/_wizard-v2-types";

// Task 359 — deep links for the project Files tab. Before this, the open folder was pure local
// state, so `/projects/{v2,legacy}/{projectId}/files` was the only URL that ever existed and
// there was nothing to hand anyone.
//
//   ?folder=<folder uuid>  opens that folder
//   ?file=<asset uuid>     opens the asset's OWN folder, then auto-opens its preview modal
//
// `?file=` deliberately carries no companion `?folder=` — the containing folder comes from
// `asset.folder_id`, which can't go stale if the file is later moved.
//
// This is NOT the Onboarding Workspace's scheme (_workspace-url-params.ts), which addresses
// folders by root-to-leaf NAME path because it maps *deliverables* onto folders. Here we always
// have the folder row in hand, so ids are used: stable across renames, unambiguous when two
// sibling folders share a name.
type DeepLinkTarget = { folderId: string | null; assetId: string | null };
const NO_TARGET: DeepLinkTarget = { folderId: null, assetId: null };

export function useFilesDeepLink({ loading, assets, folders }: {
  loading: boolean;
  assets: AssetRow[];
  folders: AssetFolder[];
}) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const folderParam = searchParams.get("folder");
  const fileParam = searchParams.get("file");

  // `undefined` means the viewer hasn't navigated yet, so an incoming deep link still governs.
  // Once they click any folder (or the Files breadcrumb) this holds their choice and the URL
  // params stop being consulted — no effect, no state drift, derived during render.
  const [navigatedFolderId, setNavigatedFolderId] = useState<string | null | undefined>(undefined);
  const hasNavigated = navigatedFolderId !== undefined;

  // An id we can't resolve — deleted since the link was shared, or hidden from this viewer by
  // RLS — must fall back to the Files root. Leaving a stale id in `openFolderId` would render a
  // folder view with no contents and a broken breadcrumb.
  //
  // Short-circuits on `hasNavigated` before touching `assets`/`folders` — once the viewer has
  // taken over, this result is discarded below regardless, but every upload/delete/rename/move
  // gives those arrays a new identity (see _use-customer-assets.ts's `setAssets/setFolders`
  // callers), which would otherwise re-run a full linear scan for a value nothing reads.
  const target = useMemo<DeepLinkTarget>(() => {
    if (hasNavigated || loading) return NO_TARGET;
    if (fileParam) {
      const asset = assets.find((a) => a.id === fileParam);
      return asset?.folder_id ? { folderId: asset.folder_id, assetId: asset.id } : NO_TARGET;
    }
    if (folderParam) return folders.some((f) => f.id === folderParam) ? { folderId: folderParam, assetId: null } : NO_TARGET;
    return NO_TARGET;
  }, [hasNavigated, loading, assets, folders, folderParam, fileParam]);

  const openFolderId = hasNavigated ? navigatedFolderId : target.folderId;
  const autoPreviewAssetId = hasNavigated ? null : target.assetId;

  // Keeps the address bar in step with the open folder WITHOUT a Next navigation: both Files
  // pages are `export const dynamic = "force-dynamic"`, so router.replace() would re-run the
  // server component on every folder click. replaceState is supported by the App Router for
  // search-param updates and costs nothing.
  const navigate = useCallback((id: string | null) => {
    setNavigatedFolderId(id);
    window.history.replaceState(null, "", id ? `${pathname}?folder=${id}` : pathname);
  }, [pathname]);

  // Relative path in, absolute URL out — copyLink() resolves against window.location.origin.
  // Built from usePathname(), never from a projectId prop: on v2 the [projectId] route segment
  // is the human-readable `project_id` while the component receives the UUID, so reconstructing
  // the path would produce a 404.
  const copyTo = useCallback(async (relativeUrl: string, label: string) => {
    const ok = await copyLink(relativeUrl);
    if (ok) toast.success(`${label} link copied`);
    else toast.error("Couldn't copy link");
  }, []);

  const copyFolderUrl = useCallback((folderId: string) => copyTo(`${pathname}?folder=${folderId}`, "Folder"), [copyTo, pathname]);
  const copyFileUrl = useCallback((assetId: string) => copyTo(`${pathname}?file=${assetId}`, "File"), [copyTo, pathname]);

  return { openFolderId, navigate, autoPreviewAssetId, copyFolderUrl, copyFileUrl };
}
