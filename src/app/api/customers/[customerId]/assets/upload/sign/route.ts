import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  ALLOWED_MIME_TYPES,
  MAX_FILE_SIZE,
  buildCustomerAssetPath,
  createCustomerAssetUploadUrl,
} from "@/lib/uploads/customer-asset-storage";

// Task 350 — mints a short-lived Supabase Storage signed upload URL for a customer asset so the
// browser can PUT the bytes straight to the private `customer-assets` bucket, bypassing Vercel's
// ~4.5 MB Route Handler request-body cap that 413s the sibling multipart `POST ../upload` route
// in production. Runs the same auth + write-role + MIME + size gate checks that route does. The
// storage path is server-generated here; the existing `POST /assets` register call creates the
// `customer_assets` row afterwards (and asserts the path is inside this customer's tree).
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
    const body = await request.json().catch(() => null);
    const filename = typeof body?.filename === "string" ? body.filename : null;
    const size = typeof body?.size === "number" ? body.size : null;
    const mimeType = typeof body?.mimeType === "string" ? body.mimeType : null;
    const projectId = typeof body?.project_id === "string" ? body.project_id : null;

    if (!filename || size === null || !mimeType) {
      return NextResponse.json({ error: "filename, size and mimeType are required" }, { status: 400 });
    }
    if (!ALLOWED_MIME_TYPES.includes(mimeType)) {
      return NextResponse.json(
        { error: `Unsupported file type: ${mimeType}. Supported types: images (incl. ICO), PDF, Word docs, Excel spreadsheets, HTML, Markdown, plain text, CSV, XML, JS/TS, ZIP/RAR` },
        { status: 400 }
      );
    }
    if (size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { error: `File size exceeds 50MB limit (${(size / (1024 * 1024)).toFixed(1)}MB)` },
        { status: 400 }
      );
    }

    const storagePath = buildCustomerAssetPath({ customerId, projectId, filename });
    const signed = await createCustomerAssetUploadUrl(storagePath);
    return NextResponse.json(signed, { status: 200 });
  } catch (err) {
    console.error("POST /api/customers/[customerId]/assets/upload/sign unexpected error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
