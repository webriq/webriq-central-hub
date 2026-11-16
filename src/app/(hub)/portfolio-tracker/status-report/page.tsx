import { redirect } from "next/navigation";
import { DEFAULT_CLASSIFICATION_TAB, classificationStatusReportHref } from "@/app/(hub)/projects/_classification-tabs";

// Portfolio Tracker is retired (task 280) — the status report is now per classification (/projects/<slug>/status-report).
export default function PortfolioTrackerStatusReportRedirect() {
  redirect(classificationStatusReportHref(DEFAULT_CLASSIFICATION_TAB));
}
