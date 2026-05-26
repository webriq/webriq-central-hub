import { adminClient } from "@/lib/supabase/admin";

// Assembles a structured context string for LLM prompts from Sprint 3 onward.
// Sprint 3: customer profile + classification record.
// Sprints 4/5 will extend this to include assessment + plan records.
export async function buildContextChain(classificationId: string): Promise<string> {
  const classificationResult = await adminClient
    .from("classification_records")
    .select("*")
    .eq("id", classificationId)
    .maybeSingle();

  const classification = classificationResult.data;
  if (!classification) {
    return `=== TASK ===\n[Classification record ${classificationId} not found]\n`;
  }

  const customerResult = await adminClient
    .from("customers")
    .select("*, customer_products(*)")
    .eq("customer_id", classification.customer_id)
    .maybeSingle();

  const customer = customerResult.data;

  const productNames = (customer?.customer_products ?? [])
    .map((p: { product_name: string }) => p.product_name)
    .join(", ") || "[UNAVAILABLE]";

  const sections: string[] = [];

  sections.push(
    `=== CUSTOMER ===`,
    `ID: ${customer?.customer_id ?? "[UNAVAILABLE]"}`,
    `Company: ${customer?.company_name ?? "[UNAVAILABLE]"}`,
    `Products: ${productNames}`,
    `Communication Tone: ${customer?.communication_tone ?? "[UNAVAILABLE]"}`,
  );

  sections.push(
    ``,
    `=== TASK ===`,
    `Title: ${classification.title}`,
    `Source: ${classification.source}`,
    `Type: ${classification.task_type ?? "[unclassified]"}`,
    `Priority: ${classification.priority ?? "[unclassified]"}`,
    `LLM Eligible: ${classification.llm_eligible}`,
    `Classification Confidence: ${classification.confidence_score ?? "[n/a]"}%`,
  );

  if (classification.description) {
    sections.push(``, `Description:`, classification.description);
  }

  // Sprint 4+: include latest assessment when one exists
  const assessmentResult = await adminClient
    .from("requirements_assessments")
    .select("overall_status, subtasks, assessment_version")
    .eq("classification_id", classificationId)
    .order("assessment_version", { ascending: false })
    .limit(1)
    .maybeSingle();

  const assessment = assessmentResult.data;
  if (assessment) {
    const subtasks = (assessment.subtasks as Array<{ title: string; status: string; notes?: string }>) ?? [];
    sections.push(
      ``,
      `=== ASSESSMENT (v${assessment.assessment_version}) ===`,
      `Overall Status: ${assessment.overall_status}`,
    );
    for (const st of subtasks) {
      sections.push(`  [${st.status}] ${st.title}${st.notes ? ` — ${st.notes}` : ""}`);
    }
  }

  return sections.join("\n");
}
