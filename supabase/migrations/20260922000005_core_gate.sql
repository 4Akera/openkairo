-- 0005 · the gate (spec 02): who is calling, and may they do this here
create or replace function core.current_user_id(p_organization_id uuid) returns uuid
language plpgsql stable security definer set search_path = '' as $$
declare v_acting text; v_id uuid;
begin
  -- a pack acting through the runner: honoured only off the API and only for kind = pack
  v_acting := nullif(current_setting('opencare.acting_user_id', true), '');
  if v_acting is not null and session_user <> 'authenticator' then
    select id into v_id from core.users
      where id = v_acting::uuid and organization_id = p_organization_id and kind = 'pack' and retired_at is null;
    if v_id is not null then return v_id; end if;
  end if;
  select id into v_id from core.users
    where login_id = core.auth_uid() and organization_id = p_organization_id
      and (retired_at is null or retired_at > pg_catalog.now())
    limit 1;
  return v_id;
end $$;

create or replace function core.require_pack(p_organization_id uuid, p_pack text) returns void
language plpgsql stable security definer set search_path = '' as $$
begin
  if not exists (select 1 from core.organization_packs where organization_id = p_organization_id and pack = p_pack and retired_at is null) then
    perform core.refuse('pack_off', p_pack);
  end if;
end $$;

-- returns the caller's users.id; raises on any failure
create or replace function core.require_access(p_organization_id uuid, p_action text, p_patient_id uuid default null, p_department_id uuid default null)
returns uuid language plpgsql stable security definer set search_path = '' as $$
declare v_user uuid; v_pack text; v_ok boolean; v_verb text;
begin
  select pack into v_pack from core.actions where key = p_action;
  if not found then perform core.refuse('unknown_action', p_action); end if;
  if v_pack is not null then perform core.require_pack(p_organization_id, v_pack); end if;

  v_user := core.current_user_id(p_organization_id);
  if v_user is null then perform core.refuse('not_a_member'); end if;

  v_verb := split_part(p_action, ':', 1);
  if v_verb = 'manage' and core.auth_aal() <> 'aal2' and session_user = 'authenticator' then
    perform core.refuse('mfa_required', p_action);
  end if;

  if p_patient_id is not null and not exists (select 1 from core.patients where id = p_patient_id and organization_id = p_organization_id) then
    perform core.refuse('wrong_organization', 'patient');
  end if;
  if p_department_id is not null and not exists (select 1 from core.departments where id = p_department_id and organization_id = p_organization_id) then
    perform core.refuse('wrong_organization', 'department');
  end if;

  -- held everywhere or in this department
  select exists (
    select 1 from core.user_roles ur
    join core.role_actions ra on ra.role_id = ur.role_id
    join core.roles r on r.id = ur.role_id and r.retired_at is null
    where ur.user_id = v_user and ur.organization_id = p_organization_id and ra.action = p_action
      and (ur.department_id is null or p_department_id is null or ur.department_id = p_department_id)
  ) into v_ok;

  -- widening: read:queue and write:visit pass on a department the caller's department serves;
  -- read:queue passes on an outside department for anyone holding it in the organization
  if not v_ok and p_department_id is not null and p_action in ('read:queue','write:visit') then
    select exists (
      select 1 from core.user_roles ur
      join core.role_actions ra on ra.role_id = ur.role_id and ra.action = p_action
      join core.served_departments sd on sd.department_id = ur.department_id
      where ur.user_id = v_user and ur.organization_id = p_organization_id
        and (sd.served_department_id = p_department_id or sd.served_department_id is null)
    ) into v_ok;
  end if;
  if not v_ok and p_action = 'read:queue' and p_department_id is not null then
    select exists (
      select 1 from core.departments d
      join core.user_roles ur on ur.user_id = v_user and ur.organization_id = p_organization_id
      join core.role_actions ra on ra.role_id = ur.role_id and ra.action = 'read:queue'
      where d.id = p_department_id and d.is_outside
    ) into v_ok;
  end if;

  if not v_ok then perform core.refuse('not_allowed', p_action); end if;
  return v_user;
end $$;

grant execute on function core.current_user_id(uuid), core.require_pack(uuid, text), core.require_access(uuid, text, uuid, uuid) to authenticated, pack_runner;
