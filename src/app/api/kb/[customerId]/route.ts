import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { adminClient } from "@/lib/supabase/admin";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ customerId: string }> }
) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { customerId } = await params;

  const { data, error } = await adminClient.storage
    .from("kb")
    .list(`customers/${customerId}`, {
      limit: 100,
      sortBy: { column: "created_at", order: "desc" },
    });

  if (error) {
    console.error("[kb] list error:", error.message);
    return NextResponse.json({ error: "Failed to list files" }, { status: 500 });
  }

  const files = (data ?? []).map((f) => ({
    name: f.name,
    size: f.metadata?.size ?? 0,
    mimeType: f.metadata?.mimetype ?? "",
    createdAt: f.created_at,
    path: `customers/${customerId}/${f.name}`,
  }));

  return NextResponse.json({ files });
}
