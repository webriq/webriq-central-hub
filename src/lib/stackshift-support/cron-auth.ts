import { timingSafeEqual } from "crypto";
import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { adminClient } from "@/lib/supabase/admin";

// Auth for the StackShift cron routes (outbox dispatcher, alerts, Desk poll): either pg_cron's `x-cron-secret`
// (timing-safe) or a signed-in STAFF user. The older cron routes accept ANY session, which would let a
// `client`-role user trigger dispatch runs, admin alerts or Zoho Desk polls (task 450 review) — these must not.
const STAFF_ROLES = ["admin", "super_admin", "pm"];

function secretMatches(provided: string | null, expected: string | undefined): boolean {
  if (!provided || !expected) return false;
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function authorizeCronOrStaff(req: NextRequest): Promise<{ denied: NextResponse } | { isCron: boolean }> {
  if (secretMatches(req.headers.get("x-cron-secret"), process.env.CRONJOB_SECRET_KEY)) return { isCron: true };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { denied: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };

  const { data: profile } = await adminClient.from("profiles").select("role").eq("id", user.id).maybeSingle();
  if (!STAFF_ROLES.includes(profile?.role ?? "")) return { denied: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  return { isCron: false };
}
