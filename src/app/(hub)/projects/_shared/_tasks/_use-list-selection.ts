"use client";

import { useMemo, useState } from "react";
import type { Task } from "@/app/(hub)/projects-old/_pm-shared";

// Task 487 — Tasks-listing selection (moved from `_list-view.tsx`). Task 285: only tasks the user may delete
// (`canSelect`) are selectable; a group/phase "select all" toggles its selectable ROOT tasks (deleting a root
// cascades to its subtasks), and shows indeterminate when any task in it — subtasks included — is selected.
export function useListSelection(tasks: Task[], groupOf: (t: Task) => string, canSelect: (t: Task) => boolean) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [deleting, setDeleting] = useState(false);

  const { rootsByGroup, allByGroup } = useMemo(() => {
    const roots = new Map<string, Task[]>();
    const all = new Map<string, string[]>();
    for (const t of tasks) {
      const g = groupOf(t);
      all.set(g, [...(all.get(g) ?? []), t.id]);
      if (!t.parent_task_id && t.depth === 0) roots.set(g, [...(roots.get(g) ?? []), t]);
    }
    return { rootsByGroup: roots, allByGroup: all };
  }, [tasks, groupOf]);

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  function checkFor(groupIds: string[]) {
    const roots = groupIds.flatMap((g) => rootsByGroup.get(g) ?? []).filter(canSelect).map((t) => t.id);
    const checked = roots.length > 0 && roots.every((id) => selected.has(id));
    return {
      checked,
      indeterminate: groupIds.some((g) => (allByGroup.get(g) ?? []).some((id) => selected.has(id))),
      disabled: roots.length === 0,
      onChange: () => setSelected((prev) => {
        const next = new Set(prev);
        for (const id of roots) if (checked) next.delete(id); else next.add(id);
        return next;
      }),
    };
  }

  async function bulkDelete(onBulkDelete: (ids: string[]) => Promise<void>) {
    setDeleting(true);
    await onBulkDelete(Array.from(selected));
    setDeleting(false);
    setSelected(new Set());
  }

  return { selected, deleting, toggle, checkFor, clear: () => setSelected(new Set()), bulkDelete };
}
