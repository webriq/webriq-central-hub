import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getZohoProjectTasklists, createZohoTasklist } from "@/lib/zoho";

export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const projectId = req.nextUrl.searchParams.get("projectId");
  if (!projectId) return NextResponse.json({ error: "projectId required" }, { status: 400 });

  const tasklists = await getZohoProjectTasklists(projectId);
  return NextResponse.json({ tasklists });
}

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null) as { projectId?: string; name?: string } | null;
  const { projectId, name } = body ?? {};
  if (!projectId || !name?.trim()) {
    return NextResponse.json({ error: "projectId and name required" }, { status: 400 });
  }

  const tasklist = await createZohoTasklist(projectId, name.trim());
  if (!tasklist) return NextResponse.json({ error: "Failed to create task list" }, { status: 500 });
  return NextResponse.json({ tasklist }, { status: 201 });
}
