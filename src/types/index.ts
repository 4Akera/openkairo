// ============================================================
// Roles & Permissions
// ============================================================

export const PERMISSIONS = [
  'block.add',
  'admin.manage_users',
  'admin.manage_blocks',
  'admin.manage_templates',
  'template.create',
  'billing.charge',
  'billing.payment',
  'billing.manage_fees',
] as const

export type Permission = (typeof PERMISSIONS)[number]

export const PERMISSION_LABELS: Record<Permission, { label: string; category: string }> = {
  'block.add':               { label: 'Add blocks to timeline',            category: 'Blocks' },
  'admin.manage_users':      { label: 'Manage users & role assignments',   category: 'Administration' },
  'admin.manage_blocks':     { label: 'Create & edit block types',         category: 'Administration' },
  'admin.manage_templates':  { label: 'Create & edit standard templates',  category: 'Administration' },
  'template.create':         { label: 'Create personal templates',         category: 'Templates' },
  'billing.charge':          { label: 'Add and void charges',              category: 'Billing' },
  'billing.payment':         { label: 'Record payments and deposits',      category: 'Billing' },
  'billing.manage_fees':     { label: 'Manage service item catalog',       category: 'Billing' },
}

export interface Role {
  id: string
  name: string
  slug: string
  description: string | null
  permissions: Permission[]
  is_system: boolean
  sort_order: number
  created_at: string
  updated_at: string
}

export interface UserWithRoles {
  id: string
  full_name: string
  email: string
  created_at: string
  role_ids: string[]
  role_slugs: string[]
  role_names: string[]
}

// ============================================================
// Core Domain Types
// ============================================================

export interface Profile {
  id: string
  full_name: string
  role: string
  preferred_blocks: string[] | null
  pinned_blocks: string[] | null
  encounter_fee: number | null
  created_at: string
  updated_at: string
}

export interface UserBlockTemplate {
  id: string
  user_id: string
  definition_id: string
  name: string
  content: Record<string, unknown>
  is_default: boolean
  sort_order: number
  created_at: string
  updated_at: string
}

// ============================================================
// Patient Field Definitions (admin-controlled demographics schema)
// ============================================================

export interface PatientFieldOption {
  value: string
  label: string
}

export interface PatientFieldDefinition {
  id: string
  label: string
  slug: string
  field_type: 'text' | 'number' | 'date' | 'select' | 'textarea'
  options: PatientFieldOption[]
  is_required: boolean
  is_system: boolean
  sort_order: number
  active: boolean
  created_by: string | null
  created_at: string
}

// Slugs that map to real columns on the patients table (not custom_fields JSONB)
export const PATIENT_REAL_COLUMNS = new Set([
  'first_name', 'middle_name', 'last_name', 'date_of_birth',
  'gender', 'phone', 'blood_group', 'photo_url', 'mrn',
])

export type NameFormat = 'two' | 'three'

export interface Patient {
  id: string
  mrn: string
  first_name: string
  middle_name: string | null
  last_name: string
  date_of_birth: string | null
  date_of_birth_precision: DatePrecision
  gender: string | null
  phone: string | null
  blood_group: string | null
  photo_url: string | null
  custom_fields: Record<string, unknown>
  created_by: string | null
  created_at: string
  updated_at: string
  updated_by?: string | null
}

// ============================================================
// Departments
// ============================================================

export interface Department {
  id: string
  name: string
  slug: string
  description: string | null
  icon: string
  color: string
  can_receive_orders: boolean
  can_create_direct: boolean
  active: boolean
  sort_order: number
  created_by: string | null
  created_at: string
}

export interface DepartmentBlockType {
  id: string
  department_id: string
  name: string
  description: string | null
  order_block_def_id: string | null
  entry_block_def_id: string | null
  built_in_type: string | null
  service_item_id: string | null
  charge_mode: 'auto' | 'confirm'
  active: boolean
  sort_order: number
  created_at: string
}

export interface DepartmentMember {
  id: string
  department_id: string
  user_id: string
  created_at: string
}

export type DatePrecision = 'year' | 'month' | 'full'

export interface Problem {
  id: string
  patient_id: string
  problem: string
  onset_date: string | null
  onset_date_precision: DatePrecision
  status: 'active' | 'resolved'
  ended_date: string | null
  notes: string | null
  importance: 'high' | 'medium' | 'low'
  created_by: string | null
  created_at: string
  updated_at: string
  updated_by: string | null
  created_profile?: { full_name: string } | null
  updated_profile?: { full_name: string } | null
}

