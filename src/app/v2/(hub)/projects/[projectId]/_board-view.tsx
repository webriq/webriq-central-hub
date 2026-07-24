"use client";

import { useMemo, useState } from "react";
import {
  DndContext, DragOverlay, PointerSensor, useSensor, useSensors,
  closestCorners, type DragStartEvent, type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext, useSortable, verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useDroppable } from "@dnd-kit/core";
import { Plus, Calendar, GitPullRequest } from "lucide-react";
import {
  type Task, type TaskStatus, BOARD_COLUMNS, PRIORITY_STYLE, midpoint, formatDueDate,
} from "../_pm-shared";

export default function BoardView({
  tasks,
  onMove,
  onOpen,
  onAddInColumn,
}: {
  tasks: Task[];
  onMove: (id: string, status: TaskStatus, position: number) => Promise<void>;
  onOpen: (task: Task) => void;
  onAddInColumn: (status: TaskStatus) => void;
}) {
  const [activeId, setActiveId] = useState<string | null>(null);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  // Group tasks by status column, sorted by position.
  const byColumn = useMemo(() => {
    const map = new Map<TaskStatus, Task[]>();
    for (const col of BOARD_COLUMNS) map.set(col.id, []);
    for (const t of tasks) {
      if (map.has(t.status)) map.get(t.status)!.push(t);
    }
    for (const list of map.values()) {
      list.sort((a, b) => (a.position ?? 0) - (b.position ?? 0));
    }
    return map;
  }, [tasks]);

  const activeTask = activeId ? tasks.find((t) => t.id === activeId) ?? null : null;

  function columnOf(id: string): TaskStatus | null {
    if (BOARD_COLUMNS.some((c) => c.id === id)) return id as TaskStatus;
    const t = tasks.find((x) => x.id === id);
    return t ? t.status : null;
  }

  async function handleDragEnd(e: DragEndEvent) {
    setActiveId(null);
    const { active, over } = e;
    if (!over) return;
    const activeTaskId = active.id as string;
    const targetStatus = columnOf(over.id as string);
    if (!targetStatus) return;

    // Target column list excluding the dragged task.
    const list = (byColumn.get(targetStatus) ?? []).filter((t) => t.id !== activeTaskId);

    let index: number;
    if (BOARD_COLUMNS.some((c) => c.id === over.id)) {
      index = list.length; // dropped on empty column area → append
    } else {
      const overIdx = list.findIndex((t) => t.id === over.id);
      index = overIdx === -1 ? list.length : overIdx;
    }

    const prev = list[index - 1]?.position;
    const next = list[index]?.position;
    const newPosition = midpoint(prev, next);

    const current = tasks.find((t) => t.id === activeTaskId);
    if (current && current.status === targetStatus && current.position === newPosition) return;

    await onMove(activeTaskId, targetStatus, newPosition);
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCorners}
      onDragStart={(e: DragStartEvent) => setActiveId(e.active.id as string)}
      onDragEnd={handleDragEnd}
      onDragCancel={() => setActiveId(null)}
    >
      <div className="h-full overflow-x-auto overflow-y-hidden">
        <div className="flex gap-4 h-full px-8 py-5 min-w-max">
          {BOARD_COLUMNS.map((col) => {
            const items = byColumn.get(col.id) ?? [];
            return (
              <Column
                key={col.id}
                id={col.id}
                label={col.label}
                accent={col.accent}
                count={items.length}
                onAdd={() => onAddInColumn(col.id)}
              >
                <SortableContext items={items.map((t) => t.id)} strategy={verticalListSortingStrategy}>
                  <div className="flex flex-col gap-2.5 px-0.5 min-h-[40px]">
                    {items.map((t) => (
                      <SortableCard key={t.id} task={t} onOpen={() => onOpen(t)} />
                    ))}
                  </div>
                </SortableContext>
              </Column>
            );
          })}
        </div>
      </div>

      <DragOverlay>
        {activeTask ? <CardBody task={activeTask} dragging /> : null}
      </DragOverlay>
    </DndContext>
  );
}

function Column({
  id, label, accent, count, onAdd, children,
}: {
  id: string;
  label: string;
  accent: string;
  count: number;
  onAdd: () => void;
  children: React.ReactNode;
}) {
  const { setNodeRef, isOver } = useDroppable({ id });
  return (
    <div className="w-[300px] shrink-0 flex flex-col h-full">
      <div className="flex items-center justify-between px-1 mb-3 shrink-0">
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full" style={{ background: accent }} />
          <span className="text-[13px] font-semibold text-[#0B1533]">{label}</span>
          <span className="text-[11px] font-mono text-[#5F6A88] bg-[#EDF0F7] rounded-full px-1.5">{count}</span>
        </div>
        <button onClick={onAdd} className="p-1 rounded-md text-[#5F6A88] hover:text-[#0B1533] hover:bg-[#EDF0F7] transition-colors cursor-pointer" title={`Add to ${label}`}>
          <Plus size={15} />
        </button>
      </div>
      <div
        ref={setNodeRef}
        className={`flex-1 overflow-y-auto rounded-[14px] p-2 transition-colors ${isOver ? "bg-[#F0F7FF]" : "bg-[#F4F6FB]"}`}
      >
        {children}
      </div>
    </div>
  );
}

function SortableCard({ task, onOpen }: { task: Task; onOpen: () => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: task.id });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  };
  return (
    <div ref={setNodeRef} style={style} {...attributes} {...listeners} onClick={onOpen}>
      <CardBody task={task} />
    </div>
  );
}

function CardBody({ task, dragging }: { task: Task; dragging?: boolean }) {
  const p = PRIORITY_STYLE[task.priority];
  const due = formatDueDate(task.due_date);
  return (
    <div
      className={`rounded-[14px] border bg-white px-3.5 py-3 cursor-pointer transition-shadow ${
        dragging ? "border-[#A8C6F5] shadow-lg rotate-1" : "border-[#E2E7F2] shadow-[0_1px_2px_rgba(7,17,51,.05)] hover:shadow-md hover:border-[#A8C6F5]"
      }`}
    >
      <div className="flex items-start gap-2">
        <span className="w-1.5 h-1.5 rounded-full mt-1.5 shrink-0" style={{ background: p.dot }} />
        <p className="text-[13px] font-medium text-[#0B1533] leading-snug flex-1">{task.title}</p>
      </div>
      {(due || task.github_pr_url || (task.labels && task.labels.length > 0)) && (
        <div className="flex items-center gap-2 mt-2.5 pl-3.5 flex-wrap">
          {due && (
            <span className="inline-flex items-center gap-1 text-[11px] text-[#5F6A88]">
              <Calendar size={11} /> {due}
            </span>
          )}
          {task.github_pr_url && (
            <span className="inline-flex items-center gap-1 text-[11px] text-[#5F6A88]">
              <GitPullRequest size={11} /> PR
            </span>
          )}
          {task.labels?.map((l) => (
            <span key={l} className="text-[10px] px-1.5 py-0.5 rounded bg-[#EDF0F7] text-[#5F6A88]">{l}</span>
          ))}
        </div>
      )}
    </div>
  );
}
