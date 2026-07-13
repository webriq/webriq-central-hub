import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { adminClient } from "@/lib/supabase/admin";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ customerId: string; assetId: string }> }
) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).maybeSingle();
    const myRole = profile?.role;
    if (myRole !== "admin" && myRole !== "super_admin" && myRole !== "pm" && myRole !== "marketing") {
      return NextResponse.json({ error: "Not permitted to edit customer assets" }, { status: 403 });
    }

    const { customerId, assetId } = await params;
    const body = await request.json();
    const html = body.html;
    if (typeof html !== "string") {
      return NextResponse.json({ error: "html (string) is required" }, { status: 400 });
    }

    const { data: existing, error: fetchError } = await supabase
      .from("customer_assets")
      .select("file_path, file_mime_type")
      .eq("id", assetId)
      .eq("customer_id", customerId)
      .maybeSingle();

    if (fetchError) {
      console.error("PATCH .../assets/[assetId]/content lookup error:", fetchError);
      return NextResponse.json({ error: "Failed to look up asset" }, { status: 500 });
    }
    if (!existing || !existing.file_path) {
      return NextResponse.json({ error: "File not found" }, { status: 404 });
    }
    // Editable types: HTML mockups and their Markdown source content (task 133's own
    // "html-md-files" checklist item already groups these two together).
    if (existing.file_mime_type !== "text/html" && existing.file_mime_type !== "text/markdown") {
      return NextResponse.json({ error: "Only text/html or text/markdown assets can be edited" }, { status: 400 });
    }

    const buffer = Buffer.from(html, "utf-8");
    const { error: uploadError } = await adminClient.storage
      .from("customer-assets")
      .upload(existing.file_path, buffer, { contentType: existing.file_mime_type, upsert: true });

    if (uploadError) {
      console.error("PATCH .../assets/[assetId]/content storage write error:", uploadError);
      return NextResponse.json({ error: "Failed to save file content" }, { status: 500 });
    }

    const { data: updated, error: updateError } = await supabase
      .from("customer_assets")
      .update({ file_size: buffer.byteLength })
      .eq("id", assetId)
      .eq("customer_id", customerId)
      .select()
      .single();

    if (updateError) {
      console.error("PATCH .../assets/[assetId]/content DB update error:", updateError);
      return NextResponse.json({ error: "Failed to update asset record" }, { status: 500 });
    }

    return NextResponse.json(updated);
  } catch (err) {
    console.error("PATCH .../assets/[assetId]/content unexpected error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
