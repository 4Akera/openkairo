-- 03 · core: the public API (schema public), one definition each, by name. Each starts with its gate (core.require_access).

set check_function_bodies = false;
select pg_catalog.set_config('search_path', '', false);
set client_min_messages = warning;

-- ── birth and invitations: service_role only (the edge function) ──
CREATE FUNCTION public.create_organization(id uuid, name text, owner_id uuid, owner_name text, owner_login_id uuid) RETURNS core.organizations
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare o core.organizations;
begin
  insert into core.organizations (id, name) values (id, trim(name)) returning * into o;
  insert into core.record_numbers (organization_id) values (o.id);
  insert into core.users (id, organization_id, kind, name, login_id, invited_at, accepted_at) values (owner_id, o.id, 'staff', owner_name, owner_login_id, pg_catalog.now(), pg_catalog.now());
  insert into core.user_roles (organization_id, user_id, role_id) values (o.id, owner_id, '00000000-0000-0000-0000-00000000c001');
  insert into core.settings_changes (id, organization_id, user_id, table_name, row_id, changes) values (pg_catalog.gen_random_uuid(), o.id, owner_id, 'organizations', o.id, '{"created": true}');
  return o;
end $$;


ALTER FUNCTION public.create_organization(id uuid, name text, owner_id uuid, owner_name text, owner_login_id uuid) OWNER TO postgres;

CREATE FUNCTION public.delete_department(id uuid) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
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


ALTER FUNCTION public.delete_department(id uuid) OWNER TO postgres;

CREATE FUNCTION public.delete_role(id uuid) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
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


ALTER FUNCTION public.delete_role(id uuid) OWNER TO postgres;

CREATE FUNCTION public.delete_service(id uuid) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
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


ALTER FUNCTION public.delete_service(id uuid) OWNER TO postgres;

-- a preset is a shortcut: the record never points at one, so it can always go
CREATE FUNCTION public.delete_template(id uuid) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare u uuid; x core.templates;
begin
  select * into x from core.templates t where t.id = delete_template.id; if x.id is null then perform core.refuse('not_found', 'preset'); end if;
  u := core.require_access(x.organization_id, 'manage:templates', null, null);
  delete from core.templates t where t.id = x.id;
  perform core.record_settings_change(x.organization_id, u, 'templates', x.id, pg_catalog.jsonb_build_object('deleted', true, 'name', x.name));
  return pg_catalog.jsonb_build_object('deleted', x.id);
end $$;


ALTER FUNCTION public.delete_template(id uuid) OWNER TO postgres;

-- a person who never signed in wrote nothing: their roles go with them. Anyone who signed in is retired, never deleted.
CREATE FUNCTION public.delete_user(id uuid) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
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


ALTER FUNCTION public.delete_user(id uuid) OWNER TO postgres;

