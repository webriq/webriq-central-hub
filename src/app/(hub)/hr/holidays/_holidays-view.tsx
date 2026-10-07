"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CalendarDays, Plus } from "lucide-react";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { formatDate } from "@/lib/hr/dates";
import type { HolidayRow } from "@/lib/hr/types";
import { EmptyState } from "../_components/empty-state";
import { Panel } from "../_components/page-shell";
import { StatStrip } from "../_components/stat-strip";
import { useHrMutation } from "../_components/use-hr-mutation";
import { btn } from "../_components/ui";
import { HolidayCalendar } from "./_holiday-calendar";
import { HolidayFormModal } from "./_holiday-form-modal";
import { HolidayList } from "./_holiday-list";
import { ViewToggle, type HolidayView } from "./_view-toggle";

export function HolidaysView({ year, holidays, today, canManage }: { year: number; holidays: HolidayRow[]; today: string; canManage: boolean }) {
  const router = useRouter();
  const { run, busy } = useHrMutation();
  const [view, setView] = useState<HolidayView>("list");
  const [editing, setEditing] = useState<HolidayRow | null>(null);
  const [adding, setAdding] = useState(false);
  const [deleting, setDeleting] = useState<HolidayRow | null>(null);

  const next = holidays.find((h) => h.holiday_date >= today);
  const remaining = holidays.filter((h) => h.holiday_date >= today).length;

  async function importSeed() {
    const res = await run<{ added: number }>("POST", "/api/hr/holidays/seed");
    if (!res.ok) return toast.error(res.error ?? "Couldn't import the holidays.");
    toast.success(res.data?.added ? `Imported ${res.data.added} holidays` : "Those holidays are already added");
    router.refresh();
  }

  async function confirmDelete() {
    if (!deleting) return;
    const res = await run("DELETE", `/api/hr/holidays/${deleting.id}`);
    if (!res.ok) return toast.error(res.error ?? "Couldn't delete the holiday.");
    toast.success("Holiday deleted");
    setDeleting(null);
    router.refresh();
  }

  const empty = (
    <EmptyState
      icon={CalendarDays}
      title={`No holidays set for ${year}`}
      hint={canManage ? "Add the company holidays so staff can plan around them and get reminders." : "An admin hasn't added holidays for this year yet."}
      action={canManage && year === 2026 ? <button type="button" className={btn.blue} onClick={importSeed} disabled={busy}>Import 2026 PH holidays</button> : undefined}
    />
  );

  return (
    <>
      <StatStrip
        stats={[
          { label: `Holidays in ${year}`, value: holidays.length },
          { label: "Still to come", value: remaining },
          { label: "Next holiday", value: next ? next.name : "None", hint: next ? formatDate(next.holiday_date) : undefined },
        ]}
      />
      <Panel
        title="Holiday calendar"
        action={
          <div className="flex items-center gap-2">
            <ViewToggle value={view} onChange={setView} />
            {canManage && <button type="button" className={`${btn.cta} ${btn.sm}`} onClick={() => setAdding(true)}><Plus size={13} aria-hidden /> Add holiday</button>}
          </div>
        }
      >
        {!holidays.length ? empty : view === "list" ? (
          <HolidayList holidays={holidays} today={today} canManage={canManage} onEdit={setEditing} onDelete={setDeleting} />
        ) : (
          <HolidayCalendar year={year} holidays={holidays} today={today} />
        )}
      </Panel>
      {canManage && year === 2026 && holidays.length > 0 && (
        <p className="text-[12px] text-[#5F6A88]">
          Missing the standard Philippine holidays?{" "}
          <button type="button" onClick={importSeed} disabled={busy} className="font-semibold text-[#0063D6] hover:underline disabled:opacity-45">Import the 2026 list</button>. Existing dates are skipped.
        </p>
      )}

      {(adding || editing) && (
        <HolidayFormModal
          key={editing?.id ?? "new"}
          open
          holiday={editing}
          defaultYear={year}
          onClose={() => { setAdding(false); setEditing(null); }}
          onSaved={() => { setAdding(false); setEditing(null); router.refresh(); }}
        />
      )}
      <ConfirmDialog
        open={!!deleting}
        title={`Delete ${deleting?.name ?? "holiday"}?`}
        body="Staff will no longer see it, and the 3-day reminder won't be sent. Leave already approved around it isn't changed."
        confirmLabel="Delete holiday"
        confirmDisabled={busy}
        onConfirm={confirmDelete}
        onCancel={() => setDeleting(null)}
      />
    </>
  );
}
