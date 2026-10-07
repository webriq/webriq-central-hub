"use client";

import { useEffect, useState } from "react";
import { Lock } from "lucide-react";
import { toast } from "sonner";
import { todayInTz, formatDate } from "@/lib/hr/dates";
import { useHrMutation } from "../_components/use-hr-mutation";
import { Bone } from "../_components/skeleton";
import { btn, fieldClass } from "../_components/ui";

interface Note { id: string; author_name: string; body: string; created_at: string }

/** Append-only internal thread. Visible to admins only (route guard + RLS). */
export function AdminNotes({ requestId }: { requestId: string }) {
  const [notes, setNotes] = useState<Note[] | null>(null);
  const [draft, setDraft] = useState("");
  const { run, busy } = useHrMutation();

  useEffect(() => {
    let live = true;
    fetch(`/api/hr/leave-requests/${requestId}/notes`)
      .then((r) => (r.ok ? r.json() : { notes: [] }))
      .then((j: { notes: Note[] }) => live && setNotes(j.notes))
      .catch(() => live && setNotes([]));
    return () => { live = false; };
  }, [requestId]);

  async function add() {
    if (!draft.trim()) return;
    const res = await run<{ note: Note }>("POST", `/api/hr/leave-requests/${requestId}/notes`, { body: draft });
    if (!res.ok || !res.data) return toast.error(res.error ?? "Couldn't save the note.");
    setNotes((n) => [...(n ?? []), res.data!.note]);
    setDraft("");
  }

  return (
    <section aria-label="Admin notes">
      <h3 className="flex items-center gap-1.5 text-[12px] font-semibold text-[#0B1533]">
        <Lock size={12} aria-hidden /> Admin notes
        <span className="font-normal text-[#5F6A88]">· Internal — only admins see this</span>
      </h3>
      <ul className="mt-2.5 flex flex-col gap-2">
        {notes === null && <Bone className="h-9 w-full" />}
        {notes?.length === 0 && <li className="text-[12px] text-[#5F6A88]">No notes yet. Add context for the next admin who opens this request.</li>}
        {notes?.map((n) => (
          <li key={n.id} className="rounded-[10px] bg-[#F4F6FB] px-3 py-2">
            <p className="whitespace-pre-wrap text-[12.5px] text-[#3A4565]">{n.body}</p>
            <p className="mt-1 font-mono text-[10px] text-[#5F6A88]">{n.author_name} · {formatDate(todayInTz(undefined, new Date(n.created_at)))}</p>
          </li>
        ))}
      </ul>
      <div className="mt-2.5 flex flex-col gap-2">
        <textarea aria-label="New admin note" rows={2} className={fieldClass} value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="Add an internal note" />
        <button type="button" className={`${btn.ghost} ${btn.sm} self-end`} disabled={busy || !draft.trim()} onClick={add}>{busy ? "Adding…" : "Add note"}</button>
      </div>
    </section>
  );
}