-- ── erasing a patient: private-note rows go too, and replies go before the requests they answer (both failed before)
CREATE FUNCTION public.erase_patient(patient_id uuid, reason text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare ids uuid[]; sv uuid;
begin
  if coalesce(reason, '') = '' then perform core.refuse('reason_missing'); end if;
  sv := core.survivor(patient_id);
  select pg_catalog.array_agg(id) into ids from core.patients where id = sv or merged_into_id = sv;
  perform pg_catalog.set_config('opencare.erasing', 'true', true);
  delete from core.drafts where drafts.patient_id = any(ids);
  delete from core.entry_values where entry_values.patient_id = any(ids);
  delete from core.entry_files f using core.entries e where f.entry_id = e.id and e.patient_id = any(ids);
  delete from core.pack_calls pc using core.entries e where pc.entry_id = e.id and e.patient_id = any(ids);
  delete from core.note_privacy np where np.patient_id = any(ids) or np.entry_id in (select e.id from core.entries e where e.patient_id = any(ids));
  -- replies point at their requests: they go before the requests, and the requests before the rest of the entries
  delete from core.entries where entries.patient_id = any(ids) and entries.reply_to_id is not null;
  delete from core.request_steps s using core.entries e where s.request_id = e.id and e.patient_id = any(ids);
  delete from core.requests where requests.patient_id = any(ids);
  delete from core.patient_medications where patient_medications.patient_id = any(ids);
  delete from core.patient_problems where patient_problems.patient_id = any(ids);
  delete from core.patient_allergies where patient_allergies.patient_id = any(ids);
  delete from core.patient_list_reviews where patient_list_reviews.patient_id = any(ids);
  delete from core.record_reads where record_reads.patient_id = any(ids);
  delete from core.entries where entries.patient_id = any(ids);
  delete from core.patient_changes where patient_changes.patient_id = any(ids);
  delete from core.visit_steps s using core.visits v where s.visit_id = v.id and v.patient_id = any(ids);
  delete from core.visits where visits.patient_id = any(ids);
  delete from core.patient_identifiers where patient_identifiers.patient_id = any(ids);
  delete from core.patients where id = any(ids);
  insert into core.erasures (patient_id, reason, actor_id) values (sv, reason, coalesce(core.auth_uid(), '00000000-0000-0000-0000-000000000000'));
end $$;


ALTER FUNCTION public.erase_patient(patient_id uuid, reason text) OWNER TO postgres;

CREATE FUNCTION public.link_login(user_id uuid, login_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare x core.users;
begin
  select * into x from core.users where id = user_id for update; if not found then perform core.refuse('not_found'); end if;
  if x.login_id is not null then perform core.refuse('already_linked'); end if;
  if x.invited_at is null or x.invited_at < pg_catalog.now() - interval '1 hour' then perform core.refuse('invitation_expired'); end if;
  update core.users set login_id = link_login.login_id, accepted_at = pg_catalog.now() where id = user_id;
end $$;


ALTER FUNCTION public.link_login(user_id uuid, login_id uuid) OWNER TO postgres;

-- ── make a note private or not private: its author, or anyone who works in its department; every version, one row for the chain
CREATE FUNCTION public.mark_note_private(entry_id uuid, is_private boolean, reason text DEFAULT NULL::text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare e core.entries; u uuid; k core.user_kind; root uuid;
begin
  select * into e from core.entries where id = mark_note_private.entry_id; if not found then perform core.refuse('not_found'); end if;
  u := core.require_access(e.organization_id, 'read:record', e.patient_id, null);
  select kind into k from core.users where id = u;
  if k is distinct from 'staff' then perform core.refuse('not_allowed', 'staff only'); end if;
  root := core.root_of(e.id);
  select * into e from core.entries x where x.id = root;
  if not core.is_note(e.type) then perform core.refuse('not_a_note'); end if;
  if not (u = e.author_id or exists (select 1 from core.chain_of(root) c where c.author_id = u and core.is_note(c.type)) or core.works_in(u, e.department_id)) then
    perform core.refuse('not_allowed', 'its author or its department');
  end if;
  if not is_private and nullif(trim(coalesce(reason, '')), '') is null then perform core.refuse('reason_missing'); end if;
  if core.note_private(e) = is_private then return pg_catalog.jsonb_build_object('entry_id', root, 'is_private', is_private); end if;
  insert into core.note_privacy (organization_id, entry_id, patient_id, department_id, is_private, reason_text, changed_by)
  values (e.organization_id, root, e.patient_id, e.department_id, is_private, nullif(trim(coalesce(reason, '')), ''), u);
  perform core.signal('record:' || core.survivor(e.patient_id)::text, '{}'::jsonb);
  return pg_catalog.jsonb_build_object('entry_id', root, 'is_private', is_private);
end $$;


ALTER FUNCTION public.mark_note_private(entry_id uuid, is_private boolean, reason text) OWNER TO postgres;

CREATE FUNCTION public.mark_present(visit_id uuid, is_present boolean) RETURNS core.visits
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare v core.visits; u uuid;
begin
  select * into v from core.visits where id = visit_id for update; if not found then perform core.refuse('not_found'); end if;
  u := core.require_access(v.organization_id, 'write:visit', v.patient_id, v.department_id);
  if v.ended_at is not null then perform core.refuse('visit_ended'); end if;
  if is_present = (v.present_at is not null) then return v; end if;
  update core.visits set present_at = case when is_present then pg_catalog.clock_timestamp() end where id = visit_id returning * into v;
  perform core.change_visit(v, v.status, u, null, pg_catalog.jsonb_build_object('present_at', v.present_at));
  if not is_present then perform core.flag_unseen(v.id); end if;
  return v;
end $$;


ALTER FUNCTION public.mark_present(visit_id uuid, is_present boolean) OWNER TO postgres;

CREATE FUNCTION public.mark_reviewed(request_ids uuid[]) RETURNS integer
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare r core.requests; u uuid; n int := 0;
begin
  for r in select * from core.requests where entry_id = any(request_ids) and review_needed_at is not null loop
    u := core.require_access(r.organization_id, 'mark:reviewed', r.patient_id, r.from_department_id);
    perform pg_catalog.set_config('opencare.in_change_request', 'true', true);
    update core.requests set review_needed_at = null where entry_id = r.entry_id;
    perform pg_catalog.set_config('opencare.in_change_request', 'false', true);
    insert into core.request_steps (organization_id, request_id, position, step, actor_id, changes, occurred_at)
    values (r.organization_id, r.entry_id, core.next_step_position(r.entry_id), r.step, u, '{"reviewed": true}', pg_catalog.clock_timestamp());
    n := n + 1;
  end loop;
  return n;
end $$;


ALTER FUNCTION public.mark_reviewed(request_ids uuid[]) OWNER TO postgres;

CREATE FUNCTION public.mark_routing(request_id uuid, assignee_id uuid DEFAULT NULL::uuid, to_department_id uuid DEFAULT NULL::uuid, priority core.request_priority DEFAULT NULL::core.request_priority, due_at timestamp with time zone DEFAULT NULL::timestamp with time zone, reason text DEFAULT NULL::text) RETURNS core.requests
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare r core.requests; u uuid;
begin
  select * into r from core.requests where entry_id = request_id;
  if not found then perform core.refuse('request_not_found'); end if;
  u := core.require_access(r.organization_id, 'mark:routing', r.patient_id, r.to_department_id);
  return core.masked_request(core.route_request(request_id, u, assignee_id, to_department_id, priority, due_at, reason), u);
end $$;


ALTER FUNCTION public.mark_routing(request_id uuid, assignee_id uuid, to_department_id uuid, priority core.request_priority, due_at timestamp with time zone, reason text) OWNER TO postgres;

-- ── the marks ──
CREATE FUNCTION public.mark_step(request_id uuid, from_step core.request_step, step core.request_step, reason text DEFAULT NULL::text, occurred_at timestamp with time zone DEFAULT NULL::timestamp with time zone) RETURNS core.requests
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare r core.requests; u uuid; act text;
begin
  select * into r from core.requests where entry_id = request_id;
  if not found then perform core.refuse('request_not_found'); end if;
  act := 'mark:' || step::text;
  -- cancel belongs to the requester (or anyone holding mark:cancelled at the destination); every other step is the destination's
  if step = 'cancelled' and core.current_user_id(r.organization_id) = r.requester_id then u := core.require_access(r.organization_id, 'write:request', r.patient_id, r.from_department_id);
  else u := core.require_access(r.organization_id, act, r.patient_id, r.to_department_id); end if;
  return core.masked_request(core.change_request(request_id, from_step, step, u, reason, null, occurred_at), u);
end $$;


ALTER FUNCTION public.mark_step(request_id uuid, from_step core.request_step, step core.request_step, reason text, occurred_at timestamp with time zone) OWNER TO postgres;

CREATE FUNCTION public.mark_visit(visit_id uuid, from_status core.visit_status, status core.visit_status, reason text DEFAULT NULL::text, wait boolean DEFAULT NULL::boolean) RETURNS core.visits
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare v core.visits; u uuid; act text; legal boolean; target core.visit_status := status; v_wait boolean;
begin
  select * into v from core.visits where id = visit_id for update; if not found then perform core.refuse('not_found'); end if;
  if v.status <> from_status then perform core.refuse('visit_moved', v.status::text || ' by ' || coalesce((select name from core.users where id = v.assignee_id), '')); end if;
  -- the gate: in and out of consult is the clinician's; the rest is the desk's
  act := case when status = 'in_consult' or from_status in ('in_consult','pending') then 'mark:in_consult' else 'write:visit' end;
  u := core.require_access(v.organization_id, act, v.patient_id, v.department_id);
  legal := (from_status, status) in (('waiting','in_consult'),('pending','in_consult'),('in_consult','waiting'),('in_consult','done'),('pending','done'),('waiting','done'),('waiting','left'),
                                    ('waiting','cancelled'),('in_consult','cancelled'),('pending','cancelled'));
  if not legal then perform core.refuse('illegal_move', from_status::text || ' → ' || status::text); end if;
  if status = 'cancelled' and coalesce(reason, '') = '' then perform core.refuse('reason_missing'); end if;
  if status = 'left' and v.seen_at is not null then perform core.refuse('illegal_move', 'seen'); end if;
  -- the server decides done vs pending: anything still out keeps the visit open
  v_wait := coalesce(wait, (select d.patients_wait from core.departments d where d.id = v.department_id), true);
  if from_status = 'in_consult' and status = 'done' and v_wait and core.holds(v.id) > 0 then target := 'pending'; end if;
  update core.visits set status = target,
    -- seen at Done, or when he goes back to waiting with something written for him in this visit since he was called
    seen_at = case when seen_at is not null then seen_at
                   when from_status = 'in_consult' and target in ('done','pending') then pg_catalog.clock_timestamp()
                   when from_status = 'in_consult' and target = 'waiting' and exists (select 1 from core.entries e where e.visit_id = v.id and e.recorded_at >= coalesce(v.called_at, v.arrived_at))
                     then pg_catalog.clock_timestamp() end,
    called_at = case when target = 'in_consult' then pg_catalog.clock_timestamp() else called_at end,
    missed_calls = missed_calls + case when from_status = 'in_consult' and target = 'waiting' and reason = 'not_here' then 1 else 0 end,
    assignee_id = case when target = 'in_consult' then u else assignee_id end,
    ended_at = case when target in ('done','left','cancelled') then pg_catalog.clock_timestamp() else ended_at end,
    present_at = case when target in ('done','left','cancelled') then null else present_at end
    where id = visit_id returning * into v;
  perform core.change_visit(v, target, u, reason, case when target = 'in_consult' then pg_catalog.jsonb_build_object('assignee_id', u) when target = 'done' and core.holds(v.id) > 0 then '{"wait": false}'::jsonb end);
  if from_status = 'in_consult' and target in ('done','pending') then perform core.clear_seen(v.id, u); end if;
  if target in ('done','left','cancelled') and from_status <> 'in_consult' then perform core.flag_unseen(v.id); end if;
  return v;
end $$;


ALTER FUNCTION public.mark_visit(visit_id uuid, from_status core.visit_status, status core.visit_status, reason text, wait boolean) OWNER TO postgres;

-- 0040 · the desk marks a waiting visit urgent (or back to routine): the queue orders it first; the visit's history keeps who and when
CREATE FUNCTION public.mark_visit_priority(visit_id uuid, priority core.request_priority) RETURNS core.visits
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare v core.visits; u uuid;
begin
  select * into v from core.visits where id = mark_visit_priority.visit_id for update; if not found then perform core.refuse('not_found', 'visit'); end if;
  u := core.require_access(v.organization_id, 'write:visit', v.patient_id, v.department_id);
  if v.ended_at is not null then perform core.refuse('illegal_move', 'visit ended'); end if;
  if v.priority = mark_visit_priority.priority then return v; end if;
  update core.visits set priority = mark_visit_priority.priority where id = v.id returning * into v;
  perform core.change_visit(v, v.status, u, null, pg_catalog.jsonb_build_object('priority', v.priority));
  return v;
end $$;


ALTER FUNCTION public.mark_visit_priority(visit_id uuid, priority core.request_priority) OWNER TO postgres;

CREATE FUNCTION public.mark_visit_routing(visit_id uuid, assignee_id uuid DEFAULT NULL::uuid, priority core.request_priority DEFAULT NULL::core.request_priority, is_first boolean DEFAULT NULL::boolean) RETURNS core.visits
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare v core.visits; u uuid; ch jsonb := '{}';
begin
  select * into v from core.visits where id = visit_id for update; if not found then perform core.refuse('not_found'); end if;
  u := core.require_access(v.organization_id, 'write:visit', v.patient_id, v.department_id);
  if v.ended_at is not null then perform core.refuse('visit_ended'); end if;
  if assignee_id is not null and assignee_id is distinct from v.assignee_id then ch := ch || pg_catalog.jsonb_build_object('assignee_id', assignee_id); end if;
  if priority is not null and priority <> v.priority then ch := ch || pg_catalog.jsonb_build_object('priority', priority); end if;
  if is_first is not null and is_first <> v.is_first then ch := ch || pg_catalog.jsonb_build_object('is_first', is_first); end if;
  if ch = '{}' then return v; end if;
  update core.visits set assignee_id = coalesce(mark_visit_routing.assignee_id, visits.assignee_id), priority = coalesce(mark_visit_routing.priority, visits.priority),
    is_first = coalesce(mark_visit_routing.is_first, visits.is_first) where id = visit_id returning * into v;
  perform core.change_visit(v, v.status, u, null, ch);
  return v;
end $$;


ALTER FUNCTION public.mark_visit_routing(visit_id uuid, assignee_id uuid, priority core.request_priority, is_first boolean) OWNER TO postgres;

-- 0014 · what the client needs on first contact: which organization am I in; realtime channel policy
CREATE FUNCTION public.my_organization() RETURNS uuid
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  select organization_id from core.users where login_id = core.auth_uid() and (retired_at is null or retired_at > pg_catalog.now()) order by accepted_at nulls last limit 1
$$;


ALTER FUNCTION public.my_organization() OWNER TO postgres;

-- ── a visit no longer carries privacy
CREATE FUNCTION public.open_visit(id uuid, patient_id uuid, department_id uuid, priority core.request_priority DEFAULT 'routine'::core.request_priority, assignee_id uuid DEFAULT NULL::uuid, request_id uuid DEFAULT NULL::uuid) RETURNS core.visits
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare org uuid; u uuid; p core.patients; d record; v core.visits; first boolean; r core.requests;
begin
  org := core.org_of_patient(patient_id); if org is null then perform core.refuse('wrong_organization', 'patient'); end if;
  u := core.require_access(org, 'write:visit', patient_id, department_id);
  select * into p from core.patients where patients.id = patient_id;
  if p.merged_into_id is not null then perform core.refuse('patient_merged', p.merged_into_id::text); end if;
  if p.died_on is not null then perform core.refuse('patient_died'); end if;
  select dp.*, t.is_visited into d from core.departments dp join core.department_types t on t.key = dp.type where dp.id = department_id;
  if d.retired_at is not null then perform core.refuse('department_retired'); end if;
  if not d.is_visited then perform core.refuse('not_visited'); end if;
  if d.type = 'ward' then perform core.refuse('not_yet', 'admissions pack'); end if;
  if request_id is not null then
    select * into r from core.requests where entry_id = request_id;
    if not found or r.status <> 'open' then perform core.refuse('request_not_open'); end if;
    if r.to_department_id <> department_id then perform core.refuse('wrong_department'); end if;
    if core.survivor(r.patient_id) <> patient_id then perform core.refuse('wrong_patient'); end if;
  end if;
  select * into v from core.visits where visits.id = open_visit.id;
  if found then
    if v.patient_id <> open_visit.patient_id or v.department_id <> open_visit.department_id then perform core.refuse('id_in_use'); end if;
    return v;
  end if;
  select * into v from core.visits where visits.patient_id = open_visit.patient_id and visits.department_id = open_visit.department_id and ended_at is null for update;
  if found then
    if v.present_at is null then
      update core.visits set present_at = pg_catalog.clock_timestamp() where visits.id = v.id returning * into v;
      perform core.change_visit(v, v.status, u, null, pg_catalog.jsonb_build_object('present_at', v.present_at));
    end if;
    if request_id is not null and v.request_id is null then
      update core.visits set request_id = open_visit.request_id where visits.id = v.id returning * into v;
      perform core.change_visit(v, v.status, u, null, pg_catalog.jsonb_build_object('request_id', request_id));
    end if;
    return v;
  end if;
  first := not exists (select 1 from core.visits where visits.patient_id = open_visit.patient_id and visits.department_id = open_visit.department_id and seen_at is not null);
  begin
    insert into core.visits (id, organization_id, patient_id, department_id, request_id, assignee_id, status, priority, is_first, present_at)
    values (id, org, patient_id, department_id, request_id, assignee_id, 'waiting', priority, first, pg_catalog.clock_timestamp()) returning * into v;
  exception when unique_violation then
    select * into v from core.visits where visits.patient_id = open_visit.patient_id and visits.department_id = open_visit.department_id and ended_at is null;
    return v;
  end;
  perform core.change_visit(v, 'waiting', u, null, pg_catalog.jsonb_build_object('request_id', request_id, 'assignee_id', assignee_id, 'priority', priority, 'is_first', first));
  return v;
end $$;


ALTER FUNCTION public.open_visit(id uuid, patient_id uuid, department_id uuid, priority core.request_priority, assignee_id uuid, request_id uuid) OWNER TO postgres;

-- the actions a role can carry here: core's, and those of the packs this organization has on
CREATE FUNCTION public.read_actions(organization_id uuid) RETURNS jsonb
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
begin
  perform core.require_access(read_actions.organization_id, 'read:organization', null, null);
  return coalesce((select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('key', a.key, 'pack', a.pack) order by a.pack nulls first, a.key)
    from core.actions a
    where a.pack is null or exists (select 1 from core.organization_packs op where op.organization_id = read_actions.organization_id and op.pack = a.pack and op.retired_at is null)), '[]');
end $$;


ALTER FUNCTION public.read_actions(organization_id uuid) OWNER TO postgres;

-- the codes an organization may use (global and its own), for pickers
CREATE FUNCTION public.read_codes(organization_id uuid, query text DEFAULT NULL::text, "limit" integer DEFAULT 50) RETURNS jsonb
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare u uuid; q text := nullif(trim(coalesce(query, '')), '');
begin
  u := core.require_access(organization_id, 'read:organization', null, null);
  return coalesce((select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('code', c.code, 'name', c.name, 'kind', c.kind, 'unit', c.unit, 'is_local', c.organization_id is not null) order by c.name)
    from (select * from core.codes k where (k.organization_id is null or k.organization_id = read_codes.organization_id) and k.retired_at is null
          and (q is null or core.fold(k.name) ilike '%' || core.fold(q) || '%' or k.code ilike '%' || q || '%') order by k.name limit "limit") c), '[]');
end $$;


ALTER FUNCTION public.read_codes(organization_id uuid, query text, "limit" integer) OWNER TO postgres;

-- ── reads, re-created around hidden notes
CREATE FUNCTION public.read_entries(patient_id uuid, before_at timestamp with time zone DEFAULT NULL::timestamp with time zone, before_id uuid DEFAULT NULL::uuid, types text[] DEFAULT NULL::text[], "limit" integer DEFAULT 50, visit_ids uuid[] DEFAULT NULL::uuid[], department_ids uuid[] DEFAULT NULL::uuid[], between_visits boolean DEFAULT false) RETURNS jsonb
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare org uuid; u uuid; sv uuid; ids uuid[]; hidden uuid[];
begin
  org := core.org_of_patient(patient_id); if org is null then perform core.refuse('wrong_organization', 'patient'); end if;
  u := core.require_access(org, 'read:record', patient_id, null);
  sv := core.survivor(patient_id); perform core.require_open(u, sv);
  select pg_catalog.array_agg(id) into ids from core.patients where id = sv or merged_into_id = sv;
  hidden := core.hidden_entries(u, ids);
  return coalesce((select pg_catalog.jsonb_agg(core.entry_card(e, hidden) order by e.occurred_at desc, e.id desc) from (
    select x.* from core.entries x where x.patient_id = any(ids) and x.reply_to_id is null and x.replaced_by_id is null and x.type <> 'entered_in_error'
      and (types is null or x.type = any(types))
      and (visit_ids is null or x.visit_id = any(visit_ids))
      and (department_ids is null or x.department_id = any(department_ids))
      and (not between_visits or x.visit_id is null)
      and (before_at is null or (x.occurred_at, x.id) < (before_at, coalesce(before_id, '00000000-0000-0000-0000-000000000000')))
    order by x.occurred_at desc, x.id desc limit greatest(1, least("limit", 200))) e), '[]');
end $$;


ALTER FUNCTION public.read_entries(patient_id uuid, before_at timestamp with time zone, before_id uuid, types text[], "limit" integer, visit_ids uuid[], department_ids uuid[], between_visits boolean) OWNER TO postgres;

-- 0015 · read_entry names its patient: the request surface opens a request by id and needs the patient it belongs to
CREATE FUNCTION public.read_entry(entry_id uuid) RETURNS jsonb
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare e core.entries; u uuid; hidden uuid[];
begin
  select * into e from core.entries where id = entry_id; if not found then perform core.refuse('not_found'); end if;
  u := core.require_access(e.organization_id, 'read:record', e.patient_id, null);
  perform core.require_open(u, core.survivor(e.patient_id));
  hidden := core.hidden_for(u, e.patient_id);
  if e.id = any(hidden) then
    return core.entry_card(e, hidden) || pg_catalog.jsonb_build_object('data', '{}'::jsonb, 'patient_id', e.patient_id, 'replies', '[]'::jsonb, 'files', '[]'::jsonb, 'steps', '[]'::jsonb, 'versions', '[]'::jsonb);
  end if;
  return core.entry_card(e, hidden) || pg_catalog.jsonb_build_object('data', core.entry_data(e, hidden), 'patient_id', e.patient_id,
    'is_private', core.note_private(e), 'is_note', core.is_note(e.type),
    'can_mark_private', core.is_note(e.type) and (select x.kind from core.users x where x.id = u) = 'staff'
                        and (exists (select 1 from core.chain_of(e.id) c where c.author_id = u and core.is_note(c.type)) or core.works_in(u, e.department_id)),
    'patient', (select pg_catalog.jsonb_build_object('id', p.id, 'record_number', p.record_number, 'given_name', p.given_name, 'family_name', p.family_name, 'sex', p.sex, 'age', core.age_on(p.born_on, core.today(e.organization_id)))
                from core.patients p where p.id = e.patient_id),
    'replies', coalesce((select pg_catalog.jsonb_agg(core.entry_card(x, hidden) || pg_catalog.jsonb_build_object('data', core.entry_data(x, hidden)) order by x.occurred_at) from core.entries x where x.reply_to_id = e.id and x.replaced_by_id is null and x.type <> 'entered_in_error'), '[]'),
    'files', coalesce((select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('position', f.position, 'name', f.name, 'mime', f.mime) order by f.position) from core.entry_files f where f.entry_id = e.id), '[]'),
    'steps', coalesce((select pg_catalog.jsonb_agg(pg_catalog.to_jsonb(s) - 'actor_id' - 'changes' order by s.position) from core.request_steps s where s.request_id = e.id), '[]'),
    'versions', coalesce((select pg_catalog.jsonb_agg(core.entry_card(x, hidden) || pg_catalog.jsonb_build_object('data', core.entry_data(x, hidden)) order by x.recorded_at) from core.chain_of(e.id) x where x.id <> e.id), '[]'));
end $$;


ALTER FUNCTION public.read_entry(entry_id uuid) OWNER TO postgres;

