-- ============================================================
-- EHR MVP — Master Database Schema
-- Run ONCE on a fresh Supabase project (or after clear_clinical_data.sql).
-- Everything is idempotent (safe to re-run).
-- ============================================================

-- ============================================================
-- 1. HELPER FUNCTIONS (defined first; tables reference them)
-- ============================================================

-- Auto-populate profiles whenever a new auth user signs up.
create or replace function handle_new_user()
returns trigger language plpgsql
security definer set search_path = public
as $$
begin
  insert into profiles (id, full_name)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', '')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

-- Keep updated_at current on every update.
create or replace function update_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ============================================================
-- 2. AUTH / PROFILE / ROLE TABLES
-- ============================================================

create table if not exists profiles (
  id         uuid primary key references auth.users(id) on delete cascade,
  full_name  text not null default '',
  role       text not null default 'user',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists roles (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  slug        text unique not null,
  description text,
  permissions text[] not null default '{}',
  is_system   boolean not null default false,
  sort_order  integer not null default 0,
  created_at  timestamptz default now(),
  updated_at  timestamptz default now()
);

create table if not exists user_roles (
  user_id     uuid references auth.users(id) on delete cascade not null,
  role_id     uuid references roles(id) on delete cascade not null,
  assigned_by uuid references auth.users(id),
  assigned_at timestamptz default now(),
  primary key (user_id, role_id)
);

-- ============================================================
-- 3. PATIENT MASTER RECORD & FIELD DEFINITIONS
-- ============================================================

-- Admin-controlled field schema for patient demographics.
-- Slugs that match real columns on `patients` are routed there;
-- all others are stored in patients.custom_fields JSONB.
create table if not exists patient_field_definitions (
  id          uuid primary key default gen_random_uuid(),
  label       text not null,
  slug        text unique not null,
  field_type  text not null default 'text'
              check (field_type in ('text','number','date','select','textarea')),
  options     jsonb not null default '[]',
  is_required boolean not null default false,
  is_system   boolean not null default false,
  sort_order  integer not null default 0,
  active      boolean not null default true,
  created_by  uuid references auth.users(id),
  created_at  timestamptz default now()
);

create table if not exists patients (
  id                     uuid primary key default gen_random_uuid(),
  mrn                    text unique not null,
  first_name             text not null,
  last_name              text not null,
  -- Date precision: 'year' | 'month' | 'full'
  date_of_birth          date,
  date_of_birth_precision text default 'full'
    check (date_of_birth_precision in ('year','month','full')),
  gender                 text,
  phone                  text,
  blood_group            text,
  photo_url              text,
  -- Extra fields defined by admin via patient_field_definitions
  custom_fields          jsonb not null default '{}',
  created_by             uuid references auth.users(id),
  created_at             timestamptz default now(),
  updated_at             timestamptz default now()
);

-- ============================================================
-- 4. PATIENT CLINICAL TABLES
-- ============================================================

-- NB: created_by / updated_by on the tables below reference profiles(id)
-- (not auth.users) so PostgREST can join author names without extra RPCs.

create table if not exists patient_problems (
  id                   uuid primary key default gen_random_uuid(),
  patient_id           uuid references patients(id) on delete cascade not null,
  problem              text not null,
  onset_date           date,
  onset_date_precision text default 'full'
    check (onset_date_precision in ('year','month','full')),
  status               text default 'active' check (status in ('active','resolved')),
  ended_date           date,
  notes                text,
  importance           text not null default 'medium'
    check (importance in ('high','medium','low')),
  created_by           uuid references profiles(id) on delete set null,
  created_at           timestamptz default now(),
  updated_at           timestamptz default now(),
  updated_by           uuid references profiles(id) on delete set null
);

create table if not exists patient_problem_history (
  id         uuid primary key default gen_random_uuid(),
  problem_id uuid references patient_problems(id) on delete cascade not null,
  snapshot   jsonb not null,
  changed_by uuid references auth.users(id),
  changed_at timestamptz default now()
);

create table if not exists patient_medications (
  id                   uuid primary key default gen_random_uuid(),
  patient_id           uuid references patients(id) on delete cascade not null,
  medication_name      text not null,
  dosage               text,
  frequency            text,
  route                text,
  start_date           date,
  start_date_precision text default 'full'
    check (start_date_precision in ('year','month','full')),
  end_date             date,
  end_date_precision   text default 'full'
    check (end_date_precision in ('year','month','full')),
  status               text default 'active' check (status in ('active','discontinued')),
  prescriber           text,
  notes                text,
  created_by           uuid references profiles(id) on delete set null,
  created_at           timestamptz default now(),
  updated_at           timestamptz default now(),
  updated_by           uuid references profiles(id) on delete set null
);

create table if not exists patient_medication_history (
  id            uuid primary key default gen_random_uuid(),
  medication_id uuid references patient_medications(id) on delete cascade not null,
  snapshot      jsonb not null,
  changed_by    uuid references auth.users(id),
  changed_at    timestamptz default now()
);

create table if not exists patient_allergies (
  id         uuid primary key default gen_random_uuid(),
  patient_id uuid references patients(id) on delete cascade not null,
  allergen   text not null,
  reaction   text,
  severity   text check (severity in ('mild','moderate','severe')),
  notes      text,
  created_by uuid references profiles(id) on delete set null,
  updated_by uuid references profiles(id) on delete set null,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Historical Archive: Hospitalizations/Surgeries, Family/Social Hx, Documents
create table if not exists patient_archive (
  id           uuid primary key default gen_random_uuid(),
  patient_id   uuid references patients(id) on delete cascade not null,
  category     text not null
    check (category in ('visit','family_hx','social_hx','document')),
  content      jsonb not null default '{}',
  -- Document file upload metadata (category = 'document' only)
  storage_path text,
  file_name    text,
  file_size    integer,
  mime_type    text,
  created_by   uuid references profiles(id) on delete set null,
  created_at   timestamptz default now(),
  updated_at   timestamptz default now()
);

-- ============================================================
-- 5. ENCOUNTER & BLOCK TABLES
-- ============================================================

create table if not exists encounters (
  id              uuid primary key default gen_random_uuid(),
  patient_id      uuid references patients(id) on delete cascade not null,
  title           text,
  status          text default 'open' check (status in ('open','closed')),
  visibility      text not null default 'staff'
    check (visibility in ('staff','restricted','private')),
  visible_to_roles text[] not null default '{}',
  portal_visible  boolean not null default false,
  created_by      uuid references auth.users(id),
  created_at      timestamptz default now(),
  updated_at      timestamptz default now(),
  closed_at       timestamptz
);

-- Block type registry: both built-in and admin-defined types.
create table if not exists block_definitions (
  id                uuid primary key default gen_random_uuid(),
  name              text not null,
  slug              text unique not null,
  icon              text not null default 'file',
  color             text not null default 'slate',
  description       text,
  -- Capabilities
  cap_media         boolean not null default false,
  cap_time_series   boolean not null default false,
  cap_immutable     boolean not null default false,
  cap_co_sign       boolean not null default false,
  cap_required      boolean not null default false,
  -- Visibility
  is_builtin        boolean not null default false,
  is_universal      boolean not null default false,
  visible_to_roles  text[]  not null default '{}',
  -- Field schemas
  fields            jsonb not null default '[]',
  time_series_fields jsonb not null default '[]',
  config            jsonb not null default '{}',
  -- Metadata
  active            boolean not null default true,
  sort_order        integer not null default 0,
  created_by        uuid references auth.users(id),
  created_at        timestamptz default now()
);

create table if not exists blocks (
  id                  uuid primary key default gen_random_uuid(),
  encounter_id        uuid references encounters(id) on delete cascade not null,
  type                text not null,
  content             jsonb not null default '{}',
  state               text default 'active' check (state in ('active','masked')),
  sequence_order      integer not null,
  supersedes_block_id uuid references blocks(id),
  locked_by           uuid references auth.users(id),
  locked_at           timestamptz,
  author_name         text,
  definition_id       uuid references block_definitions(id),
  is_template_seed    boolean not null default false,
  is_pinned           boolean not null default false,
  visible_to_roles    text[] not null default '{}',
  portal_visible      boolean not null default true,
  share_to_record     boolean not null default false,
  created_by          uuid references auth.users(id),
  created_at          timestamptz default now(),
  updated_at          timestamptz default now()
);

create table if not exists block_entries (
  id          uuid primary key default gen_random_uuid(),
  block_id    uuid references blocks(id) on delete cascade not null,
  data        jsonb not null default '{}',
  recorded_at timestamptz not null default now(),
  author_name text,
  created_by  uuid references auth.users(id),
  created_at  timestamptz default now()
);

create table if not exists block_attachments (
  id           uuid primary key default gen_random_uuid(),
  block_id     uuid references blocks(id) on delete cascade not null,
  storage_path text not null,
  file_name    text not null,
  mime_type    text not null,
  file_size    integer,
  caption      text,
  uploaded_by  uuid references auth.users(id),
  created_at   timestamptz default now()
);

create table if not exists block_actions (
  id              uuid primary key default gen_random_uuid(),
  block_id        uuid references blocks(id) on delete cascade not null,
  encounter_id    uuid references encounters(id) not null,
  patient_id      uuid references patients(id) not null,
  action_type     text not null,
  action_payload  jsonb not null default '{}',
  status          text not null default 'pending'
    check (status in ('pending','submitted','acknowledged','in_progress','completed','cancelled')),
  result_block_id uuid references blocks(id),
  result_data     jsonb,
  triggered_by    uuid references auth.users(id),
  triggered_at    timestamptz default now(),
  completed_at    timestamptz
);

create table if not exists block_acknowledgments (
  id         uuid primary key default gen_random_uuid(),
  block_id   uuid references blocks(id) on delete cascade not null,
  acked_by   uuid references auth.users(id) not null,
  acker_name text,
  acked_at   timestamptz default now()
);

-- ============================================================
-- 6. ENCOUNTER TEMPLATES
-- ============================================================

create table if not exists encounter_templates (
  id               uuid primary key default gen_random_uuid(),
  name             text not null,
  description      text,
  is_universal     boolean not null default false,
  visible_to_roles text[]  not null default '{}',
  blocks           jsonb   not null default '[]',
  created_by       uuid references auth.users(id),
  created_at       timestamptz default now(),
  updated_at       timestamptz default now()
);

-- ============================================================
-- 7. INDEXES
-- ============================================================

create index if not exists idx_patient_problems_patient     on patient_problems(patient_id);
create index if not exists idx_patient_problems_status      on patient_problems(patient_id, status);
create index if not exists idx_problem_history_problem      on patient_problem_history(problem_id);
create index if not exists idx_patient_meds_patient         on patient_medications(patient_id);
create index if not exists idx_medication_history_med       on patient_medication_history(medication_id);
create index if not exists idx_patient_allergies_patient    on patient_allergies(patient_id);
create index if not exists idx_patient_archive_patient      on patient_archive(patient_id);
create index if not exists idx_patient_archive_category     on patient_archive(patient_id, category);
create index if not exists idx_encounters_patient           on encounters(patient_id);
create index if not exists idx_encounters_status            on encounters(patient_id, status);
create index if not exists idx_blocks_encounter             on blocks(encounter_id, sequence_order);
create index if not exists idx_blocks_state                 on blocks(encounter_id, state);
create index if not exists idx_block_definitions_slug       on block_definitions(slug);
create index if not exists idx_block_definitions_active     on block_definitions(active, sort_order);
create index if not exists idx_block_definitions_universal  on block_definitions(is_universal) where is_universal = true;
create index if not exists idx_block_entries_block          on block_entries(block_id, recorded_at);
create index if not exists idx_block_attachments_block      on block_attachments(block_id);
create index if not exists idx_block_actions_block          on block_actions(block_id);
create index if not exists idx_block_actions_status         on block_actions(status);
create index if not exists idx_block_acks_block             on block_acknowledgments(block_id);
create index if not exists idx_roles_slug                   on roles(slug);
create index if not exists idx_user_roles_user              on user_roles(user_id);
create index if not exists idx_templates_universal          on encounter_templates(is_universal) where is_universal = true;
create index if not exists idx_templates_created_by         on encounter_templates(created_by);

-- ============================================================
-- 8. TRIGGERS (auth + updated_at)
-- ============================================================

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();

drop trigger if exists profiles_updated_at       on profiles;
drop trigger if exists patients_updated_at       on patients;
drop trigger if exists problems_updated_at       on patient_problems;
drop trigger if exists medications_updated_at    on patient_medications;
drop trigger if exists allergies_updated_at      on patient_allergies;
drop trigger if exists archive_updated_at        on patient_archive;
drop trigger if exists encounters_updated_at     on encounters;
drop trigger if exists blocks_updated_at         on blocks;
drop trigger if exists roles_updated_at          on roles;
drop trigger if exists templates_updated_at      on encounter_templates;

create trigger profiles_updated_at
  before update on profiles    for each row execute function update_updated_at();
create trigger patients_updated_at
  before update on patients    for each row execute function update_updated_at();
create trigger problems_updated_at
  before update on patient_problems    for each row execute function update_updated_at();
create trigger medications_updated_at
  before update on patient_medications for each row execute function update_updated_at();
create trigger allergies_updated_at
  before update on patient_allergies   for each row execute function update_updated_at();
create trigger archive_updated_at
  before update on patient_archive     for each row execute function update_updated_at();
create trigger encounters_updated_at
  before update on encounters          for each row execute function update_updated_at();
create trigger blocks_updated_at
  before update on blocks              for each row execute function update_updated_at();
create trigger roles_updated_at
  before update on roles               for each row execute function update_updated_at();
create trigger templates_updated_at
  before update on encounter_templates for each row execute function update_updated_at();

-- ============================================================
-- 9. SCHEMA EVOLUTION (idempotent column additions for existing databases)
-- These must run BEFORE RLS policies that reference the new columns.
-- ============================================================

alter table patient_allergies add column if not exists updated_by uuid references profiles(id) on delete set null;

-- Encounter privacy columns
alter table encounters add column if not exists visibility text not null default 'staff'
  check (visibility in ('staff','restricted','private'));
alter table encounters add column if not exists visible_to_roles text[] not null default '{}';
alter table encounters add column if not exists portal_visible boolean not null default false;

-- Block privacy + share_to_record columns
alter table blocks add column if not exists visible_to_roles text[] not null default '{}';
alter table blocks add column if not exists portal_visible boolean not null default true;
alter table blocks add column if not exists share_to_record boolean not null default false;

-- Block definition default privacy (applied when a block of this type is inserted)
alter table block_definitions add column if not exists default_visible_to_roles text[] not null default '{}';
alter table block_definitions add column if not exists default_portal_visible boolean not null default true;

-- Encounter template default encounter privacy
alter table encounter_templates add column if not exists default_visibility text not null default 'staff'
  check (default_visibility in ('staff','restricted','private'));
alter table encounter_templates add column if not exists default_visible_to_roles text[] not null default '{}';

-- ============================================================
-- 10. ROW LEVEL SECURITY
-- ============================================================

alter table profiles                   enable row level security;
alter table roles                      enable row level security;
alter table user_roles                 enable row level security;
alter table patients                   enable row level security;
alter table patient_field_definitions  enable row level security;
alter table patient_problems           enable row level security;
alter table patient_problem_history    enable row level security;
alter table patient_medications        enable row level security;
alter table patient_medication_history enable row level security;
alter table patient_allergies          enable row level security;
alter table patient_archive            enable row level security;
alter table encounters                 enable row level security;
alter table block_definitions          enable row level security;
alter table blocks                     enable row level security;
alter table block_entries              enable row level security;
alter table block_attachments          enable row level security;
alter table block_actions              enable row level security;
alter table block_acknowledgments      enable row level security;
alter table encounter_templates        enable row level security;

-- Drop all existing policies before recreating (idempotent)
drop policy if exists "profiles_select"              on profiles;
drop policy if exists "profiles_insert"              on profiles;
drop policy if exists "profiles_update"              on profiles;
drop policy if exists "roles_select"                 on roles;
drop policy if exists "user_roles_select"            on user_roles;
drop policy if exists "auth_all_patients"            on patients;
drop policy if exists "read_patient_fields"          on patient_field_definitions;
drop policy if exists "admin_mutate_patient_fields"  on patient_field_definitions;
drop policy if exists "auth_all_problems"            on patient_problems;
drop policy if exists "auth_all_problem_history"     on patient_problem_history;
drop policy if exists "auth_all_medications"         on patient_medications;
drop policy if exists "auth_all_med_history"         on patient_medication_history;
drop policy if exists "auth_all_allergies"           on patient_allergies;
drop policy if exists "auth_all_archive"             on patient_archive;
drop policy if exists "auth_all_encounters"          on encounters;
drop policy if exists "encounter_staff_access"       on encounters;
drop policy if exists "encounter_portal_select"      on encounters;
drop policy if exists "select_block_defs"            on block_definitions;
drop policy if exists "insert_block_defs"            on block_definitions;
drop policy if exists "update_block_defs"            on block_definitions;
drop policy if exists "delete_block_defs"            on block_definitions;
drop policy if exists "auth_all_blocks"              on blocks;
drop policy if exists "block_staff_access"           on blocks;
drop policy if exists "block_portal_select"          on blocks;
drop policy if exists "auth_all_block_entries"       on block_entries;
drop policy if exists "auth_all_block_attachments"   on block_attachments;
drop policy if exists "auth_all_block_actions"       on block_actions;
drop policy if exists "auth_all_block_acks"          on block_acknowledgments;
drop policy if exists "select_templates"             on encounter_templates;
drop policy if exists "insert_templates"             on encounter_templates;
drop policy if exists "update_templates"             on encounter_templates;
drop policy if exists "delete_templates"             on encounter_templates;

-- Profiles: readable by all authenticated; writable by self (trigger bypasses for inserts)
create policy "profiles_select" on profiles for select using (auth.uid() is not null);
create policy "profiles_insert" on profiles for insert with check (true);
create policy "profiles_update" on profiles for update using (id = auth.uid());

-- Roles: read-only for normal users; writes via service-role key only
create policy "roles_select"      on roles      for select using (auth.uid() is not null);
create policy "user_roles_select" on user_roles for select using (auth.uid() is not null);

-- Clinical data: full access for any authenticated user (MVP)
create policy "auth_all_patients"        on patients               for all using (auth.uid() is not null);
create policy "auth_all_problems"        on patient_problems       for all using (auth.uid() is not null);
create policy "auth_all_problem_history" on patient_problem_history for all using (auth.uid() is not null);
create policy "auth_all_medications"     on patient_medications    for all using (auth.uid() is not null);
create policy "auth_all_med_history"     on patient_medication_history for all using (auth.uid() is not null);
create policy "auth_all_allergies"       on patient_allergies      for all using (auth.uid() is not null);
create policy "auth_all_archive"         on patient_archive        for all using (auth.uid() is not null);
-- Encounter access: staff visibility layers + patient portal
create policy "encounter_staff_access" on encounters for all using (
  auth.uid() is not null and (
    visibility = 'staff'
    or (visibility = 'private' and created_by = auth.uid())
    or (visibility = 'restricted' and (
      created_by = auth.uid()
      or exists (
        select 1 from user_roles ur join roles r on r.id = ur.role_id
        where ur.user_id = auth.uid() and r.slug = any(visible_to_roles)
      )
    ))
  )
);
create policy "encounter_portal_select" on encounters for select using (
  portal_visible = true
  and exists (
    select 1 from user_roles ur join roles r on r.id = ur.role_id
    where ur.user_id = auth.uid() and r.slug = 'patient'
  )
);

-- Patient field definitions: readable by all auth users; admin writes via service-role
create policy "read_patient_fields"         on patient_field_definitions for select using (auth.uid() is not null);
create policy "admin_mutate_patient_fields" on patient_field_definitions for all    using (auth.uid() is not null);

-- Block definitions: built-ins and universal blocks visible to all; custom blocks scoped to creator
create policy "select_block_defs" on block_definitions for select
  using (is_builtin = true or is_universal = true or created_by = auth.uid());
create policy "insert_block_defs" on block_definitions for insert
  with check (auth.uid() is not null);
create policy "update_block_defs" on block_definitions for update
  using (created_by = auth.uid());
create policy "delete_block_defs" on block_definitions for delete
  using (created_by = auth.uid());

-- Block access: per-block role restriction + share_to_record bypass + portal
create policy "block_staff_access" on blocks for all using (
  auth.uid() is not null and (
    share_to_record = true
    or array_length(visible_to_roles, 1) is null
    or created_by = auth.uid()
    or exists (
      select 1 from user_roles ur join roles r on r.id = ur.role_id
      where ur.user_id = auth.uid() and r.slug = any(visible_to_roles)
    )
  )
);
create policy "block_portal_select" on blocks for select using (
  portal_visible = true
  and exists (
    select 1 from user_roles ur join roles r on r.id = ur.role_id
    where ur.user_id = auth.uid() and r.slug = 'patient'
  )
);
create policy "auth_all_block_entries"     on block_entries         for all using (auth.uid() is not null);
create policy "auth_all_block_attachments" on block_attachments     for all using (auth.uid() is not null);
create policy "auth_all_block_actions"     on block_actions         for all using (auth.uid() is not null);
create policy "auth_all_block_acks"        on block_acknowledgments for all using (auth.uid() is not null);

-- Encounter templates: universal = visible to all; personal = owner only
create policy "select_templates" on encounter_templates for select
  using (is_universal = true or created_by = auth.uid());
create policy "insert_templates" on encounter_templates for insert
  with check (auth.uid() is not null and is_universal = false);
create policy "update_templates" on encounter_templates for update
  using (created_by = auth.uid() and is_universal = false);
create policy "delete_templates" on encounter_templates for delete
  using (created_by = auth.uid() and is_universal = false);

-- ============================================================
-- 10. SEED DATA
-- ============================================================

-- Built-in block definitions
insert into block_definitions (name, slug, icon, color, description, is_builtin, cap_media, cap_immutable, sort_order, fields)
values
  ('History & Physical', 'hx_physical', 'clipboard-list', 'purple', 'Combined history, ROS, and physical examination', true, false, false, 10, '[]'::jsonb),
  ('Clinical Note',      'note',        'file-text',      'blue',   'Free-text note with file and photo attachments',  true, true,  false, 15, '[]'::jsonb),
  ('Medications',        'med_orders',  'pill',           'orange', 'Encounter medication orders and reconciliation',   true, false, false, 20, '[]'::jsonb),
  ('Assessment & Plan',  'plan',        'clipboard',      'teal',   'Assessment, problem-based plan, and follow-up',    true, false, false, 25, '[]'::jsonb),
  ('Vitals',             'vitals',      'activity',       'red',    'Immutable vital signs record with NEWS2 scoring', true, false, true,  30, '[]'::jsonb)
on conflict (slug) do update set
  name          = excluded.name,
  icon          = excluded.icon,
  color         = excluded.color,
  description   = excluded.description,
  cap_media     = excluded.cap_media,
  cap_immutable = excluded.cap_immutable,
  sort_order    = excluded.sort_order;

-- System roles
insert into roles (name, slug, description, is_system, sort_order, permissions) values
  ('System Admin', 'admin',
   'Full access to all features including user and role management',
   true, 10,
   array['encounter.create','encounter.close','encounter.view_all',
         'block.add','block.delete',
         'patient.create','patient.edit_record','patient.view_all',
         'admin.manage_users','admin.manage_roles',
         'admin.manage_blocks','admin.manage_templates',
         'admin.manage_patient_fields','template.create']),
  ('Physician', 'physician',
   'Full clinical access — create encounters, add all block types, edit patient records',
   true, 20,
   array['encounter.create','encounter.close','encounter.view_all',
         'block.add','block.delete',
         'patient.create','patient.edit_record','patient.view_all',
         'template.create']),
  ('Nurse', 'nurse',
   'Can add blocks and view encounters; cannot create encounters or edit the master record',
   true, 30,
   array['encounter.view_all','block.add','patient.view_all']),
  ('Receptionist', 'receptionist',
   'Can register and view patients only',
   true, 40,
   array['patient.create','patient.view_all'])
on conflict (slug) do update set
  name        = excluded.name,
  description = excluded.description,
  permissions = excluded.permissions;

-- Patient field definitions (demographics schema)
insert into patient_field_definitions (label, slug, field_type, is_required, is_system, sort_order, options) values
  ('First Name',         'first_name',         'text',     true,  true,  10, '[]'::jsonb),
  ('Last Name',          'last_name',           'text',     true,  true,  20, '[]'::jsonb),
  ('Date of Birth',      'date_of_birth',       'date',     false, true,  30, '[]'::jsonb),
  ('Gender',             'gender',              'select',   false, false, 40,
    '[{"value":"Male","label":"Male"},{"value":"Female","label":"Female"},{"value":"Non-binary","label":"Non-binary"},{"value":"Other","label":"Other"}]'::jsonb),
  ('Blood Group',        'blood_group',         'select',   false, false, 50,
    '[{"value":"A+","label":"A+"},{"value":"A-","label":"A−"},{"value":"B+","label":"B+"},{"value":"B-","label":"B−"},{"value":"AB+","label":"AB+"},{"value":"AB-","label":"AB−"},{"value":"O+","label":"O+"},{"value":"O-","label":"O−"}]'::jsonb),
  ('Phone',              'phone',               'text',     false, false, 60, '[]'::jsonb),
  ('Email',              'email',               'text',     false, false, 70, '[]'::jsonb),
  ('Address',            'address',             'textarea', false, false, 80, '[]'::jsonb),
  ('Nationality',        'nationality',         'text',     false, false, 90, '[]'::jsonb),
  ('Marital Status',     'marital_status',      'select',   false, false, 100,
    '[{"value":"Single","label":"Single"},{"value":"Married","label":"Married"},{"value":"Divorced","label":"Divorced"},{"value":"Widowed","label":"Widowed"}]'::jsonb),
  ('Occupation',         'occupation',          'text',     false, false, 110, '[]'::jsonb),
  ('Emergency Contact',  'emergency_contact',   'text',     false, false, 120, '[]'::jsonb),
  ('Emergency Phone',    'emergency_phone',     'text',     false, false, 130, '[]'::jsonb),
  ('Emergency Relation', 'emergency_relation',  'text',     false, false, 140, '[]'::jsonb)
on conflict (slug) do nothing;

-- Bootstrap: assign System Admin role to all existing users.
-- New users are assigned roles manually via Settings → Users.
insert into user_roles (user_id, role_id)
select p.id, r.id
from profiles p
cross join roles r
where r.slug = 'admin'
on conflict do nothing;

-- ============================================================
-- 11. HELPER RPCs (called by the frontend after login)
-- ============================================================

-- All permission slugs for the current user (union of all their roles)
create or replace function get_my_permissions()
returns text[] language sql security definer stable
set search_path = public
as $$
  select coalesce(array_agg(distinct perm order by perm), '{}')
  from user_roles ur
  join roles r on r.id = ur.role_id
  join lateral unnest(r.permissions) as perm on true
  where ur.user_id = auth.uid()
$$;

-- Role slugs for the current user
create or replace function get_my_role_slugs()
returns text[] language sql security definer stable
set search_path = public
as $$
  select coalesce(array_agg(r.slug order by r.sort_order), '{}')
  from user_roles ur
  join roles r on r.id = ur.role_id
  where ur.user_id = auth.uid()
$$;

-- All users with their assigned roles (admin use)
drop function if exists get_users_with_roles();
create or replace function get_users_with_roles()
returns table (
  id         uuid,
  full_name  text,
  email      text,
  created_at timestamptz,
  role_ids   uuid[],
  role_slugs text[],
  role_names text[]
) language sql security definer stable
set search_path = public
as $$
  select
    p.id,
    p.full_name,
    u.email,
    p.created_at,
    coalesce(array_agg(r.id)   filter (where r.id   is not null), '{}'),
    coalesce(array_agg(r.slug) filter (where r.slug is not null), '{}'),
    coalesce(array_agg(r.name) filter (where r.name is not null), '{}')
  from profiles p
  join auth.users u on u.id = p.id
  left join user_roles ur on ur.user_id = p.id
  left join roles r on r.id = ur.role_id
  group by p.id, p.full_name, u.email, p.created_at
  order by p.created_at
$$;

-- ============================================================
-- 12. REALTIME PUBLICATIONS
-- ============================================================

do $$ begin
  alter publication supabase_realtime add table blocks;
exception when duplicate_object then null; end $$;

do $$ begin
  alter publication supabase_realtime add table encounters;
exception when duplicate_object then null; end $$;

do $$ begin
  alter publication supabase_realtime add table block_entries;
exception when duplicate_object then null; end $$;

do $$ begin
  alter publication supabase_realtime add table block_attachments;
exception when duplicate_object then null; end $$;

do $$ begin
  alter publication supabase_realtime add table block_acknowledgments;
exception when duplicate_object then null; end $$;

do $$ begin
  alter publication supabase_realtime add table encounter_templates;
exception when duplicate_object then null; end $$;

-- ============================================================
-- 13. STORAGE BUCKETS & POLICIES
-- ============================================================

-- Block media (images, files attached to Clinical Note blocks)
insert into storage.buckets (id, name, public)
values ('block-media', 'block-media', true)
on conflict (id) do nothing;

drop policy if exists "block_media_insert" on storage.objects;
drop policy if exists "block_media_select" on storage.objects;
drop policy if exists "block_media_delete" on storage.objects;

create policy "block_media_insert" on storage.objects
  for insert with check (bucket_id = 'block-media' and auth.uid() is not null);
create policy "block_media_select" on storage.objects
  for select using (bucket_id = 'block-media');
create policy "block_media_delete" on storage.objects
  for delete using (bucket_id = 'block-media' and auth.uid() is not null);

-- Patient photos
insert into storage.buckets (id, name, public)
values ('patient-photos', 'patient-photos', true)
on conflict (id) do nothing;

drop policy if exists "patient_photos_insert" on storage.objects;
drop policy if exists "patient_photos_select" on storage.objects;
drop policy if exists "patient_photos_delete" on storage.objects;

create policy "patient_photos_insert" on storage.objects
  for insert with check (bucket_id = 'patient-photos' and auth.uid() is not null);
create policy "patient_photos_select" on storage.objects
  for select using (bucket_id = 'patient-photos');
create policy "patient_photos_delete" on storage.objects
  for delete using (bucket_id = 'patient-photos' and auth.uid() is not null);

-- Patient documents (uploaded via Historical Archive)
insert into storage.buckets (id, name, public)
values ('patient-docs', 'patient-docs', false)
on conflict (id) do nothing;

drop policy if exists "patient_docs_insert" on storage.objects;
drop policy if exists "patient_docs_select" on storage.objects;
drop policy if exists "patient_docs_delete" on storage.objects;

create policy "patient_docs_insert" on storage.objects
  for insert with check (bucket_id = 'patient-docs' and auth.uid() is not null);
create policy "patient_docs_select" on storage.objects
  for select using (bucket_id = 'patient-docs' and auth.uid() is not null);
create policy "patient_docs_delete" on storage.objects
  for delete using (bucket_id = 'patient-docs' and auth.uid() is not null);

-- Migrate patient_archive category constraint: replace admission/surgery with 'visit'
alter table patient_archive drop constraint if exists patient_archive_category_check;
-- Migrate existing admission/surgery rows to 'visit' BEFORE re-adding the constraint
update patient_archive set category = 'visit' where category in ('admission','surgery');
alter table patient_archive add constraint patient_archive_category_check
  check (category in ('visit','family_hx','social_hx','document'));
