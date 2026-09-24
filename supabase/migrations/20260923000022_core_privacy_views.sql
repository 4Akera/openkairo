-- 0022 · spec 07 (privacy and the record views), locked 2026-09-24
--   a visit can be private: its notes are hidden from anyone without a role in its department (or an open-anyway in the last 12 h);
--   its facts stay visible, shown with "Private visit" in place of the department · one read log with basis and reason; packs log too ·
--   a correction stays in its visit and department · department rules (patients wait, results to review, visits private) replace the
--   organization's · reads for the record views: read_visits, read_entries filters, read_results_table, read_entry versions by chain

-- ── columns ──
alter table core.visits add column if not exists is_private boolean not null default false;
alter table core.departments add column if not exists patients_wait boolean not null default true,
  add column if not exists review_results text not null default 'critical' check (review_results in ('critical','abnormal','all')),
  add column if not exists private_visits boolean not null default false;
update core.departments d set review_results = o.review_results from core.organizations o where o.id = d.organization_id;
drop function if exists public.read_organization_settings(uuid);
drop function if exists public.save_organization_settings(uuid, text);
alter table core.organizations drop column if exists review_results;
alter table core.entry_types add column if not exists is_note boolean not null default false;
update core.entry_types set is_note = true where key = 'note';
alter table core.record_reads add column if not exists department_id uuid, add column if not exists basis text,
  add column if not exists reason_text text, add column if not exists opened_visit_id uuid;
create index if not exists record_reads_opened on core.record_reads (user_id, opened_visit_id, read_at desc) where opened_visit_id is not null;
create index if not exists record_reads_anyway on core.record_reads (organization_id, read_at desc) where basis = 'anyway';

-- ── may: the gate's answer without refusing (same widening as require_access) ──
create or replace function core.can(p_user uuid, p_org uuid, p_action text, p_department uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from core.user_roles ur join core.role_actions ra on ra.role_id = ur.role_id join core.roles r on r.id = ur.role_id and r.retired_at is null
                 where ur.user_id = p_user and ur.organization_id = p_org and ra.action = p_action
                   and (ur.department_id is null or p_department is null or ur.department_id = p_department))
      or (p_action in ('read:queue','write:visit') and p_department is not null and exists (
                 select 1 from core.user_roles ur join core.role_actions ra on ra.role_id = ur.role_id and ra.action = p_action
                 join core.served_departments sd on sd.department_id = ur.department_id
                 where ur.user_id = p_user and ur.organization_id = p_org and (sd.served_department_id = p_department or sd.served_department_id is null)))
$$;

