-- 0041 · private notes (spec 07, spec 08 K26). Hide the story, never the fact: privacy belongs to a note, never to a visit. A private
-- note is hidden from anyone who does not work in the department it was written in; everything else shows, department names included.
-- The note itself never changes: its privacy is kept beside the record in core.note_privacy, one insert-only row per change, keyed by
-- the note's chain (its first version), so every version of a note shares it.

-- ── who works in a department: a live staff user holding a live role scoped to it that reads the record (never a role held everywhere)
create or replace function core.works_in(p_user uuid, p_department uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from core.users x
                   join core.user_roles ur on ur.user_id = x.id and ur.department_id = p_department
                   join core.roles ro on ro.id = ur.role_id and ro.retired_at is null
                   join core.role_actions ra on ra.role_id = ro.id and ra.action = 'read:record'
                 where x.id = p_user and x.kind = 'staff' and (x.retired_at is null or x.retired_at > pg_catalog.now()))
$$;

-- ── the private list: one row per change, insert-only; the latest row of a chain says whether its notes are private
create table core.note_privacy (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null references core.organizations,
  entry_id         uuid not null references core.entries,     -- the chain's first version (core.root_of)
  patient_id       uuid not null,
  department_id    uuid,                                      -- the note's own department, for ever
  is_private       boolean not null,
  reason_text      text,
  changed_by       uuid,
  changed_at       timestamptz not null default pg_catalog.clock_timestamp()
);
create index note_privacy_by_chain on core.note_privacy (entry_id, changed_at desc, id desc);
create index note_privacy_by_patient on core.note_privacy (patient_id);
create trigger note_privacy_permanent before update or delete on core.note_privacy for each row execute function core.refuse_change();
revoke all on core.note_privacy from public, anon, authenticated;

-- ── the department rule: "visits private from the start" becomes "private department" (spec 02)
alter table core.departments rename column private_visits to is_private;

-- ── open anyway opens one department's private notes of a patient, not a visit
alter table core.record_reads add column opened_department_id uuid;
alter table core.record_reads disable trigger record_reads_permanent;   -- the log is insert-only; this one copy is the migration's
update core.record_reads rr set opened_department_id = v.department_id from core.visits v where v.id = rr.opened_visit_id and rr.opened_department_id is null;
alter table core.record_reads enable trigger record_reads_permanent;
drop index if exists core.record_reads_opened;
alter table core.record_reads drop column opened_visit_id;
create index record_reads_opened_department on core.record_reads (user_id, opened_department_id, patient_id, read_at desc) where basis = 'anyway';

