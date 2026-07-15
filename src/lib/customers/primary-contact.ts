import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

type Supabase = SupabaseClient<Database>;

// Task 151: contacts.is_primary is the write-side source of truth for a customer's primary
// contact. customers.contact_name/contact_email are kept as a synced read cache so the many
// existing read-only call sites (list views, search, public onboarding pre-fill, reply.ts)
// don't need to change.
export async function upsertPrimaryContact(
  supabase: Supabase,
  customerId: string,
  contact: { name?: string | null; email?: string | null; phone?: string | null }
): Promise<{ error: string | null }> {
  const email = contact.email?.trim() || null;
  const name = contact.name?.trim() || null;
  const phone = contact.phone?.trim() || null;

  // Match by case-insensitive email against this customer's existing contacts first —
  // covers both a re-submitted New Project form for a returning customer and task 120's
  // Set-as-Primary (which already sends the exact Desk contact's email/name).
  let matchedId: string | null = null;
  if (email) {
    const { data: existing } = await supabase
      .from("contacts")
      .select("id")
      .eq("customer_id", customerId)
      .ilike("email", email)
      .maybeSingle();
    matchedId = existing?.id ?? null;
  }

  // Demote any current primary that isn't the row we're about to (re)promote — required
  // before the insert/update below, since the partial unique index rejects a second
  // is_primary = true row for the same customer_id. Skip the id exclusion when there's no
  // match yet (a fresh insert has no id to exclude, and comparing the uuid column to an
  // empty-string placeholder would error).
  const demoteQuery = supabase.from("contacts").update({ is_primary: false }).eq("customer_id", customerId).eq("is_primary", true);
  await (matchedId ? demoteQuery.neq("id", matchedId) : demoteQuery);

  if (matchedId) {
    const { error } = await supabase
      .from("contacts")
      .update({ full_name: name, phone, is_primary: true })
      .eq("id", matchedId);
    if (error) return { error: error.message };
  } else {
    const { error } = await supabase
      .from("contacts")
      .insert({ customer_id: customerId, full_name: name, email, phone, is_primary: true, match_method: "manual" });
    if (error) return { error: error.message };
  }

  // Cache sync — every existing read-only call site keeps working unchanged.
  const { error: cacheError } = await supabase
    .from("customers")
    .update({ contact_name: name, contact_email: email })
    .eq("customer_id", customerId);
  if (cacheError) return { error: cacheError.message };

  return { error: null };
}

export async function demotePrimaryContact(supabase: Supabase, customerId: string): Promise<{ error: string | null }> {
  const { error } = await supabase
    .from("contacts")
    .update({ is_primary: false })
    .eq("customer_id", customerId)
    .eq("is_primary", true);
  if (error) return { error: error.message };

  const { error: cacheError } = await supabase
    .from("customers")
    .update({ contact_name: null, contact_email: null })
    .eq("customer_id", customerId);
  if (cacheError) return { error: cacheError.message };

  return { error: null };
}
