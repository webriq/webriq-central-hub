// Task 464 — admin-only import of the Zoho Project Documents export (task 463) into each project's
// Files tab: exact folder tree + files, SSE progress. Local-dev tool like the other zoho-import routes.
//   ?from=&to=   slice of projects.json's project list (same convention as zoho-export/documents)
//   ?project=    one Zoho project id
//   ?dryRun=1    plan only — no downloads, no writes
// Files the Files tab can't take (bucket-rejected types, a native Zoho doc whose Office type the bucket
// rejects, >200 MB) are saved under _docs/task/464-…/out/skipped-files/ (git-ignored) and reported.
import fs from "fs/promises";
import path from "path";
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { adminClient } from "@/lib/supabase/admin"; // admin tool: needs an unfiltered view of every folder to detect name conflicts
import { fetchZohoWithRetry, getZohoAccessToken } from "@/lib/zoho";
import { buildCustomerNameMap, extractZohoCustomerName, readFromZoho } from "@/lib/migrate/zoho-import";
import { ALLOWED_MIME_TYPES, MAX_FILE_SIZE } from "@/lib/uploads/customer-asset-storage";
import {
  assignLocalPaths, buildProjectTrees, classifyFile, matchHubProject, resolveFolderName,
  type DocItem, type HubProjectRow, type ProjectTree, type TreeFile,
} from "@/lib/migrate/zoho-documents-tree";

const BUCKET = "customer-assets";
const DOWNLOAD = "https://www.zohoapis.com/workdrive/api/v1/download"; // attributes.download_url 401s (task 106); this one takes the OAuth token
const PHASE = 1; // the only folder scope the Files tab uses (projects/_shared/_use-customer-assets.ts)
const PAGE = 1000;
const PAUSE_MS = 700; // between downloads — same pacing as zoho-export/documents
const FROM_ZOHO_DIR = path.join(process.cwd(), "_from_zoho");
const LOCAL_DIR = path.join(process.cwd(), "_docs", "task", "464-zoho-project-documents-import-files-tab", "out", "skipped-files");
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

type RawDoc = {
  id: string;
  attributes: {
    name: string; extn?: string; is_folder?: boolean;
    storage_info?: { size_in_bytes?: number | string };
    created_time_in_millisecond?: number | string;
  };
  _zoho_project_id: string;
  _zoho_root_folder: string;
  _zoho_parent_workdrive_id: string;
};

// documents-all-<from>-<to>.json slices only; documents-all.json is an older combined export (27 items short).
async function loadDocItems(): Promise<DocItem[]> {
  const names = (await fs.readdir(FROM_ZOHO_DIR)).filter((f) => /^documents-all-\d+-\d+\.json$/.test(f)).sort();
  const seen = new Set<string>();
  const out: DocItem[] = [];
  for (const f of names) {
    const raw = JSON.parse(await fs.readFile(path.join(FROM_ZOHO_DIR, f), "utf-8")) as RawDoc[];
    for (const d of raw) {
      if (seen.has(d.id)) continue;
      seen.add(d.id);
      const created = Number(d.attributes.created_time_in_millisecond);
      out.push({
        id: d.id,
        name: d.attributes.name,
        extn: d.attributes.extn ?? "",
        isFolder: d.attributes.is_folder === true,
        parentId: d._zoho_parent_workdrive_id,
        rootName: d._zoho_root_folder,
        projectId: d._zoho_project_id,
        declaredBytes: Number(d.attributes.storage_info?.size_in_bytes ?? 0) || 0,
        createdMs: Number.isFinite(created) && created > 0 ? created : null,
      });
    }
  }
  return out;
}

// PostgREST truncates silently at 1000 rows — loop until a short page.
async function selectAll<T>(
  page: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await page(from, from + PAGE - 1);
    if (error) throw new Error(error.message);
    rows.push(...(data ?? []));
    if (!data || data.length < PAGE) return rows;
  }
}