-- ── private visits: hidden from this user? (a role in the visit's department — not one held everywhere — or an open-anyway within 12 h) ──
create or replace function core.visit_hidden(p_user uuid, p_visit uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce((select v.is_private
      and not exists (select 1 from core.user_roles ur join core.role_actions ra on ra.role_id = ur.role_id and ra.action = 'read:record'
                      join core.roles r on r.id = ur.role_id and r.retired_at is null where ur.user_id = p_user and ur.department_id = v.department_id)
      and not exists (select 1 from core.record_reads rr where rr.user_id = p_user and rr.opened_visit_id = v.id and rr.read_at > pg_catalog.now() - interval '12 hours')
    from core.visits v where v.id = p_visit), false)
$$;
create or replace function core.hidden_visits(p_user uuid, p_patient_ids uuid[]) returns uuid[]
language sql stable security definer set search_path = '' as $$
  select coalesce(pg_catalog.array_agg(v.id), '{}') from core.visits v where v.patient_id = any(p_patient_ids) and v.is_private and core.visit_hidden(p_user, v.id)
$$;

-- a card as this reader may see it: a note from a hidden private visit is "Private note"; a fact from one keeps everything but its department
create or replace function core.entry_card(e core.entries, p_hidden uuid[]) returns jsonb
language sql stable security definer set search_path = '' as $$
  select case
    when e.visit_id is null or not (e.visit_id = any(p_hidden)) then core.entry_card(e)
    when coalesce((select t.is_note from core.entry_types t where t.key = e.type), false) then pg_catalog.jsonb_build_object(
      'id', e.id, 'type', e.type, 'occurred_at', e.occurred_at, 'recorded_at', e.recorded_at, 'author_name', null, 'department_name', 'Private visit',
      'display_line', 'Private note', 'flag', null, 'is_final', e.is_final, 'source', e.source, 'reply_to_id', e.reply_to_id, 'replaces_id', e.replaces_id,
      'replaced_by_id', e.replaced_by_id, 'visit_id', e.visit_id, 'service_id', null, 'is_hidden', true)
    else core.entry_card(e) || pg_catalog.jsonb_build_object('department_name', 'Private visit') end
$$;
create or replace function core.entry_data(e core.entries, p_hidden uuid[]) returns jsonb
language sql stable security definer set search_path = '' as $$
  select case when e.visit_id is null or not (e.visit_id = any(p_hidden)) then e.data
              when coalesce((select t.is_note from core.entry_types t where t.key = e.type), false) then '{}'::jsonb
              else e.data - 'department_name' end
$$;

-- a correction's whole chain, from the first version to the last, walking replaces_id (indexed) — never the whole table
create or replace function core.chain_of(p_entry uuid) returns setof core.entries
language sql stable security definer set search_path = '' as $$
  with recursive up as (select e.* from core.entries e where e.id = p_entry
                        union all select p.* from core.entries p join up on p.id = up.replaces_id),
       down as (select e.* from core.entries e where e.id = (select id from up where replaces_id is null limit 1)
                union all select n.* from core.entries n join down on n.replaces_id = down.id)
  select * from down
$$;

-- ── the one read log (spec 07): every open, why; packs too; a reload within 10 minutes adds nothing unless a visit is opened anyway ──
drop function if exists core.open_record(uuid, uuid, uuid);
create or replace function core.open_record(p_org uuid, p_user uuid, p_patient uuid, p_department uuid, p_visit uuid, p_reason text) returns void
language plpgsql security definer set search_path = '' as $$
declare k core.user_kind; v_basis text; ids uuid[];
begin
  if p_visit is null and exists (select 1 from core.record_reads rr where rr.user_id = p_user and rr.patient_id = p_patient and rr.read_at > pg_catalog.now() - interval '10 minutes') then
    return;
  end if;
  select kind into k from core.users where id = p_user;
  select pg_catalog.array_agg(id) into ids from core.patients where id = p_patient or merged_into_id = p_patient;
  v_basis := case
    when p_visit is not null then 'anyway'
    when k in ('pack','machine','importer') then 'pack'
    when p_department is not null and exists (select 1 from core.visits v where v.patient_id = any(ids) and v.department_id = p_department and v.ended_at is null) then 'visit'
    when p_department is not null and exists (select 1 from core.requests r where r.patient_id = any(ids) and r.status = 'open'
                                              and (r.to_department_id = p_department or r.from_department_id = p_department)) then 'request'
    else 'none' end;
  insert into core.record_reads (organization_id, user_id, patient_id, department_id, basis, reason_text, opened_visit_id)
  values (p_org, p_user, p_patient, p_department, v_basis, nullif(trim(coalesce(p_reason, '')), ''), p_visit);
end $$;

-- every reader opens first, people and packs alike
create or replace function core.require_open(p_user uuid, p_patient uuid) returns void
language plpgsql stable security definer set search_path = '' as $$
begin
  if not exists (select 1 from core.record_reads where user_id = p_user and patient_id = p_patient and read_at > pg_catalog.now() - interval '12 hours') then
    perform core.refuse('record_not_open');
  end if;
end $$;


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
  select * into e from core.entries where id = p_id;
  if found then
    if e.patient_id <> p_patient_id or e.type <> p_type then perform core.refuse('id_in_use'); end if;
    return e;
  end if;
  if p_source_key is not null then
    select * into e from core.entries where organization_id = p_organization_id and source = p_source and source_key = p_source_key;
    if found then return e; end if;
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

drop function if exists public.read_record(uuid, uuid);
create function public.read_record(patient_id uuid, department_id uuid, open_visit_id uuid default null, reason text default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare org uuid; u uuid; sv uuid; ids uuid[]; p core.patients; out jsonb; hidden uuid[];
begin
  org := core.org_of_patient(patient_id);
  if org is null then perform core.refuse('wrong_organization', 'patient'); end if;
  u := core.require_access(org, 'read:record', patient_id, department_id);
  sv := core.survivor(patient_id);
  select pg_catalog.array_agg(id) into ids from core.patients where id = sv or merged_into_id = sv;
  select * into p from core.patients where id = sv;
  if open_visit_id is not null then
    if not exists (select 1 from core.visits v where v.id = open_visit_id and v.patient_id = any(ids) and v.is_private) then perform core.refuse('not_found', 'private visit'); end if;
    if nullif(trim(coalesce(reason, '')), '') is null then perform core.refuse('reason_missing'); end if;
  end if;
  perform core.open_record(org, u, sv, read_record.department_id, open_visit_id, reason);
  hidden := core.hidden_visits(u, ids);
  out := pg_catalog.jsonb_build_object(
    'patient', pg_catalog.jsonb_build_object('id', p.id, 'record_number', p.record_number, 'given_name', p.given_name, 'middle_name', p.middle_name, 'family_name', p.family_name,
       'sex', p.sex, 'born_on', p.born_on, 'age', core.age_on(p.born_on, current_date), 'died_on', p.died_on, 'merged_into_id', p.merged_into_id, 'phone_text', p.phone_text),
    'hidden_visits', pg_catalog.to_jsonb(hidden),
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

drop function if exists public.read_entries(uuid, timestamptz, uuid, text[], int);
create function public.read_entries(patient_id uuid, before_at timestamptz default null, before_id uuid default null, types text[] default null, "limit" int default 50,
  visit_ids uuid[] default null, department_ids uuid[] default null, between_visits boolean default false) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare org uuid; u uuid; sv uuid; ids uuid[]; hidden uuid[];
begin
  org := core.org_of_patient(patient_id); if org is null then perform core.refuse('wrong_organization', 'patient'); end if;
  u := core.require_access(org, 'read:record', patient_id, null);
  sv := core.survivor(patient_id); perform core.require_open(u, sv);
  select pg_catalog.array_agg(id) into ids from core.patients where id = sv or merged_into_id = sv;
  hidden := core.hidden_visits(u, ids);
  return coalesce((select pg_catalog.jsonb_agg(core.entry_card(e, hidden) order by e.occurred_at desc, e.id desc) from (
    select x.* from core.entries x where x.patient_id = any(ids) and x.reply_to_id is null and x.replaced_by_id is null and x.type <> 'entered_in_error'
      and (types is null or x.type = any(types))
      and (visit_ids is null or x.visit_id = any(visit_ids))
      and (department_ids is null or (x.department_id = any(department_ids) and not coalesce(x.visit_id = any(hidden), false)))
      and (not between_visits or x.visit_id is null)
      and (before_at is null or (x.occurred_at, x.id) < (before_at, coalesce(before_id, '00000000-0000-0000-0000-000000000000')))
    order by x.occurred_at desc, x.id desc limit greatest(1, least("limit", 200))) e), '[]');
end $$;
grant execute on function public.read_entries(uuid, timestamptz, uuid, text[], int, uuid[], uuid[], boolean) to authenticated;

create or replace function public.read_entry(entry_id uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare e core.entries; u uuid; hidden uuid[];
begin
  select * into e from core.entries where id = entry_id; if not found then perform core.refuse('not_found'); end if;
  u := core.require_access(e.organization_id, 'read:record', e.patient_id, null);
  perform core.require_open(u, core.survivor(e.patient_id));
  hidden := core.hidden_visits(u, (select pg_catalog.array_agg(id) from core.patients where id = core.survivor(e.patient_id) or merged_into_id = core.survivor(e.patient_id)));
  if e.visit_id = any(hidden) and coalesce((select t.is_note from core.entry_types t where t.key = e.type), false) then
    return core.entry_card(e, hidden) || pg_catalog.jsonb_build_object('data', '{}'::jsonb, 'patient_id', e.patient_id, 'replies', '[]'::jsonb, 'files', '[]'::jsonb, 'steps', '[]'::jsonb, 'versions', '[]'::jsonb);
  end if;
  return core.entry_card(e, hidden) || pg_catalog.jsonb_build_object('data', core.entry_data(e, hidden), 'patient_id', e.patient_id,
    'patient', (select pg_catalog.jsonb_build_object('id', p.id, 'record_number', p.record_number, 'given_name', p.given_name, 'family_name', p.family_name, 'sex', p.sex, 'age', core.age_on(p.born_on, current_date))
                from core.patients p where p.id = e.patient_id),
    'replies', coalesce((select pg_catalog.jsonb_agg(core.entry_card(x, hidden) || pg_catalog.jsonb_build_object('data', core.entry_data(x, hidden)) order by x.occurred_at) from core.entries x where x.reply_to_id = e.id and x.replaced_by_id is null and x.type <> 'entered_in_error'), '[]'),
    'files', coalesce((select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('position', f.position, 'name', f.name, 'mime', f.mime) order by f.position) from core.entry_files f where f.entry_id = e.id), '[]'),
    'steps', coalesce((select pg_catalog.jsonb_agg(pg_catalog.to_jsonb(s) order by s.position) from core.request_steps s where s.request_id = e.id), '[]'),
    'versions', coalesce((select pg_catalog.jsonb_agg(core.entry_card(x, hidden) || pg_catalog.jsonb_build_object('data', core.entry_data(x, hidden)) order by x.recorded_at) from core.chain_of(e.id) x where x.id <> e.id), '[]'));
end $$;

create or replace function public.read_queue(department_id uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare org uuid; u uuid;
begin
  select organization_id into org from core.departments where id = department_id; if org is null then perform core.refuse('not_found', 'department'); end if;
  u := core.require_access(org, 'read:queue', null, department_id);
  return pg_catalog.jsonb_build_object(
    'requests', coalesce((select pg_catalog.jsonb_agg(core.entry_card(e) || case when core.visit_hidden(u, e.visit_id) then '{"department_name": "Private visit"}'::jsonb else '{}'::jsonb end || pg_catalog.jsonb_build_object(
          'patient', pg_catalog.jsonb_build_object('id', p.id, 'record_number', p.record_number, 'given_name', p.given_name, 'family_name', p.family_name, 'sex', p.sex, 'born_on', p.born_on),
          'from_department_name', case when core.visit_hidden(u, e.visit_id) then 'Private visit' else e.data->>'department_name' end, 'requester_name', e.data->>'author_name', 'question_text', e.data->>'question_text',
          'section_name', s.section_name, 'service_name', s.name, 'reply_type', s.reply_type, 'assignee_id', r.assignee_id)
        order by r.priority, r.due_at)
      from core.requests r join core.entries e on e.id = r.entry_id join core.patients p on p.id = e.patient_id left join core.services s on s.id = e.service_id
      where r.to_department_id = read_queue.department_id and r.status = 'open'), '[]'),
    'recent', coalesce((select pg_catalog.jsonb_agg(core.entry_card(e) || case when core.visit_hidden(u, e.visit_id) then '{"department_name": "Private visit"}'::jsonb else '{}'::jsonb end || pg_catalog.jsonb_build_object(
          'patient', pg_catalog.jsonb_build_object('id', p.id, 'record_number', p.record_number, 'given_name', p.given_name, 'family_name', p.family_name, 'sex', p.sex, 'born_on', p.born_on),
          'from_department_name', case when core.visit_hidden(u, e.visit_id) then 'Private visit' else e.data->>'department_name' end, 'requester_name', e.data->>'author_name', 'section_name', s.section_name, 'service_name', s.name,
          'reply', (select pg_catalog.jsonb_build_object('id', x.id, 'data', x.data, 'author_name', x.data->>'author_name', 'recorded_at', x.recorded_at, 'is_final', x.is_final)
                    from core.entries x where x.reply_to_id = e.id and x.replaced_by_id is null and x.type <> 'entered_in_error' order by x.occurred_at desc limit 1))
        order by r.replied_at desc)
      from (select * from core.requests rq where rq.to_department_id = read_queue.department_id and rq.status in ('done','cancelled')
              and rq.replied_at > pg_catalog.now() - interval '24 hours' order by rq.replied_at desc limit 300) r
      join core.entries e on e.id = r.entry_id join core.patients p on p.id = e.patient_id left join core.services s on s.id = e.service_id), '[]'),
    'done_today', (select count(*) from core.requests r where r.to_department_id = read_queue.department_id and r.status = 'done'
                   and exists (select 1 from core.request_steps st where st.request_id = r.entry_id and st.step = 'done' and st.recorded_at > date_trunc('day', pg_catalog.now()))));
end $$;

create or replace function core.patient_hit(p core.patients, u uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select pg_catalog.jsonb_build_object('id', p.id, 'record_number', p.record_number, 'given_name', p.given_name, 'middle_name', p.middle_name, 'family_name', p.family_name,
    'sex', p.sex, 'born_on', p.born_on, 'age', core.age_on(p.born_on, current_date), 'died_on', p.died_on, 'phone_text', p.phone_text, 'merged_into_id', p.merged_into_id,
    'identifiers', coalesce((select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('system', i.system, 'value', i.value)) from core.patient_identifiers i where i.patient_id = p.id), '[]'),
    'latest_change_id', (select c.id from core.patient_changes c where c.patient_id = p.id order by c.recorded_at desc limit 1),
    'open_visits', coalesce((select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('id', v.id,
        'department_id', case when v.is_private and not core.can(u, p.organization_id, 'read:queue', v.department_id) and core.visit_hidden(u, v.id) then null else v.department_id end,
        'department_name', case when v.is_private and not core.can(u, p.organization_id, 'read:queue', v.department_id) and core.visit_hidden(u, v.id) then 'Private visit' else d.name end, 'is_private', v.is_private, 'status', v.status,
        'present', v.present_at is not null, 'arrived_at', v.arrived_at, 'assignee_id', v.assignee_id) order by v.arrived_at desc)
      from core.visits v join core.departments d on d.id = v.department_id where v.patient_id = p.id and v.ended_at is null), '[]'),
    'open_consults', coalesce((select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('request_id', r.entry_id, 'to_department_id', r.to_department_id, 'question_text', e.data->>'question_text'))
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
    'visits', coalesce((select pg_catalog.jsonb_agg(case when v.is_private and not core.can(u, org, 'read:queue', v.department_id) and core.visit_hidden(u, v.id)
        then pg_catalog.to_jsonb(v) || pg_catalog.jsonb_build_object('department_id', null, 'assignee_id', null, 'department_name', 'Private visit')
        else pg_catalog.to_jsonb(v) || pg_catalog.jsonb_build_object('department_name', d.name) end order by v.arrived_at desc)
      from core.visits v join core.departments d on d.id = v.department_id where v.patient_id = p.id), '[]'),
    'changes', coalesce((select pg_catalog.jsonb_agg(pg_catalog.to_jsonb(c) order by c.recorded_at desc) from core.patient_changes c where c.patient_id = p.id), '[]'));
end $$;

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
  if found then return v; end if;
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
    insert into core.visits (id, organization_id, patient_id, department_id, request_id, assignee_id, status, priority, is_first, present_at, is_private)
    values (id, org, patient_id, department_id, request_id, assignee_id, 'waiting', priority, first, pg_catalog.clock_timestamp(),
      (select dp.private_visits from core.departments dp where dp.id = open_visit.department_id)) returning * into v;
  exception when unique_violation then
    select * into v from core.visits where visits.patient_id = open_visit.patient_id and visits.department_id = open_visit.department_id and ended_at is null;
    return v;
  end;
  perform core.change_visit(v, 'waiting', u, null, pg_catalog.jsonb_build_object('request_id', request_id, 'assignee_id', assignee_id, 'priority', priority, 'is_first', first));
  return v;
end $$;

drop function if exists public.mark_visit(uuid, core.visit_status, core.visit_status, text, boolean);
create function public.mark_visit(visit_id uuid, from_status core.visit_status, status core.visit_status, reason text default null, wait boolean default null) returns core.visits
language plpgsql security definer set search_path = '' as $$
declare v core.visits; u uuid; act text; legal boolean; target core.visit_status := status; v_wait boolean;
begin
  select * into v from core.visits where id = visit_id for update; if not found then perform core.refuse('not_found'); end if;
  if v.status <> from_status then perform core.refuse('visit_moved', v.status::text || ' by ' || coalesce((select name from core.users where id = v.assignee_id), '')); end if;
  -- the gate: in and out of consult is the clinician's; the rest is the desk's
  act := case when status = 'in_consult' or from_status in ('in_consult','pending') then 'mark:in_consult' else 'write:visit' end;
  u := core.require_access(v.organization_id, act, v.patient_id, v.department_id);
  legal := (from_status, status) in (('waiting','in_consult'),('pending','in_consult'),('in_consult','waiting'),('in_consult','done'),('pending','done'),('waiting','done'),('waiting','left'),
                                    ('waiting','cancelled'),('in_consult','cancelled'),('pending','cancelled'));
  if not legal then perform core.refuse('illegal_move', from_status::text || ' → ' || status::text); end if;
  if status = 'cancelled' and coalesce(reason, '') = '' then perform core.refuse('reason_missing'); end if;
  if status = 'left' and v.seen_at is not null then perform core.refuse('illegal_move', 'seen'); end if;
  -- the server decides done vs pending: anything still out keeps the visit open
  v_wait := coalesce(wait, (select d.patients_wait from core.departments d where d.id = v.department_id), true);
  if from_status = 'in_consult' and status = 'done' and v_wait and core.holds(v.id) > 0 then target := 'pending'; end if;
  update core.visits set status = target,
    seen_at = case when target = 'in_consult' and seen_at is null then pg_catalog.clock_timestamp() else seen_at end,
    assignee_id = case when target = 'in_consult' then u else assignee_id end,
    ended_at = case when target in ('done','left','cancelled') then pg_catalog.clock_timestamp() else ended_at end,
    present_at = case when target in ('done','left','cancelled') then null else present_at end
    where id = visit_id returning * into v;
  perform core.change_visit(v, target, u, reason, case when target = 'in_consult' then pg_catalog.jsonb_build_object('assignee_id', u) when target = 'done' and core.holds(v.id) > 0 then '{"wait": false}'::jsonb end);
  if from_status = 'in_consult' and target in ('done','pending') then perform core.clear_seen(v.id, u); end if;
  if target in ('done','left','cancelled') and from_status <> 'in_consult' then perform core.flag_unseen(v.id); end if;
  return v;
end $$;
grant execute on function public.mark_visit(uuid, core.visit_status, core.visit_status, text, boolean) to authenticated;

-- a clinician of the visit's department makes a visit private, or not; the visit's history keeps who and when
create or replace function public.mark_visit_private(visit_id uuid, is_private boolean, reason text default null) returns core.visits
language plpgsql security definer set search_path = '' as $$
declare v core.visits; u uuid;
begin
  select * into v from core.visits where id = visit_id for update; if not found then perform core.refuse('not_found'); end if;
  u := core.require_access(v.organization_id, 'mark:in_consult', v.patient_id, v.department_id);
  if v.is_private = mark_visit_private.is_private then return v; end if;
  update core.visits set is_private = mark_visit_private.is_private where id = v.id returning * into v;
  perform core.change_visit(v, v.status, u, reason, pg_catalog.jsonb_build_object('is_private', v.is_private));
  return v;
end $$;
grant execute on function public.mark_visit_private(uuid, boolean, text) to authenticated;

create or replace function core.review_reason(r core.requests, last core.entries, worst core.value_flag) returns text
language plpgsql stable security definer set search_path = '' as $$
declare setting text; v core.visits;
begin
  if last.id is null then return null; end if;
  if worst = 'critical' then return 'critical'; end if;
  if last.replaces_id is not null then return 'corrected'; end if;
  select d.review_results into setting from core.departments d where d.id = r.from_department_id;
  setting := coalesce(setting, 'critical');
  if setting in ('abnormal','all') and worst in ('low','high','abnormal') then return 'abnormal'; end if;
  if setting = 'all' and last.is_final then return 'result'; end if;
  if not last.is_final then return null; end if;
  select vv.* into v from core.entries e join core.visits vv on vv.id = e.visit_id where e.id = r.entry_id;
  if v.id is null or v.ended_at is not null or v.present_at is null then return 'not seen'; end if;
  return null;                                   -- the patient is here waiting: the clinician sees it when they come back
end $$;

drop function if exists public.save_department(uuid, uuid, text, text, text, boolean, text, uuid[], uuid);
create function public.save_department(id uuid, organization_id uuid, type text, name text, site_name text default null, is_outside boolean default false,
  contact_text text default null, serves uuid[] default null, seen_change_id uuid default null,
  patients_wait boolean default null, review_results text default null, private_visits boolean default null)
returns core.departments language plpgsql security definer set search_path = '' as $$
declare u uuid; d core.departments; t record;
begin
  u := core.require_access(organization_id, 'manage:departments', null, null);
  select * into t from core.department_types where key = type and retired_at is null; if not found then perform core.refuse('unknown_department_type', type); end if;
  if t.pack is not null then perform core.require_pack(organization_id, t.pack); end if;
  if type = 'outside' and not is_outside then is_outside := true; end if;
  perform core.require_fresh('departments', id, seen_change_id);
  if exists (select 1 from core.departments x where x.organization_id = save_department.organization_id and x.id <> save_department.id and x.retired_at is null
             and core.fold(x.name) = core.fold(save_department.name)) then perform core.refuse('name_taken', name); end if;
  if review_results is not null and review_results not in ('critical','abnormal','all') then perform core.refuse('bad_setting', review_results); end if;
  insert into core.departments (id, organization_id, type, name, site_name, is_outside, contact_text, patients_wait, review_results, private_visits)
  values (id, organization_id, type, trim(name), nullif(trim(coalesce(site_name,'')),''), is_outside, contact_text,
    coalesce(patients_wait, true), coalesce(review_results, 'critical'), coalesce(private_visits, false))
  on conflict on constraint departments_pkey do update set name = excluded.name, site_name = excluded.site_name, is_outside = excluded.is_outside, contact_text = excluded.contact_text,
    patients_wait = coalesce(save_department.patients_wait, departments.patients_wait), review_results = coalesce(save_department.review_results, departments.review_results),
    private_visits = coalesce(save_department.private_visits, departments.private_visits)
  returning * into d;
  if serves is not null then
    delete from core.served_departments where department_id = d.id;
    insert into core.served_departments (department_id, served_department_id) select d.id, x from pg_catalog.unnest(serves) x;
  end if;
  perform core.record_settings_change(organization_id, u, 'departments', d.id, pg_catalog.jsonb_build_object('type', type, 'name', d.name, 'site_name', d.site_name, 'serves', pg_catalog.to_jsonb(serves), 'patients_wait', d.patients_wait, 'review_results', d.review_results, 'private_visits', d.private_visits));
  return d;
end $$;
grant execute on function public.save_department(uuid, uuid, text, text, text, boolean, text, uuid[], uuid, boolean, text, boolean) to authenticated;

create or replace function public.read_organization(organization_id uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare u uuid;
begin
  u := core.require_access(organization_id, 'read:organization', null, null);
  return pg_catalog.jsonb_build_object(
    'organization', (select pg_catalog.to_jsonb(o) from core.organizations o where o.id = organization_id),
    'me', (select pg_catalog.jsonb_build_object('id', x.id, 'name', x.name, 'kind', x.kind,
             'departments', coalesce((select pg_catalog.jsonb_agg(distinct pg_catalog.jsonb_build_object('id', d.id, 'name', d.name, 'type', d.type, 'is_visited', t.is_visited, 'site_name', d.site_name, 'patients_wait', d.patients_wait, 'review_results', d.review_results, 'private_visits', d.private_visits))
               from core.user_roles ur join core.departments d on (d.id = ur.department_id or (ur.department_id is null and d.organization_id = ur.organization_id and not d.is_outside))
               join core.department_types t on t.key = d.type where ur.user_id = x.id and d.retired_at is null), '[]'),
             'actions', coalesce((select pg_catalog.jsonb_agg(distinct ra.action) from core.user_roles ur join core.role_actions ra on ra.role_id = ur.role_id where ur.user_id = x.id), '[]'))
           from core.users x where x.id = u),
    'departments', coalesce((select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('id', d.id, 'name', d.name, 'type', d.type, 'is_visited', t.is_visited, 'is_outside', d.is_outside, 'site_name', d.site_name, 'patients_wait', d.patients_wait, 'review_results', d.review_results, 'private_visits', d.private_visits,
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

-- the visits of a record, newest first, as this reader may see them; with counts, and the entries between visits
create or replace function public.read_visits(patient_id uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare org uuid; u uuid; sv uuid; ids uuid[]; hidden uuid[];
begin
  org := core.org_of_patient(patient_id); if org is null then perform core.refuse('wrong_organization', 'patient'); end if;
  u := core.require_access(org, 'read:record', patient_id, null);
  sv := core.survivor(patient_id); perform core.require_open(u, sv);
  select pg_catalog.array_agg(id) into ids from core.patients where id = sv or merged_into_id = sv;
  hidden := core.hidden_visits(u, ids);
  return pg_catalog.jsonb_build_object(
    'visits', coalesce((select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
        'id', v.id, 'is_private', v.is_private, 'is_hidden', v.id = any(hidden),
        'department_id', case when v.id = any(hidden) then null else v.department_id end,
        'department_name', case when v.id = any(hidden) then 'Private visit' else d.name end,
        'assignee_name', case when v.id = any(hidden) then null else (select x.name from core.users x where x.id = v.assignee_id) end,
        'status', v.status, 'is_first', v.is_first, 'arrived_at', v.arrived_at, 'seen_at', v.seen_at, 'ended_at', v.ended_at,
        'counts', coalesce((select pg_catalog.jsonb_object_agg(c.type, c.n) from (select e.type, count(*) as n from core.entries e where e.visit_id = v.id
                   and e.reply_to_id is null and e.replaced_by_id is null and e.type <> 'entered_in_error' group by e.type) c), '{}'),
        'first_line', case when v.id = any(hidden) then null else (select e.display_line from core.entries e where e.visit_id = v.id and e.type = 'note'
                   and e.replaced_by_id is null order by e.occurred_at limit 1) end) order by v.arrived_at desc)
      from core.visits v join core.departments d on d.id = v.department_id where v.patient_id = any(ids)), '[]'),
    'between', (select count(*) from core.entries e where e.patient_id = any(ids) and e.visit_id is null and e.reply_to_id is null and e.replaced_by_id is null and e.type <> 'entered_in_error'));
end $$;

-- results over time: every coded value the record holds, one row per test, newest first, the live version of each entry only
create or replace function public.read_results_table(patient_id uuid, "limit" int default 12) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare org uuid; u uuid; sv uuid; ids uuid[];
begin
  org := core.org_of_patient(patient_id); if org is null then perform core.refuse('wrong_organization', 'patient'); end if;
  u := core.require_access(org, 'read:record', patient_id, null);
  sv := core.survivor(patient_id); perform core.require_open(u, sv);
  select pg_catalog.array_agg(id) into ids from core.patients where id = sv or merged_into_id = sv;
  return coalesce((select pg_catalog.jsonb_agg(t.row order by t.last_at desc) from (
    select max(v.occurred_at) as last_at, pg_catalog.jsonb_build_object('code', v.code, 'name', coalesce(max(c.name), v.code), 'unit', max(v.unit),
      'points', (select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('at', p.occurred_at, 'value_number', p.value_number, 'value_text', p.value_text, 'flag', p.flag,
                   'entry_id', p.entry_id, 'corrected', p.corrected) order by p.occurred_at desc)
                 from (select w.*, e2.replaces_id is not null as corrected from core.entry_values w join core.entries e2 on e2.id = w.entry_id
                       where w.patient_id = any(ids) and w.code = v.code and e2.replaced_by_id is null order by w.occurred_at desc limit greatest(1, least("limit", 50))) p)) as row
    from core.entry_values v join core.entries e on e.id = v.entry_id left join core.codes c on c.code = v.code
    where v.patient_id = any(ids) and e.replaced_by_id is null group by v.code) t), '[]');
end $$;

-- the read log: who opened this record (printable for the patient), and every open-anyway in a period
create or replace function public.read_record_reads(patient_id uuid, "limit" int default 500) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare org uuid; u uuid; sv uuid;
begin
  org := core.org_of_patient(patient_id); if org is null then perform core.refuse('wrong_organization', 'patient'); end if;
  u := core.require_access(org, 'read:record_reads', patient_id, null);
  sv := core.survivor(patient_id);
  return coalesce((select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('read_at', rr.read_at, 'user_name', x.name, 'user_kind', x.kind, 'department_name', d.name,
      'basis', rr.basis, 'reason_text', rr.reason_text, 'opened_visit_at', ov.arrived_at, 'opened_visit_department', od.name) order by rr.read_at desc)
    from (select * from core.record_reads r where r.patient_id in (select id from core.patients where id = sv or merged_into_id = sv) order by r.read_at desc limit greatest(1, least("limit", 5000))) rr
    join core.users x on x.id = rr.user_id left join core.departments d on d.id = rr.department_id
    left join core.visits ov on ov.id = rr.opened_visit_id left join core.departments od on od.id = ov.department_id), '[]');
end $$;
create or replace function public.read_opened_anyway(organization_id uuid, since timestamptz default null) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare u uuid;
begin
  u := core.require_access(organization_id, 'read:record_reads', null, null);
  return coalesce((select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('read_at', rr.read_at, 'user_name', x.name, 'department_name', d.name, 'reason_text', rr.reason_text,
      'patient', pg_catalog.jsonb_build_object('id', p.id, 'record_number', p.record_number, 'given_name', p.given_name, 'family_name', p.family_name),
      'visit_at', ov.arrived_at, 'visit_department', od.name) order by rr.read_at desc)
    from core.record_reads rr join core.users x on x.id = rr.user_id join core.patients p on p.id = rr.patient_id
    left join core.departments d on d.id = rr.department_id left join core.visits ov on ov.id = rr.opened_visit_id left join core.departments od on od.id = ov.department_id
    where rr.organization_id = read_opened_anyway.organization_id and rr.basis = 'anyway' and rr.read_at > coalesce(since, pg_catalog.now() - interval '7 days')), '[]');
end $$;
grant execute on function public.read_visits(uuid), public.read_results_table(uuid, int), public.read_record_reads(uuid, int), public.read_opened_anyway(uuid, timestamptz) to authenticated;
