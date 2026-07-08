-- Migration 058: Rename contacts' Zoho-specific ID columns to generic external_id columns
--
-- 056 named these zoho_desk_contact_id / zoho_desk_account_id, but contacts is a pure
-- one-time import like issues/milestones/tasklists — those all use a generic
-- `external_id` (see migration 037's comment: "Safe to drop external_id after migration
-- is fully verified"). Baking "zoho_desk" into the column name doesn't fit a table meant
-- to outlive the Zoho decommission. `projects.zoho_project_id` is the one legitimate
-- exception — that's still a live, actively-synced field (webhooks, bidirectional status),
-- not a one-time-import artifact, so it keeps its explicit Zoho name.

alter table contacts rename column zoho_desk_contact_id to external_id;
alter table contacts rename column zoho_desk_account_id to external_account_id;
alter table contacts rename constraint contacts_zoho_desk_contact_id_key to contacts_external_id_key;