CREATE FUNCTION public.read_entry_file(entry_id uuid, file_position smallint) RETURNS text
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare e core.entries; f core.entry_files; u uuid;
begin
  select * into e from core.entries where id = entry_id; if not found then perform core.refuse('not_found'); end if;
  u := core.require_access(e.organization_id, 'read:record', e.patient_id, null); perform core.require_open(u, core.survivor(e.patient_id));
  if core.note_hidden(e, u) then perform core.refuse('private_note'); end if;
  select * into f from core.entry_files where entry_files.entry_id = read_entry_file.entry_id and entry_files.position = file_position;
  if not found then perform core.refuse('not_found', 'file'); end if;
  return coalesce(f.url, f.path);   -- the client exchanges a path for a 60 s signed URL through storage
end $$;


ALTER FUNCTION public.read_entry_file(entry_id uuid, file_position smallint) OWNER TO postgres;

-- opened anyway, and notes made not private: both are what the owner reviews
CREATE FUNCTION public.read_opened_anyway(organization_id uuid, since timestamp with time zone DEFAULT NULL::timestamp with time zone) RETURNS jsonb
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare u uuid;
begin
  u := core.require_access(organization_id, 'read:record_reads', null, null);
  return coalesce((select pg_catalog.jsonb_agg(z.row order by z.at desc) from (
      select rr.read_at as at, pg_catalog.jsonb_build_object('kind', 'opened', 'read_at', rr.read_at, 'user_name', x.name, 'department_name', d.name, 'reason_text', rr.reason_text,
        'patient', pg_catalog.jsonb_build_object('id', p.id, 'record_number', p.record_number, 'given_name', p.given_name, 'family_name', p.family_name),
        'opened_department', od.name) as row
      from core.record_reads rr join core.users x on x.id = rr.user_id join core.patients p on p.id = rr.patient_id
      left join core.departments d on d.id = rr.department_id left join core.departments od on od.id = rr.opened_department_id
      where rr.organization_id = read_opened_anyway.organization_id and rr.basis = 'anyway' and rr.read_at > coalesce(since, pg_catalog.now() - interval '7 days')
      union all
      select np.changed_at, pg_catalog.jsonb_build_object('kind', 'made_not_private', 'read_at', np.changed_at, 'user_name', x.name, 'department_name', d.name, 'reason_text', np.reason_text,
        'patient', pg_catalog.jsonb_build_object('id', p.id, 'record_number', p.record_number, 'given_name', p.given_name, 'family_name', p.family_name),
        'entry_id', np.entry_id)
      from core.note_privacy np left join core.users x on x.id = np.changed_by join core.patients p on p.id = np.patient_id left join core.departments d on d.id = np.department_id
      where np.organization_id = read_opened_anyway.organization_id and not np.is_private and np.changed_at > coalesce(since, pg_catalog.now() - interval '7 days')) z), '[]');
end $$;


ALTER FUNCTION public.read_opened_anyway(organization_id uuid, since timestamp with time zone) OWNER TO postgres;

-- ── the organization read: the rule's new name, and where I work
CREATE FUNCTION public.read_organization(organization_id uuid) RETURNS jsonb
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare u uuid;
begin
  u := core.require_access(organization_id, 'read:organization', null, null);
  return pg_catalog.jsonb_build_object(
    'organization', (select pg_catalog.to_jsonb(o) from core.organizations o where o.id = organization_id),
    'me', (select pg_catalog.jsonb_build_object('id', x.id, 'name', x.name, 'kind', x.kind,
             'departments', coalesce((select pg_catalog.jsonb_agg(distinct pg_catalog.jsonb_build_object('id', d.id, 'name', d.name, 'type', d.type, 'is_visited', t.is_visited, 'site_name', d.site_name, 'patients_wait', d.patients_wait, 'review_results', d.review_results, 'is_private', d.is_private, 'after_done', d.after_done, 'pack_cards', d.pack_cards))
               from core.user_roles ur join core.departments d on (d.id = ur.department_id or (ur.department_id is null and d.organization_id = ur.organization_id and not d.is_outside))
               join core.department_types t on t.key = d.type where ur.user_id = x.id and d.retired_at is null), '[]'),
             'actions', coalesce((select pg_catalog.jsonb_agg(distinct ra.action) from core.user_roles ur join core.role_actions ra on ra.role_id = ur.role_id where ur.user_id = x.id), '[]'),
             'works_in', coalesce((select pg_catalog.jsonb_agg(d.id) from core.departments d where d.organization_id = read_organization.organization_id and core.works_in(x.id, d.id)), '[]'))
           from core.users x where x.id = u),
    'departments', coalesce((select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('id', d.id, 'name', d.name, 'type', d.type, 'is_visited', t.is_visited, 'is_outside', d.is_outside, 'site_name', d.site_name, 'patients_wait', d.patients_wait, 'review_results', d.review_results, 'is_private', d.is_private, 'after_done', d.after_done, 'pack_cards', d.pack_cards,
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


ALTER FUNCTION public.read_organization(organization_id uuid) OWNER TO postgres;

CREATE FUNCTION public.read_patient(patient_id uuid) RETURNS jsonb
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare org uuid; u uuid; p core.patients;
begin
  org := core.org_of_patient(patient_id); if org is null then perform core.refuse('not_found'); end if;
  u := core.require_access(org, 'read:patient', patient_id, null);
  select * into p from core.patients where id = coalesce((select merged_into_id from core.patients where id = patient_id), patient_id);
  return core.patient_hit(p, u) || pg_catalog.jsonb_build_object(
    'changes', coalesce((select pg_catalog.jsonb_agg(pg_catalog.to_jsonb(c) order by c.recorded_at desc) from core.patient_changes c where c.patient_id = p.id), '[]'));
end $$;


ALTER FUNCTION public.read_patient(patient_id uuid) OWNER TO postgres;

CREATE FUNCTION public.read_patients(organization_id uuid, query text, born_on text DEFAULT NULL::text, phone_text text DEFAULT NULL::text) RETURNS jsonb
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare u uuid; q text := trim(coalesce(query, '')); digits text := regexp_replace(q, '\D', '', 'g');
begin
  u := core.require_access(organization_id, 'read:patient', null, null);
  return coalesce((select pg_catalog.jsonb_agg(core.patient_hit(pp, u) order by p.rank, p.family_name, p.given_name) from (
    select p.*, case
        when exists (select 1 from core.patient_identifiers i where i.patient_id = p.id and i.value = q) then 0
        when digits <> '' and p.record_number::text = digits then 0
        when digits <> '' and p.phone_digits like '%' || digits then 1
        when core.fold(p.family_name) like core.fold(q) || '%' or core.fold(p.given_name) like core.fold(q) || '%' then 2
        else 3 end as rank
    from core.patients p
    where p.organization_id = read_patients.organization_id and p.merged_into_id is null and (
        (q <> '' and (exists (select 1 from core.patient_identifiers i where i.patient_id = p.id and i.value = q)
          or (digits <> '' and (p.record_number::text = digits or p.phone_digits like '%' || digits))
          or core.fold(p.family_name || ' ' || p.given_name) operator(extensions.%) core.fold(q)
          or core.fold(p.given_name || ' ' || p.family_name) like core.fold(q) || '%'
          or extensions.dmetaphone(p.family_name) = extensions.dmetaphone(split_part(q, ' ', -1))))
        or (q = '' and read_patients.born_on is not null and p.born_on = read_patients.born_on)
        or (q = '' and read_patients.phone_text is not null and p.phone_digits = regexp_replace(read_patients.phone_text, '\D', '', 'g')))
    order by rank limit 20) p join core.patients pp on pp.id = p.id), '[]');
end $$;


ALTER FUNCTION public.read_patients(organization_id uuid, query text, born_on text, phone_text text) OWNER TO postgres;

-- the request queue: department names real; a hidden reply stays hidden
CREATE FUNCTION public.read_queue(department_id uuid) RETURNS jsonb
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare org uuid; u uuid;
begin
  select organization_id into org from core.departments where id = department_id; if org is null then perform core.refuse('not_found', 'department'); end if;
  u := core.require_access(org, 'read:queue', null, department_id);
  return pg_catalog.jsonb_build_object(
    'requests', coalesce((select pg_catalog.jsonb_agg(core.entry_card(e, core.hidden_for(u, e.patient_id)) || pg_catalog.jsonb_build_object(
          'patient', pg_catalog.jsonb_build_object('id', p.id, 'record_number', p.record_number, 'given_name', p.given_name, 'family_name', p.family_name, 'sex', p.sex, 'born_on', p.born_on,
            'here', exists (select 1 from core.visits hv where hv.patient_id = p.id and hv.ended_at is null and hv.present_at is not null)),
          'from_department_name', e.data->>'department_name', 'requester_name', e.data->>'author_name', 'question_text', e.data->>'question_text',
          'section_name', s.section_name, 'service_name', s.name, 'reply_type', s.reply_type, 'assignee_id', r.assignee_id,
          'details', case when e.type = 'prescription' then pg_catalog.jsonb_strip_nulls(pg_catalog.jsonb_build_object('drug', e.data->'drug', 'dose_number', e.data->'dose_number',
             'dose_unit', e.data->'dose_unit', 'route', e.data->'route', 'frequency', e.data->'frequency', 'prn', e.data->'prn', 'duration_days', e.data->'duration_days',
             'quantity', e.data->'quantity', 'repeats', e.data->'repeats', 'instructions_text', e.data->'instructions_text')) end)
        order by r.priority, r.due_at)
      from core.requests r join core.entries e on e.id = r.entry_id join core.patients p on p.id = e.patient_id left join core.services s on s.id = e.service_id
      where r.to_department_id = read_queue.department_id and r.status = 'open'), '[]'),
    'recent', coalesce((select pg_catalog.jsonb_agg(core.entry_card(e, core.hidden_for(u, e.patient_id)) || pg_catalog.jsonb_build_object(
          'patient', pg_catalog.jsonb_build_object('id', p.id, 'record_number', p.record_number, 'given_name', p.given_name, 'family_name', p.family_name, 'sex', p.sex, 'born_on', p.born_on,
            'here', exists (select 1 from core.visits hv where hv.patient_id = p.id and hv.ended_at is null and hv.present_at is not null)),
          'from_department_name', e.data->>'department_name', 'requester_name', e.data->>'author_name', 'section_name', s.section_name, 'service_name', s.name,
          'reply', (select case when core.note_hidden(x, u) then pg_catalog.jsonb_build_object('id', x.id, 'data', '{}'::jsonb, 'author_name', null, 'recorded_at', x.recorded_at, 'is_final', x.is_final, 'is_hidden', true)
                    else pg_catalog.jsonb_build_object('id', x.id, 'data', x.data, 'author_name', x.data->>'author_name', 'recorded_at', x.recorded_at, 'is_final', x.is_final) end
                    from core.entries x where x.reply_to_id = e.id and x.replaced_by_id is null and x.type <> 'entered_in_error' order by x.occurred_at desc limit 1))
        order by r.replied_at desc)
      from (select * from core.requests rq where rq.to_department_id = read_queue.department_id and rq.status in ('done','cancelled')
              and rq.replied_at > pg_catalog.now() - interval '24 hours' order by rq.replied_at desc limit 300) r
      join core.entries e on e.id = r.entry_id join core.patients p on p.id = e.patient_id left join core.services s on s.id = e.service_id), '[]'),
    'done_today', (select count(*) from core.requests r where r.to_department_id = read_queue.department_id and r.status = 'done'
                   and exists (select 1 from core.request_steps st where st.request_id = r.entry_id and st.step = 'done' and st.recorded_at > core.day_start(org))));
end $$;


ALTER FUNCTION public.read_queue(department_id uuid) OWNER TO postgres;

-- every range by sex and age, for the settings editor and the bench's live flags (the server flags on write)
CREATE FUNCTION public.read_ranges(organization_id uuid) RETURNS jsonb
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare u uuid;
begin
  u := core.require_access(organization_id, 'read:organization', null, null);
  return coalesce((select pg_catalog.jsonb_agg(pg_catalog.to_jsonb(r) order by r.service_id, r.position, r.sex nulls last, r.age_low nulls first)
    from core.service_field_ranges r join core.services s on s.id = r.service_id where s.organization_id = read_ranges.organization_id and s.retired_at is null), '[]');
end $$;


ALTER FUNCTION public.read_ranges(organization_id uuid) OWNER TO postgres;

CREATE FUNCTION public.read_record(patient_id uuid, department_id uuid, open_department_id uuid DEFAULT NULL::uuid, reason text DEFAULT NULL::text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare org uuid; u uuid; sv uuid; ids uuid[]; p core.patients; out jsonb; hidden uuid[]; k core.user_kind;
begin
  org := core.org_of_patient(patient_id);
  if org is null then perform core.refuse('wrong_organization', 'patient'); end if;
  u := core.require_access(org, 'read:record', patient_id, department_id);
  sv := core.survivor(patient_id);
  select pg_catalog.array_agg(id) into ids from core.patients where id = sv or merged_into_id = sv;
  select * into p from core.patients where id = sv;
  if open_department_id is not null then
    select kind into k from core.users where id = u;
    if k is distinct from 'staff' then perform core.refuse('not_allowed', 'open anyway is for staff'); end if;
    if not exists (select 1 from core.departments d where d.id = open_department_id and d.organization_id = org) then perform core.refuse('not_found', 'department'); end if;
    if nullif(trim(coalesce(reason, '')), '') is null then perform core.refuse('reason_missing'); end if;
  end if;
  perform core.open_record(org, u, sv, read_record.department_id, open_department_id, reason);
  hidden := core.hidden_entries(u, ids);
  out := pg_catalog.jsonb_build_object(
    'patient', pg_catalog.jsonb_build_object('id', p.id, 'record_number', p.record_number, 'given_name', p.given_name, 'middle_name', p.middle_name, 'family_name', p.family_name,
       'sex', p.sex, 'born_on', p.born_on, 'age', core.age_on(p.born_on, core.today(org)), 'died_on', p.died_on, 'merged_into_id', p.merged_into_id, 'phone_text', p.phone_text),
    -- where private notes are hidden from this reader, for the open-anyway card
    'hidden_departments', coalesce((select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('department_id', h.department_id, 'department_name', d.name, 'notes', h.n) order by d.name)
       from (select e.department_id, count(*) as n from core.entries e where e.id = any(hidden) and e.replaced_by_id is null group by e.department_id) h
       join core.departments d on d.id = h.department_id), '[]'),
    'visit', (select pg_catalog.to_jsonb(v) from core.visits v where v.patient_id = any(ids) and v.department_id = read_record.department_id and v.ended_at is null limit 1),
    'allergies', coalesce((select pg_catalog.jsonb_agg(pg_catalog.to_jsonb(a) order by a.status, a.substance_name) from core.patient_allergies a where a.patient_id = any(ids)), '[]'),
    'allergy_review', (select pg_catalog.to_jsonb(x) from core.patient_list_reviews x where x.patient_id = sv and x.list = 'allergies'),
    'problems', coalesce((select pg_catalog.jsonb_agg(pg_catalog.to_jsonb(q) order by q.onset_on) from core.patient_problems q where q.patient_id = any(ids) and q.status = 'active'), '[]'),
    'problem_review', (select pg_catalog.to_jsonb(x) from core.patient_list_reviews x where x.patient_id = sv and x.list = 'problems'),
    'medications', coalesce((select pg_catalog.jsonb_agg(pg_catalog.to_jsonb(m) order by m.drug_name) from core.patient_medications m where m.patient_id = any(ids) and m.status = 'active'), '[]'),
    'medication_review', (select pg_catalog.to_jsonb(x) from core.patient_list_reviews x where x.patient_id = sv and x.list = 'medications'),
    'open_requests', coalesce((select pg_catalog.jsonb_agg(core.entry_card(e, hidden) order by e.occurred_at desc) from core.requests r join core.entries e on e.id = r.entry_id where r.patient_id = any(ids) and r.status = 'open'), '[]'),
    'entries', coalesce((select pg_catalog.jsonb_agg(core.entry_card(e, hidden) order by e.occurred_at desc, e.id desc) from (
        select x.* from core.entries x where x.patient_id = any(ids) and x.reply_to_id is null and x.replaced_by_id is null and x.type <> 'entered_in_error'
        order by x.occurred_at desc, x.id desc limit 30) e), '[]'),
    'latest_vitals', (select e.data->'values' from core.entries e where e.patient_id = any(ids) and e.type = 'vitals' and e.replaced_by_id is null order by e.occurred_at desc limit 1)
  );
  return out;
end $$;


ALTER FUNCTION public.read_record(patient_id uuid, department_id uuid, open_department_id uuid, reason text) OWNER TO postgres;

-- the read log: who opened this record (printable for the patient), and every open-anyway in a period
CREATE FUNCTION public.read_record_reads(patient_id uuid, "limit" integer DEFAULT 500) RETURNS jsonb
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare org uuid; u uuid; sv uuid;
begin
  org := core.org_of_patient(patient_id); if org is null then perform core.refuse('wrong_organization', 'patient'); end if;
  u := core.require_access(org, 'read:record_reads', patient_id, null);
  sv := core.survivor(patient_id);
  return coalesce((select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('read_at', rr.read_at, 'user_name', x.name, 'user_kind', x.kind, 'department_name', d.name,
      'basis', rr.basis, 'reason_text', rr.reason_text, 'opened_department', od.name) order by rr.read_at desc)
    from (select * from core.record_reads r where r.patient_id in (select id from core.patients where id = sv or merged_into_id = sv) order by r.read_at desc limit greatest(1, least("limit", 5000))) rr
    join core.users x on x.id = rr.user_id left join core.departments d on d.id = rr.department_id left join core.departments od on od.id = rr.opened_department_id), '[]');
end $$;


ALTER FUNCTION public.read_record_reads(patient_id uuid, "limit" integer) OWNER TO postgres;

-- the reply types a service may name here: core's result and note, every entry type of an enabled pack, or none
CREATE FUNCTION public.read_reply_types(organization_id uuid) RETURNS jsonb
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare u uuid;
begin
  u := core.require_access(organization_id, 'read:organization', null, null);
  return pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object('key', 'none', 'name', 'Just done', 'pack', null))
    || coalesce((select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('key', t.key, 'name', t.name, 'pack', t.pack) order by t.pack nulls first, t.key)
       from core.entry_types t where t.retired_at is null and ((t.pack is null and t.key in ('result','note'))
         or t.pack in (select op.pack from core.organization_packs op where op.organization_id = read_reply_types.organization_id and op.retired_at is null))), '[]');
end $$;


ALTER FUNCTION public.read_reply_types(organization_id uuid) OWNER TO postgres;

-- results over time: every coded value the record holds, one row per test, newest first, the live version of each entry only
CREATE FUNCTION public.read_results_table(patient_id uuid, "limit" integer DEFAULT 12) RETURNS jsonb
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare org uuid; u uuid; sv uuid; ids uuid[]; hidden uuid[];
begin
  org := core.org_of_patient(patient_id); if org is null then perform core.refuse('wrong_organization', 'patient'); end if;
  u := core.require_access(org, 'read:record', patient_id, null);
  sv := core.survivor(patient_id); perform core.require_open(u, sv);
  select pg_catalog.array_agg(id) into ids from core.patients where id = sv or merged_into_id = sv;
  hidden := core.hidden_entries(u, ids);
  return coalesce((select pg_catalog.jsonb_agg(t.row order by t.last_at desc) from (
    select max(v.occurred_at) as last_at, pg_catalog.jsonb_build_object('code', v.code, 'name', coalesce(max(c.name), v.code), 'unit', max(v.unit),
      'points', (select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('at', p.occurred_at, 'value_number', p.value_number, 'value_text', p.value_text, 'flag', p.flag,
                   'entry_id', p.entry_id, 'corrected', p.corrected) order by p.occurred_at desc)
                 from (select w.*, e2.replaces_id is not null as corrected from core.entry_values w join core.entries e2 on e2.id = w.entry_id
                       where w.patient_id = any(ids) and w.code = v.code and e2.replaced_by_id is null and not (e2.id = any(hidden)) order by w.occurred_at desc limit greatest(1, least("limit", 50))) p)) as row
    from core.entry_values v join core.entries e on e.id = v.entry_id left join core.codes c on c.code = v.code
    where v.patient_id = any(ids) and e.replaced_by_id is null and not (e.id = any(hidden)) group by v.code) t), '[]');
