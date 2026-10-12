import { adminClient } from "@/lib/supabase/admin";

export interface AuditEntry {
  route: string;
  keyId?: string | null;
  site?: string | null;
  ticketRef?: string | null;
  outcome: string;
  statusCode?: number | null;
  latencyMs?: number | null;
  ip?: string | null;
}

// Task 444 — best-effort audit row (contract §7). Never throws and callers must not await it on the
// response path's critical section; a missing table (pre-migration 169) just logs a warning.
export async function recordAudit(entry: AuditEntry): Promise<void> {
  try {
    const { error } = await adminClient.from("stackshift_support_audit").insert({
      route: entry.route,
      key_id: entry.keyId ?? null,
      site: entry.site ?? null,
      ticket_ref: entry.ticketRef ?? null,
      outcome: entry.outcome,
      status_code: entry.statusCode ?? null,
      latency_ms: entry.latencyMs ?? null,
      ip: entry.ip ?? null,
    });
    if (error) console.warn("[stackshift-support] audit write failed:", error.message);
  } catch (err) {
    console.warn("[stackshift-support] audit write threw:", err);
  }
}
