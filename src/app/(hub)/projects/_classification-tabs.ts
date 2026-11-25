import { CLASSIFICATIONS, normalizeClassification, type Classification } from "@/config/customer-phases";
import { V2_ROUTES } from "@/config/constants";

// Task 361 — the /projects listing's tab strip is one tab per classification plus Legacy,
// replacing task 279's two-tab (V2 / Legacy) badge + switch-link header and the V2 toolbar's
// Classification filter (the tab now *is* the classification selection).
//
// Task 473 — the active classification is the path segment of /projects/[classification] (and
// /projects/[classification]/status-report). Static siblings `legacy` and `v2` win over the dynamic
// segment, so no slug may ever be "legacy", "v2" or "new". Old `/projects/v2?tab=<slug>` links
// redirect here (v2/page.tsx).
//
// Plain module, no "use client" — imported by server pages and client components alike.

export type ClassificationTabId =
  | "stackshift-i"
  | "stackshift-ii"
  | "stackshift-access"
  | "stackshift-access-plus"
  | "pipelineforge"
  | "flowforge";

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
  FlowForge: "flowforge",
};

// Task 504 — retired slugs. /projects/discrete-development… is 308'd to /projects/flowforge… in
// next.config.ts; this covers the old `?tab=` form, which parseClassificationTab resolves.
const LEGACY_TAB_IDS: Readonly<Record<string, ClassificationTabId>> = {
  "discrete-development": "flowforge",
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

// An absent or unrecognized legacy `?tab=` resolves to the default tab rather than 404ing — a stale
// bookmark or a hand-edited URL should land somewhere useful, not on an empty list.
export function parseClassificationTab(raw: string | null | undefined): ClassificationTabId {
  if (isClassificationTabId(raw)) return raw;
  if (raw && Object.hasOwn(LEGACY_TAB_IDS, raw)) return LEGACY_TAB_IDS[raw];
  return DEFAULT_CLASSIFICATION_TAB;
}

export function classificationForTab(id: ClassificationTabId): Classification {
  return TAB_BY_ID[id].classification;
}

// The classification value doubles as the tab's display label (see CLASSIFICATION_TABS above).
export function labelForTab(id: ClassificationTabId): string {
  return TAB_BY_ID[id].classification;
}

export function classificationTabHref(id: ClassificationTabId): string {
  return `${V2_ROUTES.PROJECTS}/${id}`;
}

export function classificationStatusReportHref(id: ClassificationTabId): string {
  return `${classificationTabHref(id)}/status-report`;
}

// Task 414 — classification value -> tab id, for callers that hold a project's classification
// strings (not a `?tab=` slug). Returns null for a value outside CLASSIFICATIONS. Task 504 — legacy
// stored values (pre-migration-192 "Discrete Development") resolve through the alias map.
export function tabIdForClassification(value: string): ClassificationTabId | null {
  const normalized = normalizeClassification(value);
  return Object.hasOwn(TAB_ID_BY_CLASSIFICATION, normalized) ? TAB_ID_BY_CLASSIFICATION[normalized as Classification] : null;
}

// Task 474 — project detail pages live at /projects/<slug>/<projectId>/…, where <slug> is one of the
// project's own classification tabs, or "unclassified" for a project with none.
export type ProjectSlug = ClassificationTabId | "unclassified";

export function projectHref(slug: ProjectSlug, projectId: string, sub = ""): string {
  return `${V2_ROUTES.PROJECTS}/${slug}/${projectId}${sub ? `/${sub}` : ""}`;
}

// For callers that don't know the project's classification (dashboards, timer, notifications, …):
// /projects/v2/<projectId>/… is a redirect-only route that looks it up (projects/v2/[[...rest]]).
export function projectResolverHref(projectId: string, sub = ""): string {
  return `${V2_ROUTES.PROJECTS_V2}/${projectId}${sub ? `/${sub}` : ""}`;
}
