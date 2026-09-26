-- 0004 · the record: entries, requests, steps, values, files, drafts, patient lists (spec 01, 04)
create table core.entries (
  id               uuid primary key,
  organization_id  uuid not null,
  patient_id       uuid not null,
  visit_id         uuid,
  author_id        uuid not null,
  responsible_id   uuid,
  department_id    uuid,
  source           core.entry_source not null default 'staff',
  source_key       text,
  occurred_at      timestamptz not null,
  recorded_at      timestamptz not null,
  type             text not null references core.entry_types on delete restrict,
  service_id       uuid,
  data             jsonb not null default '{}',
  display_line     text not null,
  flag             core.value_flag,
  reply_to_id      uuid,                                -- fk to requests, added below
  is_final         boolean not null default true,
  replaces_id      uuid references core.entries,
  written_with_id  uuid references core.entries,
  replaced_by_id   uuid references core.entries,         -- the only column ever updated
  unique (organization_id, id),
  foreign key (organization_id, patient_id)      references core.patients    (organization_id, id),
  foreign key (patient_id, visit_id)             references core.visits      (patient_id, id),
  foreign key (organization_id, author_id)       references core.users       (organization_id, id),
  foreign key (organization_id, responsible_id)  references core.users       (organization_id, id),
  foreign key (organization_id, department_id)   references core.departments (organization_id, id),
  foreign key (organization_id, service_id)      references core.services    (organization_id, id),
  check (department_id is not null or source in ('patient','import')),
  check (occurred_at <= recorded_at + interval '5 minutes')
);
create index entries_timeline    on core.entries (patient_id, occurred_at desc, id desc) where reply_to_id is null and replaced_by_id is null and type <> 'entered_in_error';
create index entries_by_patient  on core.entries (patient_id, recorded_at, id);
create index entries_replies     on core.entries (reply_to_id) where reply_to_id is not null;
create unique index entries_replaces on core.entries (replaces_id) where replaces_id is not null;
create index entries_written_with on core.entries (written_with_id) where written_with_id is not null;
create unique index entries_source_key on core.entries (organization_id, source, source_key) where source_key is not null;
create index entries_visit       on core.entries (visit_id) where visit_id is not null;

-- permanence: the only UPDATE is replaced_by_id NULL → value; DELETE only inside erase_patient
create or replace function core.entries_permanent() returns trigger language plpgsql as $$
begin
  if tg_op = 'DELETE' then
    if current_setting('opencare.erasing', true) = 'true' then return old; end if;
    raise exception 'entries are permanent' using errcode = '55000';
  end if;
  if old.replaced_by_id is null and new.replaced_by_id is not null
     and row(new.id,new.organization_id,new.patient_id,new.visit_id,new.author_id,new.responsible_id,new.department_id,new.source,new.source_key,new.occurred_at,new.recorded_at,new.type,new.service_id,new.data,new.display_line,new.flag,new.reply_to_id,new.is_final,new.replaces_id,new.written_with_id)
       is not distinct from row(old.id,old.organization_id,old.patient_id,old.visit_id,old.author_id,old.responsible_id,old.department_id,old.source,old.source_key,old.occurred_at,old.recorded_at,old.type,old.service_id,old.data,old.display_line,old.flag,old.reply_to_id,old.is_final,old.replaces_id,old.written_with_id)
  then return new; end if;
  raise exception 'entries are permanent (only replaced_by_id may be set, once)' using errcode = '55000';
end $$;
create trigger entries_permanent before update or delete on core.entries for each row execute function core.entries_permanent();
create trigger entries_no_truncate before truncate on core.entries for each statement execute function core.refuse_change();

-- ── requests: where a request stands now ──
create table core.requests (
  entry_id            uuid primary key references core.entries,
  organization_id     uuid not null,
  patient_id          uuid not null,
  from_department_id  uuid not null,
  requester_id        uuid not null,
  to_department_id    uuid,
  assignee_id         uuid,
  priority            core.request_priority not null default 'routine',
  due_at              timestamptz not null,
  step                core.request_step not null default 'sent',
  status              core.request_status generated always as
                        (case step when 'done' then 'done'::core.request_status when 'cancelled' then 'cancelled'::core.request_status else 'open'::core.request_status end) stored,
  status_reason       text,
  reply_line          text,
  reply_flag          core.value_flag,
  replied_at          timestamptz,
  review_needed_at    timestamptz,
  unique (organization_id, entry_id),
  foreign key (organization_id, to_department_id) references core.departments (organization_id, id),
  foreign key (organization_id, assignee_id)      references core.users       (organization_id, id)
);
create index requests_queue      on core.requests (to_department_id, priority, due_at) where status = 'open';
create index requests_by_patient on core.requests (patient_id) where status = 'open' or review_needed_at is not null;
create index requests_replied    on core.requests (patient_id, replied_at desc) where replied_at is not null;
create index requests_to_review  on core.requests (requester_id, review_needed_at) where review_needed_at is not null;
create index requests_dept_review on core.requests (from_department_id, review_needed_at) where review_needed_at is not null;

