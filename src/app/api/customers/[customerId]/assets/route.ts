import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

async function getRequesterRole(supabase: Awaited<ReturnType<typeof createClient>>, userId: string) {
  const { data: profile } = await supabase.from("profiles").select("role").eq("id", userId).maybeSingle();
  return profile?.role ?? null;
}

function canSeeAsset(role: string | null, allowedRoles: string[] | null) {
  if (role === "admin" || role === "super_admin") return true;
  if (!allowedRoles || allowedRoles.length === 0) return true;
  return role ? allowedRoles.includes(role) : false;
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ customerId: string }> }
) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const myRole = await getRequesterRole(supabase, user.id);
    const { customerId } = await params;
    const { data, error } = await supabase
      .from("customer_assets")
      .select("*")
      .eq("customer_id", customerId)
      .order("created_at", { ascending: true });

    if (error) {
      console.error("GET /api/customers/[customerId]/assets error:", error);
      return NextResponse.json({ error: "Failed to fetch assets" }, { status: 500 });
    }

    const visible = (data ?? []).filter((a) => canSeeAsset(myRole, a.allowed_roles));
    return NextResponse.json(visible);
  } catch (err) {
    console.error("GET /api/customers/[customerId]/assets unexpected error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ customerId: string }> }
) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { customerId } = await params;
    const body = await request.json();
    const {
      type, label, value, masked, allowed_roles,
      fields, file_path, file_name, file_size, file_mime_type,
    } = body as {
      type: "file" | "link" | "credential";
      label: string;
      value?: string;
      masked?: boolean;
      allowed_roles?: string[];
      fields?: { label: string; value: string }[];
      file_path?: string;
      file_name?: string;
      file_size?: number;
      file_mime_type?: string;
    };

    if (!type || !label?.trim()) {
      return NextResponse.json({ error: "type and label are required" }, { status: 400 });
    }
    if (!["file", "link", "credential"].includes(type)) {
      return NextResponse.json({ error: "Invalid asset type" }, { status: 400 });
    }

    let cleanFields: { label: string; value: string }[] = [];
    if (type === "credential") {
      cleanFields = (fields ?? [])
        .filter((f) => f?.label?.trim() && f?.value?.trim())
        .map((f) => ({ label: f.label.trim(), value: f.value.trim() }));
      if (cleanFields.length === 0) {
        return NextResponse.json({ error: "At least one field is required for credential assets" }, { status: 400 });
      }
    }
    if (type === "link" && !value?.trim()) {
      return NextResponse.json({ error: "value is required for link assets" }, { status: 400 });
    }
    if (type === "file" && (!file_path || !file_name)) {
      return NextResponse.json({ error: "file_path and file_name are required for file assets" }, { status: 400 });
    }

    const { data, error } = await supabase
      .from("customer_assets")
      .insert({
        customer_id: customerId,
        type,
        label: label.trim(),
        masked: masked ?? false,
        allowed_roles: allowed_roles && allowed_roles.length > 0 ? allowed_roles : null,
        value: type === "link" ? value!.trim() : null,
        fields: type === "credential" ? cleanFields : null,
        file_path: type === "file" ? file_path : null,
        file_name: type === "file" ? file_name : null,
        file_size: type === "file" ? file_size ?? null : null,
        file_mime_type: type === "file" ? file_mime_type ?? null : null,
      })
      .select()
      .single();

    if (error) {
      console.error("POST /api/customers/[customerId]/assets error:", error);
      return NextResponse.json({ error: "Failed to create asset" }, { status: 500 });
    }

    return NextResponse.json(data, { status: 201 });
  } catch (err) {
    console.error("POST /api/customers/[customerId]/assets unexpected error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ customerId: string }> }
) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { customerId } = await params;
    const id = new URL(request.url).searchParams.get("id");
    if (!id) return NextResponse.json({ error: "id query param required" }, { status: 400 });

    const { data: existing, error: fetchError } = await supabase
      .from("customer_assets")
      .select("id, allowed_roles")
      .eq("id", id)
      .eq("customer_id", customerId)
      .maybeSingle();

    if (fetchError) {
      console.error("DELETE /api/customers/[customerId]/assets lookup error:", fetchError);
      return NextResponse.json({ error: "Failed to delete asset" }, { status: 500 });
    }
    if (!existing) return NextResponse.json({ error: "Asset not found" }, { status: 404 });

    const myRole = await getRequesterRole(supabase, user.id);
    if (!canSeeAsset(myRole, existing.allowed_roles)) {
      return NextResponse.json({ error: "Not permitted to delete this asset" }, { status: 403 });
    }

    const { error } = await supabase
      .from("customer_assets")
      .delete()
      .eq("id", id)
      .eq("customer_id", customerId);

    if (error) {
      console.error("DELETE /api/customers/[customerId]/assets error:", error);
      return NextResponse.json({ error: "Failed to delete asset" }, { status: 500 });
    }

    return new NextResponse(null, { status: 204 });
  } catch (err) {
    console.error("DELETE /api/customers/[customerId]/assets unexpected error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
