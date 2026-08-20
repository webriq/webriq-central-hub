import { redirect } from "next/navigation";
import { V2_ROUTES } from "@/config/constants";

// Portfolio Tracker is retired (task 280) — the Overall Status Report moved to /projects/v2/status-report.
export default function PortfolioTrackerStatusReportRedirect() {
  redirect(V2_ROUTES.PROJECTS_V2_STATUS_REPORT);
}
