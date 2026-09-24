-- 0026 · the clinic's time zone: "today" (done today, released today, ages, a medication's start) is the clinic's day, not UTC's
alter table core.organizations add column if not exists time_zone text not null default 'UTC';
create or replace function core.check_time_zone() returns trigger language plpgsql set search_path = '' as $$
begin
  if not exists (select 1 from pg_catalog.pg_timezone_names where name = new.time_zone) then perform core.refuse('bad_time_zone', new.time_zone); end if;
  return new;
end $$;
drop trigger if exists organizations_time_zone on core.organizations;
create trigger organizations_time_zone before insert or update of time_zone on core.organizations for each row execute function core.check_time_zone();

-- the clinic's date today, and the moment its day began
create or replace function core.today(p_org uuid) returns date
language sql stable security definer set search_path = '' as $$
  select (pg_catalog.now() at time zone coalesce((select o.time_zone from core.organizations o where o.id = p_org), 'UTC'))::date
$$;
create or replace function core.day_start(p_org uuid) returns timestamptz
language sql stable security definer set search_path = '' as $$
  select pg_catalog.date_trunc('day', pg_catalog.now() at time zone z) at time zone z
  from (select coalesce((select o.time_zone from core.organizations o where o.id = p_org), 'UTC') as z) t
$$;
create or replace function core.local_date(p_org uuid, p_at timestamptz) returns date
language sql stable security definer set search_path = '' as $$
  select (p_at at time zone coalesce((select o.time_zone from core.organizations o where o.id = p_org), 'UTC'))::date
$$;