-- ── backfill, while visits still carry their privacy: every note in a private visit, and every note written in a department while
-- its rule was on (unless it sits in one of that department's own visits made not private by hand), becomes private in its own
-- department. A function, so the rule can be tested with fixtures after visits.is_private is gone.
create or replace function core.note_privacy_backfill(p_private_visits uuid[])
returns table (organization_id uuid, entry_id uuid, patient_id uuid, department_id uuid, changed_by uuid, changed_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select distinct on (r.root) e.organization_id, r.root, e.patient_id, e.department_id, e.author_id, e.recorded_at
  from core.entries e
  cross join lateral (select core.root_of(e.id) as root) r
  join core.entry_types t on t.key = e.type and t.is_note
  where e.visit_id = any(p_private_visits)
     or (coalesce((select (sc.changes->>'private_visits')::boolean from core.settings_changes sc
                   where sc.table_name = 'departments' and sc.row_id = e.department_id and sc.changes ? 'private_visits' and sc.recorded_at <= e.recorded_at
                   order by sc.recorded_at desc limit 1), false)
         and not exists (select 1 from core.visit_steps s join core.visits v on v.id = s.visit_id
                         where s.visit_id = e.visit_id and v.department_id = e.department_id and s.changes->>'is_private' = 'false'))
  order by r.root, e.recorded_at
$$;
insert into core.note_privacy (organization_id, entry_id, patient_id, department_id, is_private, changed_by, changed_at)
select b.organization_id, b.entry_id, b.patient_id, b.department_id, true, b.changed_by, b.changed_at
from core.note_privacy_backfill(array(select v.id from core.visits v where v.is_private)) b;

-- ── the one test: a note is private when the latest row of its chain says so
create or replace function core.note_private(e core.entries) returns boolean
language sql stable security definer set search_path = '' as $$
  select core.is_note(e.type) and coalesce((select np.is_private from core.note_privacy np where np.entry_id = core.root_of(e.id)
                                            order by np.changed_at desc, np.id desc limit 1), false)
$$;

-- a consult reply is for whoever asked: the requester, and people who work in the asking department
create or replace function core.reply_for(e core.entries, p_reader uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select e.reply_to_id is not null and exists (select 1 from core.requests r where r.entry_id = e.reply_to_id
    and (r.requester_id = p_reader or core.works_in(p_reader, r.from_department_id)))
$$;

drop function if exists core.note_hidden(core.entries, uuid[]);
drop function if exists core.reply_for_me(core.entries);
-- hidden from this reader: private, and the reader does not work there, did not open that department's notes of this patient anyway
-- within 12 hours, is not its author or responsible clinician, and is not the one who asked (a consult reply)
create or replace function core.note_hidden(e core.entries, p_reader uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select core.note_private(e)
     and not core.works_in(p_reader, e.department_id)
     and p_reader is distinct from e.author_id and p_reader is distinct from e.responsible_id
     and not exists (select 1 from core.record_reads rr where rr.user_id = p_reader and rr.basis = 'anyway' and rr.opened_department_id = e.department_id
                      and rr.patient_id = core.survivor(e.patient_id) and rr.read_at > pg_catalog.now() - interval '12 hours')
     and not core.reply_for(e, p_reader)
$$;

-- the ids of every hidden note of these patients (all versions), in one query; every mask tests e.id = any(hidden)
create or replace function core.hidden_entries(p_reader uuid, p_patient_ids uuid[]) returns uuid[]
language sql stable security definer set search_path = '' as $$
  with priv as (select distinct on (np.entry_id) np.entry_id as root, np.is_private from core.note_privacy np
                where np.patient_id = any(p_patient_ids) order by np.entry_id, np.changed_at desc, np.id desc)
  select coalesce(pg_catalog.array_agg(e.id), '{}') from priv cross join lateral core.chain_of(priv.root) e
  where priv.is_private and core.note_hidden(e, p_reader)
$$;

-- the same for one patient and every record merged into it
create or replace function core.hidden_for(p_user uuid, p_patient uuid) returns uuid[]
language sql stable security definer set search_path = '' as $$
  select core.hidden_entries(p_user, (select pg_catalog.array_agg(x.id) from core.patients x where x.id = core.survivor(p_patient) or x.merged_into_id = core.survivor(p_patient)))
$$;

-- ── masks, per note, with the real department name always
create or replace function core.entry_card(e core.entries, p_hidden uuid[]) returns jsonb
language sql stable security definer set search_path = '' as $$
  select case
    when e.id = any(p_hidden) then pg_catalog.jsonb_build_object(
      'id', e.id, 'type', e.type, 'occurred_at', e.occurred_at, 'recorded_at', e.recorded_at, 'author_name', null,
      'department_name', (select d.name from core.departments d where d.id = e.department_id), 'department_id', e.department_id,
      'display_line', 'Private note', 'flag', null, 'is_final', e.is_final, 'source', e.source, 'reply_to_id', e.reply_to_id, 'replaces_id', e.replaces_id,
      'replaced_by_id', e.replaced_by_id, 'visit_id', e.visit_id, 'service_id', null, 'is_hidden', true)
    else core.entry_card(e)
      || case when exists (select 1 from core.requests r where r.entry_id = e.id)
               and exists (select 1 from core.entries x where x.reply_to_id = e.id and x.replaced_by_id is null and x.type <> 'entered_in_error' and x.id = any(p_hidden))
              then pg_catalog.jsonb_build_object('request', (core.entry_card(e)->'request') || '{"reply_line": "Private reply", "reply_flag": null, "review_reason": null}'::jsonb)
              else '{}'::jsonb end
  end
$$;

create or replace function core.entry_data(e core.entries, p_hidden uuid[]) returns jsonb
language sql stable security definer set search_path = '' as $$
  select case when e.id = any(p_hidden) then '{}'::jsonb else e.data end
$$;

-- ── a search hit and the banner: the real department and assignee; no consult questions
create or replace function core.patient_hit(p core.patients, u uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select pg_catalog.jsonb_build_object('id', p.id, 'record_number', p.record_number, 'given_name', p.given_name, 'middle_name', p.middle_name, 'family_name', p.family_name,
    'sex', p.sex, 'born_on', p.born_on, 'age', core.age_on(p.born_on, core.today(p.organization_id)), 'died_on', p.died_on, 'phone_text', p.phone_text, 'merged_into_id', p.merged_into_id,
    'identifiers', coalesce((select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('system', i.system, 'value', i.value)) from core.patient_identifiers i where i.patient_id = p.id), '[]'),
    'latest_change_id', (select c.id from core.patient_changes c where c.patient_id = p.id order by c.recorded_at desc limit 1),
    'open_visits', coalesce((select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('id', v.id, 'department_id', v.department_id, 'department_name', d.name,
        'status', v.status, 'present', v.present_at is not null, 'arrived_at', v.arrived_at, 'assignee_id', v.assignee_id) order by v.arrived_at desc)
      from core.visits v join core.departments d on d.id = v.department_id where v.patient_id = p.id and v.ended_at is null), '[]'),
    'open_consults', coalesce((select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('request_id', r.entry_id, 'to_department_id', r.to_department_id))
      from core.requests r join core.entries e on e.id = r.entry_id join core.services s on s.id = e.service_id join core.department_types t on t.key = (select type from core.departments where id = r.to_department_id)
      where r.patient_id = p.id and r.status = 'open' and s.reply_type = 'note' and t.is_visited), '[]'))
$$;

create or replace function public.read_patient(patient_id uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare org uuid; u uuid; p core.patients;
begin
  org := core.org_of_patient(patient_id); if org is null then perform core.refuse('not_found'); end if;
  u := core.require_access(org, 'read:patient', patient_id, null);
  select * into p from core.patients where id = coalesce((select merged_into_id from core.patients where id = patient_id), patient_id);
  return core.patient_hit(p, u) || pg_catalog.jsonb_build_object(
    'changes', coalesce((select pg_catalog.jsonb_agg(pg_catalog.to_jsonb(c) order by c.recorded_at desc) from core.patient_changes c where c.patient_id = p.id), '[]'));
end $$;

-- ── the read log: open anyway names a department
drop function if exists core.open_record(uuid, uuid, uuid, uuid, uuid, text);
create function core.open_record(p_org uuid, p_user uuid, p_patient uuid, p_department uuid, p_open_department uuid, p_reason text) returns void
language plpgsql security definer set search_path = '' as $$
declare k core.user_kind; v_basis text; ids uuid[];
begin
  if p_open_department is null and exists (select 1 from core.record_reads rr where rr.user_id = p_user and rr.patient_id = p_patient and rr.read_at > pg_catalog.now() - interval '10 minutes') then
    return;
  end if;
  select kind into k from core.users where id = p_user;
  select pg_catalog.array_agg(id) into ids from core.patients where id = p_patient or merged_into_id = p_patient;
  v_basis := case
    when p_open_department is not null then 'anyway'
    when k in ('pack','machine','importer') then 'pack'
    when p_department is not null and exists (select 1 from core.visits v where v.patient_id = any(ids) and v.department_id = p_department and v.ended_at is null) then 'visit'
    when p_department is not null and exists (select 1 from core.requests r where r.patient_id = any(ids) and r.status = 'open'
                                              and (r.to_department_id = p_department or r.from_department_id = p_department)) then 'request'
    else 'none' end;
  insert into core.record_reads (organization_id, user_id, patient_id, department_id, basis, reason_text, opened_department_id)
  values (p_org, p_user, p_patient, p_department, v_basis, nullif(trim(coalesce(p_reason, '')), ''), p_open_department);
end $$;

drop function if exists public.read_record(uuid, uuid, uuid, text);
create function public.read_record(patient_id uuid, department_id uuid, open_department_id uuid default null, reason text default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare org uuid; u uuid; sv uuid; ids uuid[]; p core.patients; out jsonb; hidden uuid[]; k core.user_kind;
begin
  org := core.org_of_patient(patient_id);
  if org is null then perform core.refuse('wrong_organization', 'patient'); end if;
  u := core.require_access(org, 'read:record', patient_id, department_id);
  sv := core.survivor(patient_id);
  select pg_catalog.array_agg(id) into ids from core.patients where id = sv or merged_into_id = sv;
  select * into p from core.patients where id = sv;
  if open_department_id is not null then
    select kind into k from core.users where id = u;
    if k is distinct from 'staff' then perform core.refuse('not_allowed', 'open anyway is for staff'); end if;
    if not exists (select 1 from core.departments d where d.id = open_department_id and d.organization_id = org) then perform core.refuse('not_found', 'department'); end if;
    if nullif(trim(coalesce(reason, '')), '') is null then perform core.refuse('reason_missing'); end if;
  end if;
  perform core.open_record(org, u, sv, read_record.department_id, open_department_id, reason);
  hidden := core.hidden_entries(u, ids);
  out := pg_catalog.jsonb_build_object(
    'patient', pg_catalog.jsonb_build_object('id', p.id, 'record_number', p.record_number, 'given_name', p.given_name, 'middle_name', p.middle_name, 'family_name', p.family_name,
       'sex', p.sex, 'born_on', p.born_on, 'age', core.age_on(p.born_on, core.today(org)), 'died_on', p.died_on, 'merged_into_id', p.merged_into_id, 'phone_text', p.phone_text),
    -- where private notes are hidden from this reader, for the open-anyway card
    'hidden_departments', coalesce((select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('department_id', h.department_id, 'department_name', d.name, 'notes', h.n) order by d.name)
       from (select e.department_id, count(*) as n from core.entries e where e.id = any(hidden) and e.replaced_by_id is null group by e.department_id) h
       join core.departments d on d.id = h.department_id), '[]'),
    'visit', (select pg_catalog.to_jsonb(v) from core.visits v where v.patient_id = any(ids) and v.department_id = read_record.department_id and v.ended_at is null limit 1),
    'allergies', coalesce((select pg_catalog.jsonb_agg(pg_catalog.to_jsonb(a) order by a.status, a.substance_name) from core.patient_allergies a where a.patient_id = any(ids)), '[]'),
    'allergy_review', (select pg_catalog.to_jsonb(x) from core.patient_list_reviews x where x.patient_id = sv and x.list = 'allergies'),
    'problems', coalesce((select pg_catalog.jsonb_agg(pg_catalog.to_jsonb(q) order by q.onset_on) from core.patient_problems q where q.patient_id = any(ids) and q.status = 'active'), '[]'),
    'problem_review', (select pg_catalog.to_jsonb(x) from core.patient_list_reviews x where x.patient_id = sv and x.list = 'problems'),
    'medications', coalesce((select pg_catalog.jsonb_agg(pg_catalog.to_jsonb(m) order by m.drug_name) from core.patient_medications m where m.patient_id = any(ids) and m.status = 'active'), '[]'),
    'medication_review', (select pg_catalog.to_jsonb(x) from core.patient_list_reviews x where x.patient_id = sv and x.list = 'medications'),
    'open_requests', coalesce((select pg_catalog.jsonb_agg(core.entry_card(e, hidden) order by e.occurred_at desc) from core.requests r join core.entries e on e.id = r.entry_id where r.patient_id = any(ids) and r.status = 'open'), '[]'),
    'entries', coalesce((select pg_catalog.jsonb_agg(core.entry_card(e, hidden) order by e.occurred_at desc, e.id desc) from (
        select x.* from core.entries x where x.patient_id = any(ids) and x.reply_to_id is null and x.replaced_by_id is null and x.type <> 'entered_in_error'
        order by x.occurred_at desc, x.id desc limit 30) e), '[]'),
    'latest_vitals', (select e.data->'values' from core.entries e where e.patient_id = any(ids) and e.type = 'vitals' and e.replaced_by_id is null order by e.occurred_at desc limit 1)
  );
  return out;
end $$;
grant execute on function public.read_record(uuid, uuid, uuid, text) to authenticated;

create or replace function public.read_record_reads(patient_id uuid, "limit" int default 500) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare org uuid; u uuid; sv uuid;
begin
  org := core.org_of_patient(patient_id); if org is null then perform core.refuse('wrong_organization', 'patient'); end if;
  u := core.require_access(org, 'read:record_reads', patient_id, null);
  sv := core.survivor(patient_id);
  return coalesce((select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('read_at', rr.read_at, 'user_name', x.name, 'user_kind', x.kind, 'department_name', d.name,
      'basis', rr.basis, 'reason_text', rr.reason_text, 'opened_department', od.name) order by rr.read_at desc)
    from (select * from core.record_reads r where r.patient_id in (select id from core.patients where id = sv or merged_into_id = sv) order by r.read_at desc limit greatest(1, least("limit", 5000))) rr
    join core.users x on x.id = rr.user_id left join core.departments d on d.id = rr.department_id left join core.departments od on od.id = rr.opened_department_id), '[]');
end $$;

-- opened anyway, and notes made not private: both are what the owner reviews
create or replace function public.read_opened_anyway(organization_id uuid, since timestamptz default null) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare u uuid;
begin
  u := core.require_access(organization_id, 'read:record_reads', null, null);
  return coalesce((select pg_catalog.jsonb_agg(z.row order by z.at desc) from (
      select rr.read_at as at, pg_catalog.jsonb_build_object('kind', 'opened', 'read_at', rr.read_at, 'user_name', x.name, 'department_name', d.name, 'reason_text', rr.reason_text,
        'patient', pg_catalog.jsonb_build_object('id', p.id, 'record_number', p.record_number, 'given_name', p.given_name, 'family_name', p.family_name),
        'opened_department', od.name) as row
      from core.record_reads rr join core.users x on x.id = rr.user_id join core.patients p on p.id = rr.patient_id
      left join core.departments d on d.id = rr.department_id left join core.departments od on od.id = rr.opened_department_id
      where rr.organization_id = read_opened_anyway.organization_id and rr.basis = 'anyway' and rr.read_at > coalesce(since, pg_catalog.now() - interval '7 days')
      union all
      select np.changed_at, pg_catalog.jsonb_build_object('kind', 'made_not_private', 'read_at', np.changed_at, 'user_name', x.name, 'department_name', d.name, 'reason_text', np.reason_text,
        'patient', pg_catalog.jsonb_build_object('id', p.id, 'record_number', p.record_number, 'given_name', p.given_name, 'family_name', p.family_name),
        'entry_id', np.entry_id)
      from core.note_privacy np left join core.users x on x.id = np.changed_by join core.patients p on p.id = np.patient_id left join core.departments d on d.id = np.department_id
      where np.organization_id = read_opened_anyway.organization_id and not np.is_private and np.changed_at > coalesce(since, pg_catalog.now() - interval '7 days')) z), '[]');
end $$;

-- ── make a note private or not private: its author, or anyone who works in its department; every version, one row for the chain
create or replace function public.mark_note_private(entry_id uuid, is_private boolean, reason text default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare e core.entries; u uuid; k core.user_kind; root uuid;
begin
  select * into e from core.entries where id = mark_note_private.entry_id; if not found then perform core.refuse('not_found'); end if;
  u := core.require_access(e.organization_id, 'read:record', e.patient_id, null);
  select kind into k from core.users where id = u;
  if k is distinct from 'staff' then perform core.refuse('not_allowed', 'staff only'); end if;
  root := core.root_of(e.id);
  select * into e from core.entries x where x.id = root;
  if not core.is_note(e.type) then perform core.refuse('not_a_note'); end if;
  if not (u = e.author_id or exists (select 1 from core.chain_of(root) c where c.author_id = u and core.is_note(c.type)) or core.works_in(u, e.department_id)) then
    perform core.refuse('not_allowed', 'its author or its department');
  end if;
  if not is_private and nullif(trim(coalesce(reason, '')), '') is null then perform core.refuse('reason_missing'); end if;
  if core.note_private(e) = is_private then return pg_catalog.jsonb_build_object('entry_id', root, 'is_private', is_private); end if;
  insert into core.note_privacy (organization_id, entry_id, patient_id, department_id, is_private, reason_text, changed_by)
  values (e.organization_id, root, e.patient_id, e.department_id, is_private, nullif(trim(coalesce(reason, '')), ''), u);
  perform core.signal('record:' || core.survivor(e.patient_id)::text, '{}'::jsonb);
  return pg_catalog.jsonb_build_object('entry_id', root, 'is_private', is_private);
end $$;
grant execute on function public.mark_note_private(uuid, boolean, text) to authenticated;

-- ── reads, re-created around hidden notes
create or replace function public.read_entries(patient_id uuid, before_at timestamptz default null, before_id uuid default null, types text[] default null, "limit" int default 50,
  visit_ids uuid[] default null, department_ids uuid[] default null, between_visits boolean default false) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare org uuid; u uuid; sv uuid; ids uuid[]; hidden uuid[];
begin
  org := core.org_of_patient(patient_id); if org is null then perform core.refuse('wrong_organization', 'patient'); end if;
  u := core.require_access(org, 'read:record', patient_id, null);
  sv := core.survivor(patient_id); perform core.require_open(u, sv);
  select pg_catalog.array_agg(id) into ids from core.patients where id = sv or merged_into_id = sv;
  hidden := core.hidden_entries(u, ids);
  return coalesce((select pg_catalog.jsonb_agg(core.entry_card(e, hidden) order by e.occurred_at desc, e.id desc) from (
    select x.* from core.entries x where x.patient_id = any(ids) and x.reply_to_id is null and x.replaced_by_id is null and x.type <> 'entered_in_error'
      and (types is null or x.type = any(types))
      and (visit_ids is null or x.visit_id = any(visit_ids))
      and (department_ids is null or x.department_id = any(department_ids))
      and (not between_visits or x.visit_id is null)
      and (before_at is null or (x.occurred_at, x.id) < (before_at, coalesce(before_id, '00000000-0000-0000-0000-000000000000')))
    order by x.occurred_at desc, x.id desc limit greatest(1, least("limit", 200))) e), '[]');
end $$;

create or replace function public.read_entry(entry_id uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare e core.entries; u uuid; hidden uuid[];
begin
  select * into e from core.entries where id = entry_id; if not found then perform core.refuse('not_found'); end if;
  u := core.require_access(e.organization_id, 'read:record', e.patient_id, null);
  perform core.require_open(u, core.survivor(e.patient_id));
  hidden := core.hidden_for(u, e.patient_id);
  if e.id = any(hidden) then
    return core.entry_card(e, hidden) || pg_catalog.jsonb_build_object('data', '{}'::jsonb, 'patient_id', e.patient_id, 'replies', '[]'::jsonb, 'files', '[]'::jsonb, 'steps', '[]'::jsonb, 'versions', '[]'::jsonb);
  end if;
  return core.entry_card(e, hidden) || pg_catalog.jsonb_build_object('data', core.entry_data(e, hidden), 'patient_id', e.patient_id,
    'is_private', core.note_private(e), 'is_note', core.is_note(e.type),
    'can_mark_private', core.is_note(e.type) and (select x.kind from core.users x where x.id = u) = 'staff'
                        and (exists (select 1 from core.chain_of(e.id) c where c.author_id = u and core.is_note(c.type)) or core.works_in(u, e.department_id)),
    'patient', (select pg_catalog.jsonb_build_object('id', p.id, 'record_number', p.record_number, 'given_name', p.given_name, 'family_name', p.family_name, 'sex', p.sex, 'age', core.age_on(p.born_on, core.today(e.organization_id)))
                from core.patients p where p.id = e.patient_id),
    'replies', coalesce((select pg_catalog.jsonb_agg(core.entry_card(x, hidden) || pg_catalog.jsonb_build_object('data', core.entry_data(x, hidden)) order by x.occurred_at) from core.entries x where x.reply_to_id = e.id and x.replaced_by_id is null and x.type <> 'entered_in_error'), '[]'),
    'files', coalesce((select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('position', f.position, 'name', f.name, 'mime', f.mime) order by f.position) from core.entry_files f where f.entry_id = e.id), '[]'),
    'steps', coalesce((select pg_catalog.jsonb_agg(pg_catalog.to_jsonb(s) - 'actor_id' - 'changes' order by s.position) from core.request_steps s where s.request_id = e.id), '[]'),
    'versions', coalesce((select pg_catalog.jsonb_agg(core.entry_card(x, hidden) || pg_catalog.jsonb_build_object('data', core.entry_data(x, hidden)) order by x.recorded_at) from core.chain_of(e.id) x where x.id <> e.id), '[]'));
end $$;

create or replace function public.read_entry_file(entry_id uuid, file_position smallint) returns text
language plpgsql stable security definer set search_path = '' as $$
declare e core.entries; f core.entry_files; u uuid;
begin
  select * into e from core.entries where id = entry_id; if not found then perform core.refuse('not_found'); end if;
  u := core.require_access(e.organization_id, 'read:record', e.patient_id, null); perform core.require_open(u, core.survivor(e.patient_id));
  if core.note_hidden(e, u) then perform core.refuse('private_note'); end if;
  select * into f from core.entry_files where entry_files.entry_id = read_entry_file.entry_id and entry_files.position = file_position;
  if not found then perform core.refuse('not_found', 'file'); end if;
  return coalesce(f.url, f.path);   -- the client exchanges a path for a 60 s signed URL through storage
end $$;

create or replace function public.read_values(patient_id uuid, codes text[], "limit" int default 12) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare org uuid; u uuid; sv uuid; ids uuid[]; hidden uuid[];
begin
  org := core.org_of_patient(patient_id); if org is null then perform core.refuse('wrong_organization', 'patient'); end if;
  u := core.require_access(org, 'read:record', patient_id, null);
  sv := core.survivor(patient_id); perform core.require_open(u, sv);
  select pg_catalog.array_agg(id) into ids from core.patients where id = sv or merged_into_id = sv;
  hidden := core.hidden_entries(u, ids);
  return coalesce((select pg_catalog.jsonb_object_agg(c, pts) from (
    select c, (select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('at', v.occurred_at, 'value_number', v.value_number, 'value_text', v.value_text, 'unit', v.unit, 'flag', v.flag, 'entry_id', v.entry_id) order by v.occurred_at desc)
               from (select y.* from core.entry_values y where y.patient_id = any(ids) and (y.code = c or y.code in (select code from core.codes where replaced_by_code = c))
                     and not (y.entry_id = any(hidden)) order by y.occurred_at desc limit "limit") v) as pts
    from pg_catalog.unnest(codes) c) t), '{}');
end $$;

create or replace function public.read_results_table(patient_id uuid, "limit" int default 12) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare org uuid; u uuid; sv uuid; ids uuid[]; hidden uuid[];
begin
  org := core.org_of_patient(patient_id); if org is null then perform core.refuse('wrong_organization', 'patient'); end if;
  u := core.require_access(org, 'read:record', patient_id, null);
  sv := core.survivor(patient_id); perform core.require_open(u, sv);
  select pg_catalog.array_agg(id) into ids from core.patients where id = sv or merged_into_id = sv;
  hidden := core.hidden_entries(u, ids);
  return coalesce((select pg_catalog.jsonb_agg(t.row order by t.last_at desc) from (
    select max(v.occurred_at) as last_at, pg_catalog.jsonb_build_object('code', v.code, 'name', coalesce(max(c.name), v.code), 'unit', max(v.unit),
      'points', (select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('at', p.occurred_at, 'value_number', p.value_number, 'value_text', p.value_text, 'flag', p.flag,
                   'entry_id', p.entry_id, 'corrected', p.corrected) order by p.occurred_at desc)
                 from (select w.*, e2.replaces_id is not null as corrected from core.entry_values w join core.entries e2 on e2.id = w.entry_id
                       where w.patient_id = any(ids) and w.code = v.code and e2.replaced_by_id is null and not (e2.id = any(hidden)) order by w.occurred_at desc limit greatest(1, least("limit", 50))) p)) as row
    from core.entry_values v join core.entries e on e.id = v.entry_id left join core.codes c on c.code = v.code
    where v.patient_id = any(ids) and e.replaced_by_id is null and not (e.id = any(hidden)) group by v.code) t), '[]');
end $$;

create or replace function public.read_to_review(department_id uuid default null) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare u uuid; org uuid;
begin
  if department_id is not null then
    select organization_id into org from core.departments where id = department_id;
    u := core.require_access(org, 'mark:reviewed', null, department_id);   -- not read:queue: serving departments would read Psychiatry's list
  else
    -- mine: any organization I belong to; find it from the login
    select organization_id, id into org, u from core.users where login_id = core.auth_uid() and retired_at is null limit 1;
    if u is null then perform core.refuse('not_a_member'); end if;
    perform core.require_access(org, 'mark:reviewed', null, null);
  end if;
  return coalesce((select pg_catalog.jsonb_agg(core.entry_card(e, core.hidden_for(u, e.patient_id)) || pg_catalog.jsonb_build_object(
        'patient', pg_catalog.jsonb_build_object('id', p.id, 'record_number', p.record_number, 'given_name', p.given_name, 'family_name', p.family_name),
        'service_name', e.data->'service'->>'name',
        -- up to three numbers of the latest reply, the most flagged first, each with the patient's value before it
        'compare', coalesce((select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('name', coalesce(k.name, v.code), 'value', v.value_number, 'unit', v.unit, 'flag', v.flag,
            'previous', pv.value_number, 'previous_at', pv.occurred_at) order by v.rank)
          from (select v0.*, row_number() over (order by (v0.flag = 'critical') desc, (v0.flag in ('high', 'low', 'abnormal')) desc, v0.position) as rank
                from core.entry_values v0
                where v0.value_number is not null and v0.entry_id = (select x.id from core.entries x where x.reply_to_id = r.entry_id and x.replaced_by_id is null
                        and x.type <> 'entered_in_error' and not core.note_hidden(x, u) order by x.recorded_at desc limit 1)) v
          left join core.codes k on k.code = v.code
          left join lateral (select y.value_number, y.occurred_at from core.entry_values y join core.entries ye on ye.id = y.entry_id
              where y.patient_id = v.patient_id and y.code = v.code and y.occurred_at < v.occurred_at and y.value_number is not null and ye.replaced_by_id is null
                and ye.reply_to_id is distinct from r.entry_id
                and not core.note_hidden(ye, u) order by y.occurred_at desc limit 1) pv on true
          where v.rank <= 3), '[]')) order by (r.reply_flag = 'critical') desc, r.review_needed_at)
    from core.requests r join core.entries e on e.id = r.entry_id join core.patients p on p.id = e.patient_id
    where r.review_needed_at is not null and ((read_to_review.department_id is null and r.requester_id = u) or (read_to_review.department_id is not null and r.from_department_id = read_to_review.department_id))), '[]');
