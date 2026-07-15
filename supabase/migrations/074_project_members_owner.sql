-- Migration 074: project_members ownership (task 155)
--
-- Adds a real, transferable project owner to project_members, mirroring phase_members.is_owner
-- (migration 073, task 153) exactly. Needed because task 153 gave project_members no owner
-- concept at all — just a flat membership list — and projects created before task 153 shipped
-- have zero project_members rows and no formal owner. Super Admin can now set/transfer a
-- project's owner retroactively, not just have it implicitly set at creation.

alter table project_members add column if not exists is_owner boolean not null default false;

-- At most one owner per project — mirrors phase_members' identical partial unique index
-- (migration 073) and contacts.is_primary before that (migration 072, task 151).
create unique index if not exists idx_project_members_one_owner
  on project_members (project_id) where is_owner = true;
