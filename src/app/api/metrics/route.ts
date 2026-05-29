import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { adminClient } from "@/lib/supabase/admin";

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // vw_hub_metrics is added in migration 018 — cast until types regenerated
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (adminClient as any)
    .from("vw_hub_metrics")
    .select("*")
    .single();

  if (error) {
    console.error("[metrics] query error:", error.message);
    return NextResponse.json({ error: "Failed to load metrics" }, { status: 500 });
  }

  return NextResponse.json({ metrics: data as Record<string, number | null> });
}
