-- 0025 · the record's view is a department rule (visits · entries; default visits), and visits come newest-activity first
alter table core.departments add column if not exists record_view text not null default 'visits' check (record_view in ('visits','entries'));

drop function if exists public.save_department(uuid, uuid, text, text, text, boolean, text, uuid[], uuid, boolean, text, boolean);
create function public.save_department(id uuid, organization_id uuid, type text, name text, site_name text default null, is_outside boolean default false,
  contact_text text default null, serves uuid[] default null, seen_change_id uuid default null,
  patients_wait boolean default null, review_results text default null, private_visits boolean default null, record_view text default null)
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
  if record_view is not null and record_view not in ('visits','entries') then perform core.refuse('bad_setting', record_view); end if;
  insert into core.departments (id, organization_id, type, name, site_name, is_outside, contact_text, patients_wait, review_results, private_visits, record_view)
  values (id, organization_id, type, trim(name), nullif(trim(coalesce(site_name,'')),''), is_outside, contact_text,
    coalesce(patients_wait, true), coalesce(review_results, 'critical'), coalesce(private_visits, false), coalesce(record_view, 'visits'))
  on conflict on constraint departments_pkey do update set name = excluded.name, site_name = excluded.site_name, is_outside = excluded.is_outside, contact_text = excluded.contact_text,
    patients_wait = coalesce(save_department.patients_wait, departments.patients_wait), review_results = coalesce(save_department.review_results, departments.review_results),
    private_visits = coalesce(save_department.private_visits, departments.private_visits), record_view = coalesce(save_department.record_view, departments.record_view)
  returning * into d;
  if serves is not null then
    delete from core.served_departments where department_id = d.id;
    insert into core.served_departments (department_id, served_department_id) select d.id, x from pg_catalog.unnest(serves) x;
  end if;
  perform core.record_settings_change(organization_id, u, 'departments', d.id, pg_catalog.jsonb_build_object('type', type, 'name', d.name, 'site_name', d.site_name, 'serves', pg_catalog.to_jsonb(serves), 'patients_wait', d.patients_wait, 'review_results', d.review_results, 'private_visits', d.private_visits, 'record_view', d.record_view));
  return d;
end $$;
grant execute on function public.save_department(uuid, uuid, text, text, text, boolean, text, uuid[], uuid, boolean, text, boolean, text) to authenticated;

create or replace function public.read_organization(organization_id uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare u uuid;
begin
  u := core.require_access(organization_id, 'read:organization', null, null);
  return pg_catalog.jsonb_build_object(
    'organization', (select pg_catalog.to_jsonb(o) from core.organizations o where o.id = organization_id),
    'me', (select pg_catalog.jsonb_build_object('id', x.id, 'name', x.name, 'kind', x.kind,
             'departments', coalesce((select pg_catalog.jsonb_agg(distinct pg_catalog.jsonb_build_object('id', d.id, 'name', d.name, 'type', d.type, 'is_visited', t.is_visited, 'site_name', d.site_name, 'patients_wait', d.patients_wait, 'review_results', d.review_results, 'private_visits', d.private_visits, 'record_view', d.record_view, 'record_view', d.record_view))
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
        'status', v.status, 'is_first', v.is_first, 'arrived_at', v.arrived_at, 'seen_at', v.seen_at, 'ended_at', v.ended_at, 'last_activity_at', v.last_activity_at,
        'counts', coalesce((select pg_catalog.jsonb_object_agg(c.type, c.n) from (select e.type, count(*) as n from core.entries e where e.visit_id = v.id
                   and e.reply_to_id is null and e.replaced_by_id is null and e.type <> 'entered_in_error' group by e.type) c), '{}'),
        'first_line', case when v.id = any(hidden) then null else (select e.display_line from core.entries e where e.visit_id = v.id and e.type = 'note'
                   and e.replaced_by_id is null order by e.occurred_at limit 1) end) order by v.last_activity_at desc, v.arrived_at desc)
      from (select vv.*, greatest(vv.arrived_at, vv.seen_at, vv.ended_at,
                (select max(e.recorded_at) from core.entries e where e.visit_id = vv.id),
                (select max(s.recorded_at) from core.visit_steps s where s.visit_id = vv.id)) as last_activity_at
            from core.visits vv where vv.patient_id = any(ids)) v join core.departments d on d.id = v.department_id), '[]'),
    'between', (select count(*) from core.entries e where e.patient_id = any(ids) and e.visit_id is null and e.reply_to_id is null and e.replaced_by_id is null and e.type <> 'entered_in_error'));
end $$;
