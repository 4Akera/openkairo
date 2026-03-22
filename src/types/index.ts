// ============================================================
// Roles & Permissions
// ============================================================

export const PERMISSIONS = [
  'encounter.create',
  'encounter.close',
  'encounter.view_all',
  'block.add',
  'block.delete',
  'patient.create',
  'patient.edit_record',
  'patient.view_all',
  'admin.manage_users',
  'admin.manage_roles',
  'admin.manage_blocks',
  'admin.manage_templates',
  'template.create',
] as const

export type Permission = (typeof PERMISSIONS)[number]

export const PERMISSION_LABELS: Record<Permission, { label: string; category: string }> = {
  'encounter.create':    { label: 'Create encounters',        category: 'Encounters' },
  'encounter.close':     { label: 'Close / discharge',        category: 'Encounters' },
  'encounter.view_all':  { label: 'View all encounters',      category: 'Encounters' },
  'block.add':           { label: 'Add blocks to timeline',   category: 'Blocks' },
  'block.delete':        { label: 'Delete / mask blocks',     category: 'Blocks' },
  'patient.create':      { label: 'Register new patients',    category: 'Patients' },
  'patient.edit_record': { label: 'Edit master patient record', category: 'Patients' },
  'patient.view_all':    { label: 'View all patients',        category: 'Patients' },
  'admin.manage_users':      { label: 'Manage users & role assignments', category: 'Administration' },
  'admin.manage_roles':      { label: 'Create & edit roles',            category: 'Administration' },
  'admin.manage_blocks':     { label: 'Create standard block types',   category: 'Administration' },
  'admin.manage_templates':  { label: 'Create standard templates',     category: 'Administration' },
  'template.create':         { label: 'Create personal templates',      category: 'Templates' },
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
  'first_name', 'last_name', 'date_of_birth',
  'gender', 'phone', 'blood_group', 'photo_url', 'mrn',
])

export interface Patient {
  id: string
  mrn: string
  first_name: string
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
  portal_visible: boolean
  created_by: string | null
  created_at: string
  updated_at: string
  closed_at: string | null
  created_profile?: { full_name: string } | null
}

// ============================================================
// Block Content Types
// ============================================================

export type RosSystemState  = { items: Record<string, boolean>; notes: string }
export type ExamSystemState = { items: Record<string, boolean>; notes: string }

export interface HxPhysicalContent {
  chief_complaint: string
  hpi: string
  ros:  Record<string, RosSystemState>
  exam: Record<string, ExamSystemState>
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
  id: string
  problem: string
  plan: string
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

export type BlockType = 'hx_physical' | 'vitals' | 'note' | 'med_orders' | 'plan' | string
export type BlockState = 'active' | 'masked'

export interface Block {
  id: string
  encounter_id: string
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
  portal_visible: boolean
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
  visible_to_roles: string[]
  // Default privacy applied to blocks when this type is inserted
  default_visible_to_roles: string[]
  default_portal_visible: boolean
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
// UI / Store types
// ============================================================

export interface BlockLock {
  block_id: string
  locked_by: string
  user_email: string
}

export type BlockLockMap = Record<string, BlockLock>
