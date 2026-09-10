import { redirect } from "next/navigation";
import { V2_ROUTES } from "@/config/constants";

// Portfolio Tracker is retired (task 280 / task 358) — the module's listing now lives at
// /projects/v2 (V2 Projects). Task 280 kept this root as a human-readable "has moved" notice;
// task 358 hard-redirects it in line with the sibling sub-routes and drops the sidebar "Tracker"
// item. Sub-routes ([projectId], onboarding-workspace, status-report, import) keep their own
// param-preserving redirects.
export default function PortfolioTrackerRedirect() {
  redirect(V2_ROUTES.PROJECTS_V2);
}
