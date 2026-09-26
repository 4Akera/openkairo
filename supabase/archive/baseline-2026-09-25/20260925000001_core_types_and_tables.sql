-- 01 · core: schemas, types and tables (the baseline of 2026-09-25; the history before it is in supabase/archive/migrations).
-- Tables are listed as the database holds them; their keys, indexes and triggers are in 04.

set check_function_bodies = false;
select pg_catalog.set_config('search_path', '', false);
set client_min_messages = warning;

-- the pack runner's role (spec 01: packs hear about entries after the commit, through core.run_pack_calls)
do $$ begin if not exists (select 1 from pg_roles where rolname = 'pack_runner') then create role pack_runner nologin; end if; end $$;
grant pack_runner to postgres;
create extension if not exists pgcrypto with schema extensions;
create extension if not exists pg_trgm with schema extensions;
create extension if not exists unaccent with schema extensions;
create extension if not exists fuzzystrmatch with schema extensions;   -- dmetaphone (spec 03 search)
create extension if not exists pg_cron;

CREATE SCHEMA core;


ALTER SCHEMA core OWNER TO postgres;

COMMENT ON SCHEMA public IS 'standard public schema';

CREATE TYPE core.entry_source AS ENUM (
    'staff',
    'patient',
    'machine',
    'outside',
    'import'
);


ALTER TYPE core.entry_source OWNER TO postgres;

CREATE TYPE core.list_kind AS ENUM (
    'medications',
    'problems',
    'allergies'
);


ALTER TYPE core.list_kind OWNER TO postgres;

CREATE DOMAIN core.partial_date AS text
	CONSTRAINT partial_date_check CHECK ((VALUE ~ '^\d{4}(-\d{2}(-\d{2})?)?$'::text));


ALTER DOMAIN core.partial_date OWNER TO postgres;

CREATE TYPE core.request_priority AS ENUM (
    'stat',
    'urgent',
    'routine'
);


ALTER TYPE core.request_priority OWNER TO postgres;

CREATE TYPE core.request_status AS ENUM (
    'open',
    'done',
    'cancelled'
);


ALTER TYPE core.request_status OWNER TO postgres;

CREATE TYPE core.request_step AS ENUM (
    'sent',
    'held',
    'started',
    'replied',
    'done',
    'cancelled',
    'reopened'
);


ALTER TYPE core.request_step OWNER TO postgres;

CREATE TYPE core.sex AS ENUM (
    'female',
    'male',
    'other'
);


ALTER TYPE core.sex OWNER TO postgres;

CREATE TYPE core.user_kind AS ENUM (
    'staff',
    'machine',
    'pack',
    'patient',
    'proxy',
    'importer'
);


ALTER TYPE core.user_kind OWNER TO postgres;

CREATE TYPE core.value_flag AS ENUM (
    'normal',
    'low',
    'high',
    'abnormal',
    'critical'
);


ALTER TYPE core.value_flag OWNER TO postgres;

CREATE TYPE core.visit_status AS ENUM (
    'waiting',
    'in_consult',
    'pending',
    'done',
    'left',
    'lapsed',
    'cancelled'
);


ALTER TYPE core.visit_status OWNER TO postgres;

-- 0004 · the record: entries, requests, steps, values, files, drafts, patient lists (spec 01, 04)
CREATE TABLE core.entries (
    id uuid NOT NULL,
    organization_id uuid NOT NULL,
    patient_id uuid NOT NULL,
    visit_id uuid,
    author_id uuid NOT NULL,
    responsible_id uuid,
    department_id uuid,
    source core.entry_source DEFAULT 'staff'::core.entry_source NOT NULL,
    source_key text,
    occurred_at timestamp with time zone NOT NULL,
    recorded_at timestamp with time zone NOT NULL,
    type text NOT NULL,
    service_id uuid,
    data jsonb DEFAULT '{}'::jsonb NOT NULL,
    display_line text NOT NULL,
    flag core.value_flag,
    reply_to_id uuid,
    is_final boolean DEFAULT true NOT NULL,
    replaces_id uuid,
    written_with_id uuid,
    replaced_by_id uuid,
    CONSTRAINT entries_check CHECK (((department_id IS NOT NULL) OR (source = ANY (ARRAY['patient'::core.entry_source, 'import'::core.entry_source])))),
    CONSTRAINT entries_check1 CHECK ((occurred_at <= (recorded_at + '00:05:00'::interval)))
);


ALTER TABLE core.entries OWNER TO postgres;

