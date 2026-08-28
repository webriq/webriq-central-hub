-- Migration 124 (task 326): Desk tickets — Zoho-aligned status set, Zoho ticket numbers,
-- readable `ticket_id` routing key.
--
-- ─── 1. Status enum → Zoho Desk's own 4 values ──────────────────────────────────
-- `tickets.status` shipped (migration 025) as a 6-value set
-- (new | open | waiting_on_client | waiting_on_us | resolved | closed) and
-- mapTicketStatus() collapsed Zoho's "On Hold" AND "Escalated" both into `waiting_on_us`.
-- Replace with exactly `open | on_hold | escalated | closed` (Zoho Desk's default status
-- vocabulary). Existing rows are remapped:
--   new                -> open
--   waiting_on_client  -> open
--   waiting_on_us      -> on_hold        (best-effort; the hold/escalated split cannot be
--                                         recovered retroactively — no raw Zoho `status`
--                                         was ever stored on these rows. Re-running the
--                                         desk-tickets import restores it for imported rows
--                                         from the JSON, which now also stashes the raw
--                                         status in source_meta.status.)
--   resolved           -> closed
--
-- ─── 2. ticket_number = Zoho's real ticketNumber ───────────────────────────────
-- `ticket_number` is a Hub-internal `serial`; Zoho's real number (e.g. 20996) lived only in
-- `source_meta.ticketNumber`. Overwrite `ticket_number` on imported rows (external_id not
-- null) with the real Zoho number, guarding the UNIQUE constraint against a collision with
-- an unrelated Hub-native ticket (Hub-native numbers are 1..~533; Zoho numbers are 18345+ —
-- no overlap on current data, but the guard stays). Then advance the serial sequence past
-- the max so the next email-poll-created ticket lands above every imported number.
-- BREAKING: existing `/desk/tickets/<old serial>` links stop resolving. Accepted per task
-- 326 (same one-time-cutover posture as migration 088).
--
-- ─── 3. Readable ticket_id ─────────────────────────────────────────────────────
-- Add `tickets.ticket_id` = `TKT-<ticket_number>` (e.g. TKT-20996), mirroring the
-- display-ID convention of Projects (<cust>-PROJ-01), Tasks (<proj>-T0001), Issues
-- (<proj>-I0001), Customers (WRQ-CUST-XXXXXXXX). Unlike those, `ticket_id` IS the URL
-- segment for the Desk ticket detail pages and /api/desk/tickets/* handlers — the same
-- deliberate "display value in the route param" exception already made for
-- /v2/projects/[projectId] and its nested task route (tasks 188/190).
--
-- ─── RLS ──────────────────────────────────────────────────────────────────────
-- Checked every policy on `tickets` (migrations 026/048): tickets_staff_all is
-- unconditional; tickets_client_read / tickets_client_insert filter on
-- `customer_id = get_my_customer_id()`. None reference `status`, and adding a column does
-- not require a policy change. Nothing to touch here.

-- ─── 1. status ────────────────────────────────────────────────────────────────
alter table tickets drop constraint if exists tickets_status_check;
alter table tickets alter column status drop default;

update tickets set status = case status
  when 'new'               then 'open'
  when 'waiting_on_client'  then 'open'
  when 'waiting_on_us'      then 'on_hold'
  when 'resolved'           then 'closed'
  else status
end
where status in ('new', 'waiting_on_client', 'waiting_on_us', 'resolved');

alter table tickets
  add constraint tickets_status_check check (status in ('open', 'on_hold', 'escalated', 'closed'));
alter table tickets alter column status set default 'open';

-- ─── 2. ticket_number renumber ────────────────────────────────────────────────
do $$
declare
  r record;
  target int;
begin
  for r in
    select id, ticket_number, (source_meta->>'ticketNumber') as znum
    from tickets
    where external_id is not null
      and source_meta->>'ticketNumber' ~ '^\d+$'
  loop
    target := (r.znum)::int;
    if target = r.ticket_number then
      continue;
    end if;
    if exists (select 1 from tickets where ticket_number = target and id <> r.id) then
      raise warning '[124] ticket % : Zoho number % already in use, leaving ticket_number at %',
        r.id, target, r.ticket_number;
      continue;
    end if;
    update tickets set ticket_number = target where id = r.id;
  end loop;
end $$;

-- Advance the serial sequence past every existing number (imported + Hub-native) so the
-- next serial-assigned ticket_number does not collide. Idempotent.
create or replace function sync_ticket_number_sequence() returns void as $$
  select setval(
    pg_get_serial_sequence('public.tickets', 'ticket_number'),
    greatest((select coalesce(max(ticket_number), 0) from public.tickets), 1),
    true
  );
$$ language sql security definer;

select sync_ticket_number_sequence();

-- ─── 3. ticket_id ─────────────────────────────────────────────────────────────
alter table tickets add column if not exists ticket_id text;

update tickets set ticket_id = 'TKT-' || ticket_number where ticket_id is null;

alter table tickets alter column ticket_id set not null;
alter table tickets add constraint tickets_ticket_id_key unique (ticket_id);

create or replace function generate_ticket_id() returns trigger as $$
begin
  -- `ticket_number`'s serial default is materialised before BEFORE INSERT triggers fire, so
  -- new.ticket_number is populated here even when the caller did not supply one.
  if new.ticket_id is null then
    new.ticket_id := 'TKT-' || new.ticket_number;
  end if;
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_generate_ticket_id on tickets;
create trigger trg_generate_ticket_id
  before insert on tickets
  for each row execute function generate_ticket_id();
