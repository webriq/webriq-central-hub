// Task 464 — pure logic for the Zoho Project Documents import (no I/O, so it can be checked with
// `npx tsx _docs/task/464-zoho-documents-import.check.ts`). The route does every read/write.
import { extensionMimeForName } from "@/config/upload-mime";
import { POWERPOINT_EXTENSION_INFO } from "@/config/powerpoint-types";

// One exported WorkDrive item, reduced to what the import needs (the route slims the raw JSON).
export type DocItem = {
  id: string;
  name: string; // attributes.name — exact, NOT the HTML-escaped display_attr_name
  extn: string;
  isFolder: boolean;
  parentId: string; // attributes.parent_id (== _zoho_parent_workdrive_id for every exported item)
  rootName: string; // _zoho_root_folder
  projectId: string; // _zoho_project_id
  declaredBytes: number; // storage_info.size_in_bytes — unreliable (0 for real files), see classifyFile
  createdMs: number | null;
};

export type TreeFolder = { id: string; name: string; parentId: string | null; path: string[] };
export type TreeFile = {
  id: string;
  name: string;
  extn: string;
  folderId: string;
  path: string[]; // exact folder names, root to parent
  declaredBytes: number;
  createdMs: number | null;
};
export type ProjectTree = {
  projectId: string;
  folders: TreeFolder[]; // roots first, then breadth-first — a parent always precedes its children
  files: TreeFile[];
  unreachable: string[]; // items that no root reaches (cycle/orphan); reported, never imported
};

const push = <K, V>(m: Map<K, V[]>, k: K, v: V) => {
  const a = m.get(k);
  if (a) a.push(v);
  else m.set(k, [v]);
};

export function buildProjectTrees(items: readonly DocItem[]): Map<string, ProjectTree> {
  const byProject = new Map<string, DocItem[]>();
  for (const it of items) push(byProject, it.projectId, it);
  const out = new Map<string, ProjectTree>();
  for (const [projectId, list] of byProject) out.set(projectId, buildTree(projectId, list));
  return out;
}

function buildTree(projectId: string, list: DocItem[]): ProjectTree {
  const folderIds = new Set(list.filter((i) => i.isFolder).map((i) => i.id));
  // A root is a parent id that is not itself an exported folder; its name rides on every item in the project.
  const rootNames = new Map<string, string>();
  for (const i of list) if (!folderIds.has(i.parentId) && !rootNames.has(i.parentId)) rootNames.set(i.parentId, i.rootName);

  const children = new Map<string, DocItem[]>();
  for (const i of list) push(children, i.parentId, i);

  const folders: TreeFolder[] = [...rootNames].map(([id, name]) => ({ id, name, parentId: null, path: [name] }));
  const files: TreeFile[] = [];
  const seen = new Set<string>();
  // `folders` doubles as the BFS queue (it only grows while we walk it)
  for (let q = 0; q < folders.length; q++) {
    const f = folders[q];
    for (const c of children.get(f.id) ?? []) {
      seen.add(c.id);
      if (c.isFolder) folders.push({ id: c.id, name: c.name, parentId: f.id, path: [...f.path, c.name] });
      else files.push({ id: c.id, name: c.name, extn: c.extn, folderId: f.id, path: f.path, declaredBytes: c.declaredBytes, createdMs: c.createdMs });
    }
  }
  return { projectId, folders, files, unreachable: list.filter((i) => !seen.has(i.id)).map((i) => i.id) };
}

// ── Folder names ──────────────────────────────────────────────────────────────

const FROM_ZOHO_SUFFIX = " (From Zoho)";

// `taken` holds the LOWERCASED names already used under the target parent. Free → the exact Zoho
// name; taken → "<name> (From Zoho)", then "(From Zoho 2)", "(From Zoho 3)", …
export function resolveFolderName(taken: ReadonlySet<string>, name: string): string {
  if (!taken.has(name.toLowerCase())) return name;
  let candidate = `${name}${FROM_ZOHO_SUFFIX}`;
  for (let n = 2; taken.has(candidate.toLowerCase()); n++) candidate = `${name} (From Zoho ${n})`;
  return candidate;
}

// ── File classification ───────────────────────────────────────────────────────

// Zoho-native documents download as Office files (spike 2026-10-28: zwriter→docx, zsheet→xlsx, zslides→pptx).
const NATIVE_EXPORT_EXT: Readonly<Record<string, string>> = { zwriter: "docx", zsheet: "xlsx", zslides: "pptx" };

const EXT_MIME: Record<string, string> = {
  jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", gif: "image/gif", webp: "image/webp", svg: "image/svg+xml",
  pdf: "application/pdf", doc: "application/msword",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xls: "application/vnd.ms-excel",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  html: "text/html", htm: "text/html", md: "text/markdown", txt: "text/plain", csv: "text/csv",
  ico: "image/x-icon", zip: "application/zip", rar: "application/vnd.rar", js: "text/javascript",
  ts: "video/mp2t", xml: "application/xml", // ".ts" is sniffed as MPEG-TS, which is why the bucket lists video/mp2t
  ...Object.fromEntries(Object.entries(POWERPOINT_EXTENSION_INFO).map(([ext, v]) => [ext, v.mime])),
};

