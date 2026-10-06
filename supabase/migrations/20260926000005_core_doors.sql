-- 05 · core: the other doors (spec/openCare.md §3.1–§3.6, §3.11–§3.12): choose a user, create an organization, save and remove
-- places, people and roles, register and merge patients, write settings, and the two exceptions (erase, redact). Every change is an
-- AuditEvent (core.audit). Then the privileges: nothing in core is callable from the API except these doors, write and read.

set client_min_messages = warning;

create table core.server_settings (key text primary key, value text not null);
insert into core.server_settings values ('require_mfa', 'on');
-- a settings change, an erase or a redact needs a second factor unless this server turned that off (local development)
create function core.require_mfa() returns void language plpgsql stable security definer set search_path = '' as $$
begin
  if coalesce((select value from core.server_settings where key = 'require_mfa'), 'on') = 'on' and core.aal() <> 'aal2' then
    perform core.refuse('mfa_required');
  end if;
end $$;

create function core.audit(me core.users, p_action text, p_what text, p_thing uuid, p_before jsonb, p_after jsonb) returns void
language sql volatile security definer set search_path = '' as $$
  insert into core.audit (organization_id, user_id, action, what, thing_id, before, after) values (me.organization_id, me.id, p_action, p_what, p_thing, p_before, p_after)
$$;

-- ── choose which of the login's users this session is (§3.1) ──
create function public.choose_user(p_user_id uuid) returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare v_login uuid := core.login_id(); v_session uuid := core.session_id(); u core.users;
begin
  if v_login is null then perform core.refuse('not_signed_in'); end if;
  select * into u from core.users x where x.id = p_user_id and x.login_id = v_login and x.retired_at is null;
  if not found then perform core.refuse('not_found', 'user'); end if;
  if v_session is null then perform core.refuse('no_session'); end if;
  insert into core.sessions (session_id, login_id, organization_id, user_id) values (v_session, v_login, u.organization_id, u.id)
  on conflict (session_id) do update set organization_id = excluded.organization_id, user_id = excluded.user_id, chosen_at = now();
  update core.users set signed_in_at = coalesce(signed_in_at, now()) where organization_id = u.organization_id and id = u.id;
  return jsonb_build_object('user_id', u.id, 'organization_id', u.organization_id);
end $$;

-- the login's users, before one is chosen (a login working in several organizations picks one per session)
create function public.my_users() returns jsonb language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', u.id, 'organization_id', u.organization_id, 'organization', o.name, 'name', u.name) order by o.name), '[]')
  from core.users u join core.organizations o on o.id = u.organization_id
  where u.login_id = core.login_id() and u.retired_at is null and o.retired_at is null
$$;

-- ── the first organization: a login with no user makes it and becomes its owner (held everywhere) ──
create function public.create_organization(p_id uuid, p_name text, p_user_id uuid, p_user_name text) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare v_login uuid := core.login_id(); v_owner uuid := '00000000-0000-0000-0000-00000000c001';
begin
  if v_login is null then perform core.refuse('not_signed_in'); end if;
  if not exists (select 1 from core.roles where id = v_owner) then perform core.refuse('not_found', 'owner role'); end if;
  insert into core.organizations (id, name) values (p_id, p_name);
  insert into core.departments (organization_id, id, name, work) values (p_id, core.uuid5(p_id, 'outside'), 'Outside', 'outside');
  insert into core.users (organization_id, id, login_id, kind, name, signed_in_at) values (p_id, p_user_id, v_login, 'staff', p_user_name, now());
  insert into core.holdings (organization_id, user_id, role_id, department_id, recorded_by) values (p_id, p_user_id, v_owner, null, p_user_id);
  insert into core.settings (organization_id, key, owner_id, thing_id, data, author_id) values (p_id, 'organization.time_zone', p_id, p_id, '{"zone":"Africa/Cairo"}', p_user_id);
  insert into core.audit (organization_id, user_id, action, what, thing_id, after) values (p_id, p_user_id, 'create', 'organization', p_id, jsonb_build_object('name', p_name));
  return jsonb_build_object('organization_id', p_id, 'user_id', p_user_id);
end $$;

-- ── roles and holdings: who may give what (§3.1) ──
-- the actions a user holds everywhere
create function core.everywhere_actions(p_user uuid) returns text[] language sql stable security definer set search_path = '' as $$
  select coalesce(array_agg(distinct ra.action), '{}') from core.users u join core.live_holdings(u.organization_id) h on h.user_id = u.id and h.department_id is null
    join core.role_actions_of(u.organization_id, h.role_id) ra(action) on true where u.id = p_user
$$;
-- somebody must keep manage:users and manage:roles held everywhere (possibly on two roles)
create function core.require_last_administrator(p_org uuid) returns void language plpgsql stable security definer set search_path = '' as $$
begin
  if not exists (select 1 from core.users u where u.organization_id = p_org and u.retired_at is null and u.kind = 'staff'
                   and core.everywhere_actions(u.id) @> array['manage:users', 'manage:roles']) then
    perform core.refuse('last_administrator');
  end if;
end $$;

create function core.save_role(me core.users, r jsonb) returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare v_id uuid := (r ->> 'id')::uuid; old core.roles; v_actions text[]; a text; v_key text; n int := 0; v_ended int := 0;
begin
  if not core.may(me.id, 'manage:roles', null) then perform core.refuse('not_allowed', 'manage:roles'); end if;
  select * into old from core.roles x where x.id = v_id;
  if old.id is not null and old.organization_id is null then perform core.refuse('builtin_role'); end if;
  if old.id is not null and old.organization_id <> me.organization_id then perform core.refuse('not_found', 'role'); end if;
  if old.id is not null and exists (select 1 from core.live_holdings(me.organization_id) h where h.user_id = me.id and h.role_id = v_id) then perform core.refuse('self_change'); end if;
  if coalesce((r ->> 'retired')::boolean, false) then
    if old.id is null then perform core.refuse('not_found', 'role'); end if;
    insert into core.holding_ends (organization_id, holding_id, ended_by)
      select h.organization_id, h.id, me.id from core.holdings h where h.organization_id = me.organization_id and h.role_id = v_id
         and not exists (select 1 from core.holding_ends x where x.organization_id = h.organization_id and x.holding_id = h.id);
    get diagnostics v_ended = row_count;
    update core.roles set retired_at = now() where id = v_id;
    perform core.audit(me, 'retire', 'role', v_id, to_jsonb(old), null);
    return jsonb_build_object('id', v_id, 'retired', true, 'unassigned', v_ended);
  end if;
  if length(trim(coalesce(r ->> 'name', ''))) = 0 then perform core.refuse('name_missing'); end if;
  v_actions := coalesce((select array_agg(distinct x) from jsonb_array_elements_text(r -> 'actions') x), '{}');
  foreach a in array v_actions loop
    if not exists (select 1 from core.actions x where x.key = a) then perform core.refuse('unknown_action', a); end if;
    if not (a = any (core.everywhere_actions(me.id))) then perform core.refuse('cannot_grant', a); end if;
  end loop;
  if old.id is null then
    v_key := trim(both '_' from regexp_replace(lower(r ->> 'name'), '[^a-z0-9]+', '_', 'g'));
    if v_key = '' then v_key := 'role'; end if;
    while exists (select 1 from core.roles x where coalesce(x.organization_id, me.organization_id) = me.organization_id and x.key = case when n = 0 then v_key else v_key || '_' || n end) loop
      n := n + 1;
    end loop;
    if n > 0 then v_key := v_key || '_' || n; end if;
    insert into core.roles (id, organization_id, key, name) values (v_id, me.organization_id, v_key, r ->> 'name');
  else
    update core.roles set name = r ->> 'name' where id = v_id;
    v_key := old.key;
  end if;
  delete from core.role_actions where role_id = v_id and not (action = any (v_actions));
  insert into core.role_actions (role_id, action) select v_id, unnest(v_actions) on conflict do nothing;
  perform core.require_last_administrator(me.organization_id);
  perform core.audit(me, case when old.id is null then 'create' else 'change' end, 'role', v_id, to_jsonb(old), r);
  return jsonb_build_object('id', v_id, 'key', v_key, 'name', r ->> 'name', 'actions', to_jsonb(v_actions));
