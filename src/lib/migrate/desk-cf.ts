// Shared Desk-ticket custom-field (`cf`) promotion logic — one home for the two named
// fields the Hub surfaces from Zoho's `cf` object. Used by `importDeskTickets()` (task 329)
// and the archived-ticket cf backfill route (task 334).
//
// Matched by *normalized* field name rather than a hardcoded slug, so a Zoho label edit that
// shifts the slug — e.g. `cf_stack_shift_site` → `cf_stackshift_site` — still resolves. The
// full `cf` object is always kept verbatim at `source_meta.cf`, so any field added later is
// still captured even without a promotion entry here.
//
// Confirmed against the live portal: `cf_white_label` (289 populated — holds the
// client/business name, shown in the ticket UI as "Business Name", task 330),
// `cf_stack_shift_site` (224). `cf_service_type` exists but is unused (0 populated).

export const CF_TARGETS = {
  whiteLabel: ["whitelabel"],
  stackShiftSite: ["stackshiftsite"],
} as const;

export function normalizeCfKey(key: string): string {
  return key.replace(/^cf_/i, "").replace(/[^a-z0-9]/gi, "").toLowerCase();
}

export function resolveCfField(
  cf: Record<string, unknown> | null | undefined,
  targets: readonly string[]
): unknown {
  if (!cf) return null;
  for (const [key, value] of Object.entries(cf)) {
    if (value == null || value === "") continue;
    if (targets.includes(normalizeCfKey(key))) return value;
  }
  return null;
}
