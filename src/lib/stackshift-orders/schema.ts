import { z } from "zod";
import { CLASSIFICATIONS } from "@/config/customer-phases";

// Task 347 — payload shapes for the StackShift Order Form intake + review flow.
// The public form lives on webriq.com; a server-side proxy there relays submissions to
// POST /api/webhooks/stackshift-order (JSON, not multipart) with a shared-secret header.

// ─── /uploads — signed-upload-URL request ────────────────────────────────────
const UPLOAD_FIELDS = ["proposal", "flowforge_spec"] as const;

export const uploadsManifestSchema = z.object({
  files: z
    .array(
      z.object({
        field: z.enum(UPLOAD_FIELDS),
        filename: z.string().min(1).max(255),
        contentType: z.string().min(1).max(255),
        size: z.number().int().positive().max(25 * 1024 * 1024), // 25 MB
      })
    )
    .min(1)
    .max(2),
});
export type UploadsManifest = z.infer<typeof uploadsManifestSchema>;

// ─── main intake payload ─────────────────────────────────────────────────────
export const orderIntakeSchema = z.object({
  idempotencyKey: z.string().min(1).max(200).optional(),
  contact: z.object({
    name: z.string().min(1).max(200),
    email: z.string().email().max(320),
    phone: z.string().min(1).max(64),
    billingName: z.string().max(200).optional().nullable(),
    billingEmail: z.string().email().max(320).optional().nullable().or(z.literal("")),
  }),
  company: z.object({
    name: z.string().min(1).max(300),
    website: z.string().url().max(500),
    address: z.string().min(1).max(2000),
  }),
  orderDateTime: z.string().min(1).max(64).optional().nullable(),
  services: z.array(z.string().min(1).max(120)).min(1).max(10),
  proposalPath: z.string().min(1).max(500),
  proposalFilename: z.string().min(1).max(255),
  flowforgeSpecPath: z.string().min(1).max(500).optional().nullable(),
  flowforgeSpecFilename: z.string().min(1).max(255).optional().nullable(),
  approval: z.object({
    approvedBy: z.string().min(1).max(200),
    approvalDate: z.string().min(1).max(32),
    termsAccepted: z.literal(true),
  }),
});
export type OrderIntake = z.infer<typeof orderIntakeSchema>;

// ─── review actions ──────────────────────────────────────────────────────────
export const convertSchema = z
  .object({
    mode: z.enum(["new_customer", "existing_customer"]),
    existingCustomerId: z.string().min(1).max(64).optional(),
    classifications: z.array(z.enum(CLASSIFICATIONS)).min(1).max(4),
    projectName: z.string().min(1).max(300).optional(),
  })
  .refine((v) => v.mode !== "existing_customer" || !!v.existingCustomerId, {
    message: "existingCustomerId is required when mode is existing_customer",
    path: ["existingCustomerId"],
  });
export type ConvertBody = z.infer<typeof convertSchema>;

export const patchOrderSchema = z.object({
  action: z.enum(["dismiss", "reopen"]),
  dismissReason: z.string().max(1000).optional(),
  reviewNotes: z.string().max(2000).optional(),
});
export type PatchOrderBody = z.infer<typeof patchOrderSchema>;
