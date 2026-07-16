import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { adminClient } from "@/lib/supabase/admin";
import { generateCustomerId } from "@/lib/customers/generate-id";
import { upsertPrimaryContact } from "@/lib/customers/primary-contact";
import {
  CLASSIFICATIONS,
  type Classification,
  STACKSHIFT_VARIANTS,
  isValidClassificationCombo,
  deriveProductNamesMulti,
  deriveProjectSuffixMulti,
  deriveProjectTypeMulti,
  PROGRAMME_PHASES,
} from "@/config/customer-phases";
import { seedProgrammeAtPhase } from "@/lib/programme/seed";
import { addProjectMember } from "@/lib/programme/phase-membership";

// Task 153: pm can now also create projects — mirrors POST /api/onboarding/projects'
// CREATE_ROLES exactly (that constant isn't exported, so this is a deliberate duplicate, same
// pattern as PHASE_WRITE_ROLES duplicating WRITE_ROLES in programme/phase/route.ts).
const CREATE_ROLES = ["admin", "super_admin", "marketing", "pm"];

type ImportRow = {
  account: string;
  type: string;
  primaryContact?: string;
  kickoffDate?: string;
  currentPhase?: string;
};

type ImportRequestBody = { rows: ImportRow[] };

// "Type" (task 157: multi-select classification is live) accepts a delimited list of
// classification values in one cell — comma, slash, "+", or "&" separated — so the CSV format
// doesn't have to change if a customer needs a StackShift + PipelineForge combo row.
function parseClassifications(raw: string): { classifications: Classification[] | null; error?: string } {
  const parts = raw
    .split(/[,/+&]/)
    .map((p) => p.trim())
    .filter(Boolean);
  if (parts.length === 0) return { classifications: null, error: "Type is required" };

  const resolved: Classification[] = [];
  for (const part of parts) {
    const match = CLASSIFICATIONS.find((c) => c.toLowerCase() === part.toLowerCase());
    if (!match) return { classifications: null, error: `Unrecognized Type value: "${part}"` };
    if (!resolved.includes(match)) resolved.push(match);
  }
  if (!isValidClassificationCombo(resolved)) {
    return { classifications: null, error: "At most one StackShift variant may be combined per row" };
  }
  return { classifications: resolved };
}

function parsePhase(raw: string | undefined): { phaseNumber: number | null; error?: string } {
  if (!raw?.trim()) return { phaseNumber: 1 };
  const needle = raw.trim().toLowerCase();
  const match = PROGRAMME_PHASES.find((p) => p.name.toLowerCase() === needle || p.shortName.toLowerCase() === needle);
  if (!match) return { phaseNumber: null, error: `Unrecognized Current Phase value: "${raw}"` };
  return { phaseNumber: match.number };
}

function parseKickoffDate(raw: string | undefined): { date: Date | null; error?: string } {
  if (!raw?.trim()) return { date: new Date() };
  const parsed = new Date(raw.trim());
  if (Number.isNaN(parsed.getTime())) return { date: null, error: `Unparseable Kickoff Date value: "${raw}"` };
  return { date: parsed };
}

