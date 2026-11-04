// Task 468 — pure plan builder: two ProjectData snapshots in, MergePlan out. No I/O, deterministic.
import { fileKey, folderPaths, logKey, norm, taskKey } from "./keys";
import type { Decisions, Entity, EntityCount, Finding, HeadsUp, MergePlan, Resolution } from "./types";

export type TaskRow = { id: string; title: string; status: string; parent_task_id: string | null; tasklist_id: string | null; milestone_id: string | null; kind: string | null; checklist_key: string | null };
export type NamedRow = { id: string; name: string; status?: string | null };
export type TicketRow = { id: string; title: string; status: string };
export type FolderRow = { id: string; name: string; parent_folder_id: string | null; phase_number: number | null };
export type FileRow = { id: string; label: string; type: string; folder_id: string | null; file_size: number | null };
export type LogRow = { id: string; task_id: string | null; employee_id: string | null; date_logged: string; hours: number | string; note: string | null };

export type ProjectData = {
  id: string; name: string; customerId: string;
  tasks: TaskRow[]; tasklists: NamedRow[]; milestones: NamedRow[]; tickets: TicketRow[];
  folders: FolderRow[]; files: FileRow[]; logs: LogRow[];
  memberIds: string[]; noteCount: number; runningTimers: string[]; hasProgramme: boolean;
};

const FOLD: Resolution[] = ["merge", "keep-both", "skip"];

function finding(entity: Entity, id: string, label: string, detail: string, matchId: string, rec: Resolution, options: Resolution[], attention: boolean): Finding {
  return { id: `${entity}:${id}`, entity, label, detail, matchId, recommended: rec, options, needsAttention: attention };
}

/** Which source ids end up folded into which target id, given decisions (used by the plan and the executor). */
export function matchMap(findings: Finding[], decisions: Decisions, entity: Entity): Map<string, string> {
  const m = new Map<string, string>();
  for (const f of findings) {
    if (f.entity !== entity || !f.matchId) continue;
    if ((decisions[f.id] ?? f.recommended) === "merge") m.set(f.id.slice(entity.length + 1), f.matchId);
  }
  return m;
}

