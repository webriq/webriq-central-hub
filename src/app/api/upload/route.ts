import { NextRequest, NextResponse } from "next/server";
import { adminClient } from "@/lib/supabase/admin";
import type { ProductName } from "@/types/hub";

// Task 377 — widened to match the customer-assets allowlist (task 372), minus
// image/svg+xml, which stays excluded because this bucket is public.
const ALLOWED_MIME_TYPES = [
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
  // image/svg+xml intentionally excluded — SVGs can carry embedded <script>, a stored-XSS
  // vector when served back at the storage domain.
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "text/html",
  "text/markdown",
  "text/plain",
  "text/csv",
  "image/x-icon",
  "image/vnd.microsoft.icon",
  "application/zip",
  "application/x-zip-compressed",
  "application/vnd.rar",
  "application/x-rar-compressed",
  "text/javascript",
  "application/javascript",
  "video/mp2t",
  "application/xml",
  "text/xml",
];

const VALID_PRODUCTS: ProductName[] = ["StackShift", "PublishForge", "PipelineForge"];

const MAX_FILE_SIZE = 200 * 1024 * 1024; // 200MB

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

    if (!VALID_PRODUCTS.includes(productName as ProductName)) {
      return NextResponse.json({ error: "Invalid product name" }, { status: 400 });
    }

    // This endpoint is intentionally public (no session — onboarding customers aren't
    // logged in), so it can't role-gate. It can at least confirm the target customer is
    // real, closing off anonymous storage abuse under arbitrary customerId paths.
    const { data: customer } = await adminClient
      .from("customers")
      .select("customer_id")
      .eq("customer_id", customerId)
      .maybeSingle();
    if (!customer) {
      return NextResponse.json({ error: "Unknown customerId" }, { status: 404 });
    }

    // Validate file type
    if (!ALLOWED_MIME_TYPES.includes(file.type)) {
      return NextResponse.json(
        {
          error: `Unsupported file type: ${file.type}. Supported types: images (incl. ICO), PDF, Word docs, Excel spreadsheets, HTML, Markdown, plain text, CSV, XML, JS/TS, ZIP/RAR`,
        },
        { status: 400 }
      );
    }

    // Validate file size
    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { error: `File size exceeds 200MB limit (${(file.size / (1024 * 1024)).toFixed(1)}MB)` },
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