"use client";

import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";

// Task 276 (Phase 3) — tab-strip chrome extracted out of `_project-detail.tsx`'s inline
// "Primary tabs" JSX (behavior-preserving refactor — same markup/classes, just relocated) so
// the ported V2 Overview page (`_onboarding-detail.tsx`) can render an identical-looking strip
// with a 9th "Overview" entry prepended, without duplicating the pill markup. Task 282 (item 8)
// gave Legacy an Overview tab too — see `variant` below for what's still v2-only (Timeline).

export type DetailTabId =
  | "overview"
  | "timeline"
  | "tasks"
  | "issues"
  | "milestones"
  | "files"
  | "notes"
  | "access"
  | "members"
  | "status_report"
  | "time_logs";

const BASE_TABS: { id: DetailTabId; label: string }[] = [
  { id: "tasks", label: "Tasks" },
  { id: "issues", label: "Issues" },
  { id: "milestones", label: "Milestones" },
  { id: "files", label: "Files" },
  { id: "notes", label: "Notes" },
  { id: "access", label: "Access" },
  { id: "members", label: "Members" },
  { id: "status_report", label: "Status Report" },
  { id: "time_logs", label: "Time Logs" },
];

const OVERVIEW_TAB: { id: DetailTabId; label: string } = { id: "overview", label: "Overview" };
// Task 277 — Timeline holds the swimlane/programme content that used to live on the bare
// Overview route. V2-only — Legacy has no swimlane/programme concept and no `/timeline` route
// behind this pill. Task 282 (item 8) gave Legacy its own Overview tab, so "Overview visible"
// and "Timeline visible" are no longer the same gate — Overview is unconditional now, Timeline
// stays keyed off `variant`.
const TIMELINE_TAB: { id: DetailTabId; label: string } = { id: "timeline", label: "Timeline" };

export function ProjectDetailTabStrip({
  basePath,
  activeTab,
  variant,
  role,
}: {
  basePath: string;
  activeTab: DetailTabId;
  variant: "legacy" | "v2";
  // Task 282 — Status Report is hidden from `developer` (no role gate existed here before).
  role: string | null;
}) {
  const router = useRouter();
  const tabs = [OVERVIEW_TAB, ...(variant === "v2" ? [TIMELINE_TAB] : []), ...BASE_TABS]
    .filter((tab) => tab.id !== "status_report" || role !== "developer")
    // Task 311 — Notes is a staff-only tool (admin/super_admin/pm/developer, per migration
    // 120's RLS). Allowlist, not a denylist: `_get-project-detail-data.ts`'s `currentUserRole`
    // only resolves to a non-null value for those four roles in the first place (its own
    // `profilesRes` query is scoped to them) — a client/marketing/hr viewer's `role` here is
    // `null`, not the literal string "client"/"marketing", so a `role !== "client"` check would
    // never actually hide this pill from them.
    .filter((tab) => tab.id !== "notes" || ["admin", "super_admin", "pm", "developer"].includes(role ?? ""));

  return (
    <div className="flex items-center mt-4 overflow-x-auto">
      <div className="flex items-center gap-1 bg-[#F4F6FB] rounded-full p-1 shrink-0">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => router.push(`${basePath}/${tab.id}`)}
            className={cn(
              "px-3 py-1.5 rounded-full text-[12px] font-medium transition-colors cursor-pointer whitespace-nowrap",
              activeTab === tab.id
                ? "bg-white text-[#0B1533] shadow-[0_1px_2px_rgba(7,17,51,.05)]"
                : "text-[#5F6A88] hover:text-[#0B1533]"
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>
    </div>
  );
}
