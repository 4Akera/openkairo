// Two kinds of shape. The server's: what read() returns (spec/openCare.md §3.10) — entries, derived rows, identities, the
// directory. The screens': view models built from those in views.ts, under the names the screens already use.
// Hand-written on purpose: every read returns jsonb, which has no generated type. An entry's data is typed by its shape where a
// view model keeps it (shapes.generated.ts; views.ts dataOf).
import type { EntryData, SettingData } from './shapes.generated'

// ── the server's shapes ──
export interface ServerEntry {
  id: string; type: string; type_version: number; item: string; item_version: number; patient_id: string; department_id: string; visit_id: string | null
  occurred_at: string; precision: string; recorded_at: string; set_id: string; replaces: string | null; refers_to: string | null; relation: 'answers' | 'changes' | 'about' | null
  source: string; hidden: boolean; redacted?: boolean; line: string
  data?: Record<string, unknown>; author_id?: string; codes?: string[]; findings?: { code: string; level: string; detail?: string; confirmed?: boolean; late?: boolean }[]
}
export interface Identity {
  id: string; number: number; given: string[]; family: string | null; full_name: string; latin: string | null; gender: 'male' | 'female' | 'other' | 'unknown'
  birth_date: string | null; birth_precision: 'year' | 'month' | 'day'; birth_estimated: boolean; anonymous: boolean
  telecom: { system: string; value: string }[]; address: Record<string, string> | null; merged_into: string | null; identifiers: { system: string; value: string; verified: boolean }[]
}
export interface TableRead<R> { rows: R[]; entries: Record<string, ServerEntry>; patients: Record<string, Identity>; withheld: number }
export interface PresenceRow {
  item: string; patient_id: string; kind: 'visit' | 'stay'; department_id: string; from_department_id: string | null; place_id: string | null
  state: 'waiting' | 'called' | 'with' | 'pending' | 'back' | 'done' | 'left' | 'admitted' | 'discharged'; here: boolean; away_since: string | null; urgent: boolean
  assigned_id: string | null; calls: number; missed: number; checked_in_at: string; called_at: string | null; called_by: string | null; seen_at: string | null; seen_by: string | null
  done_at: string | null; ended_at: string | null; wait: boolean | null; orders: number; orders_out: number; has_vitals: boolean; reason: string | null; came_from: string | null
  for_order: string | null; last_at: string; day: string; latest_entry: string; version: number; source_entries: string[]
}
export interface OrderRow {
  item: string; patient_id: string; visit_id: string | null; requester_id: string; from_department_id: string; to_department_id: string | null; service_id: string | null
  service_code: string | null; service_name: string | null; priority: 'routine' | 'urgent' | 'asap' | 'stat'; status: string; step: string | null; step_key: string | null; step_item: string | null; step_entry: string | null
  answers: string[]; answered_at: string | null; final: boolean; about_item: string | null; ordered_at: string; last_at: string; day: string; latest_entry: string; version: number; source_entries: string[]
}
export interface ReviewRow { item: string; patient_id: string; why: string; level: string | null; critical: boolean; for_user: string | null; for_department: string | null; order_item: string | null; visit_id: string | null; entry_id: string; at: string; source_entries: string[] }
export interface ListRowData { item: string; patient_id: string; list: 'problems' | 'diagnoses' | 'medications' | 'allergies' | 'reviews'; status: string; code: string | null; entry_id: string; first_at: string; changed_at: string; visit_id: string | null; source_entries: string[] }
export interface ValueRow { id: string; item: string; key: string; patient_id: string; code: string | null; name: string | null; value: number; ucum: string | null; unit: string | null; interpretation: string | null; at: string; entry_id: string; visit_id: string | null; source_entries: string[] }
export interface DeceasedRow { item: string; patient_id: string; at: string; precision: string; entry_id: string }
export interface ServerRecord {
  patient: Identity; family: string[]; entries: ServerEntry[]; hidden: { department_id: string; items: number }[]; more: boolean
  tables: { 'base.presence'?: TableRead<PresenceRow>; 'base.orders'?: TableRead<OrderRow>; 'base.review'?: TableRead<ReviewRow>; 'base.lists'?: TableRead<ListRowData>; 'base.values'?: TableRead<ValueRow>; 'base.deceased'?: TableRead<DeceasedRow> }
}
export interface SettingRow { key: string; thing_id: string; owner_id: string | null; data: Record<string, unknown>; recorded_at: string; author_id?: string | null }
/** a JSON schema as declared (the subset the shapes use) */
export type Schema = { [k: string]: unknown }
/** one field of a setting's form, in order: its path through the shape (rows.dose), its words, its unit, its choices' words (§5.1 rule 7) */
export interface FieldDecl { key: string; labels: Record<string, string>; help?: Record<string, string>; unit?: string; choices?: Record<string, Record<string, string>> }
/** a declared setting key, with what its automatic form needs; form: where it shows (the pack's page, the department's card), or null */
export interface SettingKey { key: string; layer: string; owner_kind: 'organization' | 'department' | 'place'; many: boolean; labels: Record<string, string>
  shape: Schema; fields: FieldDecl[]; form: 'pack' | 'department' | null }
