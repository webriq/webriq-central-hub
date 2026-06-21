import { tool } from "ai";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import { adminClient } from "@/lib/supabase/admin";
import { runOrchestration, type OrchestrationProject } from "@/lib/pipeline/orchestrate";

type Supabase = SupabaseClient<Database>;

const STAFF_ROLES = ["admin", "pm", "hr"] as const;
type Role = "admin" | "pm" | "hr" | "developer" | "client";

function isStaff(role: Role): boolean {
  return (STAFF_ROLES as readonly string[]).includes(role);
}

export function buildOpsChatTools(ctx: {
  supabase: Supabase;
  userId: string;
  role: Role;
}) {
  const { supabase, userId, role } = ctx;
  const staff = isStaff(role);

  return {
    list_tasks: tool({
      description:
        "List tasks from the hub. Developers see only tasks assigned to them; PM/admin/HR see all tasks. " +
        "Supports optional filters for status and priority.",
      inputSchema: z.object({
        status: z
          .enum(["open", "in_progress", "ready_for_qa", "testing_completed", "for_client_approval", "ready_to_merge", "post_live_qa", "closed"])
          .optional()
          .describe("Filter by task status"),
        priority: z
          .enum(["low", "normal", "high", "critical"])
          .optional()
          .describe("Filter by priority"),
        limit: z.number().min(1).max(50).default(20).describe("Max results to return"),
      }),
      execute: async ({ status, priority, limit }) => {
        let q = supabase
          .from("tasks")
          .select("id,title,status,priority,due_date,assignees,project_id,description")
          .order("updated_at", { ascending: false })
          .limit(limit);
        if (status) q = q.eq("status", status);
        if (priority) q = q.eq("priority", priority);
        // Developers only see tasks they are assigned to
        if (role === "developer") q = q.contains("assignees", [userId]);
        const { data, error } = await q;
        if (error) return { error: error.message };
        return { tasks: data ?? [], count: (data ?? []).length };
      },
    }),

    update_task_status: tool({
      description:
        "Update the status of a task in the Hub. " +
        "Developers can only update tasks assigned to them. Staff can update any task. " +
        "After completing an orchestration run, use this to close the task instead of asking the user to do it manually.",
      inputSchema: z.object({
        task_id: z.string().uuid().describe("UUID of the task to update"),
        status: z
          .enum(["open", "in_progress", "ready_for_qa", "testing_completed", "for_client_approval", "ready_to_merge", "post_live_qa", "closed"])
          .describe("New status to set"),
      }),
      execute: async ({ task_id, status }) => {
        // Use the RLS-scoped session client (not adminClient) so developers can only
        // update tasks in their assignees array; staff bypass RLS via their role policies.
        let q = supabase
          .from("tasks")
          .update({ status, updated_at: new Date().toISOString() })
          .eq("id", task_id);
        // Developers are additionally constrained to their own assigned tasks
        if (role === "developer") q = q.contains("assignees", [userId]);
        const { data, error } = await q.select("id,title,status").single();
        if (error) return { error: error.message };
        if (!data) return { error: "Task not found or access denied" };
        return { updated: data };
      },
    }),

    list_assignable_users: tool({
      description:
        "List hub users that can be assigned to tasks. Returns user IDs and names. " +
        "Call this before assign_task or create_task when you need to resolve a name to a user ID. Staff only.",
      inputSchema: z.object({
        search: z.string().optional().describe("Optional name filter (case-insensitive)"),
      }),
      execute: async ({ search }) => {
        if (!staff) {
          return { error: "Access denied — staff only" };
        }
        // profiles has no email column (email lives in JWT claims); resolve by full_name.
        let q = adminClient
          .from("profiles")
          .select("id,full_name,role")
          .in("role", ["admin", "pm", "hr", "developer"])
          .order("full_name");
        if (search) {
          q = q.ilike("full_name", `%${search}%`);
        }
        const { data, error } = await q.limit(30);
        if (error) return { error: error.message };
        return { users: data ?? [] };
      },
    }),

    create_task: tool({
      description:
        "Create a new task in a project. Staff only (PM/Admin). " +
        "Requires project_id and title. Use list_assignable_users first to resolve assignee names to IDs.",
      inputSchema: z.object({
        project_id: z.string().uuid().describe("UUID of the project to create the task in"),
        title: z.string().min(1).describe("Task title"),
        description: z.string().optional().describe("Optional task description"),
        status: z
          .enum(["open", "in_progress", "ready_for_qa", "testing_completed", "for_client_approval", "ready_to_merge", "post_live_qa", "closed"])
          .default("open")
          .describe("Initial status (defaults to open)"),
        priority: z
          .enum(["low", "normal", "high", "critical"])
          .default("normal")
          .describe("Task priority (defaults to normal)"),
        assignees: z.array(z.string().uuid()).optional().describe("Array of user IDs to assign"),
        due_date: z.string().optional().describe("Due date in YYYY-MM-DD format"),
        labels: z.array(z.string()).optional().describe("Labels/tags for the task"),
        milestone_id: z.string().uuid().optional().describe("Optional milestone UUID"),
      }),
      execute: async ({ project_id, title, description, status, priority, assignees, due_date, labels, milestone_id }) => {
        if (!staff) {
          return { error: "Access denied — task creation is restricted to staff roles" };
        }
        const { data, error } = await supabase
          .from("tasks")
          .insert({
            project_id,
            title: title.trim(),
            description: description?.trim() || null,
            status: status ?? "open",
            priority: priority ?? "normal",
            assignees: assignees ?? null,
            due_date: due_date ?? null,
            labels: labels ?? null,
            milestone_id: milestone_id ?? null,
            position: Date.now(),
            created_by: userId,
          })
          .select("id,title,status,priority,project_id,assignees,due_date")
          .single();
        if (error) return { error: error.message };
        return { created: data };
      },
    }),

    update_task: tool({
      description:
        "Update task details — title, description, priority, labels, due date, or milestone. " +
        "Does NOT change status (use update_task_status for that). " +
        "Developers can only update tasks assigned to them; staff can update any task.",
      inputSchema: z.object({
        task_id: z.string().uuid().describe("UUID of the task to update"),
        title: z.string().min(1).optional().describe("New title"),
        description: z.string().optional().describe("New description (pass empty string to clear)"),
        priority: z
          .enum(["low", "normal", "high", "critical"])
          .optional()
          .describe("New priority"),
        due_date: z.string().optional().describe("New due date in YYYY-MM-DD format (pass empty string to clear)"),
        labels: z.array(z.string()).optional().describe("Replace labels array (pass [] to clear)"),
        milestone_id: z.string().uuid().optional().describe("New milestone UUID (pass empty string to clear)"),
      }),
      execute: async ({ task_id, title, description, priority, due_date, labels, milestone_id }) => {
        // Build patch with only provided fields
        const patch: Database["public"]["Tables"]["tasks"]["Update"] = {
          updated_at: new Date().toISOString(),
        };
        if (title !== undefined) patch.title = title.trim();
        if (description !== undefined) patch.description = description.trim() || null;
        if (priority !== undefined) patch.priority = priority;
        if (due_date !== undefined) patch.due_date = due_date || null;
        if (labels !== undefined) patch.labels = labels.length > 0 ? labels : null;
        if (milestone_id !== undefined) patch.milestone_id = milestone_id || null;

        // Use supabase (RLS session client) — developers are constrained to their own assignees rows
        let q = supabase.from("tasks").update(patch).eq("id", task_id);
        if (role === "developer") q = q.contains("assignees", [userId]);
        const { data, error } = await q
          .select("id,title,priority,status,due_date,labels,milestone_id")
          .single();
        if (error) return { error: error.message };
        if (!data) return { error: "Task not found or access denied" };
        return { updated: data };
      },
    }),

    assign_task: tool({
      description:
        "Set or replace the assignees on a task. Staff only. " +
        "Pass an empty array to remove all assignees. " +
        "Use list_assignable_users first to resolve names to user IDs.",
      inputSchema: z.object({
        task_id: z.string().uuid().describe("UUID of the task"),
        assignees: z
          .array(z.string().uuid())
          .describe("Array of user IDs to assign (replaces current assignees; pass [] to unassign all)"),
      }),
      execute: async ({ task_id, assignees }) => {
        if (!staff) {
          return { error: "Access denied — task assignment is restricted to staff roles" };
        }
        const { data, error } = await adminClient
          .from("tasks")
          .update({ assignees: assignees.length > 0 ? assignees : null, updated_at: new Date().toISOString() })
          .eq("id", task_id)
          .select("id,title,assignees")
          .single();
        if (error) return { error: error.message };
        if (!data) return { error: "Task not found" };
        return { updated: data };
      },
    }),

    delete_task: tool({
      description:
        "Permanently delete a task and all its subtasks. Staff only. Irreversible. " +
        "You MUST ask the user to confirm before calling this — pass confirm: true only after they say yes.",
      inputSchema: z.object({
        task_id: z.string().uuid().describe("UUID of the task to delete"),
        confirm: z.literal(true).describe("Must be true — confirms the user approved this destructive action"),
      }),
      execute: async ({ task_id }) => {
        if (!staff) {
          return { error: "Access denied — task deletion is restricted to staff roles" };
        }
        // Fetch title first so we can report what was deleted
        const { data: task } = await adminClient
          .from("tasks")
          .select("id,title")
          .eq("id", task_id)
          .single();
        if (!task) return { error: "Task not found" };

        const { error } = await adminClient.from("tasks").delete().eq("id", task_id);
        if (error) return { error: error.message };
        return { deleted: { id: task.id, title: task.title } };
      },
    }),

    list_classifications: tool({
      description:
        "List classification records from the AI pipeline queue. " +
        "Shows tasks that have been classified, with their LLM eligibility, type, and status.",
      inputSchema: z.object({
        status: z
          .enum(["pending", "reviewed", "planning", "planned", "approved", "open", "on_hold", "active", "review", "closed"])
          .optional()
          .describe("Filter by pipeline status"),
        llm_eligible: z
          .enum(["YES", "NO", "HUMAN_ONLY"])
          .optional()
          .describe("Filter by LLM eligibility"),
        limit: z.number().min(1).max(50).default(20).describe("Max results to return"),
      }),
      execute: async ({ status, llm_eligible, limit }) => {
        let q = supabase
          .from("classification_records")
          .select("id,title,task_type,priority,llm_eligible,status,customer_id,created_at")
          .order("created_at", { ascending: false })
          .limit(limit);
        if (status) q = q.eq("status", status);
        if (llm_eligible) q = q.eq("llm_eligible", llm_eligible);
        const { data, error } = await q;
        if (error) return { error: error.message };
        return { records: data ?? [], count: (data ?? []).length };
      },
    }),

    update_classification_status: tool({
      description:
        "Update the status of a classification record in the pipeline queue. Staff only. " +
        "Use this to close, re-open, or move a classification through pipeline stages — " +
        "for example, to close out a record after an orchestration run completes.",
      inputSchema: z.object({
        classification_id: z.string().uuid().describe("UUID of the classification record"),
        status: z
          .enum(["pending", "reviewed", "planning", "planned", "approved", "open", "on_hold", "active", "review", "closed"])
          .describe("New status to set"),
      }),
      execute: async ({ classification_id, status }) => {
        if (!staff) {
          return { error: "Access denied — classification updates are restricted to staff roles" };
        }
        // classification_records has no updated_at column — only update status.
        // adminClient is used because classifications are not user-scoped via RLS;
        // the staff gate above is the access control.
        const { data, error } = await adminClient
          .from("classification_records")
          .update({ status })
          .eq("id", classification_id)
          .select("id,title,status")
          .single();
        if (error) return { error: error.message };
        if (!data) return { error: "Classification record not found" };
        return { updated: data };
      },
    }),

    list_tickets: tool({
      description:
        "List client support tickets. Only available to staff roles (admin, PM, HR). " +
        "Developers will receive a permission error.",
      inputSchema: z.object({
        status: z
          .enum(["new", "open", "waiting_on_client", "waiting_on_us", "resolved", "closed"])
          .optional()
          .describe("Filter by ticket status"),
        priority: z
          .enum(["low", "normal", "high", "critical"])
          .optional()
          .describe("Filter by priority"),
        limit: z.number().min(1).max(50).default(20).describe("Max results to return"),
      }),
      execute: async ({ status, priority, limit }) => {
        if (!staff) {
          return { error: "Access denied — ticket visibility is restricted to staff roles" };
        }
        let q = supabase
          .from("tickets")
          .select("id,ticket_number,subject,status,priority,customer_id,requester_email,sla_due_at,created_at")
          .order("created_at", { ascending: false })
          .limit(limit);
        if (status) q = q.eq("status", status);
        if (priority) q = q.eq("priority", priority);
        const { data, error } = await q;
        if (error) return { error: error.message };
        return { tickets: data ?? [], count: (data ?? []).length };
      },
    }),

    run_orchestration: tool({
      description:
        "Run the automation pipeline on a task: classify → enumerate subtasks → " +
        "lane routing → Sanity execution (lane 1) or queue (lane 2/3). " +
        "Only available to staff roles (admin, PM). Use the task ID from list_tasks.",
      inputSchema: z.object({
        task_id: z.string().uuid().describe("UUID of the task to orchestrate"),
      }),
      execute: async ({ task_id }) => {
        if (!staff) {
          return { error: "Access denied — automation actions are restricted to staff roles" };
        }

        // Load task + its project for orchestration context
        const { data: task, error: taskErr } = await supabase
          .from("tasks")
          .select("id,title,description,project_id")
          .eq("id", task_id)
          .single();

        if (taskErr || !task) {
          return { error: "Task not found" };
        }
        if (!task.title) {
          return { error: "Task has no title — cannot orchestrate" };
        }

        // Load project details (uses adminClient so we can read sanity_project_id regardless of RLS)
        const { data: project, error: projErr } = await adminClient
          .from("projects")
          .select("id,sanity_project_id,dataset,vercel_project_id,github_repo")
          .eq("id", task.project_id)
          .single();

        if (projErr || !project) {
          return { error: "Project not found for this task" };
        }

        const orchestrationProject: OrchestrationProject = {
          id: project.id,
          sanity_project_id: project.sanity_project_id ?? undefined,
          dataset: project.dataset ?? undefined,
          vercel_project_id: project.vercel_project_id ?? undefined,
          github_repo: project.github_repo ?? undefined,
        };

        const result = await runOrchestration({
          task_id,
          title: task.title,
          description: task.description ?? "",
          project: orchestrationProject,
          userId,
        });

        return result;
      },
    }),
  };
}