end $$;


ALTER FUNCTION public.read_results_table(patient_id uuid, "limit" integer) OWNER TO postgres;

CREATE FUNCTION public.read_sent_outside(organization_id uuid, department_id uuid DEFAULT NULL::uuid) RETURNS jsonb
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare u uuid;
begin
  u := core.require_access(organization_id, 'read:queue', null, department_id);
  return coalesce((select pg_catalog.jsonb_agg(core.entry_card(e, core.hidden_for(u, e.patient_id)) || pg_catalog.jsonb_build_object('patient_id', e.patient_id) order by r.due_at)
    from core.requests r join core.entries e on e.id = r.entry_id join core.departments d on d.id = r.to_department_id
    where r.organization_id = read_sent_outside.organization_id and r.status = 'open' and d.is_outside
      and (read_sent_outside.department_id is null or r.from_department_id = read_sent_outside.department_id)), '[]');
end $$;


ALTER FUNCTION public.read_sent_outside(organization_id uuid, department_id uuid) OWNER TO postgres;

CREATE FUNCTION public.read_settings_changes(organization_id uuid, table_name text DEFAULT NULL::text, row_id uuid DEFAULT NULL::uuid, "limit" integer DEFAULT 100) RETURNS jsonb
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
begin
  perform core.require_access(organization_id, 'read:settings_changes', null, null);
  return coalesce((select pg_catalog.jsonb_agg(pg_catalog.to_jsonb(c) || pg_catalog.jsonb_build_object('user_name', (select name from core.users where id = c.user_id)) order by c.recorded_at desc)
    from (select * from core.settings_changes c where c.organization_id = read_settings_changes.organization_id
          and (read_settings_changes.table_name is null or c.table_name = read_settings_changes.table_name) and (read_settings_changes.row_id is null or c.row_id = read_settings_changes.row_id)
          order by c.recorded_at desc limit least("limit", 500)) c), '[]');
end $$;


ALTER FUNCTION public.read_settings_changes(organization_id uuid, table_name text, row_id uuid, "limit" integer) OWNER TO postgres;

-- 0032 · the review list shows each result beside the patient's value before it ("Creatinine 1.9 ↑, was 1.1 in Jun"),
--   so a result can be judged without opening the record; a previous value from a private visit the reader cannot see is left out
CREATE FUNCTION public.read_to_review(department_id uuid DEFAULT NULL::uuid) RETURNS jsonb
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
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
                        and x.type <> 'entered_in_error' and not core.note_hidden(x, u) order by x.recorded_at desc limit 1)) v
          left join core.codes k on k.code = v.code
          left join lateral (select y.value_number, y.occurred_at from core.entry_values y join core.entries ye on ye.id = y.entry_id
              where y.patient_id = v.patient_id and y.code = v.code and y.occurred_at < v.occurred_at and y.value_number is not null and ye.replaced_by_id is null
                and ye.reply_to_id is distinct from r.entry_id
                and not core.note_hidden(ye, u) order by y.occurred_at desc limit 1) pv on true
          where v.rank <= 3), '[]')) order by (r.reply_flag = 'critical') desc, r.review_needed_at)
    from core.requests r join core.entries e on e.id = r.entry_id join core.patients p on p.id = e.patient_id
    where r.review_needed_at is not null and ((read_to_review.department_id is null and r.requester_id = u) or (read_to_review.department_id is not null and r.from_department_id = read_to_review.department_id))), '[]');
end $$;


ALTER FUNCTION public.read_to_review(department_id uuid) OWNER TO postgres;

CREATE FUNCTION public.read_values(patient_id uuid, codes text[], "limit" integer DEFAULT 12) RETURNS jsonb
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare org uuid; u uuid; sv uuid; ids uuid[]; hidden uuid[];
begin
  org := core.org_of_patient(patient_id); if org is null then perform core.refuse('wrong_organization', 'patient'); end if;
  u := core.require_access(org, 'read:record', patient_id, null);
  sv := core.survivor(patient_id); perform core.require_open(u, sv);
  select pg_catalog.array_agg(id) into ids from core.patients where id = sv or merged_into_id = sv;
  hidden := core.hidden_entries(u, ids);
  return coalesce((select pg_catalog.jsonb_object_agg(c, pts) from (
    select c, (select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('at', v.occurred_at, 'value_number', v.value_number, 'value_text', v.value_text, 'unit', v.unit, 'flag', v.flag, 'entry_id', v.entry_id) order by v.occurred_at desc)
               from (select y.* from core.entry_values y where y.patient_id = any(ids) and (y.code = c or y.code in (select code from core.codes where replaced_by_code = c))
                     and not (y.entry_id = any(hidden)) order by y.occurred_at desc limit "limit") v) as pts
    from pg_catalog.unnest(codes) c) t), '{}');
end $$;


ALTER FUNCTION public.read_values(patient_id uuid, codes text[], "limit" integer) OWNER TO postgres;

-- the visit queue: every visit, counts unfiltered (a visit is never private now)
CREATE FUNCTION public.read_visit_queue(department_id uuid) RETURNS jsonb
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare org uuid; u uuid;
begin
  org := core.org_of_department(department_id); if org is null then perform core.refuse('not_found', 'department'); end if;
  u := core.require_access(org, 'read:queue', null, department_id);
  return pg_catalog.jsonb_build_object(
    'rows', coalesce((select pg_catalog.jsonb_agg(row order by band_rank, priority, sort_at) from (
      select pg_catalog.jsonb_build_object('id', v.id, 'patient', pg_catalog.jsonb_build_object('id', p.id, 'record_number', p.record_number, 'given_name', p.given_name, 'family_name', p.family_name,
               'sex', p.sex, 'age', core.age_on(p.born_on, core.today(org)), 'has_allergies', exists (select 1 from core.patient_allergies a where a.patient_id = p.id and a.status = 'active')),
             'status', v.status, 'band', band, 'priority', v.priority, 'is_first', v.is_first, 'assignee_id', v.assignee_id,
             'assignee_name', (select name from core.users where id = v.assignee_id), 'arrived_at', v.arrived_at, 'present_at', v.present_at, 'called_at', v.called_at, 'missed_calls', v.missed_calls,
             'has_vitals', exists (select 1 from core.entries ve where ve.visit_id = v.id and ve.type = 'vitals' and ve.replaced_by_id is null), 'seen_at', v.seen_at,
             'request_id', v.request_id, 'request_open', exists (select 1 from core.requests r where r.entry_id = v.request_id and r.status = 'open'),
             'requests', coalesce((select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('request_id', r.entry_id, 'service_name', e.data->'service'->>'name', 'to_department_name', e.data->>'to_department_name', 'step', r.step, 'is_holding', r.status = 'open', 'type', e.type, 'replied', r.replied_at is not null))
                          from core.requests r join core.entries e on e.id = r.entry_id where e.visit_id = v.id), '[]')) as row,
             case band when 'back' then 1 when 'waiting' then 2 when 'pending' then 3 else 4 end as band_rank, v.priority,
             case band when 'waiting' then v.arrived_at else v.present_at end as sort_at
      from (select v.*, case when v.status = 'in_consult' then 'consult' when v.status = 'waiting' and v.seen_at is null then 'waiting'
                          when core.holds(v.id) = 0 then 'back' else 'pending' end as band
            from core.visits v where v.department_id = read_visit_queue.department_id and v.present_at is not null and v.ended_at is null) v
      join core.patients p on p.id = v.patient_id) q), '[]'),
    'done_today', (select count(*) from core.visits v where v.department_id = read_visit_queue.department_id and v.status = 'done' and v.ended_at > core.day_start(org)),
    'away', (select count(*) from core.visits v where v.department_id = read_visit_queue.department_id and v.ended_at is null and v.present_at is null));
