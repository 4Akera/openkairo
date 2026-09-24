-- 0035 · fixes from the review of 0032–0034: roles cannot orphan the organization or cross into another one, a private
--   department's own staff see their queue, the review list is read only by those who review, live signals carry nothing,
--   and "was" never quotes the same request's preliminary value


create or replace function core.signal(p_topic text, p_payload jsonb) returns void
language plpgsql security definer set search_path = '' as $$
begin
  begin
    perform realtime.send('{}'::jsonb, 'change', p_topic, true);   -- a hint only: an id on a queue channel would link a private visit to its department
  exception when others then null;
  end;
end $$;

create or replace function core.require_last_administrator(p_org uuid) returns void
language plpgsql stable security definer set search_path = '' as $$
begin
  if not exists (
    select 1 from core.users x join core.user_roles ur on ur.user_id = x.id and ur.department_id is null
    join core.roles r on r.id = ur.role_id and r.retired_at is null
    join core.role_actions ra on ra.role_id = ur.role_id and ra.action in ('manage:users', 'manage:roles')
    where x.organization_id = p_org and x.login_id is not null and (x.retired_at is null or x.retired_at > pg_catalog.now())
    group by x.id having count(distinct ra.action) = 2) then
    perform core.refuse('last_administrator');
  end if;
end $$;

create or replace function public.save_user(id uuid, organization_id uuid, kind core.user_kind, name text, title text default null,
  roles jsonb default null, departments uuid[] default null, retired_at timestamptz default null, seen_change_id uuid default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare u uuid; x core.users; r jsonb; n_open int := 0; n_review int := 0;
begin
  u := core.require_access(organization_id, 'manage:users', null, null);
  if id = u then perform core.refuse('self_change'); end if;
  perform 1 from core.organizations o where o.id = save_user.organization_id for update;                            -- the organization lock (spec 02)
  perform core.require_fresh('users', id, seen_change_id);
  if kind not in ('staff','machine','importer') and roles is not null and pg_catalog.jsonb_array_length(roles) > 0 then perform core.refuse('roles_not_allowed', kind::text); end if;
  insert into core.users (id, organization_id, kind, name, title, invited_at, retired_at) values (id, organization_id, kind, trim(name), title, case when kind = 'staff' then pg_catalog.now() end, retired_at)
  on conflict on constraint users_pkey do update set name = excluded.name, title = excluded.title, retired_at = excluded.retired_at returning * into x;
  if roles is not null then
    -- nobody grants what they do not hold, in a scope no wider than their own
    for r in select * from pg_catalog.jsonb_array_elements(roles) loop
      -- a role of this organization or a built-in one, and live
      if not exists (select 1 from core.roles ro where ro.id = (r->>'role_id')::uuid and ro.retired_at is null
                     and (ro.organization_id is null or ro.organization_id = save_user.organization_id)) then
        perform core.refuse('not_found', 'role');
      end if;
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
  if roles is not null or retired_at is not null then perform core.require_last_administrator(organization_id); end if;
  if retired_at is not null then
    select count(*) into n_open from core.requests where assignee_id = x.id and status = 'open';
    select count(*) into n_review from core.requests where requester_id = x.id and review_needed_at is not null;
  end if;
  perform core.record_settings_change(organization_id, u, 'users', x.id, pg_catalog.jsonb_build_object('name', x.name, 'kind', x.kind, 'roles', roles, 'retired_at', retired_at));
  return pg_catalog.to_jsonb(x) || pg_catalog.jsonb_build_object('open_assigned', n_open, 'to_review', n_review);
end $$;

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
  select a into bad from pg_catalog.unnest(acts) a where not exists (select 1 from core.actions ca where ca.key = a) limit 1;
  if bad is not null then perform core.refuse('unknown_action', bad); end if;
  select a into bad from pg_catalog.unnest(acts) a join core.actions ca on ca.key = a
    where ca.pack is not null and not exists (select 1 from core.organization_packs op where op.organization_id = save_role.organization_id and op.pack = ca.pack and op.retired_at is null) limit 1;
  if bad is not null then perform core.refuse('pack_off', bad); end if;
  -- nobody grants what they do not hold: a manage: action only from someone holding it everywhere
  select a into bad from pg_catalog.unnest(acts) a where a like 'manage:%'
    and not exists (select 1 from core.role_actions had where had.role_id = save_role.id and had.action = a)            -- only what is added
    and not exists (
    select 1 from core.user_roles ur join core.role_actions ra on ra.role_id = ur.role_id and ra.action = a where ur.user_id = u and ur.department_id is null) limit 1;
  if bad is not null then perform core.refuse('cannot_grant', bad); end if;
  perform 1 from core.organizations o where o.id = save_role.organization_id for update;                           -- the organization lock
  perform core.require_fresh('roles', save_role.id, seen_change_id);
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

create or replace function public.retire_role(id uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare u uuid; x core.roles; n int; gone jsonb;
begin
  select * into x from core.roles r where r.id = retire_role.id;
  if x.id is null then perform core.refuse('not_found', 'role'); end if;
  if x.organization_id is null then perform core.refuse('builtin_role'); end if;
  u := core.require_access(x.organization_id, 'manage:roles', null, null);
  if x.retired_at is not null then return pg_catalog.to_jsonb(x) || '{"unassigned": 0}'::jsonb; end if;
  if exists (select 1 from core.user_roles ur where ur.user_id = u and ur.role_id = x.id) then perform core.refuse('self_change'); end if;
  perform 1 from core.organizations o where o.id = x.organization_id for update;
  update core.roles r set retired_at = pg_catalog.now() where r.id = x.id returning * into x;
  with d as (delete from core.user_roles ur where ur.role_id = x.id and ur.organization_id = x.organization_id returning ur.user_id, ur.department_id)   -- whoever held it no longer does
  select count(*), coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('user_id', d.user_id, 'department_id', d.department_id)), '[]') into n, gone from d;
  perform core.require_last_administrator(x.organization_id);
  perform core.record_settings_change(x.organization_id, u, 'roles', x.id, pg_catalog.jsonb_build_object('name', x.name, 'retired_at', x.retired_at, 'unassigned', gone));
  return pg_catalog.to_jsonb(x) || pg_catalog.jsonb_build_object('unassigned', n);
