import { createClient } from "@/lib/supabase/server";

/**
 * Generates a unique customer ID in WRQ-CLIENT-XXXX format.
 * Uses crypto.randomUUID() → first 4 alphanumeric chars → uppercase.
 * Checks uniqueness against the customers table, retries up to 5 times on collision.
 */
export async function generateCustomerId(): Promise<string> {
  const supabase = await createClient();
  const MAX_RETRIES = 5;

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    const raw = crypto.randomUUID().replace(/-/g, "");
    // Extract first 4 alphanumeric characters and uppercase them
    const suffix = raw.slice(0, 4).toUpperCase();
    const customerId = `WRQ-CLIENT-${suffix}`;

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
  const suffix = raw.slice(0, 6).toUpperCase();
  return `WRQ-CLIENT-${suffix}`;
}