-- Migration 184: task moves, task comment counts, tasks-listing density preference (task 487)
-- WRITTEN, NOT APPLIED — the operator applies it, after 181–183. 182 (user_preferences) MUST be applied first.
--
--   move_task(task, tasklist, parent, before, after): moves a task AND its whole subtree to another list /
--     parent / position in one transaction. Keeps the subtask invariant of POST /api/v2/tasks/[id]/subtasks:
--     every descendant shares the root's tasklist + milestone, depth = parent.depth + 1, max depth 5.
--     `before` = the sibling that ends up right BEFORE the task, `after` = the one right AFTER it (either null).
--     SECURITY DEFINER + EXECUTE for service_role only: the caller (POST /api/v2/tasks/[id]/move) checks
--     getTaskEditPermission first; a mover may not hold RLS update rights on every descendant.
--   project_task_comment_counts(project): comments per task. SECURITY INVOKER — task_comments RLS decides.
--   user_preferences.tasks_density: comfortable | compact (own-row RLS from 182 covers it).
--
-- Rollback:
--   drop function if exists move_task(uuid, uuid, uuid, uuid, uuid);
--   drop function if exists project_task_comment_counts(uuid);
--   alter table public.user_preferences drop column if exists tasks_density;

begin;

create or replace function move_task(
  p_task_id uuid, p_tasklist_id uuid, p_parent_task_id uuid, p_before_id uuid, p_after_id uuid
) returns setof tasks
language plpgsql security definer set search_path = public as $$
declare
  v_task tasks;
  v_list_project uuid;
  v_list_milestone uuid;
  v_parent tasks;
  v_subtree uuid[];
  v_height int;
  v_depth int := 0;
  v_before numeric;
  v_after numeric;
  v_pos numeric;
begin
  select * into v_task from tasks where id = p_task_id for update;
  if not found then
    raise exception 'task not found' using errcode = 'no_data_found';
  end if;

  select project_id, milestone_id into v_list_project, v_list_milestone from tasklists where id = p_tasklist_id;
  if v_list_project is distinct from v_task.project_id then
    raise exception 'target list is not in this project' using errcode = 'check_violation';
  end if;

  -- The task + every descendant (lvl cap guards against a corrupt cycle).
  with recursive sub(id, lvl) as (
    select v_task.id, 0
    union all
    select t.id, sub.lvl + 1 from tasks t join sub on t.parent_task_id = sub.id where sub.lvl < 20
  )
  select array_agg(id), max(lvl) into v_subtree, v_height from sub;

  if p_parent_task_id is not null then
    if p_parent_task_id = any(v_subtree) then
      raise exception 'cannot move a task into its own subtask' using errcode = 'check_violation';
    end if;
    select * into v_parent from tasks where id = p_parent_task_id;
    if not found or v_parent.project_id <> v_task.project_id then
      raise exception 'parent task is not in this project' using errcode = 'check_violation';
    end if;
    if v_parent.tasklist_id is distinct from p_tasklist_id then
      raise exception 'parent task is in a different list' using errcode = 'check_violation';
    end if;
    v_depth := coalesce(v_parent.depth, 0) + 1;
  end if;
  if v_depth + v_height > 5 then
    raise exception 'subtask depth limit (5) exceeded' using errcode = 'check_violation';
  end if;

  -- Neighbours only count when they are siblings in the target slot.
  select position into v_before from tasks
   where id = p_before_id and id <> p_task_id
     and parent_task_id is not distinct from p_parent_task_id
     and (p_parent_task_id is not null or tasklist_id = p_tasklist_id);
  select position into v_after from tasks
   where id = p_after_id and id <> p_task_id
     and parent_task_id is not distinct from p_parent_task_id
     and (p_parent_task_id is not null or tasklist_id = p_tasklist_id);

  -- Renumber the slot's siblings 1..n when a neighbour has no position or the gap is too small to split.
  if (p_before_id is not null and v_before is null) or (p_after_id is not null and v_after is null)
     or (v_before is not null and v_after is not null and v_after - v_before < 0.000001) then
    update tasks s set position = r.rn
      from (
        select id, row_number() over (order by position nulls last, created_at, id) as rn
          from tasks
         where id <> p_task_id
           and parent_task_id is not distinct from p_parent_task_id
           and (p_parent_task_id is not null or tasklist_id = p_tasklist_id)
           and project_id = v_task.project_id
      ) r
     where s.id = r.id;
    select position into v_before from tasks where id = p_before_id and id <> p_task_id;
    select position into v_after from tasks where id = p_after_id and id <> p_task_id;
  end if;

  v_pos := case
    when v_before is not null and v_after is not null then (v_before + v_after) / 2
    when v_before is not null then v_before + 1
    when v_after is not null then v_after - 1
    else coalesce((select max(position) from tasks
                    where id <> p_task_id
                      and parent_task_id is not distinct from p_parent_task_id
                      and (p_parent_task_id is not null or tasklist_id = p_tasklist_id)
                      and project_id = v_task.project_id), 0) + 1
  end;

  update tasks
     set tasklist_id = p_tasklist_id,
         milestone_id = v_list_milestone,
         depth = coalesce(depth, 0) + (v_depth - coalesce(v_task.depth, 0)),
         updated_at = now()
   where id = any(v_subtree) and id <> p_task_id;

  update tasks
     set tasklist_id = p_tasklist_id,
         milestone_id = v_list_milestone,
         parent_task_id = p_parent_task_id,
         depth = v_depth,
         position = v_pos,
         updated_at = now()
   where id = p_task_id;

  -- Every row the client must merge: the subtree plus the (possibly renumbered) siblings.
  return query
    select * from tasks
     where id = any(v_subtree)
        or (project_id = v_task.project_id
            and parent_task_id is not distinct from p_parent_task_id
            and (p_parent_task_id is not null or tasklist_id = p_tasklist_id));
end;
$$;

revoke all on function move_task(uuid, uuid, uuid, uuid, uuid) from public, anon, authenticated;
grant execute on function move_task(uuid, uuid, uuid, uuid, uuid) to service_role;

create or replace function project_task_comment_counts(p_project_id uuid)
returns table (task_id uuid, comment_count bigint)
language sql
stable
as $$
  select c.task_id, count(*)
    from task_comments c
    join tasks t on t.id = c.task_id
   where t.project_id = p_project_id
   group by c.task_id
$$;

alter table public.user_preferences
  add column if not exists tasks_density text not null default 'comfortable'
  check (tasks_density in ('comfortable', 'compact'));

commit;
