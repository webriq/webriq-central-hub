import { adminClient } from "@/lib/supabase/admin";
import { generateCustomerId } from "@/lib/customers/generate-id";
import { upsertPrimaryContact } from "@/lib/customers/primary-contact";
import { seedCustomPhases } from "@/lib/programme/seed-custom-phases";
import { defaultPlanFromProgrammePhases } from "@/lib/programme/phase-plan-draft";
import { deriveProjectShape } from "./service-map";
import type { Classification, PhasePlanInput } from "@/config/customer-phases";
import type { Database } from "@/types/database";

type OrderRow = Database["public"]["Tables"]["stackshift_orders"]["Row"];

export type ConvertInput = {
  order: OrderRow;
  mode: "new_customer" | "existing_customer";
  existingCustomerId?: string;
  classifications: Classification[];
  projectName?: string;
  actingUserId: string;
  // Task 357 — how to seed the draft project's phase/deliverable structure. Non-StackShift-I
  // only: "stackshift_default" copies the StackShift I template into generic milestones/tasklists,
  // "custom" seeds `phasePlan`, "skip" seeds nothing. Ignored for StackShift I (that path marks
  // the customer_phases engine as a draft instead — the programme seeds at Start Onboarding).
  phaseSetup: "stackshift_default" | "custom" | "skip";
  phasePlan?: PhasePlanInput;
};

export type ConvertResult = {
  customerId: string;
  projectId: string;
  isNewCustomer: boolean;
};

// Task 347 — turns a reviewed submission into a customer + a DRAFT project. Mirrors the New
// Project intake's `mode: "save"` path (src/app/api/onboarding/projects/route.ts): one
// customer_products row, one hidden projects row, NO programme auto-start.
// Task 357 — also seeds the project's phase structure: StackShift I → mark the customer_phases
// engine as a draft (empty default config; the 120-day programme seeds later at Start Onboarding);
// every other classification → seed generic milestones/tasklists now per `input.phaseSetup`.
export async function createFromOrder(input: ConvertInput): Promise<ConvertResult> {
  const { order, classifications } = input;
  const shape = deriveProjectShape(classifications);
  const usesEngine = shape.primaryClassification === "StackShift I";

  // ── resolve or create the customer ──
  let customerId: string;
  let isNewCustomer: boolean;
  if (input.mode === "existing_customer") {
    if (!input.existingCustomerId) throw new Error("existingCustomerId is required");
    const { data: existing } = await adminClient
      .from("customers")
      .select("customer_id")
      .eq("customer_id", input.existingCustomerId)
      .maybeSingle();
    if (!existing) throw new Error("Customer not found");
    customerId = existing.customer_id;
    isNewCustomer = false;
  } else {
    customerId = await generateCustomerId();
    const { error } = await adminClient
      .from("customers")
      .insert({ customer_id: customerId, company_name: order.company_name, status: "onboarding" });
    if (error) throw new Error(`Failed to create customer: ${error.message}`);
    isNewCustomer = true;
  }

  // ── primary contact ──
  const contactResult = await upsertPrimaryContact(adminClient, customerId, {
    name: order.contact_name,
    email: order.business_email,
    phone: order.mobile_phone,
  });
  if (contactResult.error) {
    console.error("[stackshift-order] primary contact upsert failed:", contactResult.error);
  }

  // ── customer_products ──
  // For an existing customer that already has this product, reuse its row (the products API
  // has no DB unique constraint on (customer_id, product_name) — a blind insert would
  // duplicate). New customers always get a fresh row.
  let productId: string | null = null;
  if (!isNewCustomer) {
    const { data: existingProduct } = await adminClient
      .from("customer_products")
      .select("id")
      .eq("customer_id", customerId)
      .eq("product_name", shape.productNames[0])
      .maybeSingle();
    productId = existingProduct?.id ?? null;
  }
  if (!productId) {
    const { data: product, error: productError } = await adminClient
      .from("customer_products")
      .insert({
        customer_id: customerId,
        product_name: shape.productNames[0],
        classification: shape.primaryClassification,
        classifications,
        status: "active",
        onboarding_complete: false,
        onboarding_data: {},
      })
      .select("id")
      .single();
    if (productError || !product) {
      throw new Error(`Failed to create customer_products row: ${productError?.message}`);
    }
    productId = product.id;
  }

  // ── draft project ──
  const name = await resolveProjectName(
    input.projectName?.trim() || `${order.company_name} ${shape.projectSuffix}`
  );
  const { data: project, error: projectError } = await adminClient
    .from("projects")
    .insert({
      customer_id: customerId,
      name,
      project_type: shape.projectType,
      customer_product_id: productId,
      created_by: input.actingUserId,
      // Task 357 — StackShift I: flip the 120-day customer_phases engine on and store an empty
      // default config, exactly like the New Project wizard's "save as draft" insert. The
      // programme itself seeds later (vanilla 5-phase default) via the normal Start Onboarding
      // flow — convert never auto-starts it.
      ...(usesEngine
        ? {
            uses_customer_phases_engine: true,
            draft_skip_phase_numbers: [],
            draft_custom_phases: [],
            draft_default_phase_overrides: [],
          }
        : {}),
    })
    .select("id")
    .single();
  if (projectError || !project) {
    throw new Error(`Failed to create project: ${projectError?.message}`);
  }

  // ── seed the phase/deliverable structure (non-engine projects only) ──
  // Task 357 — StackShift I is skipped here: its structure IS the customer_phases engine, seeded
  // at programme start, not now. Every other classification seeds generic milestones/tasklists per
  // the reviewer's choice in the convert dialog. Runs before the order is marked `converted` so a
  // seed failure surfaces as a retryable error rather than a half-converted order.
  if (!usesEngine) {
    if (input.phaseSetup === "stackshift_default") {
      const { error } = await seedCustomPhases(project.id, input.actingUserId, defaultPlanFromProgrammePhases());
      if (error) throw new Error(error);
    } else if (input.phaseSetup === "custom" && input.phasePlan && input.phasePlan.phases.length > 0) {
      const { error } = await seedCustomPhases(project.id, input.actingUserId, input.phasePlan);
      if (error) throw new Error(error);
    }
    // "skip": nothing to seed.
  }

  // ── link back onto the order ──
  await adminClient
    .from("stackshift_orders")
    .update({
      status: "converted",
      customer_id: customerId,
      project_id: project.id,
      is_new_customer: isNewCustomer,
      converted_by: input.actingUserId,
      converted_at: new Date().toISOString(),
    })
    .eq("id", order.id);

  return { customerId, projectId: project.id, isNewCustomer };
}

// `projects.name` collisions: the New Project intake rejects them outright; here we suffix
// " (2)", " (3)", … so a reviewer's convert never hard-fails on a name clash.
async function resolveProjectName(base: string): Promise<string> {
  for (let n = 1; n <= 20; n++) {
    const candidate = n === 1 ? base : `${base} (${n})`;
    const { data } = await adminClient
      .from("projects")
      .select("id")
      .ilike("name", candidate)
      .limit(1)
      .maybeSingle();
    if (!data) return candidate;
  }
  return `${base} (${Date.now()})`;
}