end $$;

-- the visit cards: real department and clinician; a visit shows whether it holds a note hidden from the reader; a visit cancelled
-- with nothing written is left out
create or replace function public.read_visits(patient_id uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare org uuid; u uuid; sv uuid; ids uuid[]; hidden uuid[];
begin
  org := core.org_of_patient(patient_id); if org is null then perform core.refuse('wrong_organization', 'patient'); end if;
  u := core.require_access(org, 'read:record', patient_id, null);
  sv := core.survivor(patient_id); perform core.require_open(u, sv);
  select pg_catalog.array_agg(id) into ids from core.patients where id = sv or merged_into_id = sv;
  hidden := core.hidden_entries(u, ids);
  return pg_catalog.jsonb_build_object(
    'visits', coalesce((select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
        'id', v.id, 'is_hidden', exists (select 1 from core.entries h where h.visit_id = v.id and h.id = any(hidden) and h.replaced_by_id is null),
        'department_id', v.department_id, 'department_name', d.name,
        'assignee_name', (select x.name from core.users x where x.id = v.assignee_id),
        'status', v.status, 'is_first', v.is_first, 'arrived_at', v.arrived_at, 'seen_at', v.seen_at, 'ended_at', v.ended_at, 'last_activity_at', v.last_activity_at,
        'counts', coalesce((select pg_catalog.jsonb_object_agg(c.type, c.n) from (select e.type, count(*) as n from core.entries e where e.visit_id = v.id
                   and e.reply_to_id is null and e.replaced_by_id is null and e.type <> 'entered_in_error' group by e.type) c), '{}'),
        'first_line', (select e.display_line from core.entries e where e.visit_id = v.id and e.type = 'note' and e.replaced_by_id is null
                   and not (e.id = any(hidden)) order by e.occurred_at limit 1)) order by v.last_activity_at desc, v.arrived_at desc)
      from (select vv.*, greatest(vv.arrived_at, vv.seen_at, vv.ended_at,
                (select max(e.recorded_at) from core.entries e where e.visit_id = vv.id),
                (select max(s.recorded_at) from core.visit_steps s where s.visit_id = vv.id)) as last_activity_at
            from core.visits vv where vv.patient_id = any(ids)
              and not (vv.status = 'cancelled' and not exists (select 1 from core.entries ce where ce.visit_id = vv.id))) v
      join core.departments d on d.id = v.department_id), '[]'),
    'between', (select count(*) from core.entries e where e.patient_id = any(ids) and e.visit_id is null and e.reply_to_id is null and e.replaced_by_id is null and e.type <> 'entered_in_error'));
