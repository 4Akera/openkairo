-- 0019 · the second factor for manage: stays the rule; one server setting turns it off for local development only (the dev seed sets it)
create table if not exists core.server_settings (key text primary key, value text not null);
revoke all on core.server_settings from public, authenticated, anon;
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
  if v_verb = 'manage' and core.auth_aal() <> 'aal2' and session_user = 'authenticator' and coalesce((select value from core.server_settings where key = 'require_mfa'), 'on') <> 'off' then
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
