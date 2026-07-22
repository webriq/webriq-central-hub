import { createClient } from "@/lib/supabase/server";

/**
 * Generates a unique customer ID in WRQ-CUST-XXXXXXXX format.
 * Uses crypto.randomUUID() → first 8 alphanumeric chars → uppercase.
 * Checks uniqueness against the customers table, retries up to 5 times on collision.
 *
 * 8 hex chars (16^8 ≈ 4.3 billion combinations) is deliberate — this ID is the sole
 * guard on the public, unauthenticated onboarding endpoints (no session, no separate
 * token), so it must not be brute-forceable. A prior 4-char version (65,536 values)
 * was walkable over HTTP in seconds.
 */
export async function generateCustomerId(): Promise<string> {
  const supabase = await createClient();
  const MAX_RETRIES = 5;

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    const raw = crypto.randomUUID().replace(/-/g, "");
    // Extract first 8 alphanumeric characters and uppercase them
    const suffix = raw.slice(0, 8).toUpperCase();
    const customerId = `WRQ-CUST-${suffix}`;

    // Check uniqueness
    const { data, error } = await supabase
      .from("customers")
      .select("customer_id")
      .eq("customer_id", customerId)
      .maybeSingle();

    if (error) {
      console.error("generateCustomerId: DB check failed", error);
      continue;
    }

    if (!data) {
      return customerId; // Unique — return it
    }

    // Collision — retry
    console.warn(`generateCustomerId: collision on ${customerId}, attempt ${attempt + 1}/${MAX_RETRIES}`);
  }

  // Final fallback: use more chars to guarantee uniqueness
  const raw = crypto.randomUUID().replace(/-/g, "");
  const suffix = raw.slice(0, 10).toUpperCase();
  return `WRQ-CUST-${suffix}`;
}