export interface ServerMe {
  // may: what I may do in each department ('' for held everywhere), as the server's may answers it: a pack's actions only where it is used
  me: { id: string; name: string; title: string | null; kind: string; organization_id: string; holdings: { department_id: string | null; role_id: string; actions: string[] }[]
    may: Record<string, string[]> }
  users_of_login: { id: string; organization_id: string; organization: string; name: string }[]
  organization: { id: string; name: string; time_zone: string; packs_used: string[] }
  sites: { id: string; name: string; retired_at: string | null }[]
  // packs: the packs it uses (ticked and on); screens, opens: its Screens line, or the base's screens of its work until one is set
  departments: { id: string; name: string; work: 'desk' | 'visits' | 'stays' | 'bench' | 'outside'; site_id: string | null; position: number; retired_at: string | null
    packs: string[]; screens: string[]; opens?: string }[]
  places: { id: string; department_id: string; parent_id: string | null; label: string; name: string; position: number; retired_at: string | null }[]
  users: { id: string; name: string; title: string | null; kind: string; retired_at: string | null; signed_in_at: string | null; has_login: boolean }[]
  holdings: { id: string; user_id: string; role_id: string; department_id: string | null }[]
  // built_on: the base role it holds everything of; everyday: holds a pack's everyday actions where a department uses the pack; own: its own actions
  roles: { id: string; key: string; name: string; layer: string | null; builtin: boolean; retired_at: string | null; every_action: boolean; actions: string[]
    built_on: string | null; everyday: boolean; own: string[] }[]
  actions: { key: string; layer: string; scope: string; everyday: boolean; labels: Record<string, string> }[]
  settings: SettingRow[]
  registry: { types: { key: string; version: number; layer: string; base_type: string | null; in_record: boolean; may_be_private: boolean; labels: Record<string, string> }[]
    // action: what a user needs here to see its tab (null: anyone working there); replaces: the base screens a pack's stands in for
    screens: { key: string; layer: string; work: string; action: string | null; replaces: string[]; labels: Record<string, string> }[]
    packs: { key: string; version: number; requires: string[]; labels: Record<string, string>; used: boolean; stale: number }[]
    setting_keys: SettingKey[]; datatypes: Record<string, Schema> }
}

