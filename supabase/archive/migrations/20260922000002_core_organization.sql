-- 0002 · the organization: people, rights, places, catalogue, packs, audit (spec 02)
create table core.organizations (
  id          uuid primary key,
  name        text not null,
  created_at  timestamptz not null default now()
);

create table core.users (
  id               uuid primary key,
  organization_id  uuid not null references core.organizations,
  kind             core.user_kind not null,
  name             text not null,
  title            text,
  login_id         uuid,                       -- auth.users.id, set once by link_login
  invited_at       timestamptz,
  accepted_at      timestamptz,
  retired_at       timestamptz,
  unique (organization_id, id)
);
create unique index users_login on core.users (organization_id, login_id) where login_id is not null and retired_at is null;
create index users_by_login on core.users (login_id) where login_id is not null;

create table core.actions (
  key   text primary key check (key ~ '^(write|mark|read|manage):[a-z_]+$'),
  pack  text
);

create table core.roles (
  id               uuid primary key,
  organization_id  uuid references core.organizations,   -- NULL = built-in, read-only
  key              text not null,
  name             text not null,
  retired_at       timestamptz,
  unique (organization_id, id)
);
create unique index roles_key on core.roles (coalesce(organization_id, '00000000-0000-0000-0000-000000000000'), key) where retired_at is null;

create table core.role_actions (
  role_id  uuid not null references core.roles,
  action   text not null references core.actions,
  primary key (role_id, action)
);

create table core.department_types (
  key         text primary key,
  name        text not null,
  pack        text,
  is_visited  boolean not null,
  retired_at  timestamptz
);

create table core.departments (
  id               uuid primary key,
  organization_id  uuid not null references core.organizations,
  type             text not null references core.department_types,
  name             text not null,
  site_name        text,
  is_outside       boolean not null default false,
  contact_text     text,
  retired_at       timestamptz,
  unique (organization_id, id)
);

create table core.user_roles (
  organization_id  uuid not null,
  user_id          uuid not null,
  role_id          uuid not null references core.roles,
  department_id    uuid,                                  -- NULL = everywhere
  foreign key (organization_id, user_id) references core.users (organization_id, id),
  foreign key (organization_id, department_id) references core.departments (organization_id, id)
);
create unique index user_roles_uniq on core.user_roles (user_id, role_id, coalesce(department_id, '00000000-0000-0000-0000-000000000000'));
create index user_roles_by_user on core.user_roles (user_id);

create table core.served_departments (
  department_id         uuid not null references core.departments,
  served_department_id  uuid references core.departments    -- NULL = every department
);
create unique index served_departments_uniq on core.served_departments (department_id, coalesce(served_department_id, '00000000-0000-0000-0000-000000000000'));

create table core.codes (
  code              text primary key check (code ~ '^[a-z0-9_]+:[^\s]+$'),
  name              text not null,
  kind              text not null,                         -- number | text | choice
  unit              text,
  replaced_by_code  text references core.codes,
  organization_id   uuid references core.organizations,    -- NULL = global, migrations only
  retired_at        timestamptz
);

create table core.services (
  id               uuid primary key,
  organization_id  uuid not null references core.organizations,
  department_id    uuid,                                   -- NULL = outside: requester names it
  section_name     text,
  code             text not null,
  name             text not null,
  reply_type       text not null default 'result',        -- result | note | dispense …
  retired_at       timestamptz,
  unique (organization_id, id),
  foreign key (organization_id, department_id) references core.departments (organization_id, id)
);
create unique index services_code on core.services (organization_id, coalesce(department_id, '00000000-0000-0000-0000-000000000000'), code) where retired_at is null;

create table core.service_fields (
  service_id      uuid not null references core.services,
  position        smallint not null,
  code            text not null references core.codes,
  name            text not null,
  kind            text not null,
  unit            text,
  choices         text[],
  reference_low   numeric, reference_high numeric,
  critical_low    numeric, critical_high  numeric,
  retired_at      timestamptz,
  primary key (service_id, position)
);

create table core.service_field_ranges (
  service_id  uuid not null references core.services,
  position    smallint not null,
  sex         core.sex,
  age_low     int, age_high int,
  reference_low numeric, reference_high numeric, critical_low numeric, critical_high numeric,
  foreign key (service_id, position) references core.service_fields (service_id, position)
);

create table core.templates (
  id               uuid primary key,
  organization_id  uuid not null references core.organizations,
  department_id    uuid,
  user_id          uuid,
  name             text not null,
  items            jsonb not null default '[]',
  retired_at       timestamptz,
  foreign key (organization_id, department_id) references core.departments (organization_id, id),
  foreign key (organization_id, user_id) references core.users (organization_id, id)
);

create table core.packs (
  key                    text primary key,
  name                   text not null,
  is_called_after_write  boolean not null default false
);

create table core.organization_packs (
  organization_id  uuid not null references core.organizations,
  pack             text not null references core.packs,
  retired_at       timestamptz,
  primary key (organization_id, pack)
);

create table core.entry_types (
  key         text primary key check (key ~ '^[a-z_]+$'),
  name        text not null,
  pack        text references core.packs,                 -- NULL = core
  list        core.list_kind,                             -- the patient list this type keeps (core) …
  pack_list   text,                                       -- … or a pack's own list name
  retired_at  timestamptz
);

-- ── audit, insert-only ──
create table core.settings_changes (
  id               uuid primary key,
  organization_id  uuid not null references core.organizations,
  user_id          uuid not null,
  table_name       text not null,
  row_id           uuid not null,
  changes          jsonb not null,
  recorded_at      timestamptz not null default clock_timestamp()
);
create index settings_changes_by_row on core.settings_changes (organization_id, table_name, row_id, recorded_at desc);

create table core.record_reads (
  organization_id  uuid not null,
  user_id          uuid not null,
  patient_id       uuid not null,
  read_at          timestamptz not null default clock_timestamp()
);
create index record_reads_open on core.record_reads (user_id, patient_id, read_at desc);
create index record_reads_by_patient on core.record_reads (patient_id, read_at desc);

create table core.pack_calls (
  pack             text not null references core.packs,
  entry_id         uuid not null,
  organization_id  uuid not null,
  recorded_at      timestamptz not null default clock_timestamp(),
  tries            smallint not null default 0,
  tried_at         timestamptz,
  error_text       text,
  primary key (pack, entry_id)
);
create index pack_calls_due on core.pack_calls (recorded_at) where tries < 5;

-- insert-only guard for the audit tables
create or replace function core.refuse_change() returns trigger language plpgsql as $$
begin
  if current_setting('opencare.erasing', true) = 'true' and tg_op = 'DELETE' then return old; end if;
  raise exception 'table % is insert-only', tg_table_name using errcode = '55000';
end $$;
create trigger settings_changes_permanent before update or delete or truncate on core.settings_changes for each statement execute function core.refuse_change();
create trigger record_reads_permanent    before update or delete on core.record_reads    for each row execute function core.refuse_change();
