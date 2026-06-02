import type { CustomerStatus } from "@/types/hub";

export interface ValidationResult {
  valid: boolean;
  errors: Record<string, string>;
}

/**
 * Validates customer creation payload.
 * - company_name: required, 1–200 chars
 * - contact_email: optional, valid email format if provided
 */
export function validateCustomerCreate(body: {
  company_name?: string;
  contact_name?: string;
  contact_email?: string;
  zoho_account_id?: string;
}): ValidationResult {
  const errors: Record<string, string> = {};

  // company_name
  if (!body.company_name || !body.company_name.trim()) {
    errors.company_name = "Company name is required";
  } else if (body.company_name.trim().length > 200) {
    errors.company_name = "Company name must be 200 characters or fewer";
  }

  // contact_email (optional)
  if (body.contact_email && body.contact_email.trim()) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(body.contact_email.trim())) {
      errors.contact_email = "Invalid email format";
    }
  }

  return {
    valid: Object.keys(errors).length === 0,
    errors,
  };
}

/**
 * Validates customer update payload (all fields optional).
 * - company_name: 1–200 chars if provided
 * - contact_email: valid email format if provided
 * - status: must be one of active | inactive | onboarding
 */
export function validateCustomerUpdate(body: {
  company_name?: string;
  contact_name?: string;
  contact_email?: string;
  zoho_account_id?: string;
  communication_tone?: string;
  status?: string;
  automation_toggle?: boolean;
  llm_excluded?: boolean;
  daily_token_budget?: number | null;
}): ValidationResult {
  const errors: Record<string, string> = {};
  const validStatuses: CustomerStatus[] = ["active", "inactive", "onboarding"];

  // company_name
  if (body.company_name !== undefined) {
    if (!body.company_name.trim()) {
      errors.company_name = "Company name cannot be empty";
    } else if (body.company_name.trim().length > 200) {
      errors.company_name = "Company name must be 200 characters or fewer";
    }
  }

  // contact_email
  if (body.contact_email !== undefined && body.contact_email.trim()) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(body.contact_email.trim())) {
      errors.contact_email = "Invalid email format";
    }
  }

  // status
  if (body.status !== undefined && !validStatuses.includes(body.status as CustomerStatus)) {
    errors.status = `Status must be one of: ${validStatuses.join(", ")}`;
  }

  return {
    valid: Object.keys(errors).length === 0,
    errors,
  };
}