end $$;

create function core.save_user(me core.users, r jsonb) returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare v_id uuid := (r ->> 'id')::uuid; old core.users; h jsonb; v_role core.roles; v_dept uuid; a text; kept uuid[] := '{}'; v_hid uuid;
begin
  if not core.may(me.id, 'manage:users', null) then perform core.refuse('not_allowed', 'manage:users'); end if;
  select * into old from core.users x where x.id = v_id;
  if old.id is not null and old.organization_id <> me.organization_id then perform core.refuse('not_found', 'user'); end if;
  if length(trim(coalesce(r ->> 'name', old.name, ''))) = 0 then perform core.refuse('name_missing'); end if;
  if old.id is null then
    insert into core.users (organization_id, id, login_id, kind, name, title)
    values (me.organization_id, v_id, (r ->> 'login_id')::uuid, coalesce(r ->> 'kind', 'staff'), r ->> 'name', r ->> 'title');
  else
    update core.users set name = coalesce(r ->> 'name', name), title = case when r ? 'title' then r ->> 'title' else title end,
      login_id = case when r ? 'login_id' then (r ->> 'login_id')::uuid else login_id end,
      retired_at = case when r ? 'retired' then case when (r ->> 'retired')::boolean then coalesce(retired_at, now()) end else retired_at end
     where organization_id = me.organization_id and id = v_id;
  end if;
  if r ? 'holdings' then
    if v_id = me.id then perform core.refuse('self_change'); end if;
    for h in select * from jsonb_array_elements(r -> 'holdings') loop
      select * into v_role from core.roles x where x.id = (h ->> 'role_id')::uuid and x.retired_at is null
        and (x.organization_id = me.organization_id or (x.organization_id is null and core.layer_on(me.organization_id, x.layer)));
      if not found then perform core.refuse('not_found', 'role'); end if;
      v_dept := (h ->> 'department_id')::uuid;
      if v_dept is not null and not exists (select 1 from core.departments d where d.organization_id = me.organization_id and d.id = v_dept) then
        perform core.refuse('not_found', 'department');
      end if;
      for a in select x from core.role_actions_of(me.organization_id, v_role.id) x loop
        if not (a = any (core.everywhere_actions(me.id))) then perform core.refuse('cannot_grant', a); end if;
      end loop;
      select x.id into v_hid from core.holdings x where x.organization_id = me.organization_id and x.user_id = v_id and x.role_id = v_role.id
         and x.department_id is not distinct from v_dept and not exists (select 1 from core.holding_ends y where y.organization_id = x.organization_id and y.holding_id = x.id);
      if v_hid is null then
        insert into core.holdings (organization_id, user_id, role_id, department_id, recorded_by) values (me.organization_id, v_id, v_role.id, v_dept, me.id) returning id into v_hid;
      end if;
      kept := kept || v_hid;
    end loop;
    insert into core.holding_ends (organization_id, holding_id, ended_by)
      select x.organization_id, x.id, me.id from core.holdings x where x.organization_id = me.organization_id and x.user_id = v_id and not (x.id = any (kept))
         and not exists (select 1 from core.holding_ends y where y.organization_id = x.organization_id and y.holding_id = x.id);
  end if;
  perform core.require_last_administrator(me.organization_id);
  perform core.audit(me, case when old.id is null then 'create' else 'change' end, 'user', v_id, to_jsonb(old) - 'login_id', r - 'login_id');
  return jsonb_build_object('id', v_id);
end $$;

create function core.save_place_row(me core.users, p_what text, r jsonb) returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare v_id uuid := (r ->> 'id')::uuid; v_org uuid := me.organization_id; before jsonb; v_retired timestamptz;
begin
  if not core.may(me.id, 'manage:places', null) then perform core.refuse('not_allowed', 'manage:places'); end if;
  v_retired := case when coalesce((r ->> 'retired')::boolean, false) then now() end;
  if p_what = 'organization' then
    if v_id is distinct from v_org then perform core.refuse('not_found', 'organization'); end if;
    select to_jsonb(o) into before from core.organizations o where o.id = v_org;
    update core.organizations set name = coalesce(r ->> 'name', name) where id = v_org;
  elsif p_what = 'site' then
    select to_jsonb(s) into before from core.sites s where s.organization_id = v_org and s.id = v_id;
    if before is null and exists (select 1 from core.sites s where s.id = v_id) then perform core.refuse('not_found', 'site'); end if;
    insert into core.sites (organization_id, id, name, address, retired_at) values (v_org, v_id, r ->> 'name', r -> 'address', v_retired)
    on conflict (organization_id, id) do update set name = coalesce(excluded.name, core.sites.name), address = coalesce(excluded.address, core.sites.address),
       retired_at = case when excluded.retired_at is not null then coalesce(core.sites.retired_at, excluded.retired_at) end;
  elsif p_what = 'department' then
    select to_jsonb(d) into before from core.departments d where d.organization_id = v_org and d.id = v_id;
    if before is null and exists (select 1 from core.departments d where d.id = v_id) then perform core.refuse('not_found', 'department'); end if;
    if before is not null and r ? 'work' and r ->> 'work' <> before ->> 'work'
       and exists (select 1 from core.entries e where e.organization_id = v_org and e.department_id = v_id) then
      perform core.refuse('in_use', 'record');
    end if;
    if coalesce(r ->> 'work', before ->> 'work') = 'outside' and before is null then perform core.refuse('one_outside'); end if;
    insert into core.departments (organization_id, id, site_id, name, work, position, retired_at)
    values (v_org, v_id, (r ->> 'site_id')::uuid, coalesce(r ->> 'name', before ->> 'name'), coalesce(r ->> 'work', before ->> 'work', 'visits'),
            coalesce((r ->> 'position')::int, (before ->> 'position')::int, 0), v_retired)
    on conflict (organization_id, id) do update set name = excluded.name, work = excluded.work, position = excluded.position,
       site_id = case when r ? 'site_id' then excluded.site_id else core.departments.site_id end,
       retired_at = case when excluded.retired_at is not null then coalesce(core.departments.retired_at, excluded.retired_at) end;
  elsif p_what = 'place' then
    select to_jsonb(p) into before from core.places p where p.organization_id = v_org and p.id = v_id;
    if before is null and exists (select 1 from core.places p where p.id = v_id) then perform core.refuse('not_found', 'place'); end if;
    insert into core.places (organization_id, id, department_id, parent_id, label, name, position, retired_at)
    values (v_org, v_id, coalesce((r ->> 'department_id')::uuid, (before ->> 'department_id')::uuid), coalesce((r ->> 'parent_id')::uuid, (before ->> 'parent_id')::uuid),
            coalesce(r ->> 'label', before ->> 'label', 'bed'), coalesce(r ->> 'name', before ->> 'name'), coalesce((r ->> 'position')::int, (before ->> 'position')::int, 0), v_retired)
    on conflict (organization_id, id) do update set department_id = excluded.department_id, parent_id = excluded.parent_id, label = excluded.label,
       name = excluded.name, position = excluded.position,
       retired_at = case when excluded.retired_at is not null then coalesce(core.places.retired_at, excluded.retired_at) end;
  end if;
  perform core.audit(me, case when before is null then 'create' else 'change' end, p_what, v_id, before, r);
  return jsonb_build_object('id', v_id);