type SkipReason = "unsupported-type" | "native" | "too-large";
type SkippedFile = {
  project: string; file: string; folder: string; reason: SkipReason;
  local: string; localStatus: "planned" | "saved" | "exists" | "failed"; detail?: string;
};
type ProjectReport = { zohoId: string; zohoName: string; matchedBy: string | null; hubProjectId: string | null; reason?: string; folders: number; files: number };

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { data: profile } = await adminClient.from("profiles").select("role").eq("id", user.id).maybeSingle();
  if (profile?.role !== "admin" && profile?.role !== "super_admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (process.env.VERCEL) return NextResponse.json({ error: "Run this import from the local dev server (it writes local copies to disk)" }, { status: 400 });

  const sp = new URL(request.url).searchParams;
  const dryRun = sp.get("dryRun") === "1";
  const only = sp.get("project");
  const fromN = parseInt(sp.get("from") ?? "0", 10);
  const toRaw = sp.get("to");

  // Migration 179 (external_id) is what makes re-runs idempotent; a live run must not start without it.
  const hasExternalId = !(await adminClient.from("customer_asset_folders").select("external_id").limit(1)).error;
  if (!hasExternalId && !dryRun) {
    return NextResponse.json({ error: "Migration 179 (customer_asset_folders / customer_assets .external_id) is not applied — apply it before a live run. A dry run works without it." }, { status: 409 });
  }

  let token = await getZohoAccessToken();
  if (!token && !dryRun) return NextResponse.json({ error: "No Zoho token" }, { status: 502 });

  const zohoProjects = readFromZoho<{ id?: string | number; id_string?: string; name?: string }>("projects.json")
    .map((p) => ({ id: String(p.id_string ?? p.id ?? ""), name: String(p.name ?? "").trim() }))
    .filter((p) => p.id);
  const slice = only ? zohoProjects.filter((p) => p.id === only) : zohoProjects.slice(fromN, toRaw ? parseInt(toRaw, 10) : undefined);
  if (slice.length === 0) return NextResponse.json({ error: "No projects in that range" }, { status: 400 });

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (obj: object) => controller.enqueue(encoder.encode(`data: ${JSON.stringify(obj)}\n\n`));
      const c: Record<string, number> = {};
      const inc = (k: string, n = 1) => { c[k] = (c[k] ?? 0) + n; };
      const errors: string[] = [];
      const projectsReport: ProjectReport[] = [];
      const renamedFolders: Array<{ project: string; from: string; to: string }> = [];
      const skippedFiles: SkippedFile[] = [];

      // One Zoho download, paced. Never throws; callers record the detail.
      async function download(id: string): Promise<{ ok: true; buf: Buffer } | { ok: false; detail: string }> {
        try {
          const { res, token: next, throttleExhausted } = await fetchZohoWithRetry(`${DOWNLOAD}/${id}`, token, { label: "documents-import" });
          token = next;
          if (throttleExhausted) return { ok: false, detail: "Zoho rolling throttle exhausted" };
          if (!res.ok) {
            // Keep the body: WorkDrive puts its error code/title there (e.g. F7003 "Invalid OAuth token").
            const body = (await res.text().catch(() => "")).replace(/\s+/g, " ").slice(0, 200);
            return { ok: false, detail: body ? `HTTP ${res.status} ${body}` : `HTTP ${res.status}` };
          }
          return { ok: true, buf: Buffer.from(await res.arrayBuffer()) };
        } catch (e) {
          return { ok: false, detail: e instanceof Error ? e.message : String(e) };
        } finally {
          await sleep(PAUSE_MS);
        }
      }

      // A file the Files tab can't take → local copy (unless one is already there) + a report entry.
      async function skipToLocal(fileId: string, entry: Omit<SkippedFile, "localStatus" | "detail">, prefetched?: Buffer) {
        const rec: SkippedFile = { ...entry, localStatus: "planned" };
        skippedFiles.push(rec);
        if (dryRun) return;
        const fail = (detail: string) => { rec.localStatus = "failed"; rec.detail = detail; inc("localFailed"); };
        const abs = path.join(LOCAL_DIR, entry.local);
        if (!abs.startsWith(LOCAL_DIR + path.sep)) return fail("path escapes the output directory");
        if (await fs.stat(abs).then((s) => s.size > 0, () => false)) { rec.localStatus = "exists"; inc("localExisting"); return; }
        let buf = prefetched;
        if (!buf) {
          const dl = await download(fileId);
          if (!dl.ok) return fail(dl.detail);
          buf = dl.buf;
        }
        if (buf.byteLength === 0) return fail("empty download");
        try {
          await fs.mkdir(path.dirname(abs), { recursive: true });
          await fs.writeFile(abs, buf);
        } catch (e) {
          return fail(e instanceof Error ? e.message : String(e));
        }
        rec.localStatus = "saved";
        inc("localSaved");
      }

      async function importFile(f: TreeFile, mime: string, fileName: string, customerId: string, projectId: string, folderId: string, where: string, entry: Omit<SkippedFile, "reason" | "localStatus" | "detail">) {
        const dl = await download(f.id);
        if (!dl.ok) { inc("filesFailed"); errors.push(`${where}: download failed (${dl.detail})`); return; }
        const bytes = dl.buf.byteLength;
        if (bytes === 0) { inc("filesFailed"); errors.push(`${where}: empty download`); return; }
        if (bytes > MAX_FILE_SIZE) { inc("filesImportable", -1); inc("filesTooLarge"); await skipToLocal(f.id, { ...entry, reason: "too-large" }, dl.buf); return; } // the export's declared size was wrong
        const storagePath = `${customerId}/${projectId}/zoho-wd/${f.id}_${fileName.replace(/[^a-zA-Z0-9._-]/g, "_").slice(-150)}`;
        const { error: upErr } = await adminClient.storage.from(BUCKET).upload(storagePath, dl.buf, { contentType: mime, upsert: true });
        if (upErr) { inc("filesFailed"); errors.push(`${where}: storage upload failed: ${upErr.message}`); return; }
        const { error: dbErr } = await adminClient.from("customer_assets").insert({
          customer_id: customerId, type: "file", label: fileName, file_path: storagePath, file_name: fileName, file_size: bytes,
          file_mime_type: mime, phase_number: PHASE, project_id: projectId, folder_id: folderId, uploaded_by: null, external_id: f.id,
          ...(f.createdMs ? { created_at: new Date(f.createdMs).toISOString() } : {}),
        });
        if (dbErr) {
          if (dbErr.code === "23505") inc("filesAlreadyImported"); // raced with another run
          else { inc("filesFailed"); errors.push(`${where}: db insert failed: ${dbErr.message}`); }
          return;
        }
        inc("filesImported");
      }

      try {
        const hubProjects: HubProjectRow[] = await selectAll((from, to) =>
          adminClient.from("projects").select("id, customer_id, name, external_project_id").neq("status", "deleted").range(from, to));
        const customerMap = await buildCustomerNameMap();
        const trees = buildProjectTrees(await loadDocItems());

        // Resolve every project up front: Legacy first, then v2 (customer + name); never guess, never create.
        const work: Array<{ zoho: { id: string; name: string }; tree: ProjectTree; hub: HubProjectRow }> = [];
        for (const zoho of slice) {
          const tree = trees.get(zoho.id);
          if (!tree) { inc("projectsWithoutDocuments"); continue; }
          const customerId = customerMap.get(extractZohoCustomerName(zoho.name).toLowerCase()) ?? null;
          const m = matchHubProject(zoho.id, zoho.name, customerId, hubProjects);
          projectsReport.push({ zohoId: zoho.id, zohoName: zoho.name, matchedBy: m.ok ? m.matchedBy : null, hubProjectId: m.ok ? m.project.id : null, reason: m.ok ? undefined : m.reason, folders: tree.folders.length, files: tree.files.length });
          if (!m.ok) { inc("projectsUnmatched"); inc("filesInUnmatchedProjects", tree.files.length); continue; }
          inc(m.matchedBy === "external_project_id" ? "projectsLegacy" : "projectsV2");
          work.push({ zoho, tree, hub: m.project });
        }

        const totalFiles = work.reduce((n, w) => n + w.tree.files.length, 0);
        let processed = 0;

        // One project failing (e.g. a DB read error) must not abort the rest of the slice.
        const runProject = async ({ zoho, tree, hub }: (typeof work)[number]) => {
          const customerId = hub.customer_id;
          const label = `${zoho.name} (${zoho.id})`;
          if (tree.unreachable.length) { inc("unreachableItems", tree.unreachable.length); errors.push(`${label}: ${tree.unreachable.length} item(s) not reachable from any root — not imported`); }

          // ── folders ──
          const existing = await selectAll((from, to) =>
            adminClient.from("customer_asset_folders").select("*")
              .eq("customer_id", customerId).eq("project_id", hub.id).eq("phase_number", PHASE).range(from, to));
          const uuidByWd = new Map<string, string>(); // WorkDrive folder id → Hub folder uuid
          const taken = new Map<string, Set<string>>(); // parent uuid | "root" → lowercased child names
          const namesUnder = (parent: string | null) => { const k = parent ?? "root"; let s = taken.get(k); if (!s) taken.set(k, (s = new Set())); return s; };
          for (const f of existing) {
            namesUnder(f.parent_folder_id).add(f.name.toLowerCase());
            if (f.external_id) uuidByWd.set(f.external_id, f.id);
          }

          for (const node of tree.folders) {
            if (uuidByWd.has(node.id)) { inc("foldersReused"); continue; }
            const parent = node.parentId === null ? null : uuidByWd.get(node.parentId);
            if (parent === undefined) { inc("foldersSkipped"); errors.push(`${label}: folder "${node.path.join("/")}" skipped — its parent folder was not created`); continue; }
            const names = namesUnder(parent);
            const finalName = resolveFolderName(names, node.name);
            if (finalName !== node.name) { inc("foldersRenamed"); renamedFolders.push({ project: label, from: node.path.join("/"), to: finalName }); }
            if (dryRun) {
              uuidByWd.set(node.id, `dry:${node.id}`);
            } else {
              const { data, error } = await adminClient.from("customer_asset_folders")
                .insert({ customer_id: customerId, project_id: hub.id, phase_number: PHASE, parent_folder_id: parent, name: finalName, is_system: false, external_id: node.id })
                .select("id").single();
              if (error || !data) { inc("foldersFailed"); errors.push(`${label}: folder "${node.path.join("/")}" failed: ${error?.message}`); continue; }
              uuidByWd.set(node.id, data.id);
            }
            names.add(finalName.toLowerCase());
            inc("foldersCreated"); // dry run: "would create"
          }

          // ── files ──
          const imported = hasExternalId
            ? new Set((await selectAll((from, to) =>
                adminClient.from("customer_assets").select("external_id").eq("project_id", hub.id).not("external_id", "is", null).range(from, to))).map((r) => r.external_id))
            : new Set<string | null>();
          const localPaths = assignLocalPaths(label, tree.files);

          for (const f of tree.files) {
            send({ type: "progress", current: ++processed, total: totalFiles, project: zoho.name });
            const cls = classifyFile(f, ALLOWED_MIME_TYPES, MAX_FILE_SIZE);
            const where = `${label}/${[...f.path, cls.kind === "import" ? cls.fileName : f.name].join("/")}`;
            const entry = { project: label, file: f.name, folder: f.path.join("/"), local: localPaths.get(f.id)! };

            if (cls.kind !== "import") {
              inc(cls.kind === "native" ? "filesNative" : cls.kind === "too-large" ? "filesTooLarge" : "filesUnsupportedType");
              await skipToLocal(f.id, { ...entry, reason: cls.kind });
              continue;
            }
            inc("filesImportable");
            if (imported.has(f.id)) { inc("filesAlreadyImported"); continue; }
            const folderId = uuidByWd.get(f.folderId);
            if (!folderId) { inc("filesFailed"); errors.push(`${where}: parent folder was not created`); continue; }
            if (dryRun) continue;
            await importFile(f, cls.mime, cls.fileName, customerId, hub.id, folderId, where, entry);
          }
        };
        for (const w of work) {
          await runProject(w).catch((e) => {
            inc("projectsFailed");
            errors.push(`${w.zoho.name} (${w.zoho.id}): ${e instanceof Error ? e.message : String(e)}`);
          });
        }

        send({ type: "done", report: { dryRun, slice: { from: fromN, to: toRaw, project: only }, counts: c, projects: projectsReport, renamedFolders, skippedFiles, errors } });
      } catch (e) {
        console.error("[import/documents]", e);
        send({ type: "error", message: e instanceof Error ? e.message : String(e) });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, { headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache", Connection: "keep-alive" } });
}
