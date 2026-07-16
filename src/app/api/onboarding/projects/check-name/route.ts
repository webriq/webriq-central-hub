import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// GET — case-insensitive exact-match check for the New Project intake's step-2 project name,
// so a PM/marketing user can't unknowingly create a duplicate project under a name that
// already exists.
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { searchParams } = new URL(request.url);
    const name = searchParams.get("name")?.trim();
    if (!name) return NextResponse.json({ error: "name is required" }, { status: 400 });

    const { data, error } = await supabase
      .from("projects")
      .select("id")
      .ilike("name", name)
      .limit(1)
      .maybeSingle();

    if (error) {
      console.error("GET /api/onboarding/projects/check-name error:", error);
      return NextResponse.json({ error: "Failed to check project name" }, { status: 500 });
    }

    return NextResponse.json({ exists: !!data });
  } catch (err) {
    console.error("GET /api/onboarding/projects/check-name unexpected error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
