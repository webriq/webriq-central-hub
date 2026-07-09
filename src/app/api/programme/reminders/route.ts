import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { adminClient } from "@/lib/supabase/admin";
import { sendCliqNotification } from "@/lib/zoho";
import { PROGRAMME_PHASES, getCurrentProgrammeDay } from "@/config/customer-phases";

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

async function notifyOnce(projectId: string, customerId: string, key: string, message: string, channel: "pm" | "dev" = "pm"): Promise<boolean> {
  const { error } = await adminClient.from("programme_notifications").insert({ project_id: projectId, customer_id: customerId, notification_key: key });
  if (error) return false; // unique violation (already sent) or a real DB error — either way, don't send
  await sendCliqNotification(message, channel);
  return true;
}

// Daily cron target (pg_cron -> pg_net, see migration 059). Secret-gated the same way /api/digest is.
// Project-scoped (task 123) — a customer can now run multiple simultaneous onboardings.
export async function POST(req: NextRequest) {
  const digestSecret = process.env.DIGEST_SECRET;
  const incomingSecret = req.headers.get("x-digest-secret");
  const isCronCall = digestSecret && incomingSecret === digestSecret;

  if (!isCronCall) {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const projects = await fetchAllPaginated<{ id: string; customer_id: string; programme_started_at: string; customers: { company_name: string } | null }>(
      async (from, to) =>
        adminClient
          .from("projects")
          .select("id, customer_id, programme_started_at, customers(company_name)")
          .not("programme_started_at", "is", null)
          .range(from, to)
    );

    if (projects.length === 0) {
      return NextResponse.json({ processed: 0, sent: 0 });
    }

    const projectIds = projects.map((p) => p.id);
    const [phases, phase1Deliverables] = await Promise.all([
      fetchAllPaginated<{ project_id: string; phase_number: number; status: string }>(async (from, to) =>
        adminClient.from("customer_phases").select("project_id, phase_number, status").in("project_id", projectIds).range(from, to)
      ),
      fetchAllPaginated<{ project_id: string; deliverable_key: string; status: string }>(async (from, to) =>
        adminClient
          .from("customer_deliverables")
          .select("project_id, deliverable_key, status")
          .in("project_id", projectIds)
          .eq("phase_number", 1)
          .range(from, to)
      ),
    ]);

    const phaseStatusByProject = new Map<string, Map<number, string>>();
    for (const p of phases) {
      const m = phaseStatusByProject.get(p.project_id) ?? new Map<number, string>();
      m.set(p.phase_number, p.status);
      phaseStatusByProject.set(p.project_id, m);
    }
    const deliverableStatusByProject = new Map<string, Map<string, string>>();
    for (const d of phase1Deliverables) {
      const m = deliverableStatusByProject.get(d.project_id) ?? new Map<string, string>();
      m.set(d.deliverable_key, d.status);
      deliverableStatusByProject.set(d.project_id, m);
    }

    const phase1 = PROGRAMME_PHASES[0];
    let sent = 0;

    for (const project of projects) {
      const companyName = project.customers?.company_name ?? "Customer";
      const phaseStatus = phaseStatusByProject.get(project.id) ?? new Map<number, string>();
      if (phaseStatus.get(5) === "completed") continue; // full programme already delivered

      const day = getCurrentProgrammeDay(project.programme_started_at);
      const deliverableStatus = deliverableStatusByProject.get(project.id) ?? new Map<string, string>();

      // Phase-1-only deliverable due/overdue checks — skipped once phase 1 itself is done (an
      // early handover before Day 15 must not keep flagging its own deliverables as overdue).
      if (phaseStatus.get(1) !== "completed" && phaseStatus.get(1) !== "skipped") {
        for (const d of phase1.deliverables) {
          if (deliverableStatus.get(d.key) === "done") continue;
          const diff = d.dayEnd - day;
          if (diff > 0 && diff <= 5) {
            if (await notifyOnce(project.id, project.customer_id, `due-${d.key}`, `${companyName}: due in ${diff} day${diff === 1 ? "" : "s"} — ${d.name}.`)) sent++;
          } else if (diff <= 0) {
            if (await notifyOnce(project.id, project.customer_id, `overdue-${d.key}`, `${companyName}: overdue — ${d.name} (was due Day ${d.dayEnd}).`)) sent++;
          }
        }
      }

      // Calendar-only checks, independent of deliverable completion — cover all 5 phases.
      if (day === 16) {
        if (await notifyOnce(project.id, project.customer_id, "day16-handover", `${companyName}: Day 16 — Phase 2 (Migrate & Rebrand) begins.`)) sent++;
      }
      if (day === 16 || day === 21 || day === 26) {
        if (await notifyOnce(project.id, project.customer_id, `dev5day-${day}`, `${companyName}: 5-day status check — please update your Phase 2 progress.`, "dev")) sent++;
      }
      if (day === 15) {
        if (await notifyOnce(project.id, project.customer_id, "gate15", `${companyName}: Day 15 gate — client sign-off due.`)) sent++;
      }
      if (day === 30) {
        if (await notifyOnce(project.id, project.customer_id, "gate30", `${companyName}: Day 30 gate — client approval due.`)) sent++;
      }
      for (const phase of PROGRAMME_PHASES) {
        const status = phaseStatus.get(phase.number);
        if (day > phase.dayEnd && status !== "completed" && status !== "skipped") {
          if (await notifyOnce(project.id, project.customer_id, `phase-late-${phase.number}`, `${companyName}: Phase ${phase.number} (${phase.name}) is running late — was due by Day ${phase.dayEnd}.`)) sent++;
        }
      }
    }

    return NextResponse.json({ processed: projects.length, sent });
  } catch (err) {
    console.error("POST /api/programme/reminders unexpected error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