end $$;


ALTER FUNCTION public.read_visit_queue(department_id uuid) OWNER TO postgres;

-- the visit cards: real department and clinician; a visit shows whether it holds a note hidden from the reader; a visit cancelled
-- with nothing written is left out
CREATE FUNCTION public.read_visits(patient_id uuid) RETURNS jsonb
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare org uuid; u uuid; sv uuid; ids uuid[]; hidden uuid[];
begin
  org := core.org_of_patient(patient_id); if org is null then perform core.refuse('wrong_organization', 'patient'); end if;
  u := core.require_access(org, 'read:record', patient_id, null);
  sv := core.survivor(patient_id); perform core.require_open(u, sv);
  select pg_catalog.array_agg(id) into ids from core.patients where id = sv or merged_into_id = sv;
  hidden := core.hidden_entries(u, ids);
  return pg_catalog.jsonb_build_object(
    'visits', coalesce((select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
        'id', v.id, 'is_hidden', exists (select 1 from core.entries h where h.visit_id = v.id and h.id = any(hidden) and h.replaced_by_id is null),
        'department_id', v.department_id, 'department_name', d.name,
        'assignee_name', (select x.name from core.users x where x.id = v.assignee_id),
        'status', v.status, 'is_first', v.is_first, 'arrived_at', v.arrived_at, 'seen_at', v.seen_at, 'ended_at', v.ended_at, 'last_activity_at', v.last_activity_at,
        'counts', coalesce((select pg_catalog.jsonb_object_agg(c.type, c.n) from (select e.type, count(*) as n from core.entries e where e.visit_id = v.id
                   and e.reply_to_id is null and e.replaced_by_id is null and e.type <> 'entered_in_error' group by e.type) c), '{}'),
        'first_line', (select e.display_line from core.entries e where e.visit_id = v.id and e.type = 'note' and e.replaced_by_id is null
                   and not (e.id = any(hidden)) order by e.occurred_at limit 1)) order by v.last_activity_at desc, v.arrived_at desc)
      from (select vv.*, greatest(vv.arrived_at, vv.seen_at, vv.ended_at,
                (select max(e.recorded_at) from core.entries e where e.visit_id = vv.id),
                (select max(s.recorded_at) from core.visit_steps s where s.visit_id = vv.id)) as last_activity_at
            from core.visits vv where vv.patient_id = any(ids)
              and not (vv.status = 'cancelled' and not exists (select 1 from core.entries ce where ce.visit_id = vv.id))) v
      join core.departments d on d.id = v.department_id), '[]'),
    'between', (select count(*) from core.entries e where e.patient_id = any(ids) and e.visit_id is null and e.reply_to_id is null and e.replaced_by_id is null and e.type <> 'entered_in_error'));
end $$;


ALTER FUNCTION public.read_visits(patient_id uuid) OWNER TO postgres;

-- ── registration ──
CREATE FUNCTION public.register_patient(id uuid, organization_id uuid, given_name text, family_name text, sex core.sex, born_on text, middle_name text DEFAULT NULL::text, died_on text DEFAULT NULL::text, phone_text text DEFAULT NULL::text, contact_text text DEFAULT NULL::text, identifiers jsonb DEFAULT '[]'::jsonb, seen_change_id uuid DEFAULT NULL::uuid, change_id uuid DEFAULT NULL::uuid) RETURNS core.patients
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare u uuid; p core.patients; old core.patients; n bigint; ch jsonb := '{}'; ident jsonb;
begin
  u := core.require_access(organization_id, 'write:patient', null, null);
  if change_id is not null and exists (select 1 from core.patient_changes where patient_changes.id = change_id) then
    select * into p from core.patients where patients.id = register_patient.id; return p;      -- the retry
  end if;
  select * into old from core.patients where patients.id = register_patient.id for update;
  if found then
    if seen_change_id is not null and exists (select 1 from core.patient_changes c where c.patient_id = old.id and c.recorded_at > (select recorded_at from core.patient_changes where patient_changes.id = seen_change_id)) then
      perform core.refuse('changed_since_read');
    end if;
    if old.given_name is distinct from trim(given_name) then ch := ch || pg_catalog.jsonb_build_object('given_name', pg_catalog.jsonb_build_array(old.given_name, trim(given_name))); end if;
    if old.family_name is distinct from trim(family_name) then ch := ch || pg_catalog.jsonb_build_object('family_name', pg_catalog.jsonb_build_array(old.family_name, trim(family_name))); end if;
    if old.middle_name is distinct from middle_name then ch := ch || pg_catalog.jsonb_build_object('middle_name', pg_catalog.jsonb_build_array(old.middle_name, middle_name)); end if;
    if old.sex is distinct from sex then ch := ch || pg_catalog.jsonb_build_object('sex', pg_catalog.jsonb_build_array(old.sex, sex)); end if;
    if old.born_on is distinct from born_on then ch := ch || pg_catalog.jsonb_build_object('born_on', pg_catalog.jsonb_build_array(old.born_on, born_on)); end if;
    if old.died_on is distinct from died_on then ch := ch || pg_catalog.jsonb_build_object('died_on', pg_catalog.jsonb_build_array(old.died_on, died_on)); end if;
    if old.phone_text is distinct from phone_text then ch := ch || pg_catalog.jsonb_build_object('phone_text', pg_catalog.jsonb_build_array(old.phone_text, phone_text)); end if;
    if old.contact_text is distinct from contact_text then ch := ch || pg_catalog.jsonb_build_object('contact_text', pg_catalog.jsonb_build_array(old.contact_text, contact_text)); end if;
    update core.patients set given_name = trim(given_name), family_name = trim(family_name), middle_name = middle_name, sex = sex, born_on = born_on,
      died_on = died_on, phone_text = phone_text, contact_text = contact_text where patients.id = old.id returning * into p;
  else
    insert into core.record_numbers (organization_id) values (organization_id) on conflict do nothing;
    update core.record_numbers set last_number = last_number + 1 where record_numbers.organization_id = register_patient.organization_id returning last_number into n;
    insert into core.patients (id, organization_id, record_number, given_name, middle_name, family_name, sex, born_on, died_on, phone_text, contact_text)
    values (id, organization_id, n, trim(given_name), middle_name, trim(family_name), sex, born_on, died_on, phone_text, contact_text) returning * into p;
    ch := pg_catalog.jsonb_build_object('registered', true);
  end if;
  delete from core.patient_identifiers where patient_id = p.id;
  for ident in select * from pg_catalog.jsonb_array_elements(coalesce(identifiers, '[]')) loop
    insert into core.patient_identifiers (organization_id, patient_id, system, value) values (organization_id, p.id, ident->>'system', ident->>'value') on conflict do nothing;
  end loop;
  if ch <> '{}' then
    insert into core.patient_changes (id, organization_id, patient_id, user_id, changes) values (coalesce(change_id, pg_catalog.gen_random_uuid()), organization_id, p.id, u, ch);
  end if;
  return p;
end $$;


ALTER FUNCTION public.register_patient(id uuid, organization_id uuid, given_name text, family_name text, sex core.sex, born_on text, middle_name text, died_on text, phone_text text, contact_text text, identifiers jsonb, seen_change_id uuid, change_id uuid) OWNER TO postgres;

