-- Migration 113: Open timer tracking to all roles (task 293)
--
-- active_timers_developer_own (migration 092) and time_logs_developer_own (migration 026) both
-- required get_my_role() = 'developer' in addition to row ownership. Timer tracking is no longer
-- developer-only (TimerProvider now mounts hub-wide, task 293), so both policies are replaced
-- with ownership-only versions. Read-only policies (time_logs_manager_read,
-- time_logs_developer_read_all) are untouched — this only widens the write path.

drop policy if exists "active_timers_developer_own" on active_timers;
create policy "active_timers_own"
  on active_timers for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists "time_logs_developer_own" on time_logs;
create policy "time_logs_own"
  on time_logs for all to authenticated
  using (employee_id = auth.uid())
  with check (employee_id = auth.uid());