export interface ProblemHistory {
  id: string
  problem_id: string
  snapshot: Problem
  changed_by: string | null
  changed_at: string
}

export interface Medication {
  id: string
  patient_id: string
  medication_name: string
  dosage: string | null
  frequency: string | null
  route: string | null
  start_date: string | null
  start_date_precision: DatePrecision
  end_date: string | null
  end_date_precision: DatePrecision
  status: 'active' | 'discontinued'
  prescriber: string | null
  notes: string | null
  created_by: string | null
  created_at: string
  updated_at: string
  updated_by: string | null
  created_profile?: { full_name: string } | null
  updated_profile?: { full_name: string } | null
}

export interface MedicationHistory {
  id: string
  medication_id: string
  snapshot: Medication
  changed_by: string | null
  changed_at: string
}

// Archive category content types
export interface AdmissionContent {
  date_in: string
  date_out?: string
  reason: string
  facility?: string
  notes?: string
}

export interface SurgeryContent {
  date: string
  procedure: string
  facility?: string
  notes?: string
}

export interface FamilyHxContent {
  relation: string
  condition: string
  notes?: string
}

export interface SocialHxContent {
  smoking?: string
  alcohol?: string
  occupation?: string
  notes?: string
}

export interface DocumentContent {
  name: string
  document_type: string
  notes?: string
}

export type ArchiveContent =
  | AdmissionContent
  | SurgeryContent
  | FamilyHxContent
  | SocialHxContent
  | DocumentContent

export type ArchiveCategory = 'visit' | 'family_hx' | 'social_hx' | 'document'

export interface ArchiveEntry {
  id: string
  patient_id: string
  category: ArchiveCategory
  content: ArchiveContent
  storage_path: string | null
  file_name: string | null
  file_size: number | null
  mime_type: string | null
  created_by: string | null
  created_at: string
  updated_at: string
  profiles?: { full_name: string } | null
}

// ============================================================
// Allergy
// ============================================================

export interface Allergy {
  id: string
  patient_id: string
  allergen: string
  reaction: string | null
  severity: 'mild' | 'moderate' | 'severe' | null
  notes: string | null
  created_by: string | null
  updated_by: string | null
  created_at: string
  updated_at: string
  created_profile?: { full_name: string } | null
  updated_profile?: { full_name: string } | null
}

export interface Encounter {
  id: string
  patient_id: string
  title: string | null
  status: 'open' | 'closed'
  visibility: 'staff' | 'restricted' | 'private'
  visible_to_roles: string[]
  assigned_to: string | null
  created_by: string | null
  created_at: string
  updated_at: string
  closed_at: string | null
  created_profile?: { full_name: string } | null
  assigned_profile?: { full_name: string } | null
}

// ============================================================
// Block Content Types
// ============================================================

export type RosItemState  = 'positive' | 'denied'
export type ExamItemState = 'present'  | 'absent'

export type RosSystemState  = { items: Record<string, RosItemState>;  notes: string }
export type ExamSystemState = { items: Record<string, ExamItemState>; notes: string }

export interface HxPhysicalContent {
  chief_complaint: string
  hpi:             string
  ros:             Record<string, RosSystemState>
  ros_notes:       string
  exam:            Record<string, ExamSystemState>
  exam_notes:      string
}

export interface NoteContent {
  body: string
}

export interface MedOrderItem {
  id: string
  name: string
  dose: string
  route: string
  frequency: string
  instructions: string
  status: 'prescribed' | 'held' | 'discontinued'
}

export interface MedOrdersContent {
  items: MedOrderItem[]
  notes: string
}

export interface PlanProblem {
  id:               string
  problem:          string
  plan:             string
  importance:       'high' | 'medium' | 'low' | null
  chart_problem_id: string | null
}

export interface PlanContent {
  assessment: string
  problems: PlanProblem[]
  followup: string
}

export interface VitalsContent {
  bp_systolic:  number | null
  bp_diastolic: number | null
  pulse_rate:   number | null
  resp_rate:    number | null
  temperature:  number | null
  temp_unit:    'C' | 'F'
  spo2:         number | null
  avpu:         'A' | 'V' | 'P' | 'U' | null
  bp_flags:     string[]
  pr_flags:     string[]
  rr_flags:     string[]
  temp_flags:   string[]
  spo2_flags:   string[]
}

// ============================================================
// Lab
// ============================================================

export type LabFlag = 'HH' | 'H' | 'L' | 'LL' | ''

export interface LabResult {
  value:   string
  flag:    LabFlag
  comment: string
}

