import Link from "next/link";
import type { Metadata } from "next";
import { LayoutGrid, MoveRight } from "lucide-react";
import { V2_ROUTES } from "@/config/constants";

export const metadata: Metadata = { title: "Portfolio Tracker" };

// Task 280 — Portfolio Tracker is retired. Its listing/detail/onboarding-workspace content moved
// to /projects/v2 (task 276); Status Report and Import Project moved there too (task 280). Every
// other route under this folder (`[projectId]`, `onboarding-workspace`, `status-report`, `import`)
// has one unambiguous new home and redirects there; this root page doesn't (no single redirect
// target makes sense for a listing), so it stays as a visible, human-readable notice instead.
// No auth/role check needed here — the (hub) layout already gates auth for every route in this group.
export default function PortfolioTrackerRetiredPage() {
  return (
    <div className="min-h-full flex items-center justify-center px-6 py-16 bg-[#F4F6FB]">
      <div className="max-w-md w-full text-center">
        <div className="mx-auto mb-5 w-14 h-14 rounded-2xl bg-[#E5F1FF] flex items-center justify-center">
          <LayoutGrid size={24} className="text-[#007BFF]" />
        </div>

        <h1 className="font-heading text-[22px] font-bold tracking-[-0.02em] text-[#0B1533] mb-3">
          Portfolio Tracker has moved
        </h1>

        <p className="text-[13px] leading-relaxed text-[#3A4565] mb-2">
          This page is now part of{" "}
          <Link
            href={V2_ROUTES.PROJECTS_V2}
            className="font-semibold text-[#007BFF] hover:text-[#0063D6] underline underline-offset-2 transition-colors"
          >
            Projects → V2 Projects
          </Link>
          , with onboarding, milestones, and time tracking all in one place.
        </p>

        <p className="text-[13px] leading-relaxed text-[#5F6A88] mb-7">
          Looking for timeline tracking or phase management, like onboarding? Open a project and
          use its <span className="font-semibold text-[#3A4565]">Timeline</span> tab.
        </p>

        <Link
          href={V2_ROUTES.PROJECTS_V2}
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full bg-[#007BFF] text-white text-[13px] font-semibold transition-colors hover:bg-[#0063D6]"
        >
          Go to Projects <MoveRight size={15} />
        </Link>

        <p className="mt-8 text-[11px] font-medium text-[#5F6A88]">This page will be removed soon.</p>
      </div>
    </div>
  );
}
