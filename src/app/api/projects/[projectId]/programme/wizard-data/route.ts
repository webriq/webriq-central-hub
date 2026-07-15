import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { adminClient } from "@/lib/supabase/admin";
import { upsertPrimaryContact } from "@/lib/customers/primary-contact";

const WRITE_ROLES = ["admin", "super_admin", "marketing"];

// Debounced autosave for the onboarding wizard's Kickoff / Storage-KB free-text fields, keyed by
// sub-phase (e.g. `{ kickoff: {...}, "storage-kb": {...} }`) and merged into the Phase 1 row's
// wizard_data JSONB — restructured from task 122's flat shape now that the wizard has 7 sub-phase
// steps instead of 5 generic ones.
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
      return NextResponse.json({ error: "Not permitted to update wizard data" }, { status: 403 });
    }

    const body = await request.json();
    const subPhaseKey = body?.subPhaseKey;
    if (typeof subPhaseKey !== "string" || !subPhaseKey) {
      return NextResponse.json({ error: "subPhaseKey is required" }, { status: 400 });
    }
    if (typeof body?.data !== "object" || body.data === null || Array.isArray(body.data)) {
      return NextResponse.json({ error: "data must be an object" }, { status: 400 });
    }

    const { projectId } = await params;

    const { data: existing, error: fetchError } = await supabase
      .from("customer_phases")
      .select("wizard_data")
      .eq("project_id", projectId)
      .eq("phase_number", 1)
      .single();
    if (fetchError || !existing) {
      return NextResponse.json({ error: "Programme not started for this project" }, { status: 404 });
    }

    const existingData = (existing.wizard_data as Record<string, unknown>) ?? {};
    const mergedSubPhase = { ...((existingData[subPhaseKey] as Record<string, unknown>) ?? {}), ...body.data };
    const mergedData = { ...existingData, [subPhaseKey]: mergedSubPhase };

    const { data, error } = await supabase
      .from("customer_phases")
      .update({ wizard_data: mergedData })
      .eq("project_id", projectId)
      .eq("phase_number", 1)
      .select("wizard_data")
      .single();

    if (error) {
      console.error("PATCH /api/projects/[projectId]/programme/wizard-data error:", error);
      return NextResponse.json({ error: "Failed to save wizard data" }, { status: 500 });
    }

    // Sync the Kickoff step's first (primary) contact into contacts.is_primary on every save
    // (task 129, retargeted to contacts by task 151) — non-fatal, the wizard-data save itself
    // must not fail because of it. Uses adminClient: marketing (a valid WRITE_ROLES value
    // above) isn't covered by contacts_pm_write RLS (admin|super_admin|pm only, migration 056).
    if (subPhaseKey === "kickoff") {
      const primaryContact = (mergedSubPhase.contacts as { fullName?: string; email?: string; phone?: string }[] | undefined)?.[0];
      if (primaryContact?.email) {
        try {
          const { data: projectRow } = await supabase
            .from("projects")
            .select("customer_id")
            .eq("id", projectId)
            .single();
          if (projectRow?.customer_id) {
            const { error: syncError } = await upsertPrimaryContact(adminClient, projectRow.customer_id, {
              name: primaryContact.fullName,
              email: primaryContact.email,
              phone: primaryContact.phone,
            });
            if (syncError) console.error("PATCH .../wizard-data primary contact sync error:", syncError);
          }
        } catch (syncErr) {
          console.error("PATCH .../wizard-data primary contact sync unexpected error:", syncErr);
        }
      }
    }

    return NextResponse.json(data);
  } catch (err) {
    console.error("PATCH /api/projects/[projectId]/programme/wizard-data unexpected error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
