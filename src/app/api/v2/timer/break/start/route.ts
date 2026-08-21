import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { BREAK_DURATIONS_MIN, type BreakType } from "@/lib/timer/constants";
import { attachTaskTitle } from "@/lib/timer/serialize";
import { appendTimerEvent } from "@/lib/timer/timeline";

// POST /api/v2/timer/break/start { break_type }
// Duration is resolved server-side from BREAK_DURATIONS_MIN — never trust a client-supplied
// duration. Auto-pauses an active running timer (banks its elapsed seconds) as part of the same
// update. A break can also exist with no task timer at all (row is upserted if none exists).
export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const breakType = body.break_type as BreakType | undefined;
  if (!breakType || !(breakType in BREAK_DURATIONS_MIN)) {
    return NextResponse.json({ error: "Invalid break_type" }, { status: 400 });
  }

  const { data: existing } = await supabase
    .from("active_timers")
    .select("id, status, accumulated_seconds, segment_started_at, break_type, timeline")
    .eq("user_id", user.id)
    .maybeSingle();

  if (existing?.break_type) {
    return NextResponse.json({ error: "A break is already active" }, { status: 409 });
  }

  const now = new Date().toISOString();
  const isRunning = existing?.status === "running" && existing.segment_started_at;
  const bankedSeconds = isRunning
    ? (existing!.accumulated_seconds + Math.max(0, (Date.now() - new Date(existing!.segment_started_at!).getTime()) / 1000))
    : existing?.accumulated_seconds ?? 0;

  const breakFields = {
    break_type: breakType,
    break_started_at: now,
    break_duration_minutes: BREAK_DURATIONS_MIN[breakType],
    timeline: appendTimerEvent(existing?.timeline, { type: "break_start" as const, at: now, break_type: breakType }),
    updated_at: now,
  };

  const { data, error } = existing
    ? await supabase
        .from("active_timers")
        .update({
          ...breakFields,
          ...(isRunning ? { status: "paused", accumulated_seconds: bankedSeconds, segment_started_at: null } : {}),
        })
        .eq("id", existing.id)
        .select()
        .single()
    : await supabase
        .from("active_timers")
        .insert({ user_id: user.id, ...breakFields })
        .select()
        .single();

  if (error) {
    console.error("[api/v2/timer/break/start] failed:", error.message);
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
  return NextResponse.json({ timer: await attachTaskTitle(supabase, data) });
}