CREATE FUNCTION public.retire_department(id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
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


ALTER FUNCTION public.retire_department(id uuid) OWNER TO postgres;

CREATE FUNCTION public.retire_organization_pack(organization_id uuid, pack text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
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


ALTER FUNCTION public.retire_organization_pack(organization_id uuid, pack text) OWNER TO postgres;

CREATE FUNCTION public.retire_role(id uuid) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
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


ALTER FUNCTION public.retire_role(id uuid) OWNER TO postgres;

CREATE FUNCTION public.retire_service(id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare u uuid; s core.services;
begin
  select * into s from core.services where services.id = retire_service.id; if not found then perform core.refuse('not_found'); end if;
  u := core.require_access(s.organization_id, 'manage:services', null, null);
  update core.services set retired_at = pg_catalog.now() where services.id = s.id;
  perform core.record_settings_change(s.organization_id, u, 'services', s.id, '{"retired": true}');
end $$;


ALTER FUNCTION public.retire_service(id uuid) OWNER TO postgres;

CREATE FUNCTION public.retire_template(id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare u uuid; t core.templates;
begin
  select * into t from core.templates where templates.id = retire_template.id; if not found then perform core.refuse('not_found'); end if;
  u := core.require_access(t.organization_id, 'manage:templates', null, null);
  update core.templates set retired_at = pg_catalog.now() where templates.id = t.id;
  perform core.record_settings_change(t.organization_id, u, 'templates', t.id, '{"retired": true}');
end $$;


ALTER FUNCTION public.retire_template(id uuid) OWNER TO postgres;

-- a parked or failed retry can be re-queued by the organization
CREATE FUNCTION public.retry_pack_calls(organization_id uuid, pack text) RETURNS integer
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare n int;
begin
  perform core.require_access(organization_id, 'manage:organization', null, null);
  update core.pack_calls set tries = 0, tried_at = null, error_text = null where pack_calls.organization_id = retry_pack_calls.organization_id and pack_calls.pack = retry_pack_calls.pack and tries >= 5;
  get diagnostics n = row_count; return n;
end $$;


ALTER FUNCTION public.retry_pack_calls(organization_id uuid, pack text) OWNER TO postgres;

-- ── departments ──
CREATE FUNCTION public.save_department(id uuid, organization_id uuid, type text, name text, site_name text DEFAULT NULL::text, is_outside boolean DEFAULT false, contact_text text DEFAULT NULL::text, serves uuid[] DEFAULT NULL::uuid[], seen_change_id uuid DEFAULT NULL::uuid, patients_wait boolean DEFAULT NULL::boolean, review_results text DEFAULT NULL::text, is_private boolean DEFAULT NULL::boolean, after_done text DEFAULT NULL::text, pack_cards boolean DEFAULT NULL::boolean) RETURNS core.departments
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare u uuid; d core.departments; t record;
begin
  u := core.require_access(organization_id, 'manage:departments', null, null);
  select * into t from core.department_types where key = type and retired_at is null; if not found then perform core.refuse('unknown_department_type', type); end if;
  if t.pack is not null then perform core.require_pack(organization_id, t.pack); end if;
  if type = 'outside' and not is_outside then is_outside := true; end if;
  if exists (select 1 from core.departments x where x.id = save_department.id and x.organization_id <> save_department.organization_id) then perform core.refuse('not_found', 'department'); end if;
  perform core.require_fresh('departments', id, seen_change_id);
  if exists (select 1 from core.departments x where x.organization_id = save_department.organization_id and x.id <> save_department.id and x.retired_at is null
             and core.fold(x.name) = core.fold(save_department.name)) then perform core.refuse('name_taken', name); end if;
  if review_results is not null and review_results not in ('critical','abnormal','all') then perform core.refuse('bad_setting', review_results); end if;
  if after_done is not null and after_done not in ('next','queue') then perform core.refuse('bad_setting', after_done); end if;
  insert into core.departments (id, organization_id, type, name, site_name, is_outside, contact_text, patients_wait, review_results, is_private, after_done, pack_cards)
  values (id, organization_id, type, trim(name), nullif(trim(coalesce(site_name,'')),''), is_outside, contact_text,
    coalesce(patients_wait, true), coalesce(review_results, 'critical'), coalesce(is_private, false), coalesce(after_done, 'next'), coalesce(pack_cards, true))
  on conflict on constraint departments_pkey do update set name = excluded.name, site_name = excluded.site_name, is_outside = excluded.is_outside, contact_text = excluded.contact_text,
    patients_wait = coalesce(save_department.patients_wait, departments.patients_wait), review_results = coalesce(save_department.review_results, departments.review_results),
    is_private = coalesce(save_department.is_private, departments.is_private), after_done = coalesce(save_department.after_done, departments.after_done),
    pack_cards = coalesce(save_department.pack_cards, departments.pack_cards)
  where departments.organization_id = excluded.organization_id
  returning * into d;
  if serves is not null then
    delete from core.served_departments where department_id = d.id;
    insert into core.served_departments (department_id, served_department_id) select d.id, x from pg_catalog.unnest(serves) x;
  end if;
  perform core.record_settings_change(organization_id, u, 'departments', d.id, pg_catalog.jsonb_build_object('type', type, 'name', d.name, 'site_name', d.site_name, 'serves', pg_catalog.to_jsonb(serves), 'patients_wait', d.patients_wait, 'review_results', d.review_results, 'is_private', d.is_private, 'after_done', d.after_done, 'pack_cards', d.pack_cards));
  return d;
end $$;


ALTER FUNCTION public.save_department(id uuid, organization_id uuid, type text, name text, site_name text, is_outside boolean, contact_text text, serves uuid[], seen_change_id uuid, patients_wait boolean, review_results text, is_private boolean, after_done text, pack_cards boolean) OWNER TO postgres;

-- the owner sets the clinic's name and time zone
CREATE FUNCTION public.save_organization(organization_id uuid, name text DEFAULT NULL::text, time_zone text DEFAULT NULL::text, record_view text DEFAULT NULL::text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare u uuid; o core.organizations;
begin
  u := core.require_access(save_organization.organization_id, 'manage:organization', null, null);
  if record_view is not null and record_view not in ('visits','entries') then perform core.refuse('bad_setting', record_view); end if;
  update core.organizations x set name = coalesce(nullif(pg_catalog.btrim(save_organization.name), ''), x.name), time_zone = coalesce(save_organization.time_zone, x.time_zone), record_view = coalesce(save_organization.record_view, x.record_view)
    where x.id = save_organization.organization_id returning * into o;
  perform core.record_settings_change(o.id, u, 'organizations', o.id, pg_catalog.jsonb_build_object('name', o.name, 'time_zone', o.time_zone, 'record_view', o.record_view));
  return pg_catalog.to_jsonb(o);
end $$;


ALTER FUNCTION public.save_organization(organization_id uuid, name text, time_zone text, record_view text) OWNER TO postgres;

-- enabling a pack: its parameters were ambiguous with the table's columns, and its user's role key used ':' which role keys forbid
CREATE FUNCTION public.save_organization_pack(organization_id uuid, pack text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare u uuid; pu uuid;
begin
  u := core.require_access(save_organization_pack.organization_id, 'manage:organization', null, null);
  if not exists (select 1 from core.packs pk where pk.key = save_organization_pack.pack) then perform core.refuse('unknown_pack', save_organization_pack.pack); end if;
  insert into core.organization_packs (organization_id, pack) values (save_organization_pack.organization_id, save_organization_pack.pack)
    on conflict on constraint organization_packs_pkey do update set retired_at = null;
  -- the pack's own user, holding its role (key pack_<key>) when the pack ships one
  select x.id into pu from core.users x where x.organization_id = save_organization_pack.organization_id and x.kind = 'pack' and x.name = save_organization_pack.pack;
  if pu is null then
    pu := pg_catalog.gen_random_uuid();
    insert into core.users (id, organization_id, kind, name) values (pu, save_organization_pack.organization_id, 'pack', save_organization_pack.pack);
    insert into core.user_roles (organization_id, user_id, role_id)
      select save_organization_pack.organization_id, pu, r.id from core.roles r where r.organization_id is null and r.key = 'pack_' || save_organization_pack.pack;
  else update core.users set retired_at = null where id = pu; end if;
  perform core.record_settings_change(save_organization_pack.organization_id, u, 'organization_packs', pu, pg_catalog.jsonb_build_object('pack', save_organization_pack.pack, 'enabled', true));
end $$;


ALTER FUNCTION public.save_organization_pack(organization_id uuid, pack text) OWNER TO postgres;

CREATE FUNCTION public.save_role(id uuid, organization_id uuid, name text, actions text[] DEFAULT '{}'::text[], seen_change_id uuid DEFAULT NULL::uuid) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
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


ALTER FUNCTION public.save_role(id uuid, organization_id uuid, name text, actions text[], seen_change_id uuid) OWNER TO postgres;

-- 0018 · save_service: a field sent with "choices": null is a number/text field, not a scalar to unpack
CREATE FUNCTION public.save_service(id uuid, organization_id uuid, department_id uuid, code text, name text, reply_type text DEFAULT 'result'::text, section_name text DEFAULT NULL::text, fields jsonb DEFAULT '[]'::jsonb, seen_change_id uuid DEFAULT NULL::uuid, ranges jsonb DEFAULT '[]'::jsonb) RETURNS core.services
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare u uuid; s core.services; f jsonb; i int := 0; fc text; rg jsonb;
begin
  u := core.require_access(organization_id, 'manage:services', null, null);
  perform core.require_fresh('services', id, seen_change_id);
  if reply_type = 'result' and pg_catalog.jsonb_array_length(coalesce(fields, '[]')) = 0 then perform core.refuse('fields_missing', 'a result needs at least one field'); end if;
  if nullif(trim(name), '') is null then perform core.refuse('name_missing'); end if;
  if not exists (select 1 from pg_catalog.jsonb_array_elements(public.read_reply_types(save_service.organization_id)) t where t->>'key' = save_service.reply_type) then
    perform core.refuse('bad_reply_type', reply_type);
  end if;
  insert into core.services (id, organization_id, department_id, section_name, code, name, reply_type)
  values (id, organization_id, department_id, nullif(trim(section_name), ''), lower(trim(code)), trim(name), reply_type)
  on conflict on constraint services_pkey do update set department_id = excluded.department_id, section_name = excluded.section_name, code = excluded.code, name = excluded.name, reply_type = excluded.reply_type
  returning * into s;
  delete from core.service_fields where service_id = s.id;
  for f in select * from pg_catalog.jsonb_array_elements(coalesce(fields, '[]')) loop
    i := i + 1;
    fc := core.local_code(save_service.organization_id, f->>'code', coalesce(f->>'name', f->>'code'), coalesce(f->>'kind', 'number'), f->>'unit');
    insert into core.service_fields (service_id, position, code, name, kind, unit, choices, reference_low, reference_high, critical_low, critical_high)
    values (s.id, i, fc, coalesce(nullif(trim(f->>'name'), ''), (select k.name from core.codes k where k.code = fc)), coalesce(f->>'kind', 'number'),
      coalesce(nullif(trim(f->>'unit'), ''), (select k.unit from core.codes k where k.code = fc)),
      case when pg_catalog.jsonb_typeof(f->'choices') = 'array' then (select pg_catalog.array_agg(x) from pg_catalog.jsonb_array_elements_text(f->'choices') x) end,
      (f->>'reference_low')::numeric, (f->>'reference_high')::numeric, (f->>'critical_low')::numeric, (f->>'critical_high')::numeric);
  end loop;
  delete from core.service_field_ranges where service_id = s.id;
  for rg in select * from pg_catalog.jsonb_array_elements(coalesce(ranges, '[]')) loop
    if (rg->>'position')::int not between 1 and i then perform core.refuse('bad_range', 'no field ' || coalesce(rg->>'position', '?')); end if;
    insert into core.service_field_ranges (service_id, position, sex, age_low, age_high, reference_low, reference_high, critical_low, critical_high)
    values (s.id, (rg->>'position')::smallint, (rg->>'sex')::core.sex, (rg->>'age_low')::int, (rg->>'age_high')::int,
      (rg->>'reference_low')::numeric, (rg->>'reference_high')::numeric, (rg->>'critical_low')::numeric, (rg->>'critical_high')::numeric);
  end loop;
  perform core.record_settings_change(organization_id, u, 'services', s.id, pg_catalog.jsonb_build_object('name', s.name, 'code', s.code, 'department_id', s.department_id, 'fields', i));
  return s;
end $$;


ALTER FUNCTION public.save_service(id uuid, organization_id uuid, department_id uuid, code text, name text, reply_type text, section_name text, fields jsonb, seen_change_id uuid, ranges jsonb) OWNER TO postgres;

-- ── templates, packs ──
CREATE FUNCTION public.save_template(id uuid, organization_id uuid, name text, items jsonb DEFAULT '[]'::jsonb, department_id uuid DEFAULT NULL::uuid, seen_change_id uuid DEFAULT NULL::uuid, shortcut text DEFAULT NULL::text, lines text[] DEFAULT '{}'::text[]) RETURNS core.templates
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare u uuid; t core.templates;
begin
  u := core.require_access(organization_id, 'manage:templates', null, null);
  perform core.require_fresh('templates', id, seen_change_id);
  if pg_catalog.jsonb_array_length(coalesce(items, '[]')) = 0 and coalesce(pg_catalog.array_length(lines, 1), 0) = 0 then perform core.refuse('preset_empty'); end if;
  shortcut := nullif(lower(pg_catalog.btrim(pg_catalog.ltrim(coalesce(shortcut, ''), '/'))), '');
  if shortcut is not null and exists (select 1 from core.templates x where x.organization_id = save_template.organization_id and x.shortcut = save_template.shortcut
                                      and x.retired_at is null and x.id <> save_template.id) then perform core.refuse('shortcut_taken', shortcut); end if;
  insert into core.templates (id, organization_id, department_id, name, items, shortcut, lines)
  values (id, organization_id, department_id, trim(name), coalesce(items, '[]'), shortcut, coalesce((select pg_catalog.array_agg(pg_catalog.btrim(l)) from pg_catalog.unnest(lines) l where pg_catalog.btrim(l) <> ''), '{}'))
  on conflict on constraint templates_pkey do update set name = excluded.name, items = excluded.items, department_id = excluded.department_id,
    shortcut = excluded.shortcut, lines = excluded.lines returning * into t;
  perform core.record_settings_change(organization_id, u, 'templates', t.id, pg_catalog.jsonb_build_object('name', t.name, 'items', pg_catalog.jsonb_array_length(t.items), 'shortcut', t.shortcut, 'lines', coalesce(pg_catalog.array_length(t.lines, 1), 0)));
  return t;
end $$;


ALTER FUNCTION public.save_template(id uuid, organization_id uuid, name text, items jsonb, department_id uuid, seen_change_id uuid, shortcut text, lines text[]) OWNER TO postgres;

-- ── users: another organization's user is not found, never overwritten (found by the K26 review; roles decide who works in a department)
CREATE FUNCTION public.save_user(id uuid, organization_id uuid, kind core.user_kind, name text, title text DEFAULT NULL::text, roles jsonb DEFAULT NULL::jsonb, departments uuid[] DEFAULT NULL::uuid[], retired_at timestamp with time zone DEFAULT NULL::timestamp with time zone, seen_change_id uuid DEFAULT NULL::uuid) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare u uuid; x core.users; r jsonb; n_open int := 0; n_review int := 0;
begin
  u := core.require_access(organization_id, 'manage:users', null, null);
  if id = u then perform core.refuse('self_change'); end if;
  perform 1 from core.organizations o where o.id = save_user.organization_id for update;                            -- the organization lock (spec 02)
  -- another organization's user is not found here, never overwritten (a login may belong to several organizations)
  if exists (select 1 from core.users o where o.id = save_user.id and o.organization_id <> save_user.organization_id) then perform core.refuse('not_found', 'user'); end if;
  perform core.require_fresh('users', id, seen_change_id);
  if kind not in ('staff','machine','importer') and roles is not null and pg_catalog.jsonb_array_length(roles) > 0 then perform core.refuse('roles_not_allowed', kind::text); end if;
  insert into core.users (id, organization_id, kind, name, title, invited_at, retired_at) values (id, organization_id, kind, trim(name), title, case when kind = 'staff' then pg_catalog.now() end, retired_at)
  on conflict on constraint users_pkey do update set name = excluded.name, title = excluded.title, retired_at = excluded.retired_at
  where users.organization_id = excluded.organization_id returning * into x;
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


ALTER FUNCTION public.save_user(id uuid, organization_id uuid, kind core.user_kind, name text, title text, roles jsonb, departments uuid[], retired_at timestamp with time zone, seen_change_id uuid) OWNER TO postgres;

-- ── allergy ──
CREATE FUNCTION public.write_allergy(id uuid, patient_id uuid, visit_id uuid DEFAULT NULL::uuid, department_id uuid DEFAULT NULL::uuid, replaces_id uuid DEFAULT NULL::uuid, occurred_at timestamp with time zone DEFAULT NULL::timestamp with time zone, responsible_id uuid DEFAULT NULL::uuid, source core.entry_source DEFAULT 'staff'::core.entry_source, source_key text DEFAULT NULL::text, stated_author_name text DEFAULT NULL::text, stated_recorded_at timestamp with time zone DEFAULT NULL::timestamp with time zone, written_with_id uuid DEFAULT NULL::uuid, action text DEFAULT 'add'::text, allergy_id uuid DEFAULT NULL::uuid, substance jsonb DEFAULT NULL::jsonb, kind text DEFAULT 'allergy'::text, reactions_text text DEFAULT NULL::text, severity text DEFAULT NULL::text, certainty text DEFAULT 'confirmed'::text, onset_on text DEFAULT NULL::text) RETURNS core.entries
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare h record; a core.patient_allergies; d jsonb; line text;
begin
  select * into h from core.begin_write(patient_id, department_id, 'write:allergy', source, stated_author_name, stated_recorded_at, '{}');
  if action not in ('add','update','refute') then perform core.refuse('bad_action', action); end if;
  if action = 'add' and (substance is null or (substance->>'name') is null) then perform core.refuse('substance_missing'); end if;
  if action <> 'add' then
    select * into a from core.patient_allergies where patient_allergies.id = allergy_id and patient_allergies.patient_id = write_allergy.patient_id;
    if not found then perform core.refuse('allergy_not_found'); end if;
    substance := coalesce(substance, pg_catalog.jsonb_build_object('code', a.substance_code, 'name', a.substance_name, 'class_code', a.class_code));
  end if;
  d := h.o_data || pg_catalog.jsonb_strip_nulls(pg_catalog.jsonb_build_object('action', action, 'allergy_id', allergy_id, 'substance', substance, 'kind', kind,
         'reactions_text', reactions_text, 'severity', severity, 'certainty', certainty, 'onset_on', onset_on));
  line := (substance->>'name') || ' — ' || case action when 'refute' then 'refuted' else pg_catalog.concat_ws(', ', reactions_text, severity) end;
  return core.write_entry(id, h.o_org, patient_id, visit_id, department_id, h.o_author, responsible_id, source, source_key, occurred_at,
    'allergy', null, d, line, null, true, replaces_id, written_with_id, null);
end $$;


ALTER FUNCTION public.write_allergy(id uuid, patient_id uuid, visit_id uuid, department_id uuid, replaces_id uuid, occurred_at timestamp with time zone, responsible_id uuid, source core.entry_source, source_key text, stated_author_name text, stated_recorded_at timestamp with time zone, written_with_id uuid, action text, allergy_id uuid, substance jsonb, kind text, reactions_text text, severity text, certainty text, onset_on text) OWNER TO postgres;

-- ── striking a note as entered in error: the parameter replaces_id was ambiguous with the column, so every strike failed
CREATE FUNCTION public.write_entered_in_error(id uuid, replaces_id uuid, department_id uuid, reason_text text) RETURNS core.entries
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare old core.entries; h record;
begin
  select * into old from core.entries where entries.id = write_entered_in_error.replaces_id;
  if not found then perform core.refuse('not_found', 'replaces'); end if;
  if coalesce(reason_text, '') = '' then perform core.refuse('reason_missing'); end if;
  select * into h from core.begin_write(old.patient_id, department_id, 'write:entered_in_error', 'staff', null, null, '{}');
  return core.write_entry(id, h.o_org, old.patient_id, old.visit_id, department_id, h.o_author, null, 'staff', null, null,
    'entered_in_error', null, pg_catalog.jsonb_build_object('reason_text', reason_text, 'struck_type', old.type), 'Struck: ' || core.short(reason_text, 60), null, true,
    write_entered_in_error.replaces_id, null, null);
end $$;


ALTER FUNCTION public.write_entered_in_error(id uuid, replaces_id uuid, department_id uuid, reason_text text) OWNER TO postgres;

-- ── list_review ──
CREATE FUNCTION public.write_list_review(id uuid, patient_id uuid, visit_id uuid DEFAULT NULL::uuid, department_id uuid DEFAULT NULL::uuid, replaces_id uuid DEFAULT NULL::uuid, occurred_at timestamp with time zone DEFAULT NULL::timestamp with time zone, responsible_id uuid DEFAULT NULL::uuid, source core.entry_source DEFAULT 'staff'::core.entry_source, source_key text DEFAULT NULL::text, stated_author_name text DEFAULT NULL::text, stated_recorded_at timestamp with time zone DEFAULT NULL::timestamp with time zone, written_with_id uuid DEFAULT NULL::uuid, list core.list_kind DEFAULT 'medications'::core.list_kind, outcome text DEFAULT 'reviewed'::text, items uuid[] DEFAULT '{}'::uuid[]) RETURNS core.entries
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $_$
declare h record; n int; line text;
begin
  select * into h from core.begin_write(patient_id, department_id, 'write:list_review', source, stated_author_name, stated_recorded_at, '{}');
  if outcome not in ('reviewed','none_known') then perform core.refuse('bad_outcome', outcome); end if;
  if outcome = 'none_known' then
    execute pg_catalog.format('select count(*) from core.patient_%I where patient_id = $1 and status = %L', list::text, case list when 'allergies' then 'active' else 'active' end) into n using patient_id;
    if n > 0 then perform core.refuse('list_not_empty', list::text); end if;
    line := case list when 'allergies' then 'No known allergies' when 'medications' then 'No current medication' else 'No active problems' end;
  else
    line := initcap(list::text) || ' reviewed' || case when pg_catalog.cardinality(items) > 0 then ' · ' || pg_catalog.cardinality(items) || ' continued' else '' end;
  end if;
  return core.write_entry(id, h.o_org, patient_id, visit_id, department_id, h.o_author, responsible_id, source, source_key, occurred_at,
    'list_review', null, h.o_data || pg_catalog.jsonb_build_object('list', list, 'outcome', outcome, 'items', pg_catalog.to_jsonb(items)), line, null, true, replaces_id, written_with_id, null);
end $_$;


ALTER FUNCTION public.write_list_review(id uuid, patient_id uuid, visit_id uuid, department_id uuid, replaces_id uuid, occurred_at timestamp with time zone, responsible_id uuid, source core.entry_source, source_key text, stated_author_name text, stated_recorded_at timestamp with time zone, written_with_id uuid, list core.list_kind, outcome text, items uuid[]) OWNER TO postgres;

-- ── note ──
CREATE FUNCTION public.write_note(id uuid, patient_id uuid, visit_id uuid DEFAULT NULL::uuid, department_id uuid DEFAULT NULL::uuid, replaces_id uuid DEFAULT NULL::uuid, occurred_at timestamp with time zone DEFAULT NULL::timestamp with time zone, responsible_id uuid DEFAULT NULL::uuid, source core.entry_source DEFAULT 'staff'::core.entry_source, source_key text DEFAULT NULL::text, stated_author_name text DEFAULT NULL::text, stated_recorded_at timestamp with time zone DEFAULT NULL::timestamp with time zone, written_with_id uuid DEFAULT NULL::uuid, kind text DEFAULT 'progress'::text, text text DEFAULT NULL::text, fields jsonb DEFAULT NULL::jsonb, problems jsonb DEFAULT '[]'::jsonb, reply_to_id uuid DEFAULT NULL::uuid, is_final boolean DEFAULT true, files jsonb DEFAULT '[]'::jsonb) RETURNS core.entries
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare h record; r core.requests; d jsonb; line text; e core.entries; f jsonb; i int := 0; label text;
begin
  if write_note.reply_to_id is not null and exists (select 1 from core.entries q join core.services sv on sv.id = q.service_id where q.id = write_note.reply_to_id and sv.reply_type <> 'note') then
    perform core.refuse('wrong_reply_type', 'this request is answered by its service''s reply, not a note');
  end if;
  if kind not in ('progress','history_physical','plan','procedure','nurse','consult_reply','discharge','letter','other') then perform core.refuse('bad_kind', kind); end if;
  if kind = 'consult_reply' then
    if reply_to_id is null then perform core.refuse('reply_to_missing'); end if;
    select * into r from core.requests where requests.entry_id = reply_to_id;
    if not found then perform core.refuse('request_not_found'); end if;
    select * into h from core.begin_write(patient_id, r.to_department_id, 'write:note', source, stated_author_name, stated_recorded_at, '{}');
  else
    if reply_to_id is not null then perform core.refuse('reply_not_allowed', kind); end if;
    select * into h from core.begin_write(patient_id, department_id, 'write:note', source, stated_author_name, stated_recorded_at, '{}');
  end if;
  d := h.o_data || pg_catalog.jsonb_strip_nulls(pg_catalog.jsonb_build_object('kind', kind, 'text', text, 'fields', fields, 'problems', problems,
         'values', case when fields is not null then fields->'values' end));
  label := case kind when 'history_physical' then 'History & physical' when 'consult_reply' then 'Consult reply' else initcap(kind) end;
  line := label || coalesce(' · ' || core.short(split_part(text, E'\n', 1), 80), '');
  e := core.write_entry(id, h.o_org, patient_id, visit_id, department_id, h.o_author, responsible_id, source, source_key, occurred_at,
    'note', null, d, line, reply_to_id, is_final, replaces_id, written_with_id, null);
  for f in select * from pg_catalog.jsonb_array_elements(coalesce(files,'[]')) loop
    i := i + 1;
    insert into core.entry_files (entry_id, position, path, url, mime, name) values (e.id, i, f->>'path', f->>'url', f->>'mime', coalesce(f->>'name', 'file')) on conflict do nothing;
  end loop;
  return e;
end $$;


ALTER FUNCTION public.write_note(id uuid, patient_id uuid, visit_id uuid, department_id uuid, replaces_id uuid, occurred_at timestamp with time zone, responsible_id uuid, source core.entry_source, source_key text, stated_author_name text, stated_recorded_at timestamp with time zone, written_with_id uuid, kind text, text text, fields jsonb, problems jsonb, reply_to_id uuid, is_final boolean, files jsonb) OWNER TO postgres;

-- ── prescription ──
CREATE FUNCTION public.write_prescription(id uuid, patient_id uuid, visit_id uuid DEFAULT NULL::uuid, department_id uuid DEFAULT NULL::uuid, replaces_id uuid DEFAULT NULL::uuid, occurred_at timestamp with time zone DEFAULT NULL::timestamp with time zone, responsible_id uuid DEFAULT NULL::uuid, source core.entry_source DEFAULT 'staff'::core.entry_source, source_key text DEFAULT NULL::text, stated_author_name text DEFAULT NULL::text, stated_recorded_at timestamp with time zone DEFAULT NULL::timestamp with time zone, written_with_id uuid DEFAULT NULL::uuid, action text DEFAULT 'start'::text, medication_id uuid DEFAULT NULL::uuid, drug jsonb DEFAULT NULL::jsonb, dose_number numeric DEFAULT NULL::numeric, dose_unit text DEFAULT NULL::text, route text DEFAULT NULL::text, frequency text DEFAULT NULL::text, prn boolean DEFAULT false, prn_reason_text text DEFAULT NULL::text, duration_days integer DEFAULT NULL::integer, quantity numeric DEFAULT NULL::numeric, repeats integer DEFAULT NULL::integer, instructions_text text DEFAULT NULL::text, problems jsonb DEFAULT '[]'::jsonb, stop_reason_text text DEFAULT NULL::text, send boolean DEFAULT false) RETURNS core.entries
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare h record; m core.patient_medications; d jsonb; line text; dest jsonb; disp uuid; disp_service uuid; dose_text text;
begin
  select * into h from core.begin_write(patient_id, department_id, 'write:prescription', source, stated_author_name, stated_recorded_at, '{}');
  if action not in ('start','repeat','change','stop') then perform core.refuse('bad_action', action); end if;
  if frequency is not null and frequency not in ('OD','BD','TDS','QDS','q4h','q6h','q8h','q12h','weekly','monthly','PRN','once','stat') then perform core.refuse('bad_frequency', frequency); end if;
  if prn and prn_reason_text is null then perform core.refuse('prn_reason_missing'); end if;
  if action = 'start' then
    if drug is null or (drug->>'name') is null then perform core.refuse('drug_missing'); end if;
  else
    select * into m from core.patient_medications where patient_medications.id = medication_id and patient_medications.patient_id = write_prescription.patient_id;
    if not found then perform core.refuse('medication_not_found'); end if;
    if m.status = 'stopped' then perform core.refuse('medication_stopped'); end if;
    drug := coalesce(drug, pg_catalog.jsonb_build_object('code', m.drug_code, 'name', m.drug_name, 'form', m.form, 'strength', m.strength));
  end if;
  dose_text := pg_catalog.concat_ws(' ', dose_number::text, dose_unit, frequency);
  d := h.o_data || pg_catalog.jsonb_strip_nulls(pg_catalog.jsonb_build_object('action', action, 'medication_id', medication_id, 'drug', drug,
    'dose_number', dose_number, 'dose_unit', dose_unit, 'route', route, 'frequency', frequency, 'prn', case when prn then true when action = 'change' then false end, 'prn_reason_text', prn_reason_text,
    'duration_days', duration_days, 'quantity', quantity, 'repeats', repeats, 'instructions_text', instructions_text, 'problems', problems, 'stop_reason_text', stop_reason_text,
    'from', case when action = 'change' then pg_catalog.jsonb_build_object('dose_number', m.dose_number, 'dose_unit', m.dose_unit, 'route', m.route, 'frequency', m.frequency) end));
  line := case action
    when 'start'  then (drug->>'name') || ' ' || dose_text
    when 'repeat' then 'Repeat: ' || (drug->>'name') || ' ' || pg_catalog.concat_ws(' ', m.dose_number::text, m.dose_unit, m.frequency)
    when 'change' then (drug->>'name') || ' ' || pg_catalog.concat_ws(' ', m.dose_number::text, m.dose_unit, m.frequency) || ' → ' || dose_text
    else 'Stopped ' || (drug->>'name') || coalesce(' — ' || core.short(stop_reason_text, 50), '') end;
  -- a request only when the prescriber sends it: to a live service whose reply type answers prescriptions (a pack says so), serving this department
  if send and action in ('start','repeat','change') then
    select s.department_id, s.id into disp, disp_service from core.services s join core.entry_types rt on rt.key = s.reply_type and rt.answers = 'prescription'
      where s.organization_id = h.o_org and s.retired_at is null and s.department_id is not null
        and (not exists (select 1 from core.served_departments sd where sd.department_id = s.department_id)
             or exists (select 1 from core.served_departments sd where sd.department_id = s.department_id and (sd.served_department_id is null or sd.served_department_id = write_prescription.department_id)))
        and (rt.pack is null or exists (select 1 from core.organization_packs op where op.organization_id = h.o_org and op.pack = rt.pack and op.retired_at is null))
      limit 1;
    if disp is null then perform core.refuse('nowhere_to_send', 'no pharmacy serves this department'); end if;
    dest := pg_catalog.jsonb_build_object('to_department_id', disp, 'priority', 'routine');
  end if;
  return core.write_entry(id, h.o_org, patient_id, visit_id, department_id, h.o_author, responsible_id, source, source_key, occurred_at,
    'prescription', case when dest is not null then disp_service end, d, line, null, true, replaces_id, written_with_id, dest);
end $$;


ALTER FUNCTION public.write_prescription(id uuid, patient_id uuid, visit_id uuid, department_id uuid, replaces_id uuid, occurred_at timestamp with time zone, responsible_id uuid, source core.entry_source, source_key text, stated_author_name text, stated_recorded_at timestamp with time zone, written_with_id uuid, action text, medication_id uuid, drug jsonb, dose_number numeric, dose_unit text, route text, frequency text, prn boolean, prn_reason_text text, duration_days integer, quantity numeric, repeats integer, instructions_text text, problems jsonb, stop_reason_text text, send boolean) OWNER TO postgres;

-- ── problem ──
CREATE FUNCTION public.write_problem(id uuid, patient_id uuid, visit_id uuid DEFAULT NULL::uuid, department_id uuid DEFAULT NULL::uuid, replaces_id uuid DEFAULT NULL::uuid, occurred_at timestamp with time zone DEFAULT NULL::timestamp with time zone, responsible_id uuid DEFAULT NULL::uuid, source core.entry_source DEFAULT 'staff'::core.entry_source, source_key text DEFAULT NULL::text, stated_author_name text DEFAULT NULL::text, stated_recorded_at timestamp with time zone DEFAULT NULL::timestamp with time zone, written_with_id uuid DEFAULT NULL::uuid, action text DEFAULT 'add'::text, problem_id uuid DEFAULT NULL::uuid, code text DEFAULT NULL::text, name text DEFAULT NULL::text, status text DEFAULT 'active'::text, onset_on text DEFAULT NULL::text, resolved_on text DEFAULT NULL::text, text text DEFAULT NULL::text, certainty text DEFAULT NULL::text) RETURNS core.entries
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare h record; p core.patient_problems; d jsonb; line text;
begin
  select * into h from core.begin_write(patient_id, department_id, 'write:problem', source, stated_author_name, stated_recorded_at, '{}');
  if action not in ('add','update','resolve') then perform core.refuse('bad_action', action); end if;
  if certainty is not null and certainty not in ('confirmed','suspected') then perform core.refuse('bad_certainty', certainty); end if;
  if action = 'add' and nullif(trim(name), '') is null then perform core.refuse('name_missing'); end if;
  if action <> 'add' then
    select * into p from core.patient_problems where patient_problems.id = problem_id and patient_problems.patient_id = write_problem.patient_id;
    if not found then perform core.refuse('problem_not_found'); end if;
    name := coalesce(name, p.name); code := coalesce(code, p.code);
  end if;
  d := h.o_data || pg_catalog.jsonb_strip_nulls(pg_catalog.jsonb_build_object('action', action, 'problem_id', problem_id, 'code', code, 'name', trim(name), 'status', status,
         'onset_on', onset_on, 'resolved_on', resolved_on, 'text', text, 'certainty', certainty));
  line := case action when 'add' then 'Problem: ' when 'update' then 'Problem updated: ' else 'Problem resolved: ' end || trim(name)
       || case when certainty = 'suspected' then ' (suspected)' else '' end
       || coalesce(' · since ' || nullif(onset_on, ''), '') || coalesce(' — ' || core.short(nullif(text, ''), 60), '');
  return core.write_entry(id, h.o_org, patient_id, visit_id, department_id, h.o_author, responsible_id, source, source_key, occurred_at,
    'problem', null, d, line, null, true, replaces_id, written_with_id, null);
end $$;


ALTER FUNCTION public.write_problem(id uuid, patient_id uuid, visit_id uuid, department_id uuid, replaces_id uuid, occurred_at timestamp with time zone, responsible_id uuid, source core.entry_source, source_key text, stated_author_name text, stated_recorded_at timestamp with time zone, written_with_id uuid, action text, problem_id uuid, code text, name text, status text, onset_on text, resolved_on text, text text, certainty text) OWNER TO postgres;

-- ── request ──
CREATE FUNCTION public.write_request(id uuid, patient_id uuid, visit_id uuid DEFAULT NULL::uuid, department_id uuid DEFAULT NULL::uuid, replaces_id uuid DEFAULT NULL::uuid, occurred_at timestamp with time zone DEFAULT NULL::timestamp with time zone, responsible_id uuid DEFAULT NULL::uuid, source core.entry_source DEFAULT 'staff'::core.entry_source, source_key text DEFAULT NULL::text, stated_author_name text DEFAULT NULL::text, stated_recorded_at timestamp with time zone DEFAULT NULL::timestamp with time zone, written_with_id uuid DEFAULT NULL::uuid, service_id uuid DEFAULT NULL::uuid, priority core.request_priority DEFAULT 'routine'::core.request_priority, due_at timestamp with time zone DEFAULT NULL::timestamp with time zone, question_text text DEFAULT NULL::text, problems jsonb DEFAULT '[]'::jsonb, to_department_id uuid DEFAULT NULL::uuid) RETURNS core.entries
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare h record; s core.services; dest uuid; line text;
begin
  select * into h from core.begin_write(patient_id, department_id, 'write:request', source, stated_author_name, stated_recorded_at,
    pg_catalog.jsonb_strip_nulls(pg_catalog.jsonb_build_object('priority', priority, 'due_at', due_at, 'question_text', question_text, 'problems', problems)));
  -- a request names a service, or — a consult — only the department asked (spec 04: to_department_id)
  if service_id is not null then
    select * into s from core.services where services.id = service_id and services.organization_id = h.o_org;
    if not found then perform core.refuse('service_not_found'); end if;
    if s.retired_at is not null then perform core.refuse('service_retired'); end if;
  elsif to_department_id is null then perform core.refuse('destination_missing');
  elsif not exists (select 1 from core.departments d where d.id = to_department_id and d.organization_id = h.o_org and d.retired_at is null) then
    perform core.refuse('not_found', 'department');
  elsif nullif(pg_catalog.btrim(coalesce(question_text, '')), '') is null then perform core.refuse('question_missing', 'a consult asks a question');
  end if;
  dest := coalesce(s.department_id, to_department_id);
  if dest is null then perform core.refuse('destination_missing'); end if;
  if s.department_id is not null and not exists (
      select 1 from core.served_departments sd where sd.department_id = s.department_id and (sd.served_department_id is null or sd.served_department_id = write_request.department_id))
     and exists (select 1 from core.served_departments sd where sd.department_id = s.department_id) then
    perform core.refuse('not_served', s.name);
  end if;
  if exists (select 1 from core.patients where patients.id = write_request.patient_id and died_on is not null) then perform core.refuse('patient_died'); end if;
  line := coalesce(s.name, 'Consult ' || (select d.name from core.departments d where d.id = dest)) || case when question_text is null then '' else ' — ' || core.short(question_text, 60) end;
  return core.write_entry(id, h.o_org, patient_id, visit_id, department_id, h.o_author, responsible_id, source, source_key, occurred_at,
    'request', service_id, h.o_data, line, null, true, replaces_id, written_with_id,
    pg_catalog.jsonb_build_object('to_department_id', dest, 'priority', priority, 'due_at', due_at));
end $$;


ALTER FUNCTION public.write_request(id uuid, patient_id uuid, visit_id uuid, department_id uuid, replaces_id uuid, occurred_at timestamp with time zone, responsible_id uuid, source core.entry_source, source_key text, stated_author_name text, stated_recorded_at timestamp with time zone, written_with_id uuid, service_id uuid, priority core.request_priority, due_at timestamp with time zone, question_text text, problems jsonb, to_department_id uuid) OWNER TO postgres;

CREATE FUNCTION public.write_result(id uuid, patient_id uuid, visit_id uuid DEFAULT NULL::uuid, department_id uuid DEFAULT NULL::uuid, replaces_id uuid DEFAULT NULL::uuid, occurred_at timestamp with time zone DEFAULT NULL::timestamp with time zone, responsible_id uuid DEFAULT NULL::uuid, source core.entry_source DEFAULT 'staff'::core.entry_source, source_key text DEFAULT NULL::text, stated_author_name text DEFAULT NULL::text, stated_recorded_at timestamp with time zone DEFAULT NULL::timestamp with time zone, written_with_id uuid DEFAULT NULL::uuid, request_id uuid DEFAULT NULL::uuid, "values" jsonb DEFAULT '[]'::jsonb, text text DEFAULT NULL::text, is_final boolean DEFAULT true, not_done boolean DEFAULT false, not_done_reason_text text DEFAULT NULL::text, needs_review boolean DEFAULT true, files jsonb DEFAULT '[]'::jsonb) RETURNS core.entries
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare h record; r core.requests; req core.entries; svc uuid; line text; d jsonb; e core.entries; f jsonb; i int := 0; vals jsonb;
begin
  if request_id is not null then
    select * into r from core.requests where entry_id = request_id;
    if not found then perform core.refuse('request_not_found'); end if;
    select * into req from core.entries where entries.id = request_id;
    svc := req.service_id;
    if svc is not null and (select s.reply_type from core.services s where s.id = svc) <> 'result' then
      perform core.refuse('wrong_reply_type', 'this service is answered by ' || (select s.reply_type from core.services s where s.id = svc));
    end if;
    select * into h from core.begin_write(patient_id, r.to_department_id, 'write:result', source, stated_author_name, stated_recorded_at, '{}');
  else
    if source <> 'outside' then perform core.refuse('request_missing', 'a result without a request is an outside result'); end if;
    select * into h from core.begin_write(patient_id, department_id, 'write:result', source, stated_author_name, stated_recorded_at, '{}');
  end if;
  vals := core.fill_values(svc, patient_id, "values");
  d := h.o_data || pg_catalog.jsonb_strip_nulls(pg_catalog.jsonb_build_object('values', vals, 'text', text, 'not_done', case when not_done then true end, 'not_done_reason_text', not_done_reason_text));
  if not_done then line := 'Not done' || coalesce(' — ' || core.short(not_done_reason_text, 60), '');
  elsif pg_catalog.jsonb_array_length(coalesce(vals,'[]')) > 0 then line := coalesce((req.data->'service'->>'name') || ' · ', '') || core.values_line(vals);
  else line := coalesce((req.data->'service'->>'name') || ' · ', '') || coalesce(core.short(split_part(text, E'\n', 1), 80), 'Result'); end if;
  e := core.write_entry(id, h.o_org, patient_id, coalesce(visit_id, req.visit_id), department_id, h.o_author, responsible_id, source, source_key, occurred_at,
    'result', svc, d, line, request_id, is_final, replaces_id, written_with_id, null, needs_review);
  for f in select * from pg_catalog.jsonb_array_elements(coalesce(files,'[]')) loop
    i := i + 1;
    insert into core.entry_files (entry_id, position, path, url, mime, name) values (e.id, i, f->>'path', f->>'url', f->>'mime', coalesce(f->>'name', 'file'))
    on conflict do nothing;
  end loop;
  return e;
end $$;


ALTER FUNCTION public.write_result(id uuid, patient_id uuid, visit_id uuid, department_id uuid, replaces_id uuid, occurred_at timestamp with time zone, responsible_id uuid, source core.entry_source, source_key text, stated_author_name text, stated_recorded_at timestamp with time zone, written_with_id uuid, request_id uuid, "values" jsonb, text text, is_final boolean, not_done boolean, not_done_reason_text text, needs_review boolean, files jsonb) OWNER TO postgres;

CREATE FUNCTION public.write_set(department_id uuid, items jsonb) RETURNS SETOF core.entries
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare it jsonb; first_id uuid; p jsonb; e core.entries;
begin
  if pg_catalog.jsonb_typeof(items) <> 'array' or pg_catalog.jsonb_array_length(items) = 0 then perform core.refuse('empty_set'); end if;
  first_id := (items->0->'params'->>'id')::uuid;
  if first_id is null then perform core.refuse('id_missing'); end if;
  for it in select * from pg_catalog.jsonb_array_elements(items) loop
    p := (it->'params') || pg_catalog.jsonb_build_object('department_id', department_id, 'written_with_id', first_id);
    e := core.call_write(it->>'function', p);
    return next e;
  end loop;
end $$;


ALTER FUNCTION public.write_set(department_id uuid, items jsonb) OWNER TO postgres;

CREATE FUNCTION public.write_vitals(id uuid, patient_id uuid, visit_id uuid DEFAULT NULL::uuid, department_id uuid DEFAULT NULL::uuid, replaces_id uuid DEFAULT NULL::uuid, occurred_at timestamp with time zone DEFAULT NULL::timestamp with time zone, responsible_id uuid DEFAULT NULL::uuid, source core.entry_source DEFAULT 'staff'::core.entry_source, source_key text DEFAULT NULL::text, stated_author_name text DEFAULT NULL::text, stated_recorded_at timestamp with time zone DEFAULT NULL::timestamp with time zone, written_with_id uuid DEFAULT NULL::uuid, systolic numeric DEFAULT NULL::numeric, diastolic numeric DEFAULT NULL::numeric, pulse numeric DEFAULT NULL::numeric, respiratory_rate numeric DEFAULT NULL::numeric, temperature numeric DEFAULT NULL::numeric, spo2 numeric DEFAULT NULL::numeric, weight numeric DEFAULT NULL::numeric, height numeric DEFAULT NULL::numeric) RETURNS core.entries
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare h record; vals jsonb := '[]'; line text; bmi numeric;
begin
  select * into h from core.begin_write(patient_id, department_id, 'write:vitals', source, stated_author_name, stated_recorded_at, '{}');
  if coalesce(systolic, diastolic, pulse, respiratory_rate, temperature, spo2, weight, height) is null then perform core.refuse('nothing_to_write'); end if;
  if weight is not null and height is not null and height > 0 then bmi := round(weight / ((height/100)^2), 1); end if;
  vals := core.vital(vals, 'loinc:8480-6', 'Systolic', systolic, 'mmHg');  vals := core.vital(vals, 'loinc:8462-4', 'Diastolic', diastolic, 'mmHg');
  vals := core.vital(vals, 'loinc:8867-4', 'Pulse', pulse, 'bpm');         vals := core.vital(vals, 'loinc:9279-1', 'Respiratory rate', respiratory_rate, '/min');
  vals := core.vital(vals, 'loinc:8310-5', 'Temperature', temperature, '°C'); vals := core.vital(vals, 'loinc:59408-5', 'SpO₂', spo2, '%');
  vals := core.vital(vals, 'loinc:29463-7', 'Weight', weight, 'kg');       vals := core.vital(vals, 'loinc:8302-2', 'Height', height, 'cm');
  vals := core.vital(vals, 'loinc:39156-5', 'BMI', bmi, 'kg/m2');
  line := pg_catalog.concat_ws(' · ',
    case when systolic is not null then 'BP ' || systolic || '/' || coalesce(diastolic::text, '–') end,
    case when pulse is not null then 'P ' || pulse end, case when temperature is not null then 'T ' || temperature end,
    case when spo2 is not null then 'SpO₂ ' || spo2 || '%' end, case when weight is not null then 'Wt ' || weight end,
    case when respiratory_rate is not null then 'RR ' || respiratory_rate end);
  return core.write_entry(id, h.o_org, patient_id, visit_id, department_id, h.o_author, responsible_id, source, source_key, occurred_at,
    'vitals', null, h.o_data || pg_catalog.jsonb_build_object('values', vals), line, null, true, replaces_id, written_with_id, null);
end $$;


ALTER FUNCTION public.write_vitals(id uuid, patient_id uuid, visit_id uuid, department_id uuid, replaces_id uuid, occurred_at timestamp with time zone, responsible_id uuid, source core.entry_source, source_key text, stated_author_name text, stated_recorded_at timestamp with time zone, written_with_id uuid, systolic numeric, diastolic numeric, pulse numeric, respiratory_rate numeric, temperature numeric, spo2 numeric, weight numeric, height numeric) OWNER TO postgres;
