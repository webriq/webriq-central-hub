import { NextResponse } from "next/server";
import { requireInboxStaff } from "@/lib/desk/inbox-staff-gate";
import { countUnreadThreads } from "@/lib/desk/inbox-unread";

// GET /api/desk/inbox/unread — task 490: number of Inbox threads with new customer messages (the sidebar badge and the
// Inbox header counter). Admin/super_admin/pm only; session client (RLS). `supported: false` until migration 186.
export async function GET() {
  const gate = await requireInboxStaff();
  if (gate instanceof NextResponse) return gate;

  try {
    return NextResponse.json(await countUnreadThreads(gate.supabase));
  } catch (err) {
    console.error("[api/desk/inbox/unread] count failed:", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: "Failed to count unread threads" }, { status: 500 });
  }
}
