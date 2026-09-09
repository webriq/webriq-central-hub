import { z } from "zod";

// Task 353 — request/response contract for POST /api/public/validate.
// Called server-to-server by the webriq.com form proxy (never from a browser).

export const validateRequestSchema = z
  .object({
    email: z.email().max(320).optional(),
    phone: z.string().min(3).max(64).optional(),
    // Accepted for forward-compat but currently has no effect: Abstract's Email Reputation
    // / Phone Intelligence products return the full risk picture in a single call, so there
    // is no "escalate on high stakes" second request to gate.
    stakes: z.enum(["low", "high"]).optional(),
    // Optional caller id for the decision log (e.g. "webriq.com/contact-form"). The
    // `x-validation-source` header takes precedence over this when both are present.
    source: z.string().max(120).optional(),
  })
  .refine((v) => !!v.email || !!v.phone, {
    message: "At least one of `email` or `phone` is required",
  });

export type ValidateRequest = z.infer<typeof validateRequestSchema>;
