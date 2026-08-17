// Shared types for the Onboarding Wizard v2 sandbox (task 202). Deliberately NOT imported
// from ../_onboarding-wizard.tsx — that file is page-scoped and off-limits to edits (including
// adding exports) per this task's "zero edits to existing files" constraint. Shapes mirror the
// Database Row types (src/types/database.ts) for the same tables.

export type AssetRow = {
  id: string;
  customer_id: string;
  type: "file" | "link" | "credential";
  label: string;
  value: string | null;
  masked: boolean;
  fields: { label: string; value: string; masked?: boolean }[] | null;
  allowed_roles: string[] | null;
  allowed_user_ids: string[] | null;
  file_path: string | null;
  file_name: string | null;
  file_size: number | null;
  file_mime_type: string | null;
  phase_number: number | null;
  project_id: string | null;
  folder_id: string | null;
  source_asset_id: string | null;
  uploaded_by: string | null;
  // Not a real DB column — flattened server-side (assets GET route) from the
  // profiles!customer_assets_uploaded_by_fkey embed, so display code doesn't need its own join.
  uploader_name?: string | null;
  created_at: string;
};

export type AssetFolder = {
  id: string;
  customer_id: string;
  project_id: string | null;
  phase_number: number | null;
  parent_folder_id: string | null;
  name: string;
  is_system: boolean;
  allowed_roles: string[] | null;
  allowed_user_ids: string[] | null;
  created_at: string;
};

export type DeliverableRow = {
  id: string;
  project_id: string;
  phase_number: number;
  deliverable_key: string;
  status: string;
  completed_at: string | null;
};

export type InternalDeliverableRow = {
  id: string;
  project_id: string;
  deliverable_key: string;
  status: string;
};

export type StaffPerson = { id: string; full_name: string | null; role: string };

export const ASSET_ROLE_OPTIONS = [
  { value: "super_admin", label: "Super Admin" },
  { value: "admin", label: "Admin" },
  { value: "pm", label: "PM" },
  { value: "developer", label: "Developer" },
] as const;

export type WizardV2Project = {
  id: string;
  name: string;
  customer_id: string;
  project_id: string | null;
  company_name: string;
  existing_website: string | null;
  classification: string | null;
};

export type WizardTabKey = "business-info" | "files" | "access" | "checklist";
