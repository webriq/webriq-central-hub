// Pure role vocabulary for HR — importable from client components (the sidebar) and server code.
import type { HrTier } from "./types";

// A1: the `hr` role is an Admin-level manager of this module. Flip it here, in one place.
export const MANAGER_ROLES = ["super_admin", "admin", "hr"] as const;

export function tierForRole(role: string): HrTier | null {
  if (role === "client") return null;
  if ((MANAGER_ROLES as readonly string[]).includes(role)) return "manager";
  return role === "pm" ? "pm" : "staff";
}