end $$;

-- the request queue: department names real; a hidden reply stays hidden
create or replace function public.read_queue(department_id uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare org uuid; u uuid;
begin
  select organization_id into org from core.departments where id = department_id; if org is null then perform core.refuse('not_found', 'department'); end if;
  u := core.require_access(org, 'read:queue', null, department_id);
  return pg_catalog.jsonb_build_object(
    'requests', coalesce((select pg_catalog.jsonb_agg(core.entry_card(e, core.hidden_for(u, e.patient_id)) || pg_catalog.jsonb_build_object(
          'patient', pg_catalog.jsonb_build_object('id', p.id, 'record_number', p.record_number, 'given_name', p.given_name, 'family_name', p.family_name, 'sex', p.sex, 'born_on', p.born_on,
            'here', exists (select 1 from core.visits hv where hv.patient_id = p.id and hv.ended_at is null and hv.present_at is not null)),
          'from_department_name', e.data->>'department_name', 'requester_name', e.data->>'author_name', 'question_text', e.data->>'question_text',
          'section_name', s.section_name, 'service_name', s.name, 'reply_type', s.reply_type, 'assignee_id', r.assignee_id,
          'details', case when e.type = 'prescription' then pg_catalog.jsonb_strip_nulls(pg_catalog.jsonb_build_object('drug', e.data->'drug', 'dose_number', e.data->'dose_number',
             'dose_unit', e.data->'dose_unit', 'route', e.data->'route', 'frequency', e.data->'frequency', 'prn', e.data->'prn', 'duration_days', e.data->'duration_days',
             'quantity', e.data->'quantity', 'repeats', e.data->'repeats', 'instructions_text', e.data->'instructions_text')) end)
        order by r.priority, r.due_at)
      from core.requests r join core.entries e on e.id = r.entry_id join core.patients p on p.id = e.patient_id left join core.services s on s.id = e.service_id
      where r.to_department_id = read_queue.department_id and r.status = 'open'), '[]'),
    'recent', coalesce((select pg_catalog.jsonb_agg(core.entry_card(e, core.hidden_for(u, e.patient_id)) || pg_catalog.jsonb_build_object(
          'patient', pg_catalog.jsonb_build_object('id', p.id, 'record_number', p.record_number, 'given_name', p.given_name, 'family_name', p.family_name, 'sex', p.sex, 'born_on', p.born_on,
            'here', exists (select 1 from core.visits hv where hv.patient_id = p.id and hv.ended_at is null and hv.present_at is not null)),
          'from_department_name', e.data->>'department_name', 'requester_name', e.data->>'author_name', 'section_name', s.section_name, 'service_name', s.name,
          'reply', (select case when core.note_hidden(x, u) then pg_catalog.jsonb_build_object('id', x.id, 'data', '{}'::jsonb, 'author_name', null, 'recorded_at', x.recorded_at, 'is_final', x.is_final, 'is_hidden', true)
                    else pg_catalog.jsonb_build_object('id', x.id, 'data', x.data, 'author_name', x.data->>'author_name', 'recorded_at', x.recorded_at, 'is_final', x.is_final) end
                    from core.entries x where x.reply_to_id = e.id and x.replaced_by_id is null and x.type <> 'entered_in_error' order by x.occurred_at desc limit 1))
        order by r.replied_at desc)
      from (select * from core.requests rq where rq.to_department_id = read_queue.department_id and rq.status in ('done','cancelled')
              and rq.replied_at > pg_catalog.now() - interval '24 hours' order by rq.replied_at desc limit 300) r
      join core.entries e on e.id = r.entry_id join core.patients p on p.id = e.patient_id left join core.services s on s.id = e.service_id), '[]'),
    'done_today', (select count(*) from core.requests r where r.to_department_id = read_queue.department_id and r.status = 'done'
                   and exists (select 1 from core.request_steps st where st.request_id = r.entry_id and st.step = 'done' and st.recorded_at > core.day_start(org))));
end $$;

-- the visit queue: every visit, counts unfiltered (a visit is never private now)
create or replace function public.read_visit_queue(department_id uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare org uuid; u uuid;
begin
  org := core.org_of_department(department_id); if org is null then perform core.refuse('not_found', 'department'); end if;
  u := core.require_access(org, 'read:queue', null, department_id);
  return pg_catalog.jsonb_build_object(
    'rows', coalesce((select pg_catalog.jsonb_agg(row order by band_rank, priority, sort_at) from (
      select pg_catalog.jsonb_build_object('id', v.id, 'patient', pg_catalog.jsonb_build_object('id', p.id, 'record_number', p.record_number, 'given_name', p.given_name, 'family_name', p.family_name,
               'sex', p.sex, 'age', core.age_on(p.born_on, core.today(org)), 'has_allergies', exists (select 1 from core.patient_allergies a where a.patient_id = p.id and a.status = 'active')),
             'status', v.status, 'band', band, 'priority', v.priority, 'is_first', v.is_first, 'assignee_id', v.assignee_id,
             'assignee_name', (select name from core.users where id = v.assignee_id), 'arrived_at', v.arrived_at, 'present_at', v.present_at, 'called_at', v.called_at, 'missed_calls', v.missed_calls,
             'has_vitals', exists (select 1 from core.entries ve where ve.visit_id = v.id and ve.type = 'vitals' and ve.replaced_by_id is null), 'seen_at', v.seen_at,
             'request_id', v.request_id, 'request_open', exists (select 1 from core.requests r where r.entry_id = v.request_id and r.status = 'open'),
             'requests', coalesce((select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('request_id', r.entry_id, 'service_name', e.data->'service'->>'name', 'to_department_name', e.data->>'to_department_name', 'step', r.step, 'is_holding', r.status = 'open', 'type', e.type, 'replied', r.replied_at is not null))
                          from core.requests r join core.entries e on e.id = r.entry_id where e.visit_id = v.id), '[]')) as row,
             case band when 'back' then 1 when 'waiting' then 2 when 'pending' then 3 else 4 end as band_rank, v.priority,
             case band when 'waiting' then v.arrived_at else v.present_at end as sort_at
      from (select v.*, case when v.status = 'in_consult' then 'consult' when v.status = 'waiting' and v.seen_at is null then 'waiting'
                          when core.holds(v.id) = 0 then 'back' else 'pending' end as band
            from core.visits v where v.department_id = read_visit_queue.department_id and v.present_at is not null and v.ended_at is null) v
      join core.patients p on p.id = v.patient_id) q), '[]'),
    'done_today', (select count(*) from core.visits v where v.department_id = read_visit_queue.department_id and v.status = 'done' and v.ended_at > core.day_start(org)),
    'away', (select count(*) from core.visits v where v.department_id = read_visit_queue.department_id and v.ended_at is null and v.present_at is null));
end $$;

-- a step or a routing change returns the request row: department names are real, but a hidden reply's line, flag and review reason are
-- masked here as everywhere a request is returned
create or replace function core.masked_request(r core.requests, p_reader uuid) returns core.requests
language plpgsql stable security definer set search_path = '' as $$
begin
  if exists (select 1 from core.entries x where x.reply_to_id = r.entry_id and x.replaced_by_id is null and x.type <> 'entered_in_error' and core.note_hidden(x, p_reader)) then
    r.reply_line := 'Private reply'; r.reply_flag := null; r.review_reason := null;
  end if;
  return r;
end $$;

create or replace function public.mark_step(request_id uuid, from_step core.request_step, step core.request_step, reason text default null, occurred_at timestamptz default null)
returns core.requests language plpgsql security definer set search_path = '' as $$
declare r core.requests; u uuid; act text;
begin
  select * into r from core.requests where entry_id = request_id;
  if not found then perform core.refuse('request_not_found'); end if;
  act := 'mark:' || step::text;
  -- cancel belongs to the requester (or anyone holding mark:cancelled at the destination); every other step is the destination's
  if step = 'cancelled' and core.current_user_id(r.organization_id) = r.requester_id then u := core.require_access(r.organization_id, 'write:request', r.patient_id, r.from_department_id);
  else u := core.require_access(r.organization_id, act, r.patient_id, r.to_department_id); end if;
  return core.masked_request(core.change_request(request_id, from_step, step, u, reason, null, occurred_at), u);
end $$;

create or replace function public.mark_routing(request_id uuid, assignee_id uuid default null, to_department_id uuid default null, priority core.request_priority default null, due_at timestamptz default null, reason text default null)
returns core.requests language plpgsql security definer set search_path = '' as $$
declare r core.requests; u uuid;
begin
  select * into r from core.requests where entry_id = request_id;
  if not found then perform core.refuse('request_not_found'); end if;
  u := core.require_access(r.organization_id, 'mark:routing', r.patient_id, r.to_department_id);
  return core.masked_request(core.route_request(request_id, u, assignee_id, to_department_id, priority, due_at, reason), u);
end $$;

-- ── a visit no longer carries privacy
create or replace function public.open_visit(id uuid, patient_id uuid, department_id uuid, priority core.request_priority default 'routine', assignee_id uuid default null, request_id uuid default null)
returns core.visits language plpgsql security definer set search_path = '' as $$
declare org uuid; u uuid; p core.patients; d record; v core.visits; first boolean; r core.requests;
begin
  org := core.org_of_patient(patient_id); if org is null then perform core.refuse('wrong_organization', 'patient'); end if;
  u := core.require_access(org, 'write:visit', patient_id, department_id);
  select * into p from core.patients where patients.id = patient_id;
  if p.merged_into_id is not null then perform core.refuse('patient_merged', p.merged_into_id::text); end if;
  if p.died_on is not null then perform core.refuse('patient_died'); end if;
  select dp.*, t.is_visited into d from core.departments dp join core.department_types t on t.key = dp.type where dp.id = department_id;
  if d.retired_at is not null then perform core.refuse('department_retired'); end if;
  if not d.is_visited then perform core.refuse('not_visited'); end if;
  if d.type = 'ward' then perform core.refuse('not_yet', 'admissions pack'); end if;
  if request_id is not null then
    select * into r from core.requests where entry_id = request_id;
    if not found or r.status <> 'open' then perform core.refuse('request_not_open'); end if;
    if r.to_department_id <> department_id then perform core.refuse('wrong_department'); end if;
    if core.survivor(r.patient_id) <> patient_id then perform core.refuse('wrong_patient'); end if;
  end if;
  select * into v from core.visits where visits.id = open_visit.id;
  if found then
    if v.patient_id <> open_visit.patient_id or v.department_id <> open_visit.department_id then perform core.refuse('id_in_use'); end if;
    return v;
  end if;
  select * into v from core.visits where visits.patient_id = open_visit.patient_id and visits.department_id = open_visit.department_id and ended_at is null for update;
  if found then
    if v.present_at is null then
      update core.visits set present_at = pg_catalog.clock_timestamp() where visits.id = v.id returning * into v;
      perform core.change_visit(v, v.status, u, null, pg_catalog.jsonb_build_object('present_at', v.present_at));
    end if;
    if request_id is not null and v.request_id is null then
      update core.visits set request_id = open_visit.request_id where visits.id = v.id returning * into v;
      perform core.change_visit(v, v.status, u, null, pg_catalog.jsonb_build_object('request_id', request_id));
    end if;
    return v;
  end if;
  first := not exists (select 1 from core.visits where visits.patient_id = open_visit.patient_id and visits.department_id = open_visit.department_id and seen_at is not null);
  begin
    insert into core.visits (id, organization_id, patient_id, department_id, request_id, assignee_id, status, priority, is_first, present_at)
    values (id, org, patient_id, department_id, request_id, assignee_id, 'waiting', priority, first, pg_catalog.clock_timestamp()) returning * into v;
  exception when unique_violation then
    select * into v from core.visits where visits.patient_id = open_visit.patient_id and visits.department_id = open_visit.department_id and ended_at is null;
    return v;
  end;
  perform core.change_visit(v, 'waiting', u, null, pg_catalog.jsonb_build_object('request_id', request_id, 'assignee_id', assignee_id, 'priority', priority, 'is_first', first));
  return v;
end $$;

-- ── the organization read: the rule's new name, and where I work
create or replace function public.read_organization(organization_id uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare u uuid;
begin
  u := core.require_access(organization_id, 'read:organization', null, null);
  return pg_catalog.jsonb_build_object(
    'organization', (select pg_catalog.to_jsonb(o) from core.organizations o where o.id = organization_id),
    'me', (select pg_catalog.jsonb_build_object('id', x.id, 'name', x.name, 'kind', x.kind,
             'departments', coalesce((select pg_catalog.jsonb_agg(distinct pg_catalog.jsonb_build_object('id', d.id, 'name', d.name, 'type', d.type, 'is_visited', t.is_visited, 'site_name', d.site_name, 'patients_wait', d.patients_wait, 'review_results', d.review_results, 'is_private', d.is_private, 'after_done', d.after_done, 'pack_cards', d.pack_cards))
               from core.user_roles ur join core.departments d on (d.id = ur.department_id or (ur.department_id is null and d.organization_id = ur.organization_id and not d.is_outside))
               join core.department_types t on t.key = d.type where ur.user_id = x.id and d.retired_at is null), '[]'),
             'actions', coalesce((select pg_catalog.jsonb_agg(distinct ra.action) from core.user_roles ur join core.role_actions ra on ra.role_id = ur.role_id where ur.user_id = x.id), '[]'),
             'works_in', coalesce((select pg_catalog.jsonb_agg(d.id) from core.departments d where d.organization_id = read_organization.organization_id and core.works_in(x.id, d.id)), '[]'))
           from core.users x where x.id = u),
    'departments', coalesce((select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('id', d.id, 'name', d.name, 'type', d.type, 'is_visited', t.is_visited, 'is_outside', d.is_outside, 'site_name', d.site_name, 'patients_wait', d.patients_wait, 'review_results', d.review_results, 'is_private', d.is_private, 'after_done', d.after_done, 'pack_cards', d.pack_cards,
       'serves', coalesce((select pg_catalog.jsonb_agg(sd.served_department_id) from core.served_departments sd where sd.department_id = d.id), '[]')) order by d.name)
       from core.departments d join core.department_types t on t.key = d.type where d.organization_id = read_organization.organization_id and d.retired_at is null), '[]'),
    'services', coalesce((select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('id', s.id, 'department_id', s.department_id, 'section_name', s.section_name, 'code', s.code, 'name', s.name, 'reply_type', s.reply_type,
       'fields', coalesce((select pg_catalog.jsonb_agg(pg_catalog.to_jsonb(f) order by f.position) from core.service_fields f where f.service_id = s.id and f.retired_at is null), '[]')) order by s.name)
       from core.services s where s.organization_id = read_organization.organization_id and s.retired_at is null), '[]'),
    'templates', coalesce((select pg_catalog.jsonb_agg(pg_catalog.to_jsonb(t) order by t.name) from core.templates t where t.organization_id = read_organization.organization_id and t.retired_at is null), '[]'),
    'packs', coalesce((select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('key', p.key, 'name', p.name, 'enabled', op.retired_at is null and op.pack is not null))
       from core.packs p left join core.organization_packs op on op.pack = p.key and op.organization_id = read_organization.organization_id), '[]'),
    'users', coalesce((select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('id', x.id, 'name', x.name, 'kind', x.kind, 'title', x.title, 'retired_at', x.retired_at, 'accepted_at', x.accepted_at,
       'roles', coalesce((select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('role_id', ur.role_id, 'role_key', r.key, 'department_id', ur.department_id)) from core.user_roles ur join core.roles r on r.id = ur.role_id where ur.user_id = x.id), '[]')) order by x.name)
       from core.users x where x.organization_id = read_organization.organization_id and x.kind <> 'pack'), '[]'),
    'roles', coalesce((select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('id', r.id, 'key', r.key, 'name', r.name, 'is_builtin', r.organization_id is null,
       'actions', coalesce((select pg_catalog.jsonb_agg(ra.action) from core.role_actions ra where ra.role_id = r.id), '[]')))
       from core.roles r where (r.organization_id is null or r.organization_id = read_organization.organization_id) and r.retired_at is null), '[]'),
    'parked_pack_calls', (select count(*) from core.pack_calls pc where pc.organization_id = read_organization.organization_id and pc.tries >= 5));