end $$;

create function public.save(p_what text, p_row jsonb) returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare me core.users := core.me();
begin
  perform core.require_mfa();
  return case p_what
    when 'role' then core.save_role(me, p_row)
    when 'user' then core.save_user(me, p_row)
    when 'organization' then core.save_place_row(me, p_what, p_row)
    when 'site' then core.save_place_row(me, p_what, p_row)
    when 'department' then core.save_place_row(me, p_what, p_row)
    when 'place' then core.save_place_row(me, p_what, p_row)
    else null end;
end $$;

-- delete a mistake: only what nothing ever used; anything used is refused in_use and stays, to be retired (§3.12)
create function public.remove(p_what text, p_id uuid) returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare me core.users := core.me(); v_org uuid; before jsonb;
begin
  perform core.require_mfa();
  v_org := me.organization_id;
  if p_what = 'department' then
    if not core.may(me.id, 'manage:places', null) then perform core.refuse('not_allowed'); end if;
    select to_jsonb(d) into before from core.departments d where d.organization_id = v_org and d.id = p_id;
    if before is null then perform core.refuse('not_found', 'department'); end if;
    if before ->> 'work' = 'outside' then perform core.refuse('in_use', 'outside'); end if;
    if exists (select 1 from core.entries e where e.organization_id = v_org and e.department_id = p_id) then perform core.refuse('in_use', 'record'); end if;
    if exists (select 1 from core.settings s where s.organization_id = v_org and s.owner_id = p_id and s.key not like 'department.%') then perform core.refuse('in_use', 'services'); end if;
    if exists (select 1 from core.holdings h where h.organization_id = v_org and h.department_id = p_id) then perform core.refuse('in_use', 'people'); end if;
    if exists (select 1 from core.places p where p.organization_id = v_org and p.department_id = p_id) then perform core.refuse('in_use', 'places'); end if;
    delete from core.departments where organization_id = v_org and id = p_id;
  elsif p_what = 'place' then
    if not core.may(me.id, 'manage:places', null) then perform core.refuse('not_allowed'); end if;
    select to_jsonb(p) into before from core.places p where p.organization_id = v_org and p.id = p_id;
    if before is null then perform core.refuse('not_found', 'place'); end if;
    if exists (select 1 from core.entries e where e.organization_id = v_org and e.data::text like '%' || p_id::text || '%') then perform core.refuse('in_use', 'record'); end if;
    if exists (select 1 from core.places p where p.organization_id = v_org and p.parent_id = p_id) then perform core.refuse('in_use', 'places'); end if;
    delete from core.places where organization_id = v_org and id = p_id;
  elsif p_what = 'user' then
    if not core.may(me.id, 'manage:users', null) then perform core.refuse('not_allowed'); end if;
    if p_id = me.id then perform core.refuse('self_change'); end if;
    select to_jsonb(u) - 'login_id' into before from core.users u where u.organization_id = v_org and u.id = p_id;
    if before is null then perform core.refuse('not_found', 'user'); end if;
    if before ->> 'signed_in_at' is not null then perform core.refuse('in_use', 'signed_in'); end if;
    if exists (select 1 from core.entries e where e.organization_id = v_org and e.author_id = p_id) then perform core.refuse('in_use', 'record'); end if;
    delete from core.holding_ends x using core.holdings h where x.organization_id = v_org and h.organization_id = v_org and x.holding_id = h.id and h.user_id = p_id;
    delete from core.holdings where organization_id = v_org and user_id = p_id;
    delete from core.sessions where organization_id = v_org and user_id = p_id;
    delete from core.users where organization_id = v_org and id = p_id;
    perform core.require_last_administrator(v_org);
  elsif p_what = 'role' then
    if not core.may(me.id, 'manage:roles', null) then perform core.refuse('not_allowed'); end if;
    select to_jsonb(r) into before from core.roles r where r.id = p_id;
    if before is null or (before ->> 'organization_id' is not null and (before ->> 'organization_id')::uuid <> v_org) then perform core.refuse('not_found', 'role'); end if;
    if before ->> 'organization_id' is null then perform core.refuse('builtin_role'); end if;
    if exists (select 1 from core.holdings h where h.role_id = p_id) then perform core.refuse('in_use', 'people'); end if;
    delete from core.role_actions where role_id = p_id;
    delete from core.roles where id = p_id;
  else
    perform core.refuse('bad_request', p_what);
  end if;
  perform core.audit(me, 'delete', p_what, p_id, before, null);
  return jsonb_build_object('deleted', p_id);
end $$;

-- ── patients (§3.2): register or change identity; every change a full snapshot ──
create function core.patient_snapshot(p core.patients) returns jsonb language sql stable security definer set search_path = '' as $$
  select core.identity(p) - 'id' - 'number' - 'merged_into'
$$;

create function public.save_patient(p jsonb) returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare me core.users := core.me(); v_org uuid; v_dept uuid := (p ->> 'department_id')::uuid; x jsonb := p -> 'patient'; v_id uuid; old core.patients; cur core.patients;
        v_given text[]; v_full text; v_findings jsonb := '[]'; idf jsonb; s core.systems; fs jsonb;
begin
  v_org := me.organization_id;
  if v_dept is null or not core.may(me.id, 'manage:patients', v_dept) then perform core.refuse('not_allowed', 'manage:patients'); end if;
  v_id := (x ->> 'id')::uuid;
  if v_id is null then perform core.refuse('bad_request', 'id'); end if;
  select * into old from core.patients y where y.organization_id = v_org and y.id = v_id;
  if not found and exists (select 1 from core.patients y where y.id = v_id) then perform core.refuse('not_found', 'patient'); end if;
  v_given := coalesce((select array_agg(trim(g)) from jsonb_array_elements_text(x -> 'given') g where trim(g) <> ''), old.given, '{}');
  v_full := coalesce(nullif(trim(x ->> 'full_name'), ''), nullif(trim(array_to_string(v_given || coalesce(x ->> 'family', old.family), ' ')), ''), old.full_name);
  if v_full is null and not coalesce((x ->> 'anonymous')::boolean, false) then perform core.refuse('name_missing'); end if;
  if old.merged_into is not null then perform core.refuse('merged', old.merged_into::text); end if;
  -- identifiers: a registered identifier system; its check function warns and never refuses (§6.3)
  for idf in select * from jsonb_array_elements(coalesce(x -> 'identifiers', '[]')) loop
    select * into s from core.systems y where y.key = idf ->> 'system' and y.kind = 'identifier';
    if not found then perform core.refuse('unknown_system', idf ->> 'system'); end if;
    if s.check_fn is not null then
      begin
        execute format('select %s($1, $2)', s.check_fn::regproc) into fs using idf ->> 'value', x;
      exception when others then fs := jsonb_build_array(jsonb_build_object('code', 'check_failed', 'level', 'warn'));
      end;
      v_findings := v_findings || coalesce(fs, '[]');
    end if;
  end loop;
  if old.id is null then
    insert into core.patients (organization_id, id, number, given, family, full_name, latin, folded, gender, birth_date, birth_precision, birth_estimated, anonymous, telecom, address, created_by)
    values (v_org, v_id, core.next_number(v_org, 'record_number'), v_given, x ->> 'family', coalesce(v_full, 'Unknown patient'), x ->> 'latin',
            core.fold(coalesce(v_full, '') || ' ' || coalesce(x ->> 'latin', '')), coalesce(x ->> 'gender', 'unknown'), (x ->> 'birth_date')::date,
            coalesce(x ->> 'birth_precision', 'day'), coalesce((x ->> 'birth_estimated')::boolean, false), coalesce((x ->> 'anonymous')::boolean, false),
            coalesce(x -> 'telecom', '[]'), x -> 'address', me.id)
    returning * into cur;
  else
    update core.patients set given = v_given, family = case when x ? 'family' then x ->> 'family' else family end, full_name = v_full,
      latin = case when x ? 'latin' then x ->> 'latin' else latin end,
      folded = core.fold(v_full || ' ' || coalesce(case when x ? 'latin' then x ->> 'latin' else latin end, '')),
      gender = coalesce(x ->> 'gender', gender), birth_date = case when x ? 'birth_date' then (x ->> 'birth_date')::date else birth_date end,
      birth_precision = coalesce(x ->> 'birth_precision', birth_precision), birth_estimated = coalesce((x ->> 'birth_estimated')::boolean, birth_estimated),
      anonymous = coalesce((x ->> 'anonymous')::boolean, anonymous), telecom = coalesce(x -> 'telecom', telecom),
      address = case when x ? 'address' then x -> 'address' else address end, changed_at = now()
     where organization_id = v_org and id = v_id returning * into cur;
  end if;
  if x ? 'identifiers' then
    delete from core.patient_identifiers where organization_id = v_org and patient_id = v_id;
    insert into core.patient_identifiers (organization_id, patient_id, system, value, verified)
      select distinct on (i ->> 'system', i ->> 'value') v_org, v_id, i ->> 'system', trim(i ->> 'value'), coalesce((i ->> 'verified')::boolean, false)
        from jsonb_array_elements(x -> 'identifiers') i where trim(coalesce(i ->> 'value', '')) <> '';
  end if;
  insert into core.patient_changes (organization_id, patient_id, data, reason, author_id) values (v_org, v_id, core.patient_snapshot(cur), p ->> 'reason', me.id);
  return jsonb_build_object('patient', core.identity(cur), 'findings', v_findings, 'created', old.id is null);