-- the owner sets the clinic's name and time zone
create or replace function public.save_organization(organization_id uuid, name text default null, time_zone text default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare u uuid; o core.organizations;
begin
  u := core.require_access(save_organization.organization_id, 'manage:organization', null, null);
  update core.organizations x set name = coalesce(nullif(pg_catalog.btrim(save_organization.name), ''), x.name), time_zone = coalesce(save_organization.time_zone, x.time_zone)
    where x.id = save_organization.organization_id returning * into o;
  perform core.record_settings_change(o.id, u, 'organizations', o.id, pg_catalog.jsonb_build_object('name', o.name, 'time_zone', o.time_zone));
  return pg_catalog.to_jsonb(o);
end $$;
grant execute on function public.save_organization(uuid, text, text) to authenticated;

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
             'assignee_name', (select name from core.users where id = v.assignee_id), 'arrived_at', v.arrived_at, 'present_at', v.present_at, 'seen_at', v.seen_at,
             'request_id', v.request_id, 'request_open', exists (select 1 from core.requests r where r.entry_id = v.request_id and r.status = 'open'),
             'requests', coalesce((select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('request_id', r.entry_id, 'service_name', e.data->'service'->>'name', 'to_department_name', e.data->>'to_department_name', 'step', r.step, 'is_holding', r.status = 'open'))
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

create or replace function public.read_queue(department_id uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare org uuid; u uuid;
begin
  select organization_id into org from core.departments where id = department_id; if org is null then perform core.refuse('not_found', 'department'); end if;
  u := core.require_access(org, 'read:queue', null, department_id);
  return pg_catalog.jsonb_build_object(
    'requests', coalesce((select pg_catalog.jsonb_agg(core.entry_card(e, core.hidden_for(u, e.patient_id)) || case when core.visit_hidden(u, e.visit_id) then '{"department_name": "Private visit"}'::jsonb else '{}'::jsonb end || pg_catalog.jsonb_build_object(
          'patient', pg_catalog.jsonb_build_object('id', p.id, 'record_number', p.record_number, 'given_name', p.given_name, 'family_name', p.family_name, 'sex', p.sex, 'born_on', p.born_on),
          'from_department_name', case when core.visit_hidden(u, e.visit_id) then 'Private visit' else e.data->>'department_name' end, 'requester_name', e.data->>'author_name', 'question_text', e.data->>'question_text',
          'section_name', s.section_name, 'service_name', s.name, 'reply_type', s.reply_type, 'assignee_id', r.assignee_id,
          'details', case when e.type = 'prescription' then pg_catalog.jsonb_strip_nulls(pg_catalog.jsonb_build_object('drug', e.data->'drug', 'dose_number', e.data->'dose_number',
             'dose_unit', e.data->'dose_unit', 'route', e.data->'route', 'frequency', e.data->'frequency', 'prn', e.data->'prn', 'duration_days', e.data->'duration_days',
             'quantity', e.data->'quantity', 'repeats', e.data->'repeats', 'instructions_text', e.data->'instructions_text')) end)
        order by r.priority, r.due_at)
      from core.requests r join core.entries e on e.id = r.entry_id join core.patients p on p.id = e.patient_id left join core.services s on s.id = e.service_id
      where r.to_department_id = read_queue.department_id and r.status = 'open'), '[]'),
    'recent', coalesce((select pg_catalog.jsonb_agg(core.entry_card(e, core.hidden_for(u, e.patient_id)) || case when core.visit_hidden(u, e.visit_id) then '{"department_name": "Private visit"}'::jsonb else '{}'::jsonb end || pg_catalog.jsonb_build_object(
          'patient', pg_catalog.jsonb_build_object('id', p.id, 'record_number', p.record_number, 'given_name', p.given_name, 'family_name', p.family_name, 'sex', p.sex, 'born_on', p.born_on),
          'from_department_name', case when core.visit_hidden(u, e.visit_id) then 'Private visit' else e.data->>'department_name' end, 'requester_name', e.data->>'author_name', 'section_name', s.section_name, 'service_name', s.name,
          'reply', (select case when core.note_hidden(x, core.hidden_for(u, x.patient_id)) then pg_catalog.jsonb_build_object('id', x.id, 'data', '{}'::jsonb, 'author_name', null, 'recorded_at', x.recorded_at, 'is_final', x.is_final, 'is_hidden', true)
                    else pg_catalog.jsonb_build_object('id', x.id, 'data', core.entry_data(x, core.hidden_for(u, x.patient_id)), 'author_name', x.data->>'author_name', 'recorded_at', x.recorded_at, 'is_final', x.is_final) end
                    from core.entries x where x.reply_to_id = e.id and x.replaced_by_id is null and x.type <> 'entered_in_error' order by x.occurred_at desc limit 1))
        order by r.replied_at desc)
      from (select * from core.requests rq where rq.to_department_id = read_queue.department_id and rq.status in ('done','cancelled')
              and rq.replied_at > pg_catalog.now() - interval '24 hours' order by rq.replied_at desc limit 300) r
      join core.entries e on e.id = r.entry_id join core.patients p on p.id = e.patient_id left join core.services s on s.id = e.service_id), '[]'),
    'done_today', (select count(*) from core.requests r where r.to_department_id = read_queue.department_id and r.status = 'done'
                   and exists (select 1 from core.request_steps st where st.request_id = r.entry_id and st.step = 'done' and st.recorded_at > core.day_start(org))));
end $$;

create or replace function core.patient_hit(p core.patients, u uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select pg_catalog.jsonb_build_object('id', p.id, 'record_number', p.record_number, 'given_name', p.given_name, 'middle_name', p.middle_name, 'family_name', p.family_name,
    'sex', p.sex, 'born_on', p.born_on, 'age', core.age_on(p.born_on, core.today(p.organization_id)), 'died_on', p.died_on, 'phone_text', p.phone_text, 'merged_into_id', p.merged_into_id,
    'identifiers', coalesce((select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('system', i.system, 'value', i.value)) from core.patient_identifiers i where i.patient_id = p.id), '[]'),
    'latest_change_id', (select c.id from core.patient_changes c where c.patient_id = p.id order by c.recorded_at desc limit 1),
    'open_visits', coalesce((select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('id', v.id,
        'department_id', case when v.is_private and not core.sees_department(u, p.organization_id, v.department_id) and core.visit_hidden(u, v.id) then null else v.department_id end,
        'department_name', case when v.is_private and not core.sees_department(u, p.organization_id, v.department_id) and core.visit_hidden(u, v.id) then 'Private visit' else d.name end, 'is_private', v.is_private, 'status', v.status,
        'present', v.present_at is not null, 'arrived_at', v.arrived_at,
        'assignee_id', case when v.is_private and not core.sees_department(u, p.organization_id, v.department_id) and core.visit_hidden(u, v.id) then null else v.assignee_id end) order by v.arrived_at desc)
      from core.visits v join core.departments d on d.id = v.department_id where v.patient_id = p.id and v.ended_at is null), '[]'),
    'open_consults', coalesce((select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('request_id', r.entry_id, 'to_department_id', r.to_department_id, 'question_text', e.data->>'question_text'))
      from core.requests r join core.entries e on e.id = r.entry_id join core.services s on s.id = e.service_id join core.department_types t on t.key = (select type from core.departments where id = r.to_department_id)
      where r.patient_id = p.id and r.status = 'open' and s.reply_type = 'note' and t.is_visited), '[]'))
$$;

create or replace function public.read_record(patient_id uuid, department_id uuid, open_visit_id uuid default null, reason text default null) returns jsonb
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
       'sex', p.sex, 'born_on', p.born_on, 'age', core.age_on(p.born_on, core.today(org)), 'died_on', p.died_on, 'merged_into_id', p.merged_into_id, 'phone_text', p.phone_text),
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

