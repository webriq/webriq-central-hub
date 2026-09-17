import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { adminClient } from "@/lib/supabase/admin";
import { ALLOWED_MIME_TYPES, MAX_FILE_SIZE, buildCustomerAssetPath } from "@/lib/uploads/customer-asset-storage";

// PREFER `POST ./sign` (task 350): it mints a signed upload URL so the browser PUTs the bytes
// straight to Storage, avoiding Vercel's ~4.5 MB Route Handler body cap that 413s this multipart
// route in production. This handler is kept for the legacy v2 onboarding wizard
// (`src/app/(hub)/projects/v2/[projectId]/_onboarding-wizard.tsx`), which still posts multipart
// from its own inline helper — migrating it is a documented follow-up.
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ customerId: string }> }
) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).maybeSingle();
    const myRole = profile?.role;
    if (myRole !== "admin" && myRole !== "super_admin" && myRole !== "pm" && myRole !== "marketing") {
      return NextResponse.json({ error: "Not permitted to upload customer assets" }, { status: 403 });
    }

    const { customerId } = await params;
    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    const projectId = formData.get("project_id") as string | null;

    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }
    if (!ALLOWED_MIME_TYPES.includes(file.type)) {
      return NextResponse.json(
        { error: `Unsupported file type: ${file.type}. Supported types: images (incl. ICO), PDF, Word docs, Excel spreadsheets, HTML, Markdown, plain text, CSV, XML, JS/TS, ZIP/RAR` },
        { status: 400 }
      );
    }
    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { error: `File size exceeds 200MB limit (${(file.size / (1024 * 1024)).toFixed(1)}MB)` },
        { status: 400 }
      );
    }

    // Server-generated path (shared with ./sign) — nested under project_id when the caller has a
    // project context so files are separated per-project in the bucket, flat customer-level path
    // otherwise. Existing stored file_path values are read as-is regardless of shape.
    const storagePath = buildCustomerAssetPath({ customerId, projectId, filename: file.name });

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    const { error: uploadError } = await adminClient.storage
      .from("customer-assets")
      .upload(storagePath, buffer, { contentType: file.type, upsert: false });

    if (uploadError) {
      console.error("Customer asset upload error:", uploadError);
      return NextResponse.json({ error: "Failed to upload file" }, { status: 500 });
    }

    // customer-assets is a private bucket — no public URL; the asset list fetches a
    // short-lived signed URL on demand via the file-url endpoint instead.
    return NextResponse.json(
      { path: storagePath, filename: file.name, size: file.size, mimeType: file.type },
      { status: 201 }
    );
  } catch (err) {
    console.error("POST /api/customers/[customerId]/assets/upload unexpected error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