end $$;

-- every derived row of these patients' items, recomputed (merge, pack on, erase)
create function core.refresh_patients(p_org uuid, p_patients uuid[]) returns void language plpgsql volatile security definer set search_path = '' as $$
declare v_items uuid[]; d core.derived;
begin
  select coalesce(array_agg(distinct e.item), '{}') into v_items from core.entries e where e.organization_id = p_org and e.patient_id = any (p_patients);
  if cardinality(v_items) = 0 then return; end if;
  for d in select * from core.derived x order by (x.layer <> 'base'), x.position loop
    perform core.run_refresh(d.refresh, p_org, v_items);
  end loop;
end $$;

create function public.merge_patients(p jsonb) returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare me core.users := core.me(); v_org uuid; v_from uuid := (p ->> 'from')::uuid; v_into uuid := (p ->> 'into')::uuid; fam uuid[]; a core.patients; b core.patients;
begin
  v_org := me.organization_id;
  if not core.may(me.id, 'manage:patients', (p ->> 'department_id')::uuid) then perform core.refuse('not_allowed', 'manage:patients'); end if;
  if length(trim(coalesce(p ->> 'reason', ''))) = 0 then perform core.refuse('reason_missing'); end if;
  perform pg_advisory_xact_lock(hashtextextended(k, 0)) from (select 'patient:' || core.survivor(v_org, x) k from unnest(array[v_from, v_into]) x order by 1) q;
  select * into a from core.patients x where x.organization_id = v_org and x.id = v_from;
  select * into b from core.patients x where x.organization_id = v_org and x.id = v_into;
  if a.id is null or b.id is null then perform core.refuse('not_found', 'patient'); end if;
  if a.merged_into is not null or b.merged_into is not null or a.id = b.id then perform core.refuse('merged'); end if;
  update core.patients set merged_into = v_into, changed_at = now() where organization_id = v_org and id = v_from;
  insert into core.merges (organization_id, from_id, into_id, reason, author_id) values (v_org, v_from, v_into, p ->> 'reason', me.id);
  insert into core.patient_changes (organization_id, patient_id, data, reason, author_id) values (v_org, v_from, jsonb_build_object('merged_into', v_into), p ->> 'reason', me.id);
  fam := core.family(v_org, v_into);
  perform core.refresh_patients(v_org, fam);
  perform core.audit(me, 'merge', 'patient', v_from, jsonb_build_object('from', v_from), jsonb_build_object('into', v_into, 'reason', p ->> 'reason'));
  return jsonb_build_object('survivor', v_into, 'family', to_jsonb(fam));
end $$;

-- where a value breaks its setting's shape (§5.1 rule 7): the first property whose value does not match, as a path with an array's index
-- (rows.2.dose), going as deep as it can; null when no one property is to blame. The form shows the refusal next to that field.
create function core.shape_field(p_shape jsonb, p_data jsonb, p_defs jsonb default null, p_prefix text default '') returns text language plpgsql stable as $$
declare d jsonb := coalesce(p_defs, p_shape -> '$defs', '{}'); s jsonb := p_shape; k text; v jsonb; sub jsonb; i int;
begin
  if s ? '$ref' then s := d -> substr(s ->> '$ref', 9); end if;   -- '#/$defs/<name>'
  if s is null then return null; end if;
  if jsonb_typeof(p_data) = 'object' and s ? 'properties' then
    for k in select x from jsonb_array_elements_text(coalesce(s -> 'required', '[]')) x loop
      if not p_data ? k then return p_prefix || k; end if;
    end loop;
    for k, v in select x.key, x.value from jsonb_each(p_data) x order by x.key loop
      sub := s -> 'properties' -> k;
      if sub is null then
        if s -> 'additionalProperties' = 'false'::jsonb then return p_prefix || k; end if;
        continue;
      end if;
      if not extensions.jsonb_matches_schema((sub || jsonb_build_object('$defs', d))::json, v) then
        return coalesce(core.shape_field(sub, v, d, p_prefix || k || '.'), p_prefix || k);
      end if;
    end loop;
  elsif jsonb_typeof(p_data) = 'array' and s ? 'items' then
    for i in 0 .. jsonb_array_length(p_data) - 1 loop
      if not extensions.jsonb_matches_schema(((s -> 'items') || jsonb_build_object('$defs', d))::json, p_data -> i) then
        return coalesce(core.shape_field(s -> 'items', p_data -> i, d, p_prefix || i || '.'), p_prefix || i);
      end if;
    end loop;
  end if;
  return null;
end $$;

-- ── settings (§3.4): shape, key check, may; organization and place keys need the action everywhere. A refusal names its field when it
-- can (the hint): the shape's, by core.shape_field; a check's, by its finding's field ──
create function public.write_setting(p jsonb) returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare me core.users := core.me(); v_org uuid; k core.setting_keys; v_owner uuid := (p ->> 'owner_id')::uuid; v_thing uuid; v_data jsonb := coalesce(p -> 'data', '{}');
        v_retired boolean := coalesce((p ->> 'retired')::boolean, false); fs jsonb; before jsonb; v_id uuid; v_on_before text[]; v_on_after text[]; v_layer text; d core.derived; l core.listeners;
        v_items uuid[];