// POST — bulk-creates onboarding projects from a CSV/Excel import (task 159). Deliberately a
// separate route rather than looping client-side calls to POST /api/onboarding/projects — this
// summarizes the whole batch in one response and avoids duplicating per-row customer/contact/
// phase-seed logic N times over N requests (see task doc's "Out of Scope").
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).maybeSingle();
    if (!profile?.role || !CREATE_ROLES.includes(profile.role)) {
      return NextResponse.json({ error: "Not permitted to create onboarding projects" }, { status: 403 });
    }

    const body = (await request.json()) as ImportRequestBody;
    if (!Array.isArray(body.rows) || body.rows.length === 0) {
      return NextResponse.json({ error: "rows must be a non-empty array" }, { status: 400 });
    }

    const errors: { row: number; error: string }[] = [];
    let imported = 0;

    // Sequential, not Promise.all — rows can create a shared customer (two rows for the same
    // new Account), and per-row errors need to be attributable to that row's own operations,
    // not interleaved with a concurrent row's failure.
    for (let i = 0; i < body.rows.length; i++) {
      const row = body.rows[i];
      const rowNumber = i + 1;
      try {
        const account = row.account?.trim();
        if (!account) {
          errors.push({ row: rowNumber, error: "Account is required" });
          continue;
        }

        const { classifications, error: typeError } = parseClassifications(row.type ?? "");
        if (typeError || !classifications) {
          errors.push({ row: rowNumber, error: typeError ?? "Invalid Type" });
          continue;
        }

        const { phaseNumber, error: phaseError } = parsePhase(row.currentPhase);
        if (phaseError || !phaseNumber) {
          errors.push({ row: rowNumber, error: phaseError ?? "Invalid Current Phase" });
          continue;
        }

        const { date: kickoffDate, error: dateError } = parseKickoffDate(row.kickoffDate);
        if (dateError || !kickoffDate) {
          errors.push({ row: rowNumber, error: dateError ?? "Invalid Kickoff Date" });
          continue;
        }

        // Resolve or create the customer — case-insensitive exact match on company_name only
        // (no fuzzy matching, per task doc's "Out of Scope").
        let customerId: string;
        let companyName: string;
        const { data: existingCustomer } = await adminClient
          .from("customers")
          .select("customer_id, company_name")
          .ilike("company_name", account)
          .limit(1)
          .maybeSingle();
        if (existingCustomer) {
          customerId = existingCustomer.customer_id;
          companyName = existingCustomer.company_name;
        } else {
          customerId = await generateCustomerId();
          companyName = account;
          const { error: createCustomerError } = await adminClient.from("customers").insert({
            customer_id: customerId,
            company_name: companyName,
            status: "onboarding",
          });
          if (createCustomerError) {
            errors.push({ row: rowNumber, error: "Failed to create customer" });
            continue;
          }
        }

        if (row.primaryContact?.trim()) {
          const { error: contactError } = await upsertPrimaryContact(adminClient, customerId, { name: row.primaryContact.trim() });
          if (contactError) console.error("POST /api/onboarding/projects/import primary contact error:", contactError);
        }

        const productNames = deriveProductNamesMulti(classifications);
        const primaryClassification = classifications.find((c) => STACKSHIFT_VARIANTS.includes(c)) ?? classifications[0];
        const { data: product, error: productError } = await adminClient
          .from("customer_products")
          .insert({
            customer_id: customerId,
            product_name: productNames[0],
            classification: primaryClassification,
            classifications,
            status: "active",
            onboarding_complete: false,
            onboarding_data: {},
          })
          .select("id")
          .single();
        if (productError || !product) {
          errors.push({ row: rowNumber, error: "Failed to create product" });
          continue;
        }

        const projectName = `${companyName} ${deriveProjectSuffixMulti(classifications)}`;
        const { data: project, error: projectError } = await adminClient
          .from("projects")
          .insert({
            customer_id: customerId,
            name: projectName,
            project_type: deriveProjectTypeMulti(classifications),
            customer_product_id: product.id,
            created_by: user.id,
            onboarding_visible_at: null,
          })
          .select("id, customer_id")
          .single();
        if (projectError || !project) {
          errors.push({ row: rowNumber, error: "Failed to create project" });
          continue;
        }

        const { error: memberError } = await addProjectMember(project.id, user.id, user.id, true);
        if (memberError) console.error("POST /api/onboarding/projects/import project_members insert error:", memberError);

        const seedResult = await seedProgrammeAtPhase(
          { id: project.id, customer_id: project.customer_id },
          phaseNumber,
          kickoffDate,
          "Imported via CSV/Excel bulk import"
        );
        if (seedResult.error) {
          errors.push({ row: rowNumber, error: seedResult.error });
          continue;
        }

        imported++;
      } catch (rowErr) {
        console.error(`POST /api/onboarding/projects/import row ${rowNumber} unexpected error:`, rowErr);
        errors.push({ row: rowNumber, error: "Unexpected error processing this row" });
      }
    }

    return NextResponse.json({ imported, errors });
  } catch (err) {
    console.error("POST /api/onboarding/projects/import unexpected error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
