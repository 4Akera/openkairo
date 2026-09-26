-- 0012 · organization functions (spec 02): save_/retire_, read_organization, create_organization, invitations
create or replace function core.record_settings_change(p_org uuid, p_user uuid, p_table text, p_row uuid, p_changes jsonb, p_change_id uuid default null) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v uuid := coalesce(p_change_id, pg_catalog.gen_random_uuid());
begin
  insert into core.settings_changes (id, organization_id, user_id, table_name, row_id, changes) values (v, p_org, p_user, p_table, p_row, p_changes);
  return v;
end $$;

create or replace function core.require_fresh(p_table text, p_row uuid, p_seen uuid) returns void
language plpgsql stable security definer set search_path = '' as $$
begin
  if p_seen is null then return; end if;
  if exists (select 1 from core.settings_changes c where c.table_name = p_table and c.row_id = p_row
             and c.recorded_at > (select recorded_at from core.settings_changes where id = p_seen)) then
    perform core.refuse('changed_since_read');
  end if;
end $$;

-- ── departments ──
create or replace function public.save_department(id uuid, organization_id uuid, type text, name text, site_name text default null, is_outside boolean default false,
  contact_text text default null, serves uuid[] default null, seen_change_id uuid default null)
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
  insert into core.departments (id, organization_id, type, name, site_name, is_outside, contact_text)
  values (id, organization_id, type, trim(name), nullif(trim(coalesce(site_name,'')),''), is_outside, contact_text)
  on conflict on constraint departments_pkey do update set name = excluded.name, site_name = excluded.site_name, is_outside = excluded.is_outside, contact_text = excluded.contact_text
  returning * into d;
  if serves is not null then
    delete from core.served_departments where department_id = d.id;
    insert into core.served_departments (department_id, served_department_id) select d.id, x from pg_catalog.unnest(serves) x;
  end if;
  perform core.record_settings_change(organization_id, u, 'departments', d.id, pg_catalog.jsonb_build_object('type', type, 'name', d.name, 'site_name', d.site_name, 'serves', pg_catalog.to_jsonb(serves)));
  return d;
end $$;

