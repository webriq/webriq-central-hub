import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { adminClient } from "@/lib/supabase/admin";
import { sendCliqNotification } from "@/lib/zoho";
import { notifyProjectMembers } from "@/lib/notifications";
import { getPhaseByNumber } from "@/config/customer-phases";

const WRITE_ROLES = ["admin", "super_admin", "marketing"];

// Explicit "Complete Phase N & notify [next owner]" action — e.g. the onboarding wizard's
// Sign-off step. On Phase 1 completion this also sets `projects.onboarding_visible_at`,
// handing the project (and its customer, if this was the customer's only hidden project)
// over into the default PM/staff view for the first time.
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { data: profile } = await supabase.from("profiles").select("role, full_name").eq("id", user.id).maybeSingle();
    if (!profile?.role || !WRITE_ROLES.includes(profile.role)) {
      return NextResponse.json({ error: "Not permitted to complete a programme phase" }, { status: 403 });
    }
    const actorName = profile.full_name ?? "Someone";

    const body = await request.json();
    const phaseNumber = Number(body?.phase_number);
    if (!Number.isInteger(phaseNumber) || phaseNumber < 1 || phaseNumber > 5) {
      return NextResponse.json({ error: "phase_number must be an integer between 1 and 5" }, { status: 400 });
    }

    const { projectId } = await params;

    const { data: project, error: projectError } = await supabase
      .from("projects")
      .select("id, project_id, name, customer_id, customers(company_name)")
      .eq("id", projectId)
      .single();
    if (projectError || !project) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }
    const companyName = (project.customers as unknown as { company_name: string } | null)?.company_name ?? "Customer";

    const today = new Date().toISOString().slice(0, 10);
    const currentPhase = getPhaseByNumber(phaseNumber);
    const nextPhaseNumber = phaseNumber < 5 ? phaseNumber + 1 : null;

    const { error: completeError } = await supabase
      .from("customer_phases")
      .update({ status: "completed", actual_completed_date: today })
      .eq("project_id", projectId)
      .eq("phase_number", phaseNumber);
    if (completeError) {
      console.error("POST .../complete-phase complete error:", completeError);
      return NextResponse.json({ error: "Failed to complete phase" }, { status: 500 });
    }

    if (phaseNumber === 1) {
      const { error: visibilityError } = await adminClient
        .from("projects")
        .update({ onboarding_visible_at: new Date().toISOString() })
        .eq("id", projectId);
      if (visibilityError) {
        console.error("POST .../complete-phase visibility error:", visibilityError);
        return NextResponse.json({ error: "Failed to hand over project visibility" }, { status: 500 });
      }

      // Hand-off: write the Kickoff step's manually-entered contacts into the `contacts` table
      // (task 129). Non-fatal — must not block the phase-completion response. Uses adminClient:
      // contacts_pm_write RLS covers admin|super_admin|pm, not marketing (Bert's role).
      try {
        const { data: phaseRow } = await adminClient
          .from("customer_phases")
          .select("wizard_data")
          .eq("project_id", projectId)
          .eq("phase_number", 1)
          .maybeSingle();
        const kickoffContacts = (
          (phaseRow?.wizard_data as Record<string, unknown> | null)?.kickoff as { contacts?: unknown } | undefined
        )?.contacts as { fullName?: string; position?: string; email?: string; phone?: string; socialMedia?: string }[] | undefined;

        if (project.customer_id && kickoffContacts?.length) {
          // Dedupe against contacts.email (task 151) — the primary contact (index 0) will
          // already exist by hand-off time via the Kickoff autosave sync in wizard-data/route.ts,
          // so re-inserting it here would create a duplicate row.
          const { data: existingContacts } = await adminClient
            .from("contacts")
            .select("email")
            .eq("customer_id", project.customer_id)
            .not("email", "is", null);
          const existingEmails = new Set((existingContacts ?? []).map((c) => c.email!.trim().toLowerCase()));

          const contactRows = kickoffContacts
            .filter((c) => c.email && !existingEmails.has(c.email.trim().toLowerCase()))
            .map((c) => {
              const nameParts = (c.fullName ?? "").trim().split(/\s+/);
              const firstName = nameParts[0] || null;
              const lastName = nameParts.length > 1 ? nameParts.slice(1).join(" ") : null;
              return {
                customer_id: project.customer_id,
                external_id: null,
                match_method: "manual" as const,
                first_name: firstName,
                last_name: lastName,
                email: c.email,
                phone: c.phone || null,
                title: c.position || null,
                source_meta: c.socialMedia ? { social_media_accounts: c.socialMedia } : {},
              };
            });
          if (contactRows.length > 0) {
            const { error: contactsInsertError } = await adminClient.from("contacts").insert(contactRows);
            if (contactsInsertError) console.error("POST .../complete-phase kickoff contacts insert error:", contactsInsertError);
          }
        }
      } catch (contactsErr) {
        console.error("POST .../complete-phase kickoff contacts unexpected error:", contactsErr);
      }
    }

    if (nextPhaseNumber) {
      const { error: advanceError } = await supabase
        .from("customer_phases")
        .update({ status: "active", actual_start_date: today })
        .eq("project_id", projectId)
        .eq("phase_number", nextPhaseNumber);
      if (advanceError) {
        console.error("POST .../complete-phase advance error:", advanceError);
        return NextResponse.json({ error: "Failed to advance to next phase" }, { status: 500 });
      }
      const nextPhase = getPhaseByNumber(nextPhaseNumber);
      const handoffMessage = `${companyName}: Phase ${phaseNumber} (${currentPhase.name}) complete — handed over to Phase ${nextPhaseNumber}: ${nextPhase.name} (owner: ${nextPhase.owner}).`;
      await sendCliqNotification(handoffMessage, "pm");
      await notifyProjectMembers(projectId, {
        type: "programme_phase_complete",
        title: "Programme phase complete",
        body: `${actorName} completed Phase ${phaseNumber} (${currentPhase.name}) — handed over to ${nextPhase.name}${project.name ? ` · ${project.name}` : ""}.`,
        url: project.project_id ? `/v2/portfolio-tracker/${project.project_id}` : undefined,
        actorId: user.id,
      });
    } else {
      const completeMessage = `${companyName}: 120-Day Programme complete — all 5 phases delivered.`;
      await sendCliqNotification(completeMessage, "pm");
      await notifyProjectMembers(projectId, {
        type: "programme_complete",
        title: "120-Day Programme complete",
        body: `${actorName} completed the final phase — all 5 phases delivered${project.name ? ` · ${project.name}` : ""}.`,
        url: project.project_id ? `/v2/portfolio-tracker/${project.project_id}` : undefined,
        actorId: user.id,
      });
    }

    const { data: phases } = await supabase.from("customer_phases").select("*").eq("project_id", projectId).order("phase_number");
    return NextResponse.json({ phases: phases ?? [] });
  } catch (err) {
    console.error("POST /api/projects/[projectId]/programme/complete-phase unexpected error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
