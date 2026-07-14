// 120-Day Customer Programme — static phase/deliverable definitions.
// Identical for every project; only per-project *state* (customer_phases, customer_deliverables,
// onboarding_internal_deliverables) lives in the database.
// Source: _docs/plan-v2/PROJECT ONBOARDING/Project_Onboarding_QBR_120Day_FINAL.html
//
// Phase 1's day *ranges* (vs. task 122's single due-day model) are a deliberate task-123
// breakdown, not derived from the QBR — see task 123 doc's "Key Design Decisions". Phases 2-5
// keep single-day semantics: dayStart === dayEnd, so the same rendering code works for both
// without a range/non-range branch.

export type DeliverableConfig = {
  key: string;
  name: string;
  description: string;
  dayStart: number; // absolute programme day, 1-120 — NOT phase-relative
  dayEnd: number;
  owner: string; // display label only, not a Hub user FK
};

export type PhaseConfig = {
  number: 1 | 2 | 3 | 4 | 5;
  name: string;
  shortName: string;
  dayStart: number;
  dayEnd: number;
  owner: string;
  deliverables: DeliverableConfig[];
};

export const PROGRAMME_PHASES: PhaseConfig[] = [
  {
    number: 1,
    name: "Onboard",
    shortName: "Onboard",
    dayStart: 1,
    dayEnd: 15,
    owner: "Bert",
    deliverables: [
      { key: "kickoff", name: "Kickoff", description: "Structured kickoff meeting; goals, timeline, and contacts confirmed.", dayStart: 1, dayEnd: 2, owner: "Bert" },
      { key: "outcome-target", name: "Outcome target", description: "Agreed measurable outcomes for the 120-day programme.", dayStart: 3, dayEnd: 4, owner: "Bert" },
      { key: "migration-checklist", name: "Migration checklist", description: "Full audit of existing site and content ready for migration.", dayStart: 5, dayEnd: 9, owner: "Bert" },
      { key: "content-map", name: "90-day content map", description: "Topics, clusters, and publishing schedule through Day 90.", dayStart: 10, dayEnd: 11, owner: "Bert" },
      { key: "html-mockup", name: "HTML mockup", description: "Visual mockup of new site structure for client approval.", dayStart: 12, dayEnd: 13, owner: "Bert" },
      { key: "storage-kb", name: "Storage folder + KB", description: "Project folder live; knowledge base populated with all assets.", dayStart: 14, dayEnd: 14, owner: "Bert" },
      { key: "client-signoff", name: "Client call — sign-off", description: "Scope, mockup, and migration plan approved. PM joins for handover.", dayStart: 15, dayEnd: 15, owner: "PM + Bert" },
    ],
  },
  {
    number: 2,
    name: "Migrate & Rebrand",
    shortName: "Migrate",
    dayStart: 16,
    dayEnd: 30,
    owner: "PM + Dev",
    deliverables: [
      { key: "tech-docs", name: "Tech docs from Jun", description: "Full technical specification package for the developer.", dayStart: 16, dayEnd: 16, owner: "Jun" },
      { key: "migration-implementation", name: "Migration / Implementation", description: "HTML mockups converted to StackShift I.", dayStart: 16, dayEnd: 16, owner: "Dev" },
      { key: "structure-cleanup", name: "Structure cleanup", description: "URL architecture, redirects, forms, and navigation finalized.", dayStart: 24, dayEnd: 24, owner: "Dev" },
      { key: "branding-review", name: "Branding review", description: "Brand colours, fonts, and voice applied across all pages.", dayStart: 26, dayEnd: 26, owner: "Dev" },
      { key: "foundational-pages", name: "Foundational pages", description: "Home, About, Services, and Contact pages are launch ready.", dayStart: 28, dayEnd: 28, owner: "Dev" },
      { key: "internal-qa", name: "Internal QA", description: "Team review of build against mockup and tech docs.", dayStart: 29, dayEnd: 29, owner: "PM" },
      { key: "client-review-approval", name: "Client review + approval", description: "Client reviews dev URL and approves for launch.", dayStart: 30, dayEnd: 30, owner: "PM" },
    ],
  },
  {
    number: 3,
    name: "Publish",
    shortName: "Publish",
    dayStart: 31,
    dayEnd: 60,
    owner: "Erica + April",
    deliverables: [
      { key: "product-publishing", name: "Product publishing", description: "Dedicated pages per product/service line published.", dayStart: 40, dayEnd: 40, owner: "Erica" },
      { key: "industry-publishing", name: "Industry publishing", description: "Industry-specific content targeting buyer segments.", dayStart: 45, dayEnd: 45, owner: "April" },
      { key: "location-publishing", name: "Location publishing", description: "Local and regional landing pages as per content map.", dayStart: 50, dayEnd: 50, owner: "Erica" },
      { key: "buyer-education-content", name: "Buyer-education content", description: "Blog posts, guides, and FAQs aligned to buyer journey.", dayStart: 55, dayEnd: 55, owner: "April" },
      { key: "publishing-report", name: "Publishing report", description: "Summary of all content published and initial traffic data.", dayStart: 60, dayEnd: 60, owner: "PM" },
    ],
  },
  {
    number: 4,
    name: "AI Visibility",
    shortName: "AI Visibility",
    dayStart: 61,
    dayEnd: 90,
    owner: "April + Eri",
    deliverables: [
      { key: "updated-publishing-plan", name: "Updated Publishing Plan", description: "Based on metrics from the previous publishing report.", dayStart: 62, dayEnd: 62, owner: "April" },
      { key: "gap-publishing", name: "Gap publishing", description: "Identify and fill content gaps found via AI and search data.", dayStart: 70, dayEnd: 70, owner: "Eri" },
      { key: "conversion-refinements", name: "Conversion refinements", description: "CTA, form, and page improvements based on behaviour data.", dayStart: 80, dayEnd: 80, owner: "Dev" },
      { key: "ai-visibility-tracking", name: "AI visibility tracking & reporting", description: "90-day outcome check and analysis.", dayStart: 90, dayEnd: 90, owner: "April + Eri" },
    ],
  },
  {
    number: 5,
    name: "Optimize",
    shortName: "Optimize",
    dayStart: 91,
    dayEnd: 120,
    owner: "PM + Strategy",
    deliverables: [
      { key: "updated-publishing-plan", name: "Updated Publishing Plan", description: "Plans for the last 30 days in this cycle.", dayStart: 92, dayEnd: 92, owner: "PM" },
      { key: "gap-publishing", name: "Gap publishing", description: "Identify and fill remaining content gaps.", dayStart: 115, dayEnd: 115, owner: "Eri" },
      { key: "next-90day-roadmap", name: "Next 90-day roadmap", description: "Content, technical, and strategy plan for the next quarter.", dayStart: 118, dayEnd: 118, owner: "PM" },
      { key: "qbr-presentation", name: "QBR presentation", description: "Live review session with client covering results and next cycle roadmap.", dayStart: 120, dayEnd: 120, owner: "PM" },
    ],
  },
];

