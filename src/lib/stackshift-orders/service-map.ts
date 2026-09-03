import {
  type Classification,
  STACKSHIFT_VARIANTS,
  isValidClassificationCombo,
  deriveProductNamesMulti,
  deriveProjectTypeMulti,
  deriveProjectSuffixMulti,
} from "@/config/customer-phases";

// Task 347 — the StackShift Order Form's "services" checkboxes use marketing product names.
// This maps each to the Hub's `customer_phases` CLASSIFICATIONS vocabulary (the service-tier
// axis the New Project intake already uses). Unknown values are dropped from the mapped set
// but always kept verbatim in `stackshift_orders.services` for the reviewer.
//
// "FlowForge" -> "Discrete Development": the form describes FlowForge as "Purpose-built
// application and workflow delivery", which is exactly what "Discrete Development" (Custom App)
// covers in customer-phases.ts. Confirmed as a task-347 assumption.
const SERVICE_TO_CLASSIFICATION: Record<string, Classification> = {
  "StackShift Access": "StackShift Access",
  "StackShift Access Plus": "StackShift Access Plus",
  "StackShift I": "StackShift I",
  "StackShift II": "StackShift II",
  "PipelineForge": "PipelineForge",
  "FlowForge": "Discrete Development",
};

export type MappedServices = {
  classifications: Classification[];
  unknownServices: string[];
  /** false when the form has >1 StackShift tier ticked — the reviewer must pick one. */
  validCombo: boolean;
};

export function mapServicesToClassifications(services: string[]): MappedServices {
  const classifications: Classification[] = [];
  const unknownServices: string[] = [];

  for (const raw of services) {
    const cls = SERVICE_TO_CLASSIFICATION[raw.trim()];
    if (cls) {
      if (!classifications.includes(cls)) classifications.push(cls);
    } else {
      unknownServices.push(raw);
    }
  }

  return {
    classifications,
    unknownServices,
    validCombo: classifications.length > 0 && isValidClassificationCombo(classifications),
  };
}

// Given a reviewer-confirmed classification set, the draft-project shape (mirrors the New
// Project intake — see src/app/api/onboarding/projects/route.ts).
export function deriveProjectShape(classifications: Classification[]): {
  productNames: ("StackShift" | "PipelineForge")[];
  primaryClassification: Classification;
  projectType: "Content Site" | "Custom App";
  projectSuffix: "Website" | "App";
} {
  return {
    productNames: deriveProductNamesMulti(classifications),
    primaryClassification:
      classifications.find((c) => STACKSHIFT_VARIANTS.includes(c)) ?? classifications[0],
    projectType: deriveProjectTypeMulti(classifications),
    projectSuffix: deriveProjectSuffixMulti(classifications),
  };
}