create or replace function public.read_entry(entry_id uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare e core.entries; u uuid; hidden uuid[];
begin
  select * into e from core.entries where id = entry_id; if not found then perform core.refuse('not_found'); end if;
  u := core.require_access(e.organization_id, 'read:record', e.patient_id, null);
  perform core.require_open(u, core.survivor(e.patient_id));
  hidden := core.hidden_visits(u, (select pg_catalog.array_agg(id) from core.patients where id = core.survivor(e.patient_id) or merged_into_id = core.survivor(e.patient_id)));
  if core.note_hidden(e, hidden) then
    return core.entry_card(e, hidden) || pg_catalog.jsonb_build_object('data', '{}'::jsonb, 'patient_id', e.patient_id, 'replies', '[]'::jsonb, 'files', '[]'::jsonb, 'steps', '[]'::jsonb, 'versions', '[]'::jsonb);
  end if;
  return core.entry_card(e, hidden) || pg_catalog.jsonb_build_object('data', core.entry_data(e, hidden), 'patient_id', e.patient_id,
    'patient', (select pg_catalog.jsonb_build_object('id', p.id, 'record_number', p.record_number, 'given_name', p.given_name, 'family_name', p.family_name, 'sex', p.sex, 'age', core.age_on(p.born_on, core.today(e.organization_id)))
                from core.patients p where p.id = e.patient_id),
    'replies', coalesce((select pg_catalog.jsonb_agg(core.entry_card(x, hidden) || pg_catalog.jsonb_build_object('data', core.entry_data(x, hidden)) order by x.occurred_at) from core.entries x where x.reply_to_id = e.id and x.replaced_by_id is null and x.type <> 'entered_in_error'), '[]'),
    'files', coalesce((select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('position', f.position, 'name', f.name, 'mime', f.mime) order by f.position) from core.entry_files f where f.entry_id = e.id), '[]'),
    'steps', coalesce((select pg_catalog.jsonb_agg(pg_catalog.to_jsonb(s) - 'actor_id' - 'changes' order by s.position) from core.request_steps s where s.request_id = e.id), '[]'),
    'versions', coalesce((select pg_catalog.jsonb_agg(core.entry_card(x, hidden) || pg_catalog.jsonb_build_object('data', core.entry_data(x, hidden)) order by x.recorded_at) from core.chain_of(e.id) x where x.id <> e.id), '[]'));
end $$;

