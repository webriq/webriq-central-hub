// dev-only import endpoint — SSE stream with per-chunk progress.
// Two-pass: pass 1 upserts all tasks, pass 2 resolves self-referential parent links.
import { NextResponse } from "next/server";
import path from "path";
import fs from "fs";
import { createClient } from "@/lib/supabase/server";
import { mapPriority, mapTaskStatus, adminClient } from "@/lib/migrate/zoho-import";

type ZohoTaskRaw = {
  id?: string;
  id_string?: string;
  name?: string;
  description?: string;
  priority?: string;
  status?: { id?: string; name?: string; color?: string; color_hexcode?: string };
  is_completed?: boolean;
  completion_percentage?: number;
  depth?: number;
  start_date?: string;
  end_date?: string;
  due_date?: string;
  completed_on?: string;
  tasklist?: { id?: string; id_string?: string };
  milestone?: { id?: string; id_string?: string; name?: string };
  parental_info?: { parent_task_id?: string; root_task_id?: string };
  owners_and_work?: Record<string, unknown>;
  log_hours?: Record<string, unknown>;
  association_info?: Record<string, unknown>;
  duration?: unknown;
  sequence?: unknown;
  billing_type?: string;
  created_by?: Record<string, unknown>;
  updated_by?: Record<string, unknown>;
  teams?: unknown[];
  reviewer?: unknown[];
  tags?: unknown[];
  created_via?: string;
  _zoho_project_id?: string;
  [key: string]: unknown;
};

type TaskRow = {
  external_id: string;
  project_id: string;
  tasklist_id: string | null;
  milestone_id: string | null;
  parent_task_id: null;
  title: string;
  description: string | null;
  priority: "critical" | "high" | "normal" | "low";
  status: string;
  due_date: string | null;
  start_date: string | null;
  completion_percentage: number;
  is_completed: boolean;
  depth: number;
  completed_on: string | null;
  source_meta: Record<string, unknown>;
};

const CHUNK_SIZE = 50;
const CHUNK_DELAY_MS = 100;

function omitNulls(obj: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(obj).filter(([, v]) => v != null));
}

