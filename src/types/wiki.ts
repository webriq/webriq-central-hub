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
  tags: string[];
};

export type WikiContributor = {
  id: string;
  name: string;
  // Task 403 — `profiles.avatar_url`; null/absent → initials fallback in `WikiAvatar`.
  avatarUrl?: string | null;
};

export type WikiPageDetail = WikiPageSummary & {
  contentHtml: string;
  tags: string[];
  createdAt: string;
  createdBy: WikiContributor | null;
  updatedBy: WikiContributor | null;
  contributors: WikiContributor[];
  relatedPages: WikiPageSummary[];
  // Task 402 — optimistic-concurrency token (bumps on every save; `version` stays publish-only).
  revision: number;
  // The caller's own autosaved draft (metadata only — content via GET .../draft).
  myDraft: WikiMyDraft | null;
  // Other users holding a draft on this page — identity + timestamps, never content.
  draftHolders: WikiDraftHolder[];
};

// Task 402 — page history, drafts, presence.

export type WikiRevisionKind = "save" | "publish" | "restore";

export type WikiRevisionSummary = {
  id: string;
  revision: number | null;
  version: number;
  kind: WikiRevisionKind;
  title: string;
  tags: string[];
  status: WikiStatus | null;
  restoredFrom: string | null;
  // The `revision` number of the snapshot a restore came from, resolved from the list itself.
  restoredFromRevision: number | null;
  editor: WikiContributor | null;
  createdAt: string;
};

export type WikiRevisionSnapshot = {
  id: string;
  revision: number | null;
  title: string;
  contentHtml: string;
  tags: string[];
  createdAt: string;
};

export type WikiRevisionDetail = {
  revision: WikiRevisionSnapshot;
  // The snapshot right before this one (null for the oldest) — the default diff baseline.
  previous: WikiRevisionSnapshot | null;
};

export type WikiMyDraft = {
  baseRevision: number;
  updatedAt: string;
};

export type WikiDraftContent = WikiMyDraft & {
  title: string;
  contentHtml: string;
  tags: string[];
};

export type WikiDraftHolder = {
  id: string;
  name: string;
  email: string | null;
  avatarUrl: string | null;
  updatedAt: string;
  baseRevision: number;
};

export type WikiPresenceMode = "viewing" | "editing";

// One entry per connected /kb tab, tracked on the shared `wiki-presence` Realtime channel.
export type WikiPresenceState = {
  userId: string;
  name: string;
  email: string | null;
  avatarUrl: string | null;
  pageId: string | null;
  mode: WikiPresenceMode;
  since: string;
};

export type WikiCurrentUser = {
  id: string;
  name: string;
  email: string | null;
  avatarUrl: string | null;
};

export type WikiConflictInfo = {
  revision: number;
  updatedBy: WikiContributor | null;
  updatedAt: string;
};
