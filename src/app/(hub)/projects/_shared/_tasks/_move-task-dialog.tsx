"use client";

import { useMemo, useState } from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";
import { decodeHtmlEntities } from "@/app/(hub)/projects-old/_pm-shared";
import { NO_LIST, subtreeIds, type TreeTask } from "./_task-tree";
import { resolveTaskMove, type AnyTaskMove, type DropTarget, type TaskCtx } from "./_move-rules";

// Task 502 — option value for a phase with no task list; picking it creates "<phase name>" under it.
const NEW_LIST = "newlist:";

const FIELD = "w-full rounded-[10px] border border-[#E2E7F2] bg-[#F4F6FB] px-3 py-2 text-[13px] text-[#0B1533] outline-none focus:border-[#007BFF] focus:bg-white focus:ring-[3px] focus:ring-[#007BFF]/[0.14]";

// Task 487 — the non-drag way to move a task (row ⋯ → Move to…): pick a list, optionally a parent task.
export function MoveTaskDialog<T extends TreeTask & { title: string }>({ task, ctx, anywhere, onMove, onClose }: {
  task: T;
  ctx: TaskCtx<T>;
  anywhere: boolean;
  onMove: (m: AnyTaskMove) => void;
  onClose: () => void;
}) {
  const [groupId, setGroupId] = useState(ctx.groupOf(task));
  const [parentId, setParentId] = useState(task.parent_task_id ?? "");
  const own = useMemo(() => subtreeIds(task.id, ctx.children), [task.id, ctx.children]);

  // Every task in the chosen list except the moving task's own subtree, in tree order with depth for indent.
  const parents = useMemo(() => {
    const out: T[] = [];
    const walk = (list: T[]) => list.forEach((t) => { if (!own.has(t.id)) { out.push(t); walk(ctx.children.get(t.id) ?? []); } });
    walk(ctx.groups.find((g) => g.id === groupId)?.tasks ?? []);
    return out;
  }, [ctx, groupId, own]);

  const newList = groupId.startsWith(NEW_LIST);
  const target: DropTarget = newList
    ? { kind: "phase", id: groupId.slice(NEW_LIST.length), zone: "into" }
    : parentId ? { kind: "task", id: parentId, zone: "nest" } : { kind: "group", id: groupId, zone: "into" };
  const move = resolveTaskMove(ctx, task.id, target, anywhere);
  const unchanged = groupId === ctx.groupOf(task) && parentId === (task.parent_task_id ?? "");

  return (
    <div
      className="fixed inset-0 z-40 flex items-center justify-center bg-[#071133]/40 p-4"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
      onKeyDown={(e) => e.key === "Escape" && onClose()}
    >
      <div role="dialog" aria-modal="true" aria-labelledby="move-task-title" className="w-full max-w-md rounded-[14px] border border-[#E2E7F2] bg-white shadow-lg">
        <div className="flex items-center justify-between border-b border-[#EDF0F7] px-5 py-3.5">
          <h2 id="move-task-title" className="font-heading text-[15px] font-semibold tracking-[-0.01em] text-[#0B1533]">Move task</h2>
          <button type="button" aria-label="Close" onClick={onClose} className="rounded p-1 text-[#5F6A88] hover:bg-[#EDF0F7] cursor-pointer">
            <X size={15} />
          </button>
        </div>
        <div className="flex flex-col gap-4 px-5 py-4">
          <p className="truncate text-[13px] text-[#3A4565]">&ldquo;{decodeHtmlEntities(task.title)}&rdquo;</p>
          <label className="flex flex-col gap-1.5 text-[11px] font-semibold text-[#0B1533]">
            Task list
            <select autoFocus value={groupId} onChange={(e) => { setGroupId(e.target.value); setParentId(""); }} className={FIELD}>
              {ctx.phases.map((p) => {
                const label = (p.milestone as { name?: string } | null)?.name;
                // An optgroup with no options can't be picked — offer to create the phase's first list.
                const opts = label && p.groups.length === 0
                  ? [<option key={p.key} value={`${NEW_LIST}${p.key}`}>{decodeHtmlEntities(label)} (new list)</option>]
                  : p.groups.filter((g) => g.id !== NO_LIST).map((g) => <option key={g.id} value={g.id}>{decodeHtmlEntities(g.name)}</option>);
                return label ? <optgroup key={p.key} label={decodeHtmlEntities(label)}>{opts}</optgroup> : opts;
              })}
            </select>
          </label>
          <label className="flex flex-col gap-1.5 text-[11px] font-semibold text-[#0B1533]">
            Parent task <span className="font-normal text-[#5F6A88]">Leave empty to keep it a top-level task.</span>
            <select value={parentId} onChange={(e) => setParentId(e.target.value)} disabled={newList} className={cn(FIELD, "disabled:cursor-not-allowed disabled:opacity-60")}>
              <option value="">No parent (top level)</option>
              {parents.map((t) => (
                <option key={t.id} value={t.id}>{"  ".repeat(t.depth)}{t.depth ? "↳ " : ""}{decodeHtmlEntities(t.title)}</option>
              ))}
            </select>
          </label>
          {!move && !unchanged && (
            <p role="alert" className="text-[12px] text-[#C0392B]">
              {anywhere ? "That place would go deeper than 5 subtask levels. Pick a higher parent." : "You can only reorder this task within its list."}
            </p>
          )}
        </div>
        <div className="flex justify-end gap-2 border-t border-[#EDF0F7] px-5 py-3">
          <button type="button" onClick={onClose} className="rounded-full border border-[#E2E7F2] bg-white px-4 py-2 text-[12px] font-medium text-[#3A4565] hover:border-[#A8C6F5] cursor-pointer transition-colors">
            Cancel
          </button>
          <button
            type="button"
            disabled={!move}
            onClick={() => { if (move) { onMove(move); onClose(); } }}
            className="rounded-full bg-[#007BFF] px-4 py-2 text-[12px] font-semibold text-white hover:bg-[#0063D6] cursor-pointer transition-colors disabled:cursor-not-allowed disabled:opacity-45"
          >
            Move task
          </button>
        </div>
      </div>
    </div>
  );
}
