export type Json = string | number | boolean | null | { [key: string]: Json } | Json[];

export interface Database {
  public: {
    Tables: {
      customers: {
        Row: {
          id: string;
          customer_id: string;
          company_name: string;
          contact_name: string | null;
          contact_email: string | null;
          zoho_account_id: string | null;
          status: string;
          automation_toggle: boolean;
          llm_excluded: boolean;
          communication_tone: string;
          onboarding_status: Json;
          daily_token_budget: number | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          customer_id: string;
          company_name: string;
          contact_name?: string | null;
          contact_email?: string | null;
          zoho_account_id?: string | null;
          status?: string;
          automation_toggle?: boolean;
          llm_excluded?: boolean;
          communication_tone?: string;
          onboarding_status?: Json;
          daily_token_budget?: number | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          customer_id?: string;
          company_name?: string;
          contact_name?: string | null;
          contact_email?: string | null;
          zoho_account_id?: string | null;
          status?: string;
          automation_toggle?: boolean;
          llm_excluded?: boolean;
          communication_tone?: string;
          onboarding_status?: Json;
          daily_token_budget?: number | null;
          updated_at?: string;
        };
        Relationships: [];
      };
      customer_products: {
        Row: {
          id: string;
          customer_id: string;
          product_name: string;
          product_instance_id: string | null;
          sanity_project_id: string | null;
          zoho_project_id: string | null;
          github_repo: string | null;
          status: string;
          onboarding_complete: boolean;
          onboarding_data: Json;
          completed_percentage: number;
          dedicated_developers: string[];
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          customer_id: string;
          product_name: string;
          product_instance_id?: string | null;
          sanity_project_id?: string | null;
          zoho_project_id?: string | null;
          github_repo?: string | null;
          status?: string;
          onboarding_complete?: boolean;
          onboarding_data?: Json;
          completed_percentage?: number;
          dedicated_developers?: string[];
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          customer_id?: string;
          product_name?: string;
          product_instance_id?: string | null;
          sanity_project_id?: string | null;
          zoho_project_id?: string | null;
          github_repo?: string | null;
          status?: string;
          onboarding_complete?: boolean;
          onboarding_data?: Json;
          completed_percentage?: number;
          dedicated_developers?: string[];
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "customer_products_customer_id_fkey";
            columns: ["customer_id"];
            isOneToOne: false;
            referencedRelation: "customers";
            referencedColumns: ["customer_id"];
          }
        ];
      };
      classification_records: {
        Row: {
          id: string;
          customer_id: string;
          zoho_ticket_id: string | null;
          zoho_task_id: string | null;
          source: string;
          title: string;
          description: string | null;
          task_type: string | null;
          priority: string | null;
          llm_eligible: string;
          confidence_score: number | null;
          model_used: string | null;
          input_tokens: number | null;
          output_tokens: number | null;
          raw_response: Json | null;
          status: string;
          reviewed_by: string | null;
          reviewed_at: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          customer_id: string;
          zoho_ticket_id?: string | null;
          zoho_task_id?: string | null;
          source: string;
          title: string;
          description?: string | null;
          task_type?: string | null;
          priority?: string | null;
          llm_eligible?: string;
          confidence_score?: number | null;
          model_used?: string | null;
          input_tokens?: number | null;
          output_tokens?: number | null;
          raw_response?: Json | null;
          status?: string;
          reviewed_by?: string | null;
          reviewed_at?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          customer_id?: string;
          zoho_ticket_id?: string | null;
          zoho_task_id?: string | null;
          source?: string;
          title?: string;
          description?: string | null;
          task_type?: string | null;
          priority?: string | null;
          llm_eligible?: string;
          confidence_score?: number | null;
          model_used?: string | null;
          input_tokens?: number | null;
          output_tokens?: number | null;
          raw_response?: Json | null;
          status?: string;
          reviewed_by?: string | null;
          reviewed_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "classification_records_customer_id_fkey";
            columns: ["customer_id"];
            isOneToOne: false;
            referencedRelation: "customers";
            referencedColumns: ["customer_id"];
          }
        ];
      };
      requirements_assessments: {
        Row: {
          id: string;
          classification_id: string;
          customer_id: string;
          subtasks: Json;
          overall_status: string;
          clarification_draft: Json | null;
          confidence_to_proceed: number | null;
          model_used: string | null;
          input_tokens: number | null;
          output_tokens: number | null;
          assessment_version: number;
          created_at: string;
        };
        Insert: {
          id?: string;
          classification_id: string;
          customer_id: string;
          subtasks?: Json;
          overall_status: string;
          clarification_draft?: Json | null;
          confidence_to_proceed?: number | null;
          model_used?: string | null;
          input_tokens?: number | null;
          output_tokens?: number | null;
          assessment_version?: number;
          created_at?: string;
        };
        Update: {
          id?: string;
          classification_id?: string;
          customer_id?: string;
          subtasks?: Json;
          overall_status?: string;
          clarification_draft?: Json | null;
          confidence_to_proceed?: number | null;
          model_used?: string | null;
          input_tokens?: number | null;
          output_tokens?: number | null;
          assessment_version?: number;
        };
        Relationships: [
          {
            foreignKeyName: "requirements_assessments_classification_id_fkey";
            columns: ["classification_id"];
            isOneToOne: false;
            referencedRelation: "classification_records";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "requirements_assessments_customer_id_fkey";
            columns: ["customer_id"];
            isOneToOne: false;
            referencedRelation: "customers";
            referencedColumns: ["customer_id"];
          }
        ];
      };
      implementation_plans: {
        Row: {
          id: string;
          assessment_id: string;
          customer_id: string;
          steps: Json;
          affected_files: Json;
          apis_involved: Json;
          playbooks_used: Json;
          confidence_score: number | null;
          risk_flags: Json;
          status: string;
          rejection_reason: string | null;
          rejected_by: string | null;
          approved_by: string | null;
          model_used: string | null;
          input_tokens: number | null;
          output_tokens: number | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          assessment_id: string;
          customer_id: string;
          steps?: Json;
          affected_files?: Json;
          apis_involved?: Json;
          playbooks_used?: Json;
          confidence_score?: number | null;
          risk_flags?: Json;
          status?: string;
          rejection_reason?: string | null;
          rejected_by?: string | null;
          approved_by?: string | null;
          model_used?: string | null;
          input_tokens?: number | null;
          output_tokens?: number | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          assessment_id?: string;
          customer_id?: string;
          steps?: Json;
          affected_files?: Json;
          apis_involved?: Json;
          playbooks_used?: Json;
          confidence_score?: number | null;
          risk_flags?: Json;
          status?: string;
          rejection_reason?: string | null;
          rejected_by?: string | null;
          approved_by?: string | null;
          model_used?: string | null;
          input_tokens?: number | null;
          output_tokens?: number | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "implementation_plans_assessment_id_fkey";
            columns: ["assessment_id"];
            isOneToOne: false;
            referencedRelation: "requirements_assessments";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "implementation_plans_customer_id_fkey";
            columns: ["customer_id"];
            isOneToOne: false;
            referencedRelation: "customers";
            referencedColumns: ["customer_id"];
          }
        ];
      };
      execution_records: {
        Row: {
          id: string;
          plan_id: string;
          customer_id: string;
          status: string;
          outcome: string | null;
          outputs: Json;
          pre_action_states: Json;
          post_action_states: Json;
          what_was_done: string | null;
          what_was_skipped: string | null;
          github_pr_url: string | null;
          preview_url: string | null;
          error_message: string | null;
          failure_count: number;
          started_at: string | null;
          completed_at: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          plan_id: string;
          customer_id: string;
          status?: string;
          outcome?: string | null;
          outputs?: Json;
          pre_action_states?: Json;
          post_action_states?: Json;
          what_was_done?: string | null;
          what_was_skipped?: string | null;
          github_pr_url?: string | null;
          preview_url?: string | null;
          error_message?: string | null;
          failure_count?: number;
          started_at?: string | null;
          completed_at?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          plan_id?: string;
          customer_id?: string;
          status?: string;
          outcome?: string | null;
          outputs?: Json;
          pre_action_states?: Json;
          post_action_states?: Json;
          what_was_done?: string | null;
          what_was_skipped?: string | null;
          github_pr_url?: string | null;
          preview_url?: string | null;
          error_message?: string | null;
          failure_count?: number;
          started_at?: string | null;
          completed_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "execution_records_plan_id_fkey";
            columns: ["plan_id"];
            isOneToOne: false;
            referencedRelation: "implementation_plans";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "execution_records_customer_id_fkey";
            columns: ["customer_id"];
            isOneToOne: false;
            referencedRelation: "customers";
            referencedColumns: ["customer_id"];
          }
        ];
      };
      playbooks: {
        Row: {
          id: string;
          customer_id: string | null;
          task_type: string;
          title: string;
          content: string;
          version: number;
          status: string;
          source: string;
          embedding_summary: string | null;
          original_task_description: string | null;
          classification_applied: Json | null;
          execution_outcome: string | null;
          last_validated: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          customer_id?: string | null;
          task_type: string;
          title: string;
          content: string;
          version?: number;
          status?: string;
          source?: string;
          embedding_summary?: string | null;
          original_task_description?: string | null;
          classification_applied?: Json | null;
          execution_outcome?: string | null;
          last_validated?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          customer_id?: string | null;
          task_type?: string;
          title?: string;
          content?: string;
          version?: number;
          status?: string;
          source?: string;
          embedding_summary?: string | null;
          original_task_description?: string | null;
          classification_applied?: Json | null;
          execution_outcome?: string | null;
          last_validated?: string | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "playbooks_customer_id_fkey";
            columns: ["customer_id"];
            isOneToOne: false;
            referencedRelation: "customers";
            referencedColumns: ["customer_id"];
          }
        ];
      };
      llm_invocation_logs: {
        Row: {
          id: string;
          customer_id: string | null;
          orchestration_layer: string;
          model_used: string;
          input_tokens: number;
          output_tokens: number;
          cost_usd: number | null;
          duration_ms: number | null;
          status: string;
          error_message: string | null;
          reference_id: string | null;
          reference_type: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          customer_id?: string | null;
          orchestration_layer: string;
          model_used: string;
          input_tokens?: number;
          output_tokens?: number;
          cost_usd?: number | null;
          duration_ms?: number | null;
          status?: string;
          error_message?: string | null;
          reference_id?: string | null;
          reference_type?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          customer_id?: string | null;
          orchestration_layer?: string;
          model_used?: string;
          input_tokens?: number;
          output_tokens?: number;
          cost_usd?: number | null;
          duration_ms?: number | null;
          status?: string;
          error_message?: string | null;
          reference_id?: string | null;
          reference_type?: string | null;
        };
        Relationships: [];
      };
      digest_logs: {
        Row: {
          id: string;
          digest_type: string;
          target_user: string | null;
          content: Json;
          model_used: string | null;
          input_tokens: number | null;
          output_tokens: number | null;
          feedback: string | null;
          feedback_at: string | null;
          digest_date: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          digest_type: string;
          target_user?: string | null;
          content: Json;
          model_used?: string | null;
          input_tokens?: number | null;
          output_tokens?: number | null;
          feedback?: string | null;
          feedback_at?: string | null;
          digest_date: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          digest_type?: string;
          target_user?: string | null;
          content?: Json;
          model_used?: string | null;
          input_tokens?: number | null;
          output_tokens?: number | null;
          feedback?: string | null;
          feedback_at?: string | null;
          digest_date?: string;
        };
        Relationships: [];
      };
      llm_config: {
        Row: {
          id: string;
          orchestration_layer: string;
          provider: string;
          model_id: string;
          max_tokens: number;
          temperature: number;
          system_prompt_key: string | null;
          is_active: boolean;
          notes: string | null;
          updated_at: string;
        };
        Insert: {
          id?: string;
          orchestration_layer: string;
          provider?: string;
          model_id: string;
          max_tokens?: number;
          temperature?: number;
          system_prompt_key?: string | null;
          is_active?: boolean;
          notes?: string | null;
          updated_at?: string;
        };
        Update: {
          id?: string;
          orchestration_layer?: string;
          provider?: string;
          model_id?: string;
          max_tokens?: number;
          temperature?: number;
          system_prompt_key?: string | null;
          is_active?: boolean;
          notes?: string | null;
          updated_at?: string;
        };
        Relationships: [];
      };
      user_roles: {
        Row: {
          id: string;
          user_id: string;
          role: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          role: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          role?: string;
        };
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
}

// Convenience row types
export type CustomerRow = Database["public"]["Tables"]["customers"]["Row"];
export type CustomerProductRow = Database["public"]["Tables"]["customer_products"]["Row"];
export type ClassificationRecordRow = Database["public"]["Tables"]["classification_records"]["Row"];
export type RequirementsAssessmentRow = Database["public"]["Tables"]["requirements_assessments"]["Row"];
export type ImplementationPlanRow = Database["public"]["Tables"]["implementation_plans"]["Row"];
export type ExecutionRecordRow = Database["public"]["Tables"]["execution_records"]["Row"];
export type PlaybookRow = Database["public"]["Tables"]["playbooks"]["Row"];
export type LLMInvocationLogRow = Database["public"]["Tables"]["llm_invocation_logs"]["Row"];
export type DigestLogRow = Database["public"]["Tables"]["digest_logs"]["Row"];
export type LLMConfigRow = Database["public"]["Tables"]["llm_config"]["Row"];
export type UserRoleRow = Database["public"]["Tables"]["user_roles"]["Row"];
