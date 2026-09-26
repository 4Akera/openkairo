-- 0011 · patients and visits: the public functions (spec 03)
create or replace function core.org_of_department(d uuid) returns uuid
language sql stable security definer set search_path = '' as $$ select organization_id from core.departments where id = d $$;

-- ── registration ──
create or replace function public.register_patient(
  id uuid, organization_id uuid, given_name text, family_name text, sex core.sex, born_on text,
  middle_name text default null, died_on text default null, phone_text text default null, contact_text text default null,
  identifiers jsonb default '[]', seen_change_id uuid default null, change_id uuid default null
) returns core.patients language plpgsql security definer set search_path = '' as $$
declare u uuid; p core.patients; old core.patients; n bigint; ch jsonb := '{}'; ident jsonb;
begin
  u := core.require_access(organization_id, 'write:patient', null, null);
  if change_id is not null and exists (select 1 from core.patient_changes where patient_changes.id = change_id) then
    select * into p from core.patients where patients.id = register_patient.id; return p;      -- the retry
  end if;
  select * into old from core.patients where patients.id = register_patient.id for update;
  if found then
    if seen_change_id is not null and exists (select 1 from core.patient_changes c where c.patient_id = old.id and c.recorded_at > (select recorded_at from core.patient_changes where patient_changes.id = seen_change_id)) then
      perform core.refuse('changed_since_read');
    end if;
    if old.given_name is distinct from trim(given_name) then ch := ch || pg_catalog.jsonb_build_object('given_name', pg_catalog.jsonb_build_array(old.given_name, trim(given_name))); end if;
    if old.family_name is distinct from trim(family_name) then ch := ch || pg_catalog.jsonb_build_object('family_name', pg_catalog.jsonb_build_array(old.family_name, trim(family_name))); end if;
    if old.middle_name is distinct from middle_name then ch := ch || pg_catalog.jsonb_build_object('middle_name', pg_catalog.jsonb_build_array(old.middle_name, middle_name)); end if;
    if old.sex is distinct from sex then ch := ch || pg_catalog.jsonb_build_object('sex', pg_catalog.jsonb_build_array(old.sex, sex)); end if;
    if old.born_on is distinct from born_on then ch := ch || pg_catalog.jsonb_build_object('born_on', pg_catalog.jsonb_build_array(old.born_on, born_on)); end if;
    if old.died_on is distinct from died_on then ch := ch || pg_catalog.jsonb_build_object('died_on', pg_catalog.jsonb_build_array(old.died_on, died_on)); end if;
    if old.phone_text is distinct from phone_text then ch := ch || pg_catalog.jsonb_build_object('phone_text', pg_catalog.jsonb_build_array(old.phone_text, phone_text)); end if;
    if old.contact_text is distinct from contact_text then ch := ch || pg_catalog.jsonb_build_object('contact_text', pg_catalog.jsonb_build_array(old.contact_text, contact_text)); end if;
    update core.patients set given_name = trim(given_name), family_name = trim(family_name), middle_name = middle_name, sex = sex, born_on = born_on,
      died_on = died_on, phone_text = phone_text, contact_text = contact_text where patients.id = old.id returning * into p;
  else
    insert into core.record_numbers (organization_id) values (organization_id) on conflict do nothing;
    update core.record_numbers set last_number = last_number + 1 where record_numbers.organization_id = register_patient.organization_id returning last_number into n;
    insert into core.patients (id, organization_id, record_number, given_name, middle_name, family_name, sex, born_on, died_on, phone_text, contact_text)
    values (id, organization_id, n, trim(given_name), middle_name, trim(family_name), sex, born_on, died_on, phone_text, contact_text) returning * into p;
    ch := pg_catalog.jsonb_build_object('registered', true);
  end if;
  delete from core.patient_identifiers where patient_id = p.id;
  for ident in select * from pg_catalog.jsonb_array_elements(coalesce(identifiers, '[]')) loop
    insert into core.patient_identifiers (organization_id, patient_id, system, value) values (organization_id, p.id, ident->>'system', ident->>'value') on conflict do nothing;
  end loop;
  if ch <> '{}' then
    insert into core.patient_changes (id, organization_id, patient_id, user_id, changes) values (coalesce(change_id, pg_catalog.gen_random_uuid()), organization_id, p.id, u, ch);
  end if;
  return p;
end $$;