-- ── requests: where a request stands now ──
CREATE TABLE core.requests (
    entry_id uuid NOT NULL,
    organization_id uuid NOT NULL,
    patient_id uuid NOT NULL,
    from_department_id uuid NOT NULL,
    requester_id uuid NOT NULL,
    to_department_id uuid,
    assignee_id uuid,
    priority core.request_priority DEFAULT 'routine'::core.request_priority NOT NULL,
    due_at timestamp with time zone NOT NULL,
    step core.request_step DEFAULT 'sent'::core.request_step NOT NULL,
    status core.request_status GENERATED ALWAYS AS (
CASE step
    WHEN 'done'::core.request_step THEN 'done'::core.request_status
    WHEN 'cancelled'::core.request_step THEN 'cancelled'::core.request_status
    ELSE 'open'::core.request_status
END) STORED,
    status_reason text,
    reply_line text,
    reply_flag core.value_flag,
    replied_at timestamp with time zone,
    review_needed_at timestamp with time zone,
    review_reason text
);


ALTER TABLE core.requests OWNER TO postgres;

CREATE TABLE core.visits (
    id uuid NOT NULL,
    organization_id uuid NOT NULL,
    patient_id uuid NOT NULL,
    department_id uuid NOT NULL,
    request_id uuid,
    assignee_id uuid,
    status core.visit_status DEFAULT 'waiting'::core.visit_status NOT NULL,
    priority core.request_priority DEFAULT 'routine'::core.request_priority NOT NULL,
    is_first boolean NOT NULL,
    arrived_at timestamp with time zone DEFAULT clock_timestamp() NOT NULL,
    present_at timestamp with time zone,
    seen_at timestamp with time zone,
    ended_at timestamp with time zone,
    called_at timestamp with time zone,
    missed_calls integer DEFAULT 0 NOT NULL
);


ALTER TABLE core.visits OWNER TO postgres;

CREATE TABLE core.patients (
    id uuid NOT NULL,
    organization_id uuid NOT NULL,
    record_number bigint NOT NULL,
    given_name text NOT NULL,
    middle_name text,
    family_name text NOT NULL,
    sex core.sex NOT NULL,
    born_on core.partial_date NOT NULL,
    died_on core.partial_date,
    phone_text text,
    phone_digits text GENERATED ALWAYS AS (regexp_replace(COALESCE(phone_text, ''::text), '\D'::text, ''::text, 'g'::text)) STORED,
    contact_text text,
    merged_into_id uuid,
    created_at timestamp with time zone DEFAULT clock_timestamp() NOT NULL,
    CONSTRAINT patients_family_name_check CHECK ((length(TRIM(BOTH FROM family_name)) > 0)),
    CONSTRAINT patients_given_name_check CHECK ((length(TRIM(BOTH FROM given_name)) > 0))
);


ALTER TABLE core.patients OWNER TO postgres;

-- 0002 · the organization: people, rights, places, catalogue, packs, audit (spec 02)
CREATE TABLE core.organizations (
    id uuid NOT NULL,
    name text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    time_zone text DEFAULT 'UTC'::text NOT NULL,
    record_view text DEFAULT 'visits'::text NOT NULL,
    CONSTRAINT organizations_record_view_check CHECK ((record_view = ANY (ARRAY['visits'::text, 'entries'::text])))
);


ALTER TABLE core.organizations OWNER TO postgres;

CREATE TABLE core.departments (
    id uuid NOT NULL,
    organization_id uuid NOT NULL,
    type text NOT NULL,
    name text NOT NULL,
    site_name text,
    is_outside boolean DEFAULT false NOT NULL,
    contact_text text,
    retired_at timestamp with time zone,
    patients_wait boolean DEFAULT true NOT NULL,
    review_results text DEFAULT 'critical'::text NOT NULL,
    is_private boolean DEFAULT false NOT NULL,
    after_done text DEFAULT 'next'::text NOT NULL,
    pack_cards boolean DEFAULT true NOT NULL,
    CONSTRAINT departments_after_done_check CHECK ((after_done = ANY (ARRAY['next'::text, 'queue'::text]))),
    CONSTRAINT departments_review_results_check CHECK ((review_results = ANY (ARRAY['critical'::text, 'abnormal'::text, 'all'::text])))
);


ALTER TABLE core.departments OWNER TO postgres;

