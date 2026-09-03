import { adminClient } from "@/lib/supabase/admin";
import { generateCustomerId } from "@/lib/customers/generate-id";
import { upsertPrimaryContact } from "@/lib/customers/primary-contact";
import { deriveProjectShape } from "./service-map";
import type { Classification } from "@/config/customer-phases";
import type { Database } from "@/types/database";

type OrderRow = Database["public"]["Tables"]["stackshift_orders"]["Row"];

export type ConvertInput = {
  order: OrderRow;
  mode: "new_customer" | "existing_customer";
  existingCustomerId?: string;
  classifications: Classification[];
  projectName?: string;
  actingUserId: string;
};

export type ConvertResult = {
  customerId: string;
  projectId: string;
  isNewCustomer: boolean;
};

// Task 347 — turns a reviewed submission into a customer + a DRAFT project. Mirrors the New
// Project intake's `mode: "save"` path (src/app/api/onboarding/projects/route.ts): one
// customer_products row, one hidden projects row, NO programme auto-start.
export async function createFromOrder(input: ConvertInput): Promise<ConvertResult> {
  const { order, classifications } = input;
  const shape = deriveProjectShape(classifications);

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
    })
    .select("id")
    .single();
  if (projectError || !project) {
    throw new Error(`Failed to create project: ${projectError?.message}`);
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
