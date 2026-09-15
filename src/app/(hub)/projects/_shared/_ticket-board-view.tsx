"use client";

import { useMemo, useState } from "react";
import {
  DndContext, DragOverlay, PointerSensor, useSensor, useSensors,
  closestCorners, useDroppable, useDraggable,
  type DragStartEvent, type DragEndEvent,
} from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import { Calendar } from "lucide-react";
import {
  type Ticket, BOARD_COLUMNS, SEVERITY_STYLE, formatDueDate, normalizeStatus, normalizeSeverity, decodeHtmlEntities,
} from "@/app/(hub)/projects-old/_pm-shared";
import { ticketAssigneeIds } from "@/lib/tickets/permissions";

// Tickets have no `position` column (unlike tasks) — board drag only changes status
// (cross-column). Within a column, cards sort by due date (soonest first, nulls
// last) then title; there is no persisted in-column order. See task 192 doc.
function sortColumn(list: Ticket[]): Ticket[] {
  return [...list].sort((a, b) => {
    const cmp = (a.due_date ?? "9999-99-99").localeCompare(b.due_date ?? "9999-99-99");
    return cmp !== 0 ? cmp : a.title.localeCompare(b.title);
  });
}

export default function TicketBoardView({
  tickets,
  onMove,
  onOpen,
}: {
  tickets: Ticket[];
  onMove: (id: string, status: string) => Promise<void>;
  onOpen: (ticket: Ticket) => void;
}) {
  const [activeId, setActiveId] = useState<string | null>(null);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  const byColumn = useMemo(() => {
    const map = new Map<string, Ticket[]>();
    for (const col of BOARD_COLUMNS) map.set(col.id, []);
    for (const i of tickets) {
      const norm = normalizeStatus(i.status);
      if (map.has(norm)) map.get(norm)!.push(i);
    }
    for (const [key, list] of map) map.set(key, sortColumn(list));
    return map;
  }, [tickets]);

  const activeTicket = activeId ? tickets.find((i) => i.id === activeId) ?? null : null;

  function columnOf(id: string): string | null {
    if (BOARD_COLUMNS.some((c) => c.id === id)) return id;
    const i = tickets.find((x) => x.id === id);
    return i ? normalizeStatus(i.status) : null;
  }

  async function handleDragEnd(e: DragEndEvent) {
    setActiveId(null);
    const { active, over } = e;
    if (!over) return;
    const activeTicketId = active.id as string;
    const targetStatus = columnOf(over.id as string);
    if (!targetStatus) return;

    const current = tickets.find((i) => i.id === activeTicketId);
    if (current && normalizeStatus(current.status) === targetStatus) return;

    await onMove(activeTicketId, targetStatus);
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
              <Column key={col.id} id={col.id} label={col.label} accent={col.accent} count={items.length}>
                <div className="flex flex-col gap-2.5 px-0.5 min-h-[40px]">
                  {items.map((i) => (
                    <DraggableCard key={i.id} ticket={i} onOpen={() => onOpen(i)} />
                  ))}
                </div>
              </Column>
            );
          })}
        </div>
      </div>

      <DragOverlay>
        {activeTicket ? <CardBody ticket={activeTicket} dragging /> : null}
      </DragOverlay>
    </DndContext>
  );
}

function Column({
  id, label, accent, count, children,
}: {
  id: string;
  label: string;
  accent: string;
  count: number;
  children: React.ReactNode;
}) {
  const { setNodeRef, isOver } = useDroppable({ id });
  return (
    <div className="w-[300px] shrink-0 flex flex-col h-full">
      <div className="flex items-center gap-2 px-1 mb-3 shrink-0">
        <span className="w-2 h-2 rounded-full" style={{ background: accent }} />
        <span className="text-[13px] font-semibold text-[#0B1533]">{label}</span>
        <span className="text-[11px] font-mono text-[#5F6A88] bg-[#EDF0F7] rounded-full px-1.5">{count}</span>
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

// Plain draggable (no in-column sortable reorder — see sortColumn note above,
// tickets have no `position` column so there's nothing to persist an order into).
function DraggableCard({ ticket, onOpen }: { ticket: Ticket; onOpen: () => void }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: ticket.id });
  const style = {
    transform: CSS.Translate.toString(transform),
    opacity: isDragging ? 0.4 : 1,
  };
  return (
    <div ref={setNodeRef} style={style} {...attributes} {...listeners} onClick={onOpen}>
      <CardBody ticket={ticket} />
    </div>
  );
}

function CardBody({ ticket, dragging }: { ticket: Ticket; dragging?: boolean }) {
  const sev = normalizeSeverity(ticket.severity);
  const sv = SEVERITY_STYLE[sev] ?? SEVERITY_STYLE["None"];
  const due = formatDueDate(ticket.due_date);
  return (
    <div
      className={`rounded-[14px] border bg-white px-3.5 py-3 cursor-pointer transition-shadow ${
        dragging ? "border-[#A8C6F5] shadow-lg rotate-1" : "border-[#E2E7F2] shadow-[0_1px_2px_rgba(7,17,51,.05)] hover:shadow-md hover:border-[#A8C6F5]"
      }`}
    >
      <div className="flex items-start gap-2">
        <span className="w-1.5 h-1.5 rounded-full mt-1.5 shrink-0" style={{ background: sv.dot }} />
        <p className="text-[13px] font-medium text-[#0B1533] leading-snug flex-1">{decodeHtmlEntities(ticket.title)}</p>
      </div>
      <div className="flex items-center gap-2 mt-2.5 pl-3.5 flex-wrap">
        <span className="text-[10px] font-medium" style={{ color: sv.text }}>{sv.label}</span>
        {due && (
          <span className="inline-flex items-center gap-1 text-[11px] text-[#5F6A88]">
            <Calendar size={11} /> {due}
          </span>
        )}
        {ticket.assignee_name && (
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-[#EDF0F7] text-[#5F6A88]">
            {ticket.assignee_name}
            {ticketAssigneeIds(ticket).length > 1 && ` +${ticketAssigneeIds(ticket).length - 1}`}
          </span>
        )}
      </div>
    </div>
  );
}