export function getCurrentProgrammeDay(startedAt: string | Date): number {
  const start = new Date(startedAt);
  const now = new Date();
  // Diff calendar dates (local midnight to local midnight), not raw ms/86_400_000 — programme_started_at
  // carries a time-of-day, and floor-dividing the raw instant gap under-counts until "now" catches up to
  // that same time-of-day each day (e.g. started 3pm, still shows yesterday's day number at 9am today).
  const startDay = new Date(start.getFullYear(), start.getMonth(), start.getDate());
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const diffDays = Math.round((today.getTime() - startDay.getTime()) / 86_400_000);
  return Math.max(1, diffDays + 1);
}

export function getPhaseForDay(day: number): PhaseConfig {
  return PROGRAMME_PHASES.find((p) => day >= p.dayStart && day <= p.dayEnd) ?? PROGRAMME_PHASES[PROGRAMME_PHASES.length - 1];
}

export function getPhaseByNumber(n: number): PhaseConfig {
  const phase = PROGRAMME_PHASES.find((p) => p.number === n);
  if (!phase) throw new Error(`Unknown programme phase number: ${n}`);
  return phase;
}

export function getDeliverable(phaseNumber: number, key: string): DeliverableConfig | undefined {
  return getPhaseByNumber(phaseNumber).deliverables.find((d) => d.key === key);
}