end $$;

drop function if exists public.save_department(uuid, uuid, text, text, text, boolean, text, uuid[], uuid, boolean, text, boolean, text, boolean);
create function public.save_department(id uuid, organization_id uuid, type text, name text, site_name text default null, is_outside boolean default false,
  contact_text text default null, serves uuid[] default null, seen_change_id uuid default null,
  patients_wait boolean default null, review_results text default null, is_private boolean default null, after_done text default null, pack_cards boolean default null)
returns core.departments language plpgsql security definer set search_path = '' as $$
declare u uuid; d core.departments; t record;
begin
  u := core.require_access(organization_id, 'manage:departments', null, null);
  select * into t from core.department_types where key = type and retired_at is null; if not found then perform core.refuse('unknown_department_type', type); end if;
  if t.pack is not null then perform core.require_pack(organization_id, t.pack); end if;
  if type = 'outside' and not is_outside then is_outside := true; end if;
  if exists (select 1 from core.departments x where x.id = save_department.id and x.organization_id <> save_department.organization_id) then perform core.refuse('not_found', 'department'); end if;
  perform core.require_fresh('departments', id, seen_change_id);
  if exists (select 1 from core.departments x where x.organization_id = save_department.organization_id and x.id <> save_department.id and x.retired_at is null
             and core.fold(x.name) = core.fold(save_department.name)) then perform core.refuse('name_taken', name); end if;
  if review_results is not null and review_results not in ('critical','abnormal','all') then perform core.refuse('bad_setting', review_results); end if;
  if after_done is not null and after_done not in ('next','queue') then perform core.refuse('bad_setting', after_done); end if;
  insert into core.departments (id, organization_id, type, name, site_name, is_outside, contact_text, patients_wait, review_results, is_private, after_done, pack_cards)
  values (id, organization_id, type, trim(name), nullif(trim(coalesce(site_name,'')),''), is_outside, contact_text,
    coalesce(patients_wait, true), coalesce(review_results, 'critical'), coalesce(is_private, false), coalesce(after_done, 'next'), coalesce(pack_cards, true))
  on conflict on constraint departments_pkey do update set name = excluded.name, site_name = excluded.site_name, is_outside = excluded.is_outside, contact_text = excluded.contact_text,
    patients_wait = coalesce(save_department.patients_wait, departments.patients_wait), review_results = coalesce(save_department.review_results, departments.review_results),
    is_private = coalesce(save_department.is_private, departments.is_private), after_done = coalesce(save_department.after_done, departments.after_done),
    pack_cards = coalesce(save_department.pack_cards, departments.pack_cards)
  where departments.organization_id = excluded.organization_id
  returning * into d;
  if serves is not null then
    delete from core.served_departments where department_id = d.id;
    insert into core.served_departments (department_id, served_department_id) select d.id, x from pg_catalog.unnest(serves) x;
  end if;
  perform core.record_settings_change(organization_id, u, 'departments', d.id, pg_catalog.jsonb_build_object('type', type, 'name', d.name, 'site_name', d.site_name, 'serves', pg_catalog.to_jsonb(serves), 'patients_wait', d.patients_wait, 'review_results', d.review_results, 'is_private', d.is_private, 'after_done', d.after_done, 'pack_cards', d.pack_cards));
  return d;
