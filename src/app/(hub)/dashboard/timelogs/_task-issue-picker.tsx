"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import { Search } from "lucide-react";
import { decodeHtmlEntities } from "@/app/(hub)/projects-old/_pm-shared";
import { cn } from "@/lib/utils";
import { usePopoverPosition, POPOVER_ROOT_ATTR } from "./_use-popover-position";

// Task/Issues field for the Add/Edit Time Log modal, redesigned as a search-only trigger (no
// chevron) opening a Tasks/Issues-tabbed, scroll-revealed panel, with a switch to a free-text
// "General Log" mode (task 230, Requirements 5/6). Used by both the modal (Add + Edit) and the
// table's inline Log Title cell editor (Requirement 14).
//
// `GET /api/v2/projects/[projectId]/tasks` and `.../issues` both already return their *complete*
// list in one response — for 100+-item projects the fix is client-side windowed rendering
// (mirrors `notification-bell.tsx`'s `visibleLimit`/scroll-reveal pattern), not new server
// pagination (task doc Assumption 5).
export type TaskIssueValue =
  | { kind: "task"; id: string; label: string; displayId: string | null }
  | { kind: "issue"; id: string; label: string; displayId: string | null }
  | { kind: "general"; text: string };

type PickerItem = { id: string; title: string; created_at: string; displayId: string | null };

const INITIAL_VISIBLE = 30;
const REVEAL_STEP = 30;
const SCROLL_THRESHOLD_PX = 80;

function sortNewestFirst(items: PickerItem[]): PickerItem[] {
  return [...items].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
}

function selectedKind(value: TaskIssueValue | null): "task" | "issue" | null {
  if (!value || value.kind === "general") return null;
  return value.kind;
}

function selectedId(value: TaskIssueValue | null): string | null {
  if (!value || value.kind === "general") return null;
  return value.id;
}

