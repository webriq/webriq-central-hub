"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { V2_ROUTES } from "@/config/constants";
import { useLastTab } from "./_use-last-tab";
import { classificationTabHref } from "./_classification-tabs";

// Task 279 — bare `/projects` has no content of its own; it redirects to whichever tab the user
// last visited (`_use-last-tab.ts`). Task 361 — that is now one of the six classification tabs
// (`/projects/v2?tab=<slug>`) or `/projects/legacy`, defaulting to StackShift I on first visit /
// no saved preference / a stale pre-361 `"v2"` value.
export default function ProjectsRedirectPage() {
  const router = useRouter();
  const { lastTab } = useLastTab();

  useEffect(() => {
    router.replace(lastTab === "legacy" ? V2_ROUTES.PROJECTS_LEGACY : classificationTabHref(lastTab));
  }, [lastTab, router]);

  return null;
}