begin
  v_org := me.organization_id;
  perform core.require_mfa();
  select * into k from core.setting_keys x where x.key = p ->> 'key';
  if not found then perform core.refuse('unknown_setting', p ->> 'key'); end if;
  if not core.layer_on(v_org, k.layer) then perform core.refuse('pack_off', k.layer); end if;
  -- a key's own action (sign:score) is a person's act, held in any department for an organization key; manage:settings is held everywhere
  if k.owner_kind = 'organization' then
    v_owner := v_org;
    if not (case when k.action is null then core.may(me.id, 'manage:settings', null) else core.may_somewhere(me.id, k.action) end) then
      perform core.refuse('not_allowed', coalesce(k.action, 'manage:settings'));
    end if;
  elsif k.owner_kind = 'department' then
    if not exists (select 1 from core.departments x where x.organization_id = v_org and x.id = v_owner) then perform core.refuse('not_found', 'department'); end if;
    if not core.may(me.id, coalesce(k.action, 'manage:settings'), v_owner) then perform core.refuse('not_allowed', coalesce(k.action, 'manage:settings')); end if;
  else
    if not exists (select 1 from core.places x where x.organization_id = v_org and x.id = v_owner) then perform core.refuse('not_found', 'place'); end if;
    if not core.may(me.id, coalesce(k.action, 'manage:settings'), (select x.department_id from core.places x where x.organization_id = v_org and x.id = v_owner)) then
      perform core.refuse('not_allowed', coalesce(k.action, 'manage:settings'));
    end if;
  end if;
  v_thing := case when k.many then coalesce((p ->> 'thing_id')::uuid, core.uuid7()) else v_owner end;
  select to_jsonb(s) into before from core.settings s where s.organization_id = v_org and s.key = k.key and s.thing_id = v_thing order by s.recorded_at desc, s.id desc limit 1;
  if before is not null and (before ->> 'owner_id')::uuid is distinct from v_owner then perform core.refuse('not_found', 'setting'); end if;
  if not v_retired then
    if not extensions.jsonb_matches_schema(k.shape::json, v_data) then
      perform core.refuse_at('bad_shape', (select string_agg(x, '; ') from unnest(extensions.jsonschema_validation_errors(k.shape::json, v_data::json)) x),
                             core.shape_field(k.shape, v_data));
    end if;
    if k.check_fn is not null then
      execute format('select %s($1, $2)', k.check_fn::regproc) into fs using jsonb_build_object('organization_id', v_org, 'owner_id', v_owner, 'thing_id', v_thing), v_data;
      if exists (select 1 from jsonb_array_elements(coalesce(fs, '[]')) f where f ->> 'level' = 'refuse') then
        perform core.refuse_at(f ->> 'code', f ->> 'detail', f ->> 'field') from (select f from jsonb_array_elements(fs) f where f ->> 'level' = 'refuse' limit 1) x;
      end if;
    end if;
  end if;
  v_on_before := core.packs_used(v_org);
  -- after a clock step back, still after the thing's row before (the latest row is the last one written) and after the organization's
  -- latest entry, so entries and settings keep one order: a change never reaches back over an entry written before it (§3.4)
  insert into core.settings (organization_id, key, owner_id, thing_id, data, retired, author_id, recorded_at)
  values (v_org, k.key, v_owner, v_thing, case when v_retired then coalesce(before -> 'data', '{}') else v_data end, v_retired, me.id,
          greatest(clock_timestamp(), (before ->> 'recorded_at')::timestamptz + interval '1 microsecond',
                   (select e.recorded_at from core.entries e where e.organization_id = v_org order by e.recorded_at desc limit 1) + interval '1 microsecond')) returning id into v_id;
  perform core.audit(me, case when v_retired then 'retire' when before is null then 'create' else 'change' end, 'setting:' || k.key, v_thing, before -> 'data', v_data);
  -- a pack turned on: its tables and listeners catch up for the organization before its screens show (§5)
  if k.key = 'organization.packs_used' then
    v_on_after := core.packs_used(v_org);
    for v_layer in select x from unnest(v_on_after) x where not (x = any (v_on_before)) loop
      if not exists (select 1 from core.layers y where y.key = v_layer and y.is_pack) then perform core.refuse('unknown_pack', v_layer); end if;
      if exists (select 1 from core.layers y, unnest(y.requires) q where y.key = v_layer and not (q = any (v_on_after))) then perform core.refuse('requires', v_layer); end if;
      select coalesce(array_agg(distinct e.item), '{}') into v_items from core.entries e where e.organization_id = v_org;
      for d in select * from core.derived x where x.layer = v_layer loop
        perform core.run_refresh(d.refresh, v_org, v_items);
      end loop;
      for l in select * from core.listeners x where x.layer = v_layer loop
        perform core.run_refresh(l.refresh, v_org, v_items);
      end loop;
      delete from core.stale where organization_id = v_org and layer = v_layer;
    end loop;
    if exists (select 1 from core.layers y, unnest(y.requires) q where y.key = any (v_on_after) and not (q = any (v_on_after))) then perform core.refuse('required_by_another'); end if;
  end if;
  perform core.hint('organization:' || v_org);
  return jsonb_build_object('id', v_id, 'thing_id', v_thing, 'key', k.key);
end $$;

-- ── starter setups (§5.2): one door runs a setup on a new department or an existing one ──
-- the setup's parts against the department as it stands, in the order they are applied (the packs it ticks, its settings, places,
-- services, presets, then the Screens line, whose check reads the packs): each is to add (missing), the same, differs (staff changed it:
-- shown, never overwritten) or blocked (its pack is off for the clinic). A row is matched by its id (from its key), its key or its name;
-- something staff retired, deleted or unticked is a change of theirs, so it differs and is never added again
create function core.setup_parts(p_org uuid, p_setup text, p_dept uuid) returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare st core.setups; out jsonb := '[]'; k text; v jsonb; r record; v_id uuid; v_on text[] := core.packs_used(p_org); v_packs text[]; v_use text[];
        v_state text; v_have jsonb; v_default jsonb; i int := 0; v_gone boolean;
