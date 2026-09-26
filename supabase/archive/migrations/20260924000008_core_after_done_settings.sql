-- 0030 · the department list Settings reads carries After Done: the editor opened on 'Next patient' whatever the rule, so saving any change put it back
create or replace function public.read_organization(organization_id uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare u uuid;
begin
  u := core.require_access(organization_id, 'read:organization', null, null);
  return pg_catalog.jsonb_build_object(
    'organization', (select pg_catalog.to_jsonb(o) from core.organizations o where o.id = organization_id),
    'me', (select pg_catalog.jsonb_build_object('id', x.id, 'name', x.name, 'kind', x.kind,
             'departments', coalesce((select pg_catalog.jsonb_agg(distinct pg_catalog.jsonb_build_object('id', d.id, 'name', d.name, 'type', d.type, 'is_visited', t.is_visited, 'site_name', d.site_name, 'patients_wait', d.patients_wait, 'review_results', d.review_results, 'private_visits', d.private_visits, 'after_done', d.after_done))
               from core.user_roles ur join core.departments d on (d.id = ur.department_id or (ur.department_id is null and d.organization_id = ur.organization_id and not d.is_outside))
               join core.department_types t on t.key = d.type where ur.user_id = x.id and d.retired_at is null), '[]'),
             'actions', coalesce((select pg_catalog.jsonb_agg(distinct ra.action) from core.user_roles ur join core.role_actions ra on ra.role_id = ur.role_id where ur.user_id = x.id), '[]'))
           from core.users x where x.id = u),
    'departments', coalesce((select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('id', d.id, 'name', d.name, 'type', d.type, 'is_visited', t.is_visited, 'is_outside', d.is_outside, 'site_name', d.site_name, 'patients_wait', d.patients_wait, 'review_results', d.review_results, 'private_visits', d.private_visits, 'after_done', d.after_done,
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