const own = <T>(o: Readonly<Record<string, T>>, k: string): T | undefined => (Object.hasOwn(o, k) ? o[k] : undefined);

const fileExt = (f: { name: string; extn: string }) => (f.extn || f.name.split(".").pop() || "").toLowerCase();

// Fonts + design files resolve through the shared extension resolver (task 451); everything else via EXT_MIME.
export const mimeForExt = (ext: string): string | null => extensionMimeForName(`x.${ext}`) ?? own(EXT_MIME, ext) ?? null;

export type FileClass =
  | { kind: "import"; mime: string }
  | { kind: "native"; exportExt: string }
  | { kind: "unsupported-type" }
  | { kind: "too-large" };

// `allowedMimes` is the bucket policy (ALLOWED_MIME_TYPES) — passed in so this module stays free of the
// Supabase client and the policy has a single source. `declaredBytes` is only a pre-check: the export
// declares 0 bytes for 570 real files, so the route re-checks the downloaded byte length.
export function classifyFile(
  f: { name: string; extn: string; declaredBytes: number },
  allowedMimes: readonly string[],
  maxBytes: number,
): FileClass {
  const ext = fileExt(f);
  const exportExt = own(NATIVE_EXPORT_EXT, ext);
  if (exportExt) return { kind: "native", exportExt };
  const mime = mimeForExt(ext);
  if (!mime || !allowedMimes.includes(mime)) return { kind: "unsupported-type" };
  if (f.declaredBytes > maxBytes) return { kind: "too-large" };
  return { kind: "import", mime };
}

// ── Local copies of files the Files tab can't take ───────────────────────────

const safeSeg = (s: string) => {
  const t = s.replace(/[\\/:\0]/g, "_").trim();
  return t === "" || t === "." || t === ".." ? "_" : t;
};

// Relative path per file id, mirroring the Zoho tree under `projectDir`. Deterministic for a given file
// list (so re-runs land on the same path); a later same-name file in one folder gets " (<last 6 of id>)".
// Native docs get the extension their download actually has. Collisions compare case-insensitively (macOS).
export function assignLocalPaths(projectDir: string, files: readonly TreeFile[]): Map<string, string> {
  const taken = new Set<string>();
  const out = new Map<string, string>();
  for (const f of files) {
    const nativeExt = own(NATIVE_EXPORT_EXT, f.extn.toLowerCase());
    const fileName = safeSeg(nativeExt ? `${f.name}.${nativeExt}` : f.name);
    const dir = [projectDir, ...f.path].map(safeSeg).join("/");
    let rel = `${dir}/${fileName}`;
    if (taken.has(rel.toLowerCase())) {
      const dot = fileName.lastIndexOf(".");
      const tail = ` (${f.id.slice(-6)})`;
      rel = dot > 0 ? `${dir}/${fileName.slice(0, dot)}${tail}${fileName.slice(dot)}` : `${dir}/${fileName}${tail}`;
    }
    taken.add(rel.toLowerCase());
    out.set(f.id, rel);
  }
  return out;
}

// ── Zoho project → Hub project ────────────────────────────────────────────────

export type HubProjectRow = { id: string; customer_id: string; name: string; external_project_id: string | null };
export type ProjectMatch =
  | { ok: true; project: HubProjectRow; matchedBy: "external_project_id" | "customer+name" }
  | { ok: false; reason: string };

const norm = (s: string) => s.trim().toLowerCase();

// Legacy (external_project_id set) first; only when there is no Legacy match, the other classification (v2,
// external_project_id null) by customer + exact project name. Zero or several candidates → no match; the
// importer never guesses and never creates a project.
export function matchHubProject(
  zohoId: string,
  zohoName: string,
  customerId: string | null,
  hubProjects: readonly HubProjectRow[],
): ProjectMatch {
  const legacy = hubProjects.filter((p) => p.external_project_id === zohoId);
  if (legacy.length === 1) return { ok: true, project: legacy[0], matchedBy: "external_project_id" };
  if (legacy.length > 1) return { ok: false, reason: `${legacy.length} Hub projects share external_project_id ${zohoId}` };
  if (!customerId) return { ok: false, reason: `no Legacy match, and no Hub customer for "${zohoName}"` };
  const v2 = hubProjects.filter((p) => p.customer_id === customerId && p.external_project_id == null && norm(p.name) === norm(zohoName));
  if (v2.length === 1) return { ok: true, project: v2[0], matchedBy: "customer+name" };
  return {
    ok: false,
    reason: v2.length === 0
      ? `no Legacy match, and no v2 project named "${zohoName}" for customer ${customerId}`
      : `${v2.length} v2 projects named "${zohoName}" for customer ${customerId}`,
  };
}