alter table core.entries add constraint entries_reply_to_fk foreign key (reply_to_id) references core.requests (entry_id);
alter table core.visits  add constraint visits_request_fk  foreign key (organization_id, request_id) references core.requests (organization_id, entry_id) deferrable initially deferred;

create or replace function core.requests_guard() returns trigger language plpgsql as $$
begin
  if tg_op = 'DELETE' then
    if current_setting('opencare.erasing', true) = 'true' then return old; end if;
    raise exception 'requests rows are never deleted' using errcode = '55000';
  end if;
  if current_setting('opencare.in_change_request', true) <> 'true' then
    raise exception 'requests are changed only by change_request' using errcode = '55000';
  end if;
  return new;
end $$;
create trigger requests_guard before update or delete on core.requests for each row execute function core.requests_guard();

create table core.request_steps (
  organization_id  uuid not null,
  request_id       uuid not null references core.entries (id),
  position         smallint not null,
  step             core.request_step not null,
  actor_id         uuid,
  reason           text,
  changes          jsonb,
  occurred_at      timestamptz not null,
  recorded_at      timestamptz not null default clock_timestamp(),
  primary key (request_id, position),
  check (occurred_at <= recorded_at + interval '5 minutes')
);
create trigger request_steps_permanent before update or delete on core.request_steps for each row execute function core.refuse_change();

-- ── derived from entries ──
create table core.entry_values (
  entry_id         uuid not null references core.entries,
  position         smallint not null,
  organization_id  uuid not null,
  patient_id       uuid not null,
  code             text not null,
  value_number     numeric,
  value_text       text,
  unit             text,
  flag             core.value_flag,
  source           core.entry_source not null,
  occurred_at      timestamptz not null,
  primary key (entry_id, position)
);
create index entry_values_trend on core.entry_values (patient_id, code, occurred_at desc);

create table core.entry_files (
  entry_id  uuid not null references core.entries,
  position  smallint not null,
  path      text,
  url       text,
  mime      text,
  name      text not null,
  primary key (entry_id, position),
  check ((path is null) <> (url is null))
);
create trigger entry_files_permanent before update or delete on core.entry_files for each row execute function core.refuse_change();

create table core.drafts (
  entry_id         uuid primary key,
  organization_id  uuid not null,
  author_id        uuid not null,
  responsible_id   uuid,
  patient_id       uuid not null,
  visit_id         uuid,
  department_id    uuid not null,
  type             text not null references core.entry_types,
  service_id       uuid,
  reply_to_id      uuid,
  data             jsonb not null default '{}',
  updated_at       timestamptz not null default clock_timestamp()
);
create index drafts_by_author on core.drafts (author_id, patient_id);

-- ── the patient lists (spec 04) ──
create table core.patient_medications (
  id               uuid primary key,                      -- = the start entry id
  organization_id  uuid not null,
  patient_id       uuid not null,
  drug_code        text, drug_name text not null, form text, strength text,
  dose_number      numeric, dose_unit text, route text, frequency text,
  prn              boolean not null default false, prn_reason_text text, instructions_text text,
  problem_id       uuid,
  started_on       date not null, stopped_on date, stop_reason_text text,
  status           text not null default 'active' check (status in ('active','stopped')),
  latest_entry_id  uuid not null,
  prescriber_id    uuid not null
);
create index patient_medications_active on core.patient_medications (patient_id) where status = 'active';

create table core.patient_problems (
  id               uuid primary key,
  organization_id  uuid not null,
  patient_id       uuid not null,
  code             text, name text not null,
  status           text not null default 'active' check (status in ('active','resolved','inactive')),
  onset_on         core.partial_date, resolved_on core.partial_date,
  latest_entry_id  uuid not null
);
create index patient_problems_active on core.patient_problems (patient_id) where status = 'active';

create table core.patient_allergies (
  id               uuid primary key,
  organization_id  uuid not null,
  patient_id       uuid not null,
  substance_code   text, substance_name text not null, class_code text,
  kind             text not null check (kind in ('allergy','intolerance')),
  reactions_text   text,
  severity         text check (severity in ('mild','moderate','severe','unknown')),
  certainty        text check (certainty in ('confirmed','suspected')),
  status           text not null default 'active' check (status in ('active','refuted')),
  latest_entry_id  uuid not null
);
create index patient_allergies_by_patient on core.patient_allergies (patient_id);

create table core.patient_list_reviews (
  patient_id      uuid not null,
  list            core.list_kind not null,
  reviewed_at     timestamptz not null,
  reviewed_by_id  uuid not null,
  entry_id        uuid not null,
  primary key (patient_id, list)
);

create table core.erasures (
  patient_id  uuid not null,
  reason      text not null,
  actor_id    uuid not null,
  erased_at   timestamptz not null default clock_timestamp()
);