begin
  select * into st from core.setups x where x.key = p_setup;
  if not found then return '[]'; end if;
  v_packs := array(select x from jsonb_array_elements_text(coalesce(core.setting_at(p_org, 'department.packs', p_dept) -> 'packs', '[]')) x);
  -- a pack this department ticked once (or whose list staff retired) and does not tick now was unticked by staff: it differs
  v_gone := coalesce((select s.retired from core.settings s where s.organization_id = p_org and s.key = 'department.packs' and s.thing_id = p_dept
    order by s.recorded_at desc, s.id desc limit 1), false);
  foreach k in array st.packs loop
    v_state := case when k = any (v_packs) then 'same'
      when v_gone or exists (select 1 from core.settings s where s.organization_id = p_org and s.key = 'department.packs' and s.thing_id = p_dept and s.data -> 'packs' ? k) then 'differs'
      when not (k = any (v_on)) then 'blocked' else 'add' end;
    out := out || jsonb_build_object('part', 'pack:' || k, 'kind', 'pack', 'key', k, 'name', coalesce((select l.labels ->> 'en' from core.layers l where l.key = k), k),
      'state', v_state, 'why', case when v_state = 'blocked' then 'pack_off' end,
      'want', jsonb_build_object('packs', to_jsonb(v_packs) || to_jsonb(k)), 'have', case when v_state = 'differs' then jsonb_build_object('packs', to_jsonb(v_packs), 'unticked', true) end);
  end loop;
  for k, v in select x.key, x.value from jsonb_each(st.settings) x order by x.key loop
    select s.data, s.retired into r from core.settings s where s.organization_id = p_org and s.key = k and s.thing_id = p_dept order by s.recorded_at desc, s.id desc limit 1;
    v_state := case when r is null then 'add' when r.retired or r.data <> v then 'differs' else 'same' end;
    out := out || jsonb_build_object('part', 'setting:' || k, 'kind', 'setting', 'key', k, 'name', coalesce((select x.labels ->> 'en' from core.setting_keys x where x.key = k), k),
      'state', v_state, 'want', v, 'have', case when not (r is null) and not r.retired then r.data end);
    r := null;
  end loop;
  for v in select x from jsonb_array_elements(st.places) x loop
    i := i + 1;
    v_id := core.setup_id(p_dept, 'place', v ->> 'key');
    select p.* into r from core.places p where p.organization_id = p_org and (p.id = v_id or (p.department_id = p_dept and lower(trim(p.name)) = lower(trim(v ->> 'name'))))
     order by p.id = v_id desc, p.retired_at is not null, p.position limit 1;
    -- none here: one staff deleted (its delete in the audit, by its id or its name in this department) is not added again
    if r is null then
      select jsonb_build_object('id', a.thing_id, 'name', a.before ->> 'name', 'label', a.before ->> 'label', 'removed', true) into v_have from core.audit a
       where a.organization_id = p_org and a.action = 'delete' and a.what = 'place'
         and (a.thing_id = v_id or (a.before ->> 'department_id' = p_dept::text and lower(trim(a.before ->> 'name')) = lower(trim(v ->> 'name'))))
       order by a.at desc limit 1;
    end if;
    v_state := case when r is null and v_have is not null then 'differs' when r is null then 'add'
      when r.retired_at is not null or r.department_id <> p_dept or r.name <> v ->> 'name' or r.label <> coalesce(v ->> 'label', 'bed') then 'differs' else 'same' end;
    out := out || jsonb_build_object('part', 'place:' || (v ->> 'key'), 'kind', 'place', 'key', v ->> 'key', 'name', v ->> 'name', 'state', v_state,
      'want', jsonb_build_object('id', v_id, 'name', v ->> 'name', 'label', coalesce(v ->> 'label', 'bed'), 'position', i),
      'have', case when not (r is null) then jsonb_build_object('id', r.id, 'name', r.name, 'label', r.label, 'retired', r.retired_at is not null) else v_have end);
    r := null; v_have := null;
  end loop;
  for v in select x from jsonb_array_elements(st.services) x loop
    v_id := core.setup_id(p_dept, 'service', v ->> 'code');
    select x.* into r from (select distinct on (s.thing_id) s.thing_id, s.data, s.retired from core.settings s
        where s.organization_id = p_org and s.key = 'service' and s.owner_id = p_dept order by s.thing_id, s.recorded_at desc, s.id desc) x
     where x.thing_id = v_id or lower(x.data ->> 'code') = lower(v ->> 'code') or lower(trim(x.data ->> 'name')) = lower(trim(v ->> 'name'))
     order by x.thing_id = v_id desc, x.retired limit 1;
    out := out || jsonb_build_object('part', 'service:' || (v ->> 'code'), 'kind', 'service', 'key', v ->> 'code', 'name', v ->> 'name',
      'state', case when r is null then 'add' when r.retired or r.data <> v then 'differs' else 'same' end,
      'want', v, 'id', coalesce(r.thing_id, v_id), 'have', case when not (r is null) and not r.retired then r.data end);
    r := null;
  end loop;
  -- a preset is the clinic's, for this department or for all: one for all with the same shortcut or name already serves here
  for v in select x from jsonb_array_elements(st.presets) x loop
    v_id := core.setup_id(p_dept, 'preset', v ->> 'shortcut');
    select x.* into r from (select distinct on (s.thing_id) s.thing_id, s.data, s.retired from core.settings s
        where s.organization_id = p_org and s.key = 'preset' order by s.thing_id, s.recorded_at desc, s.id desc) x
     where (x.thing_id = v_id or ((x.data ->> 'department_id' is null or x.data ->> 'department_id' = p_dept::text)
            and (lower(x.data ->> 'shortcut') = lower(v ->> 'shortcut') or lower(trim(x.data ->> 'name')) = lower(trim(v ->> 'name')))))
     order by x.thing_id = v_id desc, x.retired limit 1;
    out := out || jsonb_build_object('part', 'preset:' || (v ->> 'shortcut'), 'kind', 'preset', 'key', v ->> 'shortcut', 'name', v ->> 'name',
      'state', case when r is null then 'add' when r.retired or (r.data - 'department_id') <> v then 'differs' else 'same' end,
      'want', v || jsonb_build_object('department_id', p_dept), 'id', coalesce(r.thing_id, v_id), 'have', case when not (r is null) and not r.retired then r.data end);
    r := null;
  end loop;
  -- the Screens line: one set by staff is theirs; with none set, the department's default line (with the setup's packs ticked) may
  -- already be the setup's
  if st.screens is not null then
    select s.data, s.retired into r from core.settings s where s.organization_id = p_org and s.key = 'department.screens' and s.thing_id = p_dept
     order by s.recorded_at desc, s.id desc limit 1;
    v_use := array(select x from unnest(v_packs || st.packs) x where x = any (v_on));
    v_default := (select coalesce(jsonb_agg(s.key order by s.layer <> 'base', s.key), '[]') from core.screens s
      where s.work = st.work and (s.layer = 'base' or s.layer = any (v_use))
        and not exists (select 1 from core.screens x where x.work = st.work and s.key = any (x.replaces) and (x.layer = 'base' or x.layer = any (v_use))));
    v_state := case
      when not (r is null) then case when r.retired or r.data -> 'screens' <> st.screens -> 'screens'
                                     or coalesce(r.data ->> 'opens', r.data -> 'screens' ->> 0) <> coalesce(st.screens ->> 'opens', st.screens -> 'screens' ->> 0) then 'differs' else 'same' end
      when exists (select 1 from jsonb_array_elements_text(st.screens -> 'screens') x join core.screens y on y.key = x where y.layer <> 'base' and not (y.layer = any (v_on))) then 'blocked'
      when v_default = st.screens -> 'screens' and coalesce(st.screens ->> 'opens', v_default ->> 0) = v_default ->> 0 then 'same'
      else 'add' end;
    out := out || jsonb_build_object('part', 'screens', 'kind', 'screens', 'key', 'department.screens', 'name', 'Screens line', 'state', v_state, 'want', st.screens,
      'have', case when not (r is null) and not r.retired then r.data else jsonb_build_object('screens', v_default) end, 'why', case when v_state = 'blocked' then 'pack_off' end);
  end if;
  return out;
end $$;

-- run a setup (§5.2). Without apply it only answers what it would do (parts). With apply (true: every part to add; or a list of parts),
-- it makes the department first when it is new, then adds the parts accepted, in order, each through its own door (save, write_setting),
-- so each is checked and audited as if staff had typed it. A part that differs is never applied (would_overwrite); one the same is
-- nothing to do. Run again, it adds nothing. The setup a department was made from is kept (department.setup), so Settings can compare
create function public.setup(p jsonb) returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare me core.users := core.me(); v_org uuid := me.organization_id; st core.setups; d core.departments; v_dept uuid := (p ->> 'department_id')::uuid;
        v_apply jsonb := p -> 'apply'; parts jsonb; x jsonb; v_want text[]; v_applied text[] := '{}'; v_new boolean := false; k text;