export async function POST() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: profile } = await adminClient.from("profiles").select("role").eq("id", user.id).maybeSingle();
  if (profile?.role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  // Multi-file scan: pick up all tasks-*.json batch files, sorted for deterministic order
  const dir = path.join(process.cwd(), "_from_zoho");
  const allTasks: ZohoTaskRaw[] = [];

  const batchFiles = fs
    .readdirSync(dir)
    .filter((f) => f.startsWith("tasks-") && f.endsWith(".json"))
    .sort();

  if (batchFiles.length > 0) {
    for (const file of batchFiles) {
      const parsed = JSON.parse(fs.readFileSync(path.join(dir, file), "utf-8"));
      if (Array.isArray(parsed)) allTasks.push(...(parsed as ZohoTaskRaw[]));
    }
  } else {
    const fallback = path.join(dir, "tasks.json");
    if (!fs.existsSync(fallback)) {
      return NextResponse.json({ error: "No task files found in _from_zoho/" }, { status: 400 });
    }
    const parsed = JSON.parse(fs.readFileSync(fallback, "utf-8"));
    allTasks.push(...(Array.isArray(parsed) ? (parsed as ZohoTaskRaw[]) : []));
  }

  if (allTasks.length === 0) {
    return NextResponse.json({ error: "No tasks found in files" }, { status: 400 });
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (obj: object) =>
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(obj)}\n\n`));

      try {
        // Pre-build lookup maps — one DB query per table
        const { data: projectRows } = await adminClient.from("projects").select("id, zoho_project_id");
        const projectMap = new Map((projectRows ?? []).map((p) => [String(p.zoho_project_id), p.id as string]));

        const { data: tasklistRows } = await adminClient.from("tasklists").select("id, external_id");
        const tasklistMap = new Map((tasklistRows ?? []).map((t) => [String(t.external_id), t.id as string]));

        const { data: milestoneRows } = await adminClient.from("milestones").select("id, external_id");
        const milestoneMap = new Map((milestoneRows ?? []).map((m) => [String(m.external_id), m.id as string]));

        let imported = 0;
        let skipped = 0;
        let parentsResolved = 0;
        const errors: string[] = [];

        // ── Pass 1: build rows ──────────────────────────────────────────────────
        const rows: TaskRow[] = [];

        for (const t of allTasks) {
          const externalId = String(t.id_string ?? t.id ?? "");
          if (!externalId || !t.name) { skipped++; continue; }

          const projectId = projectMap.get(String(t._zoho_project_id ?? ""));
          if (!projectId) {
            errors.push(`task ${externalId}: no Hub project for zoho_project_id=${t._zoho_project_id}`);
            skipped++;
            continue;
          }

          const tasklistExtId = String(t.tasklist?.id_string ?? t.tasklist?.id ?? "");
          const tasklistId = tasklistExtId ? (tasklistMap.get(tasklistExtId) ?? null) : null;

          const isNoneMilestone = !t.milestone?.name || t.milestone.name === "None";
          const milestoneExtId = !isNoneMilestone
            ? String(t.milestone?.id_string ?? t.milestone?.id ?? "")
            : "";
          const milestoneId = milestoneExtId ? (milestoneMap.get(milestoneExtId) ?? null) : null;

          rows.push({
            external_id: externalId,
            project_id: projectId,
            tasklist_id: tasklistId,
            milestone_id: milestoneId,
            parent_task_id: null,
            title: t.name,
            description: t.description ?? null,
            priority: mapPriority(t.priority ?? ""),
            status: mapTaskStatus(t.status?.name ?? "", t.is_completed ?? false),
            due_date: t.end_date ?? t.due_date ?? null,
            start_date: t.start_date ?? null,
            completion_percentage: t.completion_percentage ?? 0,
            is_completed: t.is_completed ?? false,
            depth: t.depth ?? 0,
            completed_on: t.completed_on ?? null,
            source_meta: omitNulls({
              status: t.status,
              log_hours: t.log_hours,
              owners_and_work: t.owners_and_work,
              duration: t.duration,
              sequence: t.sequence,
              association_info: t.association_info,
              billing_type: t.billing_type ?? null,
              created_by: t.created_by ?? null,
              updated_by: t.updated_by ?? null,
              teams: (t.teams?.length ?? 0) > 0 ? t.teams : null,
              reviewer: (t.reviewer?.length ?? 0) > 0 ? t.reviewer : null,
              tags: (t.tags?.length ?? 0) > 0 ? t.tags : null,
              created_via: t.created_via ?? null,
            }),
          });
        }

        const pass1Total = Math.ceil(rows.length / CHUNK_SIZE);

        for (let i = 0; i < rows.length; i += CHUNK_SIZE) {
          const chunk = rows.slice(i, i + CHUNK_SIZE);
          const { error } = await adminClient.from("tasks").upsert(chunk, { onConflict: "external_id" });
          const current = Math.floor(i / CHUNK_SIZE) + 1;
          if (error) {
            errors.push(`pass1 chunk ${current}: ${error.message}`);
          } else {
            imported += chunk.length;
          }
          send({ type: "progress", pass: 1, current, total: pass1Total });
          if (i + CHUNK_SIZE < rows.length) {
            await new Promise<void>((r) => setTimeout(r, CHUNK_DELAY_MS));
          }
        }

        // ── Pass 2: resolve parent_task_id ──────────────────────────────────────
        const { data: insertedTasks } = await adminClient
          .from("tasks")
          .select("id, external_id")
          .not("external_id", "is", null);

        const taskMap = new Map(
          (insertedTasks ?? []).map((t) => [String(t.external_id), t.id as string])
        );

        const parentUpdates: Array<{ id: string; parent_task_id: string }> = [];
        for (const t of allTasks) {
          const parentExtId = String(t.parental_info?.parent_task_id ?? "");
          if (!parentExtId) continue;
          const extId = String(t.id_string ?? t.id ?? "");
          const hubId = taskMap.get(extId);
          const parentHubId = taskMap.get(parentExtId);
          if (hubId && parentHubId) {
            parentUpdates.push({ id: hubId, parent_task_id: parentHubId });
          }
        }

        const pass2Total = Math.ceil(parentUpdates.length / CHUNK_SIZE);

        for (let i = 0; i < parentUpdates.length; i += CHUNK_SIZE) {
          const chunk = parentUpdates.slice(i, i + CHUNK_SIZE);
          const current = Math.floor(i / CHUNK_SIZE) + 1;
          await Promise.all(
            chunk.map(async ({ id, parent_task_id }) => {
              const { error } = await adminClient.from("tasks").update({ parent_task_id }).eq("id", id);
              if (error) {
                errors.push(`pass2 parent ${id}: ${error.message}`);
              } else {
                parentsResolved++;
              }
            })
          );
          send({ type: "progress", pass: 2, current, total: pass2Total });
          if (i + CHUNK_SIZE < parentUpdates.length) {
            await new Promise<void>((r) => setTimeout(r, CHUNK_DELAY_MS));
          }
        }

        send({ type: "done", imported, skipped, parents_resolved: parentsResolved, errors });
      } catch (e) {
        send({ type: "error", message: String(e) });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "Connection": "keep-alive",
    },
  });
}
