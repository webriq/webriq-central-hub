// Task 470 — pure sort + selection helpers shared by the Tasks listing and the Subtasks tab.
// Task 487 — "position" = Manual order (drag-and-drop order), nulls last.
export type SortKey = "title" | "status" | "priority" | "due_date" | "position";
export type SortDir = "asc" | "desc";

type SortableTask = { title: string; status: string; priority: string; due_date: string | null; position?: number | null };

const PRIORITY_ORDER: Record<string, number> = { critical: 0, high: 1, normal: 2, low: 3, none: 4 };
const STATUS_ORDER: Record<string, number> = {
  open: 0, in_progress: 1, ready_for_qa: 2, testing_completed: 3,
  for_client_approval: 4, ready_to_merge: 5, post_live_qa: 6, closed: 7,
};

// `normalize` maps legacy/Zoho status strings onto the canonical set (pass `normalizeStatus`).
export function sortTasks<T extends SortableTask>(list: T[], key: SortKey, dir: SortDir, normalize: (s: string) => string = (s) => s): T[] {
  const sign = dir === "asc" ? 1 : -1;
  return [...list].sort((a, b) => {
    let cmp = 0;
    if (key === "title")         cmp = a.title.localeCompare(b.title);
    else if (key === "status")   cmp = (STATUS_ORDER[normalize(a.status)] ?? 0) - (STATUS_ORDER[normalize(b.status)] ?? 0);
    else if (key === "priority") cmp = (PRIORITY_ORDER[a.priority] ?? 4) - (PRIORITY_ORDER[b.priority] ?? 4);
    else if (key === "due_date") cmp = (a.due_date ?? "9999").localeCompare(b.due_date ?? "9999");
    else if (key === "position") cmp = (a.position ?? Infinity) - (b.position ?? Infinity) || 0;
    return cmp * sign;
  });
}

// Selected ids minus any whose ancestor is also selected — deleting the ancestor already cascades to them.
export function topSelectedIds(selected: Iterable<string>, parentOf: (id: string) => string | null | undefined): string[] {
  const set = new Set(selected);
  return [...set].filter((id) => {
    const seen = new Set<string>([id]);
    for (let p = parentOf(id); p && !seen.has(p); p = parentOf(p)) {
      if (set.has(p)) return false;
      seen.add(p);
    }
    return true;
  });
}