end $$;
grant execute on function public.save_department(uuid, uuid, text, text, text, boolean, text, uuid[], uuid, boolean, text, boolean, text, boolean) to authenticated;

-- ── the live channels: the check reads core tables, which `authenticated` cannot, so a definer function answers it. A record channel
-- also needs an opened record (a record_reads row by this user for this patient within 12 hours).
create or replace function core.may_listen(p_topic text) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from core.users u where u.login_id = core.auth_uid() and (u.retired_at is null or u.retired_at > pg_catalog.now())
    and ((p_topic like 'queue:%' and exists (select 1 from core.departments d where d.id::text = pg_catalog.substr(p_topic, 7) and d.organization_id = u.organization_id
                                              and core.can(u.id, u.organization_id, 'read:queue', d.id)))
      or (p_topic like 'record:%' and exists (select 1 from core.patients p where p.id::text = pg_catalog.substr(p_topic, 8) and p.organization_id = u.organization_id
                                              and core.can(u.id, u.organization_id, 'read:record', null)
                                              and exists (select 1 from core.record_reads rr where rr.user_id = u.id and rr.patient_id = p.id
                                                          and rr.read_at > pg_catalog.now() - interval '12 hours')))))
$$;
grant execute on function core.may_listen(text) to authenticated;
do $$ begin
  if exists (select 1 from pg_catalog.pg_tables where schemaname = 'realtime' and tablename = 'messages') then
    execute 'drop policy if exists opencare_channels on realtime.messages';
    execute 'create policy opencare_channels on realtime.messages for select to authenticated using (core.may_listen(realtime.topic()))';
  end if;
