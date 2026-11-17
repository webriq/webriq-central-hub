"use client";

import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from "react";
import { Plus } from "lucide-react";
import type { ProjectStatusReportItem } from "./_status-report-types";
import { NewTaskLauncher } from "./_status-report-new-task";

// Task 479 — shared state for the Status Report's Tasks panels and its "New task" entry points.
// Only the classification report mounts this provider; the project's own Status Report tab doesn't,
// so `StatusReportTasksPanel` (which needs it) renders nothing there.
type Ctx = {
  /** `null` opens the project picker first; a project opens the New Task modal for it directly. */
  openNewTask: (project: ProjectStatusReportItem | null) => void;
  /** Bumped after a task is created so that project's panel re-fetches. Keyed by display project code. */
  refreshKey: (projectCode: string) => number;
};

const StatusReportTasksContext = createContext<Ctx | null>(null);

export function useStatusReportTasks(): Ctx | null {
  return useContext(StatusReportTasksContext);
}

// The report header's "New task" — the page's one orange CTA. Opens the project picker first.
export function NewTaskHeaderButton({ disabled }: { disabled?: boolean }) {
  const ctx = useStatusReportTasks();
  if (!ctx) return null;
  return (
    <button
      type="button"
      onClick={() => ctx.openNewTask(null)}
      disabled={disabled}
      className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-[#FB914E] text-[#471F02] text-[12.5px] font-medium hover:bg-[#E2762F] hover:text-white disabled:opacity-45 disabled:cursor-not-allowed cursor-pointer transition-colors shrink-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#007BFF]"
    >
      <Plus size={15} aria-hidden="true" /> New task
    </button>
  );
}

export function StatusReportTasksProvider({
  pickable,
  children,
}: {
  pickable: ProjectStatusReportItem[];
  children: ReactNode;
}) {
  const [refreshKeys, setRefreshKeys] = useState<Record<string, number>>({});
  const [launch, setLaunch] = useState<{ project: ProjectStatusReportItem | null } | null>(null);

  // Return keyboard focus to whichever "New task" button opened the flow once it closes.
  const returnFocus = useRef<HTMLElement | null>(null);
  const openNewTask = useCallback((project: ProjectStatusReportItem | null) => {
    returnFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setLaunch({ project });
  }, []);
  const close = useCallback(() => {
    setLaunch(null);
    requestAnimationFrame(() => returnFocus.current?.focus());
  }, []);
  const refreshKey = useCallback((code: string) => refreshKeys[code] ?? 0, [refreshKeys]);
  const value = useMemo(() => ({ openNewTask, refreshKey }), [openNewTask, refreshKey]);

  return (
    <StatusReportTasksContext.Provider value={value}>
      {children}
      {launch && (
        <NewTaskLauncher
          project={launch.project}
          pickable={pickable}
          onClose={close}
          onCreated={(code) => {
            setRefreshKeys((prev) => ({ ...prev, [code]: (prev[code] ?? 0) + 1 }));
            close();
          }}
        />
      )}
    </StatusReportTasksContext.Provider>
  );
}