// ── the screens' view models (built in views.ts) ──
export type Flag = 'normal' | 'low' | 'high' | 'abnormal' | 'critical'
export type RequestStep = string
export type VisitStatus = 'waiting' | 'in_consult' | 'pending' | 'done' | 'left' | 'lapsed' | 'cancelled' | 'admitted' | 'discharged'   // the last two: a stay's
export type Priority = 'stat' | 'urgent' | 'routine' | 'asap'
/** an entry as a line of the record */
export interface Card {
  id: string; type: string; item: string; item_version: number; occurred_at: string; recorded_at: string; author_id: string | null; author_name: string | null
  department_id: string | null; department_name: string | null; display_line: string; flag: Flag | null; is_final: boolean; source: string
  reply_to_id: string | null; replaces_id: string | null; replaced_by_id: string | null; visit_id: string | null; service_id: string | null; is_hidden?: boolean
  redacted?: boolean; findings?: ServerEntry['findings']; data?: Record<string, unknown>; patient_id?: string
  request?: { step: RequestStep; status: 'open' | 'done' | 'cancelled'; status_reason: string | null; to_department_id: string; to_department_name: string | null
    priority: Priority; due_at: string; reply_line: string | null; reply_flag: Flag | null; replied_at: string | null; review_needed_at: string | null; review_reason?: string | null; order?: OrderRow }
}
export interface PatientBanner { id: string; record_number: number; given_name: string; middle_name: string | null; family_name: string; sex: string; born_on: string; age: number; died_on: string | null; merged_into_id: string | null; phone_text: string | null }
export interface Medication { id: string; entry_id?: string; version?: number; drug_code: string | null; drug_name: string; dose_number: number | null; dose_unit: string | null; route: string | null; frequency: string | null; prn: boolean; prn_reason_text?: string | null; problem_id: string | null; status: string; started_on: string; instructions_text?: string | null; basis?: string; duration_days?: number | null; data?: EntryData['medication'] }
export interface Problem { id: string; entry_id?: string; version?: number; code: string | null; name: string; status: string; onset_on: string | null; note_text: string | null; certainty: 'confirmed' | 'suspected'; data?: EntryData['problem'] }
export interface Allergy { id: string; entry_id?: string; version?: number; substance_name: string; class_code: string | null; kind: string; reactions_text: string | null; severity: string | null; status: string; certainty?: string | null; data?: EntryData['allergy'] }
export interface ListReview { list: string; reviewed_at: string; reviewed_by_id: string; outcome: string }
export interface Value { code: string; name: string; value_number?: number; value_text?: string; unit?: string; flag?: Flag | null; reference_low?: number; reference_high?: number }
export interface VisitRow {
  id: string; patient_id: string; department_id: string; request_id: string | null; assignee_id: string | null; status: VisitStatus; priority: Priority; is_first: boolean
  arrived_at: string; present_at: string | null; seen_at: string | null; ended_at: string | null; called_at?: string | null; missed_calls?: number
  kind: 'visit' | 'stay'; place_id: string | null; latest_entry: string; version: number; wait: boolean | null; presence: PresenceRow
}
export interface RecordView {
  patient: PatientBanner; identity: Identity; visit: VisitRow | null; hidden_departments: { department_id: string; department_name: string; notes: number }[]
  allergies: Allergy[]; allergy_review: ListReview | null; problems: Problem[]; problem_review: ListReview | null; medications: Medication[]; medication_review: ListReview | null
  open_requests: Card[]; entries: Card[]; latest_vitals: Value[] | null; visits: VisitRow[]; values: ValueRow[]; orders: OrderRow[]; reviews: ReviewRow[]; server: ServerRecord
}
export interface RecordRead { read_at: string; user_name: string; user_kind: string; department_name: string | null; basis: string | null; reason_text: string | null; opened_department: string | null; purpose: string }
export interface QueueRow {
  id: string; patient: { id: string; record_number: number; given_name: string; family_name: string; sex: string; age: number; has_allergies: boolean }
  status: VisitStatus; band: 'back' | 'waiting' | 'pending' | 'consult'; priority: Priority; is_first: boolean; assignee_id: string | null; assignee_name: string | null
  arrived_at: string; present_at: string | null; seen_at: string | null; request_id: string | null; request_open: boolean
  called_at: string | null; missed_calls: number; has_vitals: boolean; present: boolean
  requests: { request_id: string; service_name: string | null; to_department_name: string | null; step: RequestStep; is_holding: boolean; type: string; replied: boolean }[]
  visit: VisitRow
}
export interface VisitQueue { rows: QueueRow[]; done_today: number; away: number }
export interface RequestQueueRow extends Card {
  patient: { id: string; record_number: number; given_name: string; family_name: string; sex: string; born_on: string; here?: boolean }
  from_department_name: string | null; requester_name: string | null; question_text: string | null; section_name: string | null; service_name: string | null; reply_type: string | null
  assignee_id: string | null; details?: Record<string, unknown> | null; order: OrderRow
}
export interface RecentRow extends RequestQueueRow { reply: { id: string; item: string; version: number; data: Record<string, unknown>; author_name: string | null; recorded_at: string; is_final: boolean } | null }
export interface RequestQueue { requests: RequestQueueRow[]; recent: RecentRow[]; done_today: number }
export interface FieldRange { gender: 'female' | 'male' | null; age_low: number | null; age_high: number | null; low: number | null; high: number | null; critical_low: number | null; critical_high: number | null }
export interface PatientHit extends PatientBanner {
  identifiers: { system: string; value: string }[]; identity: Identity
  open_visits: { id: string; department_id: string; department_name: string; status: VisitStatus; present: boolean; arrived_at: string; assignee_id: string | null; row: PresenceRow }[]
}
export interface Department {
  id: string; name: string; type: string; work: 'desk' | 'visits' | 'stays' | 'bench' | 'outside'; is_visited: boolean; is_outside?: boolean; site_id: string | null; site_name: string | null; position: number
  serves: (string | null)[]; checks_in_for: (string | null)[]; patients_wait: boolean; review_results: 'critical' | 'abnormal' | 'all'; is_private: boolean; after_done: 'next' | 'queue'
  pack_cards: boolean; screens: string[]; opens: string | null; encounter_class: SettingData['department.encounter_class']['class'] | null
  packs: string[]   // the packs it uses: ticked here and on for the clinic (§5.1 rule 1)
}
export interface ServiceField { position: number; key: string; code: string; name: string; kind: 'number' | 'text' | 'choice'; unit: string | null; ucum: string | null; choices: string[] | null
  reference_low: number | null; reference_high: number | null; critical_low: number | null; critical_high: number | null; ranges: FieldRange[] }
