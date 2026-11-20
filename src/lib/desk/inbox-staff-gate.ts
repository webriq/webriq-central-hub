import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Desk Inbox staff gate (tasks 489/490) — the same admin/super_admin/pm allowlist as the Inbox pages and the status
// route. Developers are excluded even though inbox_staff_all RLS lets them read/write. Returns the session client so
// callers can read with RLS, or a 401/403 response to return as-is.
const INBOX_STAFF_ROLES = ["admin", "super_admin", "pm"];

export type InboxStaffSession = { userId: string; supabase: Awaited<ReturnType<typeof createClient>> };

export async function requireInboxStaff(): Promise<InboxStaffSession | NextResponse> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).maybeSingle();
  if (!INBOX_STAFF_ROLES.includes(profile?.role ?? "")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  return { userId: user.id, supabase };
}

export const INBOX_ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
