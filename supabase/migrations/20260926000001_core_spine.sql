-- 01 · core: roles, schemas and every table of the spine and the core stores (spec/openCare.md §2–§3).
-- The migrations before this rebuild are in supabase/archive/. Nothing here knows any entry type or any medicine.

set client_min_messages = warning;

-- ── roles: the base and each pack own their functions; the eraser owns the two exceptions (§1, §3.11) ──
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'base_role') then create role base_role nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'core_eraser') then create role core_eraser nologin; end if;
end $$;
grant base_role, core_eraser to postgres;   -- the migration runner is not a superuser; it must be allowed to SET ROLE

create extension if not exists pgcrypto with schema extensions;
create extension if not exists "uuid-ossp" with schema extensions;
create extension if not exists pg_trgm with schema extensions;
create extension if not exists unaccent with schema extensions;
create extension if not exists pg_jsonschema with schema extensions;
create extension if not exists pg_cron;

create schema core;
comment on schema core is 'openCare spine and core: entries, people, patients, places, registry, settings, codes, counters, files. No types, no medicine.';
revoke all on schema core from public;

-- ── places (§3.3) ──
create table core.organizations (
  id          uuid primary key,
  name        text not null check (length(trim(name)) > 0),
  created_at  timestamptz not null default now(),
  retired_at  timestamptz
);
create table core.sites (
  organization_id uuid not null references core.organizations,
  id          uuid not null,
  name        text not null check (length(trim(name)) > 0),
  address     jsonb,
  retired_at  timestamptz,
  primary key (organization_id, id)
);
-- work: the core key; what each means is the base's (§3.3)
create table core.departments (
  organization_id uuid not null references core.organizations,
  id          uuid not null,
  site_id     uuid,
  name        text not null check (length(trim(name)) > 0),
  work        text not null check (work in ('desk', 'visits', 'stays', 'bench', 'outside')),
  position    int not null default 0,
  created_at  timestamptz not null default now(),
  retired_at  timestamptz,
  primary key (organization_id, id),
  foreign key (organization_id, site_id) references core.sites
);
create unique index departments_one_outside on core.departments (organization_id) where work = 'outside';
create table core.places (
  organization_id uuid not null references core.organizations,
  id          uuid not null,
  department_id uuid not null,
  parent_id   uuid,
  label       text not null default 'bed' check (label in ('bed', 'room', 'chair', 'cubicle')),
  name        text not null check (length(trim(name)) > 0),
  position    int not null default 0,
  retired_at  timestamptz,
  primary key (organization_id, id),
  foreign key (organization_id, department_id) references core.departments,
  foreign key (organization_id, parent_id) references core.places
);

