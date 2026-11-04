// Task 466 — pure helpers for @mentions in task/ticket comments (no Supabase/Next imports so
// `_docs/task/466-comment-mentions.check.ts` can run them under tsx). Task 460's Cliq DMs reuse
// `extractMentionIds()` rather than parsing comment HTML a second way.

export const MAX_MENTION_RECIPIENTS = 20;

export type MentionEntityKind = "task" | "ticket";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SPAN_OPEN_TAG_RE = /<span\b[^>]*>/gi;
const MENTION_TYPE_RE = /\bdata-type\s*=\s*["']mention["']/i;
const DATA_ID_RE = /\bdata-id\s*=\s*["']([^"']*)["']/i;

/**
 * Profile ids of every Tiptap mention node in a stored comment body, in document order,
 * deduped. Reads each `<span>` opening tag independently so attribute order doesn't matter;
 * a `data-id` on a non-mention span and any non-UUID id are ignored.
 */
export function extractMentionIds(html: string): string[] {
  const ids: string[] = [];
  for (const [tag] of html.matchAll(SPAN_OPEN_TAG_RE)) {
    if (!MENTION_TYPE_RE.test(tag)) continue;
    const id = DATA_ID_RE.exec(tag)?.[1]?.trim().toLowerCase();
    if (id && UUID_RE.test(id) && !ids.includes(id)) ids.push(id);
  }
  return ids;
}

/** Mentioned ids that should be notified: deduped, minus the author, allow-listed, capped. */
export function resolveMentionRecipients({
  ids,
  actorId,
  allowedIds,
}: {
  ids: string[];
  actorId: string;
  allowedIds: Set<string>;
}): string[] {
  const actor = actorId.toLowerCase();
  const out: string[] = [];
  for (const raw of ids) {
    const id = raw.toLowerCase();
    if (id === actor || !allowedIds.has(id) || out.includes(id)) continue;
    out.push(id);
    if (out.length === MAX_MENTION_RECIPIENTS) break;
  }
  return out;
}

export function mentionEventType(kind: MentionEntityKind): string {
  return kind === "task" ? "task_comment_mention" : "ticket_comment_mention";
}

/** Notification copy + deep link. No `url` when either display id is missing (no route to it). */
export function buildMentionNotification({
  kind,
  actorName,
  displayId,
  title,
  projectDisplayId,
}: {
  kind: MentionEntityKind;
  actorName: string | null;
  displayId: string | null;
  title: string | null;
  projectDisplayId: string | null;
}): { type: string; title: string; body: string; url?: string } {
  const actor = actorName?.trim() || "A teammate";
  const subject = [displayId, title ? `"${title}"` : null].filter(Boolean).join(" ") || `a ${kind}`;
  const segment = kind === "task" ? "tasks" : "tickets";
  return {
    type: mentionEventType(kind),
    title: "Mentioned in a comment",
    body: `${actor} mentioned you in a comment on ${subject}`,
    url: displayId && projectDisplayId ? `/projects/v2/${projectDisplayId}/${segment}/${displayId}` : undefined,
  };
}
