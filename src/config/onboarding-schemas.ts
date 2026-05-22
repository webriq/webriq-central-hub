import type { FormSchema, FormSection } from "@/types/onboarding";
import type { ProductName } from "@/types/hub";

// ============================================================================
// StackShift Onboarding Form
// ============================================================================

const stackShiftSections: FormSection[] = [
  {
    id: "site-info",
    title: "Site Information",
    description: "Tell us about your web presence requirements",
    fields: [
      {
        name: "siteType",
        label: "Site Type",
        type: "select",
        required: true,
        options: ["Multi-Site", "Single Site", "Landing Page"],
        hint: "What type of web presence do you need?",
      },
      {
        name: "numPages",
        label: "Number of Pages/Sites Expected",
        type: "select",
        required: true,
        options: ["1-10", "11-50", "51-100", "101-500", "500+"],
      },
      {
        name: "needsEcommerce",
        label: "E-commerce Required?",
        type: "radio-group",
        required: true,
        options: ["Yes", "No"],
      },
      {
        name: "ecommercePlatform",
        label: "Preferred E-commerce Platform",
        type: "select",
        options: ["Shopify", "BigCommerce", "WooCommerce", "Custom", "Other"],
        condition: { field: "needsEcommerce", value: "Yes" },
      },
    ],
  },
  {
    id: "design",
    title: "Design Preferences",
    description: "Share your brand identity and design requirements",
    fields: [
      {
        name: "hasBrandGuide",
        label: "Do you have an existing brand guide?",
        type: "radio-group",
        required: true,
        options: ["Yes", "No"],
      },
      {
        name: "brandGuide",
        label: "Brand Guide Upload",
        type: "file",
        hint: "Upload your brand guide (PDF, images, or documents). Max 25MB.",
        condition: { field: "hasBrandGuide", value: "Yes" },
      },
      {
        name: "referenceSites",
        label: "Reference Sites",
        type: "textarea",
        placeholder: "List URLs of websites you like and what you like about them...",
        hint: "Share 3-5 websites whose design or functionality inspires you",
      },
      {
        name: "designNotes",
        label: "Design Notes / Preferences",
        type: "textarea",
        placeholder: "Any specific colors, fonts, styles, or design direction...",
      },
    ],
  },
  {
    id: "migration",
    title: "Content Migration",
    description: "Help us understand your existing content",
    fields: [
      {
        name: "hasExistingCms",
        label: "Migrating from an existing CMS?",
        type: "radio-group",
        required: true,
        options: ["Yes", "No"],
      },
      {
        name: "existingCms",
        label: "Current CMS Platform",
        type: "select",
        options: ["WordPress", "Drupal", "Joomla", "Wix", "Squarespace", "Webflow", "Custom", "Other"],
        condition: { field: "hasExistingCms", value: "Yes" },
      },
      {
        name: "migrationNotes",
        label: "Migration Requirements",
        type: "textarea",
        placeholder: "Describe your content migration needs, volume, and any special requirements...",
        condition: { field: "hasExistingCms", value: "Yes" },
      },
    ],
  },
  {
    id: "integrations",
    title: "Third-Party Integrations",
    description: "What tools and services need to connect?",
    fields: [
      {
        name: "crmRequired",
        label: "CRM Integration",
        type: "checkbox-group",
        options: ["HubSpot", "Salesforce", "Zoho CRM", "Pipedrive", "Other / Custom"],
      },
      {
        name: "emailMarketing",
        label: "Email Marketing",
        type: "checkbox-group",
        options: ["Mailchimp", "Klaviyo", "SendGrid", "Constant Contact", "Other"],
      },
      {
        name: "analytics",
        label: "Analytics & Tracking",
        type: "checkbox-group",
        options: ["Google Analytics 4", "Google Tag Manager", "Facebook Pixel", "Hotjar", "Other"],
      },
      {
        name: "otherIntegrations",
        label: "Other Integrations",
        type: "textarea",
        placeholder: "Any other tools, APIs, or services you need to integrate...",
      },
    ],
  },
  {
    id: "seo",
    title: "SEO Requirements",
    description: "Search engine optimization needs",
    fields: [
      {
        name: "needsSeoMigration",
        label: "Existing rankings to preserve?",
        type: "radio-group",
        required: true,
        options: ["Yes - We have existing SEO value to protect", "No - Starting fresh"],
      },
      {
        name: "targetKeywords",
        label: "Target Keywords",
        type: "textarea",
        placeholder: "List your primary target keywords or topics...",
        hint: "These will guide on-page SEO strategy",
      },
      {
        name: "multilingual",
        label: "Multilingual Requirements",
        type: "radio-group",
        required: true,
        options: ["Yes - Multiple languages needed", "No - Single language only"],
      },
      {
        name: "languages",
        label: "Languages Required",
        type: "checkbox-group",
        options: ["English", "Spanish", "French", "German", "Chinese", "Japanese", "Arabic", "Other"],
        condition: { field: "multilingual", value: "Yes - Multiple languages needed" },
      },
      {
        name: "translationWorkflow",
        label: "Translation Workflow",
        type: "select",
        options: ["Manual (we provide translations)", "AI-assisted", "Professional service"],
        condition: { field: "multilingual", value: "Yes - Multiple languages needed" },
      },
    ],
  },
  {
    id: "addons",
    title: "Add-ons",
    description: "Optional WebriQ products bundled with StackShift",
    fields: [
      {
        name: "includeCiteForge",
        label: "Include CiteForge?",
        type: "radio-group",
        required: true,
        options: ["Yes", "No"],
        hint: "CiteForge adds citation & bibliography management to your StackShift site.",
      },
    ],
  },
  {
    id: "citeforge-content-inventory",
    title: "CiteForge — Content Inventory",
    description: "Tell us about the content you want to migrate and restructure",
    condition: { field: "includeCiteForge", value: "Yes" },
    fields: [
      {
        name: "cfCurrentPlatform",
        label: "Current Content Platform",
        type: "select",
        required: true,
        options: ["WordPress", "Webflow", "Squarespace", "Wix", "Drupal", "Custom CMS", "Static HTML", "Other"],
        hint: "Where does your existing content live?",
      },
      {
        name: "cfPageCount",
        label: "Estimated Pages to Migrate",
        type: "select",
        required: true,
        options: ["Under 50", "50–100", "101–250", "251–500", "500+"],
      },
      {
        name: "cfContentFormats",
        label: "Content Formats",
        type: "checkbox-group",
        required: true,
        options: ["Blog Posts / Articles", "Product / Service Pages", "Landing Pages", "Documentation", "PDFs", "News / Press Releases"],
      },
      {
        name: "cfPriorityContent",
        label: "Highest-Priority Content Areas",
        type: "textarea",
        placeholder: "e.g., Our blog (300 posts), product pages, technical docs — these need AI-readiness first...",
        hint: "We start with your most important pages in week one.",
      },
    ],
  },
  {
    id: "citeforge-ai-goals",
    title: "CiteForge — AI Readiness Goals",
    description: "What do you want your content to achieve in the AI era?",
    condition: { field: "includeCiteForge", value: "Yes" },
    fields: [
      {
        name: "cfPrimaryGoal",
        label: "Primary Goal",
        type: "checkbox-group",
        required: true,
        options: [
          "Be cited by AI tools (ChatGPT, Perplexity, Gemini)",
          "Improve AI search visibility",
          "Add Schema.org / structured data",
          "Modernize content structure",
          "Migrate away from legacy CMS",
        ],
      },
      {
        name: "cfHasStructuredData",
        label: "Do you have existing Schema.org / structured data markup?",
        type: "radio-group",
        required: true,
        options: ["Yes", "No", "Not sure"],
      },
      {
        name: "cfContentQualityConcerns",
        label: "Content Quality Concerns",
        type: "checkbox-group",
        options: ["Outdated content", "Thin / low-quality pages", "Duplicate content", "Poor readability", "Missing metadata", "No internal linking strategy"],
      },
      {
        name: "cfAdditionalContext",
        label: "Additional Context",
        type: "textarea",
        placeholder: "Anything else we should know about your content or AI goals...",
      },
    ],
  },
  {
    id: "citeforge-launch",
    title: "CiteForge — Launch & Support",
    description: "Timeline, scope, and how we'll work together",
    condition: { field: "includeCiteForge", value: "Yes" },
    fields: [
      {
        name: "cfTimeline",
        label: "Desired Launch Timeline",
        type: "select",
        required: true,
        options: ["ASAP (start immediately)", "Within 2 weeks (standard)", "1 month", "2–3 months", "Flexible"],
      },
      {
        name: "cfSlackWorkspace",
        label: "Slack Workspace for DFY Support",
        type: "radio-group",
        required: true,
        options: ["We have Slack — invite us", "We don't use Slack — other channel preferred"],
        hint: "CiteForge runs on a Do-It-For-You model with Slack-based collaboration.",
      },
      {
        name: "cfSlackAlternative",
        label: "Preferred Alternative Communication Channel",
        type: "select",
        options: ["Email", "Microsoft Teams", "Google Chat", "Zoom / Meetings only"],
        condition: { field: "cfSlackWorkspace", value: "We don't use Slack — other channel preferred" },
      },
      {
        name: "cfScopeNotes",
        label: "Scope Notes / Special Requirements",
        type: "textarea",
        placeholder: "Any content that must stay unchanged, compliance requirements, staging environment details...",
      },
    ],
  },
];

