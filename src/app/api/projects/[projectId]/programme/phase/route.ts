import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { adminClient } from "@/lib/supabase/admin";
import { sendCliqNotification } from "@/lib/zoho";
import {
  resolveEffectivePhaseNumber,
  PROGRAMME_PHASES,
  type CustomPhaseSeed,
  type DefaultPhaseOverride,
} from "@/config/customer-phases";
import { createProgrammeCalendar } from "@/lib/programme/calendar";
import { cancelProjectAutostart } from "@/lib/qstash";
import { seedProgrammeAtPhase } from "@/lib/programme/seed";
import { loadProgramme, rematerialiseProgrammeDates } from "@/lib/programme/store";
import { toWire } from "@/lib/programme/view-model";
import { inProgrammeOrder, isPermanentlySkipped } from "@/lib/programme/programme-status";

const WRITE_ROLES = ["admin", "super_admin", "marketing"];

// Manual "Jump to phase" override — lets Bert/admin tag a project as starting from any of the 5
// phases instead of always Day 1. Works whether or not the programme has been started yet:
//   - Not started: this call also starts it, back-dating programme_started_at so "today" lands
//     on the target phase's first day.
//   - Already started: programme_started_at is also backdated the same way, so the calendar-day
//     -driven "Day N" marker moves into the newly-active phase's range instead of staying frozen.
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).maybeSingle();
    if (!profile?.role || !WRITE_ROLES.includes(profile.role)) {
      return NextResponse.json({ error: "Not permitted to override the programme phase" }, { status: 403 });
    }

    const body = await request.json();
    const phaseNumber = Number(body?.phase_number);
    const note: string | null = typeof body?.note === "string" && body.note.trim() ? body.note.trim() : null;
    // Task 244 — StackShift I default-phase skip: only ever sent by the New Project wizard's
    // "jump to phase" two-step submission (create with mode "save", then this PATCH), carrying
    // the same skip set the PM configured on Step 3. Not persisted/reusable after this call — a
    // later, unrelated phase-jump on this project (outside that intake flow) has no skip context.
    const skipPhaseNumbers: number[] = Array.isArray(body?.skip_phase_numbers)
      ? body.skip_phase_numbers.filter((n: unknown) => Number.isInteger(n) && (n as number) > 0)
      : [];
    // Task 246: custom phases the PM configured at intake, relayed through the New Project
    // wizard's "jump to phase" two-step submission (create with mode "save", then this PATCH) the
    // same way skip_phase_numbers already is — only meaningful on the not-started branch below,
    // where seedProgrammeAtPhase actually creates the customer_phases rows.
    const customPhases: CustomPhaseSeed[] = Array.isArray(body?.custom_phases)
      ? body.custom_phases.filter(
          (c: unknown): c is CustomPhaseSeed =>
            !!c &&
            typeof c === "object" &&
            Number.isInteger((c as CustomPhaseSeed).phaseNumber) &&
            Number.isFinite((c as CustomPhaseSeed).sortOrder) &&
            typeof (c as CustomPhaseSeed).name === "string" &&
            Number.isInteger((c as CustomPhaseSeed).dayStart) &&
            Number.isInteger((c as CustomPhaseSeed).dayEnd) &&
            Array.isArray((c as CustomPhaseSeed).deliverables)
        )
      : [];
    // Task 249: default-phase day-range overrides configured at intake, relayed the same way
    // customPhases already is — only meaningful on the not-started branch below, where
    // seedProgrammeAtPhase actually creates the customer_phases/customer_deliverables rows.
    const defaultPhaseOverrides: DefaultPhaseOverride[] = Array.isArray(body?.default_phase_overrides)
      ? body.default_phase_overrides.filter(
          (o: unknown): o is DefaultPhaseOverride =>
            !!o &&
            typeof o === "object" &&
            Number.isInteger((o as DefaultPhaseOverride).phaseNumber) &&
            Number.isInteger((o as DefaultPhaseOverride).dayStart) &&
            Number.isInteger((o as DefaultPhaseOverride).dayEnd)
        )
      : [];

    if (!Number.isInteger(phaseNumber) || phaseNumber <= 0) {
      return NextResponse.json({ error: "phase_number must be a positive integer" }, { status: 400 });
    }

    const { projectId } = await params;
    // If the requested target itself is excluded, the earliest non-skipped phase becomes the
    // one that's actually seeded "active" and backdated against — mirrors
    // seedAndStartProgramme's own resolution (customer-phases.ts). Entries here are only the
    // defaults + this submission's own custom phases (no DB round-trip needed) — correct for the
    // not-started branch below, which is the only branch that uses targetPhase.dayStart/name for
    // a phase that doesn't exist in the DB yet.
    // Task 249: a default phase's dayStart here now honors its intake-time override (when
    // present) — otherwise a PM who both edited a default phase's day range and jumped straight
    // to it would get backdated against the stale static dayStart instead of their edited one.
    const defaultOverrideByNumber = new Map(defaultPhaseOverrides.map((o) => [o.phaseNumber, o]));
    const entries = [
      ...PROGRAMME_PHASES.map((p) => ({
        number: p.number,
        sortOrder: p.number,
        name: p.name,
        dayStart: defaultOverrideByNumber.get(p.number)?.dayStart ?? p.dayStart,
        dayEnd: defaultOverrideByNumber.get(p.number)?.dayEnd ?? p.dayEnd,
      })),
      ...customPhases.map((c) => ({ number: c.phaseNumber, sortOrder: c.sortOrder, name: c.name, dayStart: c.dayStart, dayEnd: c.dayEnd })),
    ].sort((a, b) => a.sortOrder - b.sortOrder);
    const effectivePhaseNumber = resolveEffectivePhaseNumber(entries, phaseNumber, skipPhaseNumbers);
    const targetPhase = entries.find((p) => p.number === effectivePhaseNumber);
    if (!targetPhase) {
      return NextResponse.json({ error: "phase_number does not match any configured phase" }, { status: 400 });
    }

    const { data: project, error: projectError } = await supabase
      .from("projects")
      .select("id, customer_id, programme_started_at, qstash_message_id, programme_duration_days, customers(company_name)")
      .eq("id", projectId)
      .single();
    if (projectError || !project) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }
    const companyName = (project.customers as unknown as { company_name: string } | null)?.company_name ?? "Customer";

    const today = new Date().toISOString().slice(0, 10);
    const wasStarted = !!project.programme_started_at;

    // Chat follow-up to task 244: backdates against the skip-compressed start day (an earlier
    // skipped phase's days never happened for this project, so they shouldn't count as
    // already-elapsed time) instead of targetPhase's own static dayStart — mirrors
    // seedAndStartProgramme's identical fix. Byte-identical to the old dayStart-based backdate
    // whenever nothing earlier is skipped.
    const backdateOffsetDays = createProgrammeCalendar({ durationDays: project.programme_duration_days, skipPhaseNumbers, phases: entries }).backdateOffsetDays(effectivePhaseNumber);

    if (!wasStarted) {
      const backdated = new Date();
      backdated.setDate(backdated.getDate() - backdateOffsetDays);

      const seedResult = await seedProgrammeAtPhase(
        { id: projectId, customer_id: project.customer_id },
        effectivePhaseNumber,
        backdated,
        note,
        project.programme_duration_days,
        skipPhaseNumbers,
        customPhases,
        defaultPhaseOverrides
      );
      if (seedResult.error) {
        console.error("PATCH /api/projects/[projectId]/programme/phase seed error:", seedResult.error);
        return NextResponse.json({ error: seedResult.error }, { status: 500 });
      }

      // This manual jump beat any scheduled QStash message to it — cancel the now-redundant
      // pending message (best-effort; the qstash-start route is idempotent regardless).
      if (project.qstash_message_id) {
        await cancelProjectAutostart(project.qstash_message_id);
        await supabase.from("projects").update({ qstash_message_id: null }).eq("id", projectId);
      }

      await sendCliqNotification(
        `${companyName}: manually tagged to start at Phase ${effectivePhaseNumber} (${targetPhase.name}).${note ? ` Note: ${note}` : ""}`,
        "pm"
      );

      const seeded = await loadProgramme(supabase, projectId);
      return NextResponse.json({ phases: toWire(seeded).phases });
    }

    // Already started — backdate programme_started_at so "today" lands inside the target phase's
    // day range (mirrors the not-started branch's own calculation), then re-status the phase rows.
    const backdated = new Date();
    backdated.setDate(backdated.getDate() - backdateOffsetDays);
    const { error: dateUpdateError } = await adminClient
      .from("projects")
      .update({ programme_started_at: backdated.toISOString() })
      .eq("id", projectId);
    if (dateUpdateError) {
      console.error("PATCH /api/projects/[projectId]/programme/phase already-started date backdate error:", dateUpdateError);
      return NextResponse.json({ error: "Failed to update programme start date" }, { status: 500 });
    }

    // Re-status by programme order (`position`), not phase_number — a project can have custom phases inserted anywhere. Reads the
    // project's actual seeded phases (defaults + customs) so a custom phase participates in this cascade too.
    const { data: phaseRows, error: existingPhasesError } = await supabase
      .from("project_phases")
      .select("id, phase_number, position, status")
      .eq("project_id", projectId)
      .eq("source", "programme");
    if (existingPhasesError || !phaseRows) {
      console.error("PATCH /api/projects/[projectId]/programme/phase existing-phases fetch error:", existingPhasesError);
      return NextResponse.json({ error: "Failed to load existing programme phases" }, { status: 500 });
    }
    const existingPhases = inProgrammeOrder(phaseRows);
    const target = existingPhases.find((p) => p.phase_number === phaseNumber);
    if (!target) {
      return NextResponse.json({ error: "phase_number does not match any phase of this project" }, { status: 400 });
    }
    const targetPosition = target.position ?? 0;
    // A phase permanently excluded (this call's skip set, or already `skipped` on the row) stays `skipped` wherever it sits relative
    // to the jump's target; an earlier-by-time phase is `bypassed` (passed over, keeps its days); a later one goes back to `planned`.
    const permanentSkipSet = new Set(skipPhaseNumbers);
    const nextStatus = (p: (typeof existingPhases)[number]): "skipped" | "bypassed" | "planned" =>
      (p.phase_number !== null && permanentSkipSet.has(p.phase_number)) || isPermanentlySkipped(p.status)
        ? "skipped"
        : (p.position ?? 0) < targetPosition
          ? "bypassed"
          : "planned";

    // Others first, target last: a partial unique index allows only one `active` programme phase per project.
    const others = existingPhases.filter((p) => p.id !== target.id && p.status !== "completed");
    const otherResults = await Promise.all(
      others.map((p) => {
        const status = nextStatus(p);
        return supabase.from("project_phases").update(status === "planned" ? { status, actual_start_date: null } : { status }).eq("id", p.id);
      })
    );
    const targetResult = otherResults.find((r) => r.error) ? null : await supabase.from("project_phases").update({ status: "active", actual_start_date: today }).eq("id", target.id);
    const failed = otherResults.find((r) => r.error) ?? targetResult;
    if (failed?.error) {
      console.error("PATCH /api/projects/[projectId]/programme/phase update error:", failed.error);
      return NextResponse.json({ error: "Failed to update programme phase" }, { status: 500 });
    }
    const stateRows = [
      { phase_id: target.id, is_manual_override: true, override_note: note },
      ...others.filter((p) => nextStatus(p) === "planned").map((p) => ({ phase_id: p.id, is_manual_override: false, override_note: null })),
    ];
    const { error: stateError } = await supabase.from("phase_programme_state").upsert(stateRows, { onConflict: "phase_id" });
    if (stateError) {
      console.error("PATCH /api/projects/[projectId]/programme/phase state error:", stateError);
      return NextResponse.json({ error: "Failed to update programme phase" }, { status: 500 });
    }

    // programme_started_at moved (backdated above) → every programme row's derived dates must follow (decision D-B).
    await rematerialiseProgrammeDates(supabase, projectId, backdated.toISOString());

    await sendCliqNotification(
      `${companyName}: manually jumped to Phase ${phaseNumber} (${targetPhase.name}).${note ? ` Note: ${note}` : ""}`,
      "pm"
    );

    const programme = await loadProgramme(supabase, projectId);
    return NextResponse.json({ phases: toWire(programme).phases });
  } catch (err) {
    console.error("PATCH /api/projects/[projectId]/programme/phase unexpected error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
