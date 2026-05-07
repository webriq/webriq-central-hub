import { NextRequest, NextResponse } from "next/server";
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
];

const MAX_FILE_SIZE = 25 * 1024 * 1024; // 25MB

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    const customerId = formData.get("customerId") as string | null;
    const productName = formData.get("productName") as string | null;

    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    if (!customerId) {
      return NextResponse.json({ error: "customerId is required" }, { status: 400 });
    }

    if (!productName) {
      return NextResponse.json({ error: "productName is required" }, { status: 400 });
    }

    // Validate file type
    if (!ALLOWED_MIME_TYPES.includes(file.type)) {
      return NextResponse.json(
        {
          error: `Unsupported file type: ${file.type}. Supported types: images, PDF, Word docs, Excel spreadsheets`,
        },
        { status: 400 }
      );
    }

    // Validate file size
    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { error: `File size exceeds 25MB limit (${(file.size / (1024 * 1024)).toFixed(1)}MB)` },
        { status: 400 }
      );
    }

    // Build storage path: {customer_id}/{product_name}/{timestamp}_{filename}
    const timestamp = Date.now();
    const safeFilename = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
    const storagePath = `${customerId}/${productName}/${timestamp}_${safeFilename}`;

    // Upload using admin client to bypass RLS (upload API is publicly accessible for onboarding)
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    const { error: uploadError } = await adminClient.storage
      .from("onboarding-assets")
      .upload(storagePath, buffer, {
        contentType: file.type,
        upsert: false,
      });

    if (uploadError) {
      console.error("Upload error:", uploadError);
      return NextResponse.json({ error: "Failed to upload file" }, { status: 500 });
    }

    // Get public URL
    const {
      data: { publicUrl },
    } = adminClient.storage.from("onboarding-assets").getPublicUrl(storagePath);

    return NextResponse.json(
      {
        url: publicUrl,
        filename: file.name,
        size: file.size,
        mimeType: file.type,
        path: storagePath,
      },
      { status: 201 }
    );
  } catch (err) {
    console.error("POST /api/upload unexpected error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}