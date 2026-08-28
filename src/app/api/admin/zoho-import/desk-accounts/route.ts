// dev-only import endpoint — reads _from_zoho/desk-accounts.json, upserts to the `accounts`
// table (migration 125 / task 335). Accounts are soft-matched to `customers` by normalized
// account name; unmatched accounts import anyway with customer_id / match_method = null.
// The import body lives in importDeskAccounts() (mirrors the desk-tickets helper split).
import { NextResponse } from "next/server";
import { readFromZoho } from "@/lib/migrate/zoho-import";
import { adminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { importDeskAccounts, DeskAccountRaw } from "@/lib/migrate/desk-accounts-import";

export async function POST() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: profile } = await adminClient.from("profiles").select("role").eq("id", user.id).maybeSingle();
  if (profile?.role !== "admin" && profile?.role !== "super_admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  let accounts: DeskAccountRaw[];
  try {
    accounts = readFromZoho<DeskAccountRaw>("desk-accounts.json");
  } catch {
    return NextResponse.json(
      { error: "Could not read _from_zoho/desk-accounts.json — run the Desk Accounts export first" },
      { status: 400 }
    );
  }

  if (accounts.length === 0) {
    return NextResponse.json({ error: "No accounts found in desk-accounts.json" }, { status: 400 });
  }

  const result = await importDeskAccounts(accounts);
  return NextResponse.json(result);
}