// ============================================================================
// PublishForge Onboarding Form
// ============================================================================

const publishForgeSections: FormSection[] = [
  {
    id: "content-volume",
    title: "Content Volume & Cadence",
    description: "Help us understand your publishing needs",
    fields: [
      {
        name: "postVolume",
        label: "Expected Post Volume",
        type: "select",
        required: true,
        options: ["1-2 per week", "3-5 per week", "1 per day", "Multiple per day", "Occasional / As needed"],
      },
      {
        name: "contentTypes",
        label: "Content Types Needed",
        type: "checkbox-group",
        required: true,
        options: ["Blog Posts", "Case Studies", "Whitepapers", "News Articles", "Press Releases", "Product Updates"],
      },
      {
        name: "otherContentTypes",
        label: "Other Content Types",
        type: "text",
        placeholder: "e.g., Podcast show notes, video transcripts...",
      },
    ],
  },
  {
    id: "authors",
    title: "Author & Workflow",
    description: "Who writes and how is content approved?",
    fields: [
      {
        name: "authorSetup",
        label: "Author Setup",
        type: "select",
        required: true,
        options: ["Single Author", "Multi-Author Team", "Guest Authors Allowed", "Mixed (Internal + Guest)"],
      },
      {
        name: "editorialWorkflow",
        label: "Editorial Workflow",
        type: "radio-group",
        required: true,
        options: [
          "Draft → Publish (no review)",
          "Draft → Review → Publish",
          "Draft → Review → Approve → Publish",
        ],
      },
      {
        name: "approverRole",
        label: "Who Approves Content?",
        type: "select",
        options: ["Editor", "Marketing Manager", "Legal", "CEO/Founder", "Multiple Reviewers"],
        condition: {
          field: "editorialWorkflow",
          value: "Draft → Review → Approve → Publish",
        },
      },
    ],
  },
  {
    id: "seo-social",
    title: "SEO & Social Media",
    description: "Optimization and distribution",
    fields: [
      {
        name: "targetKeywordsBlog",
        label: "Target Keywords / Topics",
        type: "textarea",
        placeholder: "List primary SEO keywords and topics for your content strategy...",
      },
      {
        name: "hasExistingContent",
        label: "Existing Content to Migrate?",
        type: "radio-group",
        required: true,
        options: ["Yes", "No"],
      },
      {
        name: "existingContentDetails",
        label: "Migration Details",
        type: "textarea",
        placeholder: "Describe existing content: platform, volume, format...",
        condition: { field: "hasExistingContent", value: "Yes" },
      },
      {
        name: "socialAutoPublish",
        label: "Social Media Auto-Publishing",
        type: "radio-group",
        required: true,
        options: ["Yes", "No"],
      },
      {
        name: "socialChannels",
        label: "Social Channels",
        type: "checkbox-group",
        options: ["Facebook", "X (Twitter)", "LinkedIn", "Instagram", "Pinterest", "TikTok"],
        condition: { field: "socialAutoPublish", value: "Yes" },
      },
      {
        name: "newsletterIntegration",
        label: "Newsletter Integration",
        type: "radio-group",
        required: true,
        options: ["Yes", "No"],
      },
      {
        name: "newsletterProvider",
        label: "Email Provider",
        type: "select",
        options: ["Mailchimp", "ConvertKit", "Substack", "SendGrid", "HubSpot", "Custom API", "Other"],
        condition: { field: "newsletterIntegration", value: "Yes" },
      },
    ],
  },
];

