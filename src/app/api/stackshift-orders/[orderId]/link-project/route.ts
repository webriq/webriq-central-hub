import { NextRequest, NextResponse } from "next/server";
import { adminClient } from "@/lib/supabase/admin";
import { requireOrderMutator } from "../../_auth";
import { linkProjectSchema } from "@/lib/stackshift-orders/schema";
import type { Database } from "@/types/database";

type OrderUpdate = Database["public"]["Tables"]["stackshift_orders"]["Update"];

// Missing-column codes: Postgres 42703 / PostgREST schema cache PGRST204 (migration 189 not applied).
const MISSING_COLUMN = new Set(["42703", "PGRST204"]);

// Task 496 — mark a pending order converted against a project that already exists (made on the
// Projects page, or the order arrived late). Creates nothing and never writes to the project.
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ orderId: string }> }
) {
  const auth = await requireOrderMutator();
  if (auth instanceof NextResponse) return auth;

  const { orderId } = await params;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const parsed = linkProjectSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid body", details: parsed.error.flatten() }, { status: 400 });
  }
  const { projectId } = parsed.data;

  const { data: order } = await adminClient
    .from("stackshift_orders")
    .select("*")
    .eq("id", orderId)
    .maybeSingle();
  if (!order || order.deleted_at) return NextResponse.json({ error: "Order not found" }, { status: 404 });
  if (order.status === "converted") return NextResponse.json({ error: "Order is already converted" }, { status: 409 });
  if (order.status === "dismissed") {
    return NextResponse.json({ error: "Order is dismissed — reopen it first" }, { status: 409 });
  }

  // select("*") so merged_into_project_id (migration 180) is read when present without 42703 when not.
  const { data: project } = await adminClient.from("projects").select("*").eq("id", projectId).maybeSingle();
  if (!project) return NextResponse.json({ error: "Project not found" }, { status: 404 });
  if (project.status === "deleted") return NextResponse.json({ error: "That project was deleted" }, { status: 409 });
  if ((project as { merged_into_project_id?: string | null }).merged_into_project_id) {
    return NextResponse.json({ error: "That project was merged into another project" }, { status: 409 });
  }

  // D3 — one order per project.
  const { data: other } = await adminClient
    .from("stackshift_orders")
    .select("company_name, submitted_at, created_at")
    .eq("project_id", projectId)
    .neq("id", orderId)
    .limit(1)
    .maybeSingle();
  if (other) {
    const when = (other.submitted_at ?? other.created_at).slice(0, 10);
    return NextResponse.json(
      { error: `That project is already linked to the order from ${other.company_name} (${when})` },
      { status: 409 }
    );
  }

  const update: OrderUpdate = {
    status: "converted",
    customer_id: project.customer_id,
    project_id: project.id,
    is_new_customer: false,
    converted_by: auth.userId,
    converted_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    link_method: "linked_existing",
  };
  // eq status = pending_review: a concurrent convert/link that won first leaves 0 rows here.
  const write = (u: OrderUpdate) =>
    adminClient.from("stackshift_orders").update(u).eq("id", orderId).eq("status", "pending_review").select("id");
  let { data: rows, error } = await write(update);
  if (error && MISSING_COLUMN.has(error.code)) {
    const { link_method: _omit, ...withoutLinkMethod } = update;
    void _omit;
    ({ data: rows, error } = await write(withoutLinkMethod));
  }
  if (error) {
    console.error("[stackshift-order] link-project failed:", error);
    return NextResponse.json({ error: "Link failed" }, { status: 500 });
  }
  if (!rows?.length) return NextResponse.json({ error: "Order is no longer pending review" }, { status: 409 });

  return NextResponse.json({ ok: true, customerId: project.customer_id, projectId: project.id });
}
