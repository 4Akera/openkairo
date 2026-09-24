export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  core: {
    Tables: {
      actions: {
        Row: {
          key: string
          pack: string | null
        }
        Insert: {
          key: string
          pack?: string | null
        }
        Update: {
          key?: string
          pack?: string | null
        }
        Relationships: []
      }
      codes: {
        Row: {
          code: string
          kind: string
          name: string
          organization_id: string | null
          replaced_by_code: string | null
          retired_at: string | null
          unit: string | null
        }
        Insert: {
          code: string
          kind: string
          name: string
          organization_id?: string | null
          replaced_by_code?: string | null
          retired_at?: string | null
          unit?: string | null
        }
        Update: {
          code?: string
          kind?: string
          name?: string
          organization_id?: string | null
          replaced_by_code?: string | null
          retired_at?: string | null
          unit?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "codes_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "codes_replaced_by_code_fkey"
            columns: ["replaced_by_code"]
            isOneToOne: false
            referencedRelation: "codes"
            referencedColumns: ["code"]
          },
        ]
      }
      department_types: {
        Row: {
          is_visited: boolean
          key: string
          name: string
          pack: string | null
          retired_at: string | null
        }
        Insert: {
          is_visited: boolean
          key: string
          name: string
          pack?: string | null
          retired_at?: string | null
        }
        Update: {
          is_visited?: boolean
          key?: string
          name?: string
          pack?: string | null
          retired_at?: string | null
        }
        Relationships: []
      }
      departments: {
        Row: {
          after_done: string
          contact_text: string | null
          id: string
          is_outside: boolean
          name: string
          organization_id: string
          patients_wait: boolean
          private_visits: boolean
          retired_at: string | null
          review_results: string
          site_name: string | null
          type: string
        }
        Insert: {
          after_done?: string
          contact_text?: string | null
          id: string
          is_outside?: boolean
          name: string
          organization_id: string
          patients_wait?: boolean
          private_visits?: boolean
          retired_at?: string | null
          review_results?: string
          site_name?: string | null
          type: string
        }
        Update: {
          after_done?: string
          contact_text?: string | null
          id?: string
          is_outside?: boolean
          name?: string
          organization_id?: string
          patients_wait?: boolean
          private_visits?: boolean
          retired_at?: string | null
          review_results?: string
          site_name?: string | null
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "departments_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "departments_type_fkey"
            columns: ["type"]
            isOneToOne: false
            referencedRelation: "department_types"
            referencedColumns: ["key"]
          },
        ]
      }
      drafts: {
        Row: {
          author_id: string
          data: Json
          department_id: string
          entry_id: string
          organization_id: string
          patient_id: string
          reply_to_id: string | null
          responsible_id: string | null
          service_id: string | null
          type: string
          updated_at: string
          visit_id: string | null
        }
        Insert: {
          author_id: string
          data?: Json
          department_id: string
          entry_id: string
          organization_id: string
          patient_id: string
          reply_to_id?: string | null
          responsible_id?: string | null
          service_id?: string | null
          type: string
          updated_at?: string
          visit_id?: string | null
        }
        Update: {
          author_id?: string
          data?: Json
          department_id?: string
          entry_id?: string
          organization_id?: string
          patient_id?: string
          reply_to_id?: string | null
          responsible_id?: string | null
          service_id?: string | null
          type?: string
          updated_at?: string
          visit_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "drafts_type_fkey"
            columns: ["type"]
            isOneToOne: false
            referencedRelation: "entry_types"
            referencedColumns: ["key"]
          },
        ]
      }
      entries: {
        Row: {
          author_id: string
          data: Json
          department_id: string | null
          display_line: string
          flag: Database["core"]["Enums"]["value_flag"] | null
          id: string
          is_final: boolean
          occurred_at: string
          organization_id: string
          patient_id: string
          recorded_at: string
          replaced_by_id: string | null
          replaces_id: string | null
          reply_to_id: string | null
          responsible_id: string | null
          service_id: string | null
          source: Database["core"]["Enums"]["entry_source"]
          source_key: string | null
          type: string
          visit_id: string | null
          written_with_id: string | null
        }
        Insert: {
          author_id: string
          data?: Json
          department_id?: string | null
          display_line: string
          flag?: Database["core"]["Enums"]["value_flag"] | null
          id: string
          is_final?: boolean
          occurred_at: string
          organization_id: string
          patient_id: string
          recorded_at: string
          replaced_by_id?: string | null
          replaces_id?: string | null
          reply_to_id?: string | null
          responsible_id?: string | null
          service_id?: string | null
          source?: Database["core"]["Enums"]["entry_source"]
          source_key?: string | null
          type: string
          visit_id?: string | null
          written_with_id?: string | null
        }
        Update: {
          author_id?: string
          data?: Json
          department_id?: string | null
          display_line?: string
          flag?: Database["core"]["Enums"]["value_flag"] | null
          id?: string
          is_final?: boolean
          occurred_at?: string
          organization_id?: string
          patient_id?: string
          recorded_at?: string
          replaced_by_id?: string | null
          replaces_id?: string | null
          reply_to_id?: string | null
          responsible_id?: string | null
          service_id?: string | null
          source?: Database["core"]["Enums"]["entry_source"]
          source_key?: string | null
          type?: string
          visit_id?: string | null
          written_with_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "entries_organization_id_author_id_fkey"
            columns: ["organization_id", "author_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "entries_organization_id_department_id_fkey"
            columns: ["organization_id", "department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "entries_organization_id_patient_id_fkey"
            columns: ["organization_id", "patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "entries_organization_id_responsible_id_fkey"
            columns: ["organization_id", "responsible_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "entries_organization_id_service_id_fkey"
            columns: ["organization_id", "service_id"]
            isOneToOne: false
            referencedRelation: "services"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "entries_patient_id_visit_id_fkey"
            columns: ["patient_id", "visit_id"]
            isOneToOne: false
            referencedRelation: "visits"
            referencedColumns: ["patient_id", "id"]
          },
          {
            foreignKeyName: "entries_replaced_by_id_fkey"
            columns: ["replaced_by_id"]
            isOneToOne: false
            referencedRelation: "entries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "entries_replaces_id_fkey"
            columns: ["replaces_id"]
            isOneToOne: false
            referencedRelation: "entries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "entries_reply_to_fk"
            columns: ["reply_to_id"]
            isOneToOne: false
            referencedRelation: "requests"
            referencedColumns: ["entry_id"]
          },
          {
            foreignKeyName: "entries_type_fkey"
            columns: ["type"]
            isOneToOne: false
            referencedRelation: "entry_types"
            referencedColumns: ["key"]
          },
          {
            foreignKeyName: "entries_written_with_id_fkey"
            columns: ["written_with_id"]
            isOneToOne: false
            referencedRelation: "entries"
            referencedColumns: ["id"]
          },
        ]
      }
      entry_files: {
        Row: {
          entry_id: string
          mime: string | null
          name: string
          path: string | null
          position: number
          url: string | null
        }
        Insert: {
          entry_id: string
          mime?: string | null
          name: string
          path?: string | null
          position: number
          url?: string | null
        }
        Update: {
          entry_id?: string
          mime?: string | null
          name?: string
          path?: string | null
          position?: number
          url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "entry_files_entry_id_fkey"
            columns: ["entry_id"]
            isOneToOne: false
            referencedRelation: "entries"
            referencedColumns: ["id"]
          },
        ]
      }
      entry_types: {
        Row: {
          is_note: boolean
          key: string
          list: Database["core"]["Enums"]["list_kind"] | null
          name: string
          pack: string | null
          pack_list: string | null
          retired_at: string | null
        }
        Insert: {
          is_note?: boolean
          key: string
          list?: Database["core"]["Enums"]["list_kind"] | null
          name: string
          pack?: string | null
          pack_list?: string | null
          retired_at?: string | null
        }
        Update: {
          is_note?: boolean
          key?: string
          list?: Database["core"]["Enums"]["list_kind"] | null
          name?: string
          pack?: string | null
          pack_list?: string | null
          retired_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "entry_types_pack_fkey"
            columns: ["pack"]
            isOneToOne: false
            referencedRelation: "packs"
            referencedColumns: ["key"]
          },
        ]
      }
      entry_values: {
        Row: {
          code: string
          entry_id: string
          flag: Database["core"]["Enums"]["value_flag"] | null
          occurred_at: string
          organization_id: string
          patient_id: string
          position: number
          source: Database["core"]["Enums"]["entry_source"]
          unit: string | null
          value_number: number | null
          value_text: string | null
        }
        Insert: {
          code: string
          entry_id: string
          flag?: Database["core"]["Enums"]["value_flag"] | null
          occurred_at: string
          organization_id: string
          patient_id: string
          position: number
          source: Database["core"]["Enums"]["entry_source"]
          unit?: string | null
          value_number?: number | null
          value_text?: string | null
        }
        Update: {
          code?: string
          entry_id?: string
          flag?: Database["core"]["Enums"]["value_flag"] | null
          occurred_at?: string
          organization_id?: string
          patient_id?: string
          position?: number
          source?: Database["core"]["Enums"]["entry_source"]
          unit?: string | null
          value_number?: number | null
          value_text?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "entry_values_entry_id_fkey"
            columns: ["entry_id"]
            isOneToOne: false
            referencedRelation: "entries"
            referencedColumns: ["id"]
          },
        ]
      }
      erasures: {
        Row: {
          actor_id: string
          erased_at: string
          patient_id: string
          reason: string
        }
        Insert: {
          actor_id: string
          erased_at?: string
          patient_id: string
          reason: string
        }
        Update: {
          actor_id?: string
          erased_at?: string
          patient_id?: string
          reason?: string
        }
        Relationships: []
      }
      organization_packs: {
        Row: {
          organization_id: string
          pack: string
          retired_at: string | null
        }
        Insert: {
          organization_id: string
          pack: string
          retired_at?: string | null
        }
        Update: {
          organization_id?: string
          pack?: string
          retired_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "organization_packs_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "organization_packs_pack_fkey"
            columns: ["pack"]
            isOneToOne: false
            referencedRelation: "packs"
            referencedColumns: ["key"]
          },
        ]
      }
      organizations: {
        Row: {
          created_at: string
          id: string
          name: string
          record_view: string
          time_zone: string
        }
        Insert: {
          created_at?: string
          id: string
          name: string
          record_view?: string
          time_zone?: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          record_view?: string
          time_zone?: string
        }
        Relationships: []
      }
      pack_calls: {
        Row: {
          entry_id: string
          error_text: string | null
          organization_id: string
          pack: string
          recorded_at: string
          tried_at: string | null
          tries: number
        }
        Insert: {
          entry_id: string
          error_text?: string | null
          organization_id: string
          pack: string
          recorded_at?: string
          tried_at?: string | null
          tries?: number
        }
        Update: {
          entry_id?: string
          error_text?: string | null
          organization_id?: string
          pack?: string
          recorded_at?: string
          tried_at?: string | null
          tries?: number
        }
        Relationships: [
          {
            foreignKeyName: "pack_calls_pack_fkey"
            columns: ["pack"]
            isOneToOne: false
            referencedRelation: "packs"
            referencedColumns: ["key"]
          },
        ]
      }
      packs: {
        Row: {
          is_called_after_write: boolean
          key: string
          name: string
        }
        Insert: {
          is_called_after_write?: boolean
          key: string
          name: string
        }
        Update: {
          is_called_after_write?: boolean
          key?: string
          name?: string
        }
        Relationships: []
      }
      patient_allergies: {
        Row: {
          certainty: string | null
          class_code: string | null
          id: string
          kind: string
          latest_entry_id: string
          organization_id: string
          patient_id: string
          reactions_text: string | null
          severity: string | null
          status: string
          substance_code: string | null
          substance_name: string
        }
        Insert: {
          certainty?: string | null
          class_code?: string | null
          id: string
          kind: string
          latest_entry_id: string
          organization_id: string
          patient_id: string
          reactions_text?: string | null
          severity?: string | null
          status?: string
          substance_code?: string | null
          substance_name: string
        }
        Update: {
          certainty?: string | null
          class_code?: string | null
          id?: string
          kind?: string
          latest_entry_id?: string
          organization_id?: string
          patient_id?: string
          reactions_text?: string | null
          severity?: string | null
          status?: string
          substance_code?: string | null
          substance_name?: string
        }
        Relationships: []
      }
      patient_changes: {
        Row: {
          changes: Json
          id: string
          organization_id: string
          patient_id: string
          recorded_at: string
          user_id: string
        }
        Insert: {
          changes: Json
          id: string
          organization_id: string
          patient_id: string
          recorded_at?: string
          user_id: string
        }
        Update: {
          changes?: Json
          id?: string
          organization_id?: string
          patient_id?: string
          recorded_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "patient_changes_organization_id_patient_id_fkey"
            columns: ["organization_id", "patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["organization_id", "id"]
          },
        ]
      }
      patient_identifiers: {
        Row: {
          organization_id: string
          patient_id: string
          system: string
          value: string
        }
        Insert: {
          organization_id: string
          patient_id: string
          system: string
          value: string
        }
        Update: {
          organization_id?: string
          patient_id?: string
          system?: string
          value?: string
        }
        Relationships: [
          {
            foreignKeyName: "patient_identifiers_organization_id_patient_id_fkey"
            columns: ["organization_id", "patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["organization_id", "id"]
          },
        ]
      }
      patient_list_reviews: {
        Row: {
          entry_id: string
          list: Database["core"]["Enums"]["list_kind"]
          patient_id: string
          reviewed_at: string
          reviewed_by_id: string
        }
        Insert: {
          entry_id: string
          list: Database["core"]["Enums"]["list_kind"]
          patient_id: string
          reviewed_at: string
          reviewed_by_id: string
        }
        Update: {
          entry_id?: string
          list?: Database["core"]["Enums"]["list_kind"]
          patient_id?: string
          reviewed_at?: string
          reviewed_by_id?: string
        }
        Relationships: []
      }
      patient_medications: {
        Row: {
          dose_number: number | null
          dose_unit: string | null
          drug_code: string | null
          drug_name: string
          form: string | null
          frequency: string | null
          id: string
          instructions_text: string | null
          latest_entry_id: string
          organization_id: string
          patient_id: string
          prescriber_id: string
          prn: boolean
          prn_reason_text: string | null
          problem_id: string | null
          route: string | null
          started_on: string
          status: string
          stop_reason_text: string | null
          stopped_on: string | null
          strength: string | null
        }
        Insert: {
          dose_number?: number | null
          dose_unit?: string | null
          drug_code?: string | null
          drug_name: string
          form?: string | null
          frequency?: string | null
          id: string
          instructions_text?: string | null
          latest_entry_id: string
          organization_id: string
          patient_id: string
          prescriber_id: string
          prn?: boolean
          prn_reason_text?: string | null
          problem_id?: string | null
          route?: string | null
          started_on: string
          status?: string
          stop_reason_text?: string | null
          stopped_on?: string | null
          strength?: string | null
        }
        Update: {
          dose_number?: number | null
          dose_unit?: string | null
          drug_code?: string | null
          drug_name?: string
          form?: string | null
          frequency?: string | null
          id?: string
          instructions_text?: string | null
          latest_entry_id?: string
          organization_id?: string
          patient_id?: string
          prescriber_id?: string
          prn?: boolean
          prn_reason_text?: string | null
          problem_id?: string | null
          route?: string | null
          started_on?: string
          status?: string
          stop_reason_text?: string | null
          stopped_on?: string | null
          strength?: string | null
        }
        Relationships: []
      }
      patient_problems: {
        Row: {
          certainty: string
          code: string | null
          id: string
          latest_entry_id: string
          name: string
          note_text: string | null
          onset_on: string | null
          organization_id: string
          patient_id: string
          resolved_on: string | null
          status: string
        }
        Insert: {
          certainty?: string
          code?: string | null
          id: string
          latest_entry_id: string
          name: string
          note_text?: string | null
          onset_on?: string | null
          organization_id: string
          patient_id: string
          resolved_on?: string | null
          status?: string
        }
        Update: {
          certainty?: string
          code?: string | null
          id?: string
          latest_entry_id?: string
          name?: string
          note_text?: string | null
          onset_on?: string | null
          organization_id?: string
          patient_id?: string
          resolved_on?: string | null
          status?: string
        }
        Relationships: []
      }
      patients: {
        Row: {
          born_on: string
          contact_text: string | null
          created_at: string
          died_on: string | null
          family_name: string
          given_name: string
          id: string
          merged_into_id: string | null
          middle_name: string | null
          organization_id: string
          phone_digits: string | null
          phone_text: string | null
          record_number: number
          sex: Database["core"]["Enums"]["sex"]
        }
        Insert: {
          born_on: string
          contact_text?: string | null
          created_at?: string
          died_on?: string | null
          family_name: string
          given_name: string
          id: string
          merged_into_id?: string | null
          middle_name?: string | null
          organization_id: string
          phone_digits?: string | null
          phone_text?: string | null
          record_number: number
          sex: Database["core"]["Enums"]["sex"]
        }
        Update: {
          born_on?: string
          contact_text?: string | null
          created_at?: string
          died_on?: string | null
          family_name?: string
          given_name?: string
          id?: string
          merged_into_id?: string | null
          middle_name?: string | null
          organization_id?: string
          phone_digits?: string | null
          phone_text?: string | null
          record_number?: number
          sex?: Database["core"]["Enums"]["sex"]
        }
        Relationships: [
          {
            foreignKeyName: "patients_merged_into_id_fkey"
            columns: ["merged_into_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "patients_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      record_numbers: {
        Row: {
          last_number: number
          organization_id: string
        }
        Insert: {
          last_number?: number
          organization_id: string
        }
        Update: {
          last_number?: number
          organization_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "record_numbers_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: true
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      record_reads: {
        Row: {
          basis: string | null
          department_id: string | null
          opened_visit_id: string | null
          organization_id: string
          patient_id: string
          read_at: string
          reason_text: string | null
          user_id: string
        }
        Insert: {
          basis?: string | null
          department_id?: string | null
          opened_visit_id?: string | null
          organization_id: string
          patient_id: string
          read_at?: string
          reason_text?: string | null
          user_id: string
        }
        Update: {
          basis?: string | null
          department_id?: string | null
          opened_visit_id?: string | null
          organization_id?: string
          patient_id?: string
          read_at?: string
          reason_text?: string | null
          user_id?: string
        }
        Relationships: []
      }
      request_steps: {
        Row: {
          actor_id: string | null
          changes: Json | null
          occurred_at: string
          organization_id: string
          position: number
          reason: string | null
          recorded_at: string
          request_id: string
          step: Database["core"]["Enums"]["request_step"]
        }
        Insert: {
          actor_id?: string | null
          changes?: Json | null
          occurred_at: string
          organization_id: string
          position: number
          reason?: string | null
          recorded_at?: string
          request_id: string
          step: Database["core"]["Enums"]["request_step"]
        }
        Update: {
          actor_id?: string | null
          changes?: Json | null
          occurred_at?: string
          organization_id?: string
          position?: number
          reason?: string | null
          recorded_at?: string
          request_id?: string
          step?: Database["core"]["Enums"]["request_step"]
        }
        Relationships: [
          {
            foreignKeyName: "request_steps_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: false
            referencedRelation: "entries"
            referencedColumns: ["id"]
          },
        ]
      }
      requests: {
        Row: {
          assignee_id: string | null
          due_at: string
          entry_id: string
          from_department_id: string
          organization_id: string
          patient_id: string
          priority: Database["core"]["Enums"]["request_priority"]
          replied_at: string | null
          reply_flag: Database["core"]["Enums"]["value_flag"] | null
          reply_line: string | null
          requester_id: string
          review_needed_at: string | null
          review_reason: string | null
          status: Database["core"]["Enums"]["request_status"] | null
          status_reason: string | null
          step: Database["core"]["Enums"]["request_step"]
          to_department_id: string | null
        }
        Insert: {
          assignee_id?: string | null
          due_at: string
          entry_id: string
          from_department_id: string
          organization_id: string
          patient_id: string
          priority?: Database["core"]["Enums"]["request_priority"]
          replied_at?: string | null
          reply_flag?: Database["core"]["Enums"]["value_flag"] | null
          reply_line?: string | null
          requester_id: string
          review_needed_at?: string | null
          review_reason?: string | null
          status?: Database["core"]["Enums"]["request_status"] | null
          status_reason?: string | null
          step?: Database["core"]["Enums"]["request_step"]
          to_department_id?: string | null
        }
        Update: {
          assignee_id?: string | null
          due_at?: string
          entry_id?: string
          from_department_id?: string
          organization_id?: string
          patient_id?: string
          priority?: Database["core"]["Enums"]["request_priority"]
          replied_at?: string | null
          reply_flag?: Database["core"]["Enums"]["value_flag"] | null
          reply_line?: string | null
          requester_id?: string
          review_needed_at?: string | null
          review_reason?: string | null
          status?: Database["core"]["Enums"]["request_status"] | null
          status_reason?: string | null
          step?: Database["core"]["Enums"]["request_step"]
          to_department_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "requests_entry_id_fkey"
            columns: ["entry_id"]
            isOneToOne: true
            referencedRelation: "entries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "requests_organization_id_assignee_id_fkey"
            columns: ["organization_id", "assignee_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "requests_organization_id_to_department_id_fkey"
            columns: ["organization_id", "to_department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["organization_id", "id"]
          },
        ]
      }
      role_actions: {
        Row: {
          action: string
          role_id: string
        }
        Insert: {
          action: string
          role_id: string
        }
        Update: {
          action?: string
          role_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "role_actions_action_fkey"
            columns: ["action"]
            isOneToOne: false
            referencedRelation: "actions"
            referencedColumns: ["key"]
          },
          {
            foreignKeyName: "role_actions_role_id_fkey"
            columns: ["role_id"]
            isOneToOne: false
            referencedRelation: "roles"
            referencedColumns: ["id"]
          },
        ]
      }
      roles: {
        Row: {
          id: string
          key: string
          name: string
          organization_id: string | null
          retired_at: string | null
        }
        Insert: {
          id: string
          key: string
          name: string
          organization_id?: string | null
          retired_at?: string | null
        }
        Update: {
          id?: string
          key?: string
          name?: string
          organization_id?: string | null
          retired_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "roles_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      served_departments: {
        Row: {
          department_id: string
          served_department_id: string | null
        }
        Insert: {
          department_id: string
          served_department_id?: string | null
        }
        Update: {
          department_id?: string
          served_department_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "served_departments_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "served_departments_served_department_id_fkey"
            columns: ["served_department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
        ]
      }
      server_settings: {
        Row: {
          key: string
          value: string
        }
        Insert: {
          key: string
          value: string
        }
        Update: {
          key?: string
          value?: string
        }
        Relationships: []
      }
      service_field_ranges: {
        Row: {
          age_high: number | null
          age_low: number | null
          critical_high: number | null
          critical_low: number | null
          position: number
          reference_high: number | null
          reference_low: number | null
          service_id: string
          sex: Database["core"]["Enums"]["sex"] | null
        }
        Insert: {
          age_high?: number | null
          age_low?: number | null
          critical_high?: number | null
          critical_low?: number | null
          position: number
          reference_high?: number | null
          reference_low?: number | null
          service_id: string
          sex?: Database["core"]["Enums"]["sex"] | null
        }
        Update: {
          age_high?: number | null
          age_low?: number | null
          critical_high?: number | null
          critical_low?: number | null
          position?: number
          reference_high?: number | null
          reference_low?: number | null
          service_id?: string
          sex?: Database["core"]["Enums"]["sex"] | null
        }
        Relationships: [
          {
            foreignKeyName: "service_field_ranges_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "services"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_field_ranges_service_id_position_fkey"
            columns: ["service_id", "position"]
            isOneToOne: false
            referencedRelation: "service_fields"
            referencedColumns: ["service_id", "position"]
          },
        ]
      }
      service_fields: {
        Row: {
          choices: string[] | null
          code: string
          critical_high: number | null
          critical_low: number | null
          kind: string
          name: string
          position: number
          reference_high: number | null
          reference_low: number | null
          retired_at: string | null
          service_id: string
          unit: string | null
        }
        Insert: {
          choices?: string[] | null
          code: string
          critical_high?: number | null
          critical_low?: number | null
          kind: string
          name: string
          position: number
          reference_high?: number | null
          reference_low?: number | null
          retired_at?: string | null
          service_id: string
          unit?: string | null
        }
        Update: {
          choices?: string[] | null
          code?: string
          critical_high?: number | null
          critical_low?: number | null
          kind?: string
          name?: string
          position?: number
          reference_high?: number | null
          reference_low?: number | null
          retired_at?: string | null
          service_id?: string
          unit?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "service_fields_code_fkey"
            columns: ["code"]
            isOneToOne: false
            referencedRelation: "codes"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "service_fields_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "services"
            referencedColumns: ["id"]
          },
        ]
      }
      services: {
        Row: {
          code: string
          department_id: string | null
          id: string
          name: string
          organization_id: string
          reply_type: string
          retired_at: string | null
          section_name: string | null
        }
        Insert: {
          code: string
          department_id?: string | null
          id: string
          name: string
          organization_id: string
          reply_type?: string
          retired_at?: string | null
          section_name?: string | null
        }
        Update: {
          code?: string
          department_id?: string | null
          id?: string
          name?: string
          organization_id?: string
          reply_type?: string
          retired_at?: string | null
          section_name?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "services_organization_id_department_id_fkey"
            columns: ["organization_id", "department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "services_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      settings_changes: {
        Row: {
          changes: Json
          id: string
          organization_id: string
          recorded_at: string
          row_id: string
          table_name: string
          user_id: string
        }
        Insert: {
          changes: Json
          id: string
          organization_id: string
          recorded_at?: string
          row_id: string
          table_name: string
          user_id: string
        }
        Update: {
          changes?: Json
          id?: string
          organization_id?: string
          recorded_at?: string
          row_id?: string
          table_name?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "settings_changes_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      templates: {
        Row: {
          department_id: string | null
          id: string
          items: Json
          name: string
          organization_id: string
          retired_at: string | null
          user_id: string | null
        }
        Insert: {
          department_id?: string | null
          id: string
          items?: Json
          name: string
          organization_id: string
          retired_at?: string | null
          user_id?: string | null
        }
        Update: {
          department_id?: string | null
          id?: string
          items?: Json
          name?: string
          organization_id?: string
          retired_at?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "templates_organization_id_department_id_fkey"
            columns: ["organization_id", "department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "templates_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "templates_organization_id_user_id_fkey"
            columns: ["organization_id", "user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["organization_id", "id"]
          },
        ]
      }
      user_roles: {
        Row: {
          department_id: string | null
          organization_id: string
          role_id: string
          user_id: string
        }
        Insert: {
          department_id?: string | null
          organization_id: string
          role_id: string
          user_id: string
        }
        Update: {
          department_id?: string | null
          organization_id?: string
          role_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_roles_organization_id_department_id_fkey"
            columns: ["organization_id", "department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "user_roles_organization_id_user_id_fkey"
            columns: ["organization_id", "user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "user_roles_role_id_fkey"
            columns: ["role_id"]
            isOneToOne: false
            referencedRelation: "roles"
            referencedColumns: ["id"]
          },
        ]
      }
      users: {
        Row: {
          accepted_at: string | null
          id: string
          invited_at: string | null
          kind: Database["core"]["Enums"]["user_kind"]
          login_id: string | null
          name: string
          organization_id: string
          retired_at: string | null
          title: string | null
        }
        Insert: {
          accepted_at?: string | null
          id: string
          invited_at?: string | null
          kind: Database["core"]["Enums"]["user_kind"]
          login_id?: string | null
          name: string
          organization_id: string
          retired_at?: string | null
          title?: string | null
        }
        Update: {
          accepted_at?: string | null
          id?: string
          invited_at?: string | null
          kind?: Database["core"]["Enums"]["user_kind"]
          login_id?: string | null
          name?: string
          organization_id?: string
          retired_at?: string | null
          title?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "users_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      visit_steps: {
        Row: {
          actor_id: string | null
          changes: Json | null
          organization_id: string
          position: number
          reason: string | null
          recorded_at: string
          status: Database["core"]["Enums"]["visit_status"]
          visit_id: string
        }
        Insert: {
          actor_id?: string | null
          changes?: Json | null
          organization_id: string
          position: number
          reason?: string | null
          recorded_at?: string
          status: Database["core"]["Enums"]["visit_status"]
          visit_id: string
        }
        Update: {
          actor_id?: string | null
          changes?: Json | null
          organization_id?: string
          position?: number
          reason?: string | null
          recorded_at?: string
          status?: Database["core"]["Enums"]["visit_status"]
          visit_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "visit_steps_visit_id_fkey"
            columns: ["visit_id"]
            isOneToOne: false
            referencedRelation: "visits"
            referencedColumns: ["id"]
          },
        ]
      }
      visits: {
        Row: {
          arrived_at: string
          assignee_id: string | null
          department_id: string
          ended_at: string | null
          id: string
          is_first: boolean
          is_private: boolean
          organization_id: string
          patient_id: string
          present_at: string | null
          priority: Database["core"]["Enums"]["request_priority"]
          request_id: string | null
          seen_at: string | null
          status: Database["core"]["Enums"]["visit_status"]
        }
        Insert: {
          arrived_at?: string
          assignee_id?: string | null
          department_id: string
          ended_at?: string | null
          id: string
          is_first: boolean
          is_private?: boolean
          organization_id: string
          patient_id: string
          present_at?: string | null
          priority?: Database["core"]["Enums"]["request_priority"]
          request_id?: string | null
          seen_at?: string | null
          status?: Database["core"]["Enums"]["visit_status"]
        }
        Update: {
          arrived_at?: string
          assignee_id?: string | null
          department_id?: string
          ended_at?: string | null
          id?: string
          is_first?: boolean
          is_private?: boolean
          organization_id?: string
          patient_id?: string
          present_at?: string | null
          priority?: Database["core"]["Enums"]["request_priority"]
          request_id?: string | null
          seen_at?: string | null
          status?: Database["core"]["Enums"]["visit_status"]
        }
        Relationships: [
          {
            foreignKeyName: "visits_organization_id_assignee_id_fkey"
            columns: ["organization_id", "assignee_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "visits_organization_id_department_id_fkey"
            columns: ["organization_id", "department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "visits_organization_id_patient_id_fkey"
            columns: ["organization_id", "patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "visits_request_fk"
            columns: ["organization_id", "request_id"]
            isOneToOne: false
            referencedRelation: "requests"
            referencedColumns: ["organization_id", "entry_id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      age_on: { Args: { at_date: string; born: unknown }; Returns: number }
      apply_updater: {
        Args: { e: Database["core"]["Tables"]["entries"]["Row"] }
        Returns: undefined
      }
      auth_aal: { Args: never; Returns: string }
      auth_uid: { Args: never; Returns: string }
      begin_write: {
        Args: {
          p_action: string
          p_data: Json
          p_department_id: string
          p_patient_id: string
          p_source: Database["core"]["Enums"]["entry_source"]
          p_stated_author_name: string
          p_stated_recorded_at: string
        }
        Returns: Record<string, unknown>
      }
      call_write: {
        Args: { fn: string; params: Json }
        Returns: {
          author_id: string
          data: Json
          department_id: string | null
          display_line: string
          flag: Database["core"]["Enums"]["value_flag"] | null
          id: string
          is_final: boolean
          occurred_at: string
          organization_id: string
          patient_id: string
          recorded_at: string
          replaced_by_id: string | null
          replaces_id: string | null
          reply_to_id: string | null
          responsible_id: string | null
          service_id: string | null
          source: Database["core"]["Enums"]["entry_source"]
          source_key: string | null
          type: string
          visit_id: string | null
          written_with_id: string | null
        }
        SetofOptions: {
          from: "*"
          to: "entries"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      can: {
        Args: {
          p_action: string
          p_department: string
          p_org: string
          p_user: string
        }
        Returns: boolean
      }
      chain_of: {
        Args: { p_entry: string }
        Returns: {
          author_id: string
          data: Json
          department_id: string | null
          display_line: string
          flag: Database["core"]["Enums"]["value_flag"] | null
          id: string
          is_final: boolean
          occurred_at: string
          organization_id: string
          patient_id: string
          recorded_at: string
          replaced_by_id: string | null
          replaces_id: string | null
          reply_to_id: string | null
          responsible_id: string | null
          service_id: string | null
          source: Database["core"]["Enums"]["entry_source"]
          source_key: string | null
          type: string
          visit_id: string | null
          written_with_id: string | null
        }[]
        SetofOptions: {
          from: "*"
          to: "entries"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      change_request: {
        Args: {
          p_actor: string
          p_changes?: Json
          p_from: Database["core"]["Enums"]["request_step"]
          p_occurred_at?: string
          p_reason?: string
          p_request_id: string
          p_to: Database["core"]["Enums"]["request_step"]
        }
        Returns: {
          assignee_id: string | null
          due_at: string
          entry_id: string
          from_department_id: string
          organization_id: string
          patient_id: string
          priority: Database["core"]["Enums"]["request_priority"]
          replied_at: string | null
          reply_flag: Database["core"]["Enums"]["value_flag"] | null
          reply_line: string | null
          requester_id: string
          review_needed_at: string | null
          review_reason: string | null
          status: Database["core"]["Enums"]["request_status"] | null
          status_reason: string | null
          step: Database["core"]["Enums"]["request_step"]
          to_department_id: string | null
        }
        SetofOptions: {
          from: "*"
          to: "requests"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      change_visit: {
        Args: {
          p_actor: string
          p_changes: Json
          p_reason: string
          p_status: Database["core"]["Enums"]["visit_status"]
          v: Database["core"]["Tables"]["visits"]["Row"]
        }
        Returns: {
          arrived_at: string
          assignee_id: string | null
          department_id: string
          ended_at: string | null
          id: string
          is_first: boolean
          is_private: boolean
          organization_id: string
          patient_id: string
          present_at: string | null
          priority: Database["core"]["Enums"]["request_priority"]
          request_id: string | null
          seen_at: string | null
          status: Database["core"]["Enums"]["visit_status"]
        }
        SetofOptions: {
          from: "*"
          to: "visits"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      clear_seen: {
        Args: { p_actor: string; p_visit_id: string }
        Returns: number
      }
      current_user_id: { Args: { p_organization_id: string }; Returns: string }
      day_start: { Args: { p_org: string }; Returns: string }
      entry_card:
        | {
            Args: { e: Database["core"]["Tables"]["entries"]["Row"] }
            Returns: Json
          }
        | {
            Args: {
              e: Database["core"]["Tables"]["entries"]["Row"]
              p_hidden: string[]
            }
            Returns: Json
          }
      entry_data: {
        Args: {
          e: Database["core"]["Tables"]["entries"]["Row"]
          p_hidden: string[]
        }
        Returns: Json
      }
      extract_values: {
        Args: { e: Database["core"]["Tables"]["entries"]["Row"] }
        Returns: undefined
      }
      fill_values: {
        Args: { p_patient: string; p_service: string; vals: Json }
        Returns: Json
      }
      finish_pack_call: {
        Args: { p_entry_id: string; p_error: string; p_pack: string }
        Returns: undefined
      }
      flag_of: {
        Args: { v: Json }
        Returns: Database["core"]["Enums"]["value_flag"]
      }
      flag_unseen: { Args: { p_visit_id: string }; Returns: number }
      fold: { Args: { t: string }; Returns: string }
      hidden_for: {
        Args: { p_patient: string; p_user: string }
        Returns: string[]
      }
      hidden_visits: {
        Args: { p_patient_ids: string[]; p_user: string }
        Returns: string[]
      }
      holds: { Args: { p_visit_id: string }; Returns: number }
      is_note: { Args: { p_type: string }; Returns: boolean }
      local_code: {
        Args: {
          p_code: string
          p_kind: string
          p_name: string
          p_org: string
          p_unit: string
        }
        Returns: string
      }
      local_date: { Args: { p_at: string; p_org: string }; Returns: string }
      lock_record: { Args: { p_patient_id: string }; Returns: undefined }
      next_pack_call: {
        Args: never
        Returns: {
          entry: Database["core"]["Tables"]["entries"]["Row"]
          entry_id: string
          organization_id: string
          pack: string
        }[]
      }
      next_step_position: { Args: { p_request_id: string }; Returns: number }
      note_hidden: {
        Args: {
          e: Database["core"]["Tables"]["entries"]["Row"]
          p_hidden: string[]
        }
        Returns: boolean
      }
      open_record: {
        Args: {
          p_department: string
          p_org: string
          p_patient: string
          p_reason: string
          p_user: string
          p_visit: string
        }
        Returns: undefined
      }
      org_of_department: { Args: { d: string }; Returns: string }
      org_of_patient: { Args: { p: string }; Returns: string }
      patient_hit: {
        Args: { p: Database["core"]["Tables"]["patients"]["Row"]; u: string }
        Returns: Json
      }
      rebuild_record: { Args: { p_patient_id: string }; Returns: Json }
      record_settings_change: {
        Args: {
          p_change_id?: string
          p_changes: Json
          p_org: string
          p_row: string
          p_table: string
          p_user: string
        }
        Returns: string
      }
      refold_request: {
        Args: { p_needs_review?: boolean; p_request_id: string }
        Returns: undefined
      }
      refuse: { Args: { code: string; detail?: string }; Returns: undefined }
      replay_list: {
        Args: {
          p_list: Database["core"]["Enums"]["list_kind"]
          p_pack?: string
          p_pack_list?: string
          p_patient_id: string
        }
        Returns: number
      }
      reply_for_me: {
        Args: { e: Database["core"]["Tables"]["entries"]["Row"] }
        Returns: boolean
      }
      require_access: {
        Args: {
          p_action: string
          p_department_id?: string
          p_organization_id: string
          p_patient_id?: string
        }
        Returns: string
      }
      require_fresh: {
        Args: { p_row: string; p_seen: string; p_table: string }
        Returns: undefined
      }
      require_last_administrator: {
        Args: { p_org: string }
        Returns: undefined
      }
      require_open: {
        Args: { p_patient: string; p_user: string }
        Returns: undefined
      }
      require_pack: {
        Args: { p_organization_id: string; p_pack: string }
        Returns: undefined
      }
      review_reason: {
        Args: {
          last: Database["core"]["Tables"]["entries"]["Row"]
          r: Database["core"]["Tables"]["requests"]["Row"]
          worst: Database["core"]["Enums"]["value_flag"]
        }
        Returns: string
      }
      root_of: { Args: { p_entry_id: string }; Returns: string }
      route_request: {
        Args: {
          p_actor: string
          p_assignee: string
          p_due_at: string
          p_priority: Database["core"]["Enums"]["request_priority"]
          p_reason: string
          p_request_id: string
          p_to_department: string
        }
        Returns: {
          assignee_id: string | null
          due_at: string
          entry_id: string
          from_department_id: string
          organization_id: string
          patient_id: string
          priority: Database["core"]["Enums"]["request_priority"]
          replied_at: string | null
          reply_flag: Database["core"]["Enums"]["value_flag"] | null
          reply_line: string | null
          requester_id: string
          review_needed_at: string | null
          review_reason: string | null
          status: Database["core"]["Enums"]["request_status"] | null
          status_reason: string | null
          step: Database["core"]["Enums"]["request_step"]
          to_department_id: string | null
        }
        SetofOptions: {
          from: "*"
          to: "requests"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      run_one_pack_call: {
        Args: {
          p_entry: Database["core"]["Tables"]["entries"]["Row"]
          p_organization_id: string
          p_pack: string
        }
        Returns: string
      }
      sees_department: {
        Args: { p_department: string; p_org: string; p_user: string }
        Returns: boolean
      }
      short: { Args: { n?: number; t: string }; Returns: string }
      signal: { Args: { p_payload: Json; p_topic: string }; Returns: undefined }
      survivor: { Args: { p_patient_id: string }; Returns: string }
      sweep_visits: { Args: never; Returns: number }
      today: { Args: { p_org: string }; Returns: string }
      update_allergies: {
        Args: { e: Database["core"]["Tables"]["entries"]["Row"] }
        Returns: undefined
      }
      update_list_reviews: {
        Args: { e: Database["core"]["Tables"]["entries"]["Row"] }
        Returns: undefined
      }
      update_medications: {
        Args: { e: Database["core"]["Tables"]["entries"]["Row"] }
        Returns: undefined
      }
      update_problems: {
        Args: { e: Database["core"]["Tables"]["entries"]["Row"] }
        Returns: undefined
      }
      values_line: { Args: { vals: Json }; Returns: string }
      visit_hidden: {
        Args: { p_user: string; p_visit: string }
        Returns: boolean
      }
      vital: {
        Args: { c: string; n: string; u: string; v: number; vals: Json }
        Returns: Json
      }
      worst_flag: {
        Args: { d: Json }
        Returns: Database["core"]["Enums"]["value_flag"]
      }
      write_entry: {
        Args: {
          p_author_id: string
          p_data: Json
          p_department_id: string
          p_destination?: Json
          p_display_line: string
          p_id: string
          p_is_final: boolean
          p_needs_review?: boolean
          p_occurred_at: string
          p_organization_id: string
          p_patient_id: string
          p_replaces_id: string
          p_reply_to_id: string
          p_responsible_id: string
          p_service_id: string
          p_source: Database["core"]["Enums"]["entry_source"]
          p_source_key: string
          p_type: string
          p_visit_id: string
          p_written_with_id: string
        }
        Returns: {
          author_id: string
          data: Json
          department_id: string | null
          display_line: string
          flag: Database["core"]["Enums"]["value_flag"] | null
          id: string
          is_final: boolean
          occurred_at: string
          organization_id: string
          patient_id: string
          recorded_at: string
          replaced_by_id: string | null
          replaces_id: string | null
          reply_to_id: string | null
          responsible_id: string | null
          service_id: string | null
          source: Database["core"]["Enums"]["entry_source"]
          source_key: string | null
          type: string
          visit_id: string | null
          written_with_id: string | null
        }
        SetofOptions: {
          from: "*"
          to: "entries"
          isOneToOne: true
          isSetofReturn: false
        }
      }
    }
    Enums: {
      entry_source: "staff" | "patient" | "machine" | "outside" | "import"
      list_kind: "medications" | "problems" | "allergies"
      request_priority: "stat" | "urgent" | "routine"
      request_status: "open" | "done" | "cancelled"
      request_step:
        | "sent"
        | "held"
        | "started"
        | "replied"
        | "done"
        | "cancelled"
        | "reopened"
        | "prepared"
      sex: "female" | "male" | "other"
      user_kind: "staff" | "machine" | "pack" | "patient" | "proxy" | "importer"
      value_flag: "normal" | "low" | "high" | "abnormal" | "critical"
      visit_status:
        | "waiting"
        | "in_consult"
        | "pending"
        | "done"
        | "left"
        | "lapsed"
        | "cancelled"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      create_organization: {
        Args: {
          id: string
          name: string
          owner_id: string
          owner_login_id: string
          owner_name: string
        }
        Returns: Database["core"]["Tables"]["organizations"]["Row"]
        SetofOptions: {
          from: "*"
          to: "organizations"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      erase_patient: {
        Args: { patient_id: string; reason: string }
        Returns: undefined
      }
      link_login: {
        Args: { login_id: string; user_id: string }
        Returns: undefined
      }
      mark_present: {
        Args: { is_present: boolean; visit_id: string }
        Returns: Database["core"]["Tables"]["visits"]["Row"]
        SetofOptions: {
          from: "*"
          to: "visits"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      mark_reviewed: { Args: { request_ids: string[] }; Returns: number }
      mark_routing: {
        Args: {
          assignee_id?: string
          due_at?: string
          priority?: Database["core"]["Enums"]["request_priority"]
          reason?: string
          request_id: string
          to_department_id?: string
        }
        Returns: Database["core"]["Tables"]["requests"]["Row"]
        SetofOptions: {
          from: "*"
          to: "requests"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      mark_step: {
        Args: {
          from_step: Database["core"]["Enums"]["request_step"]
          occurred_at?: string
          reason?: string
          request_id: string
          step: Database["core"]["Enums"]["request_step"]
        }
        Returns: Database["core"]["Tables"]["requests"]["Row"]
        SetofOptions: {
          from: "*"
          to: "requests"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      mark_visit: {
        Args: {
          from_status: Database["core"]["Enums"]["visit_status"]
          reason?: string
          status: Database["core"]["Enums"]["visit_status"]
          visit_id: string
          wait?: boolean
        }
        Returns: Database["core"]["Tables"]["visits"]["Row"]
        SetofOptions: {
          from: "*"
          to: "visits"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      mark_visit_private: {
        Args: { is_private: boolean; reason?: string; visit_id: string }
        Returns: Database["core"]["Tables"]["visits"]["Row"]
        SetofOptions: {
          from: "*"
          to: "visits"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      mark_visit_routing: {
        Args: {
          assignee_id?: string
          is_first?: boolean
          priority?: Database["core"]["Enums"]["request_priority"]
          visit_id: string
        }
        Returns: Database["core"]["Tables"]["visits"]["Row"]
        SetofOptions: {
          from: "*"
          to: "visits"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      my_organization: { Args: never; Returns: string }
      open_visit: {
        Args: {
          assignee_id?: string
          department_id: string
          id: string
          patient_id: string
          priority?: Database["core"]["Enums"]["request_priority"]
          request_id?: string
        }
        Returns: Database["core"]["Tables"]["visits"]["Row"]
        SetofOptions: {
          from: "*"
          to: "visits"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      pharmacy_write_dispense: {
        Args: {
          department_id?: string
          id: string
          items?: Json
          not_done?: boolean
          not_done_reason_text?: string
          occurred_at?: string
          patient_id: string
          replaces_id?: string
          request_id?: string
          responsible_id?: string
          source?: Database["core"]["Enums"]["entry_source"]
          source_key?: string
          stated_author_name?: string
          stated_recorded_at?: string
          text?: string
          visit_id?: string
          written_with_id?: string
        }
        Returns: Database["core"]["Tables"]["entries"]["Row"]
        SetofOptions: {
          from: "*"
          to: "entries"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      read_codes: {
        Args: { limit?: number; organization_id: string; query?: string }
        Returns: Json
      }
      read_entries: {
        Args: {
          before_at?: string
          before_id?: string
          between_visits?: boolean
          department_ids?: string[]
          limit?: number
          patient_id: string
          types?: string[]
          visit_ids?: string[]
        }
        Returns: Json
      }
      read_entry: { Args: { entry_id: string }; Returns: Json }
      read_entry_file: {
        Args: { entry_id: string; file_position: number }
        Returns: string
      }
      read_opened_anyway: {
        Args: { organization_id: string; since?: string }
        Returns: Json
      }
      read_organization: { Args: { organization_id: string }; Returns: Json }
      read_patient: { Args: { patient_id: string }; Returns: Json }
      read_patients: {
        Args: {
          born_on?: string
          organization_id: string
          phone_text?: string
          query: string
        }
        Returns: Json
      }
      read_queue: { Args: { department_id: string }; Returns: Json }
      read_ranges: { Args: { organization_id: string }; Returns: Json }
      read_record: {
        Args: {
          department_id: string
          open_visit_id?: string
          patient_id: string
          reason?: string
        }
        Returns: Json
      }
      read_record_reads: {
        Args: { limit?: number; patient_id: string }
        Returns: Json
      }
      read_reply_types: { Args: { organization_id: string }; Returns: Json }
      read_results_table: {
        Args: { limit?: number; patient_id: string }
        Returns: Json
      }
      read_sent_outside: {
        Args: { department_id?: string; organization_id: string }
        Returns: Json
      }
      read_settings_changes: {
        Args: {
          limit?: number
          organization_id: string
          row_id?: string
          table_name?: string
        }
        Returns: Json
      }
      read_to_review: { Args: { department_id?: string }; Returns: Json }
      read_values: {
        Args: { codes: string[]; limit?: number; patient_id: string }
        Returns: Json
      }
      read_visit_queue: { Args: { department_id: string }; Returns: Json }
      read_visits: { Args: { patient_id: string }; Returns: Json }
      register_patient: {
        Args: {
          born_on: string
          change_id?: string
          contact_text?: string
          died_on?: string
          family_name: string
          given_name: string
          id: string
          identifiers?: Json
          middle_name?: string
          organization_id: string
          phone_text?: string
          seen_change_id?: string
          sex: Database["core"]["Enums"]["sex"]
        }
        Returns: Database["core"]["Tables"]["patients"]["Row"]
        SetofOptions: {
          from: "*"
          to: "patients"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      retire_department: { Args: { id: string }; Returns: undefined }
      retire_organization_pack: {
        Args: { organization_id: string; pack: string }
        Returns: undefined
      }
      retire_service: { Args: { id: string }; Returns: undefined }
      retire_template: { Args: { id: string }; Returns: undefined }
      retry_pack_calls: {
        Args: { organization_id: string; pack: string }
        Returns: number
      }
      save_department: {
        Args: {
          after_done?: string
          contact_text?: string
          id: string
          is_outside?: boolean
          name: string
          organization_id: string
          patients_wait?: boolean
          private_visits?: boolean
          review_results?: string
          seen_change_id?: string
          serves?: string[]
          site_name?: string
          type: string
        }
        Returns: Database["core"]["Tables"]["departments"]["Row"]
        SetofOptions: {
          from: "*"
          to: "departments"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      save_organization: {
        Args: {
          name?: string
          organization_id: string
          record_view?: string
          time_zone?: string
        }
        Returns: Json
      }
      save_organization_pack: {
        Args: { organization_id: string; pack: string }
        Returns: undefined
      }
      save_service: {
        Args: {
          code: string
          department_id: string
          fields?: Json
          id: string
          name: string
          organization_id: string
          ranges?: Json
          reply_type?: string
          section_name?: string
          seen_change_id?: string
        }
        Returns: Database["core"]["Tables"]["services"]["Row"]
        SetofOptions: {
          from: "*"
          to: "services"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      save_template: {
        Args: {
          department_id?: string
          id: string
          items: Json
          name: string
          organization_id: string
          seen_change_id?: string
        }
        Returns: Database["core"]["Tables"]["templates"]["Row"]
        SetofOptions: {
          from: "*"
          to: "templates"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      save_user: {
        Args: {
          departments?: string[]
          id: string
          kind: Database["core"]["Enums"]["user_kind"]
          name: string
          organization_id: string
          retired_at?: string
          roles?: Json
          seen_change_id?: string
          title?: string
        }
        Returns: Json
      }
      write_allergy: {
        Args: {
          action?: string
          allergy_id?: string
          certainty?: string
          department_id?: string
          id: string
          kind?: string
          occurred_at?: string
          onset_on?: string
          patient_id: string
          reactions_text?: string
          replaces_id?: string
          responsible_id?: string
          severity?: string
          source?: Database["core"]["Enums"]["entry_source"]
          source_key?: string
          stated_author_name?: string
          stated_recorded_at?: string
          substance?: Json
          visit_id?: string
          written_with_id?: string
        }
        Returns: Database["core"]["Tables"]["entries"]["Row"]
        SetofOptions: {
          from: "*"
          to: "entries"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      write_entered_in_error: {
        Args: {
          department_id: string
          id: string
          reason_text: string
          replaces_id: string
        }
        Returns: Database["core"]["Tables"]["entries"]["Row"]
        SetofOptions: {
          from: "*"
          to: "entries"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      write_list_review: {
        Args: {
          department_id?: string
          id: string
          items?: string[]
          list?: Database["core"]["Enums"]["list_kind"]
          occurred_at?: string
          outcome?: string
          patient_id: string
          replaces_id?: string
          responsible_id?: string
          source?: Database["core"]["Enums"]["entry_source"]
          source_key?: string
          stated_author_name?: string
          stated_recorded_at?: string
          visit_id?: string
          written_with_id?: string
        }
        Returns: Database["core"]["Tables"]["entries"]["Row"]
        SetofOptions: {
          from: "*"
          to: "entries"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      write_note: {
        Args: {
          department_id?: string
          fields?: Json
          files?: Json
          id: string
          is_final?: boolean
          kind?: string
          occurred_at?: string
          patient_id: string
          problems?: Json
          replaces_id?: string
          reply_to_id?: string
          responsible_id?: string
          source?: Database["core"]["Enums"]["entry_source"]
          source_key?: string
          stated_author_name?: string
          stated_recorded_at?: string
          text?: string
          visit_id?: string
          written_with_id?: string
        }
        Returns: Database["core"]["Tables"]["entries"]["Row"]
        SetofOptions: {
          from: "*"
          to: "entries"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      write_prescription: {
        Args: {
          action?: string
          department_id?: string
          dose_number?: number
          dose_unit?: string
          drug?: Json
          duration_days?: number
          frequency?: string
          id: string
          instructions_text?: string
          medication_id?: string
          occurred_at?: string
          patient_id: string
          prn?: boolean
          prn_reason_text?: string
          problems?: Json
          quantity?: number
          repeats?: number
          replaces_id?: string
          responsible_id?: string
          route?: string
          source?: Database["core"]["Enums"]["entry_source"]
          source_key?: string
          stated_author_name?: string
          stated_recorded_at?: string
          stop_reason_text?: string
          visit_id?: string
          written_with_id?: string
        }
        Returns: Database["core"]["Tables"]["entries"]["Row"]
        SetofOptions: {
          from: "*"
          to: "entries"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      write_problem: {
        Args: {
          action?: string
          certainty?: string
          code?: string
          department_id?: string
          id: string
          name?: string
          occurred_at?: string
          onset_on?: string
          patient_id: string
          problem_id?: string
          replaces_id?: string
          resolved_on?: string
          responsible_id?: string
          source?: Database["core"]["Enums"]["entry_source"]
          source_key?: string
          stated_author_name?: string
          stated_recorded_at?: string
          status?: string
          text?: string
          visit_id?: string
          written_with_id?: string
        }
        Returns: Database["core"]["Tables"]["entries"]["Row"]
        SetofOptions: {
          from: "*"
          to: "entries"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      write_request: {
        Args: {
          department_id?: string
          due_at?: string
          id: string
          occurred_at?: string
          patient_id: string
          priority?: Database["core"]["Enums"]["request_priority"]
          problems?: Json
          question_text?: string
          replaces_id?: string
          responsible_id?: string
          service_id?: string
          source?: Database["core"]["Enums"]["entry_source"]
          source_key?: string
          stated_author_name?: string
          stated_recorded_at?: string
          to_department_id?: string
          visit_id?: string
          written_with_id?: string
        }
        Returns: Database["core"]["Tables"]["entries"]["Row"]
        SetofOptions: {
          from: "*"
          to: "entries"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      write_result: {
        Args: {
          department_id?: string
          files?: Json
          id: string
          is_final?: boolean
          needs_review?: boolean
          not_done?: boolean
          not_done_reason_text?: string
          occurred_at?: string
          patient_id: string
          replaces_id?: string
          request_id?: string
          responsible_id?: string
          source?: Database["core"]["Enums"]["entry_source"]
          source_key?: string
          stated_author_name?: string
          stated_recorded_at?: string
          text?: string
          values?: Json
          visit_id?: string
          written_with_id?: string
        }
        Returns: Database["core"]["Tables"]["entries"]["Row"]
        SetofOptions: {
          from: "*"
          to: "entries"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      write_set: {
        Args: { department_id: string; items: Json }
        Returns: Database["core"]["Tables"]["entries"]["Row"][]
        SetofOptions: {
          from: "*"
          to: "entries"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      write_vitals: {
        Args: {
          department_id?: string
          diastolic?: number
          height?: number
          id: string
          occurred_at?: string
          patient_id: string
          pulse?: number
          replaces_id?: string
          respiratory_rate?: number
          responsible_id?: string
          source?: Database["core"]["Enums"]["entry_source"]
          source_key?: string
          spo2?: number
          stated_author_name?: string
          stated_recorded_at?: string
          systolic?: number
          temperature?: number
          visit_id?: string
          weight?: number
          written_with_id?: string
        }
        Returns: Database["core"]["Tables"]["entries"]["Row"]
        SetofOptions: {
          from: "*"
          to: "entries"
          isOneToOne: true
          isSetofReturn: false
        }
      }
    }
    Enums: {
      [_ in never]: never
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
  core: {
    Enums: {
      entry_source: ["staff", "patient", "machine", "outside", "import"],
      list_kind: ["medications", "problems", "allergies"],
      request_priority: ["stat", "urgent", "routine"],
      request_status: ["open", "done", "cancelled"],
      request_step: [
        "sent",
        "held",
        "started",
        "replied",
        "done",
        "cancelled",
        "reopened",
        "prepared",
      ],
      sex: ["female", "male", "other"],
      user_kind: ["staff", "machine", "pack", "patient", "proxy", "importer"],
      value_flag: ["normal", "low", "high", "abnormal", "critical"],
      visit_status: [
        "waiting",
        "in_consult",
        "pending",
        "done",
        "left",
        "lapsed",
        "cancelled",
      ],
    },
  },
  public: {
    Enums: {},
  },
} as const