CREATE TABLE core.services (
    id uuid NOT NULL,
    organization_id uuid NOT NULL,
    department_id uuid,
    section_name text,
    code text NOT NULL,
    name text NOT NULL,
    reply_type text DEFAULT 'result'::text NOT NULL,
    retired_at timestamp with time zone
);


ALTER TABLE core.services OWNER TO postgres;

CREATE TABLE core.templates (
    id uuid NOT NULL,
    organization_id uuid NOT NULL,
    department_id uuid,
    user_id uuid,
    name text NOT NULL,
    items jsonb DEFAULT '[]'::jsonb NOT NULL,
    retired_at timestamp with time zone,
    shortcut text,
    lines text[] DEFAULT '{}'::text[] NOT NULL,
    CONSTRAINT templates_shortcut_check CHECK (((shortcut IS NULL) OR (shortcut ~ '^[a-z0-9_]{1,20}$'::text)))
);


ALTER TABLE core.templates OWNER TO postgres;

CREATE TABLE core.actions (
    key text NOT NULL,
    pack text,
    CONSTRAINT actions_key_check CHECK ((key ~ '^(write|mark|read|manage):[a-z_]+$'::text))
);


ALTER TABLE core.actions OWNER TO postgres;

CREATE TABLE core.codes (
    code text NOT NULL,
    name text NOT NULL,
    kind text NOT NULL,
    unit text,
    replaced_by_code text,
    organization_id uuid,
    retired_at timestamp with time zone,
    CONSTRAINT codes_code_check CHECK ((code ~ '^[a-z0-9_]+:[^\s]+$'::text))
);


ALTER TABLE core.codes OWNER TO postgres;

CREATE TABLE core.department_types (
    key text NOT NULL,
    name text NOT NULL,
    pack text,
    is_visited boolean NOT NULL,
    retired_at timestamp with time zone
);


ALTER TABLE core.department_types OWNER TO postgres;

CREATE TABLE core.drafts (
    entry_id uuid NOT NULL,
    organization_id uuid NOT NULL,
    author_id uuid NOT NULL,
    responsible_id uuid,
    patient_id uuid NOT NULL,
    visit_id uuid,
    department_id uuid NOT NULL,
    type text NOT NULL,
    service_id uuid,
    reply_to_id uuid,
    data jsonb DEFAULT '{}'::jsonb NOT NULL,
    updated_at timestamp with time zone DEFAULT clock_timestamp() NOT NULL
);


ALTER TABLE core.drafts OWNER TO postgres;

CREATE TABLE core.entry_files (
    entry_id uuid NOT NULL,
    "position" smallint NOT NULL,
    path text,
    url text,
    mime text,
    name text NOT NULL,
    CONSTRAINT entry_files_check CHECK (((path IS NULL) <> (url IS NULL)))
);


ALTER TABLE core.entry_files OWNER TO postgres;

CREATE TABLE core.entry_types (
    key text NOT NULL,
    name text NOT NULL,
    pack text,
    list core.list_kind,
    pack_list text,
    retired_at timestamp with time zone,
    is_note boolean DEFAULT false NOT NULL,
    answers text,
    CONSTRAINT entry_types_key_check CHECK ((key ~ '^[a-z_]+$'::text))
);


ALTER TABLE core.entry_types OWNER TO postgres;

-- ── derived from entries ──
CREATE TABLE core.entry_values (
    entry_id uuid NOT NULL,
    "position" smallint NOT NULL,
    organization_id uuid NOT NULL,
    patient_id uuid NOT NULL,
    code text NOT NULL,
    value_number numeric,
    value_text text,
    unit text,
    flag core.value_flag,
    source core.entry_source NOT NULL,
    occurred_at timestamp with time zone NOT NULL
);


ALTER TABLE core.entry_values OWNER TO postgres;

CREATE TABLE core.erasures (
    patient_id uuid NOT NULL,
    reason text NOT NULL,
    actor_id uuid NOT NULL,
    erased_at timestamp with time zone DEFAULT clock_timestamp() NOT NULL
);


ALTER TABLE core.erasures OWNER TO postgres;

-- ── the private list: one row per change, insert-only; the latest row of a chain says whether its notes are private
CREATE TABLE core.note_privacy (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    entry_id uuid NOT NULL,
    patient_id uuid NOT NULL,
    department_id uuid,
    is_private boolean NOT NULL,
    reason_text text,
    changed_by uuid,
    changed_at timestamp with time zone DEFAULT clock_timestamp() NOT NULL
);


ALTER TABLE core.note_privacy OWNER TO postgres;