create or replace function public.retire_department(id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare u uuid; d core.departments;
begin
  select * into d from core.departments where departments.id = retire_department.id; if not found then perform core.refuse('not_found'); end if;
  u := core.require_access(d.organization_id, 'manage:departments', null, null);
  if exists (select 1 from core.requests r where r.to_department_id = d.id and r.status = 'open') then perform core.refuse('department_has_open_requests'); end if;
  if exists (select 1 from core.requests r where r.from_department_id = d.id and r.review_needed_at is not null) then perform core.refuse('department_has_unreviewed_results'); end if;
  if exists (select 1 from core.visits v where v.department_id = d.id and v.ended_at is null) then perform core.refuse('department_has_open_visits'); end if;
  update core.departments set retired_at = pg_catalog.now() where departments.id = d.id;
  update core.services set retired_at = pg_catalog.now() where department_id = d.id and retired_at is null;
  delete from core.user_roles where department_id = d.id;
  delete from core.served_departments where department_id = d.id or served_department_id = d.id;
  perform core.record_settings_change(d.organization_id, u, 'departments', d.id, '{"retired": true}');
end $$;

-- ── services ──
create or replace function public.save_service(id uuid, organization_id uuid, department_id uuid, code text, name text, reply_type text default 'result',
  section_name text default null, fields jsonb default '[]', seen_change_id uuid default null)
returns core.services language plpgsql security definer set search_path = '' as $$
declare u uuid; s core.services; f jsonb; i int := 0;
begin
  u := core.require_access(organization_id, 'manage:services', null, null);
  perform core.require_fresh('services', id, seen_change_id);
  if reply_type = 'result' and pg_catalog.jsonb_array_length(coalesce(fields, '[]')) = 0 then perform core.refuse('fields_missing', 'a result needs at least one field'); end if;
  for f in select * from pg_catalog.jsonb_array_elements(coalesce(fields, '[]')) loop
    if not exists (select 1 from core.codes c where c.code = f->>'code' and (c.organization_id is null or c.organization_id = save_service.organization_id)) then perform core.refuse('unknown_code', f->>'code'); end if;
  end loop;
  insert into core.services (id, organization_id, department_id, section_name, code, name, reply_type)
  values (id, organization_id, department_id, section_name, code, trim(name), reply_type)
  on conflict on constraint services_pkey do update set department_id = excluded.department_id, section_name = excluded.section_name, code = excluded.code, name = excluded.name, reply_type = excluded.reply_type
  returning * into s;
  delete from core.service_fields where service_id = s.id;
  for f in select * from pg_catalog.jsonb_array_elements(coalesce(fields, '[]')) loop
    i := i + 1;
    insert into core.service_fields (service_id, position, code, name, kind, unit, choices, reference_low, reference_high, critical_low, critical_high)
    values (s.id, i, f->>'code', f->>'name', coalesce(f->>'kind', 'number'), f->>'unit',
      (select pg_catalog.array_agg(x) from pg_catalog.jsonb_array_elements_text(coalesce(f->'choices', '[]')) x),
      (f->>'reference_low')::numeric, (f->>'reference_high')::numeric, (f->>'critical_low')::numeric, (f->>'critical_high')::numeric);
  end loop;
  perform core.record_settings_change(organization_id, u, 'services', s.id, pg_catalog.jsonb_build_object('name', s.name, 'code', s.code, 'department_id', s.department_id, 'fields', i));
  return s;
end $$;

create or replace function public.retire_service(id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare u uuid; s core.services;
begin
  select * into s from core.services where services.id = retire_service.id; if not found then perform core.refuse('not_found'); end if;
  u := core.require_access(s.organization_id, 'manage:services', null, null);
  update core.services set retired_at = pg_catalog.now() where services.id = s.id;
  perform core.record_settings_change(s.organization_id, u, 'services', s.id, '{"retired": true}');
end $$;

-- ── people ──
create or replace function public.save_user(id uuid, organization_id uuid, kind core.user_kind, name text, title text default null,
  roles jsonb default null, departments uuid[] default null, retired_at timestamptz default null, seen_change_id uuid default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare u uuid; x core.users; r jsonb; n_open int := 0; n_review int := 0;
begin
  u := core.require_access(organization_id, 'manage:users', null, null);
  if id = u then perform core.refuse('self_change'); end if;
  perform core.require_fresh('users', id, seen_change_id);
  if kind not in ('staff','machine','importer') and roles is not null and pg_catalog.jsonb_array_length(roles) > 0 then perform core.refuse('roles_not_allowed', kind::text); end if;
  insert into core.users (id, organization_id, kind, name, title, invited_at, retired_at) values (id, organization_id, kind, trim(name), title, case when kind = 'staff' then pg_catalog.now() end, retired_at)
  on conflict on constraint users_pkey do update set name = excluded.name, title = excluded.title, retired_at = excluded.retired_at returning * into x;
  if roles is not null then
    -- nobody grants what they do not hold, in a scope no wider than their own
    for r in select * from pg_catalog.jsonb_array_elements(roles) loop
      if exists (select 1 from core.role_actions ra where ra.role_id = (r->>'role_id')::uuid and ra.action like 'manage:%'
                 and not exists (select 1 from core.user_roles ur join core.role_actions ra2 on ra2.role_id = ur.role_id and ra2.action = ra.action
                                 where ur.user_id = u and (ur.department_id is null or ur.department_id = (r->>'department_id')::uuid))) then
        perform core.refuse('cannot_grant', r->>'role_id');
      end if;
    end loop;
    delete from core.user_roles where user_id = x.id;
    insert into core.user_roles (organization_id, user_id, role_id, department_id)
      select organization_id, x.id, (rr->>'role_id')::uuid, (rr->>'department_id')::uuid from pg_catalog.jsonb_array_elements(roles) rr;
  end if;
  if retired_at is not null then
    perform core.require_last_administrator(organization_id);
    select count(*) into n_open from core.requests where assignee_id = x.id and status = 'open';
    select count(*) into n_review from core.requests where requester_id = x.id and review_needed_at is not null;
  end if;
  perform core.record_settings_change(organization_id, u, 'users', x.id, pg_catalog.jsonb_build_object('name', x.name, 'kind', x.kind, 'roles', roles, 'retired_at', retired_at));
  return pg_catalog.to_jsonb(x) || pg_catalog.jsonb_build_object('open_assigned', n_open, 'to_review', n_review);
end $$;

create or replace function core.require_last_administrator(p_org uuid) returns void
language plpgsql stable security definer set search_path = '' as $$
begin
  if not exists (
    select 1 from core.users x join core.user_roles ur on ur.user_id = x.id and ur.department_id is null
    join core.role_actions a1 on a1.role_id = ur.role_id and a1.action = 'manage:users'
    join core.role_actions a2 on a2.role_id = ur.role_id and a2.action = 'manage:roles'
    where x.organization_id = p_org and x.login_id is not null and (x.retired_at is null or x.retired_at > pg_catalog.now())) then
    perform core.refuse('last_administrator');
  end if;
end $$;

-- ── templates, packs ──
create or replace function public.save_template(id uuid, organization_id uuid, name text, items jsonb, department_id uuid default null, seen_change_id uuid default null)
returns core.templates language plpgsql security definer set search_path = '' as $$
declare u uuid; t core.templates;
begin
  u := core.require_access(organization_id, 'manage:templates', null, null);
  perform core.require_fresh('templates', id, seen_change_id);
  insert into core.templates (id, organization_id, department_id, name, items) values (id, organization_id, department_id, trim(name), items)
  on conflict on constraint templates_pkey do update set name = excluded.name, items = excluded.items, department_id = excluded.department_id returning * into t;
  perform core.record_settings_change(organization_id, u, 'templates', t.id, pg_catalog.jsonb_build_object('name', t.name, 'items', pg_catalog.jsonb_array_length(items)));
  return t;
end $$;

create or replace function public.retire_template(id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare u uuid; t core.templates;
begin
  select * into t from core.templates where templates.id = retire_template.id; if not found then perform core.refuse('not_found'); end if;
  u := core.require_access(t.organization_id, 'manage:templates', null, null);
  update core.templates set retired_at = pg_catalog.now() where templates.id = t.id;
  perform core.record_settings_change(t.organization_id, u, 'templates', t.id, '{"retired": true}');
end $$;

create or replace function public.save_organization_pack(organization_id uuid, pack text) returns void
language plpgsql security definer set search_path = '' as $$
declare u uuid; pu uuid;
begin
  u := core.require_access(organization_id, 'manage:organization', null, null);
  if not exists (select 1 from core.packs where key = pack) then perform core.refuse('unknown_pack', pack); end if;
  insert into core.organization_packs (organization_id, pack) values (organization_id, pack) on conflict (organization_id, pack) do update set retired_at = null;
  -- the pack's own user, holding its role
  select id into pu from core.users where users.organization_id = save_organization_pack.organization_id and kind = 'pack' and name = pack;
  if pu is null then
    pu := pg_catalog.gen_random_uuid();
    insert into core.users (id, organization_id, kind, name) values (pu, organization_id, 'pack', pack);
    insert into core.user_roles (organization_id, user_id, role_id) select organization_id, pu, r.id from core.roles r where r.organization_id is null and r.key = 'pack:' || pack;
  else update core.users set retired_at = null where id = pu; end if;
  perform core.record_settings_change(organization_id, u, 'organization_packs', pu, pg_catalog.jsonb_build_object('pack', pack, 'enabled', true));
end $$;

create or replace function public.retire_organization_pack(organization_id uuid, pack text) returns void
language plpgsql security definer set search_path = '' as $$
declare u uuid; pu uuid; r core.requests;
begin
  u := core.require_access(organization_id, 'manage:organization', null, null);
  update core.organization_packs set retired_at = pg_catalog.now() where organization_packs.organization_id = retire_organization_pack.organization_id and organization_packs.pack = retire_organization_pack.pack;
  delete from core.pack_calls where pack_calls.organization_id = retire_organization_pack.organization_id and pack_calls.pack = retire_organization_pack.pack;
  select id into pu from core.users where users.organization_id = retire_organization_pack.organization_id and kind = 'pack' and name = pack;
  if pu is not null then
    update core.users set retired_at = pg_catalog.now() where id = pu;
    -- release every hold this pack placed
    for r in select rq.* from core.requests rq where rq.step = 'held' and rq.organization_id = retire_organization_pack.organization_id
             and (select actor_id from core.request_steps s where s.request_id = rq.entry_id and s.step = 'held' order by position desc limit 1) = pu loop
      perform core.change_request(r.entry_id, 'held', 'sent', u, 'pack ' || pack || ' switched off');
    end loop;
  end if;
  perform core.record_settings_change(organization_id, u, 'organization_packs', coalesce(pu, organization_id), pg_catalog.jsonb_build_object('pack', pack, 'enabled', false));
end $$;

-- ── reads ──
create or replace function public.read_organization(organization_id uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare u uuid;
begin
  u := core.require_access(organization_id, 'read:organization', null, null);
  return pg_catalog.jsonb_build_object(
    'organization', (select pg_catalog.to_jsonb(o) from core.organizations o where o.id = organization_id),
    'me', (select pg_catalog.jsonb_build_object('id', x.id, 'name', x.name, 'kind', x.kind,
             'departments', coalesce((select pg_catalog.jsonb_agg(distinct pg_catalog.jsonb_build_object('id', d.id, 'name', d.name, 'type', d.type, 'is_visited', t.is_visited, 'site_name', d.site_name))
               from core.user_roles ur join core.departments d on (d.id = ur.department_id or (ur.department_id is null and d.organization_id = ur.organization_id and not d.is_outside))
               join core.department_types t on t.key = d.type where ur.user_id = x.id and d.retired_at is null), '[]'),
             'actions', coalesce((select pg_catalog.jsonb_agg(distinct ra.action) from core.user_roles ur join core.role_actions ra on ra.role_id = ur.role_id where ur.user_id = x.id), '[]'))
           from core.users x where x.id = u),
    'departments', coalesce((select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('id', d.id, 'name', d.name, 'type', d.type, 'is_visited', t.is_visited, 'is_outside', d.is_outside, 'site_name', d.site_name,
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

create or replace function public.read_settings_changes(organization_id uuid, table_name text default null, row_id uuid default null, "limit" int default 100) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  perform core.require_access(organization_id, 'read:settings_changes', null, null);
  return coalesce((select pg_catalog.jsonb_agg(pg_catalog.to_jsonb(c) || pg_catalog.jsonb_build_object('user_name', (select name from core.users where id = c.user_id)) order by c.recorded_at desc)
    from (select * from core.settings_changes c where c.organization_id = read_settings_changes.organization_id
          and (read_settings_changes.table_name is null or c.table_name = read_settings_changes.table_name) and (read_settings_changes.row_id is null or c.row_id = read_settings_changes.row_id)
          order by c.recorded_at desc limit least("limit", 500)) c), '[]');
end $$;

-- ── birth and invitations: service_role only (the edge function) ──
create or replace function public.create_organization(id uuid, name text, owner_id uuid, owner_name text, owner_login_id uuid) returns core.organizations
language plpgsql security definer set search_path = '' as $$
declare o core.organizations;
begin
  insert into core.organizations (id, name) values (id, trim(name)) returning * into o;
  insert into core.record_numbers (organization_id) values (o.id);
  insert into core.users (id, organization_id, kind, name, login_id, invited_at, accepted_at) values (owner_id, o.id, 'staff', owner_name, owner_login_id, pg_catalog.now(), pg_catalog.now());
  insert into core.user_roles (organization_id, user_id, role_id) values (o.id, owner_id, '00000000-0000-0000-0000-00000000c001');
  insert into core.settings_changes (id, organization_id, user_id, table_name, row_id, changes) values (pg_catalog.gen_random_uuid(), o.id, owner_id, 'organizations', o.id, '{"created": true}');
  return o;
end $$;

create or replace function public.link_login(user_id uuid, login_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare x core.users;
begin
  select * into x from core.users where id = user_id for update; if not found then perform core.refuse('not_found'); end if;
  if x.login_id is not null then perform core.refuse('already_linked'); end if;
  if x.invited_at is null or x.invited_at < pg_catalog.now() - interval '1 hour' then perform core.refuse('invitation_expired'); end if;
  update core.users set login_id = link_login.login_id, accepted_at = pg_catalog.now() where id = user_id;
end $$;

revoke all on function public.create_organization(uuid, text, uuid, text, uuid), public.link_login(uuid, uuid) from public, authenticated, anon;
grant execute on function public.create_organization(uuid, text, uuid, text, uuid), public.link_login(uuid, uuid) to service_role;
do $$ declare f record; begin
  for f in select p.oid::regprocedure as sig from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public'
           and (p.proname like 'save\_%' or p.proname like 'retire\_%' or p.proname in ('read_organization','read_settings_changes')) loop
    execute pg_catalog.format('grant execute on function %s to authenticated', f.sig);
  end loop;
end $$;
