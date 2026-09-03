import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

type Supabase = SupabaseClient<Database>;

export type CustomerMatch = {
  customerId: string;
  companyName: string;
  matchMethod: "company_name" | "contact_email" | "email_domain";
};

// Task 347 — ADVISORY ONLY. Shown to the reviewer in the /stackshift-orders detail page as a
// "this looks like existing customer X" hint. Never auto-acts. Order of preference: exact
// company-name match, then a contact whose email matches the submitted business email, then a
// contact whose email shares the submitted website's / business email's domain.

// PostgREST `ilike` treats `%` and `_` as wildcards even without an explicit pattern — escape
// user-supplied values so a stray `_` in a domain/email/company name can't widen the match.
function likeEscape(value: string): string {
  return value.replace(/[%_\\]/g, (m) => `\\${m}`);
}

function registrableDomain(value: string | null | undefined): string | null {
  if (!value) return null;
  let host = value.trim().toLowerCase();
  host = host.replace(/^https?:\/\//, "").replace(/^www\./, "");
  host = host.split("/")[0].split("@").pop() ?? host;
  host = host.split(":")[0];
  if (!host || !host.includes(".")) return null;
  // Common free/public mailbox providers are not a customer signal.
  const FREE = new Set([
    "gmail.com", "googlemail.com", "yahoo.com", "outlook.com", "hotmail.com",
    "live.com", "icloud.com", "aol.com", "proton.me", "protonmail.com",
  ]);
  return FREE.has(host) ? null : host;
}

export async function matchCustomer(
  supabase: Supabase,
  input: { companyName: string; businessEmail?: string | null; website?: string | null }
): Promise<CustomerMatch | null> {
  const company = input.companyName?.trim();
  if (company) {
    const { data } = await supabase
      .from("customers")
      .select("customer_id, company_name")
      .ilike("company_name", likeEscape(company))
      .limit(1)
      .maybeSingle();
    if (data) {
      return { customerId: data.customer_id, companyName: data.company_name, matchMethod: "company_name" };
    }
  }

  const email = input.businessEmail?.trim();
  if (email) {
    const { data } = await supabase
      .from("contacts")
      .select("customer_id")
      .ilike("email", likeEscape(email))
      .not("customer_id", "is", null)
      .limit(1)
      .maybeSingle();
    if (data?.customer_id) {
      const named = await customerName(supabase, data.customer_id);
      if (named) return { customerId: data.customer_id, companyName: named, matchMethod: "contact_email" };
    }
  }

  const domain = registrableDomain(input.website) ?? registrableDomain(email);
  if (domain) {
    const { data } = await supabase
      .from("contacts")
      .select("customer_id")
      .ilike("email", `%@${likeEscape(domain)}`)
      .not("customer_id", "is", null)
      .limit(1)
      .maybeSingle();
    if (data?.customer_id) {
      const named = await customerName(supabase, data.customer_id);
      if (named) return { customerId: data.customer_id, companyName: named, matchMethod: "email_domain" };
    }
  }

  return null;
}

async function customerName(supabase: Supabase, customerId: string): Promise<string | null> {
  const { data } = await supabase
    .from("customers")
    .select("company_name")
    .eq("customer_id", customerId)
    .maybeSingle();
  return data?.company_name ?? null;
}
