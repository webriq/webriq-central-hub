"use client";

import { useCallback } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { copyLink } from "./_copy-link-button";

// Task 368 — deep link for task/ticket attachments, mirroring the Project Files tab's `?file=`
// scheme (`_use-files-deeplink.ts`) but simpler: there's no folder concept here, and every
// task/ticket-native and comment-uploaded attachment now lives in one merged Attachments-tab
// list (task 368, R3), so a single `?attachment=<id>` id space covers every tile regardless of
// where "Copy URL" was clicked from.
export function useAttachmentDeepLink() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const deepLinkedAttachmentId = searchParams.get("attachment");

  const copyAttachmentUrl = useCallback(async (attachmentId: string) => {
    const ok = await copyLink(`${pathname}?attachment=${attachmentId}`);
    if (ok) toast.success("Attachment link copied");
    else toast.error("Couldn't copy link");
  }, [pathname]);

  return { deepLinkedAttachmentId, copyAttachmentUrl };
}
