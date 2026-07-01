-- profiles.role is a text CHECK constraint (not a PostgreSQL ENUM type)
-- Drop and recreate the constraint to add 'super_admin'
ALTER TABLE profiles
  DROP CONSTRAINT IF EXISTS profiles_role_check;

ALTER TABLE profiles
  ADD CONSTRAINT profiles_role_check
    CHECK (role IN ('admin', 'hr', 'pm', 'developer', 'client', 'super_admin'));
