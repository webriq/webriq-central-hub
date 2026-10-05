import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { adminClient } from "@/lib/supabase/admin";
import { sendCliqNotification } from "@/lib/zoho";
import { notifyProjectMembers } from "@/lib/notifications";
import { PROGRAMME_PHASES } from "@/config/customer-phases";
import { loadProgrammeSummaries } from "@/lib/programme/store";
import { asReferenceDay, createProgrammeCalendar, currentDisplayDay } from "@/lib/programme/calendar";

const PAGE = 1000; // Supabase/PostgREST default response cap — see CLAUDE.md's pagination convention.

async function fetchAllPaginated<T>(
  query: (from: number, to: number) => Promise<{ data: T[] | null; error: unknown }>
): Promise<T[]> {
  const all: T[] = [];
  let from = 0;
  for (;;) {
    const { data, error } = await query(from, from + PAGE - 1);
    if (error) throw error;
    if (!data || data.length === 0) break;
    all.push(...data);
    if (data.length < PAGE) break;
    from += PAGE;
  }
  return all;
}

async function notifyOnce(
  projectId: string,
  customerId: string,
  key: string,
  message: string,
  channel: "pm" | "dev" = "pm",
  publicProjectId?: string,
  projectName?: string
): Promise<boolean> {
  const { error } = await adminClient.from("programme_notifications").insert({ project_id: projectId, customer_id: customerId, notification_key: key });
  if (error) return false; // unique violation (already sent) or a real DB error — either way, don't send
  await sendCliqNotification(message, channel);
  await notifyProjectMembers(projectId, {
    type: `programme_reminder_${key}`,
    title: "Programme update",
    body: projectName ? `${message} · ${projectName}` : message,
    url: publicProjectId ? `/projects/v2/${publicProjectId}` : undefined,
  });
  return true;
}

// Daily cron target (pg_cron -> pg_net, see migration 059). Secret-gated the same way /api/digest is.
// Project-scoped (task 123) — a customer can now run multiple simultaneous onboardings.
export async function POST(req: NextRequest) {
  const cronSecret = process.env.CRONJOB_SECRET_KEY;
  const incomingSecret = req.headers.get("x-cron-secret");
  const isCronCall = cronSecret && incomingSecret === cronSecret;

  if (!isCronCall) {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const projects = await fetchAllPaginated<{ id: string; project_id: string | null; name: string | null; customer_id: string; programme_started_at: string; programme_duration_days: number; customers: { company_name: string } | null }>(
      async (from, to) =>
        adminClient
          .from("projects")
          .select("id, project_id, name, customer_id, programme_started_at, programme_duration_days, customers(company_name)")
          .not("programme_started_at", "is", null)
          .range(from, to)
    );

    if (projects.length === 0) {
      return NextResponse.json({ processed: 0, sent: 0 });
    }

    const projectIds = projects.map((p) => p.id);
    // Task 429 (WP3): unified tables. Phases + deliverable day_end are stored display-scale (skip-compressed), so overdue/late checks
    // below no longer re-derive them from the static reference table.
    const summaries = await loadProgrammeSummaries(adminClient, projectIds);

    const phase1 = PROGRAMME_PHASES[0];
    let sent = 0;

    for (const project of projects) {
      const companyName = project.customers?.company_name ?? "Customer";
      const summary = summaries.get(project.id);
      const projectPhases = summary?.phases ?? [];
      const phaseStatus = new Map(projectPhases.map((p) => [p.phase_number, p.status]));
      const lastPhase = projectPhases[projectPhases.length - 1];
      if (lastPhase?.status === "completed") continue; // full programme already delivered

      const day = currentDisplayDay(project.programme_started_at);
      // Reference → display only (this cron has never skip-compressed; same numbers as before).
      const calendar = createProgrammeCalendar({ durationDays: project.programme_duration_days });
      const toDisplayDay = (referenceDay: number) => calendar.referenceToDisplay(asReferenceDay(referenceDay));
      const phase1Id = projectPhases.find((p) => p.phase_number === 1)?.id;
      const phase1Deliverables = new Map((summary?.deliverables ?? []).filter((d) => d.phase_id === phase1Id).map((d) => [d.deliverable_key, d]));

      // Phase-1-only deliverable due/overdue checks — skipped once phase 1 itself is done (an
      // early handover before Day 15 must not keep flagging its own deliverables as overdue).
      if (phaseStatus.get(1) !== "completed" && phaseStatus.get(1) !== "skipped" && phaseStatus.get(1) !== "bypassed") {
        for (const d of phase1.deliverables) {
          const stored = phase1Deliverables.get(d.key);
          if (stored?.status === "done") continue;
          const dEnd = stored?.day_end ?? toDisplayDay(d.dayEnd);
          const diff = dEnd - day;
          if (diff > 0 && diff <= 5) {
            if (await notifyOnce(project.id, project.customer_id, `due-${d.key}`, `${companyName}: due in ${diff} day${diff === 1 ? "" : "s"} — ${d.name}.`, "pm", project.project_id ?? undefined, project.name ?? undefined)) sent++;
          } else if (diff <= 0) {
            if (await notifyOnce(project.id, project.customer_id, `overdue-${d.key}`, `${companyName}: overdue — ${d.name} (was due Day ${dEnd}).`, "pm", project.project_id ?? undefined, project.name ?? undefined)) sent++;
          }
        }
      }

      // Calendar-only checks, independent of deliverable completion — cover all 5 phases. Reference
      // days (16/21/26/15/30) are scaled the same way phase/deliverable boundaries are above, so
      // these gates still land at the right relative point in a custom-duration programme.
      const day16 = toDisplayDay(16);
      const day21 = toDisplayDay(21);
      const day26 = toDisplayDay(26);
      const day15 = toDisplayDay(15);
      const day30 = toDisplayDay(30);
      if (day === day16) {
        if (await notifyOnce(project.id, project.customer_id, "day16-handover", `${companyName}: Day ${day16} — Phase 2 (Migrate & Rebrand) begins.`, "pm", project.project_id ?? undefined, project.name ?? undefined)) sent++;
      }
      if (day === day16 || day === day21 || day === day26) {
        if (await notifyOnce(project.id, project.customer_id, `dev5day-${day}`, `${companyName}: 5-day status check — please update your Phase 2 progress.`, "dev", project.project_id ?? undefined, project.name ?? undefined)) sent++;
      }
      if (day === day15) {
        if (await notifyOnce(project.id, project.customer_id, "gate15", `${companyName}: Day ${day15} gate — client sign-off due.`, "pm", project.project_id ?? undefined, project.name ?? undefined)) sent++;
      }
      if (day === day30) {
        if (await notifyOnce(project.id, project.customer_id, "gate30", `${companyName}: Day ${day30} gate — client approval due.`, "pm", project.project_id ?? undefined, project.name ?? undefined)) sent++;
      }
      for (const phase of projectPhases) {
        if (phase.phase_number === null || phase.day_end === null) continue;
        const phaseEnd = phase.day_end;
        if (day > phaseEnd && phase.status !== "completed" && phase.status !== "skipped" && phase.status !== "bypassed") {
          if (await notifyOnce(project.id, project.customer_id, `phase-late-${phase.phase_number}`, `${companyName}: Phase ${phase.phase_number} (${phase.name}) is running late — was due by Day ${phaseEnd}.`, "pm", project.project_id ?? undefined, project.name ?? undefined)) sent++;
        }
      }
    }

    return NextResponse.json({ processed: projects.length, sent });
  } catch (err) {
    console.error("POST /api/programme/reminders unexpected error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
