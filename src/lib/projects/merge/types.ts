// Task 468 — shared types for the project "Merge to…" wizard (server + client safe: no server imports).

export type Entity = "tasklist" | "milestone" | "task" | "ticket" | "folder" | "file" | "timelog";

/** move = re-key onto target · merge = fold into the matching target row · keep-both = move despite a match · skip = leave on the (archived) source. */
export type Resolution = "move" | "merge" | "keep-both" | "skip";

export type Finding = {
  id: string; // `${entity}:${sourceRowId}` — stable key for client decisions
  entity: Entity;
  label: string;
  detail: string;
  matchId: string | null; // the target row it collides with
  recommended: Resolution;
  options: Resolution[];
  needsAttention: boolean;
};

export type HeadsUp = { tone: "info" | "warn" | "block"; text: string };

export type EntityCount = { total: number; collisions: number };

export type MergePlan = {
  sourceId: string;
  targetId: string;
  sourceName: string;
  targetName: string;
  crossCustomer: boolean;
  counts: Record<Entity | "member" | "note", EntityCount>;
  findings: Finding[];
  headsUp: HeadsUp[];
  blocked: boolean;
  statusDiff: { status: string; source: number; target: number }[];
  // A previous run for this pair that did not finish — the wizard offers "Resume".
  resumable?: { mergeId: string; decisions: Decisions };
};

export type MergeStep = "tasklists" | "milestones" | "tasks" | "tickets" | "files" | "timelogs" | "extras" | "finalize";

export const MERGE_STEPS: { key: MergeStep; label: string }[] = [
  { key: "tasklists", label: "Task lists" },
  { key: "milestones", label: "Milestones" },
  { key: "tasks", label: "Tasks" },
  { key: "tickets", label: "Tickets" },
  { key: "files", label: "Files & folders" },
  { key: "timelogs", label: "Time logs" },
  { key: "extras", label: "Members & notes" },
  { key: "finalize", label: "Wrap-up" },
];

export type MergeSummary = { moved: number; merged: number; skipped: number };

/** NDJSON events streamed by merge/plan and merge/execute. */
export type MergeEvent =
  | { type: "note"; text: string }
  | { type: "plan"; plan: MergePlan }
  | { type: "started"; mergeId: string }
  | { type: "step"; step: MergeStep; done: number; total: number }
  | { type: "done"; summary: MergeSummary; mergeId: string | null }
  | { type: "error"; message: string; step?: MergeStep };

export type Decisions = Record<string, Resolution>;

export type CandidateProject = {
  id: string;
  project_id: string | null;
  name: string;
  customer_id: string;
  status: string;
  score: number;
};