-- ── people (§3.1) ──
create table core.users (
  organization_id uuid not null references core.organizations,
  id          uuid not null,
  login_id    uuid,
  kind        text not null default 'staff' check (kind in ('staff', 'machine', 'importer', 'patient')),
  name        text not null check (length(trim(name)) > 0),
  title       text,
  created_at  timestamptz not null default now(),
  signed_in_at timestamptz,
  retired_at  timestamptz,
  primary key (organization_id, id),
  unique (id),
  unique (organization_id, login_id)
);
create index users_login on core.users (login_id);
-- a login with several users binds one to its session (the JWT's session_id), §3.1
create table core.sessions (
  session_id  uuid primary key,
  login_id    uuid not null,
  organization_id uuid not null,
  user_id     uuid not null,
  chosen_at   timestamptz not null default now(),
  foreign key (organization_id, user_id) references core.users
);
-- roles: built-in roles have no organization and belong to a layer; a clinic's own are copies (§3.1)
create table core.roles (
  id          uuid primary key,
  organization_id uuid references core.organizations,
  layer       text,
  key         text not null check (key ~ '^[a-z0-9_.:-]+$'),
  name        text not null,
  labels      jsonb not null default '{}',
  every_action boolean not null default false,       -- the Owner: every action of every layer the organization uses
  built_on    uuid references core.roles,             -- a specialist built on a base role holds that role's actions as they stand now (§5.2)
  everyday    boolean not null default false,         -- the base's Doctor and Nurse: a pack's everyday actions where the department uses it
  created_at  timestamptz not null default now(),
  retired_at  timestamptz,
  check ((organization_id is null) = (layer is not null))
);
create unique index roles_key on core.roles (coalesce(organization_id, '00000000-0000-0000-0000-000000000000'::uuid), key);
create table core.holdings (
  organization_id uuid not null,
  id          uuid not null default gen_random_uuid(),
  user_id     uuid not null,
  role_id     uuid not null references core.roles,
  department_id uuid,                          -- null: held everywhere
  valid_from  timestamptz not null default now(),
  valid_until timestamptz,
  recorded_by uuid,
  recorded_at timestamptz not null default now(),
  primary key (organization_id, id),
  foreign key (organization_id, user_id) references core.users,
  foreign key (organization_id, department_id) references core.departments
);
create index holdings_user on core.holdings (organization_id, user_id);
create table core.holding_ends (
  organization_id uuid not null,
  holding_id  uuid not null,
  ended_at    timestamptz not null default now(),
  ended_by    uuid,
  primary key (organization_id, holding_id),
  foreign key (organization_id, holding_id) references core.holdings
);
-- identifiers of users, organizations, sites and departments, stored like a patient's (§3.1)
create table core.identifiers (
  organization_id uuid not null references core.organizations,
  owner_kind  text not null check (owner_kind in ('organization', 'site', 'department', 'user')),
  owner_id    uuid not null,
  system      text not null,
  value       text not null,
  verified    boolean not null default false,
  recorded_at timestamptz not null default now(),
  primary key (organization_id, owner_kind, owner_id, system, value)
);

-- ── patients (§3.2) ──
create table core.patients (
  organization_id uuid not null references core.organizations,
  id          uuid not null,
  number      bigint not null,
  given       text[] not null default '{}',     -- own, father, grandfather
  family      text,
  full_name   text not null,
  latin       text,
  folded      text not null,                    -- Arabic-folded, lower case: the search key
  gender      text not null default 'unknown' check (gender in ('male', 'female', 'other', 'unknown')),
  birth_date  date,
  birth_precision text not null default 'day' check (birth_precision in ('year', 'month', 'day')),
  birth_estimated boolean not null default false,
  anonymous   boolean not null default false,
  telecom     jsonb not null default '[]',      -- [{system: phone|email, value}]
  address     jsonb,
  merged_into uuid,
  created_by  uuid,
  created_at  timestamptz not null default now(),
  changed_at  timestamptz not null default now(),
  primary key (organization_id, id),
  unique (organization_id, number),
  foreign key (organization_id, merged_into) references core.patients
);
create index patients_folded on core.patients using gin (folded extensions.gin_trgm_ops);
create index patients_merged on core.patients (organization_id, merged_into) where merged_into is not null;
create table core.patient_identifiers (
  organization_id uuid not null,
  patient_id  uuid not null,
  system      text not null,
  value       text not null,
  verified    boolean not null default false,
  primary key (organization_id, patient_id, system, value),
  foreign key (organization_id, patient_id) references core.patients
);
create index patient_identifiers_value on core.patient_identifiers (organization_id, value);
-- every identity change, a full snapshot: the patient row is the current state built from them
create table core.patient_changes (
  organization_id uuid not null,
  id          uuid not null default gen_random_uuid(),
  patient_id  uuid not null,
  data        jsonb not null,
  reason      text,
  author_id   uuid,
  recorded_at timestamptz not null default clock_timestamp(),
  primary key (organization_id, id),
  foreign key (organization_id, patient_id) references core.patients
);
create index patient_changes_patient on core.patient_changes (organization_id, patient_id, recorded_at);
create table core.patient_relations (
  organization_id uuid not null,
  id          uuid not null default gen_random_uuid(),
  patient_id  uuid not null,
  relation    text not null check (relation in ('mother_of', 'guardian_of', 'not_same_as')),
  other_id    uuid not null,
  author_id   uuid,
  recorded_at timestamptz not null default now(),
  ended_at    timestamptz,
  primary key (organization_id, id),
  foreign key (organization_id, patient_id) references core.patients,
  foreign key (organization_id, other_id) references core.patients
);
create table core.merges (
  organization_id uuid not null,
  id          uuid not null default gen_random_uuid(),
  from_id     uuid not null,
  into_id     uuid not null,
  reason      text,
  author_id   uuid,
  recorded_at timestamptz not null default clock_timestamp(),
  primary key (organization_id, id)
);

-- ── the registry (§3.8): written only by migrations through core.declare_* ──
create table core.layers (
  key         text primary key check (key ~ '^[a-z][a-z0-9_]*$'),
  role_name   text not null,
  schema_name text not null,
  version     int not null default 1,
  requires    text[] not null default '{}',
  labels      jsonb not null default '{}',
  is_pack     boolean not null default false,
  declared_at timestamptz not null default now()
);
create table core.types (
  key         text not null check (key ~ '^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)?$'),
  version     int not null check (version > 0),
  layer       text not null references core.layers,
  base_type   text,
  shape       jsonb not null,
  resources   text[] not null default '{}',
  profile     text,
  to_fhir     regprocedure,
  line        regprocedure not null,
  checks      regprocedure[] not null default '{}',
  feeds       text[] not null default '{}',
  claims      regprocedure,
  may_be_private boolean not null default false,
  in_record   boolean not null default true,
  other_patient boolean not null default false,
  labels      jsonb not null default '{}',
  hashes      jsonb not null default '{}',
  declared_at timestamptz not null default now(),
  primary key (key, version)
);
create table core.systems (
  key         text primary key check (key ~ '^[a-z0-9][a-z0-9_.-]*$'),
  layer       text not null references core.layers,
  kind        text not null check (kind in ('code', 'identifier')),
  uri         text not null,
  version     text,
  closed      boolean not null default false,
  check_fn    regprocedure,
  licence     text,
  labels      jsonb not null default '{}',
  hashes      jsonb not null default '{}'
);
create table core.derived (
  key         text primary key,
  position    int generated always as identity,    -- refreshes run in declaration order: a table may read the ones before it
  layer       text not null references core.layers,
  relation    regclass not null,
  refresh     regprocedure not null,
  action      text not null,
  hashes      jsonb not null default '{}'
);
create table core.rules (
  key         text primary key,
  layer       text not null references core.layers,
  hidden      regprocedure not null,
  hashes      jsonb not null default '{}'
);
create table core.actions (
  key         text primary key check (key ~ '^[a-z]+:[a-z0-9_.]+$'),
  layer       text not null references core.layers,
  scope       text not null default 'department' check (scope in ('department', 'organization')),
  everyday    boolean not null default false,         -- a pack's: held by the everyday roles where a department uses the pack (§5.2)
  labels      jsonb not null default '{}'
);
create table core.role_actions (
  role_id     uuid not null references core.roles,
  action      text not null references core.actions,
  primary key (role_id, action)
);
create table core.setting_keys (
  key         text primary key check (key ~ '^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)*$'),
  layer       text not null references core.layers,
  owner_kind  text not null check (owner_kind in ('organization', 'department', 'place')),
  shape       jsonb not null,
  check_fn    regprocedure,
  many        boolean not null default false,       -- many things per owner (services, presets) or one
  labels      jsonb not null default '{}',
  -- what the automatic form needs (§5.1 rule 7): each field in order, {key (a path through properties), labels, help, unit, choices}
  fields      jsonb not null default '[]',
  form        text check (form in ('pack', 'department')),   -- where its form shows: the pack's page, the department's card; null: an editor of the core's
  action      text,                                 -- the action that writes it (null: manage:settings); its own is held anywhere (sign:score)
  hashes      jsonb not null default '{}'
);
create table core.screens (
  key         text primary key,
  layer       text not null references core.layers,
  work        text not null check (work in ('desk', 'visits', 'stays', 'bench', 'outside', 'any')),
  action      text references core.actions,          -- what a user needs here to see its tab; null: anyone working in the department
  replaces    text[] not null default '{}',          -- a pack screen stands in for these base screens (a list of work is one screen, §5.1 rule 4)
  labels      jsonb not null default '{}'
);
-- a score's points table (§5.1 rule 8): one row per version, never changed; a new version is a new row and old ones stay. The server
-- alone adds it up (core.score); an entry keeps the version it used
create table core.scores (
  key         text not null check (key ~ '^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)?$'),
  version     text not null check (version ~ '^[0-9A-Za-z][0-9A-Za-z._-]*$'),
  layer       text not null references core.layers,
  labels      jsonb not null default '{}',          -- its name in words ({"en": "Glasgow Coma Scale"})
  short       text not null,                        -- the short name on a line ("GCS")
  alias       text check (alias ~ '^[a-z][a-z0-9]*$'),   -- /gcs in the composer, beside /score gcs
  source      text not null,                        -- where the table comes from (the paper, the guideline)
  coding      jsonb,                                -- the total's coding (LOINC 9269-2), for FHIR
  items       jsonb not null,                       -- [{key, labels, input: number|choice|yes_no, …, points}] in order
  bands       jsonb not null,                       -- [{key, labels, min, max, tone}] over the total, in order
  retired_at  timestamptz,                          -- retired: new entries may no longer use it; old ones keep it
  position    int generated always as identity,     -- declaration order: the latest version is the last declared
  declared_at timestamptz not null default now(),
  primary key (key, version)
);
create table core.listeners (
  layer       text not null references core.layers,
  types       text[] not null,
  refresh     regprocedure not null,
  hashes      jsonb not null default '{}',
  primary key (layer, refresh)
);
create table core.purposes (
  key         text primary key,
  labels      jsonb not null default '{}'
);
insert into core.purposes (key, labels) values
  ('TREAT', '{"en":"Treatment"}'), ('ETREAT', '{"en":"Emergency treatment"}'), ('PATADMIN', '{"en":"Patient administration"}'),
  ('HOPERAT', '{"en":"Healthcare operations"}'), ('HRESCH', '{"en":"Research"}'), ('PATRQT', '{"en":"Patient request"}'), ('BTG', '{"en":"Break the glass"}');

-- ── codes (§3.5): plain data; entries store system keys, never URIs ──
create table core.codes (
  system      text not null references core.systems,
  code        text not null,
  labels      jsonb not null default '{}',
  parent      text,
  props       jsonb not null default '{}',
  retired_at  timestamptz,
  replaced_by text,
  primary key (system, code)
);
create index codes_label on core.codes using gin ((labels->>'en') extensions.gin_trgm_ops);
-- each load of a licensed list (§5.1 rule 7, §7 decision 5): the import script's, or the demo's sample, shown read-only in Settings
create table core.code_imports (
  id          bigint generated always as identity primary key,
  system      text not null references core.systems,
  version     text,
  source      text not null,                        -- the file or where it came from
  licence     text,                                 -- the system's licence note as it stood at the load
  sample      boolean not null default false,       -- a demo sample, not the full list
  codes       int not null,                         -- the system's codes after the load
  loaded_at   timestamptz not null default clock_timestamp()
);
create table core.canon (
  one         boolean primary key default true check (one),
  url         text not null
);
insert into core.canon (url) values ('https://opencare.example');

-- ── the spine (§2) ──
create table core.entries (
  organization_id uuid not null references core.organizations,
  id          uuid not null,
  patient_id  uuid not null,
  type        text not null,
  type_version int not null,
  item        uuid not null,
  item_version int not null check (item_version > 0),
  data        jsonb not null default '{}',
  codes       text[] not null default '{}',
  author_id   uuid not null,
  source      text not null check (source in ('staff', 'machine', 'import', 'patient')),
  source_system text,
  source_id   text,
  department_id uuid not null,
  visit_id    uuid,
  occurred_at timestamptz not null,
  precision   text not null default 'minute' check (precision in ('year', 'month', 'day', 'minute', 'second')),
  until       timestamptz,
  recorded_at timestamptz not null,
  replaces    uuid,
  refers_to   uuid,
  relation    text check (relation in ('answers', 'changes', 'about')),
  set_id      uuid not null,
  findings    jsonb not null default '[]',
  primary key (organization_id, id),
  unique (organization_id, item, item_version),
  foreign key (organization_id, patient_id) references core.patients,
  foreign key (organization_id, author_id) references core.users,
  foreign key (organization_id, department_id) references core.departments,
  foreign key (type, type_version) references core.types,
  foreign key (organization_id, replaces) references core.entries,
  foreign key (organization_id, refers_to) references core.entries,
  check ((refers_to is null) = (relation is null)),
  check ((source_system is null) = (source_id is null))
);
create index entries_patient on core.entries (organization_id, patient_id, recorded_at desc);
create index entries_recorded on core.entries (organization_id, recorded_at desc);   -- the latest entry of an organization (settings order after it)
create index entries_item on core.entries (organization_id, item);
create index entries_refers on core.entries (organization_id, refers_to) where refers_to is not null;
create index entries_replaces on core.entries (organization_id, replaces) where replaces is not null;
create index entries_visit on core.entries (organization_id, visit_id) where visit_id is not null;
create index entries_set on core.entries (organization_id, set_id);
create index entries_type on core.entries (organization_id, type, recorded_at desc);
create index entries_codes on core.entries using gin (codes);
create unique index entries_source on core.entries (organization_id, source_system, source_id) where source_system is not null;

-- the set ledger: a landed set, its hash and its outcome (§3.9 step 3)
create table core.sets (
  organization_id uuid not null references core.organizations,
  id          uuid not null,
  hash        text not null,
  user_id     uuid not null,
  made_at     timestamptz not null,
  recorded_at timestamptz not null,
  live        boolean not null,
  outcome     jsonb not null,
  primary key (organization_id, id)
);

-- ── settings (§3.4): insert-only; the current row of a thing is its latest ──
create table core.settings (
  organization_id uuid not null references core.organizations,
  id          uuid not null default gen_random_uuid(),
  key         text not null references core.setting_keys,
  owner_id    uuid,
  thing_id    uuid not null,
  data        jsonb not null default '{}',
  retired     boolean not null default false,
  author_id   uuid,
  recorded_at timestamptz not null default clock_timestamp(),
  primary key (organization_id, id)
);
create index settings_thing on core.settings (organization_id, key, thing_id, recorded_at desc);
create index settings_owner on core.settings (organization_id, key, owner_id, recorded_at desc);
create index settings_recorded on core.settings (organization_id, recorded_at desc);   -- the latest setting of an organization (entries order after it)

-- ── counters and files (§3.6) ──
create table core.counters (
  organization_id uuid not null references core.organizations,
  key         text not null,
  scope       text not null default '',
  day         date not null default '2000-01-01',
  value       bigint not null default 0,
  primary key (organization_id, key, scope, day)
);
create table core.file_uses (
  organization_id uuid not null,
  sha256      text not null,
  patient_id  uuid not null,
  entry_id    uuid not null,
  primary key (organization_id, sha256, entry_id)
);

-- ── the log of every read, the audit of every other change, the two exceptions' logs (§3.10–§3.12) ──
create table core.read_log (
  organization_id uuid not null references core.organizations,
  id          uuid not null default gen_random_uuid(),
  user_id     uuid not null,
  department_id uuid,
  patient_id  uuid,
  purpose     text not null references core.purposes,
  reason      text,
  what        jsonb not null default '{}',
  withheld    int not null default 0,
  reads       int not null default 1,
  at          timestamptz not null default clock_timestamp(),
  last_at     timestamptz not null default clock_timestamp(),
  primary key (organization_id, id)
);
create index read_log_window on core.read_log (organization_id, user_id, patient_id, purpose, at desc);
create index read_log_patient on core.read_log (organization_id, patient_id, at desc);
create table core.audit (
  organization_id uuid not null,
  id          uuid not null default gen_random_uuid(),
  user_id     uuid,
  action      text not null,
  what        text not null,
  thing_id    uuid,
  before      jsonb,
  after       jsonb,
  at          timestamptz not null default clock_timestamp(),
  primary key (organization_id, id)
);
create index audit_at on core.audit (organization_id, at desc);
create table core.erasures (
  organization_id uuid not null,
  id          uuid not null default gen_random_uuid(),
  user_id     uuid not null,
  reason      text not null,
  rows_removed bigint not null,
  at          timestamptz not null default clock_timestamp(),
  primary key (organization_id, id)
);
create table core.redactions (
  organization_id uuid not null,
  id          uuid not null default gen_random_uuid(),
  item        uuid not null,
  entry_ids   uuid[] not null,
  user_id     uuid not null,
  reason      text not null check (reason in ('misfiled', 'wrong_patient', 'duplicate', 'other')),
  moved_to    uuid,
  at          timestamptz not null default clock_timestamp(),
  primary key (organization_id, id)
);

-- ── a refresh or a listener under way in this backend's transaction: only then do the pack doors read unmasked (§5.2). Written only
-- by core.run_refresh; nobody else holds a privilege on it ──
create unlogged table core.unmasked (
  pid             int primary key,
  xid             xid8 not null,
  organization_id uuid not null     -- the clinic the refresh runs for: an unmasked read of another is refused
);

-- ── after-commit reactions and stale marks (§3.9 step 9) ──
create table core.outbox (
  id          bigint generated always as identity primary key,
  organization_id uuid not null,
  layer       text not null,
  refresh     regprocedure not null,
  patient_id  uuid,
  items       uuid[] not null,
  at          timestamptz not null default clock_timestamp(),
  tries       int not null default 0,
  error       text
);
create table core.stale (
  organization_id uuid not null,
  layer       text not null,
  patient_id  uuid not null,
  since       timestamptz not null default clock_timestamp(),
  error       text,
  primary key (organization_id, layer, patient_id)
);

-- nothing in core is reachable from the API except through functions
revoke all on all tables in schema core from public, anon, authenticated;