-- ── search: not a record read ──
create or replace function core.patient_hit(p core.patients, u uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select pg_catalog.jsonb_build_object('id', p.id, 'record_number', p.record_number, 'given_name', p.given_name, 'middle_name', p.middle_name, 'family_name', p.family_name,
    'sex', p.sex, 'born_on', p.born_on, 'age', core.age_on(p.born_on, current_date), 'died_on', p.died_on, 'phone_text', p.phone_text, 'merged_into_id', p.merged_into_id,
    'identifiers', coalesce((select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('system', i.system, 'value', i.value)) from core.patient_identifiers i where i.patient_id = p.id), '[]'),
    'latest_change_id', (select c.id from core.patient_changes c where c.patient_id = p.id order by c.recorded_at desc limit 1),
    'open_visits', coalesce((select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('id', v.id, 'department_id', v.department_id, 'department_name', d.name, 'status', v.status,
        'present', v.present_at is not null, 'arrived_at', v.arrived_at, 'assignee_id', v.assignee_id) order by v.arrived_at desc)
      from core.visits v join core.departments d on d.id = v.department_id where v.patient_id = p.id and v.ended_at is null), '[]'),
    'open_consults', coalesce((select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('request_id', r.entry_id, 'to_department_id', r.to_department_id, 'question_text', e.data->>'question_text'))
      from core.requests r join core.entries e on e.id = r.entry_id join core.services s on s.id = e.service_id join core.department_types t on t.key = (select type from core.departments where id = r.to_department_id)
      where r.patient_id = p.id and r.status = 'open' and s.reply_type = 'note' and t.is_visited), '[]'))
$$;

create or replace function public.read_patients(organization_id uuid, query text, born_on text default null, phone_text text default null) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare u uuid; q text := trim(coalesce(query, '')); digits text := regexp_replace(q, '\D', '', 'g');
begin
  u := core.require_access(organization_id, 'read:patient', null, null);
  return coalesce((select pg_catalog.jsonb_agg(core.patient_hit(pp, u) order by p.rank, p.family_name, p.given_name) from (
    select p.*, case
        when exists (select 1 from core.patient_identifiers i where i.patient_id = p.id and i.value = q) then 0
        when digits <> '' and p.record_number::text = digits then 0
        when digits <> '' and p.phone_digits like '%' || digits then 1
        when core.fold(p.family_name) like core.fold(q) || '%' or core.fold(p.given_name) like core.fold(q) || '%' then 2
        else 3 end as rank
    from core.patients p
    where p.organization_id = read_patients.organization_id and p.merged_into_id is null and (
        (q <> '' and (exists (select 1 from core.patient_identifiers i where i.patient_id = p.id and i.value = q)
          or (digits <> '' and (p.record_number::text = digits or p.phone_digits like '%' || digits))
          or core.fold(p.family_name || ' ' || p.given_name) operator(extensions.%) core.fold(q)
          or core.fold(p.given_name || ' ' || p.family_name) like core.fold(q) || '%'
          or extensions.dmetaphone(p.family_name) = extensions.dmetaphone(split_part(q, ' ', -1))))
        or (q = '' and read_patients.born_on is not null and p.born_on = read_patients.born_on)
        or (q = '' and read_patients.phone_text is not null and p.phone_digits = regexp_replace(read_patients.phone_text, '\D', '', 'g')))
    order by rank limit 20) p join core.patients pp on pp.id = p.id), '[]');
end $$;

