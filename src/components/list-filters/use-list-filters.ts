"use client";

import { useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  ASSIGNEE_PARAM, DUE_PARAM, PROJECT_PARAM,
  parseDueParam, parseIdListParam, serializeDue, serializeIdList,
  type DueFilter,
} from "@/lib/list-filters/params";

// Task 491 — URL state for the Quick Links Tasks/Tickets filters. Every change is a
// `router.push` inside a transition (so the table can dim via `isPending` instead of the page
// freezing) and resets `page`; the server page re-queries from the new params.

export type Overrides = Record<string, string | number | null>;

export function useListFilters(baseRoute: string) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();

  const due = parseDueParam(searchParams.get(DUE_PARAM));
  const assignees = parseIdListParam(searchParams.get(ASSIGNEE_PARAM), { allowUnassigned: true });
  const projects = parseIdListParam(searchParams.get(PROJECT_PARAM));
  const search = searchParams.get("search")?.trim() ?? "";

  function buildUrl(overrides: Overrides) {
    const p = new URLSearchParams(searchParams.toString());
    for (const [k, v] of Object.entries(overrides)) {
      if (v === null) p.delete(k);
      else p.set(k, String(v));
    }
    const qs = p.toString();
    return qs ? `${baseRoute}?${qs}` : baseRoute;
  }

  function navigate(overrides: Overrides) {
    startTransition(() => router.push(buildUrl(overrides)));
  }

  const hasActiveFilters = due !== null || assignees.length > 0 || projects.length > 0 || search.length > 0;

  return {
    due,
    assignees,
    projects,
    isPending,
    hasActiveFilters,
    buildUrl,
    navigate,
    setDue: (next: DueFilter | null) => navigate({ [DUE_PARAM]: next ? serializeDue(next) : null, page: 1 }),
    setAssignees: (ids: string[]) => navigate({ [ASSIGNEE_PARAM]: serializeIdList(ids), page: 1 }),
    setProjects: (ids: string[]) => navigate({ [PROJECT_PARAM]: serializeIdList(ids), page: 1 }),
    // Drops due/assignee/project/search only — anything else (Tickets' `status`, `pageSize`) stays.
    clearFilters: () =>
      navigate({ [DUE_PARAM]: null, [ASSIGNEE_PARAM]: null, [PROJECT_PARAM]: null, search: null, page: null }),
  };
}
