"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { V2_ROUTES } from "@/config/constants";
import { useLastTab } from "./_use-last-tab";

// Task 279 — bare `/projects` has no content of its own; it redirects to whichever tab
// (`/projects/v2` or `/projects/legacy`) the user last visited (`_use-last-tab.ts`), defaulting
// to `/projects/v2` on first visit / no saved preference.
export default function ProjectsRedirectPage() {
  const router = useRouter();
  const { lastTab } = useLastTab();

  useEffect(() => {
    router.replace(lastTab === "legacy" ? V2_ROUTES.PROJECTS_LEGACY : V2_ROUTES.PROJECTS_V2);
  }, [lastTab, router]);

  return null;
}
