import { putToSignedUrl } from "@/lib/uploads/put-signed-url";

// Task 500 — browser-direct Wiki image upload (sign → PUT to Storage), shared by the RTE's
// paste/drop and the .docx import. Returns the stable auth-gated read URL to store in page HTML.
// The page row need not exist yet: the sign route gates on role + UUID path only.
export async function uploadWikiImage(pageId: string, file: File): Promise<string> {
  const res = await fetch(`/api/wiki/pages/${pageId}/description-images/sign`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ filename: file.name, size: file.size, type: file.type }),
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new Error(body?.error ?? "Image upload failed");
  }
  const { signedUrl, url } = (await res.json()) as { signedUrl: string; url: string };
  await putToSignedUrl({ signedUrl, file, mime: file.type });
  return url;
}