create or replace function public.read_patient(patient_id uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare org uuid; u uuid; p core.patients;
begin
  org := core.org_of_patient(patient_id); if org is null then perform core.refuse('not_found'); end if;
  u := core.require_access(org, 'read:patient', patient_id, null);
  select * into p from core.patients where id = coalesce((select merged_into_id from core.patients where id = patient_id), patient_id);
  return core.patient_hit(p, u) || pg_catalog.jsonb_build_object(
    'visits', coalesce((select pg_catalog.jsonb_agg(pg_catalog.to_jsonb(v) order by v.arrived_at desc) from core.visits v where v.patient_id = p.id), '[]'),
    'changes', coalesce((select pg_catalog.jsonb_agg(pg_catalog.to_jsonb(c) order by c.recorded_at desc) from core.patient_changes c where c.patient_id = p.id), '[]'));
end $$;

-- ── visits ──
create or replace function core.change_visit(v core.visits, p_status core.visit_status, p_actor uuid, p_reason text, p_changes jsonb) returns core.visits
language plpgsql security definer set search_path = '' as $$
declare n smallint;
begin
  select coalesce(max(position), 0) + 1 into n from core.visit_steps where visit_id = v.id;
  insert into core.visit_steps (organization_id, visit_id, position, status, actor_id, reason, changes) values (v.organization_id, v.id, n, p_status, p_actor, p_reason, p_changes);
  perform core.signal('queue:' || v.department_id::text, pg_catalog.jsonb_build_object('visit_id', v.id));
  return v;
end $$;

-- the Here button: open a visit, or mark the open one present; the desk never decides which
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
    insert into core.visits (id, organization_id, patient_id, department_id, request_id, assignee_id, status, priority, is_first, present_at)
    values (id, org, patient_id, department_id, request_id, assignee_id, 'waiting', priority, first, pg_catalog.clock_timestamp()) returning * into v;
  exception when unique_violation then
    select * into v from core.visits where visits.patient_id = open_visit.patient_id and visits.department_id = open_visit.department_id and ended_at is null;
    return v;
  end;
  perform core.change_visit(v, 'waiting', u, null, pg_catalog.jsonb_build_object('request_id', request_id, 'assignee_id', assignee_id, 'priority', priority, 'is_first', first));
  return v;
end $$;

create or replace function public.mark_present(visit_id uuid, is_present boolean) returns core.visits
language plpgsql security definer set search_path = '' as $$
declare v core.visits; u uuid;
begin
  select * into v from core.visits where id = visit_id for update; if not found then perform core.refuse('not_found'); end if;
  u := core.require_access(v.organization_id, 'write:visit', v.patient_id, v.department_id);
  if v.ended_at is not null then perform core.refuse('visit_ended'); end if;
  if is_present = (v.present_at is not null) then return v; end if;
  update core.visits set present_at = case when is_present then pg_catalog.clock_timestamp() end where id = visit_id returning * into v;
  perform core.change_visit(v, v.status, u, null, pg_catalog.jsonb_build_object('present_at', v.present_at));
  return v;
end $$;

create or replace function public.mark_visit_routing(visit_id uuid, assignee_id uuid default null, priority core.request_priority default null, is_first boolean default null) returns core.visits
language plpgsql security definer set search_path = '' as $$
declare v core.visits; u uuid; ch jsonb := '{}';
begin
  select * into v from core.visits where id = visit_id for update; if not found then perform core.refuse('not_found'); end if;
  u := core.require_access(v.organization_id, 'write:visit', v.patient_id, v.department_id);
  if v.ended_at is not null then perform core.refuse('visit_ended'); end if;
  if assignee_id is not null and assignee_id is distinct from v.assignee_id then ch := ch || pg_catalog.jsonb_build_object('assignee_id', assignee_id); end if;
  if priority is not null and priority <> v.priority then ch := ch || pg_catalog.jsonb_build_object('priority', priority); end if;
  if is_first is not null and is_first <> v.is_first then ch := ch || pg_catalog.jsonb_build_object('is_first', is_first); end if;
  if ch = '{}' then return v; end if;
  update core.visits set assignee_id = coalesce(mark_visit_routing.assignee_id, visits.assignee_id), priority = coalesce(mark_visit_routing.priority, visits.priority),
    is_first = coalesce(mark_visit_routing.is_first, visits.is_first) where id = visit_id returning * into v;
  perform core.change_visit(v, v.status, u, null, ch);
  return v;
end $$;

create or replace function public.mark_visit(visit_id uuid, from_status core.visit_status, status core.visit_status, reason text default null) returns core.visits
language plpgsql security definer set search_path = '' as $$
declare v core.visits; u uuid; act text; legal boolean; target core.visit_status := status;
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
  if from_status = 'in_consult' and status = 'done' and core.holds(v.id) > 0 then target := 'pending'; end if;
  update core.visits set status = target,
    seen_at = case when target = 'in_consult' and seen_at is null then pg_catalog.clock_timestamp() else seen_at end,
    assignee_id = case when target = 'in_consult' then u else assignee_id end,
    ended_at = case when target in ('done','left','cancelled') then pg_catalog.clock_timestamp() else ended_at end,
    present_at = case when target in ('done','left','cancelled') then null else present_at end
    where id = visit_id returning * into v;
  perform core.change_visit(v, target, u, reason, case when target = 'in_consult' then pg_catalog.jsonb_build_object('assignee_id', u) end);
  return v;
end $$;

-- ── the queue ──
create or replace function public.read_visit_queue(department_id uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare org uuid; u uuid;
begin
  org := core.org_of_department(department_id); if org is null then perform core.refuse('not_found', 'department'); end if;
  u := core.require_access(org, 'read:queue', null, department_id);
  return pg_catalog.jsonb_build_object(
    'rows', coalesce((select pg_catalog.jsonb_agg(row order by band_rank, priority, sort_at) from (
      select pg_catalog.jsonb_build_object('id', v.id, 'patient', pg_catalog.jsonb_build_object('id', p.id, 'record_number', p.record_number, 'given_name', p.given_name, 'family_name', p.family_name,
               'sex', p.sex, 'age', core.age_on(p.born_on, current_date), 'has_allergies', exists (select 1 from core.patient_allergies a where a.patient_id = p.id and a.status = 'active')),
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
    'done_today', (select count(*) from core.visits v where v.department_id = read_visit_queue.department_id and v.status = 'done' and v.ended_at > date_trunc('day', pg_catalog.now())),
    'away', (select count(*) from core.visits v where v.department_id = read_visit_queue.department_id and v.ended_at is null and v.present_at is null));
end $$;

create or replace function public.read_sent_outside(organization_id uuid, department_id uuid default null) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare u uuid;
begin
  u := core.require_access(organization_id, 'read:queue', null, department_id);
  return coalesce((select pg_catalog.jsonb_agg(core.entry_card(e) || pg_catalog.jsonb_build_object('patient_id', e.patient_id) order by r.due_at)
    from core.requests r join core.entries e on e.id = r.entry_id join core.departments d on d.id = r.to_department_id
    where r.organization_id = read_sent_outside.organization_id and r.status = 'open' and d.is_outside
      and (read_sent_outside.department_id is null or r.from_department_id = read_sent_outside.department_id)), '[]');
end $$;

-- ── the sweep: hourly, idleness, no timezone, wards skipped ──
create or replace function core.sweep_visits() returns int
language plpgsql security definer set search_path = '' as $$
declare v core.visits; n int := 0; idle interval;
begin
  for v in select vv.* from core.visits vv join core.departments d on d.id = vv.department_id where vv.ended_at is null and d.type <> 'ward' loop
    select pg_catalog.now() - greatest(
      (select max(recorded_at) from core.visit_steps s where s.visit_id = v.id),
      coalesce((select max(st.recorded_at) from core.request_steps st join core.entries e on e.id = st.request_id where e.visit_id = v.id), '-infinity')) into idle;
    if v.status = 'waiting' and v.seen_at is null and idle > interval '12 hours' then
      update core.visits set status = 'left', ended_at = pg_catalog.now(), present_at = null where id = v.id returning * into v;
      perform core.change_visit(v, 'left', null, 'sweep', null); n := n + 1;
    elsif v.seen_at is not null and v.status <> 'pending' and idle > interval '12 hours' then
      update core.visits set status = 'pending', present_at = null where id = v.id returning * into v;
      perform core.change_visit(v, 'pending', null, 'sweep', pg_catalog.jsonb_build_object('present_at', null)); n := n + 1;
    elsif v.status = 'pending' and v.present_at is not null and idle > interval '12 hours' then
      update core.visits set present_at = null where id = v.id returning * into v;
      perform core.change_visit(v, 'pending', null, 'sweep', pg_catalog.jsonb_build_object('present_at', null)); n := n + 1;
    elsif v.status = 'pending' and v.present_at is null and idle > interval '14 days' then
      update core.visits set status = 'lapsed', ended_at = pg_catalog.now() where id = v.id returning * into v;
      perform core.change_visit(v, 'lapsed', null, 'sweep', null); n := n + 1;
    end if;
  end loop;
  return n;
end $$;

do $$ declare f record; begin
  for f in select p.oid::regprocedure as sig from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public'
           and p.proname in ('register_patient','read_patients','read_patient','open_visit','mark_present','mark_visit_routing','mark_visit','read_visit_queue','read_sent_outside') loop
    execute pg_catalog.format('grant execute on function %s to authenticated', f.sig);
  end loop;
end $$;
