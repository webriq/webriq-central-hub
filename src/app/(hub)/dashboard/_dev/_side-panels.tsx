"use client";

import { FolderKanban, Layers } from "lucide-react";
import { cn } from "@/lib/utils";
import { Panel, EmptyState, OptionalLink, TRANSITION } from "./_ui";
import { formatRelativeToAnchor, projectInitials, projectTint, type DevProjectSummary } from "./_types";

// Task 360 — the two ranked project panels in the right rail.
//
// The mockup calls the first one "Recently accessed", but this schema has no page-visit log, so
// it is titled "Recently worked on" and derived from the developer's own activity: their most
// recent time log on the project, or their most recent touch of an assigned task/ticket there.

const RECENT_MAX = 4;
const WORKLOAD_MAX = 5;

function ProjectTile({ name, projectId }: { name: string; projectId: string }) {
  return (
    <span
      className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0 font-heading text-[11px] font-bold text-white"
      style={{ background: projectTint(projectId) }}
      aria-hidden="true"
    >
      {projectInitials(name)}
    </span>
  );
}

export function RecentlyWorkedOn({ projects, anchor }: { projects: DevProjectSummary[]; anchor: string }) {
  const rows = projects
    .filter((p) => p.lastActivityAt)
    .sort((a, b) => (a.lastActivityAt! < b.lastActivityAt! ? 1 : -1))
    .slice(0, RECENT_MAX);

  return (
    <Panel title="Recently worked on">
      {rows.length === 0 ? (
        <EmptyState
          icon={<FolderKanban size={16} />}
          title="No recent activity"
          body="Projects you log time against or update work on will appear here."
        />
      ) : (
        <div className="flex flex-col pb-1.5">
          {rows.map((p) => (
            <OptionalLink
              key={p.projectId}
              href={p.href}
              className={cn(
                "flex items-center gap-2.5 px-4 py-2.5 border-t border-[#EDF0F7] first:border-t-0",
                TRANSITION,
                "hover:bg-[#F0F7FF] focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[#007BFF]"
              )}
            >
              <ProjectTile name={p.name} projectId={p.projectId} />
              <span className="min-w-0 flex-1">
                <span className="block text-[12.5px] font-semibold text-[#0B1533] truncate">{p.name}</span>
                <span className="block text-[11px] text-[#5F6A88] truncate mt-px">{p.companyName ?? "—"}</span>
              </span>
              <span className="text-[11px] text-[#5F6A88] shrink-0 text-right">
                {formatRelativeToAnchor(p.lastActivityAt!, anchor)}
              </span>
            </OptionalLink>
          ))}
        </div>
      )}
    </Panel>
  );
}

export function HeaviestWorkload({ projects }: { projects: DevProjectSummary[] }) {
  const rows = projects
    .filter((p) => p.openCount > 0)
    .sort((a, b) => b.openCount - a.openCount)
    .slice(0, WORKLOAD_MAX);

  const max = rows[0]?.openCount ?? 0;

  return (
    <Panel title="Heaviest workload" hint="Open items">
      {rows.length === 0 ? (
        <EmptyState
          icon={<Layers size={16} />}
          title="Nothing assigned"
          body="Once work is assigned to you, the projects carrying most of it rank here."
        />
      ) : (
        <div className="flex flex-col gap-0.5 px-4 pb-3.5">
          {rows.map((p, i) => (
            <div key={p.projectId} className="flex items-center gap-2.5 py-2">
              <span className="font-mono text-[11px] text-[#C7CEDD] w-3.5 shrink-0">
                {String(i + 1).padStart(2, "0")}
              </span>
              <span className="text-[12.5px] font-semibold text-[#0B1533] w-[112px] shrink-0 truncate" title={p.name}>
                {p.name}
              </span>
              <span className="flex-1 h-[7px] bg-[#EDF0F7] rounded-[5px] overflow-hidden">
                <span
                  className="block h-full bg-[#007BFF] rounded-[5px]"
                  style={{ width: `${max > 0 ? (p.openCount / max) * 100 : 0}%` }}
                />
              </span>
              <span className="font-mono text-[11.5px] font-semibold text-[#5F6A88] w-5 text-right shrink-0">
                {p.openCount}
              </span>
            </div>
          ))}
        </div>
      )}
    </Panel>
  );
}
