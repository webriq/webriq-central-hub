import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { adminClient } from "@/lib/supabase/admin";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ customerId: string; assetId: string }> }
) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { customerId, assetId } = await params;
    const { data: asset, error } = await supabase
      .from("customer_assets")
      .select("type, file_path, allowed_roles")
      .eq("id", assetId)
      .eq("customer_id", customerId)
      .maybeSingle();

    if (error) {
      console.error("GET .../assets/[assetId]/file-url lookup error:", error);
      return NextResponse.json({ error: "Failed to look up asset" }, { status: 500 });
    }
    if (!asset || asset.type !== "file" || !asset.file_path) {
      return NextResponse.json({ error: "File not found" }, { status: 404 });
    }

    const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).maybeSingle();
    const myRole = profile?.role ?? null;
    const isPrivileged = myRole === "admin" || myRole === "super_admin";
    const permitted = isPrivileged || !asset.allowed_roles || asset.allowed_roles.length === 0
      || (myRole ? asset.allowed_roles.includes(myRole) : false);

    if (!permitted) {
      return NextResponse.json({ error: "Not permitted to access this file" }, { status: 403 });
    }

    const { data: signed, error: signError } = await adminClient.storage
      .from("customer-assets")
      .createSignedUrl(asset.file_path, 60);

    if (signError || !signed) {
      console.error("Customer asset signed URL error:", signError);
      return NextResponse.json({ error: "Failed to generate file URL" }, { status: 500 });
    }

    return NextResponse.json({ url: signed.signedUrl });
  } catch (err) {
    console.error("GET .../assets/[assetId]/file-url unexpected error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
