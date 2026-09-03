import { NextRequest, NextResponse } from "next/server";
import { assertOrderWebhookSecret } from "../_secret";
import { uploadsManifestSchema } from "@/lib/stackshift-orders/schema";
import { validateManifest, mintUploadUrls } from "@/lib/stackshift-orders/uploads";

// Task 347 — step 1 of the webriq.com proxy relay: exchange a file manifest for signed
// Supabase Storage upload URLs. The proxy then PUTs the bytes straight to Storage (no Hub
// handler in the byte path) and calls POST /api/webhooks/stackshift-order with the paths.
export async function POST(req: NextRequest) {
  const secret = assertOrderWebhookSecret(req);
  if (secret) return secret;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = uploadsManifestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid manifest", details: parsed.error.flatten() }, { status: 400 });
  }

  const check = validateManifest(parsed.data);
  if (!check.ok) {
    return NextResponse.json({ error: check.reason }, { status: 400 });
  }

  try {
    const uploads = await mintUploadUrls(parsed.data);
    return NextResponse.json({ uploads });
  } catch (err) {
    console.error("[stackshift-order] failed to mint upload URLs:", err);
    return NextResponse.json({ error: "Failed to create upload URLs" }, { status: 500 });
  }
}

export function GET() {
  return NextResponse.json({ error: "Method not allowed" }, { status: 405 });
}