// ============================================================================
// PipelineForge Onboarding Form (Reference: _design/forms/PipelineForge_Onboarding_Form.html)
// ============================================================================

const pipelineForgeSections: FormSection[] = [
  {
    id: "client-details",
    title: "Client Details",
    description: "Basic company and contact information",
    fields: [
      { name: "companyName", label: "Company Name", type: "text", required: true, span: "half" },
      { name: "companyWebsite", label: "Company Website", type: "url", required: true, span: "half" },
      { name: "companyIndustry", label: "Industry", type: "select", required: true, options: ["Technology", "Manufacturing", "Construction", "Professional Services", "eCommerce", "Healthcare", "Education", "Other"], span: "half" },
      { name: "companySize", label: "Company Size", type: "select", required: true, options: ["1-10", "11-50", "51-200", "201-1000", "1000+"], span: "half" },
      { name: "primaryContactName", label: "Primary Contact Name", type: "text", required: true, span: "half" },
      { name: "primaryContactEmail", label: "Primary Contact Email", type: "email", required: true, span: "half" },
      { name: "primaryContactPhone", label: "Primary Contact Phone", type: "text", span: "half" },
      { name: "primaryContactRole", label: "Primary Contact Role", type: "text", span: "half" },
    ],
  },
  {
    id: "icp-profile",
    title: "ICP Profile",
    description: "Define your ideal customer profile",
    fields: [
      { name: "icpDescription", label: "ICP Description", type: "textarea", placeholder: "Describe your ideal customer profile in detail...", required: true },
      { name: "icpIndustries", label: "Target Industries", type: "checkbox-group", required: true, options: ["Technology", "Finance", "Healthcare", "Manufacturing", "Retail", "Education", "Real Estate", "Legal", "Other"] },
      { name: "icpCompanySize", label: "Target Company Size", type: "select", required: true, options: ["Startup (1-10)", "Small (11-50)", "Medium (51-200)", "Large (201-1000)", "Enterprise (1000+)"] },
      { name: "icpRevenue", label: "Target Revenue Range", type: "select", options: ["Under $1M", "$1M-$10M", "$10M-$50M", "$50M-$100M", "$100M+"] },
      { name: "icpGeography", label: "Target Geography", type: "text", placeholder: "e.g., North America, Global, US only..." },
    ],
  },
  {
    id: "buyer-personas",
    title: "Buyer Personas",
    description: "Define who you're reaching and their weight",
    fields: [
      { name: "persona1Title", label: "Persona 1 — Title", type: "text", required: true, placeholder: "e.g., CTO", span: "half" },
      { name: "persona1Weight", label: "Persona 1 — Weight (%)", type: "select", required: true, options: ["10", "20", "30", "40", "50", "60", "70", "80", "90", "100"], span: "half" },
      { name: "persona1PainPoints", label: "Persona 1 — Pain Points", type: "textarea", required: true, placeholder: "What problems do they face?" },
      { name: "persona2Title", label: "Persona 2 — Title", type: "text", placeholder: "e.g., VP of Sales", span: "half" },
      { name: "persona2Weight", label: "Persona 2 — Weight (%)", type: "select", options: ["10", "20", "30", "40", "50"], span: "half" },
      { name: "persona2PainPoints", label: "Persona 2 — Pain Points", type: "textarea", placeholder: "What problems do they face?" },
      { name: "persona3Title", label: "Persona 3 — Title", type: "text", placeholder: "e.g., Marketing Director", span: "half" },
      { name: "persona3Weight", label: "Persona 3 — Weight (%)", type: "select", options: ["10", "20", "30"], span: "half" },
      { name: "persona3PainPoints", label: "Persona 3 — Pain Points", type: "textarea", placeholder: "What problems do they face?" },
    ],
  },
  {
    id: "sales-motion",
    title: "Sales Motion",
    description: "Your outreach strategy and messaging",
    fields: [
      { name: "valueProposition", label: "Value Proposition", type: "textarea", required: true, placeholder: "Your core value proposition in 2-3 sentences..." },
      { name: "toneOfVoice", label: "Tone of Voice", type: "select", required: true, options: ["Formal", "Casual", "Technical", "Friendly", "Authoritative"] },
      { name: "replyTemplateIntro", label: "Reply Template — Introduction", type: "textarea", placeholder: "Template for intro/reply emails..." },
      { name: "replyTemplateFollowup", label: "Reply Template — Follow-Up", type: "textarea", placeholder: "Template for follow-up emails..." },
    ],
  },
  {
    id: "infrastructure",
    title: "Infrastructure",
    description: "Email infrastructure and sending setup",
    fields: [
      { name: "emailProvider", label: "Primary Email Provider", type: "select", required: true, options: ["Google Workspace", "Microsoft 365", "Custom SMTP", "Other"] },
      { name: "usesSmartLead", label: "Using SmartLead?", type: "radio-group", required: true, options: ["Yes", "No"] },
      { name: "usesInstantly", label: "Using Instantly?", type: "radio-group", required: true, options: ["Yes", "No"] },
      { name: "crmSystem", label: "CRM System", type: "select", required: true, options: ["HubSpot", "Salesforce", "Pipedrive", "Zoho CRM", "Custom", "None"] },
      { name: "domainSetup", label: "DNS / Domain Setup Status", type: "select", required: true, options: ["Already configured (SPF, DKIM, DMARC)", "Needs setup", "Not sure — need help"] },
      { name: "emailVolume", label: "Expected Monthly Email Volume", type: "select", required: true, options: ["Under 1,000", "1,000-5,000", "5,000-10,000", "10,000-50,000", "50,000+"] },
    ],
  },
  {
    id: "pipeline",
    title: "Pipeline",
    description: "Pipeline stages and lead management",
    fields: [
      { name: "pipelineStages", label: "Pipeline Stages", type: "textarea", required: true, placeholder: "List your pipeline stages in order, one per line..." },
      { name: "leadScoringEnabled", label: "Lead Scoring?", type: "radio-group", required: true, options: ["Yes", "No"] },
      { name: "leadScoringCriteria", label: "Lead Scoring Criteria", type: "textarea", placeholder: "Describe how leads should be scored...", condition: { field: "leadScoringEnabled", value: "Yes" } },
    ],
  },
  {
    id: "compliance",
    title: "Compliance",
    description: "Regulatory requirements and preferences",
    fields: [
      { name: "canSpamCompliant", label: "CAN-SPAM Compliance Required", type: "radio-group", required: true, options: ["Yes", "No"] },
      { name: "gdprCompliant", label: "GDPR Compliance Required", type: "radio-group", required: true, options: ["Yes", "No"] },
      { name: "unsubscribeHandling", label: "Unsubscribe Handling", type: "select", required: true, options: ["Auto (one-click)", "Manual review", "Custom workflow"] },
    ],
  },
  {
    id: "goals",
    title: "Goals & Success Metrics",
    description: "Define what success looks like",
    fields: [
      { name: "successMetrics", label: "Key Success Metrics", type: "textarea", required: true, placeholder: "What metrics define success? e.g., open rate >40%, reply rate >5%, meetings booked per month..." },
      { name: "targetMeetingsPerMonth", label: "Target Meetings/Month", type: "select", required: true, options: ["1-5", "5-10", "10-20", "20-50", "50+"] },
      { name: "timelineToLaunch", label: "Target Launch Timeline", type: "select", required: true, options: ["ASAP (within 1 week)", "2-4 weeks", "1-2 months", "3+ months"] },
    ],
  },
];

// ============================================================================
// Master Schema Map
// ============================================================================

const schemas: Record<ProductName, FormSchema> = {
  StackShift: {
    productName: "StackShift",
    sections: stackShiftSections,
  },
  PublishForge: {
    productName: "PublishForge",
    sections: publishForgeSections,
  },
  PipelineForge: {
    productName: "PipelineForge",
    sections: pipelineForgeSections,
  },
};

/**
 * Returns the onboarding form schema for a given product.
 */
export function getOnboardingSchema(productName: string): FormSchema | null {
  if (productName in schemas) {
    return schemas[productName as ProductName];
  }
  return null;
}

export default schemas;