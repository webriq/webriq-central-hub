import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { adminClient } from "@/lib/supabase/admin";
import { generateMockupSpec } from "@/lib/ai/generate-mockup-spec";

// Doubles as both "generate" (no paired MD exists yet) and "regenerate" (a paired MD
// already exists — its storage content and file_size are overwritten in place, same row,
// same task 133-style upsert pattern as the content PATCH route) — one endpoint for both,
// per task 199's design so a stale-after-edit spec can be refreshed without duplicating rows.
export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ customerId: string; assetId: string }> }
) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).maybeSingle();
    const myRole = profile?.role;
    if (myRole !== "admin" && myRole !== "super_admin" && myRole !== "pm" && myRole !== "marketing") {
      return NextResponse.json({ error: "Not permitted to generate mockup specs" }, { status: 403 });
    }

    const { customerId, assetId } = await params;

    const { data: sourceAsset, error: sourceError } = await supabase
      .from("customer_assets")
      .select("id, file_path, file_name, file_mime_type, phase_number, project_id, folder_id")
      .eq("id", assetId)
      .eq("customer_id", customerId)
      .maybeSingle();

    if (sourceError) {
      console.error("POST .../assets/[assetId]/generate-md lookup error:", sourceError);
      return NextResponse.json({ error: "Failed to look up source asset" }, { status: 500 });
    }
    if (!sourceAsset || !sourceAsset.file_path) {
      return NextResponse.json({ error: "Source mockup file not found" }, { status: 404 });
    }
    if (sourceAsset.file_mime_type !== "text/html") {
      return NextResponse.json({ error: "Only text/html mockup assets can generate a build spec" }, { status: 400 });
    }

    const { data: htmlBlob, error: downloadError } = await adminClient.storage
      .from("customer-assets")
      .download(sourceAsset.file_path);

    if (downloadError || !htmlBlob) {
      console.error("POST .../assets/[assetId]/generate-md download error:", downloadError);
      return NextResponse.json({ error: "Failed to read mockup file" }, { status: 500 });
    }

    const html = await htmlBlob.text();
    const spec = await generateMockupSpec({
      html,
      fileName: sourceAsset.file_name ?? "mockup.html",
      customerId,
      sourceAssetId: sourceAsset.id,
    });

    if (!spec) {
      return NextResponse.json({ error: "Failed to generate build spec — please retry" }, { status: 500 });
    }

    const buffer = Buffer.from(spec.markdown, "utf-8");

    const { data: existingSpec, error: existingSpecError } = await supabase
      .from("customer_assets")
      .select("*")
      .eq("source_asset_id", sourceAsset.id)
      .eq("customer_id", customerId)
      .maybeSingle();

    if (existingSpecError) {
      console.error("POST .../assets/[assetId]/generate-md paired-lookup error:", existingSpecError);
      return NextResponse.json({ error: "Failed to look up existing build spec" }, { status: 500 });
    }

    if (existingSpec && existingSpec.file_path) {
      const { error: uploadError } = await adminClient.storage
        .from("customer-assets")
        .upload(existingSpec.file_path, buffer, { contentType: "text/markdown", upsert: true });

      if (uploadError) {
        console.error("POST .../assets/[assetId]/generate-md regenerate upload error:", uploadError);
        return NextResponse.json({ error: "Failed to save regenerated build spec" }, { status: 500 });
      }

      const { data: updated, error: updateError } = await supabase
        .from("customer_assets")
        .update({ file_size: buffer.byteLength })
        .eq("id", existingSpec.id)
        .select()
        .single();

      if (updateError) {
        console.error("POST .../assets/[assetId]/generate-md regenerate DB update error:", updateError);
        return NextResponse.json({ error: "Failed to update build spec record" }, { status: 500 });
      }

      return NextResponse.json(updated);
    }

    const baseName = (sourceAsset.file_name ?? "mockup").replace(/\.[^./]+$/, "").replace(/[^a-zA-Z0-9._-]/g, "_");
    const mdFileName = `${baseName}.md`;
    const dirPrefix = sourceAsset.project_id ? `${customerId}/${sourceAsset.project_id}` : customerId;
    const storagePath = `${dirPrefix}/${Date.now()}_${mdFileName}`;

    const { error: uploadError } = await adminClient.storage
      .from("customer-assets")
      .upload(storagePath, buffer, { contentType: "text/markdown", upsert: false });

    if (uploadError) {
      console.error("POST .../assets/[assetId]/generate-md upload error:", uploadError);
      return NextResponse.json({ error: "Failed to save build spec" }, { status: 500 });
    }

    const { data: inserted, error: insertError } = await supabase
      .from("customer_assets")
      .insert({
        customer_id: customerId,
        type: "file",
        label: "Mockup Build Spec",
        file_path: storagePath,
        file_name: mdFileName,
        file_size: buffer.byteLength,
        file_mime_type: "text/markdown",
        phase_number: sourceAsset.phase_number,
        project_id: sourceAsset.project_id,
        folder_id: sourceAsset.folder_id,
        source_asset_id: sourceAsset.id,
      })
      .select()
      .single();

    if (insertError) {
      console.error("POST .../assets/[assetId]/generate-md insert error:", insertError);
      return NextResponse.json({ error: "Failed to save build spec record" }, { status: 500 });
    }

    return NextResponse.json(inserted, { status: 201 });
  } catch (err) {
    console.error("POST .../assets/[assetId]/generate-md unexpected error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