export interface Service { id: string; department_id: string | null; section_name: string | null; code: string; name: string; reply_type: string; coding: { system: string; code: string } | null; fields: ServiceField[]
  steps: string[] }   // its steps in order, as keys (collected, received)
export interface Template { id: string; department_id: string | null; name: string; items: { service_id: string }[]; shortcut: string | null; lines: string[] }
export interface Place { id: string; department_id: string; parent_id: string | null; label: string; name: string; position: number; closed: boolean; closed_reason: string | null }
export interface Organization {
  organization: { id: string; name: string; time_zone: string; record_view: 'visits' | 'entries' }
  me: { id: string; name: string; kind: string; departments: Department[]; actions: string[]; works_in: string[]; holdings: ServerMe['me']['holdings']; may: ServerMe['me']['may'] }
  departments: Department[]; allDepartments: Department[]; services: Service[]; templates: Template[]; places: Place[]; sites: ServerMe['sites']
  packs: { key: string; name: string; enabled: boolean; stale: number }[]
  users: { id: string; name: string; kind: string; title: string | null; retired_at: string | null; accepted_at: string | null; has_login: boolean; roles: { role_id: string; role_key: string; department_id: string | null }[] }[]
  roles: { id: string; key: string; name: string; is_builtin: boolean; actions: string[]; every_action: boolean; built_on: string | null; everyday: boolean; own: string[] }[]
  actions: { key: string; layer: string; label: string; everyday: boolean }[]; types: ServerMe['registry']['types']; screens: ServerMe['registry']['screens']
  parked_pack_calls: number; loginUsers: ServerMe['users_of_login']
  // every setting as it stands (with who changed it last), the declared keys with their forms, and the datatypes their shapes name
  settings: SettingRow[]; settingKeys: SettingKey[]; datatypes: Record<string, Schema>
}
/** an entry in full: every version of its item, and what refers to it */
export interface Entry extends Card {
  data: Record<string, unknown>; patient_id: string; is_private?: boolean; is_note?: boolean; can_mark_private?: boolean
  patient: { id: string; record_number: number; given_name: string; family_name: string; sex: string; age: number } | null
  replies: (Card & { data: Record<string, unknown> })[]; files: { position: number; name: string; mime: string }[]; steps: { step: string; recorded_at: string; reason: string | null; position: number }[]
  versions: (Card & { data?: Record<string, unknown> })[]; related: Card[]
}