create or replace function core.fill_values(p_service uuid, p_patient uuid, vals jsonb) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare v jsonb; f core.service_fields; rg core.service_field_ranges; p core.patients; a int; out jsonb := '[]'; i int := 0;
begin
  if p_service is null then return coalesce(vals, '[]'); end if;
  select * into p from core.patients where id = p_patient;
  a := core.age_on(p.born_on, core.today(p.organization_id));
  for v in select x from pg_catalog.jsonb_array_elements(coalesce(vals, '[]')) x loop
    i := i + 1;
    select * into f from core.service_fields sf where sf.service_id = p_service and sf.retired_at is null
      and (sf.code = v->>'code' or (v->>'code' is null and sf.position = i)) limit 1;
    if found then
      select * into rg from core.service_field_ranges r where r.service_id = p_service and r.position = f.position
        and (r.sex is null or r.sex = p.sex) and (r.age_low is null or a >= r.age_low) and (r.age_high is null or a < r.age_high)
        order by (r.sex is not null) desc, (r.age_low is not null or r.age_high is not null) desc limit 1;
      v := pg_catalog.jsonb_strip_nulls(pg_catalog.jsonb_build_object(
             'code', f.code, 'name', f.name, 'unit', f.unit,
             'reference_low', coalesce(rg.reference_low, f.reference_low), 'reference_high', coalesce(rg.reference_high, f.reference_high),
             'critical_low', coalesce(rg.critical_low, f.critical_low), 'critical_high', coalesce(rg.critical_high, f.critical_high))) || v;
    end if;
    if not (v ? 'flag') then v := v || pg_catalog.jsonb_strip_nulls(pg_catalog.jsonb_build_object('flag', core.flag_of(v))); end if;
    out := out || v;
  end loop;
  return out;
end $$;

create or replace function core.update_medications(e core.entries) returns void
language plpgsql security definer set search_path = '' as $$
declare d jsonb := e.data; act text := d->>'action'; row_id uuid; target uuid := (d->>'medication_id')::uuid;
begin
  if act = 'start' then
    row_id := core.root_of(e.id);
    insert into core.patient_medications (id, organization_id, patient_id, drug_code, drug_name, form, strength, dose_number, dose_unit, route, frequency,
      prn, prn_reason_text, instructions_text, problem_id, started_on, status, latest_entry_id, prescriber_id)
    values (row_id, e.organization_id, e.patient_id, d->'drug'->>'code', d->'drug'->>'name', d->'drug'->>'form', d->'drug'->>'strength',
      (d->>'dose_number')::numeric, d->>'dose_unit', d->>'route', d->>'frequency',
      coalesce((d->>'prn')::boolean, false), d->>'prn_reason_text', d->>'instructions_text', (d->'problems'->0->>'id')::uuid,
      coalesce(core.local_date(e.organization_id, e.occurred_at), core.today(e.organization_id)), 'active', e.id, coalesce(e.responsible_id, e.author_id))
    on conflict (id) do update set latest_entry_id = excluded.latest_entry_id, dose_number = excluded.dose_number, dose_unit = excluded.dose_unit,
      route = excluded.route, frequency = excluded.frequency, prn = excluded.prn, prn_reason_text = excluded.prn_reason_text, instructions_text = excluded.instructions_text;
  elsif act = 'repeat' then
    update core.patient_medications set latest_entry_id = e.id where id = target;
  elsif act = 'change' then
    update core.patient_medications set dose_number = coalesce((d->>'dose_number')::numeric, dose_number), dose_unit = coalesce(d->>'dose_unit', dose_unit),
      route = coalesce(d->>'route', route), frequency = coalesce(d->>'frequency', frequency), prn = coalesce((d->>'prn')::boolean, prn),
      prn_reason_text = coalesce(d->>'prn_reason_text', prn_reason_text), instructions_text = coalesce(d->>'instructions_text', instructions_text),
      latest_entry_id = e.id where id = target;
  elsif act = 'stop' then
    update core.patient_medications set status = 'stopped', stopped_on = (e.occurred_at at time zone 'UTC')::date, stop_reason_text = d->>'stop_reason_text', latest_entry_id = e.id where id = target;
  end if;
end $$;
