"use client";

import { AttachmentDropzone, uploadViaSignedUrl, useUploadQueue } from "./_attachment-dropzone";
import { extensionInfoFor } from "@/config/attachment-types";

// Shared, generically-named `[projectId]/`-level upload dropzone (task 270) — now built on the
// shared AttachmentDropzone (task 273), which pulls its allowlist from
// src/config/attachment-types.ts instead of a locally hand-copied one, and runs the same
// client-side corruption/mismatch pre-check as every other task/issue attachment surface.
// Callers don't need an onUploaded callback: the target Attachments tab (e.g.
// `_task-attachments.tsx`) already holds a live Supabase Realtime subscription on the
// `attachments` table scoped to its own entity id, so a successful upload here shows up there
// without any extra wiring.
//
// Task 387 — `uploadUrl` is the "register" route, which task 339 moved to a JSON-only
// `{ path, filename, size }` body (browser PUTs bytes straight to Storage via a signed URL,
// this call only verifies + registers the object). This component was missed in that
// migration and kept POSTing multipart FormData here, which the route can no longer parse as
// JSON — every upload 400'd "Invalid request" regardless of file type. Fixed to use
// `uploadViaSignedUrl`, matching `_ticket-attachments.tsx`'s already-correct call shape.

export function AttachmentUploadZone({
  uploadUrl,
  disabled = false,
}: {
  uploadUrl: string;
  disabled?: boolean;
}) {
  const queue = useUploadQueue((file, onProgress) => {
    return uploadViaSignedUrl({
      signUrl: `${uploadUrl}/sign`,
      registerUrl: uploadUrl,
      file,
      mime: extensionInfoFor(file.name)?.mime ?? "application/octet-stream",
      onProgress,
    }).then(() => undefined);
  });

  return <AttachmentDropzone queue={queue} disabled={disabled} />;
}
