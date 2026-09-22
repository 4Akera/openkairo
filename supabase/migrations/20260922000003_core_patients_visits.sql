-- 0003 · patients and visits: outside the record (spec 03)
create table core.record_numbers (
  organization_id  uuid primary key references core.organizations,
  last_number      bigint not null default 0
);

create table core.patients (
  id               uuid primary key,
  organization_id  uuid not null references core.organizations,
  record_number    bigint not null,
  given_name       text not null check (length(trim(given_name)) > 0),
  middle_name      text,
  family_name      text not null check (length(trim(family_name)) > 0),
  sex              core.sex not null,
  born_on          core.partial_date not null,
  died_on          core.partial_date,
  phone_text       text,
  phone_digits     text generated always as (regexp_replace(coalesce(phone_text,''), '\D', '', 'g')) stored,
  contact_text     text,
  merged_into_id   uuid references core.patients,
  created_at       timestamptz not null default clock_timestamp(),
  unique (organization_id, id),
  unique (organization_id, record_number)
);
create index patients_family_trgm on core.patients using gin (core.fold(family_name) extensions.gin_trgm_ops);
create index patients_given_trgm  on core.patients using gin (core.fold(given_name) extensions.gin_trgm_ops);
create index patients_family_dm   on core.patients (organization_id, extensions.dmetaphone(family_name));
create index patients_phone       on core.patients (organization_id, phone_digits) where phone_digits <> '';
create index patients_merged      on core.patients (merged_into_id) where merged_into_id is not null;

create table core.patient_identifiers (
  organization_id  uuid not null,
  patient_id       uuid not null,
  system           text not null,
  value            text not null,
  primary key (patient_id, system, value),
  foreign key (organization_id, patient_id) references core.patients (organization_id, id)
);
create index patient_identifiers_value on core.patient_identifiers (organization_id, value);

create table core.patient_changes (
  id               uuid primary key,
  organization_id  uuid not null,
  patient_id       uuid not null,
  user_id          uuid not null,
  changes          jsonb not null,
  recorded_at      timestamptz not null default clock_timestamp(),
  foreign key (organization_id, patient_id) references core.patients (organization_id, id)
);
create index patient_changes_by_patient on core.patient_changes (patient_id, recorded_at desc);

create table core.visits (
  id               uuid primary key,
  organization_id  uuid not null,
  patient_id       uuid not null,
  department_id    uuid not null,
  request_id       uuid,                              -- the consult it answers; fk added in 0004
  assignee_id      uuid,
  status           core.visit_status not null default 'waiting',
  priority         core.request_priority not null default 'routine',
  is_first         boolean not null,
  arrived_at       timestamptz not null default clock_timestamp(),
  present_at       timestamptz,                        -- NULL = away
  seen_at          timestamptz,                        -- first in_consult, once
  ended_at         timestamptz,                        -- open ⇔ NULL
  unique (organization_id, id),
  unique (patient_id, id),
  foreign key (organization_id, patient_id)    references core.patients    (organization_id, id),
  foreign key (organization_id, department_id) references core.departments (organization_id, id),
  foreign key (organization_id, assignee_id)   references core.users       (organization_id, id)
);
create unique index visits_open    on core.visits (patient_id, department_id) where ended_at is null;
create index visits_present        on core.visits (department_id) where present_at is not null;
create index visits_open_by_dept   on core.visits (department_id) where ended_at is null;
create index visits_by_patient     on core.visits (patient_id, arrived_at desc);

create table core.visit_steps (
  organization_id  uuid not null,
  visit_id         uuid not null references core.visits,
  position         smallint not null,
  status           core.visit_status not null,
  actor_id         uuid,                                -- NULL = the sweep
  reason           text,
  changes          jsonb,
  recorded_at      timestamptz not null default clock_timestamp(),
  primary key (visit_id, position)
);
create trigger visit_steps_permanent before update or delete on core.visit_steps for each row execute function core.refuse_change();
create trigger patient_changes_permanent before update or delete on core.patient_changes for each row execute function core.refuse_change();
