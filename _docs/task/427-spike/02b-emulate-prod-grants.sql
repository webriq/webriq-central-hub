-- Task 427 spike — emulate a PRODUCTION-style project where every PRE-EXISTING public table is already granted to
-- the API roles (older Supabase projects auto-grant on creation). The local CLI (2.107) does not, which hid this
-- from the first run. Applied BEFORE the expand draft so the draft's own explicit grants for new objects are tested.
grant select, insert, update, delete on all tables in schema public to authenticated, service_role;
