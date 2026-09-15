"use client";

import { useRouter } from "next/navigation";
import { StatusBadge, SeverityBadge, decodeHtmlEntities, type TaskStatus } from "../../../_pm-shared";

// Sibling task/issue navigation list (task 257, Requirement H) — Zoho's reference shows a
// persistent left-hand list of other issues for fast navigation without returning to the list
// view. Scoped to same-project, assigned-to-current-user (with a same-project open-issues
// fallback for PM/admin viewers, who are rarely assignees) — see `page.tsx` for the queries.
export type QuickAccessTask = { id: string; display_id: string; title: string; status: string };
export type QuickAccessIssue = { id: string; display_id: string; title: string; status: string; severity: string | null };

function TypeChip({ label }: { label: "TASK" | "ISSUE" }) {
  return (
    <span className="text-[10px] font-mono text-[#5F6A88] bg-[#EDF0F7] px-1.5 py-0.5 rounded-[5px] shrink-0">
      {label}
    </span>
  );
}

export function IssueQuickAccessPanel({
  tasks,
  issues,
  projectId,
}: {
  tasks: QuickAccessTask[];
  issues: QuickAccessIssue[];
  projectId: string;
}) {
  const router = useRouter();

  if (tasks.length === 0 && issues.length === 0) {
    return <p className="text-[12px] text-[#5F6A88]">Nothing else assigned right now.</p>;
  }

  return (
    <ul className="flex flex-col gap-1 -m-1.5">
      {issues.map((i) => (
        <li key={`issue-${i.id}`}>
          <button
            type="button"
            onClick={() => router.push(`/projects-old/${projectId}/issues/${i.display_id}`)}
            className="w-full flex items-center gap-2 px-1.5 py-1.5 rounded-[8px] text-left cursor-pointer transition-colors hover:bg-[#F4F6FB]"
          >
            <TypeChip label="ISSUE" />
            <span className="flex-1 min-w-0 truncate text-[12px] text-[#3A4565]">
              {decodeHtmlEntities(i.title)}
            </span>
            <SeverityBadge severity={i.severity} />
          </button>
        </li>
      ))}
      {tasks.map((t) => (
        <li key={`task-${t.id}`}>
          <button
            type="button"
            onClick={() => router.push(`/projects-old/${projectId}/tasks/${t.display_id}`)}
            className="w-full flex items-center gap-2 px-1.5 py-1.5 rounded-[8px] text-left cursor-pointer transition-colors hover:bg-[#F4F6FB]"
          >
            <TypeChip label="TASK" />
            <span className="flex-1 min-w-0 truncate text-[12px] text-[#3A4565]">
              {decodeHtmlEntities(t.title)}
            </span>
            <StatusBadge status={t.status as TaskStatus} />
          </button>
        </li>
      ))}
    </ul>
  );
}