// ─── Internal deliverables (QBR "2.3 Bert's Internal Deliverables") ─────────
// Marketing/admin-only checklist — never shown to PM/developer/hr. Mapped to whichever Phase 1
// sub-phase it conceptually belongs with (the QBR's own table carries no day/sub-phase
// attribution — see task 123 doc's mapping table for the keyword-match rationale per item).
export type InternalDeliverableConfig = {
  key: string;
  name: string;
  description: string;
  subPhaseKey: string;
};

export const INTERNAL_DELIVERABLES: InternalDeliverableConfig[] = [
  { key: "implementation-file", name: "Implementation file", description: "Full implementation plan document.", subPhaseKey: "migration-checklist" },
  { key: "html-md-files", name: "HTML and MD files", description: "Mockup files and markdown source content.", subPhaseKey: "html-mockup" },
  { key: "branding-guides", name: "Branding guides", description: "Logo, colour palette, typography specs.", subPhaseKey: "storage-kb" },
  { key: "kb-info-raw", name: "KB info (raw)", description: "Raw knowledge base content before formatting.", subPhaseKey: "storage-kb" },
  { key: "cluster-topics-schedules", name: "Cluster topics & schedules", description: "Content clusters and publishing schedule.", subPhaseKey: "content-map" },
  { key: "publishing-plan", name: "Publishing plan", description: "Planned content calendar and approval flow.", subPhaseKey: "content-map" },
  { key: "dns-details", name: "DNS details", description: "Access to their domain management.", subPhaseKey: "storage-kb" },
  { key: "credentials-external", name: "Credentials (for external integrations)", description: "e.g. HubSpot, payment gateway access.", subPhaseKey: "storage-kb" },
  // Kickoff completion checklist (task 129) — gates the Kickoff sub-phase's own status via the
  // same auto-derive-from-siblings logic used above; not part of the original QBR table.
  { key: "kickoff-meeting-held", name: "Kickoff meeting held", description: "A structured kickoff call took place with the client.", subPhaseKey: "kickoff" },
  { key: "kickoff-contacts-confirmed", name: "Contacts confirmed", description: "At least one verified client contact is on file.", subPhaseKey: "kickoff" },
  { key: "kickoff-goals-timeline-filed", name: "Goals, timeline and other important details filed", description: "Captured in Business Facts / meeting notes.", subPhaseKey: "kickoff" },
  // Outcome Target completion checklist (task 130) — gates the sub-phase's own status via the
  // same auto-derive-from-siblings logic used above; not part of the original QBR table.
  { key: "outcome-target-filed", name: "Agreed measurable outcomes for the 120-day programme filed", description: "Recorded as text or an attached document.", subPhaseKey: "outcome-target" },
  // Client sign-off completion checklist (task 135) — gates the sub-phase's own status via the
  // same auto-derive-from-siblings logic used above; not part of the original QBR table.
  { key: "signoff-call-held", name: "Sign-off call held with the client, PM joining for handover", description: "A structured sign-off call took place.", subPhaseKey: "client-signoff" },
  { key: "signoff-agreement-filed", name: "Scope, mockup, and migration plan approval recorded", description: "Recorded as notes or a signed agreement.", subPhaseKey: "client-signoff" },
];

export function getInternalDeliverable(key: string): InternalDeliverableConfig | undefined {
  return INTERNAL_DELIVERABLES.find((d) => d.key === key);
}

export function internalDeliverablesForSubPhase(subPhaseKey: string): InternalDeliverableConfig[] {
  return INTERNAL_DELIVERABLES.filter((d) => d.subPhaseKey === subPhaseKey);
}

// ─── Classification (New Project intake) ────────────────────────────────────
// Service-tier/engagement-type axis — distinct from customer_products.product_name (the
// underlying software platform). See task 123 doc's "Key Design Decisions" for the rationale.
export const CLASSIFICATIONS = [
  "StackShift I",
  "StackShift II",
  "StackShift Access",
  "StackShift Access Plus",
  "PipelineForge",
  "Discrete Development",
] as const;
export type Classification = (typeof CLASSIFICATIONS)[number];

export function deriveProductName(classification: Classification): "StackShift" | "PipelineForge" {
  return classification === "PipelineForge" ? "PipelineForge" : "StackShift";
}

export function deriveProjectSuffix(classification: Classification): "Website" | "App" {
  return classification === "Discrete Development" ? "App" : "Website";
}

export function deriveProjectType(classification: Classification): "Content Site" | "Custom App" {
  return classification === "Discrete Development" ? "Custom App" : "Content Site";
}
