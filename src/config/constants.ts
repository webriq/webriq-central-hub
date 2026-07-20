export const ROUTES = {
  HOME: "/",
  DASHBOARD: "/dashboard",
  DASHBOARD_CUSTOMERS: "/dashboard/customers",
  DASHBOARD_TASKS: "/dashboard/tasks",
  DASHBOARD_PIPELINE: "/dashboard/pipeline",
  DASHBOARD_CHAT: "/dashboard/chat",
  DASHBOARD_TIMELOGS: "/dashboard/timelogs",
  DASHBOARD_SETTINGS: "/dashboard/settings",
  DASHBOARD_USERS: "/dashboard/users",
  CUSTOMERS_ONBOARD: "/dashboard/customers/onboard",
  ORCHESTRATION: "/orchestration",
  KB: "/kb",
  AUTH_LOGIN: "/auth/login",
  AUTH_SIGNUP: "/auth/signup",
} as const;

// LLM pricing per million tokens (USD)
// Used by llm_invocation_logs cost_usd computation
export const LLM_PRICING: Record<string, { input: number; output: number }> = {
  // Anthropic
  "claude-haiku-4-5-20251001": { input: 0.80, output: 4.00 },
  "claude-sonnet-4-6": { input: 3.00, output: 15.00 },
  "claude-opus-4-7": { input: 15.00, output: 75.00 },
  // OpenAI
  "gpt-4o": { input: 2.50, output: 10.00 },
  "gpt-4o-mini": { input: 0.15, output: 0.60 },
  "gpt-4-turbo": { input: 10.00, output: 30.00 },
  "o3-mini": { input: 1.10, output: 4.40 },
};

export function computeLLMCost(modelId: string, inputTokens: number, outputTokens: number): number {
  const pricing = LLM_PRICING[modelId];
  if (!pricing) return 0;
  return (inputTokens / 1_000_000) * pricing.input + (outputTokens / 1_000_000) * pricing.output;
}

export const V2_ROUTES = {
  HOME: "/v2",
  DASHBOARD: "/v2/dashboard",
  PROJECTS: "/v2/projects",
  CUSTOMERS: "/v2/customers",
  PORTFOLIO_TRACKER: "/v2/portfolio-tracker",
  PORTFOLIO_TRACKER_NEW: "/v2/portfolio-tracker/new",
  PORTFOLIO_TRACKER_IMPORT: "/v2/portfolio-tracker/import",
  DASHBOARD_TASKS: "/v2/dashboard/tasks",
  DASHBOARD_PIPELINE: "/v2/dashboard/pipeline",
  DASHBOARD_CHAT: "/v2/dashboard/chat",
  DASHBOARD_TIMELOGS: "/v2/dashboard/timelogs",
  DASHBOARD_SETTINGS: "/v2/dashboard/settings",
  DASHBOARD_USERS: "/v2/dashboard/users",
  CUSTOMERS_ONBOARD: "/v2/customers/onboard",
  ORCHESTRATION: "/v2/orchestration",
  KB: "/v2/kb",
  AUTH_LOGIN: "/v2/auth/login",
  AUTH_SIGNUP: "/v2/auth/signup",
  AUTH_PENDING: "/v2/auth/pending",
  CALLBACK: "/v2/callback",
} as const;

export const APP_NAME = "WebriQ Central Hub";
export const APP_VERSION = "0.1.0";
