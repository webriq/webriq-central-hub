-- Migration 064: customer_assets — per-user sharing, alongside existing role-based allowed_roles
-- allowed_user_ids (uuid[] | null): NULL/empty = no per-user restriction (matches all existing
-- rows, no behavior change). OR-combined with allowed_roles in application code (not RLS) —
-- same enforcement pattern as allowed_roles itself (migration 057's own comment: "Enforcement
-- is application-level (API route), not RLS"). Not a DB-level FK to profiles, consistent with
-- allowed_roles also not being an FK to an enum table — a soft reference is enough here.

alter table customer_assets add column if not exists allowed_user_ids uuid[];
