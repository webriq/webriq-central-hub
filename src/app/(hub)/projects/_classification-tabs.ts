import { CLASSIFICATIONS, type Classification } from "@/config/customer-phases";
import { V2_ROUTES } from "@/config/constants";

// Task 361 — the /projects listing's tab strip is one tab per classification plus Legacy,
// replacing task 279's two-tab (V2 / Legacy) badge + switch-link header and the V2 toolbar's
// Classification filter (the tab now *is* the classification selection).
//
// The active classification lives in `?tab=<slug>` on /projects/v2, NOT in a path segment:
// /projects/v2/[projectId] already owns that segment (and holds a display project_id there, per
// CLAUDE.md's `projects` bullet), so /projects/v2/stackshift-i would resolve as a project lookup.
//
// Plain module, no "use client" — imported by both the server page (v2/page.tsx) and the client
// shell (_listing-shell.tsx).

export type ClassificationTabId =
  | "stackshift-i"
  | "stackshift-ii"
  | "stackshift-access"
  | "stackshift-access-plus"
  | "pipelineforge"
  | "discrete-development";

export type ProjectsTabId = ClassificationTabId | "legacy";

export type ClassificationTab = {
  id: ClassificationTabId;
  classification: Classification;
};

// Keyed by Classification, so adding a seventh entry to CLASSIFICATIONS is a compile error here
// until it gets a slug — a drift can't silently produce a missing tab. The ClassificationTabId
// union guards the other direction (a typo'd slug won't type-check).
const TAB_ID_BY_CLASSIFICATION: Record<Classification, ClassificationTabId> = {
  "StackShift I": "stackshift-i",
  "StackShift II": "stackshift-ii",
  "StackShift Access": "stackshift-access",
  "StackShift Access Plus": "stackshift-access-plus",
  PipelineForge: "pipelineforge",
  "Discrete Development": "discrete-development",
};

// Tab order follows CLASSIFICATIONS' own order. No separate `label` field — a Classification
// value IS its own display label verbatim, so tab.classification / classificationForTab() serve
// both purposes and there's nothing to keep in sync.
export const CLASSIFICATION_TABS: ClassificationTab[] = CLASSIFICATIONS.map((classification) => ({
  id: TAB_ID_BY_CLASSIFICATION[classification],
  classification,
}));

export const DEFAULT_CLASSIFICATION_TAB: ClassificationTabId = "stackshift-i";

// A Record, not a Map, so indexing by a known ClassificationTabId is total — no `?? fallback`
// needed at the two lookup sites below, since TypeScript already guarantees every id has an entry.
const TAB_BY_ID: Record<ClassificationTabId, ClassificationTab> = Object.fromEntries(
  CLASSIFICATION_TABS.map((t) => [t.id, t])
) as Record<ClassificationTabId, ClassificationTab>;

export function isClassificationTabId(raw: unknown): raw is ClassificationTabId {
  return typeof raw === "string" && Object.hasOwn(TAB_BY_ID, raw);
}

export function isProjectsTabId(raw: unknown): raw is ProjectsTabId {
  return raw === "legacy" || isClassificationTabId(raw);
}

// An absent or unrecognized `?tab=` resolves to the default tab rather than 404ing — a stale
// bookmark or a hand-edited URL should land somewhere useful, not on an empty list.
export function parseClassificationTab(raw: string | null | undefined): ClassificationTabId {
  return isClassificationTabId(raw) ? raw : DEFAULT_CLASSIFICATION_TAB;
}

export function classificationForTab(id: ClassificationTabId): Classification {
  return TAB_BY_ID[id].classification;
}

// The classification value doubles as the tab's display label (see CLASSIFICATION_TABS above).
export function labelForTab(id: ClassificationTabId): string {
  return TAB_BY_ID[id].classification;
}

export function classificationTabHref(id: ClassificationTabId): string {
  return `${V2_ROUTES.PROJECTS_V2}?tab=${id}`;
}
