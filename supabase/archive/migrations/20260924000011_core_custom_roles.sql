-- 0033 · a clinic's own roles (spec 02): a role is a named set of actions; built-in roles stay read-only (copy to edit).
--   Nobody grants a manage: action they do not hold everywhere, edits a role they hold themselves, or leaves the
--   organization without an administrator. Keys are made once from the name and never reused.

-- the actions a role can carry here: core's, and those of the packs this organization has on
create or replace function public.read_actions(organization_id uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  perform core.require_access(read_actions.organization_id, 'read:organization', null, null);
  return coalesce((select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('key', a.key, 'pack', a.pack) order by a.pack nulls first, a.key)
    from core.actions a
    where a.pack is null or exists (select 1 from core.organization_packs op where op.organization_id = read_actions.organization_id and op.pack = a.pack and op.retired_at is null)), '[]');
end $$;
grant execute on function public.read_actions(uuid) to authenticated;

create or replace function public.save_role(id uuid, organization_id uuid, name text, actions text[] default '{}', seen_change_id uuid default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare u uuid; x core.roles; k text; n int := 0; bad text; acts text[] := coalesce(actions, '{}');
begin
  u := core.require_access(save_role.organization_id, 'manage:roles', null, null);
  select * into x from core.roles r where r.id = save_role.id;
  if x.id is not null and x.organization_id is null then perform core.refuse('builtin_role'); end if;              -- copy it to edit
  if x.id is not null and x.organization_id <> save_role.organization_id then perform core.refuse('not_found', 'role'); end if;
  if x.id is not null and x.retired_at is not null then perform core.refuse('retired', 'role'); end if;
  if exists (select 1 from core.user_roles ur where ur.user_id = u and ur.role_id = save_role.id) then perform core.refuse('self_change'); end if;
  if nullif(pg_catalog.btrim(save_role.name), '') is null then perform core.refuse('name_missing'); end if;
  perform core.require_fresh('roles', save_role.id, seen_change_id);
  select a into bad from pg_catalog.unnest(acts) a where not exists (select 1 from core.actions ca where ca.key = a) limit 1;
  if bad is not null then perform core.refuse('unknown_action', bad); end if;
  select a into bad from pg_catalog.unnest(acts) a join core.actions ca on ca.key = a
    where ca.pack is not null and not exists (select 1 from core.organization_packs op where op.organization_id = save_role.organization_id and op.pack = ca.pack and op.retired_at is null) limit 1;
  if bad is not null then perform core.refuse('pack_off', bad); end if;
  -- nobody grants what they do not hold: a manage: action only from someone holding it everywhere
  select a into bad from pg_catalog.unnest(acts) a where a like 'manage:%' and not exists (
    select 1 from core.user_roles ur join core.role_actions ra on ra.role_id = ur.role_id and ra.action = a where ur.user_id = u and ur.department_id is null) limit 1;
  if bad is not null then perform core.refuse('cannot_grant', bad); end if;
  perform 1 from core.organizations o where o.id = save_role.organization_id for update;                           -- the organization lock
  if x.id is null then
    k := pg_catalog.left(pg_catalog.btrim(pg_catalog.regexp_replace(pg_catalog.lower(save_role.name), '[^a-z0-9]+', '_', 'g'), '_'), 40);
    if k = '' then k := 'role'; end if;
    while exists (select 1 from core.roles r where r.organization_id = save_role.organization_id and r.key = k || case when n = 0 then '' else '_' || n end) loop n := n + 1; end loop;
    k := k || case when n = 0 then '' else '_' || n end;                                                          -- a retired role's key is not reused
    insert into core.roles (id, organization_id, key, name) values (save_role.id, save_role.organization_id, k, pg_catalog.btrim(save_role.name)) returning * into x;
  else
    update core.roles r set name = pg_catalog.btrim(save_role.name) where r.id = save_role.id returning * into x;
  end if;
  delete from core.role_actions ra where ra.role_id = x.id;
  insert into core.role_actions (role_id, action) select distinct x.id, a from pg_catalog.unnest(acts) a;
  perform core.require_last_administrator(save_role.organization_id);
  perform core.record_settings_change(save_role.organization_id, u, 'roles', x.id, pg_catalog.jsonb_build_object('name', x.name, 'actions', acts));
  return pg_catalog.to_jsonb(x) || pg_catalog.jsonb_build_object('actions', acts);
end $$;
grant execute on function public.save_role(uuid, uuid, text, text[], uuid) to authenticated;

create or replace function public.retire_role(id uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare u uuid; x core.roles; n int;
begin
  select * into x from core.roles r where r.id = retire_role.id;
  if x.id is null then perform core.refuse('not_found', 'role'); end if;
  if x.organization_id is null then perform core.refuse('builtin_role'); end if;
  u := core.require_access(x.organization_id, 'manage:roles', null, null);
  if x.retired_at is not null then return pg_catalog.to_jsonb(x) || '{"unassigned": 0}'::jsonb; end if;
  if exists (select 1 from core.user_roles ur where ur.user_id = u and ur.role_id = x.id) then perform core.refuse('self_change'); end if;
  perform 1 from core.organizations o where o.id = x.organization_id for update;
  update core.roles r set retired_at = pg_catalog.now() where r.id = x.id returning * into x;
  delete from core.user_roles ur where ur.role_id = x.id;                                                           -- whoever held it no longer does
  get diagnostics n = row_count;
  perform core.require_last_administrator(x.organization_id);
  perform core.record_settings_change(x.organization_id, u, 'roles', x.id, pg_catalog.jsonb_build_object('retired_at', x.retired_at, 'unassigned', n));
  return pg_catalog.to_jsonb(x) || pg_catalog.jsonb_build_object('unassigned', n);
end $$;
grant execute on function public.retire_role(uuid) to authenticated;
