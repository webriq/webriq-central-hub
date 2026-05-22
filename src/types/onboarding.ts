import type { ProductName } from "@/types/hub";

// ---- Form Schema Types ----

export type FormFieldType =
  | "text"
  | "email"
  | "url"
  | "select"
  | "textarea"
  | "checkbox-group"
  | "radio-group"
  | "file"
  | "table";

export interface FormField {
  name: string;
  label: string;
  type: FormFieldType;
  required?: boolean;
  placeholder?: string;
  options?: string[]; // for select/radio/checkbox-group
  hint?: string;
  condition?: {
    field: string; // another field name
    value: string | boolean; // equals this value to show
  };
  span?: "full" | "half";
}

export interface FormSection {
  id: string;
  title: string;
  description?: string;
  fields: FormField[];
  condition?: {
    field: string;
    value: string | boolean;
  };
}

export interface FormSchema {
  productName: ProductName;
  sections: FormSection[];
}

// ---- Onboarding Data (stored in customer_products.onboarding_data jsonb) ----

export type OnboardingData = Record<string, unknown>;

// ---- Uploaded File Metadata ----

export interface UploadedFile {
  url: string;
  filename: string;
  size: number;
  mimeType: string;
  path: string;
}

// ---- Customer API Inputs ----

export interface CustomerCreateInput {
  company_name: string;
  contact_name?: string;
  contact_email?: string;
  zoho_account_id?: string;
}

export interface CustomerUpdateInput {
  company_name?: string;
  contact_name?: string;
  contact_email?: string;
  zoho_account_id?: string;
  status?: string;
}

// ---- Onboarding Save Payload ----

export interface OnboardingSavePayload {
  data: OnboardingData;
  completedPercentage: number;
}

// ---- Auto-save Status ----

export type SaveStatus = "idle" | "saving" | "saved" | "error";