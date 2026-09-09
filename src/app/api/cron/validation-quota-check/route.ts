import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { adminClient } from "@/lib/supabase/admin";
import { sendCliqNotification } from "@/lib/zoho";

// Task 353 — monthly Abstract-quota watch. Sums `validation_logs.abstract_calls` per product
// for the current calendar month and Cliq-alerts when any product crosses the threshold.
// Cron-gated the same way /api/digest is (x-cron-secret header OR an authenticated session).

const PAGE = 1000; // PostgREST default cap — see CLAUDE.md pagination convention.
const FREE_TIER_LIMIT = Number(process.env.ABSTRACT_FREE_TIER_LIMIT ?? "100");
const ALERT_RATIO = 0.8;

type Product = "email_reputation" | "phone_intelligence";
const PRODUCTS: Product[] = ["email_reputation", "phone_intelligence"];

export async function GET(req: NextRequest) {
  const cronSecret = process.env.CRONJOB_SECRET_KEY;
  const incomingSecret = req.headers.get("x-cron-secret");
  const isCronCall = cronSecret && incomingSecret === cronSecret;

  if (!isCronCall) {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const monthStart = new Date();
  monthStart.setUTCDate(1);
  monthStart.setUTCHours(0, 0, 0, 0);

  const usage: Record<Product, number> = {
    email_reputation: 0,
    phone_intelligence: 0,
  };

  let from = 0;
  for (;;) {
    const { data, error } = await adminClient
      .from("validation_logs")
      .select("abstract_calls")
      .gte("created_at", monthStart.toISOString())
      .range(from, from + PAGE - 1);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    if (!data || data.length === 0) break;

    for (const row of data) {
      const calls = (row.abstract_calls ?? {}) as Partial<Record<Product, number>>;
      for (const p of PRODUCTS) usage[p] += Number(calls[p] ?? 0);
    }
    if (data.length < PAGE) break;
    from += PAGE;
  }

  const breached = PRODUCTS.filter((p) => usage[p] >= FREE_TIER_LIMIT * ALERT_RATIO);

  if (breached.length > 0) {
    const lines = breached
      .map((p) => `• ${p}: ${usage[p]} / ${FREE_TIER_LIMIT} this month`)
      .join("\n");
    await sendCliqNotification(
      `⚠️ Abstract validation quota at ${Math.round(ALERT_RATIO * 100)}%+ for:\n${lines}\nConsider upgrading the plan before submissions start failing open.`,
      "dev"
    );
  }

  return NextResponse.json({
    month: monthStart.toISOString().slice(0, 7),
    freeTierLimit: FREE_TIER_LIMIT,
    usage,
    alerted: breached,
  });
}