end $$;

-- ── the funnel writes a note's first privacy row
create or replace function core.write_entry(
  p_id uuid, p_organization_id uuid, p_patient_id uuid, p_visit_id uuid, p_department_id uuid,
  p_author_id uuid, p_responsible_id uuid, p_source core.entry_source, p_source_key text,
  p_occurred_at timestamptz, p_type text, p_service_id uuid, p_data jsonb, p_display_line text,
  p_reply_to_id uuid, p_is_final boolean, p_replaces_id uuid, p_written_with_id uuid,
  p_destination jsonb default null, p_needs_review boolean default true
) returns core.entries language plpgsql security definer set search_path = '' as $$
declare e core.entries; old core.entries; t record; v_survivor uuid; v_recorded timestamptz; v_last timestamptz;
        v_caller uuid; v_caller_kind core.user_kind; v_caller_pack text; v_req_patient uuid; v_due timestamptz;
begin
  -- who is really writing: the JWT's user, or the runner's acting pack user. A trusted server
  -- context (migration, seed, test: no JWT, no acting user, not the API) may name any author.
  v_caller := core.current_user_id(p_organization_id);
  if v_caller is null and core.auth_uid() is null and session_user <> 'authenticator'
     and coalesce(current_setting('opencare.acting_user_id', true), '') = '' then
    null;                                                        -- trusted
  elsif v_caller is distinct from p_author_id then
    perform core.refuse('author_mismatch');
  else
    select kind, name into v_caller_kind, v_caller_pack from core.users where id = v_caller;
    if v_caller_kind = 'pack' then                                -- a pack is gated here even if its wrapper forgot
      perform core.require_pack(p_organization_id, v_caller_pack);
      perform core.require_access(p_organization_id, 'write:' || p_type, p_patient_id, p_department_id);
    else v_caller_pack := null; end if;
  end if;

  v_survivor := core.survivor(p_patient_id);
  if v_survivor is null then perform core.refuse('wrong_organization', 'patient'); end if;
  perform core.lock_record(p_patient_id);

  -- idempotency: same id → the stored row; same source_key → the stored row
  -- a retry returns the stored row only to the one who wrote it (or a trusted server context): never a row the caller may not read
  select * into e from core.entries where id = p_id;
  if found then
    if e.patient_id <> p_patient_id or e.type <> p_type or (v_caller is not null and e.author_id is distinct from v_caller) then perform core.refuse('id_in_use'); end if;
    return e;
  end if;
  if p_source_key is not null then
    select * into e from core.entries where organization_id = p_organization_id and source = p_source and source_key = p_source_key;
    if found then
      if e.patient_id <> p_patient_id or e.type <> p_type or (v_caller is not null and e.author_id is distinct from v_caller) then perform core.refuse('id_in_use'); end if;
      return e;
    end if;
  end if;

  -- the type
  select key, pack, retired_at into t from core.entry_types where key = p_type;
  if not found then perform core.refuse('unknown_type', p_type); end if;
  if p_replaces_id is null then
    if t.retired_at is not null then perform core.refuse('type_retired', p_type); end if;
    if t.pack is not null then perform core.require_pack(p_organization_id, t.pack); end if;
    if v_survivor <> p_patient_id and p_reply_to_id is null then perform core.refuse('patient_merged', v_survivor::text); end if;
  end if;

  -- links stay inside the patient
  if p_reply_to_id is not null then
    select patient_id into v_req_patient from core.requests where entry_id = p_reply_to_id;
    if v_req_patient is null then perform core.refuse('request_not_found'); end if;
    if core.survivor(v_req_patient) <> v_survivor then perform core.refuse('wrong_patient', 'reply'); end if;
    -- a reply is the kind its service asks for (amendments 2026-09-23 · 5), for core and packs alike; a strike is always allowed
    if p_type <> 'entered_in_error' and exists (select 1 from core.entries q join core.services sv on sv.id = q.service_id
        where q.id = p_reply_to_id and sv.reply_type not in ('none', p_type)) then
      perform core.refuse('wrong_reply_type', 'this request is answered by ' || (select sv.reply_type from core.entries q join core.services sv on sv.id = q.service_id where q.id = p_reply_to_id));
    end if;
  end if;
  if p_replaces_id is not null then
    select * into old from core.entries where id = p_replaces_id;
    if not found then perform core.refuse('not_found', 'replaces'); end if;
    if old.replaced_by_id is not null then perform core.refuse('already_replaced'); end if;
    if core.survivor(old.patient_id) <> v_survivor then perform core.refuse('wrong_patient', 'replaces'); end if;
    if p_type <> 'entered_in_error' and old.type <> p_type then perform core.refuse('type_mismatch'); end if;
    if exists (select 1 from core.requests where entry_id = old.id) and p_type = 'entered_in_error'
       and exists (select 1 from core.entries where reply_to_id = old.id and replaced_by_id is null and type <> 'entered_in_error') then
      perform core.refuse('request_has_replies');
    end if;
    p_reply_to_id := coalesce(p_reply_to_id, old.reply_to_id);
    -- a correction stays where it was written (spec 07): its visit and department; the corrector must be allowed to write there
    if old.department_id is not null and p_department_id is distinct from old.department_id then
      if v_caller is not null then perform core.require_access(p_organization_id, 'write:' || p_type, p_patient_id, old.department_id); end if;
      p_department_id := old.department_id;
    end if;
    p_visit_id := old.visit_id;
  end if;
  if p_written_with_id is not null and p_written_with_id <> p_id then
    if not exists (select 1 from core.entries where id = p_written_with_id and core.survivor(patient_id) = v_survivor) then perform core.refuse('wrong_patient', 'written_with'); end if;
  end if;
  if p_department_id is null and p_source not in ('patient','import') then perform core.refuse('department_missing'); end if;

  -- self-contained: copy what this entry used from settings (spec 01)
  p_data := coalesce(p_data, '{}'::jsonb)
    || pg_catalog.jsonb_build_object('author_name', (select name from core.users where id = p_author_id))
    || case when p_department_id is null then '{}'::jsonb else pg_catalog.jsonb_build_object('department_name', (select name from core.departments where id = p_department_id)) end
    || case when p_responsible_id is null then '{}'::jsonb else pg_catalog.jsonb_build_object('responsible_name', (select name from core.users where id = p_responsible_id)) end
    || case when p_service_id is null then '{}'::jsonb else pg_catalog.jsonb_build_object('service',
         (select pg_catalog.jsonb_build_object('id', s.id, 'code', s.code, 'name', s.name, 'reply_type', s.reply_type, 'department_name', d.name)
          from core.services s left join core.departments d on d.id = s.department_id where s.id = p_service_id)) end
    || case when p_destination is null then '{}'::jsonb else pg_catalog.jsonb_build_object('to_department_name', (select name from core.departments where id = (p_destination->>'to_department_id')::uuid)) end;
  if p_replaces_id is not null and old.is_final and p_type <> 'entered_in_error' and p_display_line not like 'Corrected: %' then
    p_display_line := 'Corrected: ' || p_display_line;
  end if;

  -- monotonic clock per record
  select max(recorded_at) into v_last from core.entries where patient_id = any(array(select id from core.patients where id = v_survivor or merged_into_id = v_survivor));
  v_recorded := greatest(pg_catalog.clock_timestamp(), coalesce(v_last, '-infinity'::timestamptz) + interval '1 microsecond');

  insert into core.entries (id, organization_id, patient_id, visit_id, author_id, responsible_id, department_id, source, source_key,
                            occurred_at, recorded_at, type, service_id, data, display_line, flag, reply_to_id, is_final, replaces_id, written_with_id)
  values (p_id, p_organization_id, p_patient_id, p_visit_id, p_author_id, p_responsible_id, p_department_id, p_source, p_source_key,
          coalesce(p_occurred_at, v_recorded), v_recorded, p_type, p_service_id, coalesce(p_data, '{}'), p_display_line, core.worst_flag(p_data), p_reply_to_id, p_is_final, p_replaces_id,
          p_written_with_id)
  returning * into e;
  perform core.extract_values(e);

  -- a note signed in a private department is private from its first read (spec 07); a correction stays in its chain and keeps the
  -- chain's privacy, so only a first version writes a row
  if p_replaces_id is null and core.is_note(p_type) and exists (select 1 from core.departments d where d.id = p_department_id and d.is_private) then
    insert into core.note_privacy (organization_id, entry_id, patient_id, department_id, is_private, changed_by, changed_at)
    values (e.organization_id, e.id, e.patient_id, e.department_id, true, e.author_id, e.recorded_at);
  end if;

  if p_replaces_id is not null then
    update core.entries set replaced_by_id = e.id where id = p_replaces_id;
    delete from core.entry_values where entry_id = p_replaces_id;
    select list, pack, pack_list into t from core.entry_types where key = old.type;
    if t.list is not null or t.pack_list is not null then perform core.replay_list(p_patient_id, t.list, t.pack, t.pack_list); end if;
    if exists (select 1 from core.requests where entry_id = old.id) then
      perform core.change_request(old.id, (select step from core.requests where entry_id = old.id), 'cancelled', p_author_id, 'replaced');
    end if;
    if old.reply_to_id is not null then perform core.refold_request(old.reply_to_id, p_needs_review); end if;
  else
    perform core.apply_updater(e);
  end if;

  -- a destination makes it a request: the row and its sent step, written here, never via the gated path
  if p_destination is not null and p_type <> 'entered_in_error' then
    v_due := coalesce((p_destination->>'due_at')::timestamptz, e.occurred_at);
    perform pg_catalog.set_config('opencare.in_change_request', 'true', true);
    insert into core.requests (entry_id, organization_id, patient_id, from_department_id, requester_id, to_department_id, assignee_id, priority, due_at, step)
    values (e.id, e.organization_id, e.patient_id, e.department_id, coalesce(e.responsible_id, e.author_id), (p_destination->>'to_department_id')::uuid,
            (p_destination->>'assignee_id')::uuid, coalesce((p_destination->>'priority')::core.request_priority, 'routine'), v_due, 'sent');
    perform pg_catalog.set_config('opencare.in_change_request', 'false', true);
    insert into core.request_steps (organization_id, request_id, position, step, actor_id, changes, occurred_at)
    values (e.organization_id, e.id, 1, 'sent', e.author_id, p_destination, e.occurred_at);
    perform core.signal('queue:' || (p_destination->>'to_department_id'), pg_catalog.jsonb_build_object('entry_id', e.id));
  end if;

  if e.reply_to_id is not null and p_replaces_id is null then perform core.refold_request(e.reply_to_id, p_needs_review); end if;

  -- packs hear after the commit
  insert into core.pack_calls (pack, entry_id, organization_id)
  select op.pack, e.id, e.organization_id from core.organization_packs op join core.packs p on p.key = op.pack
  where op.organization_id = e.organization_id and op.retired_at is null and p.is_called_after_write and op.pack is distinct from v_caller_pack;

  perform core.signal('record:' || v_survivor::text, pg_catalog.jsonb_build_object('entry_id', e.id));
  return e;
