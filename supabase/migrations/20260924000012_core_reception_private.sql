-- 0034 · reception's lists keep private visits private (spec 07): a department's queue leaves out the visits this reader may not see,
--   and reception reads them in one list of their own, as "Private visit", never under their department's name
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
            from core.visits v where v.department_id = read_visit_queue.department_id and v.present_at is not null and v.ended_at is null
              and not core.visit_hidden(u, v.id)) v
      join core.patients p on p.id = v.patient_id) q), '[]'),
    'done_today', (select count(*) from core.visits v where v.department_id = read_visit_queue.department_id and v.status = 'done' and v.ended_at > core.day_start(org) and not core.visit_hidden(u, v.id)),
    'away', (select count(*) from core.visits v where v.department_id = read_visit_queue.department_id and v.ended_at is null and v.present_at is null and not core.visit_hidden(u, v.id)));
end $$;

-- the private visits a reception desk serves that its staff may not see in full: who, since when, where in the day — never the department
create or replace function public.read_private_visits(department_id uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare org uuid; u uuid;
begin
  org := core.org_of_department(read_private_visits.department_id); if org is null then perform core.refuse('not_found', 'department'); end if;
  u := core.require_access(org, 'read:queue', null, read_private_visits.department_id);
  return coalesce((select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('id', v.id,
      'patient', pg_catalog.jsonb_build_object('id', p.id, 'record_number', p.record_number, 'given_name', p.given_name, 'family_name', p.family_name, 'sex', p.sex, 'age', core.age_on(p.born_on, current_date)),
      'status', v.status, 'priority', v.priority, 'arrived_at', v.arrived_at, 'present_at', v.present_at) order by v.arrived_at)
    from core.visits v join core.patients p on p.id = v.patient_id
    where v.organization_id = org and v.ended_at is null and v.is_private and core.visit_hidden(u, v.id)
      and exists (select 1 from core.served_departments sd where sd.department_id = read_private_visits.department_id
                  and (sd.served_department_id is null or sd.served_department_id = v.department_id))), '[]');
end $$;
grant execute on function public.read_private_visits(uuid) to authenticated;
