import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ customerId: string }> }
) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

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

    return NextResponse.json(data ?? []);
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
    const { type, label, value, masked } = body as {
      type: "file" | "link" | "credential";
      label: string;
      value: string;
      masked?: boolean;
    };

    if (!type || !label?.trim() || !value?.trim()) {
      return NextResponse.json({ error: "type, label, and value are required" }, { status: 400 });
    }
    if (!["file", "link", "credential"].includes(type)) {
      return NextResponse.json({ error: "Invalid asset type" }, { status: 400 });
    }

    const { data, error } = await supabase
      .from("customer_assets")
      .insert({ customer_id: customerId, type, label: label.trim(), value: value.trim(), masked: masked ?? false })
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
