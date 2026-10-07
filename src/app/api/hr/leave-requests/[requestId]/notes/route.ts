import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { adminClient } from "@/lib/supabase/admin";
import { guard, jsonError, parseBody } from "@/lib/hr/api";
import { noteSchema } from "@/lib/hr/schemas";

type Ctx = { params: Promise<{ requestId: string }> };

// Internal admin notes — managers only (route guard + hr_request_notes_manager RLS).
export async function GET(_req: Request, { params }: Ctx) {
  const g = await guard("manager");
  if ("res" in g) return g.res;
  const { requestId } = await params;
  const supabase = await createClient();
  const { data, error } = await supabase
    
    .from("hr_leave_request_notes")
    .select("id, author_id, body, created_at")
    .eq("leave_request_id", requestId)
    .order("created_at");
  if (error) return jsonError("Couldn't load notes. Try again.", 500);

  const authorIds = [...new Set((data ?? []).map((n) => n.author_id))];
  // adminClient: reading author display names from profiles for other admins (read-only, names only).
  const { data: authors } = authorIds.length
    ? await adminClient.from("profiles").select("id, full_name").in("id", authorIds)
    : { data: [] };
  const names = new Map((authors ?? []).map((a) => [a.id, a.full_name ?? "Admin"]));
  return NextResponse.json({ notes: (data ?? []).map((n) => ({ ...n, author_name: names.get(n.author_id) ?? "Admin" })) });
}

export async function POST(req: Request, { params }: Ctx) {
  const g = await guard("manager");
  if ("res" in g) return g.res;
  const body = await parseBody(req, noteSchema);
  if ("res" in body) return body.res;
  const { requestId } = await params;
  const supabase = await createClient();
  const { data, error } = await supabase
    
    .from("hr_leave_request_notes")
    .insert({ leave_request_id: requestId, author_id: g.viewer.profileId, body: body.data.body })
    .select("id, author_id, body, created_at")
    .single();
  if (error) return jsonError("Couldn't save the note. Try again.", 500);
  return NextResponse.json({ note: { ...data, author_name: g.viewer.fullName ?? "Admin" } }, { status: 201 });
}
