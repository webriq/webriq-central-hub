import { NextResponse } from "next/server";
import type { ZodType } from "zod";
import { getHrViewer, canReviewRequests, canSeeCalendar, isManager } from "./access";
import type { HrViewer } from "./types";

type Guard = "manager" | "staff" | "reviewer" | "calendar";

const CHECKS: Record<Guard, (v: HrViewer) => boolean> = {
  staff: () => true, // getHrViewer already excludes clients
  manager: isManager,
  reviewer: canReviewRequests,
  calendar: canSeeCalendar,
};

export const ALLOTMENT_OVERLAP_MESSAGE = "This leave type already has an allotment covering part of that range.";

export const jsonError = (error: string, status: number) => NextResponse.json({ error }, { status });

/** Resolve the viewer or a ready-to-return 401/403 response. */
export async function guard(kind: Guard): Promise<{ viewer: HrViewer } | { res: NextResponse }> {
  const viewer = await getHrViewer();
  if (!viewer) return { res: jsonError("Unauthorized", 401) };
  if (!CHECKS[kind](viewer)) return { res: jsonError("You don't have access to this.", 403) };
  return { viewer };
}

/** Parse + validate a JSON body; returns the data or a 400 response naming the first problem. */
export async function parseBody<T>(req: Request, schema: ZodType<T>): Promise<{ data: T } | { res: NextResponse }> {
  const raw = await req.json().catch(() => null);
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const where = issue?.path.length ? `${issue.path.join(".")}: ` : "";
    return { res: jsonError(`${where}${issue?.message ?? "Invalid request"}`, 400) };
  }
  return { data: parsed.data };
}
