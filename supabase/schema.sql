-- ============================================================
-- OpenKairo — Master Database Schema
-- Idempotent (safe to re-run on an existing database).
-- Run on a fresh Supabase project to set up everything from scratch.
-- ============================================================

-- ============================================================
-- 0. EXTENSIONS
-- ============================================================

-- Required for fast trigram ILIKE searches on patient names / MRN / phone
create extension if not exists pg_trgm;

-- ============================================================
-- 1. HELPER FUNCTIONS
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

create table if not exists app_settings (
  key        text primary key,
  value      text not null,
  updated_at timestamptz default now()
);

create table if not exists patients (
  id                     uuid primary key default gen_random_uuid(),
  mrn                    text unique not null,
  first_name             text not null,
  middle_name            text,
  last_name              text not null,
  date_of_birth          date,
  date_of_birth_precision text default 'full'
    check (date_of_birth_precision in ('year','month','full')),
  gender                 text,
  phone                  text,
  blood_group            text,
  photo_url              text,
  custom_fields          jsonb not null default '{}',
  created_by             uuid references auth.users(id),
  created_at             timestamptz default now(),
  updated_at             timestamptz default now()
);

-- ============================================================
-- 4. PATIENT CLINICAL TABLES
-- ============================================================

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

create table if not exists patient_archive (
  id           uuid primary key default gen_random_uuid(),
  patient_id   uuid references patients(id) on delete cascade not null,
  category     text not null
    check (category in ('visit','family_hx','social_hx','document')),
  content      jsonb not null default '{}',
  storage_path text,
  file_name    text,
  file_size    integer,
  mime_type    text,
  created_by   uuid references profiles(id) on delete set null,
  created_at   timestamptz default now(),
  updated_at   timestamptz default now()
);

-- ============================================================
-- 5. ENCOUNTER & BLOCK DEFINITIONS
-- ============================================================

create table if not exists encounters (
  id               uuid primary key default gen_random_uuid(),
  patient_id       uuid references patients(id) on delete cascade not null,
  title            text,
  status           text default 'open' check (status in ('open','closed')),
  visibility       text not null default 'staff'
    check (visibility in ('staff','restricted','private')),
  visible_to_roles text[] not null default '{}',
  created_by       uuid references auth.users(id),
  created_at       timestamptz default now(),
  updated_at       timestamptz default now(),
  closed_at        timestamptz
);

create table if not exists block_definitions (
  id                       uuid primary key default gen_random_uuid(),
  name                     text not null,
  slug                     text unique not null,
  icon                     text not null default 'file',
  color                    text not null default 'slate',
  description              text,
  cap_media                boolean not null default false,
  cap_time_series          boolean not null default false,
  cap_immutable            boolean not null default false,
  cap_co_sign              boolean not null default false,
  cap_required             boolean not null default false,
  is_builtin               boolean not null default false,
  is_universal             boolean not null default false,
  is_dept_only             boolean not null default false,  -- hides from Add Block; only used via dept system
  visible_to_roles         text[]  not null default '{}',
  default_visible_to_roles text[]  not null default '{}',
  fields                   jsonb not null default '[]',
  time_series_fields       jsonb not null default '[]',
  config                   jsonb not null default '{}',
  active                   boolean not null default true,
  sort_order               integer not null default 0,
  created_by               uuid references auth.users(id),
  created_at               timestamptz default now()
);

-- ============================================================
-- 6. DEPARTMENTS
-- ============================================================

create table if not exists departments (
  id                 uuid primary key default gen_random_uuid(),
  name               text not null,
  slug               text unique not null,   -- routing key for block_actions.action_type
  description        text,
  icon               text not null default 'building-2',
  color              text not null default 'slate',
  can_receive_orders boolean not null default true,
  can_create_direct  boolean not null default true,
  active             boolean not null default true,
  sort_order         int not null default 0,
  created_by         uuid references auth.users(id) on delete set null,
  created_at         timestamptz not null default now()
);

-- Each service a department offers (e.g. CBC, Chest X-Ray, Paracetamol).
-- order_block_def_id = block a doctor places on the timeline
-- entry_block_def_id = result form the dept fills in
create table if not exists department_block_types (
  id                 uuid primary key default gen_random_uuid(),
  department_id      uuid not null references departments(id) on delete cascade,
  name               text not null,
  description        text,
  order_block_def_id uuid references block_definitions(id) on delete set null,
  entry_block_def_id uuid references block_definitions(id) on delete set null,
  active             boolean not null default true,
  sort_order         int not null default 0,
  created_at         timestamptz not null default now()
);

create table if not exists department_members (
  id            uuid primary key default gen_random_uuid(),
  department_id uuid not null references departments(id) on delete cascade,
  user_id       uuid not null references auth.users(id) on delete cascade,
  created_at    timestamptz not null default now(),
  unique (department_id, user_id)
);

-- ============================================================
-- 7. BLOCKS & BLOCK SUB-TABLES
-- ============================================================

