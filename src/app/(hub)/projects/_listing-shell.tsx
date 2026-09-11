"use client";

import { useEffect } from "react";
import { LayoutGrid } from "lucide-react";
import { useLastTab } from "./_use-last-tab";
import type { ProjectsTabId } from "./_classification-tabs";

// Shared header for the /projects/v2 and /projects/legacy listing routes (task 279; simplified
// again in a task 361 follow-up). Classification switching now happens via seven sidebar links
// under the "Projects" nav group (v2-hub-sidebar.tsx) rather than an in-page tab strip — the two
// tab-strip designs this file used to render (task 279's badge + switch-link, then task 361's
// seven-pill row) are both gone; this header is title-only. The active classification/count still
// shows in each listing's own toolbar ("N StackShift I projects", _v2-listing/_onboarding-list.tsx).
//
// Fixed-light — was previously isDark-aware via usePMSettings' `theme` setting, but the only UI
// that ever wrote that setting lived in the pre-migration hub's Settings tab, retired (moved to
// the unrouted `_hub_(OLD)`) by task 255. Any browser with a stale `theme: "dark"` value from
// before that retirement had this page permanently stuck dark with no way to switch back. Matches
// the PM dashboard's existing "fixed-light" precedent for the v2.0 redesign.

export default function ListingShell({
  activeTab, children,
}: {
  activeTab: ProjectsTabId;
  children: React.ReactNode;
}) {
  const { setLastTab } = useLastTab();

  // Remember whichever tab is currently being viewed, so bare `/projects` (reached via the
  // sidebar's "Projects" parent icon) lands back here.
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
        <div className="flex items-center gap-2.5">
          <LayoutGrid size={20} className="text-[#5F6A88]" />
          <h1 className="font-heading text-[22px] font-bold tracking-[-0.02em] text-[#0B1533]">
            Projects
          </h1>
        </div>
      </div>

      <div>{children}</div>
    </div>
  );
}
