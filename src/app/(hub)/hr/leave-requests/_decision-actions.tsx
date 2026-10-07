"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import type { LeaveRequestView } from "@/lib/hr/types";
import { useHrMutation } from "../_components/use-hr-mutation";
import { btn, fieldClass, labelClass } from "../_components/ui";

type Action = "approve" | "deny" | "cancel";

const CONFIRM: Record<Exclude<Action, "approve">, (name: string) => { title: string; body: string; label: string }> = {
  deny: (n) => ({ title: "Deny this request?", body: `${n} is notified with your note, and no days are used.`, label: "Deny request" }),
  cancel: (n) => ({ title: "Cancel this leave?", body: `${n} is notified. Any days it used return to their credits.`, label: "Cancel leave" }),
};

export function DecisionActions({ request, overBy, onDone }: { request: LeaveRequestView; overBy: number; onDone: () => void }) {
  const router = useRouter();
  const { run, busy } = useHrMutation();
  const [note, setNote] = useState("");
  const [pending, setPending] = useState<Exclude<Action, "approve"> | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function submit(action: Action) {
    setError(null);
    const res = await run<{ warning: string | null }>("PATCH", `/api/hr/leave-requests/${request.id}`, { action, decisionNote: note.trim() || null });
    setPending(null);
    if (!res.ok) return setError(res.error);
    const msg = { approve: "Leave approved", deny: "Request denied", cancel: "Leave cancelled" }[action];
    if (res.data?.warning) toast.warning(`${msg}. ${res.data.warning}`);
    else toast.success(msg);
    router.refresh();
    onDone();
  }

  const isPending = request.status === "pending";
  const confirm = pending ? CONFIRM[pending](request.employee_name) : null;

  return (
    <div className="flex flex-col gap-3">
      <div>
        <label htmlFor="decision-note" className={labelClass}>Note to {request.employee_name.split(" ")[0]} (optional)</label>
        <textarea id="decision-note" rows={2} className={fieldClass} value={note} onChange={(e) => setNote(e.target.value)} placeholder="They see this with the decision." />
      </div>
      {isPending && overBy > 0 && (
        <p className="rounded-[10px] bg-[#FFF3D6] px-3 py-2 text-[12px] text-[#8A5A00]">
          Approving takes them {overBy} {overBy === 1 ? "day" : "days"} over this allotment. You can still approve.
        </p>
      )}
      {error && <p role="alert" className="text-[12px] text-[#C0392B]">{error}</p>}
      <div className="flex flex-wrap items-center gap-2">
        {isPending && <button type="button" className={btn.blue} disabled={busy} onClick={() => submit("approve")}>{busy ? "Saving…" : "Approve leave"}</button>}
        {isPending && <button type="button" className={btn.danger} disabled={busy} onClick={() => setPending("deny")}>Deny request</button>}
        <button type="button" className={btn.ghost} disabled={busy} onClick={() => setPending("cancel")}>{isPending ? "Cancel request" : "Cancel approved leave"}</button>
      </div>
      <ConfirmDialog
        open={!!confirm}
        title={confirm?.title ?? ""}
        body={confirm?.body ?? ""}
        confirmLabel={confirm?.label}
        confirmDisabled={busy}
        onConfirm={() => pending && submit(pending)}
        onCancel={() => setPending(null)}
      />
    </div>
  );
}
