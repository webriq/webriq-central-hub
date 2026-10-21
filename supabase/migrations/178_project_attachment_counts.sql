-- Migration 178: per-item attachment counts for project task/ticket listings (task 459)
-- WRITTEN, NOT APPLIED — the operator applies it.
--
--   project_attachment_counts(): for one project, the number of attachments on each task/ticket —
--   its own files (entity_type 'task' / 'issue') plus files on its comments (entity_type 'comment'),
--   the same set the detail page's Attachments tab shows. One row per item that HAS files.
--   SECURITY INVOKER: attachments_staff_read RLS still decides what the caller can count.
--
-- Rollback:
--   drop function if exists project_attachment_counts(uuid);
--   drop index if exists task_comments_task_id_idx;

create or replace function project_attachment_counts(p_project_id uuid)
returns table (entity_id uuid, attachment_count bigint)
language sql
stable
as $$
  select owner_id, count(*)
  from (
    select a.entity_id as owner_id
      from attachments a
      join tasks t on t.id = a.entity_id
     where a.entity_type = 'task' and t.project_id = p_project_id
    union all
    select a.entity_id
      from attachments a
      join tickets k on k.id = a.entity_id
     where a.entity_type = 'issue' and k.project_id = p_project_id
    union all
    select c.task_id
      from attachments a
      join task_comments c on c.id = a.entity_id
      join tasks t on t.id = c.task_id
     where a.entity_type = 'comment' and t.project_id = p_project_id
    union all
    select c.ticket_id
      from attachments a
      join ticket_comments c on c.id = a.entity_id
      join tickets k on k.id = c.ticket_id
     where a.entity_type = 'comment' and k.project_id = p_project_id
  ) s
  group by owner_id
$$;

-- ticket_comments(ticket_id) is already indexed (ticket_comments_ticket_id_idx, renamed in 147).
create index if not exists task_comments_task_id_idx on task_comments (task_id);
