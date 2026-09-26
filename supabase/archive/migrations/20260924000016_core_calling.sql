-- 0038 · calling is not seeing (spec 03, amended 2026-09-24): opening a waiting patient calls him (in consult, assigned to the
--   caller) but does not make him seen. He is seen when the consult ends in Done, or goes back to waiting with something
--   written for him. "Not here" puts him back in his place and counts the missed call. So "Back" means he really came back.
--   The queue rows carry what the new lists show: when he was called, missed calls, vitals taken, and which requests are
--   prescriptions (dispensing is not a result); the bench's rows say whether the patient is here now.
alter table core.visits add column if not exists called_at timestamptz, add column if not exists missed_calls int not null default 0;


create or replace function public.mark_visit(visit_id uuid, from_status core.visit_status, status core.visit_status, reason text default null, wait boolean default null) returns core.visits
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
    -- seen at Done, or when he goes back to waiting with something written for him in this visit since he was called
    seen_at = case when seen_at is not null then seen_at
                   when from_status = 'in_consult' and target in ('done','pending') then pg_catalog.clock_timestamp()
                   when from_status = 'in_consult' and target = 'waiting' and exists (select 1 from core.entries e where e.visit_id = v.id and e.recorded_at >= coalesce(v.called_at, v.arrived_at))
                     then pg_catalog.clock_timestamp() end,
    called_at = case when target = 'in_consult' then pg_catalog.clock_timestamp() else called_at end,
    missed_calls = missed_calls + case when from_status = 'in_consult' and target = 'waiting' and reason = 'not_here' then 1 else 0 end,
    assignee_id = case when target = 'in_consult' then u else assignee_id end,
    ended_at = case when target in ('done','left','cancelled') then pg_catalog.clock_timestamp() else ended_at end,
    present_at = case when target in ('done','left','cancelled') then null else present_at end
    where id = visit_id returning * into v;
  perform core.change_visit(v, target, u, reason, case when target = 'in_consult' then pg_catalog.jsonb_build_object('assignee_id', u) when target = 'done' and core.holds(v.id) > 0 then '{"wait": false}'::jsonb end);
  if from_status = 'in_consult' and target in ('done','pending') then perform core.clear_seen(v.id, u); end if;
  if target in ('done','left','cancelled') and from_status <> 'in_consult' then perform core.flag_unseen(v.id); end if;
  return v;
end $$;

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
            from core.visits v where v.department_id = read_visit_queue.department_id and v.present_at is not null and v.ended_at is null
              and (not core.visit_hidden(u, v.id) or exists (select 1 from core.user_roles ur join core.roles ro on ro.id = ur.role_id and ro.retired_at is null
                                                           where ur.user_id = u and ur.department_id = v.department_id))) v
      join core.patients p on p.id = v.patient_id) q), '[]'),
    'done_today', (select count(*) from core.visits v where v.department_id = read_visit_queue.department_id and v.status = 'done' and v.ended_at > core.day_start(org) and not core.visit_hidden(u, v.id)),
    'away', (select count(*) from core.visits v where v.department_id = read_visit_queue.department_id and v.ended_at is null and v.present_at is null and not core.visit_hidden(u, v.id)));
end $$;

create or replace function public.read_queue(department_id uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare org uuid; u uuid;
begin
  select organization_id into org from core.departments where id = department_id; if org is null then perform core.refuse('not_found', 'department'); end if;
  u := core.require_access(org, 'read:queue', null, department_id);
  return pg_catalog.jsonb_build_object(
    'requests', coalesce((select pg_catalog.jsonb_agg(core.entry_card(e, core.hidden_for(u, e.patient_id)) || case when core.visit_hidden(u, e.visit_id) then '{"department_name": "Private visit"}'::jsonb else '{}'::jsonb end || pg_catalog.jsonb_build_object(
          'patient', pg_catalog.jsonb_build_object('id', p.id, 'record_number', p.record_number, 'given_name', p.given_name, 'family_name', p.family_name, 'sex', p.sex, 'born_on', p.born_on,
            'here', exists (select 1 from core.visits hv where hv.patient_id = p.id and hv.ended_at is null and hv.present_at is not null)),
          'from_department_name', case when core.visit_hidden(u, e.visit_id) then 'Private visit' else e.data->>'department_name' end, 'requester_name', e.data->>'author_name', 'question_text', e.data->>'question_text',
          'section_name', s.section_name, 'service_name', s.name, 'reply_type', s.reply_type, 'assignee_id', r.assignee_id,
          'details', case when e.type = 'prescription' then pg_catalog.jsonb_strip_nulls(pg_catalog.jsonb_build_object('drug', e.data->'drug', 'dose_number', e.data->'dose_number',
             'dose_unit', e.data->'dose_unit', 'route', e.data->'route', 'frequency', e.data->'frequency', 'prn', e.data->'prn', 'duration_days', e.data->'duration_days',
             'quantity', e.data->'quantity', 'repeats', e.data->'repeats', 'instructions_text', e.data->'instructions_text')) end)
        order by r.priority, r.due_at)
      from core.requests r join core.entries e on e.id = r.entry_id join core.patients p on p.id = e.patient_id left join core.services s on s.id = e.service_id
      where r.to_department_id = read_queue.department_id and r.status = 'open'), '[]'),
    'recent', coalesce((select pg_catalog.jsonb_agg(core.entry_card(e, core.hidden_for(u, e.patient_id)) || case when core.visit_hidden(u, e.visit_id) then '{"department_name": "Private visit"}'::jsonb else '{}'::jsonb end || pg_catalog.jsonb_build_object(
          'patient', pg_catalog.jsonb_build_object('id', p.id, 'record_number', p.record_number, 'given_name', p.given_name, 'family_name', p.family_name, 'sex', p.sex, 'born_on', p.born_on,
            'here', exists (select 1 from core.visits hv where hv.patient_id = p.id and hv.ended_at is null and hv.present_at is not null)),
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
