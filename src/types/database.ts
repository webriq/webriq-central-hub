export type Json = string | number | boolean | null | { [key: string]: Json } | Json[];

export interface Database {
  hr: {
    Tables: {
      employees: {
        Row: {
          id: string;
          profile_id: string;
          employee_number: string | null;
          full_name: string;
          department: string | null;
          position: string | null;
          employment_type: "full_time" | "part_time" | "contract";
          manager_id: string | null;
          date_hired: string | null;
          date_separated: string | null;
          status: "active" | "on_leave" | "separated";
          emergency_contact: Json | null;
          meta: Json | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          profile_id: string;
          employee_number?: string | null;
          full_name: string;
          department?: string | null;
          position?: string | null;
          employment_type: "full_time" | "part_time" | "contract";
          manager_id?: string | null;
          date_hired?: string | null;
          date_separated?: string | null;
          status?: "active" | "on_leave" | "separated";
          emergency_contact?: Json | null;
          meta?: Json | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          profile_id?: string;
          employee_number?: string | null;
          full_name?: string;
          department?: string | null;
          position?: string | null;
          employment_type?: "full_time" | "part_time" | "contract";
          manager_id?: string | null;
          date_hired?: string | null;
          date_separated?: string | null;
          status?: "active" | "on_leave" | "separated";
          emergency_contact?: Json | null;
          meta?: Json | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "employees_profile_id_fkey";
            columns: ["profile_id"];
            isOneToOne: true;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "employees_manager_id_fkey";
            columns: ["manager_id"];
            isOneToOne: false;
            referencedRelation: "employees";
            referencedColumns: ["id"];
          }
        ];
      };
      attendance_punches: {
        Row: {
          id: string;
          employee_id: string;
          punched_at: string;
          direction: "in" | "out";
          ip: string | null;
          geo: string | null;
          device: string | null;
        };
        Insert: {
          id?: string;
          employee_id: string;
          punched_at: string;
          direction: "in" | "out";
          ip?: string | null;
          geo?: string | null;
          device?: string | null;
        };
        Update: {
          id?: string;
          employee_id?: string;
          punched_at?: string;
          direction?: "in" | "out";
          ip?: string | null;
          geo?: string | null;
          device?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "attendance_punches_employee_id_fkey";
            columns: ["employee_id"];
            isOneToOne: false;
            referencedRelation: "employees";
            referencedColumns: ["id"];
          }
        ];
      };
      attendance_days: {
        Row: {
          id: string;
          employee_id: string;
          work_date: string;
          status: "present" | "late" | "half_day" | "absent" | "on_leave" | "holiday" | "rest_day";
          first_in: string | null;
          last_out: string | null;
          total_hours: number | null;
          correction_of: string | null;
          corrected_by: string | null;
        };
        Insert: {
          id?: string;
          employee_id: string;
          work_date: string;
          status: "present" | "late" | "half_day" | "absent" | "on_leave" | "holiday" | "rest_day";
          first_in?: string | null;
          last_out?: string | null;
          total_hours?: number | null;
          correction_of?: string | null;
          corrected_by?: string | null;
        };
        Update: {
          id?: string;
          employee_id?: string;
          work_date?: string;
          status?: "present" | "late" | "half_day" | "absent" | "on_leave" | "holiday" | "rest_day";
          first_in?: string | null;
          last_out?: string | null;
          total_hours?: number | null;
          correction_of?: string | null;
          corrected_by?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "attendance_days_employee_id_fkey";
            columns: ["employee_id"];
            isOneToOne: false;
            referencedRelation: "employees";
            referencedColumns: ["id"];
          }
        ];
      };
      leave_types: {
        Row: {
          id: string;
          name: string;
          code: string;
          paid: boolean;
          accrual_rule: Json | null;
          carry_over_cap: number | null;
          active: boolean;
        };
        Insert: {
          id?: string;
          name: string;
          code: string;
          paid?: boolean;
          accrual_rule?: Json | null;
          carry_over_cap?: number | null;
          active?: boolean;
        };
        Update: {
          id?: string;
          name?: string;
          code?: string;
          paid?: boolean;
          accrual_rule?: Json | null;
          carry_over_cap?: number | null;
          active?: boolean;
        };
        Relationships: [];
      };
      leave_balances: {
        Row: {
          id: string;
          employee_id: string;
          leave_type_id: string;
          year: number;
          accrued: number;
          used: number;
          balance: number;
        };
        Insert: {
          id?: string;
          employee_id: string;
          leave_type_id: string;
          year: number;
          accrued?: number;
          used?: number;
        };
        Update: {
          id?: string;
          employee_id?: string;
          leave_type_id?: string;
          year?: number;
          accrued?: number;
          used?: number;
        };
        Relationships: [
          {
            foreignKeyName: "leave_balances_employee_id_fkey";
            columns: ["employee_id"];
            isOneToOne: false;
            referencedRelation: "employees";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "leave_balances_leave_type_id_fkey";
            columns: ["leave_type_id"];
            isOneToOne: false;
            referencedRelation: "leave_types";
            referencedColumns: ["id"];
          }
        ];
      };
      leave_requests: {
        Row: {
          id: string;
          employee_id: string;
          leave_type_id: string;
          start_date: string;
          end_date: string;
          half_day: boolean;
          reason: string | null;
          attachment_path: string | null;
          status: "pending" | "approved" | "rejected" | "cancelled";
          approver_id: string | null;
          decided_at: string | null;
          decision_note: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          employee_id: string;
          leave_type_id: string;
          start_date: string;
          end_date: string;
          half_day?: boolean;
          reason?: string | null;
          attachment_path?: string | null;
          status?: "pending" | "approved" | "rejected" | "cancelled";
          approver_id?: string | null;
          decided_at?: string | null;
          decision_note?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          employee_id?: string;
          leave_type_id?: string;
          start_date?: string;
          end_date?: string;
          half_day?: boolean;
          reason?: string | null;
          attachment_path?: string | null;
          status?: "pending" | "approved" | "rejected" | "cancelled";
          approver_id?: string | null;
          decided_at?: string | null;
          decision_note?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "leave_requests_employee_id_fkey";
            columns: ["employee_id"];
            isOneToOne: false;
            referencedRelation: "employees";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "leave_requests_leave_type_id_fkey";
            columns: ["leave_type_id"];
            isOneToOne: false;
            referencedRelation: "leave_types";
            referencedColumns: ["id"];
          }
        ];
      };
      timesheets: {
        Row: {
          id: string;
          employee_id: string;
          week_start: string;
          status: "draft" | "submitted" | "approved" | "locked";
          submitted_at: string | null;
          approved_by: string | null;
          approved_at: string | null;
        };
        Insert: {
          id?: string;
          employee_id: string;
          week_start: string;
          status?: "draft" | "submitted" | "approved" | "locked";
          submitted_at?: string | null;
          approved_by?: string | null;
          approved_at?: string | null;
        };
        Update: {
          id?: string;
          employee_id?: string;
          week_start?: string;
          status?: "draft" | "submitted" | "approved" | "locked";
          submitted_at?: string | null;
          approved_by?: string | null;
          approved_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "timesheets_employee_id_fkey";
            columns: ["employee_id"];
            isOneToOne: false;
            referencedRelation: "employees";
            referencedColumns: ["id"];
          }
        ];
      };
      announcements: {
        Row: {
          id: string;
          title: string;
          body: string;
          pinned: boolean;
          author_id: string;
          published_at: string;
        };
        Insert: {
          id?: string;
          title: string;
          body: string;
          pinned?: boolean;
          author_id: string;
          published_at?: string;
        };
        Update: {
          id?: string;
          title?: string;
          body?: string;
          pinned?: boolean;
          author_id?: string;
          published_at?: string;
        };
        Relationships: [];
      };
      hr_requests: {
        Row: {
          id: string;
          employee_id: string;
          request_type: string;
          details: Json | null;
          status: "pending" | "approved" | "rejected" | "cancelled";
          approver_id: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          employee_id: string;
          request_type: string;
          details?: Json | null;
          status?: "pending" | "approved" | "rejected" | "cancelled";
          approver_id?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          employee_id?: string;
          request_type?: string;
          details?: Json | null;
          status?: "pending" | "approved" | "rejected" | "cancelled";
          approver_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "hr_requests_employee_id_fkey";
            columns: ["employee_id"];
            isOneToOne: false;
            referencedRelation: "employees";
            referencedColumns: ["id"];
          }
        ];
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
  public: {
    Tables: {
      customers: {
        Row: {
          id: string;
          customer_id: string;
          company_name: string;
          contact_name: string | null;
          contact_email: string | null;
          status: string;
          automation_toggle: boolean;
          llm_excluded: boolean;
          communication_tone: string;
          onboarding_status: Json;
          daily_token_budget: number | null;
          automation_paused: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          customer_id: string;
          company_name: string;
          contact_name?: string | null;
          contact_email?: string | null;
          status?: string;
          automation_toggle?: boolean;
          llm_excluded?: boolean;
          communication_tone?: string;
          onboarding_status?: Json;
          daily_token_budget?: number | null;
          automation_paused?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          customer_id?: string;
          company_name?: string;
          contact_name?: string | null;
          contact_email?: string | null;
          status?: string;
          automation_toggle?: boolean;
          llm_excluded?: boolean;
          communication_tone?: string;
          onboarding_status?: Json;
          daily_token_budget?: number | null;
          automation_paused?: boolean;
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
          status: string;
          onboarding_complete: boolean;
          onboarding_data: Json;
          completed_percentage: number;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          customer_id: string;
          product_name: string;
          product_instance_id?: string | null;
          status?: string;
          onboarding_complete?: boolean;
          onboarding_data?: Json;
          completed_percentage?: number;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          customer_id?: string;
          product_name?: string;
          product_instance_id?: string | null;
          status?: string;
          onboarding_complete?: boolean;
          onboarding_data?: Json;
          completed_percentage?: number;
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
      profiles: {
        Row: {
          id: string;
          role: "admin" | "hr" | "pm" | "developer" | "client" | "super_admin";
          full_name: string | null;
          avatar_url: string | null;
          customer_id: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          role: "admin" | "hr" | "pm" | "developer" | "client" | "super_admin";
          full_name?: string | null;
          avatar_url?: string | null;
          customer_id?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          role?: "admin" | "hr" | "pm" | "developer" | "client" | "super_admin";
          full_name?: string | null;
          avatar_url?: string | null;
          customer_id?: string | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "profiles_customer_id_fkey";
            columns: ["customer_id"];
            isOneToOne: false;
            referencedRelation: "customers";
            referencedColumns: ["customer_id"];
          }
        ];
      };
      projects: {
        Row: {
          id: string;
          customer_id: string;
          name: string;
          project_type: string;
          status: "active" | "on_hold" | "completed" | "archived";
          customer_product_id: string | null;
          description: string | null;
          created_by: string | null;
          zoho_project_id: string | null;
          sanity_project_id: string | null;
          github_repo: string | null;
          dedicated_developers: string[];
          dataset: string | null;
          vercel_project_id: string | null;
          start_date: string | null;
          end_date: string | null;
          percent_complete: number;
          existing_website: string | null;
          development_site: string | null;
          source_meta: Json;
          tags: string[] | null;
          owner_name: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          customer_id: string;
          name: string;
          project_type: string;
          status?: "active" | "on_hold" | "completed" | "archived";
          customer_product_id?: string | null;
          description?: string | null;
          created_by?: string | null;
          zoho_project_id?: string | null;
          sanity_project_id?: string | null;
          github_repo?: string | null;
          dedicated_developers?: string[];
          dataset?: string | null;
          vercel_project_id?: string | null;
          start_date?: string | null;
          end_date?: string | null;
          percent_complete?: number;
          existing_website?: string | null;
          development_site?: string | null;
          source_meta?: Json;
          tags?: string[] | null;
          owner_name?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          customer_id?: string;
          name?: string;
          project_type?: string;
          status?: "active" | "on_hold" | "completed" | "archived";
          customer_product_id?: string | null;
          description?: string | null;
          created_by?: string | null;
          zoho_project_id?: string | null;
          sanity_project_id?: string | null;
          github_repo?: string | null;
          dedicated_developers?: string[];
          dataset?: string | null;
          vercel_project_id?: string | null;
          start_date?: string | null;
          end_date?: string | null;
          percent_complete?: number;
          existing_website?: string | null;
          development_site?: string | null;
          source_meta?: Json;
          tags?: string[] | null;
          owner_name?: string | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "projects_customer_id_fkey";
            columns: ["customer_id"];
            isOneToOne: false;
            referencedRelation: "customers";
            referencedColumns: ["customer_id"];
          },
          {
            foreignKeyName: "projects_customer_product_id_fkey";
            columns: ["customer_product_id"];
            isOneToOne: false;
            referencedRelation: "customer_products";
            referencedColumns: ["id"];
          }
        ];
      };
      tasklists: {
        Row: {
          id: string;
          project_id: string;
          external_id: string | null;
          name: string;
          position: number | null;
          is_default: boolean;
          milestone_id: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          project_id: string;
          external_id?: string | null;
          name: string;
          position?: number | null;
          is_default?: boolean;
          milestone_id?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          project_id?: string;
          external_id?: string | null;
          name?: string;
          position?: number | null;
          is_default?: boolean;
          milestone_id?: string | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "tasklists_project_id_fkey";
            columns: ["project_id"];
            isOneToOne: false;
            referencedRelation: "projects";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "tasklists_milestone_id_fkey";
            columns: ["milestone_id"];
            isOneToOne: false;
            referencedRelation: "milestones";
            referencedColumns: ["id"];
          }
        ];
      };
      issues: {
        Row: {
          id: string;
          project_id: string;
          task_id: string | null;
          external_id: string | null;
          prefix: string | null;
          title: string;
          description: string | null;
          status: string;
          severity: string | null;
          flag: string | null;
          assignee_name: string | null;
          assignee_email: string | null;
          due_date: string | null;
          created_at: string;
          updated_at: string;
          source_meta: Record<string, unknown>;
        };
        Insert: {
          id?: string;
          project_id: string;
          task_id?: string | null;
          external_id?: string | null;
          prefix?: string | null;
          title: string;
          description?: string | null;
          status?: string;
          severity?: string | null;
          flag?: string | null;
          assignee_name?: string | null;
          assignee_email?: string | null;
          due_date?: string | null;
          created_at?: string;
          updated_at?: string;
          source_meta?: Record<string, unknown>;
        };
        Update: {
          id?: string;
          project_id?: string;
          task_id?: string | null;
          external_id?: string | null;
          prefix?: string | null;
          title?: string;
          description?: string | null;
          status?: string;
          severity?: string | null;
          flag?: string | null;
          assignee_name?: string | null;
          assignee_email?: string | null;
          due_date?: string | null;
          updated_at?: string;
          source_meta?: Record<string, unknown>;
        };
        Relationships: [
          {
            foreignKeyName: "issues_project_id_fkey";
            columns: ["project_id"];
            isOneToOne: false;
            referencedRelation: "projects";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "issues_task_id_fkey";
            columns: ["task_id"];
            isOneToOne: false;
            referencedRelation: "tasks";
            referencedColumns: ["id"];
          }
        ];
      };
      issue_comments: {
        Row: {
          id: string;
          issue_id: string;
          author_id: string | null;
          author_name: string | null;
          author_email: string | null;
          body: string;
          external_id: string | null;
          created_at: string;
          updated_at: string;
          source_meta: Record<string, unknown>;
        };
        Insert: {
          id?: string;
          issue_id: string;
          author_id?: string | null;
          author_name?: string | null;
          author_email?: string | null;
          body: string;
          external_id?: string | null;
          created_at?: string;
          updated_at?: string;
          source_meta?: Record<string, unknown>;
        };
        Update: {
          id?: string;
          issue_id?: string;
          author_id?: string | null;
          author_name?: string | null;
          author_email?: string | null;
          body?: string;
          external_id?: string | null;
          updated_at?: string;
          source_meta?: Record<string, unknown>;
        };
        Relationships: [
          {
            foreignKeyName: "issue_comments_issue_id_fkey";
            columns: ["issue_id"];
            isOneToOne: false;
            referencedRelation: "issues";
            referencedColumns: ["id"];
          }
        ];
      };
      tasks: {
        Row: {
          id: string;
          project_id: string;
          ticket_id: string | null;
          parent_task_id: string | null;
          milestone_id: string | null;
          tasklist_id: string | null;
          external_id: string | null;
          title: string;
          description: string | null;
          task_type: string | null;
          priority: "low" | "normal" | "high" | "critical";
          status: string;
          assignees: string[] | null;
          due_date: string | null;
          start_date: string | null;
          estimate_hours: number | null;
          labels: string[] | null;
          position: number | null;
          classification_id: string | null;
          github_pr_url: string | null;
          preview_url: string | null;
          created_by: string | null;
          created_at: string;
          updated_at: string;
          completion_percentage: number;
          is_completed: boolean;
          depth: number;
          completed_on: string | null;
          source_meta: Record<string, unknown>;
        };
        Insert: {
          id?: string;
          project_id: string;
          ticket_id?: string | null;
          parent_task_id?: string | null;
          milestone_id?: string | null;
          tasklist_id?: string | null;
          external_id?: string | null;
          title: string;
          description?: string | null;
          task_type?: string | null;
          priority?: "low" | "normal" | "high" | "critical";
          status?: string;
          assignees?: string[] | null;
          due_date?: string | null;
          start_date?: string | null;
          estimate_hours?: number | null;
          labels?: string[] | null;
          position?: number | null;
          classification_id?: string | null;
          github_pr_url?: string | null;
          preview_url?: string | null;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
          completion_percentage?: number;
          is_completed?: boolean;
          depth?: number;
          completed_on?: string | null;
          source_meta?: Record<string, unknown>;
        };
        Update: {
          id?: string;
          project_id?: string;
          ticket_id?: string | null;
          parent_task_id?: string | null;
          milestone_id?: string | null;
          tasklist_id?: string | null;
          external_id?: string | null;
          title?: string;
          description?: string | null;
          task_type?: string | null;
          priority?: "low" | "normal" | "high" | "critical";
          status?: string;
          assignees?: string[] | null;
          due_date?: string | null;
          start_date?: string | null;
          estimate_hours?: number | null;
          labels?: string[] | null;
          position?: number | null;
          classification_id?: string | null;
          github_pr_url?: string | null;
          preview_url?: string | null;
          created_by?: string | null;
          updated_at?: string;
          completion_percentage?: number;
          is_completed?: boolean;
          depth?: number;
          completed_on?: string | null;
          source_meta?: Record<string, unknown>;
        };
        Relationships: [
          {
            foreignKeyName: "tasks_project_id_fkey";
            columns: ["project_id"];
            isOneToOne: false;
            referencedRelation: "projects";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "tasks_ticket_id_fkey";
            columns: ["ticket_id"];
            isOneToOne: false;
            referencedRelation: "tickets";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "tasks_milestone_id_fkey";
            columns: ["milestone_id"];
            isOneToOne: false;
            referencedRelation: "milestones";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "tasks_tasklist_id_fkey";
            columns: ["tasklist_id"];
            isOneToOne: false;
            referencedRelation: "tasklists";
            referencedColumns: ["id"];
          }
        ];
      };
      milestones: {
        Row: {
          id: string;
          project_id: string;
          external_id: string | null;
          name: string;
          description: string | null;
          start_date: string | null;
          due_date: string | null;
          status: "planned" | "active" | "completed";
          position: number | null;
          created_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          project_id: string;
          external_id?: string | null;
          name: string;
          description?: string | null;
          start_date?: string | null;
          due_date?: string | null;
          status?: "planned" | "active" | "completed";
          position?: number | null;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          project_id?: string;
          external_id?: string | null;
          name?: string;
          description?: string | null;
          start_date?: string | null;
          due_date?: string | null;
          status?: "planned" | "active" | "completed";
          position?: number | null;
          created_by?: string | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "milestones_project_id_fkey";
            columns: ["project_id"];
            isOneToOne: false;
            referencedRelation: "projects";
            referencedColumns: ["id"];
          }
        ];
      };
      task_comments: {
        Row: {
          id: string;
          task_id: string;
          author_id: string | null;
          author_name: string | null;
          author_email: string | null;
          external_id: string | null;
          body: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          task_id: string;
          author_id?: string | null;
          author_name?: string | null;
          author_email?: string | null;
          external_id?: string | null;
          body: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          task_id?: string;
          author_id?: string | null;
          author_name?: string | null;
          author_email?: string | null;
          external_id?: string | null;
          body?: string;
        };
        Relationships: [
          {
            foreignKeyName: "task_comments_task_id_fkey";
            columns: ["task_id"];
            isOneToOne: false;
            referencedRelation: "tasks";
            referencedColumns: ["id"];
          }
        ];
      };
      attachments: {
        Row: {
          id: string;
          entity_type: string;
          entity_id: string;
          storage_path: string;
          filename: string;
          size: number | null;
          uploaded_by: string | null;
          external_id: string | null;
          source_url: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          entity_type: string;
          entity_id: string;
          storage_path: string;
          filename: string;
          size?: number | null;
          uploaded_by?: string | null;
          external_id?: string | null;
          source_url?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          entity_type?: string;
          entity_id?: string;
          storage_path?: string;
          filename?: string;
          size?: number | null;
          uploaded_by?: string | null;
          external_id?: string | null;
          source_url?: string | null;
        };
        Relationships: [];
      };
      time_logs: {
        Row: {
          id: string;
          task_id: string | null;
          issue_id: string | null;
          project_id: string;
          employee_id: string | null;
          date_logged: string;
          hours: number;
          billable: boolean;
          note: string | null;
          source: "timer" | "manual";
          timesheet_id: string | null;
          external_id: string | null;
          owner_name: string | null;
          owner_email: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          task_id?: string | null;
          issue_id?: string | null;
          project_id: string;
          employee_id?: string | null;
          date_logged: string;
          hours: number;
          billable?: boolean;
          note?: string | null;
          source?: "timer" | "manual";
          timesheet_id?: string | null;
          external_id?: string | null;
          owner_name?: string | null;
          owner_email?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          task_id?: string | null;
          issue_id?: string | null;
          project_id?: string;
          employee_id?: string | null;
          date_logged?: string;
          hours?: number;
          billable?: boolean;
          note?: string | null;
          source?: "timer" | "manual";
          timesheet_id?: string | null;
          external_id?: string | null;
          owner_name?: string | null;
          owner_email?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "time_logs_task_id_fkey";
            columns: ["task_id"];
            isOneToOne: false;
            referencedRelation: "tasks";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "time_logs_issue_id_fkey";
            columns: ["issue_id"];
            isOneToOne: false;
            referencedRelation: "issues";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "time_logs_project_id_fkey";
            columns: ["project_id"];
            isOneToOne: false;
            referencedRelation: "projects";
            referencedColumns: ["id"];
          }
        ];
      };
      tickets: {
        Row: {
          id: string;
          ticket_number: number;
          customer_id: string;
          customer_product_id: string | null;
          subject: string;
          channel: "portal" | "email" | "manual";
          priority: "low" | "normal" | "high" | "critical";
          status: "new" | "open" | "waiting_on_client" | "waiting_on_us" | "resolved" | "closed";
          requester_email: string | null;
          requester_profile_id: string | null;
          sla_due_at: string | null;
          first_response_at: string | null;
          resolved_at: string | null;
          classification_id: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          customer_id: string;
          customer_product_id?: string | null;
          subject: string;
          channel: "portal" | "email" | "manual";
          priority?: "low" | "normal" | "high" | "critical";
          status?: "new" | "open" | "waiting_on_client" | "waiting_on_us" | "resolved" | "closed";
          requester_email?: string | null;
          requester_profile_id?: string | null;
          sla_due_at?: string | null;
          first_response_at?: string | null;
          resolved_at?: string | null;
          classification_id?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          customer_id?: string;
          customer_product_id?: string | null;
          subject?: string;
          channel?: "portal" | "email" | "manual";
          priority?: "low" | "normal" | "high" | "critical";
          status?: "new" | "open" | "waiting_on_client" | "waiting_on_us" | "resolved" | "closed";
          requester_email?: string | null;
          requester_profile_id?: string | null;
          sla_due_at?: string | null;
          first_response_at?: string | null;
          resolved_at?: string | null;
          classification_id?: string | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "tickets_customer_id_fkey";
            columns: ["customer_id"];
            isOneToOne: false;
            referencedRelation: "customers";
            referencedColumns: ["customer_id"];
          }
        ];
      };
      ticket_messages: {
        Row: {
          id: string;
          ticket_id: string;
          author_type: "client" | "staff" | "system" | "llm_draft";
          author_id: string | null;
          body: string;
          email_message_id: string | null;
          visibility: "public" | "internal";
          created_at: string;
        };
        Insert: {
          id?: string;
          ticket_id: string;
          author_type: "client" | "staff" | "system" | "llm_draft";
          author_id?: string | null;
          body: string;
          email_message_id?: string | null;
          visibility?: "public" | "internal";
          created_at?: string;
        };
        Update: {
          id?: string;
          ticket_id?: string;
          author_type?: "client" | "staff" | "system" | "llm_draft";
          author_id?: string | null;
          body?: string;
          email_message_id?: string | null;
          visibility?: "public" | "internal";
        };
        Relationships: [
          {
            foreignKeyName: "ticket_messages_ticket_id_fkey";
            columns: ["ticket_id"];
            isOneToOne: false;
            referencedRelation: "tickets";
            referencedColumns: ["id"];
          }
        ];
      };
      event_bus: {
        Row: {
          id: number;
          event_type: string;
          entity_type: string;
          entity_id: string;
          payload: Json | null;
          status: "pending" | "processing" | "done" | "failed";
          attempts: number;
          available_at: string;
          created_at: string;
        };
        Insert: {
          event_type: string;
          entity_type: string;
          entity_id: string;
          payload?: Json | null;
          status?: "pending" | "processing" | "done" | "failed";
          attempts?: number;
          available_at?: string;
          created_at?: string;
        };
        Update: {
          event_type?: string;
          entity_type?: string;
          entity_id?: string;
          payload?: Json | null;
          status?: "pending" | "processing" | "done" | "failed";
          attempts?: number;
          available_at?: string;
        };
        Relationships: [];
      };
      notifications: {
        Row: {
          id: string;
          recipient_id: string;
          event_type: string;
          title: string;
          body: string;
          link: string | null;
          read_at: string | null;
          channels_sent: string[] | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          recipient_id: string;
          event_type: string;
          title: string;
          body: string;
          link?: string | null;
          read_at?: string | null;
          channels_sent?: string[] | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          recipient_id?: string;
          event_type?: string;
          title?: string;
          body?: string;
          link?: string | null;
          read_at?: string | null;
          channels_sent?: string[] | null;
        };
        Relationships: [
          {
            foreignKeyName: "notifications_recipient_id_fkey";
            columns: ["recipient_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          }
        ];
      };
      notification_preferences: {
        Row: {
          profile_id: string;
          event_type: string;
          in_app: boolean;
          push: boolean;
          email: boolean;
        };
        Insert: {
          profile_id: string;
          event_type: string;
          in_app?: boolean;
          push?: boolean;
          email?: boolean;
        };
        Update: {
          profile_id?: string;
          event_type?: string;
          in_app?: boolean;
          push?: boolean;
          email?: boolean;
        };
        Relationships: [
          {
            foreignKeyName: "notification_preferences_profile_id_fkey";
            columns: ["profile_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          }
        ];
      };
      push_subscriptions: {
        Row: {
          id: string;
          profile_id: string;
          endpoint: string;
          keys: Json;
          created_at: string;
        };
        Insert: {
          id?: string;
          profile_id: string;
          endpoint: string;
          keys: Json;
          created_at?: string;
        };
        Update: {
          id?: string;
          profile_id?: string;
          endpoint?: string;
          keys?: Json;
        };
        Relationships: [
          {
            foreignKeyName: "push_subscriptions_profile_id_fkey";
            columns: ["profile_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          }
        ];
      };
      audit_logs: {
        Row: {
          id: string;
          actor_id: string | null;
          action: string;
          entity_type: string;
          entity_id: string;
          before: Json | null;
          after: Json | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          actor_id?: string | null;
          action: string;
          entity_type: string;
          entity_id: string;
          before?: Json | null;
          after?: Json | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          actor_id?: string | null;
          action?: string;
          entity_type?: string;
          entity_id?: string;
          before?: Json | null;
          after?: Json | null;
        };
        Relationships: [];
      };
      customer_assets: {
        Row: {
          id: string;
          customer_id: string;
          type: "file" | "link" | "credential";
          label: string;
          value: string;
          masked: boolean;
          created_at: string;
        };
        Insert: {
          id?: string;
          customer_id: string;
          type: "file" | "link" | "credential";
          label: string;
          value: string;
          masked?: boolean;
          created_at?: string;
        };
        Update: {
          id?: string;
          customer_id?: string;
          type?: "file" | "link" | "credential";
          label?: string;
          value?: string;
          masked?: boolean;
        };
        Relationships: [
          {
            foreignKeyName: "customer_assets_customer_id_fkey";
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
          sub_tasks: Json | null;
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
          sub_tasks?: Json | null;
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
          sub_tasks?: Json | null;
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
          raw_response: Json | null;
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
          raw_response?: Json | null;
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
          raw_response?: Json | null;
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
          zoho_task_id: string | null;
          direct_zoho_edit: boolean;
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
          zoho_task_id?: string | null;
          direct_zoho_edit?: boolean;
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
          zoho_task_id?: string | null;
          direct_zoho_edit?: boolean;
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
          health_check_status: string | null;
          health_check_url: string | null;
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
          health_check_status?: string | null;
          health_check_url?: string | null;
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
          health_check_status?: string | null;
          health_check_url?: string | null;
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
      reply_drafts: {
        Row: {
          id: string;
          classification_id: string;
          customer_id: string;
          execution_record_id: string | null;
          draft_content: string;
          pm_edited_content: string | null;
          pm_diff: string | null;
          status: string;
          sent_at: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          classification_id: string;
          customer_id: string;
          execution_record_id?: string | null;
          draft_content: string;
          pm_edited_content?: string | null;
          pm_diff?: string | null;
          status?: string;
          sent_at?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          classification_id?: string;
          customer_id?: string;
          execution_record_id?: string | null;
          draft_content?: string;
          pm_edited_content?: string | null;
          pm_diff?: string | null;
          status?: string;
          sent_at?: string | null;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "reply_drafts_classification_id_fkey";
            columns: ["classification_id"];
            isOneToOne: false;
            referencedRelation: "classification_records";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "reply_drafts_customer_id_fkey";
            columns: ["customer_id"];
            isOneToOne: false;
            referencedRelation: "customers";
            referencedColumns: ["customer_id"];
          },
          {
            foreignKeyName: "reply_drafts_execution_record_id_fkey";
            columns: ["execution_record_id"];
            isOneToOne: false;
            referencedRelation: "execution_records";
            referencedColumns: ["id"];
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
      hub_users: {
        Row: {
          id: string;
          email: string;
          first_name: string | null;
          last_name: string | null;
          role: string | null;
          external_id: string | null;
          status: string;
          is_invited: boolean;
          last_active_at: string | null;
          joined_at: string | null;
          cost_rate_per_hour: number;
          source_meta: Json;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          email: string;
          first_name?: string | null;
          last_name?: string | null;
          role?: string | null;
          external_id?: string | null;
          status?: string;
          is_invited?: boolean;
          last_active_at?: string | null;
          joined_at?: string | null;
          cost_rate_per_hour?: number;
          source_meta?: Json;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          email?: string;
          first_name?: string | null;
          last_name?: string | null;
          role?: string | null;
          external_id?: string | null;
          status?: string;
          is_invited?: boolean;
          last_active_at?: string | null;
          joined_at?: string | null;
          cost_rate_per_hour?: number;
          source_meta?: Json;
          updated_at?: string;
        };
        Relationships: [];
      };
      kb_entries: {
        Row: {
          id: string;
          request_pattern: string | null;
          embedding: unknown;
          classification: string | null;
          lane: number | null;
          tools_used: string[] | null;
          execution_steps: Json | null;
          outcome: string | null;
          project_id: string | null;
          use_count: number | null;
          flagged: boolean | null;
          created_at: string | null;
          last_used_at: string | null;
        };
        Insert: {
          id?: string;
          request_pattern?: string | null;
          embedding?: unknown;
          classification?: string | null;
          lane?: number | null;
          tools_used?: string[] | null;
          execution_steps?: Json | null;
          outcome?: string | null;
          project_id?: string | null;
          use_count?: number | null;
          flagged?: boolean | null;
          created_at?: string | null;
          last_used_at?: string | null;
        };
        Update: {
          id?: string;
          request_pattern?: string | null;
          embedding?: unknown;
          classification?: string | null;
          lane?: number | null;
          tools_used?: string[] | null;
          execution_steps?: Json | null;
          outcome?: string | null;
          project_id?: string | null;
          use_count?: number | null;
          flagged?: boolean | null;
          last_used_at?: string | null;
        };
        Relationships: [];
      };
      task_logs: {
        Row: {
          id: string;
          task_id: string | null;
          project_id: string | null;
          description: string | null;
          lane: number | null;
          tools_called: string[] | null;
          result: string | null;
          kb_hit: boolean | null;
          triggered_by: string | null;
          triggered_by_id: string | null;
          created_at: string | null;
        };
        Insert: {
          id?: string;
          task_id?: string | null;
          project_id?: string | null;
          description?: string | null;
          lane?: number | null;
          tools_called?: string[] | null;
          result?: string | null;
          kb_hit?: boolean | null;
          triggered_by?: string | null;
          triggered_by_id?: string | null;
          created_at?: string | null;
        };
        Update: {
          id?: string;
          task_id?: string | null;
          project_id?: string | null;
          description?: string | null;
          lane?: number | null;
          tools_called?: string[] | null;
          result?: string | null;
          kb_hit?: boolean | null;
          triggered_by?: string | null;
          triggered_by_id?: string | null;
        };
        Relationships: [];
      };
      kb_corrections: {
        Row: {
          id: string;
          kb_entry_id: string | null;
          original_lane: number | null;
          corrected_lane: number | null;
          corrected_by: string | null;
          reason: string | null;
          corrected_at: string | null;
        };
        Insert: {
          id?: string;
          kb_entry_id?: string | null;
          original_lane?: number | null;
          corrected_lane?: number | null;
          corrected_by?: string | null;
          reason?: string | null;
          corrected_at?: string | null;
        };
        Update: {
          id?: string;
          kb_entry_id?: string | null;
          original_lane?: number | null;
          corrected_lane?: number | null;
          corrected_by?: string | null;
          reason?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "kb_corrections_kb_entry_id_fkey";
            columns: ["kb_entry_id"];
            isOneToOne: false;
            referencedRelation: "kb_entries";
            referencedColumns: ["id"];
          }
        ];
      };
    };
    Views: Record<string, never>;
    Functions: {
      force_logout_all_except: {
        Args: {
          exclude_user_id: string;
        };
        Returns: {
          action: string;
          count: number;
        }[];
      };
      match_kb_entries: {
        Args: {
          query_embedding: unknown;
          match_threshold: number;
          match_count: number;
        };
        Returns: {
          id: string;
          request_pattern: string;
          classification: string;
          lane: number;
          execution_steps: Json;
          similarity: number;
        }[];
      };
      match_kb_by_text: {
        Args: {
          query_text: string;
          match_threshold?: number;
          match_count?: number;
        };
        Returns: {
          id: string;
          request_pattern: string;
          classification: string;
          lane: number;
          execution_steps: Json;
          similarity: number;
        }[];
      };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
}

// Convenience row types — public schema
export type CustomerRow = Database["public"]["Tables"]["customers"]["Row"];
export type CustomerProductRow = Database["public"]["Tables"]["customer_products"]["Row"];
export type ProjectRow = Database["public"]["Tables"]["projects"]["Row"];
export type ProfileRow = Database["public"]["Tables"]["profiles"]["Row"];
export type ClassificationRecordRow = Database["public"]["Tables"]["classification_records"]["Row"];
export type RequirementsAssessmentRow = Database["public"]["Tables"]["requirements_assessments"]["Row"];
export type ImplementationPlanRow = Database["public"]["Tables"]["implementation_plans"]["Row"];
export type ExecutionRecordRow = Database["public"]["Tables"]["execution_records"]["Row"];
export type ReplyDraftRow = Database["public"]["Tables"]["reply_drafts"]["Row"];
export type PlaybookRow = Database["public"]["Tables"]["playbooks"]["Row"];
export type LLMInvocationLogRow = Database["public"]["Tables"]["llm_invocation_logs"]["Row"];
export type DigestLogRow = Database["public"]["Tables"]["digest_logs"]["Row"];
export type LLMConfigRow = Database["public"]["Tables"]["llm_config"]["Row"];
export type UserRoleRow = Database["public"]["Tables"]["user_roles"]["Row"];
export type CustomerAssetRow = Database["public"]["Tables"]["customer_assets"]["Row"];
export type TaskRow = Database["public"]["Tables"]["tasks"]["Row"];
export type TicketRow = Database["public"]["Tables"]["tickets"]["Row"];
export type EventBusRow = Database["public"]["Tables"]["event_bus"]["Row"];
export type NotificationRow = Database["public"]["Tables"]["notifications"]["Row"];
export type AuditLogRow = Database["public"]["Tables"]["audit_logs"]["Row"];
export type KbEntryRow = Database["public"]["Tables"]["kb_entries"]["Row"];
export type TaskLogRow = Database["public"]["Tables"]["task_logs"]["Row"];
export type KbCorrectionRow = Database["public"]["Tables"]["kb_corrections"]["Row"];

// Convenience row types — hr schema
// Note: hr.* queries require .schema("hr").from("employees") on the Supabase client
export type HrEmployeeRow = Database["hr"]["Tables"]["employees"]["Row"];
export type HrLeaveRequestRow = Database["hr"]["Tables"]["leave_requests"]["Row"];
export type HrLeaveBalanceRow = Database["hr"]["Tables"]["leave_balances"]["Row"];
export type HrAttendanceDayRow = Database["hr"]["Tables"]["attendance_days"]["Row"];
export type HrTimesheetRow = Database["hr"]["Tables"]["timesheets"]["Row"];
