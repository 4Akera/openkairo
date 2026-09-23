// The shapes the read functions return (spec 04). Hand-written on purpose: jsonb has no generated type.
export type Flag = 'normal' | 'low' | 'high' | 'abnormal' | 'critical'
export type RequestStep = 'sent' | 'held' | 'started' | 'replied' | 'done' | 'cancelled' | 'reopened' | string
export type VisitStatus = 'waiting' | 'in_consult' | 'pending' | 'done' | 'left' | 'lapsed' | 'cancelled'
export type Priority = 'stat' | 'urgent' | 'routine'
export interface Card {
  id: string; type: string; occurred_at: string; recorded_at: string; author_name: string | null; department_name: string | null
  display_line: string; flag: Flag | null; is_final: boolean; source: string; reply_to_id: string | null; replaces_id: string | null
  replaced_by_id: string | null; visit_id: string | null; service_id: string | null
  request?: { step: RequestStep; status: 'open' | 'done' | 'cancelled'; status_reason: string | null; to_department_id: string; to_department_name: string | null
    priority: Priority; due_at: string; reply_line: string | null; reply_flag: Flag | null; replied_at: string | null; review_needed_at: string | null }
}
export interface PatientBanner { id: string; record_number: number; given_name: string; middle_name: string | null; family_name: string; sex: string; born_on: string; age: number; died_on: string | null; merged_into_id: string | null; phone_text: string | null }
export interface Medication { id: string; drug_code: string | null; drug_name: string; dose_number: number | null; dose_unit: string | null; route: string | null; frequency: string | null; prn: boolean; problem_id: string | null; status: string; started_on: string; instructions_text?: string | null }
export interface Problem { id: string; code: string | null; name: string; status: string; onset_on: string | null; note_text: string | null; certainty: 'confirmed' | 'suspected' }
export interface Allergy { id: string; substance_name: string; class_code: string | null; kind: string; reactions_text: string | null; severity: string | null; status: string; certainty?: string | null }
export interface ListReview { list: string; reviewed_at: string; reviewed_by_id: string }
export interface Value { code: string; name: string; value_number?: number; value_text?: string; unit?: string; flag?: Flag | null; reference_low?: number; reference_high?: number }
export interface RecordView { patient: PatientBanner; visit: VisitRow | null; allergies: Allergy[]; allergy_review: ListReview | null; problems: Problem[]; problem_review: ListReview | null
  medications: Medication[]; medication_review: ListReview | null; open_requests: Card[]; entries: Card[]; latest_vitals: Value[] | null }
export interface VisitRow { id: string; patient_id: string; department_id: string; request_id: string | null; assignee_id: string | null; status: VisitStatus; priority: Priority; is_first: boolean; arrived_at: string; present_at: string | null; seen_at: string | null; ended_at: string | null }
export interface QueueRow { id: string; patient: { id: string; record_number: number; given_name: string; family_name: string; sex: string; age: number; has_allergies: boolean }
  status: VisitStatus; band: 'back' | 'waiting' | 'pending' | 'consult'; priority: Priority; is_first: boolean; assignee_id: string | null; assignee_name: string | null
  arrived_at: string; present_at: string | null; seen_at: string | null; request_id: string | null; request_open: boolean
  requests: { request_id: string; service_name: string | null; to_department_name: string | null; step: RequestStep; is_holding: boolean }[] }
export interface VisitQueue { rows: QueueRow[]; done_today: number; away: number }
export interface RequestQueueRow extends Card { patient: { id: string; record_number: number; given_name: string; family_name: string; sex: string; born_on: string }; from_department_name: string | null; requester_name: string | null; question_text: string | null; section_name: string | null; service_name: string | null; reply_type: string | null; assignee_id: string | null }
export interface RequestQueue { requests: RequestQueueRow[]; done_today: number }
export interface PatientHit extends PatientBanner { identifiers: { system: string; value: string }[]; latest_change_id: string | null
  open_visits: { id: string; department_id: string; department_name: string; status: VisitStatus; present: boolean; arrived_at: string; assignee_id: string | null }[]
  open_consults: { request_id: string; to_department_id: string; question_text: string | null }[] }
export interface Department { id: string; name: string; type: string; is_visited: boolean; is_outside?: boolean; site_name: string | null; serves?: (string | null)[] }
export interface Service { id: string; department_id: string | null; section_name: string | null; code: string; name: string; reply_type: string; fields: ServiceField[] }
export interface ServiceField { position: number; code: string; name: string; kind: string; unit: string | null; choices: string[] | null; reference_low: number | null; reference_high: number | null; critical_low: number | null; critical_high: number | null }
export interface Template { id: string; department_id: string | null; name: string; items: { service_id: string }[] }
export interface Organization { organization: { id: string; name: string }; me: { id: string; name: string; kind: string; departments: Department[]; actions: string[] }
  departments: Department[]; services: Service[]; templates: Template[]; packs: { key: string; name: string; enabled: boolean }[]
  users: { id: string; name: string; kind: string; title: string | null; retired_at: string | null; accepted_at: string | null; roles: { role_id: string; role_key: string; department_id: string | null }[] }[]
  roles: { id: string; key: string; name: string; is_builtin: boolean; actions: string[] }[]; parked_pack_calls: number }
export interface Entry extends Card { data: Record<string, unknown>; patient_id: string; patient: { id: string; record_number: number; given_name: string; family_name: string; sex: string; age: number } | null
  replies: (Card & { data: Record<string, unknown> })[]; files: { position: number; name: string; mime: string }[]; steps: { step: string; recorded_at: string; reason: string | null; position: number }[]; versions: Card[] }
