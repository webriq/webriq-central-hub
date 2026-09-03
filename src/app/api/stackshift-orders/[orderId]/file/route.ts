import { NextRequest, NextResponse } from "next/server";
import { adminClient } from "@/lib/supabase/admin";
import { requireOrderReviewer } from "../../_auth";

// Task 347 — short-lived signed URL for a submission's uploaded documents.
// ?which=proposal | spec ; ?download=1 forces a save-as with the original filename.
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ orderId: string }> }
) {
  const auth = await requireOrderReviewer();
  if (auth instanceof NextResponse) return auth;

  const { orderId } = await params;
  const which = new URL(req.url).searchParams.get("which");
  const download = new URL(req.url).searchParams.get("download") === "1";
  if (which !== "proposal" && which !== "spec") {
    return NextResponse.json({ error: "which must be 'proposal' or 'spec'" }, { status: 400 });
  }

  const { data: order } = await adminClient
    .from("stackshift_orders")
    .select("proposal_path, proposal_filename, flowforge_spec_path, flowforge_spec_filename")
    .eq("id", orderId)
    .maybeSingle();
  if (!order) return NextResponse.json({ error: "Order not found" }, { status: 404 });

  const path = which === "proposal" ? order.proposal_path : order.flowforge_spec_path;
  const filename = which === "proposal" ? order.proposal_filename : order.flowforge_spec_filename;
  if (!path) return NextResponse.json({ error: "File not found" }, { status: 404 });

  const { data: signed, error } = await adminClient.storage
    .from("project-assets")
    .createSignedUrl(path, 60, download ? { download: filename ?? true } : undefined);
  if (error || !signed) {
    console.error("[stackshift-order] signed URL error:", error);
    return NextResponse.json({ error: "Failed to generate file URL" }, { status: 500 });
  }
  return NextResponse.json({ url: signed.signedUrl });
}