/** Content stored in the ordering clinician's lab_order block */
export interface LabOrderContent {
  panels:     string[]   // e.g. ['cbc', 'metabolic', 'tft']
  custom:     { name: string; unit: string; ref_low: string; ref_high: string }[]
  indication: string
  urgency:    'routine' | 'urgent' | 'stat' | ''
  specimen:   string
}

/** Content stored in the lab technician's lab_result block */
export type LabResultStatus = 'collected' | 'processing' | 'resulted' | 'verified'

export interface LabResultContent {
  panels:         string[]   // panels to report on (pre-populated from the order)
  custom_defs:    { name: string; unit: string; ref_low: string; ref_high: string }[]
  results:        Record<string, LabResult>  // key = "panelId.testId"
  custom_results: LabResult[]
  notes:          string
  status:         LabResultStatus
  reported_at:    string | null
}

export type BlockType = 'hx_physical' | 'vitals' | 'note' | 'med_orders' | 'plan' | 'lab_order' | 'lab_result' | 'nurse_note' | 'consultation' | 'dc_note' | 'meds' | string
export type BlockState = 'active' | 'masked'

// ============================================================
// Nurse Note
// ============================================================

export interface NurseNoteEntry {
  id:        string
  timestamp: string
  text:      string
  author?:   string
}

export interface NurseNoteContent {
  entries: NurseNoteEntry[]
}

// ============================================================
// Consultation
// ============================================================

export interface ConsultationContent {
  service:          string
  urgency:          'routine' | 'urgent' | 'stat' | ''
  reason:           string
  clinical_summary: string
  question:         string
  status:           'requested' | 'acknowledged' | 'answered'
  answer:           string
  answered_by:      string
  answered_at:      string | null
}

// ============================================================
// Discharge Note
// ============================================================

export interface DCNoteContent {
  diagnoses:        { text: string; primary: boolean }[]
  admission_reason: string
  hospital_course:  string
  condition:        'improved' | 'stable' | 'critical' | 'deceased' | ''
  discharge_meds:   { name: string; dose: string; route: string; freq: string; notes: string }[]
  instructions:     string
  followup:         string
  pending:          string
}

// ============================================================
// Medications
// ============================================================

export type MedStatus = 'active' | 'held' | 'discontinued'

export interface MedItem {
  id:         string
  name:       string
  dose:       string
  route:      string
  freq:       string
  duration:   string
  indication: string
  status:     MedStatus
}

export interface MedsContent {
  meds: MedItem[]
}

export interface Block {
  id: string
  encounter_id: string | null
  department_id: string | null
  department_block_type_id: string | null
  patient_id: string | null
  type: BlockType
  content: HxPhysicalContent | VitalsContent | NoteContent | MedOrdersContent | PlanContent | Record<string, unknown>
  state: BlockState
  sequence_order: number
  supersedes_block_id: string | null
  locked_by: string | null
  locked_at: string | null
  author_name: string | null
  definition_id: string | null
  is_template_seed: boolean
  is_pinned: boolean
  visible_to_roles: string[]
  share_to_record: boolean
  created_by: string | null
  created_at: string
  updated_at: string
}

// ============================================================
// Block Definition System
// ============================================================

export type FieldType =
  | 'text'
  | 'textarea'
  | 'number'
  | 'select'
  | 'multiselect'
  | 'checkbox'
  | 'date'
  | 'datetime'
  | 'section_header'

export interface FieldOption {
  value: string
  label: string
}

export interface FieldShowIf {
  field: string
  operator: 'eq' | 'neq' | 'gt' | 'lt'
  value: string | number | boolean
}

export interface FieldDef {
  id: string
  label: string
  type: FieldType
  required?: boolean
  placeholder?: string
  options?: FieldOption[]
  unit?: string        // for number fields
  min?: number
  max?: number
  rows?: number        // for textarea
  show_if?: FieldShowIf
}

export interface ScoreInterpretation {
  min: number
  max: number
  label: string
  color: string
}

export interface BlockDefinitionConfig {
  dept_role?: 'order' | 'result'  // 'order' = doctor places it; ActionPanel renders; 'result' = dept fills via department portal
  score?: {
    label: string
    fields: string[]
    interpretation?: ScoreInterpretation[]
  }
  state_changes?: {
    encounter?: string[]
    patient?: string[]
  }
  action?: {
    event: string
    module: string
  }
  expiry?: {
    hours: number
    label: string
  }
  fn?: {
    endpoint: string
    method: 'GET' | 'POST'
  }
}

