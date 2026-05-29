export type OrchestrationLayer =
  | "classification"
  | "assessment"
  | "planning"
  | "execution"
  | "digest"
  | "reply"
  | "wiki_lint";

export type AIProvider = "anthropic" | "openai";

// Tech spec §6.1: CONTENT_UPDATE | SETTINGS_CHANGE | BLOG_PUBLISH | ASSET_UPLOAD |
// CODE_CHANGE_MINOR | SEO_UPDATE | BUG_REPORT | FEATURE_REQUEST | STRATEGIC
export type TaskType =
  | "CONTENT_UPDATE"
  | "SETTINGS_CHANGE"
  | "BLOG_PUBLISH"
  | "ASSET_UPLOAD"
  | "CODE_CHANGE_MINOR"
  | "SEO_UPDATE"
  | "BUG_REPORT"
  | "FEATURE_REQUEST"
  | "STRATEGIC"
  | "OTHER";

// Tech spec §6.1: YES | NO | HUMAN_ONLY (not a boolean)
export type LLMEligibility = "YES" | "NO" | "HUMAN_ONLY";

// Tech spec §8: CRITICAL | HIGH | NORMAL | LOW
export type TaskPriority = "CRITICAL" | "HIGH" | "NORMAL" | "LOW";

export type TaskStatus =
  | "pending"
  | "classifying"
  | "classified"
  | "assessing"
  | "assessed"
  | "planning"
  | "planned"
  | "approved"
  | "executing"
  | "complete"
  | "failed"
  | "partial"
  | "clarification_needed"
  | "rejected";

export type ClassificationStatus =
  | "pending"
  | "reviewed"
  | "rejected"
  | "planning"
  | "planned"
  | "approved"
  | "open"
  | "on_hold"
  | "active"
  | "review"
  | "closed";

export type AssessmentStatus = "CLEAR" | "PARTIAL" | "BLOCKED";

// Tech spec §8: PENDING_APPROVAL | APPROVED | REJECTED | EXECUTING | COMPLETE | FAILED
export type PlanStatus =
  | "PENDING_APPROVAL"
  | "APPROVED"
  | "REJECTED"
  | "EXECUTING"
  | "COMPLETE"
  | "FAILED";

export type PlanRejectionReason =
  | "PLAN_INCOMPLETE"
  | "WRONG_APPROACH"
  | "SCOPE_EXCEEDED"
  | "KNOWLEDGE_GAP"
  | "MISCLASSIFICATION";

// Tech spec §8: SUCCESS | PARTIAL | FAILED
export type ExecutionOutcome = "SUCCESS" | "PARTIAL" | "FAILED";

export type ExecutionStatus =
  | "pending"
  | "running"
  | "complete"
  | "failed"
  | "partial"
  | "reverted";

export type DigestType = "pm" | "dev";

export type DigestFeedback = "useful" | "partial" | "not_useful";

export type ProductName =
  | "StackShift"
  | "PublishForge"
  | "PipelineForge";

export type CustomerStatus = "active" | "inactive" | "onboarding" | "completed_onboarding";

// Tech spec §7A: formal | casual | technical
export type CommunicationTone = "formal" | "casual" | "technical";

export type WebhookSource = "zoho_desk" | "zoho_projects";

// Tech spec §6.5: ACTIVE | STALE | ARCHIVED
export type PlaybookStatus = "ACTIVE" | "STALE" | "ARCHIVED";

// Access control roles (COO Specs §Access Control)
export type UserRole = "admin" | "pm" | "developer" | "client";