begin
  if not core.may(me.id, 'manage:places', null) then perform core.refuse('not_allowed', 'manage:places'); end if;
  select * into st from core.setups s where s.key = p ->> 'setup';
  if not found then perform core.refuse('unknown_setup', p ->> 'setup'); end if;
  if v_dept is not null then
    select * into d from core.departments x where x.organization_id = v_org and x.id = v_dept;
    if d.id is null and exists (select 1 from core.departments x where x.id = v_dept) then perform core.refuse('not_found', 'department'); end if;
    if d.id is not null and d.work <> st.work then perform core.refuse('wrong_work', format('%s is for %s, not %s', st.key, st.work, d.work)); end if;
    if d.retired_at is not null then perform core.refuse('retired', 'department'); end if;
  end if;
  if v_apply is null then
    return jsonb_build_object('setup', st.key, 'department_id', v_dept, 'exists', d.id is not null, 'parts', core.setup_parts(v_org, st.key, v_dept));
  end if;
  if not core.layer_on(v_org, st.layer) then perform core.refuse('pack_off', st.layer); end if;
  if d.id is null then
    v_dept := coalesce(v_dept, core.uuid7());
    perform public.save('department', jsonb_strip_nulls(jsonb_build_object('id', v_dept, 'name', coalesce(nullif(trim(p ->> 'name'), ''), st.labels ->> 'en'), 'work', st.work,
      'site_id', p ->> 'site_id', 'position', (p ->> 'position')::int)));
    v_new := true;
  end if;
  parts := core.setup_parts(v_org, st.key, v_dept);
  if jsonb_typeof(v_apply) = 'boolean' then
    v_want := case when v_apply = 'true' then array(select y ->> 'part' from jsonb_array_elements(parts) y where y ->> 'state' = 'add') else '{}' end;
  elsif jsonb_typeof(v_apply) = 'array' then
    v_want := array(select jsonb_array_elements_text(v_apply));
    foreach k in array v_want loop
      select y into x from jsonb_array_elements(parts) y where y ->> 'part' = k;
      if x is null then perform core.refuse('unknown_part', k); end if;
      if x ->> 'state' = 'differs' then perform core.refuse('would_overwrite', format('%s: staff changed it here', k)); end if;
      if x ->> 'state' = 'blocked' then perform core.refuse(coalesce(x ->> 'why', 'pack_off'), k); end if;
      x := null;
    end loop;
  else
    perform core.refuse('bad_request', 'apply');
  end if;
  for x in select y from jsonb_array_elements(parts) y where y ->> 'state' = 'add' and y ->> 'part' = any (v_want) loop
    case x ->> 'kind'
      when 'pack' then
        perform public.write_setting(jsonb_build_object('key', 'department.packs', 'owner_id', v_dept, 'data', jsonb_build_object('packs',
          coalesce(core.setting_at(v_org, 'department.packs', v_dept) -> 'packs', '[]') || to_jsonb(x ->> 'key'))));
      when 'setting' then perform public.write_setting(jsonb_build_object('key', x ->> 'key', 'owner_id', v_dept, 'data', x -> 'want'));
      when 'place' then perform public.save('place', jsonb_build_object('id', x -> 'want' ->> 'id', 'department_id', v_dept, 'label', x -> 'want' ->> 'label',
                          'name', x -> 'want' ->> 'name', 'position', (x -> 'want' ->> 'position')::int));
      when 'service' then perform public.write_setting(jsonb_build_object('key', 'service', 'owner_id', v_dept, 'thing_id', x ->> 'id', 'data', x -> 'want'));
      when 'preset' then perform public.write_setting(jsonb_build_object('key', 'preset', 'thing_id', x ->> 'id', 'data', x -> 'want'));
      when 'screens' then perform public.write_setting(jsonb_build_object('key', 'department.screens', 'owner_id', v_dept, 'data', x -> 'want'));
    end case;
    v_applied := v_applied || (x ->> 'part');
  end loop;
  if (v_new or cardinality(v_applied) > 0)
     and not exists (select 1 from core.settings s where s.organization_id = v_org and s.key = 'department.setup' and s.thing_id = v_dept) then
    perform public.write_setting(jsonb_build_object('key', 'department.setup', 'owner_id', v_dept, 'data', jsonb_build_object('setup', st.key)));
  end if;
  if cardinality(v_applied) > 0 then perform core.audit(me, 'setup', 'department', v_dept, null, jsonb_build_object('setup', st.key, 'applied', to_jsonb(v_applied))); end if;
  return jsonb_build_object('setup', st.key, 'department_id', v_dept, 'created', v_new, 'applied', to_jsonb(v_applied), 'parts', core.setup_parts(v_org, st.key, v_dept));
end $$;

-- ── the two exceptions (§3.11): owned by core_eraser, the only role the permanence trigger lets through ──
grant usage, create on schema core to core_eraser;   -- to own its two functions; CREATE is taken back below
create function core.erase(p_org uuid, p_user uuid, p_patient uuid, p_reason text) returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare fam uuid[] := core.family(p_org, p_patient); v_ids uuid[]; v_sets uuid[]; n bigint := 0; c bigint; d core.derived;
begin
  select coalesce(array_agg(e.id), '{}'), coalesce(array_agg(distinct e.set_id), '{}') into v_ids, v_sets from core.entries e where e.organization_id = p_org and e.patient_id = any (fam);
  if exists (select 1 from core.entries e where e.organization_id = p_org and not (e.patient_id = any (fam)) and (e.refers_to = any (v_ids) or e.replaces = any (v_ids))) then
    perform core.refuse('linked_to_other_patient');
  end if;
  for d in select * from core.derived loop
    execute format('delete from %s where organization_id = $1 and patient_id = any ($2)', d.relation) using p_org, fam;
    get diagnostics c = row_count; n := n + c;
  end loop;
  perform set_config('storage.allow_delete_query', 'true', true);   -- the rows; the stored bytes go with the Storage API's sweep
  delete from storage.objects where bucket_id = 'files' and name like any (select p_org || '/' || f || '/%' from unnest(fam) f);
  delete from core.file_uses where organization_id = p_org and patient_id = any (fam);
  delete from core.stale where organization_id = p_org and patient_id = any (fam);
  delete from core.outbox where organization_id = p_org and patient_id = any (fam);
  -- entries refer to each other: remove those that nothing refers to first, until none is left
  loop
    delete from core.entries e where e.organization_id = p_org and e.patient_id = any (fam)
      and not exists (select 1 from core.entries x where x.organization_id = p_org and (x.refers_to = e.id or x.replaces = e.id));
    get diagnostics c = row_count; n := n + c;
    exit when c = 0;
  end loop;
  delete from core.sets s where s.organization_id = p_org and s.id = any (v_sets) and not exists (select 1 from core.entries e where e.organization_id = p_org and e.set_id = s.id);
  delete from core.read_log where organization_id = p_org and patient_id = any (fam);
  delete from core.patient_identifiers where organization_id = p_org and patient_id = any (fam);
  delete from core.patient_relations where organization_id = p_org and (patient_id = any (fam) or other_id = any (fam));
  delete from core.patient_changes where organization_id = p_org and patient_id = any (fam);
  delete from core.merges where organization_id = p_org and (from_id = any (fam) or into_id = any (fam));
  update core.patients set merged_into = null where organization_id = p_org and id = any (fam);
  delete from core.patients where organization_id = p_org and id = any (fam);
  get diagnostics c = row_count; n := n + c;
  insert into core.erasures (organization_id, user_id, reason, rows_removed) values (p_org, p_user, p_reason, n);
  return jsonb_build_object('erased', true, 'rows', n);
end $$;
alter function core.erase(uuid, uuid, uuid, text) owner to core_eraser;

