import { z } from "zod";

// Task 445 — payload schemas for contract v1 §3. All objects are strict: unknown fields are an
// `invalid_payload`, so a typo in the StackShift client surfaces immediately instead of being dropped.
const text = (max: number) => z.string().trim().min(1).max(max);

export const actorSchema = z
  .object({
    site: text(200),
    userRef: text(200),
    email: z.string().trim().email().max(320),
    name: z.string().trim().max(200).optional(),
  })
  .strict();

// Task 447 — files are uploaded straight to Storage via uploads/sign, then listed here to be registered.
// Size/type/ownership/byte checks happen in attachments.ts before any row is written.
const attachmentSchema = z
  .object({
    path: text(500),
    filename: text(255),
    contentType: z.string().trim().max(200),
    size: z.number().int().positive(),
  })
  .strict();
const noAttachments = z.array(attachmentSchema).max(10).optional();

export const signUploadsSchema = z
  .object({
    actor: actorSchema,
    ticketRef: text(200),
    files: z
      .array(
        z
          .object({ filename: text(255), contentType: z.string().trim().max(200), size: z.number().int().positive() })
          .strict(),
      )
      .min(1)
      .max(10),
  })
  .strict();
export type SignUploadsInput = z.infer<typeof signUploadsSchema>;

const isoDate = z.string().datetime({ offset: true });

export const PRIORITIES = ["low", "normal", "high", "urgent"] as const;

export const createTicketSchema = z
  .object({
    idempotencyKey: text(200),
    ticketRef: text(200),
    deskTicketId: text(100).optional(),
    deskTicketNumber: text(100).optional(),
    actor: actorSchema,
    subject: text(500),
    bodyHtml: text(100_000),
    priority: z.enum(PRIORITIES).default("normal"),
    createdAt: isoDate.optional(),
    suppressCustomerNotifications: z.boolean().default(true),
    attachments: noAttachments,
  })
  .strict();

export const createCommentSchema = z
  .object({
    idempotencyKey: text(200),
    commentRef: text(200),
    actor: actorSchema,
    bodyHtml: text(100_000),
    createdAt: isoDate.optional(),
    attachments: noAttachments,
  })
  .strict();

export const updateStatusSchema = z
  .object({
    idempotencyKey: text(200),
    actor: actorSchema,
    status: z.enum(["open", "closed"]),
  })
  .strict();

export type CreateTicketInput = z.infer<typeof createTicketSchema>;
export type CreateCommentInput = z.infer<typeof createCommentSchema>;
export type UpdateStatusInput = z.infer<typeof updateStatusSchema>;
