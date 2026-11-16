import { redirect } from "next/navigation";
import { V2_ROUTES } from "@/config/constants";

// Portfolio Tracker is retired (task 280) — Import Project moved to /projects/import (task 474).
export default function PortfolioTrackerImportRedirect() {
  redirect(V2_ROUTES.PROJECTS_IMPORT);
}
