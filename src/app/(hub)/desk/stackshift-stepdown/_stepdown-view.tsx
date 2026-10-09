"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { CheckCircle2, Loader2, ShieldAlert, XCircle } from "lucide-react";
import { Chip } from "../../dashboard/_components/dashboard-shared";
import { V2_ROUTES } from "@/config/constants";

export type SiteView = {
  site: string;
  signedAt: string;
  signedByName: string;
  inFlight: number | null;
  inFlightSample: { id: string; ticketNumber: number }[];
  unretiredPairs: number | null;
};

export type MissView = {
  deskTicketId: string;
  ticketNumber: string | null;
  subject: string;
  site: string | null;
  requesterEmail: string | null;
  firstSeenAt: string;
  lastSeenAt: string;
};

function fmt(iso: string) {
  return new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

export default function StepdownView({
  sites,
  misses,
  missCounts,
  setupNeeded,
  reconcileEnabled,
  notifyGlobal,
  notifySites,
}: {
  sites: SiteView[];
  misses: MissView[];
  missCounts: { open: number; imported: number; dismissed: number };
  setupNeeded: boolean;
  reconcileEnabled: boolean;
  notifyGlobal: boolean;
  notifySites: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);

  async function act(deskTicketId: string, action: "import" | "dismiss") {
    setBusy(`${action}:${deskTicketId}`);
    try {
      const res =
        action === "import"
          ? await fetch("/api/cron/desk-ticket-poll", {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({ importDeskTicketId: deskTicketId }),
            })
          : await fetch(`/api/desk/stackshift-stepdown/misses/${encodeURIComponent(deskTicketId)}/dismiss`, { method: "POST" });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(json.error ?? `${action} failed`);
        return;
      }
      toast.success(action === "import" ? "Imported into the Hub" : "Dismissed");
      router.refresh();
    } finally {
      setBusy(null);
    }
  }

  const card = "rounded-[14px] border border-[#E2E7F2] bg-white";

  return (
    <div className="mx-auto w-full max-w-350 px-6 py-6">
      <div className="mb-5">
        <h1 className="text-[20px] font-semibold text-[#0B1533]">StackShift Desk step-down</h1>
        <p className="mt-1 max-w-3xl text-[13px] text-[#5F6A88]">
          Everything here is inert until a site&apos;s parity gate is signed off and the operator switches reconcile mode on. Zoho Desk
          settings, cron changes and the duplicate cleanup are operator steps — see the runbook in <code>_docs/plan</code>.
        </p>
      </div>

      {setupNeeded ? (
        <div className={`${card} px-6 py-12 text-center`}>
          <ShieldAlert className="mx-auto mb-3 h-6 w-6 text-[#5F6A88]" aria-hidden />
          <p className="text-[14px] font-medium text-[#0B1533]">The step-down tables are not set up yet</p>
          <p className="mt-1 text-[13px] text-[#5F6A88]">Apply migrations 173 and 174 to enable this page.</p>
        </div>
      ) : (
        <>
          <div className={`${card} mb-5 grid gap-4 p-5 sm:grid-cols-3`}>
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.09em] text-[#5F6A88]">Reconcile mode</p>
              <p className="mt-1 flex items-center gap-1.5 text-[14px] text-[#0B1533]">
                {reconcileEnabled ? <CheckCircle2 className="h-4 w-4 text-[#177E48]" aria-hidden /> : <XCircle className="h-4 w-4 text-[#5F6A88]" aria-hidden />}
                {reconcileEnabled ? "Switched on" : "Off (normal ingestion)"}
              </p>
              <p className="mt-1 text-[12px] text-[#5F6A88]">
                <code>STACKSHIFT_DESK_RECONCILE_ENABLED</code> — applies only to signed-off sites.
              </p>
            </div>
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.09em] text-[#5F6A88]">Hub customer emails</p>
              <p className="mt-1 text-[14px] text-[#0B1533]">{notifyGlobal ? "All signed-off sites" : notifySites ? `Sites: ${notifySites}` : "Off"}</p>
              <p className="mt-1 text-[12px] text-[#5F6A88]">
                <code>STACKSHIFT_SUPPORT_NOTIFY_CUSTOMER</code> / <code>_SITES</code> — only for signed-off sites.
              </p>
            </div>
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.09em] text-[#5F6A88]">Misses</p>
              <p className="mt-1 text-[14px] text-[#0B1533]">
                {missCounts.open} open · {missCounts.imported} imported · {missCounts.dismissed} dismissed
              </p>
            </div>
          </div>

          <h2 className="mb-2 text-[14px] font-semibold text-[#0B1533]">Signed-off sites</h2>
          {sites.length === 0 ? (
            <div className={`${card} mb-6 px-6 py-10 text-center`}>
              <ShieldAlert className="mx-auto mb-3 h-6 w-6 text-[#5F6A88]" aria-hidden />
              <p className="text-[14px] font-medium text-[#0B1533]">No site has passed the parity gate</p>
              <p className="mt-1 text-[13px] text-[#5F6A88]">Until one does, nothing in the step-down can take effect.</p>
              <Link href={V2_ROUTES.DESK_STACKSHIFT_PARITY} className="mt-4 inline-block rounded-[8px] border border-[#E2E7F2] px-3 py-1.5 text-[12px] font-medium text-[#0B1533] transition-colors hover:bg-[#F0F7FF]">
                Open the parity report
              </Link>
            </div>
          ) : (
            <div className={`${card} mb-6 overflow-hidden`}>
              {sites.map((s) => (
                <div key={s.site} className="border-b border-[#EDF0F7] px-5 py-4 last:border-0">
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
                    <span className="font-mono text-[13px] text-[#0B1533]">{s.site}</span>
                    <span className="text-[12px] text-[#5F6A88]">
                      signed off by {s.signedByName} on {fmt(s.signedAt)}
                    </span>
                  </div>
                  <div className="mt-2 flex flex-wrap items-center gap-2 text-[13px] text-[#3A4565]">
                    <Chip tone={s.inFlight === 0 ? "ok" : "warn"}>{s.inFlight === null ? "in flight: unknown" : `${s.inFlight} Desk-only tickets still open`}</Chip>
                    <Chip tone={s.unretiredPairs === 0 ? "ok" : "neutral"}>{s.unretiredPairs === null ? "pairs: unknown" : `${s.unretiredPairs} duplicate pairs not retired`}</Chip>
                    {s.inFlightSample.map((t) => (
                      <Link key={t.id} href={`/desk/inbox/${t.id}`} className="font-mono text-[12px] text-[#0063D6] hover:underline">
                        #{t.ticketNumber}
                      </Link>
                    ))}
                  </div>
                  <p className="mt-2 text-[12px] text-[#5F6A88]">
                    Unscheduling the Desk poll (step 6 of the runbook) is refused while Desk-only tickets are still open.
                  </p>
                </div>
              ))}
            </div>
          )}

          <h2 className="mb-2 text-[14px] font-semibold text-[#0B1533]">Open misses</h2>
          {misses.length === 0 ? (
            <div className={`${card} px-6 py-10 text-center`}>
              <CheckCircle2 className="mx-auto mb-3 h-6 w-6 text-[#177E48]" aria-hidden />
              <p className="text-[14px] font-medium text-[#0B1533]">No misses</p>
              <p className="mt-1 text-[13px] text-[#5F6A88]">A miss is a StackShift ticket in Zoho Desk that never reached the Hub.</p>
            </div>
          ) : (
            <div className={`${card} overflow-hidden`}>
              {misses.map((m) => (
                <div key={m.deskTicketId} className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-[#EDF0F7] px-5 py-3 last:border-0">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[13px] text-[#0B1533]" title={m.subject}>
                      <span className="mr-2 font-mono text-[12px] text-[#5F6A88]">Desk {m.ticketNumber ?? m.deskTicketId}</span>
                      {m.subject}
                    </p>
                    <p className="text-[12px] text-[#5F6A88]">
                      {m.site ?? "unknown site"} · {m.requesterEmail ?? "no requester"} · first seen {fmt(m.firstSeenAt)}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => act(m.deskTicketId, "import")}
                    disabled={busy !== null}
                    className="inline-flex items-center gap-1.5 rounded-[8px] bg-[#0B1533] px-3 py-1.5 text-[12px] font-medium text-white transition-colors hover:bg-[#1B2A57] disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {busy === `import:${m.deskTicketId}` && <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />}
                    {busy === `import:${m.deskTicketId}` ? "Importing…" : "Import into Hub"}
                  </button>
                  <button
                    type="button"
                    onClick={() => act(m.deskTicketId, "dismiss")}
                    disabled={busy !== null}
                    className="inline-flex items-center gap-1.5 rounded-[8px] border border-[#E2E7F2] bg-white px-3 py-1.5 text-[12px] font-medium text-[#0B1533] transition-colors hover:bg-[#F0F7FF] disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {busy === `dismiss:${m.deskTicketId}` && <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />}
                    {busy === `dismiss:${m.deskTicketId}` ? "Dismissing…" : "Dismiss"}
                  </button>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
