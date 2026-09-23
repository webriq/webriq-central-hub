// Task 399 — Wiki spaces are their own fixed, independent 6-value catalog, matching
// `_final_design/wiki/wiki-mockup.html`'s Panel 1 exactly (task 395's original narrower
// 4-entry `ProductName` subset is dropped). Not `CLASSIFICATIONS` (project-engagement tracks)
// and not `ProductName` (real product identity) — Wiki spaces are illustrative/organizational,
// not tied to either enum.
export type WikiProduct =
  | "PipelineForge"
  | "PublishForge"
  | "CiteForge"
  | "StackShift I"
  | "StackShift II"
  | "Citation Grader";

export type WikiStatus = "draft" | "published" | "archived";

// Colors + badge letters copied verbatim from the mockup (task 399) — PipelineForge and
// PublishForge both use "P" there, differentiated only by color; kept as-is rather than
// inventing a disambiguated letter.
export const WIKI_PRODUCTS: { name: WikiProduct; color: string; badge: string }[] = [
  { name: "PipelineForge", color: "#2f6fed", badge: "P" },
  { name: "PublishForge", color: "#7c5cf0", badge: "P" },
  { name: "CiteForge", color: "#16a34a", badge: "C" },
  { name: "StackShift I", color: "#c8860a", badge: "S1" },
  { name: "StackShift II", color: "#e15b64", badge: "S2" },
  { name: "Citation Grader", color: "#0891b2", badge: "G" },
];

export type WikiPageSummary = {
  id: string;
  product: WikiProduct;
  parentId: string | null;
  title: string;
  status: WikiStatus;
  sortOrder: number;
  version: number;
  updatedAt: string;
};

export type WikiContributor = {
  id: string;
  name: string;
};

export type WikiPageDetail = WikiPageSummary & {
  contentHtml: string;
  tags: string[];
  createdAt: string;
  createdBy: WikiContributor | null;
  updatedBy: WikiContributor | null;
  contributors: WikiContributor[];
  relatedPages: WikiPageSummary[];
};
