import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

const VALID_PROJECT_TYPES = ["Content Site", "Ecommerce (B2C)", "Ecommerce (B2B)", "Custom App"] as const;
const VALID_STATUS = ["active", "on_hold", "completed", "archived"] as const;

// GET /api/v2/projects?customer_id=&status=  — list projects (RLS-scoped)
export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const customerId = searchParams.get("customer_id");
  const status = searchParams.get("status");

  let q = supabase
    .from("projects")
    .select("id,name,project_type,status,customer_id,description,created_at,updated_at")
    .order("updated_at", { ascending: false });
  if (customerId) q = q.eq("customer_id", customerId);
  if (status && (VALID_STATUS as readonly string[]).includes(status)) {
    q = q.eq("status", status as (typeof VALID_STATUS)[number]);
  }

  const { data, error } = await q;
  if (error) {
    console.error("[api/v2/projects] list failed:", error.message);
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
  return NextResponse.json(data ?? []);
}

// POST /api/v2/projects  — create a project (PM/Admin via RLS)
export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const { customer_id, name, project_type, description, status } = body;

  if (!customer_id?.trim()) {
    return NextResponse.json({ error: "customer_id is required" }, { status: 400 });
  }
  if (!name?.trim()) {
    return NextResponse.json({ error: "name is required" }, { status: 400 });
  }
  if (!project_type || !VALID_PROJECT_TYPES.includes(project_type)) {
    return NextResponse.json(
      { error: `project_type must be one of: ${VALID_PROJECT_TYPES.join(", ")}` },
      { status: 400 }
    );
  }
  if (status && !VALID_STATUS.includes(status)) {
    return NextResponse.json({ error: "invalid status" }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("projects")
    .insert({
      customer_id: customer_id.trim(),
      name: name.trim(),
      project_type,
      description: description?.trim() || null,
      status: status || "active",
      created_by: user.id,
    })
    .select()
    .single();

  if (error) {
    console.error("[api/v2/projects] create failed:", error.message);
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
  return NextResponse.json(data, { status: 201 });
}