export function TaskIssuePicker({
  projectId, currentUserId, value, onChange, tasksAssignedOnly = true, disabled, onClose,
}: {
  projectId: string; // public project_id — empty string means no project chosen yet
  currentUserId: string;
  value: TaskIssueValue | null;
  onChange: (v: TaskIssueValue | null) => void;
  tasksAssignedOnly?: boolean;
  disabled?: boolean;
  // Task 294 — fires when the search/dropdown panel closes (pick, outside click, or Escape). The
  // trigger doubles as the search input here (no separate portaled input to steal focus the way
  // `SearchableSelect`'s does), but clicking a portaled option/tab still blurs the trigger before
  // any value is committed — `onClose` gives callers a "genuinely done with this field" signal
  // that doesn't depend on that blur bubbling correctly.
  onClose?: () => void;
}) {
  const [tasks, setTasks] = useState<PickerItem[]>([]);
  const [issues, setIssues] = useState<PickerItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [, startFetchTransition] = useTransition();

  const [mode, setMode] = useState<"picker" | "general">(value?.kind === "general" ? "general" : "picker");
  const [generalText, setGeneralText] = useState(value?.kind === "general" ? value.text : "");

  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<"tasks" | "issues">("tasks");
  const [query, setQuery] = useState("");
  const [visibleLimit, setVisibleLimit] = useState(INITIAL_VISIBLE);

  const triggerRef = useRef<HTMLInputElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const pos = usePopoverPosition(open, triggerRef, panelRef, 260);

  useEffect(() => {
    const ctrl = new AbortController();
    // Wrapped in startTransition (not bare setState calls in the effect body) — mirrors
    // `_time-log-entry-modal.tsx`'s own task-fetch effect, working around the same
    // `react-hooks/set-state-in-effect` rule this codebase already routes around elsewhere in
    // this feature area (tasks 226/228).
    startFetchTransition(async () => {
      if (!projectId) {
        setTasks([]);
        setIssues([]);
        return;
      }
      setLoading(true);
      try {
        const [taskData, issueData]: [
          { id: string; title: string; assignees: string[] | null; created_at: string; display_id: string | null }[],
          { id: string; title: string; created_at: string; display_id: string | null }[],
        ] = await Promise.all([
          fetch(`/api/v2/projects/${projectId}/tasks`, { signal: ctrl.signal }).then((r) => (r.ok ? r.json() : [])),
          fetch(`/api/v2/projects/${projectId}/issues`, { signal: ctrl.signal }).then((r) => (r.ok ? r.json() : [])),
        ]);
        const scopedTasks = tasksAssignedOnly ? taskData.filter((t) => t.assignees?.includes(currentUserId)) : taskData;
        setTasks(sortNewestFirst(scopedTasks.map((t) => ({ id: t.id, title: t.title, created_at: t.created_at, displayId: t.display_id }))));
        setIssues(sortNewestFirst(issueData.map((i) => ({ id: i.id, title: i.title, created_at: i.created_at, displayId: i.display_id }))));
      } catch {
        setTasks([]);
        setIssues([]);
      } finally {
        setLoading(false);
      }
    });
    return () => ctrl.abort();
  }, [projectId, currentUserId, tasksAssignedOnly]);

  const close = useCallback(() => {
    setOpen(false);
    setQuery("");
    onClose?.();
  }, [onClose]);

  useEffect(() => {
    if (!open) return;
    function handleOutside(e: MouseEvent) {
      const t = e.target as Node;
      if (triggerRef.current?.contains(t) || panelRef.current?.contains(t)) return;
      close();
    }
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") close();
    }
    document.addEventListener("mousedown", handleOutside);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("mousedown", handleOutside);
      document.removeEventListener("keydown", handleKey);
    };
  }, [open, close]);

  function openPanel() {
    if (disabled) return;
    setOpen(true);
    setQuery("");
    setVisibleLimit(INITIAL_VISIBLE);
  }

  const activeList = tab === "tasks" ? tasks : issues;
  const filtered = useMemo(
    () => activeList.filter((i) => i.title.toLowerCase().includes(query.trim().toLowerCase())),
    [activeList, query]
  );
  const visible = filtered.slice(0, visibleLimit);
  const hasMore = filtered.length > visibleLimit;

  function handleScroll(e: React.UIEvent<HTMLDivElement>) {
    const el = e.currentTarget;
    if (hasMore && el.scrollTop + el.clientHeight >= el.scrollHeight - SCROLL_THRESHOLD_PX) {
      setVisibleLimit((v) => v + REVEAL_STEP);
    }
  }

  function pick(kind: "task" | "issue", item: PickerItem) {
    onChange({ kind, id: item.id, label: item.title, displayId: item.displayId });
    close();
  }

  function switchToGeneral() {
    close();
    setMode("general");
    onChange(generalText ? { kind: "general", text: generalText } : null);
  }

  function switchToPicker() {
    setMode("picker");
    onChange(selectedKind(value) ? value : null);
  }

  function handleGeneralChange(text: string) {
    setGeneralText(text);
    onChange({ kind: "general", text });
  }

  if (mode === "general") {
    return (
      <div className="flex flex-col gap-1">
        <textarea
          value={generalText}
          onChange={(e) => handleGeneralChange(e.target.value)}
          rows={3}
          placeholder="Describe the work you did…"
          disabled={disabled}
          className="w-full px-3 py-2 rounded-[10px] border text-[13px] outline-none transition-colors border-[#E2E7F2] bg-white text-[#3A4565] resize-none focus:border-[#007BFF] focus:ring-[3px] focus:ring-[#007BFF]/[0.14] disabled:opacity-50 disabled:cursor-not-allowed"
        />
        <button
          type="button"
          onClick={switchToPicker}
          className="self-start text-[11px] font-semibold text-[#0063D6] hover:underline cursor-pointer"
        >
          Select Tasks/Issues
        </button>
      </div>
    );
  }

  const selKind = selectedKind(value);
  const selId = selectedId(value);
  const selectedLabel = value && value.kind !== "general" ? decodeHtmlEntities(value.label) : "";

  return (
    <div className="flex flex-col gap-1">
      <div className="relative">
        <Search size={12} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[#5F6A88]" />
        <input
          ref={triggerRef}
          type="text"
          value={open ? query : selectedLabel}
          onChange={(e) => {
            setQuery(e.target.value);
            setVisibleLimit(INITIAL_VISIBLE);
          }}
          onFocus={openPanel}
          placeholder="Search tasks or issues…"
          disabled={disabled}
          className="w-full pl-8 pr-3 py-2 rounded-[10px] border text-[13px] outline-none transition-colors border-[#E2E7F2] bg-[#F4F6FB] text-[#3A4565] focus:border-[#007BFF] focus:bg-white focus:ring-[3px] focus:ring-[#007BFF]/[0.14] disabled:opacity-50 disabled:cursor-not-allowed"
        />
      </div>
      <button
        type="button"
        onClick={switchToGeneral}
        className="self-start text-[11px] font-semibold text-[#0063D6] hover:underline cursor-pointer"
      >
        Enter General Log
      </button>

      {open && pos && createPortal(
        <div
          ref={panelRef}
          {...{ [POPOVER_ROOT_ATTR]: true }}
          style={{ position: "fixed", top: pos.top, bottom: pos.bottom, left: pos.left, width: pos.width }}
          className="z-50 overflow-hidden rounded-lg border border-[#E2E7F2] bg-white shadow-[0_8px_24px_rgba(7,17,51,0.10)]"
        >
          <div className="flex items-center border-b border-[#EDF0F7]">
            {(["tasks", "issues"] as const).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => {
                  setTab(t);
                  setVisibleLimit(INITIAL_VISIBLE);
                }}
                className={cn(
                  "flex-1 px-3 py-2 text-[11px] font-semibold cursor-pointer transition-colors border-b-2 -mb-px",
                  tab === t ? "border-[#FB914E] text-[#0B1533]" : "border-transparent text-[#5F6A88] hover:text-[#0B1533]"
                )}
              >
                {t === "tasks" ? "Tasks" : "Issues"}
              </button>
            ))}
          </div>
          <div className="max-h-[220px] overflow-y-auto p-1" onScroll={handleScroll}>
            {loading ? (
              <div className="px-2 py-3 text-[11.5px] text-[#5F6A88]">Loading…</div>
            ) : visible.length === 0 ? (
              <div className="px-2 py-3 text-[11.5px] text-[#5F6A88]">
                {tab === "tasks" && tasksAssignedOnly && tasks.length === 0
                  ? "You have no assigned tasks in this project."
                  : "No matches"}
              </div>
            ) : (
              visible.map((item) => {
                const kind = tab === "tasks" ? "task" : "issue";
                const isSelected = selKind === kind && selId === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => pick(kind, item)}
                    className={cn(
                      "flex w-full cursor-pointer items-center rounded-md px-2.5 py-2 text-left text-[13px] transition-colors hover:bg-[#F4F6FB]",
                      isSelected ? "bg-[#F0F7FF] font-medium text-[#0B1533]" : "text-[#3A4565]"
                    )}
                  >
                    {decodeHtmlEntities(item.title)}
                  </button>
                );
              })
            )}
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
