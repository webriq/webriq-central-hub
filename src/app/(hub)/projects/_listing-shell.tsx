"use client";

import { useEffect } from "react";
import Link from "next/link";
import { LayoutGrid, ArrowLeftRight } from "lucide-react";
import { V2_ROUTES } from "@/config/constants";
import { useLastTab, type ProjectsTabId } from "./_use-last-tab";

// Shared header for the /projects/v2 and /projects/legacy listing routes (task 279; redesigned
// per follow-up request to drop the old draggable two-pill strip in favor of a single badge next
// to the title showing the current tab, plus one right-aligned link that switches to the other
// tab — there are only ever two tabs, so a "current state + one action" header reads clearer than
// two always-visible pills that needed drag-to-reorder).
//
// Fixed-light — was previously isDark-aware via usePMSettings' `theme` setting, but the only UI
// that ever wrote that setting lived in the pre-migration hub's Settings tab, retired (moved to
// the unrouted `_hub_(OLD)`) by task 255. Any browser with a stale `theme: "dark"` value from
// before that retirement had this page permanently stuck dark with no way to switch back. Matches
// the PM dashboard's existing "fixed-light" precedent for the v2.0 redesign.

const TAB_LABEL: Record<ProjectsTabId, string> = {
  v2: "V2 Projects",
  legacy: "Legacy Projects",
};

const TAB_BADGE: Record<ProjectsTabId, string> = {
  v2: "V2",
  legacy: "Legacy",
};

const TAB_BADGE_STYLE: Record<ProjectsTabId, string> = {
  v2: "bg-[#E5F1FF] text-[#0063D6]",
  legacy: "bg-[#EFEAFD] text-[#6A48E0]",
};

const TAB_ROUTE: Record<ProjectsTabId, string> = {
  v2: V2_ROUTES.PROJECTS_V2,
  legacy: V2_ROUTES.PROJECTS_LEGACY,
};

const OTHER_TAB: Record<ProjectsTabId, ProjectsTabId> = {
  v2: "legacy",
  legacy: "v2",
};

export default function ListingShell({
  activeTab, children,
}: {
  activeTab: ProjectsTabId;
  children: React.ReactNode;
}) {
  const { setLastTab } = useLastTab();
  const otherTab = OTHER_TAB[activeTab];

  // Remember whichever tab is currently being viewed, so bare `/projects` lands back here.
  useEffect(() => {
    setLastTab(activeTab);
  }, [activeTab, setLastTab]);

  return (
    <div className="min-h-full bg-[#F4F6FB]">
      {/* No bottom padding here — each listing's own sticky header below (_v2-listing/
          _onboarding-list.tsx, _legacy-listing/_projects-index.tsx) already opens with `pt-6`,
          so adding `pb-*` here would double the gap between this title row and the description
          line underneath it. */}
      <div className="max-w-350 mx-auto px-8 pt-6">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-2.5">
            <LayoutGrid size={20} className="text-[#5F6A88]" />
            <h1 className="font-heading text-[22px] font-bold tracking-[-0.02em] text-[#0B1533]">
              Projects
            </h1>
            <span className={`inline-flex items-center rounded-[5px] px-2 py-[2.5px] text-[10px] font-bold tracking-[0.02em] ${TAB_BADGE_STYLE[activeTab]}`}>
              {TAB_BADGE[activeTab]}
            </span>
          </div>

          <Link
            href={TAB_ROUTE[otherTab]}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-full border px-4 py-2 text-[12px] font-semibold transition-colors duration-150 border-[#E2E7F2] bg-white text-[#3A4565] hover:border-[#A8C6F5] hover:text-[#0B1533]"
          >
            <ArrowLeftRight size={13} />
            {TAB_LABEL[otherTab]}
          </Link>
        </div>
      </div>

      <div>{children}</div>
    </div>
  );
}
