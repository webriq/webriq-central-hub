import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getZohoProjects } from "@/lib/zoho";

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const result = await getZohoProjects();
    return NextResponse.json(result);
  } catch (err) {
    console.error("[api/zoho/projects]", err);
    return NextResponse.json({ error: "Failed to fetch Zoho projects" }, { status: 502 });
  }
}
