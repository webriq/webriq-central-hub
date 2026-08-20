"use client";

import { AttachmentDropzone, uploadFileWithProgress, useUploadQueue } from "./_attachment-dropzone";

// Shared, generically-named `[projectId]/`-level upload dropzone (task 270) — now built on the
// shared AttachmentDropzone (task 273), which pulls its allowlist from
// src/config/attachment-types.ts instead of a locally hand-copied one, and runs the same
// client-side corruption/mismatch pre-check as every other task/issue attachment surface.
// Callers don't need an onUploaded callback: the target Attachments tab (e.g.
// `_task-attachments.tsx`) already holds a live Supabase Realtime subscription on the
// `attachments` table scoped to its own entity id, so a successful upload here shows up there
// without any extra wiring.

export function AttachmentUploadZone({
  uploadUrl,
  disabled = false,
}: {
  uploadUrl: string;
  disabled?: boolean;
}) {
  const queue = useUploadQueue((file, onProgress) => {
    const fd = new FormData();
    fd.append("file", file);
    return uploadFileWithProgress(uploadUrl, fd, onProgress).then(() => undefined);
  });

  return <AttachmentDropzone queue={queue} disabled={disabled} />;
}