CREATE TABLE core.organization_packs (
    organization_id uuid NOT NULL,
    pack text NOT NULL,
    retired_at timestamp with time zone
);


ALTER TABLE core.organization_packs OWNER TO postgres;

CREATE TABLE core.pack_calls (
    pack text NOT NULL,
    entry_id uuid NOT NULL,
    organization_id uuid NOT NULL,
    recorded_at timestamp with time zone DEFAULT clock_timestamp() NOT NULL,
    tries smallint DEFAULT 0 NOT NULL,
    tried_at timestamp with time zone,
    error_text text
);


ALTER TABLE core.pack_calls OWNER TO postgres;

CREATE TABLE core.packs (
    key text NOT NULL,
    name text NOT NULL,
    is_called_after_write boolean DEFAULT false NOT NULL
);


ALTER TABLE core.packs OWNER TO postgres;

CREATE TABLE core.patient_allergies (
    id uuid NOT NULL,
    organization_id uuid NOT NULL,
    patient_id uuid NOT NULL,
    substance_code text,
    substance_name text NOT NULL,
    class_code text,
    kind text NOT NULL,
    reactions_text text,
    severity text,
    certainty text,
    status text DEFAULT 'active'::text NOT NULL,
    latest_entry_id uuid NOT NULL,
    CONSTRAINT patient_allergies_certainty_check CHECK ((certainty = ANY (ARRAY['confirmed'::text, 'suspected'::text]))),
    CONSTRAINT patient_allergies_kind_check CHECK ((kind = ANY (ARRAY['allergy'::text, 'intolerance'::text]))),
    CONSTRAINT patient_allergies_severity_check CHECK ((severity = ANY (ARRAY['mild'::text, 'moderate'::text, 'severe'::text, 'unknown'::text]))),
    CONSTRAINT patient_allergies_status_check CHECK ((status = ANY (ARRAY['active'::text, 'refuted'::text])))
);


ALTER TABLE core.patient_allergies OWNER TO postgres;

CREATE TABLE core.patient_changes (
    id uuid NOT NULL,
    organization_id uuid NOT NULL,
    patient_id uuid NOT NULL,
    user_id uuid NOT NULL,
    changes jsonb NOT NULL,
    recorded_at timestamp with time zone DEFAULT clock_timestamp() NOT NULL
);


ALTER TABLE core.patient_changes OWNER TO postgres;

CREATE TABLE core.patient_identifiers (
    organization_id uuid NOT NULL,
    patient_id uuid NOT NULL,
    system text NOT NULL,
    value text NOT NULL
);


ALTER TABLE core.patient_identifiers OWNER TO postgres;

CREATE TABLE core.patient_list_reviews (
    patient_id uuid NOT NULL,
    list core.list_kind NOT NULL,
    reviewed_at timestamp with time zone NOT NULL,
    reviewed_by_id uuid NOT NULL,
    entry_id uuid NOT NULL
);


ALTER TABLE core.patient_list_reviews OWNER TO postgres;

-- ── the patient lists (spec 04) ──
CREATE TABLE core.patient_medications (
    id uuid NOT NULL,
    organization_id uuid NOT NULL,
    patient_id uuid NOT NULL,
    drug_code text,
    drug_name text NOT NULL,
    form text,
    strength text,
    dose_number numeric,
    dose_unit text,
    route text,
    frequency text,
    prn boolean DEFAULT false NOT NULL,
    prn_reason_text text,
    instructions_text text,
    problem_id uuid,
    started_on date NOT NULL,
    stopped_on date,
    stop_reason_text text,
    status text DEFAULT 'active'::text NOT NULL,
    latest_entry_id uuid NOT NULL,
    prescriber_id uuid NOT NULL,
    CONSTRAINT patient_medications_status_check CHECK ((status = ANY (ARRAY['active'::text, 'stopped'::text])))
);


ALTER TABLE core.patient_medications OWNER TO postgres;

CREATE TABLE core.patient_problems (
    id uuid NOT NULL,
    organization_id uuid NOT NULL,
    patient_id uuid NOT NULL,
    code text,
    name text NOT NULL,
    status text DEFAULT 'active'::text NOT NULL,
    onset_on core.partial_date,
    resolved_on core.partial_date,
    latest_entry_id uuid NOT NULL,
    note_text text,
    certainty text DEFAULT 'confirmed'::text NOT NULL,
    CONSTRAINT patient_problems_status_check CHECK ((status = ANY (ARRAY['active'::text, 'resolved'::text, 'inactive'::text])))
);


