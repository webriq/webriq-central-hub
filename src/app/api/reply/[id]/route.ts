import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { adminClient } from "@/lib/supabase/admin";

const PatchSchema = z.object({
  status: z.literal("DISCARDED"),
});

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const body = await req.json().catch(() => null);
  const parsed = PatchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  const { data: draft } = await adminClient
    .from("reply_drafts")
    .select("id, status")
    .eq("id", id)
    .maybeSingle();

  if (!draft) {
    return NextResponse.json({ error: "Draft not found" }, { status: 404 });
  }

  if (draft.status !== "DRAFT") {
    return NextResponse.json(
      { error: "Draft has already been sent or discarded" },
      { status: 409 }
    );
  }

  await adminClient.from("reply_drafts").update({ status: "DISCARDED" }).eq("id", id);
  return NextResponse.json({ ok: true });
}