create table if not exists blocks (
  id                       uuid primary key default gen_random_uuid(),
  -- encounter_id is NULL for department entries (walk-in or fulfilled orders)
  encounter_id             uuid references encounters(id) on delete cascade,
  department_id            uuid references departments(id) on delete set null,
  department_block_type_id uuid references department_block_types(id) on delete set null,
  -- patient_id is required when encounter_id is null (dept entries)
  patient_id               uuid references patients(id) on delete cascade,
  type                     text not null,
  content                  jsonb not null default '{}',
  state                    text default 'active' check (state in ('active','masked')),
  sequence_order           integer not null default 0,
  supersedes_block_id      uuid references blocks(id),
  locked_by                uuid references auth.users(id),
  locked_at                timestamptz,
  author_name              text,
  definition_id            uuid references block_definitions(id),
  is_template_seed         boolean not null default false,
  is_pinned                boolean not null default false,
  visible_to_roles         text[] not null default '{}',
  share_to_record          boolean not null default false,
  created_by               uuid references auth.users(id),
  created_at               timestamptz default now(),
  updated_at               timestamptz default now()
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
-- 8. ENCOUNTER TEMPLATES
-- ============================================================

create table if not exists encounter_templates (
  id               uuid primary key default gen_random_uuid(),
  name             text not null,
  description      text,
  is_universal     boolean not null default false,
  visible_to_roles text[]  not null default '{}',
  blocks           jsonb   not null default '[]',
  default_visibility       text not null default 'staff'
    check (default_visibility in ('staff','restricted','private')),
  default_visible_to_roles text[] not null default '{}',
  created_by       uuid references auth.users(id),
  created_at       timestamptz default now(),
  updated_at       timestamptz default now()
);

-- ============================================================
-- 9. INDEXES
-- ============================================================

-- Patients
create index if not exists idx_patient_problems_patient     on patient_problems(patient_id);
create index if not exists idx_patient_problems_status      on patient_problems(patient_id, status);
create index if not exists idx_problem_history_problem      on patient_problem_history(problem_id);
create index if not exists idx_patient_meds_patient         on patient_medications(patient_id);
create index if not exists idx_medication_history_med       on patient_medication_history(medication_id);
create index if not exists idx_patient_allergies_patient    on patient_allergies(patient_id);
create index if not exists idx_patient_archive_patient      on patient_archive(patient_id);
create index if not exists idx_patient_archive_category     on patient_archive(patient_id, category);

-- Patient search (trigram for fast ILIKE on 100k+ rows)
create index if not exists idx_patients_fname_trgm on patients using gin (first_name gin_trgm_ops);
create index if not exists idx_patients_mname_trgm on patients using gin (middle_name gin_trgm_ops);
create index if not exists idx_patients_lname_trgm on patients using gin (last_name  gin_trgm_ops);
create index if not exists idx_patients_mrn_trgm   on patients using gin (mrn        gin_trgm_ops);
create index if not exists idx_patients_phone_trgm on patients using gin (phone      gin_trgm_ops);
create index if not exists idx_patients_dob        on patients (date_of_birth);

-- Encounters & Blocks
create index if not exists idx_encounters_patient           on encounters(patient_id);
create index if not exists idx_encounters_status            on encounters(patient_id, status);
create index if not exists idx_blocks_encounter             on blocks(encounter_id, sequence_order);
create index if not exists idx_blocks_state                 on blocks(encounter_id, state);
-- Block definitions
create index if not exists idx_block_definitions_slug       on block_definitions(slug);
create index if not exists idx_block_definitions_active     on block_definitions(active, sort_order);
create index if not exists idx_block_definitions_universal  on block_definitions(is_universal) where is_universal = true;

-- Block sub-tables
create index if not exists idx_block_entries_block          on block_entries(block_id, recorded_at);
create index if not exists idx_block_attachments_block      on block_attachments(block_id);
create index if not exists idx_block_actions_block          on block_actions(block_id);
create index if not exists idx_block_actions_type_status    on block_actions(action_type, status);
create index if not exists idx_block_acks_block             on block_acknowledgments(block_id);

-- Roles
create index if not exists idx_roles_slug                   on roles(slug);
create index if not exists idx_user_roles_user              on user_roles(user_id);

-- Templates
create index if not exists idx_templates_universal          on encounter_templates(is_universal) where is_universal = true;
create index if not exists idx_templates_created_by         on encounter_templates(created_by);

-- Departments
create index if not exists idx_dept_members_user            on department_members(user_id);
create index if not exists idx_dept_members_dept            on department_members(department_id);
create index if not exists idx_dept_block_types_dept        on department_block_types(department_id);
create index if not exists idx_dept_block_types_order       on department_block_types(order_block_def_id) where order_block_def_id is not null;
create index if not exists idx_dept_block_types_entry       on department_block_types(entry_block_def_id) where entry_block_def_id is not null;

-- ============================================================
-- 10. TRIGGERS
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
  before update on profiles             for each row execute function update_updated_at();
create trigger patients_updated_at
  before update on patients             for each row execute function update_updated_at();
create trigger problems_updated_at
  before update on patient_problems     for each row execute function update_updated_at();
create trigger medications_updated_at
  before update on patient_medications  for each row execute function update_updated_at();
create trigger allergies_updated_at
  before update on patient_allergies    for each row execute function update_updated_at();
create trigger archive_updated_at
  before update on patient_archive      for each row execute function update_updated_at();
create trigger encounters_updated_at
  before update on encounters           for each row execute function update_updated_at();
create trigger blocks_updated_at
  before update on blocks               for each row execute function update_updated_at();
create trigger roles_updated_at
  before update on roles                for each row execute function update_updated_at();
create trigger templates_updated_at
  before update on encounter_templates  for each row execute function update_updated_at();

-- ============================================================
-- 11. SCHEMA EVOLUTION (idempotent for existing deployments)
-- Fresh installs do NOT need these — all columns already exist above.
-- Existing deployments upgrading from an earlier schema do need them.
-- ============================================================

-- Privacy columns added after initial launch
alter table encounters            add column if not exists visibility       text not null default 'staff' check (visibility in ('staff','restricted','private'));
alter table encounters            add column if not exists visible_to_roles text[] not null default '{}';
alter table blocks                add column if not exists visible_to_roles text[] not null default '{}';
-- Encounter assignment
alter table encounters            add column if not exists assigned_to      uuid references auth.users(id) on delete set null;
alter table blocks                add column if not exists share_to_record  boolean not null default false;
alter table block_definitions     add column if not exists default_visible_to_roles text[] not null default '{}';
alter table block_definitions     add column if not exists is_dept_only             boolean not null default false;
alter table encounter_templates   add column if not exists default_visibility       text not null default 'staff' check (default_visibility in ('staff','restricted','private'));
alter table encounter_templates   add column if not exists default_visible_to_roles text[] not null default '{}';
alter table patient_allergies     add column if not exists updated_by uuid references profiles(id) on delete set null;

-- Departments & Orders System
alter table blocks alter column encounter_id drop not null;
alter table blocks add column if not exists department_id            uuid references departments(id) on delete set null;
alter table blocks add column if not exists patient_id               uuid references patients(id) on delete cascade;
alter table blocks add column if not exists department_block_type_id uuid references department_block_types(id) on delete set null;

-- User preferred standard blocks
alter table profiles add column if not exists preferred_blocks uuid[] default null;

-- User pinned (favourite) blocks — shown first in Add Block menu
alter table profiles add column if not exists pinned_blocks uuid[] default null;

-- User content templates for block definitions
create table if not exists user_block_templates (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references profiles(id) on delete cascade,
  definition_id uuid not null references block_definitions(id) on delete cascade,
  name          text not null,
  content       jsonb not null default '{}',
  is_default    boolean not null default false,
  sort_order    int  not null default 0,
  created_at    timestamptz default now(),
  updated_at    timestamptz default now()
);

create index if not exists idx_user_block_templates_user on user_block_templates(user_id);

drop trigger  if exists user_block_templates_updated_at on user_block_templates;
create trigger user_block_templates_updated_at
  before update on user_block_templates for each row execute function update_updated_at();

alter table user_block_templates enable row level security;

drop policy if exists "user_block_templates_all" on user_block_templates;
create policy "user_block_templates_all" on user_block_templates
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Indexes for department columns on blocks (must run after ADD COLUMN above)
create index if not exists idx_blocks_department_id         on blocks(department_id)            where department_id is not null;
create index if not exists idx_blocks_patient_id            on blocks(patient_id)               where patient_id is not null;
create index if not exists idx_blocks_dept_block_type_id    on blocks(department_block_type_id) where department_block_type_id is not null;

-- Fix patient_archive category constraint (old schemas had 'admission'/'surgery')
alter table patient_archive drop constraint if exists patient_archive_category_check;
update patient_archive set category = 'visit' where category in ('admission','surgery');
alter table patient_archive add constraint patient_archive_category_check
  check (category in ('visit','family_hx','social_hx','document'));

-- ============================================================
-- 11b. BILLING SYSTEM (idempotent)
-- ============================================================

-- Physician encounter fee on profiles
alter table profiles add column if not exists encounter_fee numeric(12,2) default null;

-- Add pending_insurance to charges status constraint (idempotent via recreate)
alter table charges drop constraint if exists charges_status_check;
alter table charges add constraint charges_status_check
  check (status in ('pending','pending_approval','pending_insurance','invoiced','paid','waived','void'));

-- Link block definitions & dept block types to service items (columns added before table for idempotency)
alter table block_definitions      add column if not exists service_item_id uuid;
alter table block_definitions      add column if not exists charge_mode     text check (charge_mode in ('auto','confirm'));
alter table department_block_types add column if not exists service_item_id uuid;

-- Service item catalog (admin-managed fee schedule)
create table if not exists service_items (
  id            uuid primary key default gen_random_uuid(),
  code          text unique not null,
  name          text not null,
  category      text,
  default_price numeric(12,2) not null,
  active        boolean not null default true,
  sort_order    integer not null default 0,
  created_by    uuid references auth.users(id),
  created_at    timestamptz default now()
);

-- Now add the FK constraints (idempotent via DO block)
do $$ begin
  if not exists (
    select 1 from information_schema.table_constraints
    where constraint_name = 'block_definitions_service_item_id_fkey'
  ) then
    alter table block_definitions
      add constraint block_definitions_service_item_id_fkey
      foreign key (service_item_id) references service_items(id) on delete set null;
  end if;
end $$;

do $$ begin
  if not exists (
    select 1 from information_schema.table_constraints
    where constraint_name = 'department_block_types_service_item_id_fkey'
  ) then
    alter table department_block_types
      add constraint department_block_types_service_item_id_fkey
      foreign key (service_item_id) references service_items(id) on delete set null;
  end if;
end $$;

-- Patient insurance
create table if not exists patient_insurance (
  id              uuid primary key default gen_random_uuid(),
  patient_id      uuid references patients(id) on delete cascade not null,
  payer_name      text not null,
  policy_number   text,
  copay_percent   numeric(5,2),
  coverage_limit  numeric(12,2),
  is_active       boolean not null default true,
  valid_from      date,
  valid_to        date,
  created_at      timestamptz default now(),
  updated_at      timestamptz default now()
);

-- Charges
create table if not exists charges (
  id              uuid primary key default gen_random_uuid(),
  patient_id      uuid references patients(id) on delete cascade not null,
  encounter_id    uuid references encounters(id) on delete set null,
  block_id        uuid references blocks(id) on delete set null,
  service_item_id uuid references service_items(id) on delete set null,
  invoice_id      uuid,  -- FK added below after invoices table exists
  description     text not null,
  quantity        integer not null default 1,
  unit_price      numeric(12,2) not null,
  status          text not null default 'pending'
    check (status in ('pending','pending_approval','pending_insurance','invoiced','paid','waived','void')),
  voided_reason   text,
  source          text not null default 'manual'
    check (source in ('manual','block_auto','encounter_close','department')),
  created_by      uuid references auth.users(id),
  created_at      timestamptz default now()
);

-- Invoices
create table if not exists invoices (
  id             uuid primary key default gen_random_uuid(),
  patient_id     uuid references patients(id) on delete cascade not null,
  invoice_number text unique not null,
  subtotal       numeric(12,2) not null,
  discount       numeric(12,2) not null default 0,
  total          numeric(12,2) not null,
  status         text not null default 'draft'
    check (status in ('draft','issued','partial','paid','overdue','cancelled')),
  issued_at      timestamptz,
  due_date       date,
  notes          text,
  created_by     uuid references auth.users(id),
  created_at     timestamptz default now()
);

-- FK from charges → invoices
do $$ begin
  if not exists (
    select 1 from information_schema.table_constraints
    where constraint_name = 'charges_invoice_id_fkey'
  ) then
    alter table charges
      add constraint charges_invoice_id_fkey
      foreign key (invoice_id) references invoices(id) on delete set null;
  end if;
end $$;

-- Payments
create table if not exists payments (
  id          uuid primary key default gen_random_uuid(),
  patient_id  uuid references patients(id) on delete cascade not null,
  invoice_id  uuid references invoices(id) on delete set null,
  amount      numeric(12,2) not null,
  method      text not null
    check (method in ('cash','card','mobile_money','insurance','bank_transfer','deposit')),
  reference   text,
  payer_name  text,
  notes       text,
  received_by uuid references auth.users(id),
  created_at  timestamptz default now()
);

-- Deposits (advance payments)
create table if not exists patient_deposits (
  id          uuid primary key default gen_random_uuid(),
  patient_id  uuid references patients(id) on delete cascade not null,
  amount      numeric(12,2) not null,
  remaining   numeric(12,2) not null,
  method      text,
  reference   text,
  notes       text,
  received_by uuid references auth.users(id),
  created_at  timestamptz default now()
);

-- Patient balance view
create or replace view patient_balance as
select
  p.id as patient_id,
  coalesce(sum(c.quantity * c.unit_price) filter (where c.status not in ('void','waived','pending_approval','pending_insurance')), 0) as total_charges,
  coalesce((select sum(pay.amount) from payments pay where pay.patient_id = p.id), 0) as total_payments,
  coalesce((select sum(d.remaining) from patient_deposits d where d.patient_id = p.id and d.remaining > 0), 0) as deposit_balance,
  coalesce(sum(c.quantity * c.unit_price) filter (where c.status not in ('void','waived','pending_approval','pending_insurance')), 0)
    - coalesce((select sum(pay.amount) from payments pay where pay.patient_id = p.id), 0)
    as balance
from patients p
left join charges c on c.patient_id = p.id
group by p.id;

-- Billing indexes
create index if not exists idx_charges_patient        on charges(patient_id);
create index if not exists idx_charges_encounter      on charges(encounter_id) where encounter_id is not null;
create index if not exists idx_charges_block          on charges(block_id) where block_id is not null;
create index if not exists idx_charges_status         on charges(status);
create index if not exists idx_payments_patient       on payments(patient_id);
create index if not exists idx_payments_invoice       on payments(invoice_id) where invoice_id is not null;
create index if not exists idx_invoices_patient       on invoices(patient_id);
create index if not exists idx_invoices_status        on invoices(status);
create index if not exists idx_patient_insurance_pt   on patient_insurance(patient_id);
create index if not exists idx_patient_deposits_pt    on patient_deposits(patient_id);
create index if not exists idx_service_items_active   on service_items(active, sort_order);

-- Billing triggers
drop trigger if exists patient_insurance_updated_at on patient_insurance;
create trigger patient_insurance_updated_at
  before update on patient_insurance for each row execute function update_updated_at();

-- ============================================================
-- 12. ROW LEVEL SECURITY
-- ============================================================

alter table profiles                   enable row level security;
alter table roles                      enable row level security;
alter table user_roles                 enable row level security;
alter table app_settings               enable row level security;
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
alter table departments                enable row level security;
alter table department_block_types add column if not exists built_in_type text;
alter table department_block_types add column if not exists charge_mode text not null default 'auto' check (charge_mode in ('auto','confirm'));
alter table department_block_types     enable row level security;
alter table department_members         enable row level security;

-- Drop all existing policies (idempotent)
drop policy if exists "app_settings_read"                on app_settings;
drop policy if exists "app_settings_admin_write"         on app_settings;
drop policy if exists "profiles_select"                  on profiles;
drop policy if exists "profiles_insert"                  on profiles;
drop policy if exists "profiles_update"                  on profiles;
drop policy if exists "roles_select"                     on roles;
drop policy if exists "user_roles_select"                on user_roles;
drop policy if exists "auth_all_patients"                on patients;
drop policy if exists "read_patient_fields"              on patient_field_definitions;
drop policy if exists "admin_mutate_patient_fields"      on patient_field_definitions;
drop policy if exists "auth_all_problems"                on patient_problems;
drop policy if exists "auth_all_problem_history"         on patient_problem_history;
drop policy if exists "auth_all_medications"             on patient_medications;
drop policy if exists "auth_all_med_history"             on patient_medication_history;
drop policy if exists "auth_all_allergies"               on patient_allergies;
drop policy if exists "auth_all_archive"                 on patient_archive;
drop policy if exists "encounter_staff_access"           on encounters;
drop policy if exists "select_block_defs"                on block_definitions;
drop policy if exists "insert_block_defs"                on block_definitions;
drop policy if exists "update_block_defs"                on block_definitions;
drop policy if exists "delete_block_defs"                on block_definitions;
drop policy if exists "block_staff_access"               on blocks;
drop policy if exists "auth_all_block_entries"           on block_entries;
drop policy if exists "auth_all_block_attachments"       on block_attachments;
drop policy if exists "auth_all_block_actions"           on block_actions;
drop policy if exists "auth_all_block_acks"              on block_acknowledgments;
drop policy if exists "select_templates"                 on encounter_templates;
drop policy if exists "insert_templates"                 on encounter_templates;
drop policy if exists "update_templates"                 on encounter_templates;
drop policy if exists "delete_templates"                 on encounter_templates;
drop policy if exists "auth_all_departments"             on departments;
drop policy if exists "auth_all_department_block_types"  on department_block_types;
drop policy if exists "auth_all_department_members"      on department_members;

-- Profiles
create policy "app_settings_read"        on app_settings for select using (auth.uid() is not null);
create policy "app_settings_admin_write" on app_settings for all    using (auth.uid() is not null) with check (auth.uid() is not null);

create policy "profiles_select" on profiles for select using (auth.uid() is not null);
create policy "profiles_insert" on profiles for insert with check (true);
create policy "profiles_update" on profiles for update using (id = auth.uid());

-- Roles: read-only via RLS; admin writes via service-role key
create policy "roles_select"      on roles      for select using (auth.uid() is not null);
create policy "user_roles_select" on user_roles for select using (auth.uid() is not null);

-- Clinical data
create policy "auth_all_patients"        on patients               for all using (auth.uid() is not null);
create policy "auth_all_problems"        on patient_problems       for all using (auth.uid() is not null);
create policy "auth_all_problem_history" on patient_problem_history for all using (auth.uid() is not null);
create policy "auth_all_medications"     on patient_medications    for all using (auth.uid() is not null);
create policy "auth_all_med_history"     on patient_medication_history for all using (auth.uid() is not null);
create policy "auth_all_allergies"       on patient_allergies      for all using (auth.uid() is not null);
create policy "auth_all_archive"         on patient_archive        for all using (auth.uid() is not null);
create policy "read_patient_fields"         on patient_field_definitions for select using (auth.uid() is not null);
create policy "admin_mutate_patient_fields" on patient_field_definitions for all    using (auth.uid() is not null);

-- Encounters: staff visibility
create policy "encounter_staff_access" on encounters for all using (
  auth.uid() is not null and (
    visibility = 'staff'
    or created_by = auth.uid()
    or assigned_to = auth.uid()
    or (visibility = 'private' and created_by = auth.uid())
    or (visibility = 'restricted' and (
      created_by = auth.uid()
      or assigned_to = auth.uid()
      or exists (
        select 1 from user_roles ur join roles r on r.id = ur.role_id
        where ur.user_id = auth.uid() and r.slug = any(visible_to_roles)
      )
    ))
  )
);

-- Block definitions: builtins + universals visible to all; custom scoped to creator
create policy "select_block_defs" on block_definitions for select
  using (is_builtin = true or is_universal = true or created_by = auth.uid());
create policy "insert_block_defs" on block_definitions for insert
  with check (auth.uid() is not null);
create policy "update_block_defs" on block_definitions for update
  using (created_by = auth.uid());
create policy "delete_block_defs" on block_definitions for delete
  using (created_by = auth.uid());

-- Blocks
create policy "block_staff_access" on blocks for all using (
  auth.uid() is not null
  -- Must have clinical permission to see block contents
  and exists (
    select 1 from user_roles ur
    join roles r on r.id = ur.role_id
    where ur.user_id = auth.uid()
    and r.permissions && array['block.add', 'encounter.view_all']
  )
  -- Must have access to the parent encounter (or be a department entry with no encounter)
  and (
    blocks.encounter_id is null
    or exists (
      select 1 from encounters e where e.id = blocks.encounter_id
      and (
        e.visibility = 'staff'
        or e.created_by = auth.uid()
        or e.assigned_to = auth.uid()
        or (e.visibility = 'restricted' and (
          e.created_by = auth.uid()
          or e.assigned_to = auth.uid()
          or exists (
            select 1 from user_roles ur2 join roles r2 on r2.id = ur2.role_id
            where ur2.user_id = auth.uid() and r2.slug = any(e.visible_to_roles)
          )
        ))
      )
    )
  )
  -- Block-level role restriction
  and (
    array_length(visible_to_roles, 1) is null
    or created_by = auth.uid()
    or exists (
      select 1 from user_roles ur join roles r on r.id = ur.role_id
      where ur.user_id = auth.uid() and r.slug = any(visible_to_roles)
    )
  )
);
create policy "auth_all_block_entries"     on block_entries         for all using (auth.uid() is not null);
create policy "auth_all_block_attachments" on block_attachments     for all using (auth.uid() is not null);
create policy "auth_all_block_actions"     on block_actions         for all using (auth.uid() is not null);
create policy "auth_all_block_acks"        on block_acknowledgments for all using (auth.uid() is not null);

-- Templates
create policy "select_templates" on encounter_templates for select
  using (is_universal = true or created_by = auth.uid());
create policy "insert_templates" on encounter_templates for insert
  with check (auth.uid() is not null and is_universal = false);
create policy "update_templates" on encounter_templates for update
  using (created_by = auth.uid() and is_universal = false);
create policy "delete_templates" on encounter_templates for delete
  using (created_by = auth.uid() and is_universal = false);

-- Departments: all authenticated users can read/write (admin-guarded in UI)
create policy "auth_all_departments"            on departments            for all to authenticated using (true) with check (true);
create policy "auth_all_department_block_types" on department_block_types for all to authenticated using (true) with check (true);
create policy "auth_all_department_members"     on department_members     for all to authenticated using (true) with check (true);

-- ============================================================
-- 12b. BILLING RLS
-- ============================================================

-- Helper: does the current user have any billing permission?
create or replace function has_billing_access()
returns boolean language sql security definer stable
set search_path = public
as $$
  select exists (
    select 1 from user_roles ur
    join roles r on r.id = ur.role_id
    where ur.user_id = auth.uid()
    and r.permissions && array['billing.charge','billing.payment','billing.manage_fees']
  )
$$;

create or replace function can_manage_fees()
returns boolean language sql security definer stable
set search_path = public
as $$
  select exists (
    select 1 from user_roles ur
    join roles r on r.id = ur.role_id
    where ur.user_id = auth.uid()
    and 'billing.manage_fees' = any(r.permissions)
  )
$$;

create or replace function can_billing_charge()
returns boolean language sql security definer stable
set search_path = public
as $$
  select exists (
    select 1 from user_roles ur
    join roles r on r.id = ur.role_id
    where ur.user_id = auth.uid()
    and 'billing.charge' = any(r.permissions)
  )
$$;

create or replace function can_billing_payment()
returns boolean language sql security definer stable
set search_path = public
as $$
  select exists (
    select 1 from user_roles ur
    join roles r on r.id = ur.role_id
    where ur.user_id = auth.uid()
    and 'billing.payment' = any(r.permissions)
  )
$$;

alter table service_items      enable row level security;
alter table charges            enable row level security;
alter table payments           enable row level security;
alter table patient_deposits   enable row level security;
alter table invoices           enable row level security;
alter table patient_insurance  enable row level security;

-- Drop billing policies (idempotent)
drop policy if exists "billing_read_service_items"    on service_items;
drop policy if exists "billing_manage_service_items"  on service_items;
drop policy if exists "billing_read_charges"          on charges;
drop policy if exists "billing_insert_charges"        on charges;
drop policy if exists "billing_update_charges"        on charges;
drop policy if exists "billing_read_payments"         on payments;
drop policy if exists "billing_insert_payments"       on payments;
drop policy if exists "billing_read_deposits"         on patient_deposits;
drop policy if exists "billing_insert_deposits"       on patient_deposits;
drop policy if exists "billing_update_deposits"       on patient_deposits;
drop policy if exists "billing_read_invoices"         on invoices;
drop policy if exists "billing_mutate_invoices"       on invoices;
drop policy if exists "billing_all_insurance"         on patient_insurance;

-- SERVICE ITEMS: anyone with billing access can read; only fee managers can mutate
create policy "billing_read_service_items" on service_items
  for select using (auth.uid() is not null);
create policy "billing_manage_service_items" on service_items
  for all using (can_manage_fees()) with check (can_manage_fees());

-- CHARGES: anyone with billing access can read; chargers can insert/update
--           dept auto-charges (source='block_auto' or 'department') are allowed for any authenticated user
create policy "billing_read_charges" on charges
  for select using (
    has_billing_access()
    OR source IN ('block_auto', 'department')
  );
create policy "billing_insert_charges" on charges
  for insert with check (
    can_billing_charge()
    OR source IN ('block_auto', 'department')
  );
create policy "billing_update_charges" on charges
  for update using (can_billing_charge());

-- PAYMENTS: anyone with billing access can read; payment receivers can insert
create policy "billing_read_payments" on payments
  for select using (has_billing_access());
create policy "billing_insert_payments" on payments
  for insert with check (can_billing_payment());

-- DEPOSITS: same as payments
create policy "billing_read_deposits" on patient_deposits
  for select using (has_billing_access());
create policy "billing_insert_deposits" on patient_deposits
  for insert with check (can_billing_payment());
create policy "billing_update_deposits" on patient_deposits
  for update using (can_billing_payment());

-- INVOICES: anyone with billing access can read; chargers can create/update
create policy "billing_read_invoices" on invoices
  for select using (has_billing_access());
create policy "billing_mutate_invoices" on invoices
  for all using (can_billing_charge()) with check (can_billing_charge());

-- PATIENT INSURANCE: anyone with billing access can read/write
create policy "billing_all_insurance" on patient_insurance
  for all using (has_billing_access()) with check (has_billing_access());

-- ============================================================
-- 13. SEED DATA (idempotent — safe to re-run)
-- ============================================================

-- Built-in block definitions
insert into block_definitions (name, slug, icon, color, description, is_builtin, cap_media, cap_immutable, sort_order, fields)
values
  ('Note',               'note',             'file-text',      'blue',    'Free-text note with file and photo attachments',          true, true,  false,  10, '[]'::jsonb),
  ('Vitals',             'vitals',           'activity',       'red',     'Immutable vital signs record with NEWS2 scoring',         true, false, true,   20, '[]'::jsonb),
  ('H&P',                'hx_physical',      'stethoscope',    'violet',  'History and Physical — CC, HPI, ROS, Exam',               true, false, false,  15, '[]'::jsonb),
  ('Assessment & Plan',  'plan',             'clipboard-list', 'emerald', 'Problem-based plan with chart problem import',            true, false, false,  25, '[]'::jsonb),
  ('Media',              'media',            'camera',         'cyan',    'Photo and file attachments with optional caption',        true, true,  false,  30, '[]'::jsonb),
  ('Clinical Score',     'score',            'calculator',     'indigo',  'GCS, CURB-65, Wells DVT/PE, HEART — calculated scores',  true, false, true,   35, '[]'::jsonb),
  ('Ward Round Note',    'tour',             'clipboard',      'teal',    'SOAP ward round note with task list',                    true, false, false,  40, '[]'::jsonb),
  ('Procedure Note',     'procedure_note',   'scissors',       'orange',  'Structured operative and procedural note',               true, true,  true,   45, '[]'::jsonb),
  ('Anaesthetic Note',   'anaesthetic_note', 'zap',            'rose',    'General, regional, spinal, epidural anaesthetic record', true, false, true,   50, '[]'::jsonb),
  ('Pain Assessment',    'pain_assessment',  'heart',          'pink',    '0–10 pain score with character, location, intervention', true, false, false,  55, '[]'::jsonb),
  ('Wound Care',         'wound_care',       'layers',         'amber',   'Wound assessment, appearance, dressing, and plan',       true, true,  false,  60, '[]'::jsonb),
  ('Lab Order',          'lab_order',        'flask-conical',  'sky',     'Order a lab panel — routed to the laboratory department',      true, false, false, 22, '[]'::jsonb),
  ('Lab Result',         'lab_result',       'test-tube',      'green',   'Enter structured lab results with auto ref-range flagging',    true, false, false, 23, '[]'::jsonb),
  ('Nurse Note',         'nurse_note',       'book-open',      'purple',  'Chronological nursing observation and care log',               true, false, false, 30, '[]'::jsonb),
  ('Consultation',       'consultation',     'message-square', 'fuchsia', 'Specialist consultation request with question and response',   true, false, false, 35, '[]'::jsonb),
  ('Discharge Note',     'dc_note',          'log-out',        'slate',   'Structured discharge summary with diagnoses and instructions', true, false, false, 90, '[]'::jsonb),
  ('Medications',        'meds',             'pill',           'lime',    'Active medication list with dose, route, frequency and status',true, false, false, 15, '[]'::jsonb)
on conflict (slug) do update set
  name                   = excluded.name,
  icon                   = excluded.icon,
  color                  = excluded.color,
  description            = excluded.description,
  cap_media              = excluded.cap_media,
  cap_immutable          = excluded.cap_immutable,
  sort_order             = excluded.sort_order;

-- Remove legacy built-in blocks no longer in the registry
delete from block_definitions where is_builtin = true and slug not in (
  'note','vitals','hx_physical','plan','media','score','tour',
  'procedure_note','anaesthetic_note','pain_assessment','wound_care','lab_order','lab_result',
  'nurse_note','consultation','dc_note','meds'
);

-- System roles
insert into roles (name, slug, description, is_system, sort_order, permissions) values
  ('System Admin', 'admin',
   'Full access to all features including user and role management',
   true, 10,
   array['block.add','admin.manage_users','admin.manage_blocks','admin.manage_templates','template.create',
         'billing.charge','billing.payment','billing.manage_fees']),
  ('Physician', 'physician',
   'Full clinical access — create encounters, add all block types, edit patient records',
   true, 20,
   array['block.add','template.create']),
  ('Nurse', 'nurse',
   'Can add blocks and view encounters; cannot create encounters or edit the master record',
   true, 30,
   array['block.add']),
  ('Receptionist', 'receptionist',
   'Can register patients and create/assign encounters',
   true, 40,
   array[]::text[]),
  ('Lab Technician', 'lab_tech',
   'Can receive and fulfill lab orders, create direct lab entries',
   true, 50,
   array[]::text[]),
  ('Radiographer', 'radiographer',
   'Can receive and fulfill radiology orders, create direct radiology entries',
   true, 60,
   array[]::text[]),
  ('Pharmacist', 'pharmacist',
   'Can receive and fulfill pharmacy orders, dispense medications',
   true, 70,
   array[]::text[]),
  ('Billing', 'billing',
   'Can view billing dashboard, manage charges, receive payments, and generate invoices',
   true, 45,
   array['billing.charge','billing.payment','billing.manage_fees']::text[])
on conflict (slug) do update set
  name        = excluded.name,
  description = excluded.description,
  permissions = excluded.permissions;

-- Patient field definitions
insert into patient_field_definitions (label, slug, field_type, is_required, is_system, sort_order, options) values
  ('First Name',         'first_name',         'text',     true,  true,  10, '[]'::jsonb),
  ('Middle Name',        'middle_name',         'text',     false, true,  15, '[]'::jsonb),
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

-- Bootstrap: assign admin role to all existing users (new users get roles via Settings → Users)
insert into user_roles (user_id, role_id)
select p.id, r.id
from profiles p cross join roles r
where r.slug = 'admin'
on conflict do nothing;

-- Default app settings
insert into app_settings (key, value) values
  ('name_format', 'two'),
  ('billing_enabled', 'false'),
  ('currency', 'USD')
on conflict (key) do nothing;

-- ============================================================
-- 14. RPCs
-- ============================================================

-- All permission slugs for the current user
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

-- Patient search RPC — flexible multi-token search across name/MRN/phone/DOB
-- Supports 100k+ patients via trigram GIN indexes (see section 9 indexes above).
--
-- Parameters:
--   p_tokens         text[]   — each token must match first_name, last_name, MRN, or phone (any order)
--   p_year           int      — birth year filter (AND with tokens)
--   p_created_by     uuid     — restrict to patients registered by this user
--   p_assigned_to    uuid     — restrict to patients with an encounter assigned to this user
--   p_open_encounter boolean  — only patients with ≥1 open encounter
--   p_limit          int      — page size  (default 50)
--   p_offset         int      — pagination offset (default 0)
do $$
declare r record;
begin
  for r in select oid::regprocedure as sig from pg_proc where proname = 'search_patients' loop
    execute 'drop function if exists ' || r.sig || ' cascade';
  end loop;
end $$;
create or replace function search_patients(
  p_tokens         text[]   default null,
  p_year           int      default null,
  p_created_by     uuid     default null,
  p_assigned_to    uuid     default null,
  p_open_encounter boolean  default false,
  p_limit          int      default 50,
  p_offset         int      default 0
)
returns table (
  id                      uuid,
  mrn                     text,
  first_name              text,
  middle_name             text,
  last_name               text,
  date_of_birth           date,
  date_of_birth_precision text,
  gender                  text,
  phone                   text,
  blood_group             text,
  photo_url               text,
  custom_fields           jsonb,
  created_by              uuid,
  created_at              timestamptz,
  updated_at              timestamptz,
  total_count             bigint
)
language sql stable security definer
as $$
  select
    pt.id, pt.mrn, pt.first_name, pt.middle_name, pt.last_name,
    pt.date_of_birth, pt.date_of_birth_precision,
    pt.gender, pt.phone, pt.blood_group, pt.photo_url,
    pt.custom_fields, pt.created_by, pt.created_at, pt.updated_at,
    count(*) over() as total_count
  from patients pt
  where
    (p_tokens is null or cardinality(p_tokens) = 0 or (
      (pt.first_name ilike '%' || p_tokens[1] || '%' or pt.middle_name ilike '%' || p_tokens[1] || '%' or pt.last_name ilike '%' || p_tokens[1] || '%'
       or pt.mrn ilike '%' || p_tokens[1] || '%' or pt.phone ilike '%' || p_tokens[1] || '%')
      and (array_length(p_tokens, 1) < 2
        or pt.first_name ilike '%' || p_tokens[2] || '%' or pt.middle_name ilike '%' || p_tokens[2] || '%' or pt.last_name ilike '%' || p_tokens[2] || '%'
        or pt.mrn ilike '%' || p_tokens[2] || '%' or pt.phone ilike '%' || p_tokens[2] || '%')
      and (array_length(p_tokens, 1) < 3
        or pt.first_name ilike '%' || p_tokens[3] || '%' or pt.middle_name ilike '%' || p_tokens[3] || '%' or pt.last_name ilike '%' || p_tokens[3] || '%'
        or pt.mrn ilike '%' || p_tokens[3] || '%' or pt.phone ilike '%' || p_tokens[3] || '%')
      and (array_length(p_tokens, 1) < 4
        or pt.first_name ilike '%' || p_tokens[4] || '%' or pt.middle_name ilike '%' || p_tokens[4] || '%' or pt.last_name ilike '%' || p_tokens[4] || '%'
        or pt.mrn ilike '%' || p_tokens[4] || '%' or pt.phone ilike '%' || p_tokens[4] || '%')
    ))
    and (p_year is null or (
      pt.date_of_birth >= make_date(p_year, 1, 1) and pt.date_of_birth < make_date(p_year + 1, 1, 1)
    ))
    and (p_created_by is null or pt.created_by = p_created_by)
    and (p_assigned_to is null or exists (
      select 1 from encounters e where e.patient_id = pt.id and e.assigned_to = p_assigned_to
    ))
    and (not p_open_encounter or exists (
      select 1 from encounters e where e.patient_id = pt.id and e.status = 'open'
    ))
  order by pt.created_at desc
  limit  p_limit
  offset p_offset;
$$;

grant execute on function search_patients      to authenticated;
grant execute on function get_my_permissions   to authenticated;
grant execute on function get_my_role_slugs    to authenticated;
grant execute on function get_users_with_roles to authenticated;
grant execute on function has_billing_access   to authenticated;
grant execute on function can_manage_fees      to authenticated;
grant execute on function can_billing_charge   to authenticated;
grant execute on function can_billing_payment  to authenticated;

-- ============================================================
-- 15. REALTIME PUBLICATIONS
-- ============================================================

do $$ begin alter publication supabase_realtime add table blocks;               exception when duplicate_object then null; end $$;
do $$ begin alter publication supabase_realtime add table encounters;            exception when duplicate_object then null; end $$;
do $$ begin alter publication supabase_realtime add table block_entries;         exception when duplicate_object then null; end $$;
do $$ begin alter publication supabase_realtime add table block_attachments;     exception when duplicate_object then null; end $$;
do $$ begin alter publication supabase_realtime add table block_acknowledgments; exception when duplicate_object then null; end $$;
do $$ begin alter publication supabase_realtime add table encounter_templates;   exception when duplicate_object then null; end $$;
do $$ begin alter publication supabase_realtime add table block_actions;         exception when duplicate_object then null; end $$;
do $$ begin alter publication supabase_realtime add table department_block_types; exception when duplicate_object then null; end $$;

-- ============================================================
-- 16. STORAGE BUCKETS & POLICIES
-- ============================================================

insert into storage.buckets (id, name, public) values ('block-media',    'block-media',    true)  on conflict (id) do nothing;
insert into storage.buckets (id, name, public) values ('patient-photos', 'patient-photos', true)  on conflict (id) do nothing;
insert into storage.buckets (id, name, public) values ('patient-docs',   'patient-docs',   false) on conflict (id) do nothing;

drop policy if exists "block_media_insert"    on storage.objects;
drop policy if exists "block_media_select"    on storage.objects;
drop policy if exists "block_media_delete"    on storage.objects;
drop policy if exists "patient_photos_insert" on storage.objects;
drop policy if exists "patient_photos_select" on storage.objects;
drop policy if exists "patient_photos_delete" on storage.objects;
drop policy if exists "patient_docs_insert"   on storage.objects;
drop policy if exists "patient_docs_select"   on storage.objects;
drop policy if exists "patient_docs_delete"   on storage.objects;

create policy "block_media_insert"    on storage.objects for insert with check (bucket_id = 'block-media'    and auth.uid() is not null);
create policy "block_media_select"    on storage.objects for select using      (bucket_id = 'block-media');
create policy "block_media_delete"    on storage.objects for delete using      (bucket_id = 'block-media'    and auth.uid() is not null);
create policy "patient_photos_insert" on storage.objects for insert with check (bucket_id = 'patient-photos' and auth.uid() is not null);
create policy "patient_photos_select" on storage.objects for select using      (bucket_id = 'patient-photos');
create policy "patient_photos_delete" on storage.objects for delete using      (bucket_id = 'patient-photos' and auth.uid() is not null);
create policy "patient_docs_insert"   on storage.objects for insert with check (bucket_id = 'patient-docs'   and auth.uid() is not null);
create policy "patient_docs_select"   on storage.objects for select using      (bucket_id = 'patient-docs'   and auth.uid() is not null);
create policy "patient_docs_delete"   on storage.objects for delete using      (bucket_id = 'patient-docs'   and auth.uid() is not null);

