"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { countLeaveDays } from "@/lib/hr/leave-days";
import { formatDays } from "@/lib/hr/format";
import type { CreditSummary, LeaveTypeRow } from "@/lib/hr/types";
import { Field } from "../_components/field";
import { toISODate } from "../../dashboard/timelogs/_time-logs-shared";
import { DateField } from "../_components/date-field";
import { Panel } from "../_components/page-shell";
import { useHrMutation } from "../_components/use-hr-mutation";
import { btn, fieldClass } from "../_components/ui";
import { TeamEmailsInput } from "./_team-emails-input";

const earlierOf = (a: string, b: string) => (a < b ? a : b);

export function RequestForm({ types, credits, holidayDates, today: companyToday }: { types: LeaveTypeRow[]; credits: CreditSummary[]; holidayDates: string[]; today: string }) {
  // Earliest pickable day is the requester's own today when that is behind the company (Manila) date,
  // so someone in the US can still file for their own current day. Only feeds the date limits, never rendered text, so no hydration mismatch.
  const today = earlierOf(companyToday, toISODate(new Date()));
  const router = useRouter();
  const { run, busy } = useHrMutation();
  const [typeId, setTypeId] = useState(types[0]?.id ?? "");
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [half, setHalf] = useState(false);
  const [reason, setReason] = useState("");
  const [emails, setEmails] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  const holidays = useMemo(() => new Set(holidayDates), [holidayDates]);
  const days = start && end && end >= start ? countLeaveDays({ start, end, halfDay: half }, holidays) : null;
  const credit = credits.find((c) => c.type.id === typeId);
  const after = days !== null && credit?.remaining != null ? credit.remaining - days : null;
  const singleDay = !!start && start === end;

  async function submit() {
    if (!start || !end) return setError("Choose the first and last day you'll be away.");
    if (end < start) return setError("The last day can't be before the first day.");
    setError(null);
    const res = await run("POST", "/api/hr/leave-requests", {
      leaveTypeId: typeId, startDate: start, endDate: end, halfDay: half && singleDay, reason: reason.trim() || null, teamEmails: emails,
    });
    if (!res.ok) return setError(res.error);
    toast.success("Leave requested");
    setStart(""); setEnd(""); setHalf(false); setReason(""); setEmails([]);
    router.refresh();
  }

  return (
    <Panel title="Request leave" className="lg:sticky lg:top-6">
      <form className="flex flex-col gap-4 p-[18px]" onSubmit={(e) => { e.preventDefault(); void submit(); }}>
        <Field label="Leave type" htmlFor="r-type">
          <select id="r-type" className={fieldClass} value={typeId} onChange={(e) => setTypeId(e.target.value)}>
            {types.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        </Field>
        <div className="grid gap-3">
          <Field label="First day" htmlFor="r-start"><DateField id="r-start" min={today} value={start} onChange={(v) => { setStart(v); if (!end || end < v) setEnd(v); }} /></Field>
          <Field label="Last day" htmlFor="r-end"><DateField id="r-end" min={start || today} value={end} onChange={setEnd} /></Field>
        </div>
        <label className={`flex items-center gap-2 text-[12px] ${singleDay ? "cursor-pointer text-[#3A4565]" : "text-[#5F6A88]/70"}`}>
          <input type="checkbox" className="size-4 accent-[#007BFF]" checked={half && singleDay} disabled={!singleDay} onChange={(e) => setHalf(e.target.checked)} />
          Half day {!singleDay && <span className="text-[11px]">(pick a single date)</span>}
        </label>
        {days !== null && (
          <p aria-live="polite" className={`rounded-[10px] px-3 py-2 font-mono text-[12px] ${after !== null && after < 0 ? "bg-[#FFF3D6] text-[#8A5A00]" : "bg-[#F0F7FF] text-[#0063D6]"}`}>
            {days === 0 ? "Those dates are weekends or holidays — no days used." : `Uses ${formatDays(days)}`}
            {days > 0 && after !== null && ` · ${after < 0 ? `${formatDays(Math.abs(after))} over your allotment` : `${formatDays(after)} left after`}`}
          </p>
        )}
        <Field label="Reason (optional)" htmlFor="r-reason"><textarea id="r-reason" rows={3} className={fieldClass} value={reason} onChange={(e) => setReason(e.target.value)} /></Field>
        <Field label="Tell teammates (optional)" htmlFor="r-team" hint="They get an email once your leave is approved.">
          <TeamEmailsInput id="r-team" value={emails} onChange={setEmails} />
        </Field>
        {error && <p role="alert" className="text-[12px] text-[#C0392B]">{error}</p>}
        <button type="submit" className={btn.cta} disabled={busy || !types.length}>{busy ? "Requesting…" : "Request leave"}</button>
      </form>
    </Panel>
  );
}