end $$;

-- ── striking a note as entered in error: the parameter replaces_id was ambiguous with the column, so every strike failed
create or replace function public.write_entered_in_error(id uuid, replaces_id uuid, department_id uuid, reason_text text)
returns core.entries language plpgsql security definer set search_path = '' as $$
declare old core.entries; h record;
begin
  select * into old from core.entries where entries.id = write_entered_in_error.replaces_id;
  if not found then perform core.refuse('not_found', 'replaces'); end if;
  if coalesce(reason_text, '') = '' then perform core.refuse('reason_missing'); end if;
  select * into h from core.begin_write(old.patient_id, department_id, 'write:entered_in_error', 'staff', null, null, '{}');
  return core.write_entry(id, h.o_org, old.patient_id, old.visit_id, department_id, h.o_author, null, 'staff', null, null,
    'entered_in_error', null, pg_catalog.jsonb_build_object('reason_text', reason_text, 'struck_type', old.type), 'Struck: ' || core.short(reason_text, 60), null, true,
    write_entered_in_error.replaces_id, null, null);
end $$;

-- ── users: another organization's user is not found, never overwritten (found by the K26 review; roles decide who works in a department)
create or replace function public.save_user(id uuid, organization_id uuid, kind core.user_kind, name text, title text default null,
  roles jsonb default null, departments uuid[] default null, retired_at timestamptz default null, seen_change_id uuid default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare u uuid; x core.users; r jsonb; n_open int := 0; n_review int := 0;
begin
  u := core.require_access(organization_id, 'manage:users', null, null);
  if id = u then perform core.refuse('self_change'); end if;
  perform 1 from core.organizations o where o.id = save_user.organization_id for update;                            -- the organization lock (spec 02)
  -- another organization's user is not found here, never overwritten (a login may belong to several organizations)
  if exists (select 1 from core.users o where o.id = save_user.id and o.organization_id <> save_user.organization_id) then perform core.refuse('not_found', 'user'); end if;
  perform core.require_fresh('users', id, seen_change_id);
  if kind not in ('staff','machine','importer') and roles is not null and pg_catalog.jsonb_array_length(roles) > 0 then perform core.refuse('roles_not_allowed', kind::text); end if;
  insert into core.users (id, organization_id, kind, name, title, invited_at, retired_at) values (id, organization_id, kind, trim(name), title, case when kind = 'staff' then pg_catalog.now() end, retired_at)
  on conflict on constraint users_pkey do update set name = excluded.name, title = excluded.title, retired_at = excluded.retired_at
  where users.organization_id = excluded.organization_id returning * into x;
  if roles is not null then
    -- nobody grants what they do not hold, in a scope no wider than their own
    for r in select * from pg_catalog.jsonb_array_elements(roles) loop
      -- a role of this organization or a built-in one, and live
      if not exists (select 1 from core.roles ro where ro.id = (r->>'role_id')::uuid and ro.retired_at is null
                     and (ro.organization_id is null or ro.organization_id = save_user.organization_id)) then
        perform core.refuse('not_found', 'role');
      end if;
      if exists (select 1 from core.role_actions ra where ra.role_id = (r->>'role_id')::uuid and ra.action like 'manage:%'
                 and not exists (select 1 from core.user_roles ur join core.role_actions ra2 on ra2.role_id = ur.role_id and ra2.action = ra.action
                                 where ur.user_id = u and (ur.department_id is null or ur.department_id = (r->>'department_id')::uuid))) then
        perform core.refuse('cannot_grant', r->>'role_id');
      end if;
    end loop;
    delete from core.user_roles where user_id = x.id;
    insert into core.user_roles (organization_id, user_id, role_id, department_id)
      select organization_id, x.id, (rr->>'role_id')::uuid, (rr->>'department_id')::uuid from pg_catalog.jsonb_array_elements(roles) rr;
  end if;
  if roles is not null or retired_at is not null then perform core.require_last_administrator(organization_id); end if;
  if retired_at is not null then
    select count(*) into n_open from core.requests where assignee_id = x.id and status = 'open';
    select count(*) into n_review from core.requests where requester_id = x.id and review_needed_at is not null;
  end if;
  perform core.record_settings_change(organization_id, u, 'users', x.id, pg_catalog.jsonb_build_object('name', x.name, 'kind', x.kind, 'roles', roles, 'retired_at', retired_at));
  return pg_catalog.to_jsonb(x) || pg_catalog.jsonb_build_object('open_assigned', n_open, 'to_review', n_review);
end $$;

-- ── erasing a patient: private-note rows go too, and replies go before the requests they answer (both failed before)
create or replace function public.erase_patient(patient_id uuid, reason text) returns void
language plpgsql security definer set search_path = '' as $$
declare ids uuid[]; sv uuid;
begin
  if coalesce(reason, '') = '' then perform core.refuse('reason_missing'); end if;
  sv := core.survivor(patient_id);
  select pg_catalog.array_agg(id) into ids from core.patients where id = sv or merged_into_id = sv;
  perform pg_catalog.set_config('opencare.erasing', 'true', true);
  delete from core.drafts where drafts.patient_id = any(ids);
  delete from core.entry_values where entry_values.patient_id = any(ids);
  delete from core.entry_files f using core.entries e where f.entry_id = e.id and e.patient_id = any(ids);
  delete from core.pack_calls pc using core.entries e where pc.entry_id = e.id and e.patient_id = any(ids);
  delete from core.note_privacy np where np.patient_id = any(ids) or np.entry_id in (select e.id from core.entries e where e.patient_id = any(ids));
  -- replies point at their requests: they go before the requests, and the requests before the rest of the entries
  delete from core.entries where entries.patient_id = any(ids) and entries.reply_to_id is not null;
  delete from core.request_steps s using core.entries e where s.request_id = e.id and e.patient_id = any(ids);
  delete from core.requests where requests.patient_id = any(ids);
  delete from core.patient_medications where patient_medications.patient_id = any(ids);
  delete from core.patient_problems where patient_problems.patient_id = any(ids);
  delete from core.patient_allergies where patient_allergies.patient_id = any(ids);
  delete from core.patient_list_reviews where patient_list_reviews.patient_id = any(ids);
  delete from core.record_reads where record_reads.patient_id = any(ids);
  delete from core.entries where entries.patient_id = any(ids);
  delete from core.patient_changes where patient_changes.patient_id = any(ids);
  delete from core.visit_steps s using core.visits v where s.visit_id = v.id and v.patient_id = any(ids);
  delete from core.visits where visits.patient_id = any(ids);
  delete from core.patient_identifiers where patient_identifiers.patient_id = any(ids);
  delete from core.patients where id = any(ids);
  insert into core.erasures (patient_id, reason, actor_id) values (sv, reason, coalesce(core.auth_uid(), '00000000-0000-0000-0000-000000000000'));
end $$;

-- ── privacy no longer lives on the visit
drop function if exists public.read_private_visits(uuid);
drop function if exists public.mark_visit_private(uuid, boolean, text);
drop function if exists core.hidden_visits(uuid, uuid[]);
drop function if exists core.visit_hidden(uuid, uuid);
drop function if exists core.sees_department(uuid, uuid, uuid);
alter table core.visits drop column is_private;
