-- 0036 · delete a mistake (amends spec 02 "retired, never deleted"): a setting that nothing ever used — a typo'd service,
--   a department nobody worked in, a role nobody holds, a person who never signed in, any preset — may be deleted for good.
--   Anything the record points at is refused with in_use and stays to be retired: every link to these tables blocks a
--   delete (none cascades), so the database itself says whether it was used. Each delete is a settings_changes row with the name.

create or replace function public.delete_service(id uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare u uuid; x core.services;
begin
  select * into x from core.services s where s.id = delete_service.id; if x.id is null then perform core.refuse('not_found', 'service'); end if;
  u := core.require_access(x.organization_id, 'manage:services', null, null);
  if exists (select 1 from core.templates t where t.organization_id = x.organization_id and t.retired_at is null
             and t.items @> pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object('service_id', x.id))) then perform core.refuse('in_use', 'preset'); end if;
  begin
    delete from core.service_field_ranges r where r.service_id = x.id;
    delete from core.service_fields f where f.service_id = x.id;
    delete from core.services s where s.id = x.id;
  exception when foreign_key_violation then perform core.refuse('in_use', 'record');
  end;
  perform core.record_settings_change(x.organization_id, u, 'services', x.id, pg_catalog.jsonb_build_object('deleted', true, 'name', x.name, 'code', x.code));
  return pg_catalog.jsonb_build_object('deleted', x.id);
end $$;
grant execute on function public.delete_service(uuid) to authenticated;

create or replace function public.delete_department(id uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare u uuid; x core.departments;
begin
  select * into x from core.departments d where d.id = delete_department.id; if x.id is null then perform core.refuse('not_found', 'department'); end if;
  u := core.require_access(x.organization_id, 'manage:departments', null, null);
  if exists (select 1 from core.services s where s.department_id = x.id) then perform core.refuse('in_use', 'services'); end if;
  if exists (select 1 from core.user_roles ur where ur.department_id = x.id) then perform core.refuse('in_use', 'people'); end if;
  perform 1 from core.organizations o where o.id = x.organization_id for update;
  begin
    delete from core.served_departments sd where sd.department_id = x.id or sd.served_department_id = x.id;   -- its own links go with it
    delete from core.departments d where d.id = x.id;
  exception when foreign_key_violation then perform core.refuse('in_use', 'record');
  end;
  perform core.record_settings_change(x.organization_id, u, 'departments', x.id, pg_catalog.jsonb_build_object('deleted', true, 'name', x.name));
  return pg_catalog.jsonb_build_object('deleted', x.id);
end $$;
grant execute on function public.delete_department(uuid) to authenticated;

create or replace function public.delete_role(id uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare u uuid; x core.roles;
begin
  select * into x from core.roles r where r.id = delete_role.id; if x.id is null then perform core.refuse('not_found', 'role'); end if;
  if x.organization_id is null then perform core.refuse('builtin_role'); end if;
  u := core.require_access(x.organization_id, 'manage:roles', null, null);
  if exists (select 1 from core.user_roles ur where ur.role_id = x.id) then perform core.refuse('in_use', 'people'); end if;
  begin
    delete from core.role_actions ra where ra.role_id = x.id;
    delete from core.roles r where r.id = x.id;
  exception when foreign_key_violation then perform core.refuse('in_use', 'record');
  end;
  perform core.record_settings_change(x.organization_id, u, 'roles', x.id, pg_catalog.jsonb_build_object('deleted', true, 'name', x.name));
  return pg_catalog.jsonb_build_object('deleted', x.id);
end $$;
grant execute on function public.delete_role(uuid) to authenticated;

-- a person who never signed in wrote nothing: their roles go with them. Anyone who signed in is retired, never deleted.
create or replace function public.delete_user(id uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare u uuid; x core.users;
begin
  select * into x from core.users s where s.id = delete_user.id; if x.id is null then perform core.refuse('not_found', 'user'); end if;
  u := core.require_access(x.organization_id, 'manage:users', null, null);
  if x.id = u then perform core.refuse('self_change'); end if;
  if x.login_id is not null then perform core.refuse('in_use', 'signed_in'); end if;
  perform 1 from core.organizations o where o.id = x.organization_id for update;
  begin
    delete from core.user_roles ur where ur.user_id = x.id;
    delete from core.users s where s.id = x.id;
  exception when foreign_key_violation then perform core.refuse('in_use', 'record');
  end;
  perform core.record_settings_change(x.organization_id, u, 'users', x.id, pg_catalog.jsonb_build_object('deleted', true, 'name', x.name));
  return pg_catalog.jsonb_build_object('deleted', x.id);
end $$;
grant execute on function public.delete_user(uuid) to authenticated;

-- a preset is a shortcut: the record never points at one, so it can always go
create or replace function public.delete_template(id uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare u uuid; x core.templates;
begin
  select * into x from core.templates t where t.id = delete_template.id; if x.id is null then perform core.refuse('not_found', 'preset'); end if;
  u := core.require_access(x.organization_id, 'manage:templates', null, null);
  delete from core.templates t where t.id = x.id;
  perform core.record_settings_change(x.organization_id, u, 'templates', x.id, pg_catalog.jsonb_build_object('deleted', true, 'name', x.name));
  return pg_catalog.jsonb_build_object('deleted', x.id);
end $$;
grant execute on function public.delete_template(uuid) to authenticated;
