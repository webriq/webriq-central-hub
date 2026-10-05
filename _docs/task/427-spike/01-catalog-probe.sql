-- Task 427 spike — catalog probe: every object that depends on milestones / tasklists.
\echo '== columns'
select table_name, ordinal_position as pos, column_name, data_type, is_nullable, column_default
from information_schema.columns where table_schema='public' and table_name in ('milestones','tasklists') order by 1,2;

\echo '== constraints (pk/fk/unique/check)'
select conrelid::regclass as tbl, conname, contype, pg_get_constraintdef(oid) as def
from pg_constraint where conrelid in ('public.milestones'::regclass,'public.tasklists'::regclass) order by 1,2;

\echo '== foreign keys that POINT AT milestones / tasklists'
select conrelid::regclass as from_table, conname, pg_get_constraintdef(oid) as def
from pg_constraint where contype='f' and confrelid in ('public.milestones'::regclass,'public.tasklists'::regclass) order by 1,2;

\echo '== indexes'
select tablename, indexname, indexdef from pg_indexes where schemaname='public' and tablename in ('milestones','tasklists') order by 1,2;

\echo '== RLS + policies'
select c.relname, c.relrowsecurity as rls_on, c.relforcerowsecurity as rls_forced from pg_class c where c.oid in ('public.milestones'::regclass,'public.tasklists'::regclass);
select tablename, policyname, cmd, roles, qual, with_check from pg_policies where schemaname='public' and tablename in ('milestones','tasklists') order by 1,2;

\echo '== triggers'
select event_object_table, trigger_name, action_timing, event_manipulation, action_statement
from information_schema.triggers where event_object_schema='public' and event_object_table in ('milestones','tasklists') order by 1,2;

\echo '== views / functions / rules that reference them (via pg_depend)'
select distinct d.classid::regclass as dep_catalog, coalesce(v.relname, p.proname, r.rulename::text) as dep_name, t.relname as depends_on
from pg_depend d
join pg_class t on t.oid = d.refobjid and t.oid in ('public.milestones'::regclass,'public.tasklists'::regclass)
left join pg_rewrite r on d.classid='pg_rewrite'::regclass and r.oid = d.objid
left join pg_class v on v.oid = r.ev_class and v.relkind in ('v','m')
left join pg_proc p on d.classid='pg_proc'::regclass and p.oid = d.objid
where d.deptype='n' and (v.relname is not null or p.proname is not null) order by 3,2;
select p.proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where n.nspname='public' and p.prokind = 'f' and (pg_get_functiondef(p.oid) ilike '%milestones%' or pg_get_functiondef(p.oid) ilike '%tasklists%');

\echo '== realtime publication membership + replica identity'
select tablename from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename in ('milestones','tasklists','tasks','customer_phases','customer_deliverables') order by 1;
select relname, relreplident from pg_class where oid in ('public.milestones'::regclass,'public.tasklists'::regclass);

\echo '== row counts (local replay = 0 unless data was restored)'
select (select count(*) from milestones) as milestones, (select count(*) from tasklists) as tasklists, (select count(*) from tasks) as tasks;
