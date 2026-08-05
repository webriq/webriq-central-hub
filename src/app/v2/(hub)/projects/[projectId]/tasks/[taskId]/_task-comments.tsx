"use client";

import { useEffect, useState } from "react";
import { MessageSquare, Loader2 } from "lucide-react";
import { formatRelativeTime } from "@/lib/utils";
import { OwnerChip } from "../../../_pm-shared";

// Comment thread for the task detail page (task 206) — built on the existing, already
// live-commenting-capable `task_comments` table (RLS: staff read/insert/own-delete already
// shipped, migration 048). No edit/delete UI yet — see task 206 Decision #6, a deliberate
// fast-follow boundary, not an oversight.
type CommentRow = { id: string; body: string; created_at: string; author_name: string };

export function TaskComments({ taskId }: { taskId: string }) {
  const [comments, setComments] = useState<CommentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState("");
  const [posting, setPosting] = useState(false);

  useEffect(() => {
    const ctrl = new AbortController();
    fetch(`/api/v2/tasks/${taskId}/comments`, { signal: ctrl.signal })
      .then((r) => (r.ok ? r.json() : []))
      .then((data: CommentRow[]) => setComments(data))
      .catch(() => {})
      .finally(() => setLoading(false));
    return () => ctrl.abort();
  }, [taskId]);

  async function postComment() {
    const trimmed = draft.trim();
    if (!trimmed) return;
    setPosting(true);
    const res = await fetch(`/api/v2/tasks/${taskId}/comments`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ body: trimmed }),
    });
    if (res.ok) {
      const created: CommentRow = await res.json();
      setComments((prev) => [...prev, created]);
      setDraft("");
    }
    setPosting(false);
  }

  return (
    <div className="flex flex-col gap-4">
      {loading ? (
        <div className="flex flex-col gap-3">
          <div className="h-10 animate-pulse bg-[#F4F6FB] rounded-[8px]" />
          <div className="h-10 animate-pulse bg-[#F4F6FB] rounded-[8px]" />
        </div>
      ) : comments.length === 0 ? (
        <div className="flex flex-col items-center gap-1.5 py-4 text-center">
          <MessageSquare size={18} className="text-[#C7CEDD]" />
          <p className="text-[12px] text-[#5F6A88]">No comments yet</p>
        </div>
      ) : (
        <ul className="flex flex-col gap-3.5">
          {comments.map((c) => (
            <li key={c.id} className="flex items-start gap-2.5">
              <OwnerChip name={c.author_name} />
              <div className="flex-1 min-w-0">
                <div className="flex items-baseline gap-2">
                  <span className="text-[12px] font-semibold text-[#0B1533]">{c.author_name}</span>
                  <span className="text-[10px] font-mono text-[#5F6A88]">{formatRelativeTime(c.created_at)}</span>
                </div>
                <p className="text-[13px] text-[#3A4565] leading-relaxed whitespace-pre-wrap mt-0.5">{c.body}</p>
              </div>
            </li>
          ))}
        </ul>
      )}

      <div className="flex flex-col gap-2 pt-1 border-t border-[#EDF0F7]">
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          rows={2}
          placeholder="Add a comment…"
          className="w-full px-3 py-2 rounded-[10px] border text-[13px] outline-none transition-colors resize-none border-[#E2E7F2] bg-[#F4F6FB] text-[#3A4565] focus:border-[#007BFF] focus:bg-white focus:ring-[3px] focus:ring-[#007BFF]/[0.14]"
        />
        <button
          type="button"
          onClick={() => void postComment()}
          disabled={!draft.trim() || posting}
          className="self-end inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-[#007BFF] text-white text-[12px] font-semibold hover:bg-[#0063D6] disabled:opacity-45 cursor-pointer transition-colors"
        >
          {posting ? <Loader2 size={13} className="animate-spin" /> : null}
          Post comment
        </button>
      </div>
    </div>
  );
}