create function core.redact(p_org uuid, p_user uuid, p_entry uuid, p_reason text, p_moved_to uuid) returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare v_item uuid; v_ids uuid[]; d core.derived; v_patient uuid;
begin
  select e.item, e.patient_id into v_item, v_patient from core.entries e where e.organization_id = p_org and e.id = p_entry;
  if v_item is null then perform core.refuse('not_found', 'entry'); end if;
  select array_agg(e.id) into v_ids from core.entries e where e.organization_id = p_org and e.item = v_item;
  if exists (select 1 from core.entries x where x.organization_id = p_org and x.refers_to = any (v_ids) and x.item <> v_item
               and not exists (select 1 from core.redactions r where r.organization_id = p_org and r.item = x.item)) then
    perform core.refuse('has_references');
  end if;
  update core.entries set data = '{}', codes = '{}', findings = '[]' where organization_id = p_org and item = v_item;
  perform set_config('storage.allow_delete_query', 'true', true);
  delete from storage.objects o where o.bucket_id = 'files' and o.name like p_org || '/%' and split_part(o.name, '/', 3) in (
    select f.sha256 from core.file_uses f where f.organization_id = p_org and f.entry_id = any (v_ids)
     and not exists (select 1 from core.file_uses g where g.organization_id = p_org and g.sha256 = f.sha256 and not (g.entry_id = any (v_ids))));
  delete from core.file_uses where organization_id = p_org and entry_id = any (v_ids);
  insert into core.redactions (organization_id, item, entry_ids, user_id, reason, moved_to) values (p_org, v_item, v_ids, p_user, p_reason, p_moved_to);
  for d in select * from core.derived x order by (x.layer <> 'base'), x.position loop
    perform core.run_refresh(d.refresh, p_org, array[v_item]);
  end loop;
  return jsonb_build_object('redacted', v_item, 'entries', to_jsonb(v_ids));
end $$;
alter function core.redact(uuid, uuid, uuid, text, uuid) owner to core_eraser;

create function public.erase_patient(p jsonb) returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare me core.users := core.me();
begin
  perform core.require_mfa();
  if me.kind <> 'staff' or not core.may(me.id, 'erase:patient', null) then perform core.refuse('not_allowed', 'erase:patient'); end if;
  if length(trim(coalesce(p ->> 'reason', ''))) = 0 then perform core.refuse('reason_missing'); end if;
  if not exists (select 1 from core.patients x where x.organization_id = me.organization_id and x.id = (p ->> 'patient_id')::uuid) then perform core.refuse('not_found', 'patient'); end if;
  return core.erase(me.organization_id, me.id, (p ->> 'patient_id')::uuid, p ->> 'reason');
end $$;

create function public.redact(p jsonb) returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare me core.users := core.me();
begin
  perform core.require_mfa();
  if me.kind <> 'staff' or not core.may(me.id, 'redact:entry', null) then perform core.refuse('not_allowed', 'redact:entry'); end if;
  if coalesce(p ->> 'reason', '') not in ('misfiled', 'wrong_patient', 'duplicate', 'other') then perform core.refuse('reason_missing'); end if;
  return core.redact(me.organization_id, me.id, (p ->> 'entry_id')::uuid, p ->> 'reason', (p ->> 'moved_to')::uuid);
end $$;

-- a redacted item reads as "Removed · <reason>" (§3.11)
create or replace function core.entry_out(e core.entries, p_hidden boolean) returns jsonb language sql stable security definer set search_path = '' as $$
  select case
    when exists (select 1 from core.redactions r where r.organization_id = e.organization_id and r.item = e.item) then
      jsonb_build_object('id', e.id, 'type', e.type, 'type_version', e.type_version, 'item', e.item, 'item_version', e.item_version, 'patient_id', e.patient_id,
        'department_id', e.department_id, 'visit_id', e.visit_id, 'occurred_at', e.occurred_at, 'precision', e.precision, 'recorded_at', e.recorded_at,
        'set_id', e.set_id, 'replaces', e.replaces, 'refers_to', e.refers_to, 'relation', e.relation, 'source', e.source, 'hidden', false, 'redacted', true,
        'line', 'Removed · ' || replace((select r.reason from core.redactions r where r.organization_id = e.organization_id and r.item = e.item limit 1), '_', ' '))
    when p_hidden then
      jsonb_build_object('id', e.id, 'type', e.type, 'type_version', e.type_version, 'item', e.item, 'item_version', e.item_version, 'patient_id', e.patient_id,
        'department_id', e.department_id, 'visit_id', e.visit_id, 'occurred_at', e.occurred_at, 'precision', e.precision, 'recorded_at', e.recorded_at,
        'set_id', e.set_id, 'replaces', e.replaces, 'refers_to', e.refers_to, 'relation', e.relation, 'source', e.source, 'hidden', true,
        'line', 'Private ' || lower(coalesce((select t.labels ->> 'en' from core.types t where t.key = e.type and t.version = e.type_version), e.type)))
    else (to_jsonb(e) - 'organization_id') || jsonb_build_object('hidden', false, 'line', core.line_of(e))
  end
$$;

revoke create on schema core from core_eraser;

-- ── privileges: the eraser deletes and redacts; the base reads the core stores; the API reaches only the doors ──
grant usage on schema core to core_eraser, base_role;
grant usage on schema extensions to core_eraser, base_role;
grant select, delete on core.entries, core.sets, core.patients, core.patient_identifiers, core.patient_relations, core.patient_changes, core.merges,
  core.read_log, core.file_uses, core.stale, core.outbox, core.redactions to core_eraser;
grant update on core.entries, core.patients to core_eraser;
grant select on core.derived, core.types, core.layers, core.systems, core.codes, core.users, core.departments to core_eraser;
grant insert on core.erasures, core.redactions to core_eraser;
grant usage on schema storage to core_eraser;
grant select, delete on storage.objects to core_eraser;
grant select on core.entries, core.types, core.layers, core.settings, core.setting_keys, core.codes, core.systems, core.users, core.holdings, core.holding_ends,
  core.roles, core.role_actions, core.actions, core.departments, core.places, core.sites, core.patients, core.organizations, core.redactions, core.canon,
  core.screens, core.scores to base_role;

revoke all on all functions in schema core from public, anon, authenticated;
revoke all on all functions in schema public from public, anon;
alter default privileges in schema core revoke execute on functions from public;
alter default privileges in schema public revoke execute on functions from public;
grant execute on function core.may_listen(text) to authenticated;
grant execute on function public.write(jsonb), public.read(jsonb), public.choose_user(uuid), public.create_organization(uuid, text, uuid, text),
  public.save(text, jsonb), public.remove(text, uuid), public.save_patient(jsonb), public.merge_patients(jsonb), public.write_setting(jsonb),
  public.setup(jsonb), public.erase_patient(jsonb), public.redact(jsonb) to authenticated;
-- the base and the packs call these core helpers from their own definer functions
grant execute on function core.may(uuid, text, uuid), core.may_somewhere(uuid, text), core.setting_at(uuid, text, uuid, timestamptz),
  core.settings_at(uuid, text, timestamptz), core.survivor(uuid, uuid), core.family(uuid, uuid), core.uuid5(uuid, text), core.uuid7(),
  core.kinds(text), core.base_of(text), core.type_latest(text), core.holders_in(uuid, text, uuid), core.live_holdings(uuid), core.hint(text),
  core.refuse(text, text), core.fold(text), core.packs_used(uuid, timestamptz), core.layer_on(uuid, text), core.department_uses(uuid, uuid, text),
  core.codings(jsonb), core.nodes(jsonb),
  core.next_number(uuid, text, text, date), core.role_actions_of(uuid, uuid), core.score(text, text, jsonb) to base_role, core_eraser;
grant execute on function core.run_refresh(regprocedure, uuid, uuid[]) to core_eraser;   -- a redact refreshes what it touched
grant execute on function core.pack_hidden(uuid, uuid[]) to base_role;   -- the base's identity door for packs is masked like the core's
