import { after } from "next/server";
import { createNotification } from "@/lib/notifications";
import { adminClient } from "@/lib/supabase/admin";
import { getAssignableMembers } from "@/lib/members/assignable";
import {
  buildMentionNotification,
  extractMentionIds,
  resolveMentionRecipients,
  type MentionEntityKind,
} from "./mentions";

// Task 466 — in-app notification (+ best-effort push, via createNotification) for everyone
// @mentioned in a newly created task/ticket comment. Runs after the response is sent; any
// failure is logged and never affects the comment POST. Lookups use adminClient: notification
// writing is service-side, and the recipient pool is getAssignableMembers() (active staff minus
// ASSIGNEE_EXCLUDE), which also drops forged or client ids.
export function scheduleCommentMentionNotifications({
  kind,
  actorId,
  entityId,
  body,
}: {
  kind: MentionEntityKind;
  actorId: string;
  entityId: string;
  body: string;
}): void {
  const ids = extractMentionIds(body);
  if (ids.length === 0) return;

  after(async () => {
    try {
      const [{ data: actor }, { data: entity }, members] = await Promise.all([
        adminClient.from("profiles").select("full_name").eq("id", actorId).maybeSingle(),
        adminClient
          .from(kind === "task" ? "tasks" : "tickets")
          .select("display_id, title, project_id")
          .eq("id", entityId)
          .maybeSingle(),
        getAssignableMembers(),
      ]);

      const recipients = resolveMentionRecipients({
        ids,
        actorId,
        allowedIds: new Set(members.map((m) => m.id.toLowerCase())),
      });
      if (recipients.length === 0) return;

      const { data: project } = entity?.project_id
        ? await adminClient.from("projects").select("project_id").eq("id", entity.project_id).maybeSingle()
        : { data: null };

      const copy = buildMentionNotification({
        kind,
        actorName: actor?.full_name ?? null,
        displayId: entity?.display_id ?? null,
        title: entity?.title ?? null,
        projectDisplayId: project?.project_id ?? null,
      });

      await Promise.all(recipients.map((id) => createNotification(id, { ...copy, actorId })));
    } catch (err) {
      console.error(`[comment-mentions] ${kind} ${entityId} notification error:`, err);
    }
  });
}
