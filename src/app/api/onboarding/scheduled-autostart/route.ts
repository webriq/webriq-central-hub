import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { adminClient } from "@/lib/supabase/admin";
import { seedAndStartProgramme } from "@/lib/programme/seed";

// Frequent-interval cron target (pg_cron -> pg_net, every 15 min — see migration 060). Finds
// projects whose "Set Schedule" time has passed and runs the exact same start logic as the
// manual "Start Onboarding" button. Secret-gated the same way /api/digest and
// /api/programme/reminders are.
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
    const { data: dueProjects, error } = await adminClient
      .from("projects")
      .select("id, customer_id, programme_started_at, scheduled_onboarding_start_at, customers(company_name)")
      .not("scheduled_onboarding_start_at", "is", null)
      .is("programme_started_at", null)
      .lte("scheduled_onboarding_start_at", new Date().toISOString());

    if (error) {
      console.error("POST /api/onboarding/scheduled-autostart query error:", error);
      return NextResponse.json({ error: "Failed to query due projects" }, { status: 500 });
    }

    let started = 0;
    for (const project of dueProjects ?? []) {
      const companyName = (project.customers as unknown as { company_name: string } | null)?.company_name ?? "Customer";
      const result = await seedAndStartProgramme({ id: project.id, customer_id: project.customer_id }, companyName);
      if (!result.error) started++;
    }

    return NextResponse.json({ due: dueProjects?.length ?? 0, started });
  } catch (err) {
    console.error("POST /api/onboarding/scheduled-autostart unexpected error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
