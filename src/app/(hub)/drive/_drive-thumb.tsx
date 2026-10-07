"use client";

import { useEffect, useState } from "react";
import { Film, Music } from "lucide-react";
import { cn } from "@/lib/utils";
import { isDriveMedia } from "@/lib/drive/constants";
import { FileTypeTile } from "./_reuse";
import { fetchDriveFileUrl } from "./_drive-upload";

// Images get a real thumbnail (one signed URL per tile, fetched when it mounts); recordings get a
// neutral media tile; everything else the colour-coded type tile Project Files already uses.
export function DriveThumb({ id, name, mime }: { id: string; name: string; mime: string }) {
  const [url, setUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const isImage = mime.startsWith("image/");

  useEffect(() => {
    if (!isImage) return;
    let cancelled = false;
    fetchDriveFileUrl(id).then((u) => { if (!cancelled) setUrl(u); }).catch(() => { if (!cancelled) setFailed(true); });
    return () => { cancelled = true; };
  }, [id, isImage]);

  if (isDriveMedia(mime)) {
    const Icon = mime.startsWith("video/") ? Film : Music;
    return (
      <div className={cn("flex h-full w-full flex-col items-center justify-center gap-1 bg-[#EDF0F7]")}>
        <Icon size={18} className="text-[#5F6A88]" />
        <span className="text-[9px] font-bold tracking-wide text-[#5F6A88]">{mime.startsWith("video/") ? "VIDEO" : "AUDIO"}</span>
      </div>
    );
  }
  if (!isImage || failed || !url) return <FileTypeTile mime={mime} />;
  // eslint-disable-next-line @next/next/no-img-element -- signed, short-lived Supabase Storage URL; next/image can't optimize an opaque signed URL usefully here.
  return <img src={url} alt={name} className="h-full w-full object-cover" onError={() => setFailed(true)} />;
}