end $$;

create or replace function public.read_to_review(department_id uuid default null) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare u uuid; org uuid;
begin
  if department_id is not null then
    select organization_id into org from core.departments where id = department_id;
    u := core.require_access(org, 'mark:reviewed', null, department_id);   -- not read:queue: serving departments would read Psychiatry's list
  else
    -- mine: any organization I belong to; find it from the login
    select organization_id, id into org, u from core.users where login_id = core.auth_uid() and retired_at is null limit 1;
    if u is null then perform core.refuse('not_a_member'); end if;
    perform core.require_access(org, 'mark:reviewed', null, null);
  end if;
  return coalesce((select pg_catalog.jsonb_agg(core.entry_card(e, core.hidden_for(u, e.patient_id)) || pg_catalog.jsonb_build_object(
        'patient', pg_catalog.jsonb_build_object('id', p.id, 'record_number', p.record_number, 'given_name', p.given_name, 'family_name', p.family_name),
        'service_name', e.data->'service'->>'name',
        -- up to three numbers of the latest reply, the most flagged first, each with the patient's value before it
        'compare', coalesce((select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('name', coalesce(k.name, v.code), 'value', v.value_number, 'unit', v.unit, 'flag', v.flag,
            'previous', pv.value_number, 'previous_at', pv.occurred_at) order by v.rank)
          from (select v0.*, row_number() over (order by (v0.flag = 'critical') desc, (v0.flag in ('high', 'low', 'abnormal')) desc, v0.position) as rank
                from core.entry_values v0
                where v0.value_number is not null and v0.entry_id = (select x.id from core.entries x where x.reply_to_id = r.entry_id and x.replaced_by_id is null
                        and x.type <> 'entered_in_error' and not core.note_hidden(x, core.hidden_for(u, x.patient_id)) order by x.recorded_at desc limit 1)) v
          left join core.codes k on k.code = v.code
          left join lateral (select y.value_number, y.occurred_at from core.entry_values y join core.entries ye on ye.id = y.entry_id
              where y.patient_id = v.patient_id and y.code = v.code and y.occurred_at < v.occurred_at and y.value_number is not null and ye.replaced_by_id is null
                and ye.reply_to_id is distinct from r.entry_id
                and not core.note_hidden(ye, core.hidden_for(u, v.patient_id)) order by y.occurred_at desc limit 1) pv on true
          where v.rank <= 3), '[]')) order by (r.reply_flag = 'critical') desc, r.review_needed_at)
    from core.requests r join core.entries e on e.id = r.entry_id join core.patients p on p.id = e.patient_id
    where r.review_needed_at is not null and ((read_to_review.department_id is null and r.requester_id = u) or (read_to_review.department_id is not null and r.from_department_id = read_to_review.department_id))), '[]');
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
             'assignee_name', (select name from core.users where id = v.assignee_id), 'arrived_at', v.arrived_at, 'present_at', v.present_at, 'seen_at', v.seen_at,
             'request_id', v.request_id, 'request_open', exists (select 1 from core.requests r where r.entry_id = v.request_id and r.status = 'open'),
             'requests', coalesce((select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('request_id', r.entry_id, 'service_name', e.data->'service'->>'name', 'to_department_name', e.data->>'to_department_name', 'step', r.step, 'is_holding', r.status = 'open'))
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
