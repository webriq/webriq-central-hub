"use client";

import { useEffect } from "react";
import { X } from "lucide-react";
import { formatDate, formatRange, todayInTz } from "@/lib/hr/dates";
import { formatDays } from "@/lib/hr/format";
import type { LeaveRequestView } from "@/lib/hr/types";
import { LeaveTypeChip, StatusChip } from "../_components/chips";
import { PersonAvatar } from "../_components/person-avatar";
import { Bone } from "../_components/skeleton";
import { AdminNotes } from "./_admin-notes";
import { DecisionActions } from "./_decision-actions";
import { useRequestCredit } from "./_use-request-detail";

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[110px_1fr] gap-3 py-2 text-[13px]">
      <dt className="text-[11px] font-semibold text-[#5F6A88]">{label}</dt>
      <dd className="min-w-0 text-[#3A4565]">{children}</dd>
    </div>
  );
}

/** Right-hand review panel. Escape or the backdrop closes it. */
export function RequestDrawer({ request: r, canNote, onClose }: { request: LeaveRequestView; canNote: boolean; onClose: () => void }) {
  const { credit, loading } = useRequestCredit(r.id);
  const open = r.status === "pending" || r.status === "approved";
  const overBy = credit?.remaining != null ? Math.max(0, Math.ceil(r.working_days - credit.remaining)) : 0;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-[#0B1533]/30" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <aside role="dialog" aria-modal="true" aria-label={`${r.employee_name}'s leave request`} className="flex h-full w-full max-w-[460px] flex-col border-l border-[#E2E7F2] bg-white shadow-[0_8px_24px_rgba(7,17,51,0.10)]">
        <header className="flex items-center gap-3 border-b border-[#EDF0F7] px-5 py-4">
          <PersonAvatar id={r.employee_id} name={r.employee_name} />
          <div className="min-w-0 flex-1">
            <h2 className="truncate font-heading text-[15px] font-semibold text-[#0B1533]">{r.employee_name}</h2>
            <div className="mt-1 flex items-center gap-2"><StatusChip status={r.status} /><LeaveTypeChip name={r.leave_type_name} /></div>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="rounded-full p-1.5 text-[#5F6A88] transition-colors hover:bg-[#EDF0F7] hover:text-[#0B1533] focus-visible:outline-2 focus-visible:outline-[#007BFF]"><X size={16} /></button>
        </header>

        <div className="flex flex-1 flex-col gap-5 overflow-y-auto px-5 py-4">
          <dl className="divide-y divide-[#EDF0F7]">
            <Row label="Dates"><span className="font-mono text-[12px] text-[#0B1533]">{formatRange(r.start_date, r.end_date)}</span></Row>
            <Row label="Working days"><span className="font-mono text-[12px] text-[#0B1533]">{formatDays(r.working_days)}{r.half_day ? " (half day)" : ""}</span></Row>
            <Row label="Requested"><span className="font-mono text-[12px]">{formatDate(todayInTz(undefined, new Date(r.created_at)))}</span></Row>
            <Row label="Reason">{r.reason ? <span className="whitespace-pre-wrap">{r.reason}</span> : <span className="text-[#5F6A88]">No reason given</span>}</Row>
            {r.team_emails.length > 0 && <Row label="Team told">{r.team_emails.join(", ")}</Row>}
            {r.decision_note && <Row label="Decision note"><span className="whitespace-pre-wrap">{r.decision_note}</span></Row>}
          </dl>

          <section aria-label="Credits" className="rounded-[10px] bg-[#F4F6FB] px-3.5 py-3">
            <p className="text-[11px] font-semibold text-[#5F6A88]">{r.leave_type_name} credits</p>
            {loading ? <Bone className="mt-1 h-[18px] w-48" /> : credit?.period ? (
              <p className="mt-1 font-mono text-[12px] text-[#0B1533]">
                {credit.remaining === null ? "Unlimited" : `${formatDays(credit.remaining)} left`} · used {formatDays(credit.used, false)} · pending {formatDays(credit.pending, false)}
              </p>
            ) : <p className="mt-1 text-[12px] text-[#5F6A88]">No allotment is set for the current period.</p>}
          </section>

          {open && <DecisionActions request={r} overBy={overBy} onDone={onClose} />}
          {canNote && <AdminNotes requestId={r.id} />}
        </div>
      </aside>
    </div>
  );
}
