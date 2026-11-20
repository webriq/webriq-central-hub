"use client";

import { useEffect, useMemo, useState } from "react";
import { UserX, X } from "lucide-react";
import type { AssigneeMember } from "@/app/(hub)/projects/_shared/_assignee-multi-select";
import { UNASSIGNED } from "@/lib/list-filters/params";
import { DueDateFilter } from "./due-date-filter";
import { SearchableMultiFilter, type MultiFilterOption } from "./searchable-multi-filter";
import type { useListFilters } from "./use-list-filters";

// Task 491 — the Due date · Assignee · Project trio (+ Clear filters) shared by the Quick Links
// Tasks and Tickets toolbars. Members come from the page (both already fetch
// `/api/staff/members` for their assignee cells); projects are fetched here, once.

type ProjectRow = { id: string; name: string | null };

export function ListFilterBar({
  filters, members, currentUserId, onClear,
}: {
  filters: ReturnType<typeof useListFilters>;
  members: AssigneeMember[];
  currentUserId: string;
  // Lets the page reset local-only state (its debounced search input) alongside the URL.
  onClear?: () => void;
}) {
  const [projects, setProjects] = useState<ProjectRow[]>([]);
  useEffect(() => {
    let cancelled = false;
    fetch("/api/v2/projects")
      .then((res) => (res.ok ? res.json() : []))
      .then((rows: ProjectRow[]) => { if (!cancelled) setProjects(rows); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  const memberOptions = useMemo<MultiFilterOption[]>(
    () =>
      members
        .map((m) => ({ value: m.id, label: m.full_name ?? "Unknown", avatar: { name: m.full_name, url: m.avatar_url } }))
        .sort((a, b) => a.label.localeCompare(b.label)),
    [members]
  );

  const pinnedAssignees = useMemo<MultiFilterOption[]>(() => {
    const me = members.find((m) => m.id === currentUserId);
    return [
      { value: currentUserId, label: "Me", avatar: { name: me?.full_name ?? "Me", url: me?.avatar_url ?? null } },
      {
        value: UNASSIGNED,
        label: "Unassigned",
        icon: (
          <span className="w-6 h-6 rounded-full flex items-center justify-center bg-[#EDF0F7] text-[#5F6A88] shrink-0">
            <UserX size={12} />
          </span>
        ),
      },
    ];
  }, [members, currentUserId]);

  const projectOptions = useMemo<MultiFilterOption[]>(
    () =>
      projects
        .map((p) => ({ value: p.id.toLowerCase(), label: p.name ?? "Untitled project" }))
        .sort((a, b) => a.label.localeCompare(b.label)),
    [projects]
  );

  return (
    <>
      <DueDateFilter value={filters.due} onChange={filters.setDue} />
      <SearchableMultiFilter
        label="Assignee"
        headerLabel="Assignees"
        options={memberOptions}
        pinned={pinnedAssignees}
        selected={filters.assignees}
        onChange={filters.setAssignees}
        searchPlaceholder="Search members…"
        emptyText="No members found"
      />
      <SearchableMultiFilter
        label="Project"
        headerLabel="Projects"
        options={projectOptions}
        selected={filters.projects}
        onChange={filters.setProjects}
        searchPlaceholder="Search projects…"
        emptyText="No projects found"
      />
      {filters.hasActiveFilters && (
        <button
          type="button"
          onClick={() => { onClear?.(); filters.clearFilters(); }}
          className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-[11px] font-semibold text-[#5F6A88] hover:text-[#0B1533] hover:bg-white cursor-pointer transition-colors shrink-0"
        >
          <X size={12} /> Clear filters
        </button>
      )}
    </>
  );
}
