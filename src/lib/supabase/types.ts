export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      admin_notes: {
        Row: {
          author_id: string
          body: string
          created_at: string
          id: string
          subject_user_id: string
        }
        Insert: {
          author_id: string
          body: string
          created_at?: string
          id?: string
          subject_user_id: string
        }
        Update: {
          author_id?: string
          body?: string
          created_at?: string
          id?: string
          subject_user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "admin_notes_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "admin_notes_subject_user_id_fkey"
            columns: ["subject_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      analytics_events: {
        Row: {
          created_at: string
          event: string
          family_id: string | null
          id: number
          properties: Json
          session_id: string | null
          user_id: string | null
        }
        Insert: {
          created_at?: string
          event: string
          family_id?: string | null
          id?: number
          properties?: Json
          session_id?: string | null
          user_id?: string | null
        }
        Update: {
          created_at?: string
          event?: string
          family_id?: string | null
          id?: number
          properties?: Json
          session_id?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "analytics_events_family_id_fkey"
            columns: ["family_id"]
            isOneToOne: false
            referencedRelation: "family_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "analytics_events_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_logs: {
        Row: {
          action: string
          actor_id: string | null
          after_state: Json | null
          before_state: Json | null
          created_at: string
          entity_id: string | null
          entity_kind: string | null
          id: number
          ip_address: unknown
          user_agent: string | null
        }
        Insert: {
          action: string
          actor_id?: string | null
          after_state?: Json | null
          before_state?: Json | null
          created_at?: string
          entity_id?: string | null
          entity_kind?: string | null
          id?: number
          ip_address?: unknown
          user_agent?: string | null
        }
        Update: {
          action?: string
          actor_id?: string | null
          after_state?: Json | null
          before_state?: Json | null
          created_at?: string
          entity_id?: string | null
          entity_kind?: string | null
          id?: number
          ip_address?: unknown
          user_agent?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "audit_logs_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      blocks: {
        Row: {
          blocked_id: string
          blocker_id: string
          created_at: string
          id: string
          reason: string | null
        }
        Insert: {
          blocked_id: string
          blocker_id: string
          created_at?: string
          id?: string
          reason?: string | null
        }
        Update: {
          blocked_id?: string
          blocker_id?: string
          created_at?: string
          id?: string
          reason?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "blocks_blocked_id_fkey"
            columns: ["blocked_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "blocks_blocker_id_fkey"
            columns: ["blocker_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      conversations: {
        Row: {
          blocked_at: string | null
          blocked_by: string | null
          created_at: string
          family_archived: boolean
          family_id: string
          family_unread_count: number
          id: string
          job_id: string | null
          last_message_at: string | null
          last_message_preview: string | null
          nanny_archived: boolean
          nanny_id: string
          nanny_unread_count: number
          updated_at: string
        }
        Insert: {
          blocked_at?: string | null
          blocked_by?: string | null
          created_at?: string
          family_archived?: boolean
          family_id: string
          family_unread_count?: number
          id?: string
          job_id?: string | null
          last_message_at?: string | null
          last_message_preview?: string | null
          nanny_archived?: boolean
          nanny_id: string
          nanny_unread_count?: number
          updated_at?: string
        }
        Update: {
          blocked_at?: string | null
          blocked_by?: string | null
          created_at?: string
          family_archived?: boolean
          family_id?: string
          family_unread_count?: number
          id?: string
          job_id?: string | null
          last_message_at?: string | null
          last_message_preview?: string | null
          nanny_archived?: boolean
          nanny_id?: string
          nanny_unread_count?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "conversations_blocked_by_fkey"
            columns: ["blocked_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversations_family_id_fkey"
            columns: ["family_id"]
            isOneToOne: false
            referencedRelation: "family_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversations_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversations_nanny_id_fkey"
            columns: ["nanny_id"]
            isOneToOne: false
            referencedRelation: "nanny_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      email_events: {
        Row: {
          clicked_at: string | null
          created_at: string
          email_type: string
          error: string | null
          id: string
          idempotency_key: string | null
          metadata: Json
          opened_at: string | null
          provider: string | null
          provider_message_id: string | null
          recipient: string
          sent_at: string | null
          status: string
          subject: string | null
          user_id: string | null
        }
        Insert: {
          clicked_at?: string | null
          created_at?: string
          email_type: string
          error?: string | null
          id?: string
          idempotency_key?: string | null
          metadata?: Json
          opened_at?: string | null
          provider?: string | null
          provider_message_id?: string | null
          recipient: string
          sent_at?: string | null
          status?: string
          subject?: string | null
          user_id?: string | null
        }
        Update: {
          clicked_at?: string | null
          created_at?: string
          email_type?: string
          error?: string | null
          id?: string
          idempotency_key?: string | null
          metadata?: Json
          opened_at?: string | null
          provider?: string | null
          provider_message_id?: string | null
          recipient?: string
          sent_at?: string | null
          status?: string
          subject?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "email_events_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      family_children: {
        Row: {
          age_months: number | null
          age_years: number | null
          created_at: string
          family_id: string
          id: string
          name: string | null
          notes: string | null
        }
        Insert: {
          age_months?: number | null
          age_years?: number | null
          created_at?: string
          family_id: string
          id?: string
          name?: string | null
          notes?: string | null
        }
        Update: {
          age_months?: number | null
          age_years?: number | null
          created_at?: string
          family_id?: string
          id?: string
          name?: string | null
          notes?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "family_children_family_id_fkey"
            columns: ["family_id"]
            isOneToOne: false
            referencedRelation: "family_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      family_nanny_contacts: {
        Row: {
          consumed_free_credit: boolean
          conversation_id: string | null
          created_at: string
          family_id: string
          first_contacted_at: string
          id: string
          nanny_id: string
          source: Database["public"]["Enums"]["contact_source"]
        }
        Insert: {
          consumed_free_credit?: boolean
          conversation_id?: string | null
          created_at?: string
          family_id: string
          first_contacted_at?: string
          id?: string
          nanny_id: string
          source?: Database["public"]["Enums"]["contact_source"]
        }
        Update: {
          consumed_free_credit?: boolean
          conversation_id?: string | null
          created_at?: string
          family_id?: string
          first_contacted_at?: string
          id?: string
          nanny_id?: string
          source?: Database["public"]["Enums"]["contact_source"]
        }
        Relationships: [
          {
            foreignKeyName: "family_nanny_contacts_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "family_nanny_contacts_family_id_fkey"
            columns: ["family_id"]
            isOneToOne: false
            referencedRelation: "family_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "family_nanny_contacts_nanny_id_fkey"
            columns: ["nanny_id"]
            isOneToOne: false
            referencedRelation: "nanny_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      family_profiles: {
        Row: {
          ai_brief: string | null
          ai_structured: Json
          area: string | null
          children_count: number
          created_at: string
          description: string | null
          display_name: string | null
          emirate: string | null
          id: string
          latitude: number | null
          longitude: number | null
          onboarding_completed_at: string | null
          onboarding_step: number
          photo_url: string | null
          profile_completion: number
          updated_at: string
          user_id: string
        }
        Insert: {
          ai_brief?: string | null
          ai_structured?: Json
          area?: string | null
          children_count?: number
          created_at?: string
          description?: string | null
          display_name?: string | null
          emirate?: string | null
          id?: string
          latitude?: number | null
          longitude?: number | null
          onboarding_completed_at?: string | null
          onboarding_step?: number
          photo_url?: string | null
          profile_completion?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          ai_brief?: string | null
          ai_structured?: Json
          area?: string | null
          children_count?: number
          created_at?: string
          description?: string | null
          display_name?: string | null
          emirate?: string | null
          id?: string
          latitude?: number | null
          longitude?: number | null
          onboarding_completed_at?: string | null
          onboarding_step?: number
          photo_url?: string | null
          profile_completion?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "family_profiles_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      family_requirements: {
        Row: {
          additional_requirements: string | null
          arrangement: Database["public"]["Enums"]["care_arrangement"] | null
          created_at: string
          employment_types: Database["public"]["Enums"]["employment_type"][]
          family_id: string
          has_pets: boolean
          id: string
          is_primary: boolean
          label: string
          languages: string[]
          needs_cooking: boolean
          needs_driving: boolean
          needs_first_aid: boolean
          needs_housekeeping: boolean
          needs_newborn_care: boolean
          needs_school_age_care: boolean
          needs_special_needs_care: boolean
          needs_toddler_care: boolean
          required_experience_years: number | null
          salary_max_aed: number | null
          salary_min_aed: number | null
          schedule_notes: string | null
          start_date: string | null
          updated_at: string
          working_days: string[]
          working_hours_end: string | null
          working_hours_start: string | null
        }
        Insert: {
          additional_requirements?: string | null
          arrangement?: Database["public"]["Enums"]["care_arrangement"] | null
          created_at?: string
          employment_types?: Database["public"]["Enums"]["employment_type"][]
          family_id: string
          has_pets?: boolean
          id?: string
          is_primary?: boolean
          label?: string
          languages?: string[]
          needs_cooking?: boolean
          needs_driving?: boolean
          needs_first_aid?: boolean
          needs_housekeeping?: boolean
          needs_newborn_care?: boolean
          needs_school_age_care?: boolean
          needs_special_needs_care?: boolean
          needs_toddler_care?: boolean
          required_experience_years?: number | null
          salary_max_aed?: number | null
          salary_min_aed?: number | null
          schedule_notes?: string | null
          start_date?: string | null
          updated_at?: string
          working_days?: string[]
          working_hours_end?: string | null
          working_hours_start?: string | null
        }
        Update: {
          additional_requirements?: string | null
          arrangement?: Database["public"]["Enums"]["care_arrangement"] | null
          created_at?: string
          employment_types?: Database["public"]["Enums"]["employment_type"][]
          family_id?: string
          has_pets?: boolean
          id?: string
          is_primary?: boolean
          label?: string
          languages?: string[]
          needs_cooking?: boolean
          needs_driving?: boolean
          needs_first_aid?: boolean
          needs_housekeeping?: boolean
          needs_newborn_care?: boolean
          needs_school_age_care?: boolean
          needs_special_needs_care?: boolean
          needs_toddler_care?: boolean
          required_experience_years?: number | null
          salary_max_aed?: number | null
          salary_min_aed?: number | null
          schedule_notes?: string | null
          start_date?: string | null
          updated_at?: string
          working_days?: string[]
          working_hours_end?: string | null
          working_hours_start?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "family_requirements_family_id_fkey"
            columns: ["family_id"]
            isOneToOne: false
            referencedRelation: "family_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      interviews: {
        Row: {
          conversation_id: string | null
          created_at: string
          duration_minutes: number
          family_id: string
          id: string
          job_id: string | null
          location: string | null
          mode: string
          nanny_id: string
          note: string | null
          requested_by: string
          responded_at: string | null
          scheduled_at: string | null
          status: Database["public"]["Enums"]["interview_status"]
          timezone: string
          updated_at: string
        }
        Insert: {
          conversation_id?: string | null
          created_at?: string
          duration_minutes?: number
          family_id: string
          id?: string
          job_id?: string | null
          location?: string | null
          mode?: string
          nanny_id: string
          note?: string | null
          requested_by: string
          responded_at?: string | null
          scheduled_at?: string | null
          status?: Database["public"]["Enums"]["interview_status"]
          timezone?: string
          updated_at?: string
        }
        Update: {
          conversation_id?: string | null
          created_at?: string
          duration_minutes?: number
          family_id?: string
          id?: string
          job_id?: string | null
          location?: string | null
          mode?: string
          nanny_id?: string
          note?: string | null
          requested_by?: string
          responded_at?: string | null
          scheduled_at?: string | null
          status?: Database["public"]["Enums"]["interview_status"]
          timezone?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "interviews_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "interviews_family_id_fkey"
            columns: ["family_id"]
            isOneToOne: false
            referencedRelation: "family_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "interviews_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "interviews_nanny_id_fkey"
            columns: ["nanny_id"]
            isOneToOne: false
            referencedRelation: "nanny_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "interviews_requested_by_fkey"
            columns: ["requested_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      job_applications: {
        Row: {
          cover_note: string | null
          created_at: string
          id: string
          job_id: string
          nanny_id: string
          status: Database["public"]["Enums"]["application_status"]
          status_changed_at: string
          updated_at: string
          viewed_at: string | null
        }
        Insert: {
          cover_note?: string | null
          created_at?: string
          id?: string
          job_id: string
          nanny_id: string
          status?: Database["public"]["Enums"]["application_status"]
          status_changed_at?: string
          updated_at?: string
          viewed_at?: string | null
        }
        Update: {
          cover_note?: string | null
          created_at?: string
          id?: string
          job_id?: string
          nanny_id?: string
          status?: Database["public"]["Enums"]["application_status"]
          status_changed_at?: string
          updated_at?: string
          viewed_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "job_applications_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_applications_nanny_id_fkey"
            columns: ["nanny_id"]
            isOneToOne: false
            referencedRelation: "nanny_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      jobs: {
        Row: {
          additional_information: string | null
          area: string | null
          arrangement: Database["public"]["Enums"]["care_arrangement"]
          children_ages: number[]
          children_count: number
          cooking_required: boolean
          created_at: string
          driving_required: boolean
          emirate: string | null
          employment_type: Database["public"]["Enums"]["employment_type"]
          expires_at: string | null
          family_id: string
          has_pets: boolean
          housekeeping_required: boolean
          id: string
          published_at: string | null
          required_experience_years: number | null
          required_languages: string[]
          required_skills: string[]
          responsibilities: string | null
          salary_max_aed: number | null
          salary_min_aed: number | null
          schedule_notes: string | null
          start_date: string | null
          status: Database["public"]["Enums"]["job_status"]
          title: string
          updated_at: string
          working_days: string[]
          working_hours_end: string | null
          working_hours_start: string | null
        }
        Insert: {
          additional_information?: string | null
          area?: string | null
          arrangement?: Database["public"]["Enums"]["care_arrangement"]
          children_ages?: number[]
          children_count?: number
          cooking_required?: boolean
          created_at?: string
          driving_required?: boolean
          emirate?: string | null
          employment_type?: Database["public"]["Enums"]["employment_type"]
          expires_at?: string | null
          family_id: string
          has_pets?: boolean
          housekeeping_required?: boolean
          id?: string
          published_at?: string | null
          required_experience_years?: number | null
          required_languages?: string[]
          required_skills?: string[]
          responsibilities?: string | null
          salary_max_aed?: number | null
          salary_min_aed?: number | null
          schedule_notes?: string | null
          start_date?: string | null
          status?: Database["public"]["Enums"]["job_status"]
          title: string
          updated_at?: string
          working_days?: string[]
          working_hours_end?: string | null
          working_hours_start?: string | null
        }
        Update: {
          additional_information?: string | null
          area?: string | null
          arrangement?: Database["public"]["Enums"]["care_arrangement"]
          children_ages?: number[]
          children_count?: number
          cooking_required?: boolean
          created_at?: string
          driving_required?: boolean
          emirate?: string | null
          employment_type?: Database["public"]["Enums"]["employment_type"]
          expires_at?: string | null
          family_id?: string
          has_pets?: boolean
          housekeeping_required?: boolean
          id?: string
          published_at?: string | null
          required_experience_years?: number | null
          required_languages?: string[]
          required_skills?: string[]
          responsibilities?: string | null
          salary_max_aed?: number | null
          salary_min_aed?: number | null
          schedule_notes?: string | null
          start_date?: string | null
          status?: Database["public"]["Enums"]["job_status"]
          title?: string
          updated_at?: string
          working_days?: string[]
          working_hours_end?: string | null
          working_hours_start?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "jobs_family_id_fkey"
            columns: ["family_id"]
            isOneToOne: false
            referencedRelation: "family_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      matches: {
        Row: {
          breakdown: Json
          computed_at: string
          conflicts: string[]
          dismissed_at: string | null
          family_id: string
          id: string
          job_id: string | null
          nanny_id: string
          reasons: string[]
          score: number
        }
        Insert: {
          breakdown?: Json
          computed_at?: string
          conflicts?: string[]
          dismissed_at?: string | null
          family_id: string
          id?: string
          job_id?: string | null
          nanny_id: string
          reasons?: string[]
          score: number
        }
        Update: {
          breakdown?: Json
          computed_at?: string
          conflicts?: string[]
          dismissed_at?: string | null
          family_id?: string
          id?: string
          job_id?: string | null
          nanny_id?: string
          reasons?: string[]
          score?: number
        }
        Relationships: [
          {
            foreignKeyName: "matches_family_id_fkey"
            columns: ["family_id"]
            isOneToOne: false
            referencedRelation: "family_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "matches_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "matches_nanny_id_fkey"
            columns: ["nanny_id"]
            isOneToOne: false
            referencedRelation: "nanny_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      matching_weights: {
        Row: {
          dimension: string
          label: string
          updated_at: string
          updated_by: string | null
          weight: number
        }
        Insert: {
          dimension: string
          label: string
          updated_at?: string
          updated_by?: string | null
          weight: number
        }
        Update: {
          dimension?: string
          label?: string
          updated_at?: string
          updated_by?: string | null
          weight?: number
        }
        Relationships: [
          {
            foreignKeyName: "matching_weights_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      messages: {
        Row: {
          attachment_mime: string | null
          attachment_name: string | null
          attachment_path: string | null
          body: string
          conversation_id: string
          created_at: string
          edited_at: string | null
          id: string
          read_at: string | null
          sender_id: string
        }
        Insert: {
          attachment_mime?: string | null
          attachment_name?: string | null
          attachment_path?: string | null
          body: string
          conversation_id: string
          created_at?: string
          edited_at?: string | null
          id?: string
          read_at?: string | null
          sender_id: string
        }
        Update: {
          attachment_mime?: string | null
          attachment_name?: string | null
          attachment_path?: string | null
          body?: string
          conversation_id?: string
          created_at?: string
          edited_at?: string | null
          id?: string
          read_at?: string | null
          sender_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_sender_id_fkey"
            columns: ["sender_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      nanny_badges: {
        Row: {
          badge: string
          granted_at: string
          granted_by: string | null
          id: string
          nanny_id: string
          note: string | null
        }
        Insert: {
          badge: string
          granted_at?: string
          granted_by?: string | null
          id?: string
          nanny_id: string
          note?: string | null
        }
        Update: {
          badge?: string
          granted_at?: string
          granted_by?: string | null
          id?: string
          nanny_id?: string
          note?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "nanny_badges_granted_by_fkey"
            columns: ["granted_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "nanny_badges_nanny_id_fkey"
            columns: ["nanny_id"]
            isOneToOne: false
            referencedRelation: "nanny_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      nanny_documents: {
        Row: {
          created_at: string
          id: string
          kind: string
          mime_type: string | null
          nanny_id: string
          original_filename: string | null
          reviewed: boolean
          reviewed_at: string | null
          reviewed_by: string | null
          size_bytes: number | null
          storage_path: string
        }
        Insert: {
          created_at?: string
          id?: string
          kind: string
          mime_type?: string | null
          nanny_id: string
          original_filename?: string | null
          reviewed?: boolean
          reviewed_at?: string | null
          reviewed_by?: string | null
          size_bytes?: number | null
          storage_path: string
        }
        Update: {
          created_at?: string
          id?: string
          kind?: string
          mime_type?: string | null
          nanny_id?: string
          original_filename?: string | null
          reviewed?: boolean
          reviewed_at?: string | null
          reviewed_by?: string | null
          size_bytes?: number | null
          storage_path?: string
        }
        Relationships: [
          {
            foreignKeyName: "nanny_documents_nanny_id_fkey"
            columns: ["nanny_id"]
            isOneToOne: false
            referencedRelation: "nanny_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "nanny_documents_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      nanny_profiles: {
        Row: {
          arabic_level: Database["public"]["Enums"]["language_level"]
          area: string | null
          arrangement: Database["public"]["Enums"]["care_arrangement"]
          available_days: string[]
          available_from: string | null
          available_hours_end: string | null
          available_hours_start: string | null
          can_cook: boolean
          can_housekeep: boolean
          certificates: string[]
          created_at: string
          date_of_birth: string | null
          description: string | null
          education: string | null
          emirate: string | null
          employment_types: Database["public"]["Enums"]["employment_type"][]
          english_level: Database["public"]["Enums"]["language_level"]
          first_aid_certified: boolean
          first_name: string | null
          gender: string | null
          has_driving_licence: boolean
          headline: string | null
          id: string
          languages: string[]
          latitude: number | null
          longitude: number | null
          nationality: string | null
          newborn_experience: boolean
          onboarding_completed_at: string | null
          onboarding_step: number
          pet_experience: boolean
          photo_url: string | null
          preferred_locations: string[]
          previous_experience: Json
          profile_completion: number
          rejection_reason: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          salary_expectation_max_aed: number | null
          salary_expectation_min_aed: number | null
          school_age_experience: boolean
          search_vector: unknown
          special_needs_experience: boolean
          status: Database["public"]["Enums"]["nanny_profile_status"]
          submitted_at: string | null
          toddler_experience: boolean
          uae_experience_years: number
          updated_at: string
          user_id: string
          video_url: string | null
          years_experience: number
        }
        Insert: {
          arabic_level?: Database["public"]["Enums"]["language_level"]
          area?: string | null
          arrangement?: Database["public"]["Enums"]["care_arrangement"]
          available_days?: string[]
          available_from?: string | null
          available_hours_end?: string | null
          available_hours_start?: string | null
          can_cook?: boolean
          can_housekeep?: boolean
          certificates?: string[]
          created_at?: string
          date_of_birth?: string | null
          description?: string | null
          education?: string | null
          emirate?: string | null
          employment_types?: Database["public"]["Enums"]["employment_type"][]
          english_level?: Database["public"]["Enums"]["language_level"]
          first_aid_certified?: boolean
          first_name?: string | null
          gender?: string | null
          has_driving_licence?: boolean
          headline?: string | null
          id?: string
          languages?: string[]
          latitude?: number | null
          longitude?: number | null
          nationality?: string | null
          newborn_experience?: boolean
          onboarding_completed_at?: string | null
          onboarding_step?: number
          pet_experience?: boolean
          photo_url?: string | null
          preferred_locations?: string[]
          previous_experience?: Json
          profile_completion?: number
          rejection_reason?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          salary_expectation_max_aed?: number | null
          salary_expectation_min_aed?: number | null
          school_age_experience?: boolean
          search_vector?: unknown
          special_needs_experience?: boolean
          status?: Database["public"]["Enums"]["nanny_profile_status"]
          submitted_at?: string | null
          toddler_experience?: boolean
          uae_experience_years?: number
          updated_at?: string
          user_id: string
          video_url?: string | null
          years_experience?: number
        }
        Update: {
          arabic_level?: Database["public"]["Enums"]["language_level"]
          area?: string | null
          arrangement?: Database["public"]["Enums"]["care_arrangement"]
          available_days?: string[]
          available_from?: string | null
          available_hours_end?: string | null
          available_hours_start?: string | null
          can_cook?: boolean
          can_housekeep?: boolean
          certificates?: string[]
          created_at?: string
          date_of_birth?: string | null
          description?: string | null
          education?: string | null
          emirate?: string | null
          employment_types?: Database["public"]["Enums"]["employment_type"][]
          english_level?: Database["public"]["Enums"]["language_level"]
          first_aid_certified?: boolean
          first_name?: string | null
          gender?: string | null
          has_driving_licence?: boolean
          headline?: string | null
          id?: string
          languages?: string[]
          latitude?: number | null
          longitude?: number | null
          nationality?: string | null
          newborn_experience?: boolean
          onboarding_completed_at?: string | null
          onboarding_step?: number
          pet_experience?: boolean
          photo_url?: string | null
          preferred_locations?: string[]
          previous_experience?: Json
          profile_completion?: number
          rejection_reason?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          salary_expectation_max_aed?: number | null
          salary_expectation_min_aed?: number | null
          school_age_experience?: boolean
          search_vector?: unknown
          special_needs_experience?: boolean
          status?: Database["public"]["Enums"]["nanny_profile_status"]
          submitted_at?: string | null
          toddler_experience?: boolean
          uae_experience_years?: number
          updated_at?: string
          user_id?: string
          video_url?: string | null
          years_experience?: number
        }
        Relationships: [
          {
            foreignKeyName: "nanny_profiles_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "nanny_profiles_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      nanny_references: {
        Row: {
          contact_email: string | null
          contact_phone: string | null
          created_at: string
          id: string
          nanny_id: string
          note: string | null
          period: string | null
          referee_name: string
          relationship: string | null
          verified: boolean
        }
        Insert: {
          contact_email?: string | null
          contact_phone?: string | null
          created_at?: string
          id?: string
          nanny_id: string
          note?: string | null
          period?: string | null
          referee_name: string
          relationship?: string | null
          verified?: boolean
        }
        Update: {
          contact_email?: string | null
          contact_phone?: string | null
          created_at?: string
          id?: string
          nanny_id?: string
          note?: string | null
          period?: string | null
          referee_name?: string
          relationship?: string | null
          verified?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "nanny_references_nanny_id_fkey"
            columns: ["nanny_id"]
            isOneToOne: false
            referencedRelation: "nanny_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          body: string | null
          created_at: string
          href: string | null
          id: string
          kind: string
          metadata: Json
          read_at: string | null
          title: string
          user_id: string
        }
        Insert: {
          body?: string | null
          created_at?: string
          href?: string | null
          id?: string
          kind: string
          metadata?: Json
          read_at?: string | null
          title: string
          user_id: string
        }
        Update: {
          body?: string | null
          created_at?: string
          href?: string | null
          id?: string
          kind?: string
          metadata?: Json
          read_at?: string | null
          title?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      payments: {
        Row: {
          amount_aed: number
          created_at: string
          currency: string
          failure_reason: string | null
          family_id: string
          id: string
          paid_at: string | null
          provider: string | null
          provider_intent_id: string | null
          provider_payment_id: string | null
          refunded_at: string | null
          status: Database["public"]["Enums"]["payment_status"]
          subscription_id: string | null
          updated_at: string
        }
        Insert: {
          amount_aed: number
          created_at?: string
          currency?: string
          failure_reason?: string | null
          family_id: string
          id?: string
          paid_at?: string | null
          provider?: string | null
          provider_intent_id?: string | null
          provider_payment_id?: string | null
          refunded_at?: string | null
          status?: Database["public"]["Enums"]["payment_status"]
          subscription_id?: string | null
          updated_at?: string
        }
        Update: {
          amount_aed?: number
          created_at?: string
          currency?: string
          failure_reason?: string | null
          family_id?: string
          id?: string
          paid_at?: string | null
          provider?: string | null
          provider_intent_id?: string | null
          provider_payment_id?: string | null
          refunded_at?: string | null
          status?: Database["public"]["Enums"]["payment_status"]
          subscription_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "payments_family_id_fkey"
            columns: ["family_id"]
            isOneToOne: false
            referencedRelation: "family_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_subscription_id_fkey"
            columns: ["subscription_id"]
            isOneToOne: false
            referencedRelation: "subscriptions"
            referencedColumns: ["id"]
          },
        ]
      }
      pricing_config: {
        Row: {
          currency: string
          free_contacts: number
          id: boolean
          monthly_enabled: boolean
          monthly_is_best_value: boolean
          monthly_price_aed: number
          updated_at: string
          updated_by: string | null
          weekly_enabled: boolean
          weekly_price_aed: number
        }
        Insert: {
          currency?: string
          free_contacts?: number
          id?: boolean
          monthly_enabled?: boolean
          monthly_is_best_value?: boolean
          monthly_price_aed?: number
          updated_at?: string
          updated_by?: string | null
          weekly_enabled?: boolean
          weekly_price_aed?: number
        }
        Update: {
          currency?: string
          free_contacts?: number
          id?: boolean
          monthly_enabled?: boolean
          monthly_is_best_value?: boolean
          monthly_price_aed?: number
          updated_at?: string
          updated_by?: string | null
          weekly_enabled?: boolean
          weekly_price_aed?: number
        }
        Relationships: [
          {
            foreignKeyName: "pricing_config_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      reports: {
        Row: {
          created_at: string
          details: string | null
          handled_at: string | null
          handled_by: string | null
          id: string
          reason: string
          reported_user_id: string | null
          reporter_id: string
          resolution: string | null
          status: Database["public"]["Enums"]["report_status"]
          target_id: string
          target_kind: string
        }
        Insert: {
          created_at?: string
          details?: string | null
          handled_at?: string | null
          handled_by?: string | null
          id?: string
          reason: string
          reported_user_id?: string | null
          reporter_id: string
          resolution?: string | null
          status?: Database["public"]["Enums"]["report_status"]
          target_id: string
          target_kind: string
        }
        Update: {
          created_at?: string
          details?: string | null
          handled_at?: string | null
          handled_by?: string | null
          id?: string
          reason?: string
          reported_user_id?: string | null
          reporter_id?: string
          resolution?: string | null
          status?: Database["public"]["Enums"]["report_status"]
          target_id?: string
          target_kind?: string
        }
        Relationships: [
          {
            foreignKeyName: "reports_handled_by_fkey"
            columns: ["handled_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reports_reported_user_id_fkey"
            columns: ["reported_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reports_reporter_id_fkey"
            columns: ["reporter_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      reviews: {
        Row: {
          author_id: string
          body: string
          created_at: string
          id: string
          is_published: boolean
          moderated_at: string | null
          moderated_by: string | null
          rating: number
          subject_user_id: string
          updated_at: string
        }
        Insert: {
          author_id: string
          body: string
          created_at?: string
          id?: string
          is_published?: boolean
          moderated_at?: string | null
          moderated_by?: string | null
          rating: number
          subject_user_id: string
          updated_at?: string
        }
        Update: {
          author_id?: string
          body?: string
          created_at?: string
          id?: string
          is_published?: boolean
          moderated_at?: string | null
          moderated_by?: string | null
          rating?: number
          subject_user_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "reviews_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reviews_moderated_by_fkey"
            columns: ["moderated_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reviews_subject_user_id_fkey"
            columns: ["subject_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      saved_profiles: {
        Row: {
          created_at: string
          family_id: string
          id: string
          nanny_id: string
          note: string | null
          stage: Database["public"]["Enums"]["shortlist_stage"]
          updated_at: string
        }
        Insert: {
          created_at?: string
          family_id: string
          id?: string
          nanny_id: string
          note?: string | null
          stage?: Database["public"]["Enums"]["shortlist_stage"]
          updated_at?: string
        }
        Update: {
          created_at?: string
          family_id?: string
          id?: string
          nanny_id?: string
          note?: string | null
          stage?: Database["public"]["Enums"]["shortlist_stage"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "saved_profiles_family_id_fkey"
            columns: ["family_id"]
            isOneToOne: false
            referencedRelation: "family_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "saved_profiles_nanny_id_fkey"
            columns: ["nanny_id"]
            isOneToOne: false
            referencedRelation: "nanny_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      subscription_events: {
        Row: {
          created_at: string
          event_type: string
          family_id: string | null
          from_status: Database["public"]["Enums"]["subscription_status"] | null
          id: string
          payload: Json
          provider_event_id: string | null
          subscription_id: string | null
          to_status: Database["public"]["Enums"]["subscription_status"] | null
        }
        Insert: {
          created_at?: string
          event_type: string
          family_id?: string | null
          from_status?:
            | Database["public"]["Enums"]["subscription_status"]
            | null
          id?: string
          payload?: Json
          provider_event_id?: string | null
          subscription_id?: string | null
          to_status?: Database["public"]["Enums"]["subscription_status"] | null
        }
        Update: {
          created_at?: string
          event_type?: string
          family_id?: string | null
          from_status?:
            | Database["public"]["Enums"]["subscription_status"]
            | null
          id?: string
          payload?: Json
          provider_event_id?: string | null
          subscription_id?: string | null
          to_status?: Database["public"]["Enums"]["subscription_status"] | null
        }
        Relationships: [
          {
            foreignKeyName: "subscription_events_family_id_fkey"
            columns: ["family_id"]
            isOneToOne: false
            referencedRelation: "family_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "subscription_events_subscription_id_fkey"
            columns: ["subscription_id"]
            isOneToOne: false
            referencedRelation: "subscriptions"
            referencedColumns: ["id"]
          },
        ]
      }
      subscriptions: {
        Row: {
          cancel_at_period_end: boolean
          cancelled_at: string | null
          created_at: string
          currency: string
          current_period_end: string
          current_period_start: string
          family_id: string
          id: string
          plan: Database["public"]["Enums"]["subscription_plan"]
          price_aed: number
          provider: string | null
          provider_customer_id: string | null
          provider_subscription_id: string | null
          status: Database["public"]["Enums"]["subscription_status"]
          updated_at: string
        }
        Insert: {
          cancel_at_period_end?: boolean
          cancelled_at?: string | null
          created_at?: string
          currency?: string
          current_period_end: string
          current_period_start?: string
          family_id: string
          id?: string
          plan: Database["public"]["Enums"]["subscription_plan"]
          price_aed: number
          provider?: string | null
          provider_customer_id?: string | null
          provider_subscription_id?: string | null
          status?: Database["public"]["Enums"]["subscription_status"]
          updated_at?: string
        }
        Update: {
          cancel_at_period_end?: boolean
          cancelled_at?: string | null
          created_at?: string
          currency?: string
          current_period_end?: string
          current_period_start?: string
          family_id?: string
          id?: string
          plan?: Database["public"]["Enums"]["subscription_plan"]
          price_aed?: number
          provider?: string | null
          provider_customer_id?: string | null
          provider_subscription_id?: string | null
          status?: Database["public"]["Enums"]["subscription_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "subscriptions_family_id_fkey"
            columns: ["family_id"]
            isOneToOne: false
            referencedRelation: "family_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      support_requests: {
        Row: {
          category: string
          contact_email: string
          contact_name: string | null
          created_at: string
          handled_at: string | null
          handled_by: string | null
          id: string
          internal_note: string | null
          message: string
          status: string
          subject: string
          updated_at: string
          user_id: string | null
        }
        Insert: {
          category: string
          contact_email: string
          contact_name?: string | null
          created_at?: string
          handled_at?: string | null
          handled_by?: string | null
          id?: string
          internal_note?: string | null
          message: string
          status?: string
          subject: string
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          category?: string
          contact_email?: string
          contact_name?: string | null
          created_at?: string
          handled_at?: string | null
          handled_by?: string | null
          id?: string
          internal_note?: string | null
          message?: string
          status?: string
          subject?: string
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "support_requests_handled_by_fkey"
            columns: ["handled_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "support_requests_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      users: {
        Row: {
          avatar_url: string | null
          created_at: string
          email: string
          first_name: string | null
          id: string
          last_name: string | null
          last_seen_at: string | null
          location: string | null
          phone: string | null
          role: Database["public"]["Enums"]["user_role"]
          status: Database["public"]["Enums"]["account_status"]
          suspended_at: string | null
          suspended_reason: string | null
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          email: string
          first_name?: string | null
          id: string
          last_name?: string | null
          last_seen_at?: string | null
          location?: string | null
          phone?: string | null
          role?: Database["public"]["Enums"]["user_role"]
          status?: Database["public"]["Enums"]["account_status"]
          suspended_at?: string | null
          suspended_reason?: string | null
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          email?: string
          first_name?: string | null
          id?: string
          last_name?: string | null
          last_seen_at?: string | null
          location?: string | null
          phone?: string | null
          role?: Database["public"]["Enums"]["user_role"]
          status?: Database["public"]["Enums"]["account_status"]
          suspended_at?: string | null
          suspended_reason?: string | null
          updated_at?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      admin_contact_funnel: { Args: never; Returns: Json }
      admin_grant_badge: {
        Args: { p_badge: string; p_nanny_id: string; p_note?: string }
        Returns: Json
      }
      admin_metrics: { Args: never; Returns: Json }
      admin_resolve_report: {
        Args: {
          p_report_id: string
          p_resolution?: string
          p_status: Database["public"]["Enums"]["report_status"]
        }
        Returns: Json
      }
      admin_revoke_badge: {
        Args: { p_badge: string; p_nanny_id: string }
        Returns: Json
      }
      admin_set_job_status: {
        Args: {
          p_job_id: string
          p_reason?: string
          p_status: Database["public"]["Enums"]["job_status"]
        }
        Returns: Json
      }
      admin_set_nanny_status: {
        Args: {
          p_nanny_id: string
          p_reason?: string
          p_status: Database["public"]["Enums"]["nanny_profile_status"]
        }
        Returns: Json
      }
      admin_set_user_status: {
        Args: {
          p_reason?: string
          p_status: Database["public"]["Enums"]["account_status"]
          p_user_id: string
        }
        Returns: Json
      }
      admin_update_pricing: {
        Args: {
          p_free_contacts: number
          p_monthly_enabled?: boolean
          p_monthly_is_best_value?: boolean
          p_monthly_price: number
          p_weekly_enabled?: boolean
          p_weekly_price: number
        }
        Returns: Json
      }
      admin_update_support_request: {
        Args: {
          p_internal_note?: string
          p_request_id: string
          p_status: string
        }
        Returns: Json
      }
      block_user: {
        Args: { p_blocked_id: string; p_reason?: string }
        Returns: Json
      }
      current_role_name: {
        Args: never
        Returns: Database["public"]["Enums"]["user_role"]
      }
      family_contact_state: {
        Args: { p_family_id: string }
        Returns: {
          can_contact: boolean
          current_period_end: string
          family_id: string
          free_contacts_limit: number
          free_contacts_remaining: number
          free_contacts_used: number
          plan: Database["public"]["Enums"]["subscription_plan"]
          subscription_active: boolean
        }[]
      }
      family_profile_completion: {
        Args: { p_family_id: string }
        Returns: Json
      }
      has_active_subscription: {
        Args: { p_family_id: string }
        Returns: boolean
      }
      is_admin: { Args: never; Returns: boolean }
      is_conversation_participant: {
        Args: { p_conversation_id: string }
        Returns: boolean
      }
      is_family: { Args: never; Returns: boolean }
      is_nanny: { Args: never; Returns: boolean }
      mark_conversation_read: {
        Args: { p_conversation_id: string }
        Returns: undefined
      }
      my_contact_state: {
        Args: never
        Returns: {
          can_contact: boolean
          current_period_end: string
          family_id: string
          free_contacts_limit: number
          free_contacts_remaining: number
          free_contacts_used: number
          plan: Database["public"]["Enums"]["subscription_plan"]
          subscription_active: boolean
        }[]
      }
      my_family_id: { Args: never; Returns: string }
      my_nanny_id: { Args: never; Returns: string }
      nanny_profile_completion: { Args: { p_nanny_id: string }; Returns: Json }
      report_content: {
        Args: {
          p_details?: string
          p_reason: string
          p_target_id: string
          p_target_kind: string
        }
        Returns: Json
      }
      send_message: {
        Args: {
          p_attachment_mime?: string
          p_attachment_name?: string
          p_attachment_path?: string
          p_body: string
          p_conversation_id: string
        }
        Returns: string
      }
      start_conversation: {
        Args: {
          p_first_message?: string
          p_job_id?: string
          p_nanny_id: string
          p_source?: Database["public"]["Enums"]["contact_source"]
        }
        Returns: Json
      }
      submit_nanny_profile: { Args: never; Returns: Json }
      unblock_user: { Args: { p_blocked_id: string }; Returns: Json }
    }
    Enums: {
      account_status: "active" | "suspended" | "deleted"
      application_status:
        | "applied"
        | "viewed"
        | "shortlisted"
        | "interview"
        | "rejected"
        | "hired"
        | "withdrawn"
      care_arrangement: "live_in" | "live_out" | "either"
      contact_source:
        | "search"
        | "match"
        | "profile"
        | "application"
        | "shortlist"
        | "job"
      employment_type:
        | "full_time"
        | "part_time"
        | "weekend"
        | "night_care"
        | "temporary"
      interview_status:
        | "requested"
        | "accepted"
        | "declined"
        | "rescheduled"
        | "completed"
        | "cancelled"
      job_status: "draft" | "active" | "paused" | "closed" | "filled"
      language_level: "none" | "basic" | "conversational" | "fluent" | "native"
      nanny_profile_status:
        | "draft"
        | "submitted"
        | "under_review"
        | "approved"
        | "rejected"
        | "suspended"
        | "expired"
      payment_status: "pending" | "succeeded" | "failed" | "refunded"
      report_status: "open" | "under_review" | "actioned" | "dismissed"
      shortlist_stage: "interested" | "interview" | "finalists" | "hired"
      subscription_plan: "weekly" | "monthly"
      subscription_status:
        | "active"
        | "past_due"
        | "cancelled"
        | "expired"
        | "refunded"
      user_role: "family" | "nanny" | "admin" | "super_admin"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {
      account_status: ["active", "suspended", "deleted"],
      application_status: [
        "applied",
        "viewed",
        "shortlisted",
        "interview",
        "rejected",
        "hired",
        "withdrawn",
      ],
      care_arrangement: ["live_in", "live_out", "either"],
      contact_source: [
        "search",
        "match",
        "profile",
        "application",
        "shortlist",
        "job",
      ],
      employment_type: [
        "full_time",
        "part_time",
        "weekend",
        "night_care",
        "temporary",
      ],
      interview_status: [
        "requested",
        "accepted",
        "declined",
        "rescheduled",
        "completed",
        "cancelled",
      ],
      job_status: ["draft", "active", "paused", "closed", "filled"],
      language_level: ["none", "basic", "conversational", "fluent", "native"],
      nanny_profile_status: [
        "draft",
        "submitted",
        "under_review",
        "approved",
        "rejected",
        "suspended",
        "expired",
      ],
      payment_status: ["pending", "succeeded", "failed", "refunded"],
      report_status: ["open", "under_review", "actioned", "dismissed"],
      shortlist_stage: ["interested", "interview", "finalists", "hired"],
      subscription_plan: ["weekly", "monthly"],
      subscription_status: [
        "active",
        "past_due",
        "cancelled",
        "expired",
        "refunded",
      ],
      user_role: ["family", "nanny", "admin", "super_admin"],
    },
  },
} as const

