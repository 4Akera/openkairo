-- 0010 · the public reads (specs 01, 04): read_record, read_entries, read_entry, read_values, read_queue, read_to_review, read_entry_file
create or replace function core.entry_card(e core.entries) returns jsonb
language sql stable security definer set search_path = '' as $$
  select pg_catalog.jsonb_build_object(
    'id', e.id, 'type', e.type, 'occurred_at', e.occurred_at, 'recorded_at', e.recorded_at,
    'author_name', e.data->>'author_name', 'department_name', e.data->>'department_name',
    'display_line', e.display_line, 'flag', e.flag, 'is_final', e.is_final, 'source', e.source,
    'reply_to_id', e.reply_to_id, 'replaces_id', e.replaces_id, 'replaced_by_id', e.replaced_by_id, 'visit_id', e.visit_id, 'service_id', e.service_id)
  || coalesce((select pg_catalog.jsonb_build_object('request', pg_catalog.jsonb_build_object('step', r.step, 'status', r.status, 'status_reason', r.status_reason,
        'to_department_id', r.to_department_id, 'to_department_name', e.data->>'to_department_name', 'priority', r.priority, 'due_at', r.due_at,
        'reply_line', r.reply_line, 'reply_flag', r.reply_flag, 'replied_at', r.replied_at, 'review_needed_at', r.review_needed_at))
      from core.requests r where r.entry_id = e.id), '{}'::jsonb)
$$;

