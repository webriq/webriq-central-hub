import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { attachTaskTitle } from "@/lib/timer/serialize";
import { loadReconciledTimer } from "@/lib/timer/reconcile-apply";

// GET /api/v2/timer — the current user's active timer/break row, or null. RLS
// (active_timers_own, migration 113) already scopes this to the caller's own row. Task 439: the
// row is reconciled first, so a break that already expired is resolved — with timestamps
// backdated to its real expiry — by the time the client sees it.
export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const data = await loadReconciledTimer(supabase, user.id);
  return NextResponse.json({ timer: await attachTaskTitle(supabase, data) });
}
