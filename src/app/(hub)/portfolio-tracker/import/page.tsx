import { redirect } from "next/navigation";
import { V2_ROUTES } from "@/config/constants";

// Portfolio Tracker is retired (task 280) — Import Project moved to /projects/v2/import.
export default function PortfolioTrackerImportRedirect() {
  redirect(V2_ROUTES.PROJECTS_V2_IMPORT);
}