ALTER TABLE core.patient_problems OWNER TO postgres;

-- 0003 · patients and visits: outside the record (spec 03)
CREATE TABLE core.record_numbers (
    organization_id uuid NOT NULL,
    last_number bigint DEFAULT 0 NOT NULL
);


ALTER TABLE core.record_numbers OWNER TO postgres;

CREATE TABLE core.record_reads (
    organization_id uuid NOT NULL,
    user_id uuid NOT NULL,
    patient_id uuid NOT NULL,
    read_at timestamp with time zone DEFAULT clock_timestamp() NOT NULL,
    department_id uuid,
    basis text,
    reason_text text,
    opened_department_id uuid
);


ALTER TABLE core.record_reads OWNER TO postgres;

CREATE TABLE core.request_steps (
    organization_id uuid NOT NULL,
    request_id uuid NOT NULL,
    "position" smallint NOT NULL,
    step core.request_step NOT NULL,
    actor_id uuid,
    reason text,
    changes jsonb,
    occurred_at timestamp with time zone NOT NULL,
    recorded_at timestamp with time zone DEFAULT clock_timestamp() NOT NULL,
    CONSTRAINT request_steps_check CHECK ((occurred_at <= (recorded_at + '00:05:00'::interval)))
);


ALTER TABLE core.request_steps OWNER TO postgres;

CREATE TABLE core.role_actions (
    role_id uuid NOT NULL,
    action text NOT NULL
);


ALTER TABLE core.role_actions OWNER TO postgres;

CREATE TABLE core.roles (
    id uuid NOT NULL,
    organization_id uuid,
    key text NOT NULL,
    name text NOT NULL,
    retired_at timestamp with time zone
);


ALTER TABLE core.roles OWNER TO postgres;

CREATE TABLE core.served_departments (
    department_id uuid NOT NULL,
    served_department_id uuid
);


ALTER TABLE core.served_departments OWNER TO postgres;

-- 0019 · the second factor for manage: stays the rule; one server setting turns it off for local development only (the dev seed sets it)
CREATE TABLE core.server_settings (
    key text NOT NULL,
    value text NOT NULL
);


ALTER TABLE core.server_settings OWNER TO postgres;

CREATE TABLE core.service_field_ranges (
    service_id uuid NOT NULL,
    "position" smallint NOT NULL,
    sex core.sex,
    age_low integer,
    age_high integer,
    reference_low numeric,
    reference_high numeric,
    critical_low numeric,
    critical_high numeric
);


ALTER TABLE core.service_field_ranges OWNER TO postgres;

CREATE TABLE core.service_fields (
    service_id uuid NOT NULL,
    "position" smallint NOT NULL,
    code text NOT NULL,
    name text NOT NULL,
    kind text NOT NULL,
    unit text,
    choices text[],
    reference_low numeric,
    reference_high numeric,
    critical_low numeric,
    critical_high numeric,
    retired_at timestamp with time zone
);


ALTER TABLE core.service_fields OWNER TO postgres;

-- ── audit, insert-only ──
CREATE TABLE core.settings_changes (
    id uuid NOT NULL,
    organization_id uuid NOT NULL,
    user_id uuid NOT NULL,
    table_name text NOT NULL,
    row_id uuid NOT NULL,
    changes jsonb NOT NULL,
    recorded_at timestamp with time zone DEFAULT clock_timestamp() NOT NULL
);


ALTER TABLE core.settings_changes OWNER TO postgres;

CREATE TABLE core.user_roles (
    organization_id uuid NOT NULL,
    user_id uuid NOT NULL,
    role_id uuid NOT NULL,
    department_id uuid
);


ALTER TABLE core.user_roles OWNER TO postgres;

CREATE TABLE core.users (
    id uuid NOT NULL,
    organization_id uuid NOT NULL,
    kind core.user_kind NOT NULL,
    name text NOT NULL,
    title text,
    login_id uuid,
    invited_at timestamp with time zone,
    accepted_at timestamp with time zone,
    retired_at timestamp with time zone
);


ALTER TABLE core.users OWNER TO postgres;

CREATE TABLE core.visit_steps (
    organization_id uuid NOT NULL,
    visit_id uuid NOT NULL,
    "position" smallint NOT NULL,
    status core.visit_status NOT NULL,
    actor_id uuid,
    reason text,
    changes jsonb,
    recorded_at timestamp with time zone DEFAULT clock_timestamp() NOT NULL
);


ALTER TABLE core.visit_steps OWNER TO postgres;
