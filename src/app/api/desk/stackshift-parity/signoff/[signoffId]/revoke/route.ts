import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { adminClient } from "@/lib/supabase/admin";

// Task 449 — revokes a parity sign-off (e.g. new failures appeared, or the pilot was rolled back). A revoked
// row no longer satisfies task 450's precondition. admin / super_admin only; a reason is mandatory.
const bodySchema = z.object({ reason: z.string().trim().min(3).max(500) }).strict();

export async function POST(req: NextRequest, { params }: { params: Promise<{ signoffId: string }> }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: profile } = await adminClient.from("profiles").select("role").eq("id", user.id).maybeSingle();
  if (!["admin", "super_admin"].includes(profile?.role ?? "")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { signoffId } = await params;
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(signoffId)) {
    return NextResponse.json({ error: "Invalid sign-off id" }, { status: 400 });
  }
  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "A reason of at least 3 characters is required" }, { status: 400 });

  // Conditional on not-yet-revoked so a double submit cannot overwrite the original revocation.
  const { data, error } = await adminClient
    .from("stackshift_parity_signoff")
    .update({ revoked_at: new Date().toISOString(), revoked_by: user.id, revoke_reason: parsed.data.reason })
    .eq("id", signoffId)
    .is("revoked_at", null)
    .select("id")
    .maybeSingle();
  if (error) {
    console.error("[api/desk/stackshift-parity/revoke] update failed:", error.message);
    return NextResponse.json({ error: "Failed to revoke" }, { status: 500 });
  }
  if (!data) return NextResponse.json({ error: "Sign-off not found or already revoked" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
