"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { AlertTriangle, CheckCircle2, ChevronDown, Loader2, ShieldCheck, XCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { Chip } from "../../dashboard/_components/dashboard-shared";
import type { ParityReport } from "@/lib/stackshift-support/parity";
import { MIN_TICKETS, MIN_WINDOW_DAYS, evaluateOverall, type Ack } from "@/lib/stackshift-support/parity-logic";

export type SignoffView = {
  id: string;
  signedAt: string;
  signedByName: string;
  windowFrom: string;
  windowTo: string;
  ticketCount: number;
  note: string | null;
  revokedAt: string | null;
  revokeReason: string | null;
  acknowledgementCount: number;
};

const ATTESTATIONS = [
  { key: "supportCenterVerified", label: "I compared the Support Center list and 5 random threads against Desk for this site." },
  { key: "rollbackRehearsed", label: "Rollback was rehearsed: flag off returns the Support Center to Desk with no data loss." },
  { key: "ownerApproved", label: "I am the Hub owner (or have their written approval) to proceed to the Desk step-down." },
] as const;
type AttestationKey = (typeof ATTESTATIONS)[number]["key"];

function fmtDate(iso: string) {
  return new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

export default function ParityView({
  sites,
  site,
  fromDay,
  toDay,
  report,
  signoff,
  setupError,
  reportError,
}: {
  sites: { site: string; tickets: number; firstAt: string }[];
  site: string | null;
  fromDay: string;
  toDay: string;
  report: ParityReport | null;
  signoff: SignoffView | null;
  setupError: string | null;
  reportError: string | null;
}) {
  const router = useRouter();
  const [siteInput, setSiteInput] = useState(site ?? "");
  const [from, setFrom] = useState(fromDay);
  const [to, setTo] = useState(toDay);
  const [openCheck, setOpenCheck] = useState<string | null>(null);

  // Sign-off form state
  const [acks, setAcks] = useState<Record<string, string>>({}); // ticketId -> reason (present = accepted)
  const [attest, setAttest] = useState<Record<AttestationKey, boolean>>({ supportCenterVerified: false, rollbackRehearsed: false, ownerApproved: false });
  const [note, setNote] = useState("");
  const [confirmSite, setConfirmSite] = useState("");
  const [signing, setSigning] = useState(false);
  const [revokeReason, setRevokeReason] = useState("");
  const [revoking, setRevoking] = useState(false);

  const ackList: Ack[] = useMemo(() => Object.entries(acks).map(([ticketId, reason]) => ({ ticketId, reason })), [acks]);
  const verdict = useMemo(() => (report ? evaluateOverall(report.checks, report.thresholds, ackList) : null), [report, ackList]);
  const allAttested = ATTESTATIONS.every((a) => attest[a.key]);
  const complete = !!report && !report.clamped && !report.truncated;
  const canSign =
    !!report && !!verdict?.pass && complete && allAttested && confirmSite.trim().toLowerCase() === report.site && !signing &&
    ackList.every((a) => a.reason.trim().length >= 3);
  const activeSignoff = signoff && !signoff.revokedAt;

  function run() {
    const p = new URLSearchParams();
    if (siteInput) p.set("site", siteInput);
    if (from) p.set("from", from);
    if (to) p.set("to", to);
    router.push(`?${p.toString()}`);
  }

  async function sign() {
    if (!report) return;
    setSigning(true);
    try {
      const res = await fetch("/api/desk/stackshift-parity/signoff", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          site: report.site,
          fromIso: report.fromIso,
          toIso: report.toIso,
          confirmSite,
          note: note || undefined,
          attestations: attest,
          acknowledgements: ackList.filter((a) => a.reason.trim().length >= 3),
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(json.blockers?.[0] ?? json.error ?? "Sign-off failed");
        return;
      }
      toast.success("Parity gate signed off");
      router.refresh();
    } finally {
      setSigning(false);
    }
  }

  async function revoke() {
    if (!signoff) return;
    setRevoking(true);
    try {
      const res = await fetch(`/api/desk/stackshift-parity/signoff/${signoff.id}/revoke`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ reason: revokeReason }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(json.error ?? "Revoke failed");
        return;
      }
      toast.success("Sign-off revoked");
      setRevokeReason("");
      router.refresh();
    } finally {
      setRevoking(false);
    }
  }

  const input = "rounded-[8px] border border-[#E2E7F2] bg-white px-3 py-2 text-[13px] text-[#0B1533] focus-visible:outline-2 focus-visible:outline-[#007BFF]";

  return (
    <div className="mx-auto w-full max-w-350 px-6 py-6">
      <div className="mb-5">
        <h1 className="text-[20px] font-semibold text-[#0B1533]">StackShift parity gate</h1>
        <p className="mt-1 max-w-3xl text-[13px] text-[#5F6A88]">
          Evidence that the direct StackShift → Hub path matches the Zoho Desk copy. Nothing here changes a ticket, and the Desk
          step-down (task 450) stays blocked until this gate passes and is signed off below.
        </p>
      </div>

      {setupError ? (
        <div className="rounded-[14px] border border-[#E2E7F2] bg-white px-6 py-12 text-center">
          <ShieldCheck className="mx-auto mb-3 h-6 w-6 text-[#5F6A88]" aria-hidden />
          <p className="text-[14px] font-medium text-[#0B1533]">The parity report is not set up yet</p>
          <p className="mt-1 text-[13px] text-[#5F6A88]">Apply migrations 169–173 to enable it.</p>
        </div>
      ) : sites.length === 0 ? (
        <div className="rounded-[14px] border border-[#E2E7F2] bg-white px-6 py-12 text-center">
          <ShieldCheck className="mx-auto mb-3 h-6 w-6 text-[#5F6A88]" aria-hidden />
          <p className="text-[14px] font-medium text-[#0B1533]">No direct StackShift tickets yet</p>
          <p className="mt-1 text-[13px] text-[#5F6A88]">Enable dual-write on a pilot site; its tickets appear here as soon as the Hub receives them.</p>
        </div>
      ) : (
        <>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              run();
            }}
            className="mb-5 flex flex-wrap items-end gap-3 rounded-[14px] border border-[#E2E7F2] bg-white p-4"
          >
            <label className="flex flex-col gap-1 text-[11px] font-semibold uppercase tracking-[0.09em] text-[#5F6A88]">
              Site
              <select value={siteInput} onChange={(e) => setSiteInput(e.target.value)} className={cn(input, "min-w-64 normal-case tracking-normal")}>
                {sites.map((s) => (
                  <option key={s.site} value={s.site}>
                    {s.site} ({s.tickets} direct)
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-[11px] font-semibold uppercase tracking-[0.09em] text-[#5F6A88]">
              From (UTC)
              <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className={input} />
            </label>
            <label className="flex flex-col gap-1 text-[11px] font-semibold uppercase tracking-[0.09em] text-[#5F6A88]">
              To (UTC)
              <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className={input} />
            </label>
            <button type="submit" className="rounded-[8px] bg-[#0B1533] px-4 py-2 text-[13px] font-medium text-white transition-colors hover:bg-[#1B2A57]">
              Run report
            </button>
          </form>

          {reportError && <div className="mb-5 rounded-[10px] border border-[#F4C7C3] bg-[#FDE8E6] px-4 py-3 text-[13px] text-[#C0392B]">{reportError}</div>}

          {report && verdict && (
            <>
              {(report.clamped || report.truncated) && (
                <div className="mb-4 flex items-start gap-2 rounded-[10px] border border-[#F3D9A4] bg-[#FFF8E6] px-4 py-3 text-[13px] text-[#8A5A00]">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
                  <span>
                    {report.clamped && "The window was longer than 90 days and was shortened to its most recent 90. "}
                    {report.truncated && "More than 2,000 tickets matched; only the newest were compared. "}
                    An incomplete report cannot be signed off. Narrow the window.
                  </span>
                </div>
              )}

              <div className={cn("mb-5 rounded-[14px] border px-5 py-4", verdict.pass ? "border-[#BFE3CC] bg-[#E3F5EA]" : "border-[#E2E7F2] bg-white")}>
                <div className="flex items-center gap-2">
                  {verdict.pass ? <CheckCircle2 className="h-5 w-5 text-[#177E48]" aria-hidden /> : <XCircle className="h-5 w-5 text-[#C0392B]" aria-hidden />}
                  <p className="text-[15px] font-semibold text-[#0B1533]">{verdict.pass ? "Ready for sign-off" : "Not ready for sign-off"}</p>
                </div>
                {!verdict.pass && (
                  <ul className="mt-2 list-disc space-y-0.5 pl-6 text-[13px] text-[#3A4565]">
                    {verdict.blockers.map((b) => (
                      <li key={b}>{b}</li>
                    ))}
                  </ul>
                )}
                <div className="mt-3 flex flex-wrap gap-x-6 gap-y-1 text-[12px] text-[#5F6A88]">
                  <span>
                    Window: {report.thresholds.windowDays.toFixed(1)} / {MIN_WINDOW_DAYS} days
                  </span>
                  <span>
                    Desk tickets: {report.thresholds.tickets} / {MIN_TICKETS}
                  </span>
                  <span>Paired: {report.counts.paired}</span>
                  <span>Direct only: {report.counts.directOnly}</span>
                  <span>Generated {fmtDate(report.generatedAt)}</span>
                </div>
              </div>

              <div className="mb-6 overflow-hidden rounded-[14px] border border-[#E2E7F2] bg-white">
                {report.checks.map((c) => {
                  const open = openCheck === c.id;
                  const ackedHere = c.id === "d" ? c.items.filter((i) => i.ticketId && acks[i.ticketId] !== undefined).length : 0;
                  return (
                    <div key={c.id} className="border-b border-[#EDF0F7] last:border-0">
                      <button
                        type="button"
                        onClick={() => setOpenCheck(open ? null : c.id)}
                        aria-expanded={open}
                        className="grid w-full grid-cols-[28px_1fr_auto_28px] items-center gap-3 px-5 py-3.5 text-left transition-colors hover:bg-[#F0F7FF]"
                      >
                        {c.ok ? <CheckCircle2 className="h-5 w-5 text-[#177E48]" aria-hidden /> : <XCircle className="h-5 w-5 text-[#C0392B]" aria-hidden />}
                        <span className="text-[13px] text-[#0B1533]">
                          <span className="mr-2 font-mono text-[11px] uppercase text-[#5F6A88]">({c.id})</span>
                          {c.title}
                        </span>
                        <span className="flex items-center gap-2">
                          <span className="text-[12px] text-[#5F6A88]">{c.total} checked</span>
                          <Chip tone={c.ok ? "ok" : ackedHere === c.failing && c.failing > 0 ? "warn" : "late"}>
                            {c.ok ? "clean" : `${c.failing} failing${ackedHere ? ` · ${ackedHere} accepted` : ""}`}
                          </Chip>
                        </span>
                        <ChevronDown className={cn("h-4 w-4 text-[#5F6A88] transition-transform", open && "rotate-180")} aria-hidden />
                      </button>
                      {open && (
                        <div className="border-t border-[#EDF0F7] bg-[#FAFBFE] px-5 py-3">
                          {c.items.length === 0 ? (
                            <p className="text-[13px] text-[#5F6A88]">Nothing to report.</p>
                          ) : (
                            <ul className="space-y-2">
                              {c.items.slice(0, 100).map((i, idx) => (
                                <li key={`${i.ticketId ?? "x"}-${idx}`} className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px] text-[#3A4565]">
                                  {i.ticketId ? (
                                    <Link href={`/desk/inbox/${i.ticketId}`} className="font-mono text-[12px] text-[#0063D6] hover:underline">
                                      #{i.ticketNumber}
                                    </Link>
                                  ) : (
                                    <span className="font-mono text-[12px] text-[#5F6A88]">—</span>
                                  )}
                                  <span>{i.detail}</span>
                                  {c.id === "d" && i.ticketId && (
                                    <span className="ml-auto flex items-center gap-2">
                                      <label className="flex items-center gap-1.5 text-[12px] text-[#5F6A88]">
                                        <input
                                          type="checkbox"
                                          checked={acks[i.ticketId] !== undefined}
                                          onChange={(e) =>
                                            setAcks((prev) => {
                                              const next = { ...prev };
                                              if (e.target.checked) next[i.ticketId!] = prev[i.ticketId!] ?? "";
                                              else delete next[i.ticketId!];
                                              return next;
                                            })
                                          }
                                        />
                                        Accept
                                      </label>
                                      {acks[i.ticketId] !== undefined && (
                                        <input
                                          value={acks[i.ticketId]}
                                          onChange={(e) => setAcks((prev) => ({ ...prev, [i.ticketId!]: e.target.value }))}
                                          placeholder="Reason (required)"
                                          aria-label={`Reason for accepting ticket ${i.ticketNumber}`}
                                          className={cn(input, "w-64 py-1 text-[12px]")}
                                        />
                                      )}
                                    </span>
                                  )}
                                </li>
                              ))}
                              {c.items.length > 100 && <li className="text-[12px] text-[#5F6A88]">…and {c.items.length - 100} more (showing 100).</li>}
                            </ul>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              <div className="rounded-[14px] border border-[#E2E7F2] bg-white p-5">
                <h2 className="text-[15px] font-semibold text-[#0B1533]">Sign-off</h2>

                {signoff && (
                  <div className={cn("mt-3 rounded-[10px] border px-4 py-3 text-[13px]", activeSignoff ? "border-[#BFE3CC] bg-[#E3F5EA] text-[#177E48]" : "border-[#E2E7F2] bg-[#FAFBFE] text-[#5F6A88]")}>
                    <p className="font-medium">
                      {activeSignoff ? "Signed off" : "Revoked sign-off"} by {signoff.signedByName} on {fmtDate(signoff.signedAt)}
                    </p>
                    <p className="mt-0.5 text-[12px]">
                      Window {fmtDate(signoff.windowFrom)} – {fmtDate(signoff.windowTo)} · {signoff.ticketCount} tickets
                      {signoff.acknowledgementCount > 0 && ` · ${signoff.acknowledgementCount} accepted difference${signoff.acknowledgementCount === 1 ? "" : "s"}`}
                    </p>
                    {signoff.note && <p className="mt-1 text-[12px]">“{signoff.note}”</p>}
                    {signoff.revokedAt && <p className="mt-1 text-[12px]">Revoked {fmtDate(signoff.revokedAt)}: {signoff.revokeReason}</p>}
                    {activeSignoff && (
                      <div className="mt-3 flex flex-wrap items-center gap-2">
                        <input value={revokeReason} onChange={(e) => setRevokeReason(e.target.value)} placeholder="Reason to revoke" aria-label="Reason to revoke the sign-off" className={cn(input, "w-72 py-1.5 text-[12px] text-[#0B1533]")} />
                        <button type="button" onClick={revoke} disabled={revoking || revokeReason.trim().length < 3} className="inline-flex items-center gap-1.5 rounded-[8px] border border-[#E2E7F2] bg-white px-3 py-1.5 text-[12px] font-medium text-[#C0392B] transition-colors hover:bg-[#FDE8E6] disabled:cursor-not-allowed disabled:opacity-60">
                          {revoking && <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />}
                          {revoking ? "Revoking…" : "Revoke sign-off"}
                        </button>
                      </div>
                    )}
                  </div>
                )}

                {!activeSignoff && (
                  <div className="mt-4 space-y-3">
                    <fieldset className="space-y-2">
                      <legend className="text-[11px] font-semibold uppercase tracking-[0.09em] text-[#5F6A88]">Manual steps the report cannot verify</legend>
                      {ATTESTATIONS.map((a) => (
                        <label key={a.key} className="flex items-start gap-2 text-[13px] text-[#3A4565]">
                          <input type="checkbox" className="mt-0.5" checked={attest[a.key]} onChange={(e) => setAttest((p) => ({ ...p, [a.key]: e.target.checked }))} />
                          {a.label}
                        </label>
                      ))}
                    </fieldset>
                    <label className="flex flex-col gap-1 text-[11px] font-semibold uppercase tracking-[0.09em] text-[#5F6A88]">
                      Note (optional)
                      <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} maxLength={2000} className={cn(input, "normal-case tracking-normal")} />
                    </label>
                    <label className="flex flex-col gap-1 text-[11px] font-semibold uppercase tracking-[0.09em] text-[#5F6A88]">
                      Type the site name to confirm: <span className="font-mono normal-case text-[#0B1533]">{report.site}</span>
                      <input value={confirmSite} onChange={(e) => setConfirmSite(e.target.value)} className={cn(input, "max-w-sm normal-case tracking-normal")} />
                    </label>
                    <div className="flex items-center gap-3">
                      <button type="button" onClick={sign} disabled={!canSign} className="inline-flex items-center gap-1.5 rounded-[8px] bg-[#177E48] px-4 py-2 text-[13px] font-medium text-white transition-colors hover:bg-[#12663A] disabled:cursor-not-allowed disabled:opacity-50">
                        {signing ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <ShieldCheck className="h-4 w-4" aria-hidden />}
                        {signing ? "Signing…" : "Sign off parity gate"}
                      </button>
                      {!canSign && <span className="text-[12px] text-[#5F6A88]">Enabled only when the gate passes, every box is ticked and the site name matches.</span>}
                    </div>
                  </div>
                )}
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}
