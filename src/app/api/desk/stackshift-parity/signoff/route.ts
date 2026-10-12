import { after, NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import type { Json } from "@/types/database";
import { createClient } from "@/lib/supabase/server";
import { adminClient } from "@/lib/supabase/admin";
import { createNotification } from "@/lib/notifications";
import { buildReport } from "@/lib/stackshift-support/parity";
import { ackableTicketIds, evaluateOverall, normSite } from "@/lib/stackshift-support/parity-logic";

// Task 449 — records the explicit, human sign-off of the StackShift parity gate. Nothing calls this
// automatically: it needs an admin/super_admin session, the typed site name, every manual attestation, and a
// report that the SERVER recomputes and finds PASS (the client's view of the report is never trusted).
// Task 450 reads the latest non-revoked row as its precondition. Same session + adminClient role-check shape as
// the other Desk admin routes.
const bodySchema = z
  .object({
    site: z.string().trim().min(1).max(200),
    fromIso: z.string().datetime({ offset: true }),
    toIso: z.string().datetime({ offset: true }),
    confirmSite: z.string().trim().min(1).max(200),
    note: z.string().trim().max(2000).optional(),
    attestations: z
      .object({ supportCenterVerified: z.literal(true), rollbackRehearsed: z.literal(true), ownerApproved: z.literal(true) })
      .strict(),
    acknowledgements: z.array(z.object({ ticketId: z.string().uuid(), reason: z.string().trim().min(3).max(500) }).strict()).max(200).default([]),
  })
  .strict();

const SNAPSHOT_ITEM_CAP = 200;

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: profile } = await adminClient.from("profiles").select("role, full_name").eq("id", user.id).maybeSingle();
  if (!["admin", "super_admin"].includes(profile?.role ?? "")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid request", details: parsed.error.flatten() }, { status: 400 });
  const body = parsed.data;

  if (normSite(body.confirmSite) !== normSite(body.site)) {
    return NextResponse.json({ error: "The typed site name does not match" }, { status: 400 });
  }

  const report = await buildReport(body.site, Date.parse(body.fromIso), Date.parse(body.toIso));
  if (report.clamped || report.truncated) {
    return NextResponse.json({ error: "The report is incomplete (window clamped or ticket cap hit); narrow the window." }, { status: 409 });
  }

  // Acknowledgements may only name tickets that actually fail check (d).
  const dCheck = report.checks.find((c) => c.id === "d");
  const allowed = dCheck ? ackableTicketIds(dCheck) : new Set<string>();
  const stray = body.acknowledgements.filter((a) => !allowed.has(a.ticketId));
  if (stray.length > 0) {
    return NextResponse.json({ error: "Acknowledgements may only name tickets that fail the status check", tickets: stray.map((s) => s.ticketId) }, { status: 400 });
  }

  const verdict = evaluateOverall(report.checks, report.thresholds, body.acknowledgements);
  if (!verdict.pass) {
    return NextResponse.json({ error: "The parity gate does not pass", blockers: verdict.blockers }, { status: 409 });
  }

  const snapshot = {
    ...report,
    checks: report.checks.map((c) => ({ ...c, items: c.items.slice(0, SNAPSHOT_ITEM_CAP) })),
  };
  const { data, error } = await adminClient
    .from("stackshift_parity_signoff")
    .insert({
      site: normSite(body.site),
      window_from: report.fromIso,
      window_to: report.toIso,
      ticket_count: report.counts.desk,
      report: snapshot as unknown as Json,
      acknowledgements: body.acknowledgements as unknown as Json,
      attestations: body.attestations as unknown as Json,
      note: body.note || null,
      signed_by: user.id,
    })
    .select("id")
    .single();
  if (error || !data) {
    console.error("[api/desk/stackshift-parity/signoff] insert failed:", error?.message);
    return NextResponse.json({ error: "Failed to record the sign-off" }, { status: 500 });
  }

  // Tell the other admins that the gate was signed — the sign-off is meant to be visible, not quiet.
  after(async () => {
    const { data: admins } = await adminClient.from("profiles").select("id").in("role", ["admin", "super_admin"]);
    await Promise.all(
      (admins ?? []).filter((a) => a.id !== user.id).map((a) =>
        createNotification(a.id, {
          type: "stackshift_parity_signoff",
          title: "StackShift parity gate signed off",
          body: `${profile?.full_name ?? "An admin"} signed off the parity gate for ${normSite(body.site)}.`,
          url: "/desk/stackshift-parity",
          actorId: user.id,
        }),
      ),
    );
  });

  return NextResponse.json({ ok: true, id: data.id });
}