export function buildPlan(src: ProjectData, tgt: ProjectData): MergePlan {
  const findings: Finding[] = [];
  const named = (rows: NamedRow[]) => new Map(rows.map((r) => [norm(r.name), r]));

  // task lists + milestones: same normalized name → fold into the target's
  const tgtLists = named(tgt.tasklists), tgtMs = named(tgt.milestones);
  const listName = new Map(src.tasklists.map((l) => [l.id, l.name]));
  const tgtListName = new Map(tgt.tasklists.map((l) => [l.id, l.name]));
  for (const l of src.tasklists) {
    const m = tgtLists.get(norm(l.name));
    if (m) findings.push(finding("tasklist", l.id, l.name, "Same task list already exists in the target.", m.id, "merge", FOLD, false));
  }
  for (const ms of src.milestones) {
    const m = tgtMs.get(norm(ms.name));
    if (!m) continue;
    const clash = ms.status && m.status && ms.status !== m.status;
    findings.push(finding("milestone", ms.id, ms.name, clash ? `Same milestone, but ${ms.status} here vs ${m.status} in the target.` : "Same milestone already exists in the target.", m.id, "merge", FOLD, !!clash));
  }

  // tasks (checklist rows are never listed)
  const real = (t: TaskRow) => t.kind !== "checklist";
  const tgtTasks = new Map<string, TaskRow>();
  for (const t of tgt.tasks.filter(real)) tgtTasks.set(taskKey(t.title, t.tasklist_id ? tgtListName.get(t.tasklist_id) ?? null : null), t);
  for (const t of src.tasks.filter(real)) {
    const m = tgtTasks.get(taskKey(t.title, t.tasklist_id ? listName.get(t.tasklist_id) ?? null : null));
    if (!m) continue;
    const same = m.status === t.status;
    const bothOpen = !["done", "cancelled"].includes(t.status) && !["done", "cancelled"].includes(m.status);
    findings.push(finding("task", t.id, t.title, same ? "Identical title in the same list, same status — looks redundant." : `Identical title in the same list; ${t.status} here vs ${m.status} in the target.`, m.id, same ? "merge" : "keep-both", FOLD, !same || bothOpen));
  }

  // tickets: never auto-fold customer correspondence — flag, keep both by default
  const tgtTickets = new Map(tgt.tickets.map((t) => [norm(t.title), t]));
  for (const t of src.tickets) {
    const m = tgtTickets.get(norm(t.title));
    if (m) findings.push(finding("ticket", t.id, t.title, "A ticket with this title already exists in the target.", m.id, "keep-both", ["keep-both", "skip"], true));
  }

  // folders: same path → fold; files: same path+name(+size) → exact duplicate
  const sp = folderPaths(src.folders), tp = folderPaths(tgt.folders);
  const tgtByPath = new Map(tgt.folders.map((f) => [tp.get(f.id)!, f]));
  for (const f of src.folders) {
    const m = tgtByPath.get(sp.get(f.id)!);
    if (m) findings.push(finding("folder", f.id, f.name, "Folder with the same path exists in the target — contents will be combined.", m.id, "merge", ["merge", "keep-both"], false));
  }
  const tgtFiles = new Map<string, FileRow>();
  for (const f of tgt.files) tgtFiles.set(fileKey(f.folder_id ? tp.get(f.folder_id) ?? "" : "", f.label, f.file_size), f);
  for (const f of src.files) {
    const m = tgtFiles.get(fileKey(f.folder_id ? sp.get(f.folder_id) ?? "" : "", f.label, f.file_size));
    if (m) findings.push(finding("file", f.id, f.label, "Same name, size and folder as a file already in the target — redundant copy.", m.id, "skip", ["skip", "keep-both"], false));
  }

  // time logs of tasks that may fold: identical entries are redundant
  const taskMatch = new Map(findings.filter((f) => f.entity === "task").map((f) => [f.id.slice(5), f.matchId!]));
  const tgtLogs = new Set(tgt.logs.map((l) => `${l.task_id}|${logKey(l)}`));
  for (const l of src.logs) {
    const tm = l.task_id ? taskMatch.get(l.task_id) : undefined;
    if (tm && tgtLogs.has(`${tm}|${logKey(l)}`)) findings.push(finding("timelog", l.id, `${l.date_logged} · ${Number(l.hours)}h`, "Identical entry already logged on the matching task.", tm, "skip", ["skip", "move"], false));
  }

  const headsUp: HeadsUp[] = [];
  const crossCustomer = src.customerId !== tgt.customerId;
  if (crossCustomer) headsUp.push({ tone: "warn", text: "These projects belong to different customers. Files will be re-assigned to the target's customer." });
  if (src.runningTimers.length) headsUp.push({ tone: "block", text: `${src.runningTimers.length} timer(s) are still running on this project. Stop them before merging.` });
  if (src.hasProgramme && tgt.hasProgramme) headsUp.push({ tone: "warn", text: "Both projects have a programme timeline. The target's timeline is kept; the source's is not merged." });
  const dupFiles = findings.filter((f) => f.entity === "file").length;
  if (dupFiles) headsUp.push({ tone: "info", text: `${dupFiles} file${dupFiles > 1 ? "s are" : " is"} an exact duplicate and won't be copied. They stay on the archived source.` });
  const redundant = findings.filter((f) => f.entity === "task" && f.recommended === "merge").length;
  if (redundant) headsUp.push({ tone: "info", text: `${redundant} task${redundant > 1 ? "s look" : " looks"} redundant; their comments and time will be folded into the matching target task.` });
  const emptyFolders = src.folders.filter((f) => !src.files.some((x) => x.folder_id === f.id) && !src.folders.some((c) => c.parent_folder_id === f.id)).length;
  if (emptyFolders) headsUp.push({ tone: "info", text: `${emptyFolders} empty folder${emptyFolders > 1 ? "s" : ""} will come along; you may want to tidy them afterwards.` });

  const count = (entity: Entity, total: number): EntityCount => ({ total, collisions: findings.filter((f) => f.entity === entity).length });
  const statuses = [...new Set([...src.tasks, ...tgt.tasks].filter(real).map((t) => t.status))].sort();
  return {
    sourceId: src.id, targetId: tgt.id, sourceName: src.name, targetName: tgt.name, crossCustomer,
    counts: {
      tasklist: count("tasklist", src.tasklists.length), milestone: count("milestone", src.milestones.length),
      task: count("task", src.tasks.filter(real).length), ticket: count("ticket", src.tickets.length),
      folder: count("folder", src.folders.length), file: count("file", src.files.length), timelog: count("timelog", src.logs.length),
      member: { total: src.memberIds.length, collisions: src.memberIds.filter((m) => tgt.memberIds.includes(m)).length },
      note: { total: src.noteCount, collisions: 0 },
    },
    findings, headsUp, blocked: headsUp.some((h) => h.tone === "block"),
    statusDiff: statuses.map((status) => ({ status, source: src.tasks.filter((t) => real(t) && t.status === status).length, target: tgt.tasks.filter((t) => real(t) && t.status === status).length })),
  };
}
