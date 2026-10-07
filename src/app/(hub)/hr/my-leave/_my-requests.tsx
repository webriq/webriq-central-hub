"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { FileText } from "lucide-react";
import { toast } from "sonner";
import { formatRange } from "@/lib/hr/dates";
import { formatDays } from "@/lib/hr/format";
import type { LeaveRequestView } from "@/lib/hr/types";
import { LeaveTypeChip, StatusChip } from "../_components/chips";
import { EmptyState } from "../_components/empty-state";
import { Panel } from "../_components/page-shell";
import { useHrMutation } from "../_components/use-hr-mutation";
import { btn } from "../_components/ui";

export function MyRequests({ rows }: { rows: LeaveRequestView[] }) {
  const router = useRouter();
  const { run } = useHrMutation();
  const [cancelling, setCancelling] = useState<string | null>(null);

  async function cancel(id: string) {
    setCancelling(id);
    const res = await run("PATCH", `/api/hr/leave-requests/${id}`, { action: "cancel" });
    setCancelling(null);
    if (!res.ok) return toast.error(res.error ?? "Couldn't cancel the request.");
    toast.success("Request cancelled");
    router.refresh();
  }

  return (
    <Panel title="My requests" hint={rows.length ? `${rows.length} total` : undefined}>
      {rows.length ? (
        <ul>
          {rows.map((r) => (
            <li key={r.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-[#EDF0F7] px-[18px] py-3.5 last:border-0">
              <div className="min-w-0 flex-1">
                <p className="font-mono text-[12px] font-medium text-[#0B1533]">{formatRange(r.start_date, r.end_date)}{r.half_day ? " · half day" : ""}</p>
                <p className="mt-0.5 font-mono text-[10.5px] text-[#5F6A88]">{formatDays(r.working_days)}</p>
                {r.decision_note && <p className="mt-1 text-[12px] text-[#3A4565]">&ldquo;{r.decision_note}&rdquo;</p>}
              </div>
              <LeaveTypeChip name={r.leave_type_name} />
              <StatusChip status={r.status} />
              {r.status === "pending" && (
                <button type="button" className={`${btn.ghost} ${btn.sm}`} disabled={cancelling === r.id} onClick={() => cancel(r.id)}>{cancelling === r.id ? "Cancelling…" : "Cancel request"}</button>
              )}
            </li>
          ))}
        </ul>
      ) : (
        <EmptyState icon={FileText} title="No requests yet" hint="Requests you submit show up here with their status and any note from the reviewer." />
      )}
    </Panel>
  );
}
