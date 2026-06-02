-- Add 'pending' as a valid role value for hub_users
-- Pending users are Zoho Employee+Employee logins awaiting admin approval.
ALTER TABLE hub_users DROP CONSTRAINT hub_users_role_check;
ALTER TABLE hub_users
  ADD CONSTRAINT hub_users_role_check
  CHECK (role IN ('admin', 'pm', 'dev', 'pending'));
