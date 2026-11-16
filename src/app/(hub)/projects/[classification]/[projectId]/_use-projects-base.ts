"use client";

import { useParams } from "next/navigation";
import { V2_ROUTES } from "@/config/constants";

// Task 474 — "/projects/<slug>" for links to sibling pages of the open project, so navigation stays
// in the classification you're in. Some of these components also render outside the project route
// (e.g. _onboarding-detail on /customers/[customerId]); there's no slug there, so fall back to the
// /projects/v2 resolver, which redirects to the project's own classification.
export function useProjectsBase(): string {
  const { classification } = useParams<{ classification?: string }>();
  return classification ? `${V2_ROUTES.PROJECTS}/${classification}` : V2_ROUTES.PROJECTS_V2;
}
