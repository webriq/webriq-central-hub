import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getZohoPortalUser } from "@/lib/zoho";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ userId: string }> }
) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { userId } = await params;

  try {
    const result = await getZohoPortalUser(userId);
    if (!result) return NextResponse.json({ error: "User not found" }, { status: 404 });
    return NextResponse.json({ user: result });
  } catch (err) {
    console.error("[api/zoho/portal-users/[userId]]", err);
    return NextResponse.json({ error: "Failed to fetch portal user" }, { status: 502 });
  }
}
