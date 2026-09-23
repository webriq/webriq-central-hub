"use client";

import { DndContext, PointerSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { SortableContext, useSortable, verticalListSortingStrategy, arrayMove } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { ChevronDown, ChevronRight, GripVertical } from "lucide-react";
import { cn } from "@/lib/utils";
import { WIKI_PRODUCTS, type WikiPageSummary, type WikiProduct } from "@/types/wiki";
import { PageRow, buildTree } from "./_wiki-tree-panel-rows";

// Task 399 — drag-reorderable space switcher, extracted out of _wiki-tree-panel.tsx to keep
// the dnd-kit wiring out of that already-sizable file. Order is a personal display preference
// (useWikiSpaceOrder, localStorage-backed), not shared data — every role that can see /kb can
// reorder their own view.

function SortableSpaceRow({
  product,
  isOpen,
  onToggle,
  children,
}: {
  product: (typeof WIKI_PRODUCTS)[number];
  isOpen: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: product.name });
  const style = { transform: CSS.Transform.toString(transform), transition };

  return (
    <div ref={setNodeRef} style={style} className={cn("mb-0.5", isDragging && "z-10 opacity-70")}>
      <div
        className={cn(
          "flex items-center gap-1 rounded-[7px] pr-2 transition-colors",
          isOpen ? "bg-[#F4F6FB]" : "hover:bg-[#F4F6FB]"
        )}
      >
        <button
          type="button"
          {...attributes}
          {...listeners}
          aria-label="Drag to reorder space"
          className="flex h-8 w-5 shrink-0 cursor-grab items-center justify-center border-none bg-transparent text-[#B7BFD6] outline-none transition-colors hover:text-[#5F6A88] active:cursor-grabbing"
        >
          <GripVertical size={12} />
        </button>
        <button
          type="button"
          onClick={onToggle}
          className="flex flex-1 min-w-0 items-center gap-1.5 py-2 text-[13px] font-semibold cursor-pointer text-[#0B1533]"
        >
          {isOpen ? <ChevronDown size={12} className="text-[#94A3B8] shrink-0" /> : <ChevronRight size={12} className="text-[#94A3B8] shrink-0" />}
          <span
            className="w-5 h-5 rounded-[5px] flex items-center justify-center text-[10px] font-bold text-white shrink-0"
            style={{ background: product.color }}
          >
            {product.badge}
          </span>
          <span className="truncate">{product.name}</span>
        </button>
      </div>
      {isOpen && children}
    </div>
  );
}

export function WikiSpaceList({
  order,
  onReorder,
  pages,
  expanded,
  onToggleSpace,
  selectedPageId,
  onSelectPage,
}: {
  order: WikiProduct[];
  onReorder: (order: WikiProduct[]) => void;
  pages: WikiPageSummary[];
  expanded: Set<WikiProduct>;
  onToggleSpace: (product: WikiProduct) => void;
  selectedPageId: string | null;
  onSelectPage: (pageId: string, product: WikiProduct) => void;
}) {
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));
  const byName = new Map(WIKI_PRODUCTS.map((p) => [p.name, p]));

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = order.indexOf(active.id as WikiProduct);
    const newIndex = order.indexOf(over.id as WikiProduct);
    if (oldIndex === -1 || newIndex === -1) return;
    onReorder(arrayMove(order, oldIndex, newIndex));
  }

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
      <SortableContext items={order} strategy={verticalListSortingStrategy}>
        {order.map((name) => {
          const space = byName.get(name);
          if (!space) return null;
          const isOpen = expanded.has(name);
          const tree = buildTree(pages, name);
          return (
            <SortableSpaceRow key={name} product={space} isOpen={isOpen} onToggle={() => onToggleSpace(name)}>
              <div className="pl-[26px] border-l border-[#E2E7F2] ml-4">
                {tree.length === 0 ? (
                  <p className="px-2.5 py-1.5 text-[11.5px] text-[#94A3B8]">No pages yet</p>
                ) : (
                  tree.map((node) => (
                    <PageRow key={node.id} node={node} depth={0} selectedPageId={selectedPageId} onSelect={(id) => onSelectPage(id, name)} />
                  ))
                )}
              </div>
            </SortableSpaceRow>
          );
        })}
      </SortableContext>
    </DndContext>
  );
}
