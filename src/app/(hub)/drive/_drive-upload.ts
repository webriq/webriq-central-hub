import type { DriveFileRow } from "@/lib/drive/types";

async function errorMessage(res: Response, fallback: string): Promise<string> {
  try {
    const body = await res.json();
    if (typeof body?.error === "string") return body.error;
  } catch {
    /* non-JSON body — keep the fallback */
  }
  return fallback;
}

// Task 436 — browser-direct Drive upload (task 350's flow against /api/drive):
//   1. POST the file's metadata to /upload/sign → { path, signedUrl } (server runs every gate)
//   2. XHR PUT the bytes straight to Storage (raw XHR so the progress bar works)
//   3. POST /api/drive/files to register the row (server verifies the object landed)
export async function uploadToDrive(file: File, folderId: string | null, onProgress?: (pct: number) => void): Promise<DriveFileRow> {
  const mimeType = file.type || "application/octet-stream";

  const signRes = await fetch("/api/drive/upload/sign", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ filename: file.name, size: file.size, mimeType, folderId }),
  });
  if (!signRes.ok) throw new Error(await errorMessage(signRes, `Upload failed (${signRes.status})`));
  const { path, signedUrl } = (await signRes.json()) as { path: string; signedUrl: string };

  await new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", signedUrl);
    xhr.setRequestHeader("x-upsert", "false");
    xhr.setRequestHeader("content-type", mimeType);
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && onProgress) onProgress(Math.round((e.loaded / e.total) * 100));
    };
    xhr.onload = () => (xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new Error(`Upload failed (${xhr.status})`)));
    xhr.onerror = () => reject(new Error("Connection lost — check your network and retry."));
    xhr.send(file);
  });

  const registerRes = await fetch("/api/drive/files", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ file_path: path, file_name: file.name, file_size: file.size, file_mime_type: mimeType, folder_id: folderId }),
  });
  if (!registerRes.ok) throw new Error(await errorMessage(registerRes, `Couldn't save the file (${registerRes.status})`));
  return (await registerRes.json()) as DriveFileRow;
}

export async function fetchDriveFileUrl(fileId: string, download = false): Promise<string> {
  const res = await fetch(`/api/drive/files/${fileId}/url${download ? "?download=1" : ""}`);
  if (!res.ok) throw new Error(await errorMessage(res, "Couldn't open the file."));
  return ((await res.json()) as { url: string }).url;
}