-- humans open the record; machines, packs and importers read without a row
create or replace function core.open_record(p_org uuid, p_user uuid, p_patient uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare k core.user_kind;
begin
  select kind into k from core.users where id = p_user;
  if k in ('staff','patient','proxy') then insert into core.record_reads (organization_id, user_id, patient_id) values (p_org, p_user, p_patient); end if;
end $$;

create or replace function core.require_open(p_user uuid, p_patient uuid) returns void
language plpgsql stable security definer set search_path = '' as $$
declare k core.user_kind;
begin
  select kind into k from core.users where id = p_user;
  if k in ('staff','patient','proxy') and not exists (
      select 1 from core.record_reads where user_id = p_user and patient_id = p_patient and read_at > pg_catalog.now() - interval '12 hours') then
    perform core.refuse('record_not_open');
  end if;
end $$;

create or replace function public.read_record(patient_id uuid, department_id uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare org uuid; u uuid; sv uuid; ids uuid[]; p core.patients; out jsonb;
begin
  org := core.org_of_patient(patient_id);
  if org is null then perform core.refuse('wrong_organization', 'patient'); end if;
  u := core.require_access(org, 'read:record', patient_id, department_id);
  sv := core.survivor(patient_id);
  select pg_catalog.array_agg(id) into ids from core.patients where id = sv or merged_into_id = sv;
  select * into p from core.patients where id = sv;
  perform core.open_record(org, u, sv);
  out := pg_catalog.jsonb_build_object(
    'patient', pg_catalog.jsonb_build_object('id', p.id, 'record_number', p.record_number, 'given_name', p.given_name, 'middle_name', p.middle_name, 'family_name', p.family_name,
       'sex', p.sex, 'born_on', p.born_on, 'age', core.age_on(p.born_on, current_date), 'died_on', p.died_on, 'merged_into_id', p.merged_into_id, 'phone_text', p.phone_text),
    'visit', (select pg_catalog.to_jsonb(v) from core.visits v where v.patient_id = any(ids) and v.department_id = read_record.department_id and v.ended_at is null limit 1),
    'allergies', coalesce((select pg_catalog.jsonb_agg(pg_catalog.to_jsonb(a) order by a.status, a.substance_name) from core.patient_allergies a where a.patient_id = any(ids)), '[]'),
    'allergy_review', (select pg_catalog.to_jsonb(x) from core.patient_list_reviews x where x.patient_id = sv and x.list = 'allergies'),
    'problems', coalesce((select pg_catalog.jsonb_agg(pg_catalog.to_jsonb(q) order by q.onset_on) from core.patient_problems q where q.patient_id = any(ids) and q.status = 'active'), '[]'),
    'problem_review', (select pg_catalog.to_jsonb(x) from core.patient_list_reviews x where x.patient_id = sv and x.list = 'problems'),
    'medications', coalesce((select pg_catalog.jsonb_agg(pg_catalog.to_jsonb(m) order by m.drug_name) from core.patient_medications m where m.patient_id = any(ids) and m.status = 'active'), '[]'),
    'medication_review', (select pg_catalog.to_jsonb(x) from core.patient_list_reviews x where x.patient_id = sv and x.list = 'medications'),
    'open_requests', coalesce((select pg_catalog.jsonb_agg(core.entry_card(e) order by e.occurred_at desc) from core.requests r join core.entries e on e.id = r.entry_id where r.patient_id = any(ids) and r.status = 'open'), '[]'),
    'entries', coalesce((select pg_catalog.jsonb_agg(core.entry_card(e) order by e.occurred_at desc, e.id desc) from (
        select x.* from core.entries x where x.patient_id = any(ids) and x.reply_to_id is null and x.replaced_by_id is null and x.type <> 'entered_in_error'
        order by x.occurred_at desc, x.id desc limit 30) e), '[]'),
    'latest_vitals', (select e.data->'values' from core.entries e where e.patient_id = any(ids) and e.type = 'vitals' and e.replaced_by_id is null order by e.occurred_at desc limit 1)
  );
  return out;
end $$;

create or replace function public.read_entries(patient_id uuid, before_at timestamptz default null, before_id uuid default null, types text[] default null, "limit" int default 50) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare org uuid; u uuid; sv uuid; ids uuid[];
begin
  org := core.org_of_patient(patient_id); if org is null then perform core.refuse('wrong_organization', 'patient'); end if;
  u := core.require_access(org, 'read:record', patient_id, null);
  sv := core.survivor(patient_id); perform core.require_open(u, sv);
  select pg_catalog.array_agg(id) into ids from core.patients where id = sv or merged_into_id = sv;
  return coalesce((select pg_catalog.jsonb_agg(core.entry_card(e)) from (
    select x.* from core.entries x where x.patient_id = any(ids) and x.reply_to_id is null and x.replaced_by_id is null and x.type <> 'entered_in_error'
      and (types is null or x.type = any(types))
      and (before_at is null or (x.occurred_at, x.id) < (before_at, coalesce(before_id, '00000000-0000-0000-0000-000000000000')))
    order by x.occurred_at desc, x.id desc limit greatest(1, least("limit", 200))) e), '[]');
end $$;

create or replace function public.read_entry(entry_id uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare e core.entries; u uuid;
begin
  select * into e from core.entries where id = entry_id; if not found then perform core.refuse('not_found'); end if;
  u := core.require_access(e.organization_id, 'read:record', e.patient_id, null);
  perform core.require_open(u, core.survivor(e.patient_id));
  return core.entry_card(e) || pg_catalog.jsonb_build_object('data', e.data,
    'replies', coalesce((select pg_catalog.jsonb_agg(core.entry_card(x) || pg_catalog.jsonb_build_object('data', x.data) order by x.occurred_at) from core.entries x where x.reply_to_id = e.id and x.replaced_by_id is null and x.type <> 'entered_in_error'), '[]'),
    'files', coalesce((select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('position', f.position, 'name', f.name, 'mime', f.mime) order by f.position) from core.entry_files f where f.entry_id = e.id), '[]'),
    'steps', coalesce((select pg_catalog.jsonb_agg(pg_catalog.to_jsonb(s) order by s.position) from core.request_steps s where s.request_id = e.id), '[]'),
    'versions', coalesce((select pg_catalog.jsonb_agg(core.entry_card(x) order by x.recorded_at) from core.entries x where core.root_of(x.id) = core.root_of(e.id) and x.id <> e.id), '[]'));
end $$;

create or replace function public.read_values(patient_id uuid, codes text[], "limit" int default 12) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare org uuid; u uuid; sv uuid; ids uuid[];
begin
  org := core.org_of_patient(patient_id); if org is null then perform core.refuse('wrong_organization', 'patient'); end if;
  u := core.require_access(org, 'read:record', patient_id, null);
  sv := core.survivor(patient_id); perform core.require_open(u, sv);
  select pg_catalog.array_agg(id) into ids from core.patients where id = sv or merged_into_id = sv;
  return coalesce((select pg_catalog.jsonb_object_agg(c, pts) from (
    select c, (select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('at', v.occurred_at, 'value_number', v.value_number, 'value_text', v.value_text, 'unit', v.unit, 'flag', v.flag, 'entry_id', v.entry_id) order by v.occurred_at desc)
               from (select y.* from core.entry_values y where y.patient_id = any(ids) and (y.code = c or y.code in (select code from core.codes where replaced_by_code = c)) order by y.occurred_at desc limit "limit") v) as pts
    from pg_catalog.unnest(codes) c) t), '{}');
end $$;

-- a department's request queue: open requests addressed to it, and the day's counts
create or replace function public.read_queue(department_id uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare org uuid; u uuid;
begin
  select organization_id into org from core.departments where id = department_id; if org is null then perform core.refuse('not_found', 'department'); end if;
  u := core.require_access(org, 'read:queue', null, department_id);
  return pg_catalog.jsonb_build_object(
    'requests', coalesce((select pg_catalog.jsonb_agg(core.entry_card(e) || pg_catalog.jsonb_build_object(
          'patient', pg_catalog.jsonb_build_object('id', p.id, 'record_number', p.record_number, 'given_name', p.given_name, 'family_name', p.family_name, 'sex', p.sex, 'born_on', p.born_on),
          'from_department_name', e.data->>'department_name', 'requester_name', e.data->>'author_name', 'question_text', e.data->>'question_text',
          'section_name', s.section_name, 'service_name', s.name, 'reply_type', s.reply_type, 'assignee_id', r.assignee_id)
        order by r.priority, r.due_at)
      from core.requests r join core.entries e on e.id = r.entry_id join core.patients p on p.id = e.patient_id left join core.services s on s.id = e.service_id
      where r.to_department_id = read_queue.department_id and r.status = 'open'), '[]'),
    'done_today', (select count(*) from core.requests r where r.to_department_id = read_queue.department_id and r.status = 'done'
                   and exists (select 1 from core.request_steps st where st.request_id = r.entry_id and st.step = 'done' and st.recorded_at > date_trunc('day', pg_catalog.now()))));
end $$;

-- results to review: mine, or the department's
create or replace function public.read_to_review(department_id uuid default null) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare u uuid; org uuid;
begin
  if department_id is not null then
    select organization_id into org from core.departments where id = department_id;
    u := core.require_access(org, 'read:queue', null, department_id);
  else
    -- mine: any organization I belong to; find it from the login
    select organization_id, id into org, u from core.users where login_id = core.auth_uid() and retired_at is null limit 1;
    if u is null then perform core.refuse('not_a_member'); end if;
    perform core.require_access(org, 'mark:reviewed', null, null);
  end if;
  return coalesce((select pg_catalog.jsonb_agg(core.entry_card(e) || pg_catalog.jsonb_build_object(
        'patient', pg_catalog.jsonb_build_object('id', p.id, 'record_number', p.record_number, 'given_name', p.given_name, 'family_name', p.family_name),
        'service_name', e.data->'service'->>'name') order by (r.reply_flag = 'critical') desc, r.review_needed_at)
    from core.requests r join core.entries e on e.id = r.entry_id join core.patients p on p.id = e.patient_id
    where r.review_needed_at is not null and ((read_to_review.department_id is null and r.requester_id = u) or (read_to_review.department_id is not null and r.from_department_id = read_to_review.department_id))), '[]');
end $$;

create or replace function public.read_entry_file(entry_id uuid, file_position smallint) returns text
language plpgsql stable security definer set search_path = '' as $$
declare e core.entries; f core.entry_files; u uuid;
begin
  select * into e from core.entries where id = entry_id; if not found then perform core.refuse('not_found'); end if;
  u := core.require_access(e.organization_id, 'read:record', e.patient_id, null); perform core.require_open(u, core.survivor(e.patient_id));
  select * into f from core.entry_files where entry_files.entry_id = read_entry_file.entry_id and entry_files.position = file_position;
  if not found then perform core.refuse('not_found', 'file'); end if;
  return coalesce(f.url, f.path);   -- the client exchanges a path for a 60 s signed URL through storage
end $$;

do $$ declare f record; begin
  for f in select p.oid::regprocedure as sig from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname like 'read\_%' loop
    execute pg_catalog.format('grant execute on function %s to authenticated', f.sig);
  end loop;
end $$;
