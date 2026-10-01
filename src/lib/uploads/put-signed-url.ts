// Browser-side half of the signed-upload flow: PUTs raw bytes to a Supabase Storage signed upload
// URL (no Vercel body cap on this request). Raw XHR rather than supabase-js `uploadToSignedUrl`
// so `xhr.upload.onprogress` can drive a progress indicator.
export function putToSignedUrl({
  signedUrl,
  file,
  mime,
  onProgress,
}: {
  signedUrl: string;
  file: File;
  mime: string;
  onProgress?: (pct: number) => void;
}): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", signedUrl);
    xhr.setRequestHeader("x-upsert", "false");
    xhr.setRequestHeader("content-type", mime || "application/octet-stream");
    xhr.setRequestHeader("cache-control", "max-age=3600");
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && onProgress) onProgress(Math.round((e.loaded / e.total) * 100));
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) resolve();
      else reject(new Error(`Upload failed (${xhr.status})`));
    };
    xhr.onerror = () => reject(new Error("Connection lost — check your network and retry"));
    xhr.send(file);
  });
}
