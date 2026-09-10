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
  // Task 353 — highest riskLevel the webriq.com proxy got back from POST /api/public/validate
  // for the contact email/phone. "high" means the proxy should have blocked the submission, so
  // in practice only "low"/"medium" arrive; absent = the check was skipped or came back clean.
  contactRisk: z.enum(["low", "medium", "high"]).optional().nullable(),
  // Task 356 — submitter request metadata, forwarded by the webriq.com proxy in the payload
  // (the Hub is called server-to-server by the proxy, so it can't read the real submitter's
  // IP/UA from its own request headers). Both optional; absent = the proxy didn't send them.
  submitterIp: z.string().max(64).optional().nullable(),
  submitterUserAgent: z.string().max(1024).optional().nullable(),
});
export type OrderIntake = z.infer<typeof orderIntakeSchema>;

// ─── review actions ──────────────────────────────────────────────────────────

// Task 357 — generic phase plan for the convert dialog's "set the phases now" option. Mirrors
// PhasePlanInput / PhasePlan / DeliverablePlan / ChecklistItemPlan in customer-phases.ts (there's
// no zod schema for those; POST /api/onboarding/projects casts its own `phase_plan` field). Fed
// straight to seedCustomPhases — phases → milestones, deliverables → tasklists, checklist → tasks.
const checklistItemPlanSchema = z.object({ title: z.string().min(1).max(300) });
const deliverablePlanSchema = z.object({
  name: z.string().min(1).max(300),
  dayStart: z.number().int().positive(),
  dayEnd: z.number().int().positive(),
  checklist: z.array(checklistItemPlanSchema).max(50),
});
export const phasePlanInputSchema = z.object({
  phases: z
    .array(
      z.object({
        name: z.string().min(1).max(300),
        dayStart: z.number().int().positive(),
        dayEnd: z.number().int().positive(),
        deliverables: z.array(deliverablePlanSchema).max(30),
      })
    )
    .max(20),
});

export const convertSchema = z
  .object({
    mode: z.enum(["new_customer", "existing_customer"]),
    existingCustomerId: z.string().min(1).max(64).optional(),
    classifications: z.array(z.enum(CLASSIFICATIONS)).min(1).max(4),
    projectName: z.string().min(1).max(300).optional(),
    // Task 357 — how the new project's phase/deliverable structure is seeded on convert.
    // "skip" (default): no phases. "stackshift_default": copy the StackShift I template into
    // generic milestones/tasklists. "custom": seed the reviewer-built plan in `phasePlan`.
    // Ignored when the classification is StackShift I — that path only marks the customer_phases
    // engine as a draft (see create-from-order.ts), it never seeds milestones here.
    phaseSetup: z.enum(["stackshift_default", "custom", "skip"]).default("skip"),
    phasePlan: phasePlanInputSchema.optional(),
  })
  .refine((v) => v.mode !== "existing_customer" || !!v.existingCustomerId, {
    message: "existingCustomerId is required when mode is existing_customer",
    path: ["existingCustomerId"],
  })
  .refine((v) => v.phaseSetup !== "custom" || (v.phasePlan?.phases.length ?? 0) > 0, {
    message: "phasePlan with at least one phase is required when phaseSetup is 'custom'",
    path: ["phasePlan"],
  });
export type ConvertBody = z.infer<typeof convertSchema>;

export const patchOrderSchema = z.object({
  action: z.enum(["dismiss", "reopen"]),
  dismissReason: z.string().max(1000).optional(),
  reviewNotes: z.string().max(2000).optional(),
});
export type PatchOrderBody = z.infer<typeof patchOrderSchema>;
