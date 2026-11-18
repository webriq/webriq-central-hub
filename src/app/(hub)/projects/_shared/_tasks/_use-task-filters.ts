"use client";

import { useMemo, useState } from "react";
import { type Task, type Tasklist, type Milestone, normalizeStatus } from "@/app/(hub)/projects-old/_pm-shared";
import type { SortKey, SortDir } from "@/lib/tasks/task-sort";
import { taskMatchesAssigneeFilter } from "../_assignee-filter";
import { NO_PHASE, NO_LIST, generalTasklistId, phaseKey } from "./_task-tree";
import { STATUS_OPTS, PRIORITY_OPTS } from "./_task-options";

// Task 487 — Tasks-tab toolbar state, moved verbatim from `_project-detail.tsx` (search / filters / sort /
// collapse-all), plus Show completed (a view of the Status filter's Closed option) and phase collapse keys.

export function useTaskFilters(tasks: Task[], tasklists: Tasklist[], milestones: Milestone[], assigneeValues: string[]) {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string[]>(() => [...STATUS_OPTS]);
  const [priorityFilter, setPriorityFilter] = useState<string[]>(() => [...PRIORITY_OPTS]);
  const [assigneeFilter, setAssigneeFilter] = useState<string[]>(() => assigneeValues);
  const [sortKey, setSortKey] = useState<SortKey>("status");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  // Root-task match, whole subtree follows: per-row filtering would orphan a matching subtask under a hidden parent.
  const filteredTasks = useMemo(() => {
    const tasklistNameById = new Map(tasklists.map((tl) => [tl.id, tl.name]));
    const childrenByParent = new Map<string, Task[]>();
    for (const t of tasks) {
      if (!t.parent_task_id) continue;
      childrenByParent.set(t.parent_task_id, [...(childrenByParent.get(t.parent_task_id) ?? []), t]);
    }
    const q = search.trim().toLowerCase();
    const statusSet = new Set(statusFilter);
    const prioritySet = new Set(priorityFilter);
    const assigneeSet = new Set(assigneeFilter);
    const assigneeAll = assigneeFilter.length >= assigneeValues.length;

    function rootMatches(t: Task): boolean {
      if (!statusSet.has(normalizeStatus(t.status))) return false;
      if (!prioritySet.has(t.priority)) return false;
      if (!taskMatchesAssigneeFilter(t, assigneeSet, assigneeAll)) return false;
      if (!q) return true;
      const tlName = t.tasklist_id ? tasklistNameById.get(t.tasklist_id) : null;
      return t.title.toLowerCase().includes(q) || (tlName?.toLowerCase().includes(q) ?? false);
    }
    function collectSubtree(root: Task, out: Task[]) {
      out.push(root);
      for (const child of childrenByParent.get(root.id) ?? []) collectSubtree(child, out);
    }
    const out: Task[] = [];
    for (const t of tasks) if (!t.parent_task_id && t.depth === 0 && rootMatches(t)) collectSubtree(t, out);
    return out;
  }, [tasks, tasklists, search, statusFilter, priorityFilter, assigneeFilter, assigneeValues.length]);

  const showCompleted = statusFilter.includes("closed");
  // Hiding completed alone is a view choice, not a filter needing "Clear filters".
  const hasActiveFilters =
    search.trim().length > 0 ||
    statusFilter.filter((s) => s !== "closed").length < STATUS_OPTS.length - 1 ||
    priorityFilter.length < PRIORITY_OPTS.length ||
    assigneeFilter.length < assigneeValues.length;

  function clearFilters() {
    setSearch("");
    setStatusFilter(STATUS_OPTS.filter((s) => s !== "closed" || showCompleted));
    setPriorityFilter([...PRIORITY_OPTS]);
    setAssigneeFilter(assigneeValues);
  }

  function setShowCompleted(on: boolean) {
    setStatusFilter((prev) => (on ? [...new Set([...prev, "closed"])] : prev.filter((s) => s !== "closed")));
  }

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortKey(key); setSortDir("asc"); }
  }

  // ─── Collapse / expand all — phases (`phase:<id>`) and task lists ─────────
  const allCollapseIds = useMemo(() => {
    const ids = tasklists.map((tl) => tl.id);
    const tasklistIds = new Set(ids);
    // Task 486 — the orphan group only renders when there's no General list to fold orphans into.
    const hasUnassigned = !generalTasklistId(tasklists) && tasks.some(
      (t) => !t.parent_task_id && t.depth === 0 && (!t.tasklist_id || !tasklistIds.has(t.tasklist_id))
    );
    const phases = [...milestones.map((m) => phaseKey(m.id)), phaseKey(NO_PHASE)];
    return [...phases, ...ids, ...(hasUnassigned ? [NO_LIST] : [])];
  }, [tasks, tasklists, milestones]);

  const anyCollapsed = collapsed.size > 0;
  const toggleCollapseAll = () => setCollapsed(anyCollapsed ? new Set() : new Set(allCollapseIds));
  const toggleCollapse = (id: string) => setCollapsed((prev) => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });

  return {
    search, setSearch, statusFilter, setStatusFilter, priorityFilter, setPriorityFilter, assigneeFilter, setAssigneeFilter,
    sortKey, sortDir, setSortKey, setSortDir, toggleSort, filteredTasks, hasActiveFilters, clearFilters,
    showCompleted, setShowCompleted, collapsed, anyCollapsed, toggleCollapseAll, toggleCollapse,
  };
}