export interface BlockDefinition {
  id: string
  name: string
  slug: string
  icon: string
  color: string
  description: string | null
  // Capabilities
  cap_media: boolean
  cap_time_series: boolean
  cap_immutable: boolean
  cap_co_sign: boolean
  cap_required: boolean
  // Field schemas
  fields: FieldDef[]
  time_series_fields: FieldDef[]
  config: BlockDefinitionConfig
  // Metadata
  is_builtin: boolean
  is_universal: boolean
  is_dept_only: boolean
  visible_to_roles: string[]
  default_visible_to_roles: string[]
  // Billing
  service_item_id: string | null
  charge_mode: 'auto' | 'confirm' | null
  active: boolean
  sort_order: number
  created_by: string | null
  created_at: string
}

// ============================================================
// Encounter Templates
// ============================================================

export interface TemplateBlock {
  slug: string
  definition_id?: string
  pin: boolean
  sort_order: number
}

export interface EncounterTemplate {
  id: string
  name: string
  description: string | null
  is_universal: boolean
  visible_to_roles: string[]
  blocks: TemplateBlock[]
  // Default privacy for encounters created from this template
  default_visibility: 'staff' | 'restricted' | 'private'
  default_visible_to_roles: string[]
  created_by: string | null
  created_at: string
  updated_at: string
}

// ============================================================
// Capability Table Types
// ============================================================

export interface BlockEntry {
  id: string
  block_id: string
  data: Record<string, unknown>
  recorded_at: string
  author_name: string | null
  created_by: string | null
  created_at: string
}

export interface BlockAttachment {
  id: string
  block_id: string
  storage_path: string
  file_name: string
  mime_type: string
  file_size: number | null
  caption: string | null
  uploaded_by: string | null
  created_at: string
}

export type BlockActionStatus =
  | 'pending'
  | 'submitted'
  | 'acknowledged'
  | 'in_progress'
  | 'completed'
  | 'cancelled'

export interface BlockAction {
  id: string
  block_id: string
  encounter_id: string
  patient_id: string
  action_type: string
  action_payload: Record<string, unknown>
  status: BlockActionStatus
  result_block_id: string | null
  result_data: Record<string, unknown> | null
  triggered_by: string | null
  triggered_at: string
  completed_at: string | null
}

export interface BlockAcknowledgment {
  id: string
  block_id: string
  acked_by: string
  acker_name: string | null
  acked_at: string
}

// ============================================================
// Billing
// ============================================================

export interface ServiceItem {
  id: string
  code: string
  name: string
  category: string | null
  default_price: number
  active: boolean
  sort_order: number
  created_by: string | null
  created_at: string
}

export type ChargeStatus = 'pending' | 'pending_approval' | 'pending_insurance' | 'invoiced' | 'paid' | 'waived' | 'void'
export type ChargeSource = 'manual' | 'block_auto' | 'encounter_close' | 'department'

export interface Charge {
  id: string
  patient_id: string
  encounter_id: string | null
  block_id: string | null
  service_item_id: string | null
  invoice_id: string | null
  description: string
  quantity: number
  unit_price: number
  status: ChargeStatus
  voided_reason: string | null
  source: ChargeSource
  created_by: string | null
  created_at: string
}

export interface Payment {
  id: string
  patient_id: string
  invoice_id: string | null
  amount: number
  method: 'cash' | 'card' | 'mobile_money' | 'insurance' | 'bank_transfer' | 'deposit'
  reference: string | null
  payer_name: string | null
  notes: string | null
  received_by: string | null
  created_at: string
}

export interface PatientDeposit {
  id: string
  patient_id: string
  amount: number
  remaining: number
  method: string | null
  reference: string | null
  notes: string | null
  received_by: string | null
  created_at: string
}

export interface Invoice {
  id: string
  patient_id: string
  invoice_number: string
  subtotal: number
  discount: number
  total: number
  status: 'draft' | 'issued' | 'partial' | 'paid' | 'overdue' | 'cancelled'
  issued_at: string | null
  due_date: string | null
  notes: string | null
  created_by: string | null
  created_at: string
}

export interface PatientInsurance {
  id: string
  patient_id: string
  payer_name: string
  policy_number: string | null
  copay_percent: number | null
  coverage_limit: number | null
  is_active: boolean
  valid_from: string | null
  valid_to: string | null
  created_at: string
  updated_at: string
}

export interface PatientBalance {
  patient_id: string
  total_charges: number
  total_payments: number
  deposit_balance: number
  balance: number
}

// ============================================================
// UI / Store types
// ============================================================

export interface BlockLock {
  block_id: string
  locked_by: string
  user_email: string
}

export type BlockLockMap = Record<string, BlockLock>
