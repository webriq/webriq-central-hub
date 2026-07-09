import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { adminClient } from "@/lib/supabase/admin";

const ALLOWED_MIME_TYPES = [
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
  "image/svg+xml",
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  // HTML mockups / MD source content / plain-text access notes — Bert's onboarding wizard
  // (task 122) explicitly uploads these alongside branding/document files.
  "text/html",
  "text/markdown",
  "text/plain",
];

const MAX_FILE_SIZE = 25 * 1024 * 1024; // 25MB — matches the customer-assets bucket's file_size_limit

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

    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }
    if (!ALLOWED_MIME_TYPES.includes(file.type)) {
      return NextResponse.json(
        { error: `Unsupported file type: ${file.type}. Supported types: images, PDF, Word docs, Excel spreadsheets, HTML, Markdown, plain text` },
        { status: 400 }
      );
    }
    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { error: `File size exceeds 25MB limit (${(file.size / (1024 * 1024)).toFixed(1)}MB)` },
        { status: 400 }
      );
    }

    const timestamp = Date.now();
    const safeFilename = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
    const storagePath = `${customerId}/${timestamp}_${safeFilename}`;

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
