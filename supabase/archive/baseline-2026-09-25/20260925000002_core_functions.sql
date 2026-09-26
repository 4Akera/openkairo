-- 02 · core: the functions of schema core (the funnels, gates, updaters, reads' helpers), one definition each, by name.

set check_function_bodies = false;
select pg_catalog.set_config('search_path', '', false);
set client_min_messages = warning;

CREATE FUNCTION core.age_on(born core.partial_date, at_date date) RETURNS integer
    LANGUAGE sql IMMUTABLE STRICT
    AS $$
  select extract(year from age(at_date,
    make_date(substr(born,1,4)::int,
              coalesce(nullif(substr(born,6,2),'')::int, 7),
              coalesce(nullif(substr(born,9,2),'')::int, 1))))::int
$$;


ALTER FUNCTION core.age_on(born core.partial_date, at_date date) OWNER TO postgres;

SET default_tablespace = '';

SET default_table_access_method = heap;

-- ── updater dispatch: only a security definer function owned by the right role is ever called ──
CREATE FUNCTION core.apply_updater(e core.entries) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $_$
declare t record; v_fn text; v_owner text;
begin
  if e.type = 'list_review' then perform core.update_list_reviews(e); return; end if;
  select list, pack, pack_list into t from core.entry_types where key = e.type;
  if t.list is not null then
    execute pg_catalog.format('select core.update_%I($1)', t.list::text) using e;
  elsif t.pack_list is not null then
    v_fn := pg_catalog.format('%I.update_%I', t.pack, t.pack_list);
    select r.rolname into v_owner from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid = p.pronamespace
      join pg_catalog.pg_roles r on r.oid = p.proowner
      where n.nspname = t.pack and p.proname = 'update_' || t.pack_list and p.prosecdef;
    if v_owner is distinct from 'pack_' || t.pack then perform core.refuse('bad_updater', v_fn); end if;
    execute pg_catalog.format('select %s($1)', v_fn) using e;
  end if;
end $_$;


ALTER FUNCTION core.apply_updater(e core.entries) OWNER TO postgres;

CREATE FUNCTION core.auth_aal() RETURNS text
    LANGUAGE sql STABLE
    AS $$
  select coalesce(nullif(current_setting('request.jwt.claim.aal', true), ''),
                  nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'aal', 'aal1')
$$;


ALTER FUNCTION core.auth_aal() OWNER TO postgres;

-- 0016 · PostgREST publishes the JWT as one JSON setting (request.jwt.claims); the per-claim settings the tests use stay as a fallback
CREATE FUNCTION core.auth_uid() RETURNS uuid
    LANGUAGE sql STABLE
    AS $$
  select coalesce(nullif(current_setting('request.jwt.claim.sub', true), ''),
                  nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')::uuid
$$;


ALTER FUNCTION core.auth_uid() OWNER TO postgres;

-- the header every write shares: returns [org, author, data-with-stated-fields]
CREATE FUNCTION core.begin_write(p_patient_id uuid, p_department_id uuid, p_action text, p_source core.entry_source, p_stated_author_name text, p_stated_recorded_at timestamp with time zone, p_data jsonb, OUT o_org uuid, OUT o_author uuid, OUT o_data jsonb) RETURNS record
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
begin
  o_org := core.org_of_patient(p_patient_id);
  if o_org is null then perform core.refuse('wrong_organization', 'patient'); end if;
  o_author := core.require_access(o_org, p_action, p_patient_id, p_department_id);
  o_data := coalesce(p_data, '{}'::jsonb);
  if p_source = 'outside' then
    o_data := o_data || pg_catalog.jsonb_strip_nulls(pg_catalog.jsonb_build_object('stated_author_name', p_stated_author_name, 'stated_recorded_at', p_stated_recorded_at));
  end if;
end $$;


ALTER FUNCTION core.begin_write(p_patient_id uuid, p_department_id uuid, p_action text, p_source core.entry_source, p_stated_author_name text, p_stated_recorded_at timestamp with time zone, p_data jsonb, OUT o_org uuid, OUT o_author uuid, OUT o_data jsonb) OWNER TO postgres;

-- ── write_set: everything one Done sends, all-or-nothing ──
-- item: {"function": "write_note", "params": {…}}; the first item's id is written_with_id on every member
CREATE FUNCTION core.call_write(fn text, params jsonb) RETURNS core.entries
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $_$
declare args text; e core.entries;
begin
  -- core writers, and a pack's writers <key>_write_<type> (they gate themselves: require_access + require_pack)
  if fn = 'write_set' or not (fn like 'write\_%' or exists (select 1 from core.packs pk where fn like pk.key || '\_write\_%')) then
    perform core.refuse('bad_function', fn);
  end if;
  select pg_catalog.string_agg(pg_catalog.format('%I := %s', a.name,
      case when a.type = 'jsonb' then pg_catalog.format('($1->%L)', a.name)
           when a.type like '%[]' then pg_catalog.format('(select pg_catalog.array_agg(x) from pg_catalog.jsonb_array_elements_text($1->%L) x)::%s', a.name, a.type)
           else pg_catalog.format('($1->>%L)::%s', a.name, a.type) end), ', ')
    into args
  from (select n2.name, pg_catalog.format_type(t2.oid, null) as type
        from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid = p.pronamespace
        cross join lateral pg_catalog.unnest(p.proargnames) with ordinality as n2(name, i)
        join lateral pg_catalog.unnest(p.proargtypes::oid[]) with ordinality as t2(oid, i) on t2.i = n2.i
        where n.nspname = 'public' and p.proname = fn) a
  where params ? a.name;
  if args is null then perform core.refuse('no_params', fn); end if;
  execute pg_catalog.format('select * from public.%I(%s)', fn, args) into e using params;
  return e;
end $_$;


ALTER FUNCTION core.call_write(fn text, params jsonb) OWNER TO postgres;

-- ── may: the gate's answer without refusing (same widening as require_access) ──
CREATE FUNCTION core.can(p_user uuid, p_org uuid, p_action text, p_department uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  select exists (select 1 from core.user_roles ur join core.role_actions ra on ra.role_id = ur.role_id join core.roles r on r.id = ur.role_id and r.retired_at is null
                 where ur.user_id = p_user and ur.organization_id = p_org and ra.action = p_action
                   and (ur.department_id is null or p_department is null or ur.department_id = p_department))
      or (p_action in ('read:queue','write:visit') and p_department is not null and exists (
                 select 1 from core.user_roles ur join core.role_actions ra on ra.role_id = ur.role_id and ra.action = p_action
                 join core.served_departments sd on sd.department_id = ur.department_id
                 where ur.user_id = p_user and ur.organization_id = p_org and (sd.served_department_id = p_department or sd.served_department_id is null)))
$$;


ALTER FUNCTION core.can(p_user uuid, p_org uuid, p_action text, p_department uuid) OWNER TO postgres;

-- a correction's whole chain, from the first version to the last, walking replaces_id (indexed) — never the whole table
CREATE FUNCTION core.chain_of(p_entry uuid) RETURNS SETOF core.entries
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  with recursive up as (select e.* from core.entries e where e.id = p_entry
                        union all select p.* from core.entries p join up on p.id = up.replaces_id),
       down as (select e.* from core.entries e where e.id = (select id from up where replaces_id is null limit 1)
                union all select n.* from core.entries n join down on n.replaces_id = down.id)
  select * from down
$$;


ALTER FUNCTION core.chain_of(p_entry uuid) OWNER TO postgres;

-- the step path: compare-and-set; legal moves only; pack steps never close
CREATE FUNCTION core.change_request(p_request_id uuid, p_from core.request_step, p_to core.request_step, p_actor uuid, p_reason text DEFAULT NULL::text, p_changes jsonb DEFAULT NULL::jsonb, p_occurred_at timestamp with time zone DEFAULT NULL::timestamp with time zone) RETURNS core.requests
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare r core.requests; legal boolean;
begin
  select * into r from core.requests where entry_id = p_request_id for update;
  if not found then perform core.refuse('request_not_found'); end if;
  if r.step <> p_from then perform core.refuse('request_moved', r.step::text); end if;
  legal := case
    when p_to = 'sent' then p_from = 'held'
    when p_to = 'held' then r.status = 'open'
    when p_to = 'cancelled' then r.status = 'open'
    when p_to = 'done' then r.status = 'open'
    when p_to = 'reopened' then false
    when p_to = 'replied' then false
    else r.status = 'open' end;                  -- started and every pack step, while open
  if not legal then perform core.refuse('illegal_move', p_from::text || ' → ' || p_to::text); end if;
  if p_to = 'cancelled' and coalesce(p_reason, '') = '' then perform core.refuse('reason_missing'); end if;
  perform pg_catalog.set_config('opencare.in_change_request', 'true', true);
  update core.requests set step = p_to, status_reason = coalesce(p_reason, status_reason),
    review_needed_at = case when p_to = 'cancelled' and p_actor <> requester_id then pg_catalog.clock_timestamp() else review_needed_at end
    where entry_id = p_request_id returning * into r;
  perform pg_catalog.set_config('opencare.in_change_request', 'false', true);
  insert into core.request_steps (organization_id, request_id, position, step, actor_id, reason, changes, occurred_at)
  values (r.organization_id, p_request_id, core.next_step_position(p_request_id), p_to, p_actor, p_reason, p_changes, coalesce(p_occurred_at, pg_catalog.clock_timestamp()));
  perform core.signal('queue:' || r.to_department_id::text, pg_catalog.jsonb_build_object('entry_id', p_request_id));
  return r;
end $$;


ALTER FUNCTION core.change_request(p_request_id uuid, p_from core.request_step, p_to core.request_step, p_actor uuid, p_reason text, p_changes jsonb, p_occurred_at timestamp with time zone) OWNER TO postgres;

-- ── visits ──
CREATE FUNCTION core.change_visit(v core.visits, p_status core.visit_status, p_actor uuid, p_reason text, p_changes jsonb) RETURNS core.visits
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare n smallint;
begin
  select coalesce(max(position), 0) + 1 into n from core.visit_steps where visit_id = v.id;
  insert into core.visit_steps (organization_id, visit_id, position, status, actor_id, reason, changes) values (v.organization_id, v.id, n, p_status, p_actor, p_reason, p_changes);
  perform core.signal('queue:' || v.department_id::text, pg_catalog.jsonb_build_object('visit_id', v.id));
  return v;
end $$;


ALTER FUNCTION core.change_visit(v core.visits, p_status core.visit_status, p_actor uuid, p_reason text, p_changes jsonb) OWNER TO postgres;

CREATE FUNCTION core.check_time_zone() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO ''
    AS $$
begin
  if not exists (select 1 from pg_catalog.pg_timezone_names where name = new.time_zone) then perform core.refuse('bad_time_zone', new.time_zone); end if;
  return new;
end $$;


ALTER FUNCTION core.check_time_zone() OWNER TO postgres;

-- the clinician's Done: what came back before now was on their screen; criticals still need an explicit review
CREATE FUNCTION core.clear_seen(p_visit_id uuid, p_actor uuid) RETURNS integer
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare r core.requests; n int := 0;
begin
  for r in select rr.* from core.requests rr join core.entries e on e.id = rr.entry_id
           where e.visit_id = p_visit_id and rr.review_needed_at is not null and coalesce(rr.review_reason, '') <> 'critical' loop
    perform pg_catalog.set_config('opencare.in_change_request', 'true', true);
    update core.requests set review_needed_at = null where entry_id = r.entry_id;
    perform pg_catalog.set_config('opencare.in_change_request', 'false', true);
    insert into core.request_steps (organization_id, request_id, position, step, actor_id, changes, occurred_at)
    values (r.organization_id, r.entry_id, core.next_step_position(r.entry_id), r.step, p_actor, '{"reviewed": true, "at_done": true}', pg_catalog.clock_timestamp());
    n := n + 1;
  end loop;
  return n;
end $$;


ALTER FUNCTION core.clear_seen(p_visit_id uuid, p_actor uuid) OWNER TO postgres;

-- 0005 · the gate (spec 02): who is calling, and may they do this here
CREATE FUNCTION core.current_user_id(p_organization_id uuid) RETURNS uuid
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
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


ALTER FUNCTION core.current_user_id(p_organization_id uuid) OWNER TO postgres;

CREATE FUNCTION core.day_start(p_org uuid) RETURNS timestamp with time zone
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  select pg_catalog.date_trunc('day', pg_catalog.now() at time zone z) at time zone z
  from (select coalesce((select o.time_zone from core.organizations o where o.id = p_org), 'UTC') as z) t
$$;


ALTER FUNCTION core.day_start(p_org uuid) OWNER TO postgres;

-- permanence: the only UPDATE is replaced_by_id NULL → value; DELETE only inside erase_patient
CREATE FUNCTION core.entries_permanent() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
begin
  if tg_op = 'DELETE' then
    if current_setting('opencare.erasing', true) = 'true' then return old; end if;
    raise exception 'entries are permanent' using errcode = '55000';
  end if;
  if old.replaced_by_id is null and new.replaced_by_id is not null
     and row(new.id,new.organization_id,new.patient_id,new.visit_id,new.author_id,new.responsible_id,new.department_id,new.source,new.source_key,new.occurred_at,new.recorded_at,new.type,new.service_id,new.data,new.display_line,new.flag,new.reply_to_id,new.is_final,new.replaces_id,new.written_with_id)
       is not distinct from row(old.id,old.organization_id,old.patient_id,old.visit_id,old.author_id,old.responsible_id,old.department_id,old.source,old.source_key,old.occurred_at,old.recorded_at,old.type,old.service_id,old.data,old.display_line,old.flag,old.reply_to_id,old.is_final,old.replaces_id,old.written_with_id)
  then return new; end if;
  raise exception 'entries are permanent (only replaced_by_id may be set, once)' using errcode = '55000';
end $$;


ALTER FUNCTION core.entries_permanent() OWNER TO postgres;

-- ── masks, per note, with the real department name always
CREATE FUNCTION core.entry_card(e core.entries) RETURNS jsonb
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  select pg_catalog.jsonb_build_object(
    'id', e.id, 'type', e.type, 'occurred_at', e.occurred_at, 'recorded_at', e.recorded_at,
    'author_name', e.data->>'author_name', 'department_name', e.data->>'department_name',
    'display_line', e.display_line, 'flag', e.flag, 'is_final', e.is_final, 'source', e.source,
    'reply_to_id', e.reply_to_id, 'replaces_id', e.replaces_id, 'replaced_by_id', e.replaced_by_id, 'visit_id', e.visit_id, 'service_id', e.service_id)
  || coalesce((select pg_catalog.jsonb_build_object('request', pg_catalog.jsonb_build_object('step', r.step, 'status', r.status, 'status_reason', r.status_reason,
        'to_department_id', r.to_department_id, 'to_department_name', e.data->>'to_department_name', 'priority', r.priority, 'due_at', r.due_at,
        'reply_line', r.reply_line, 'reply_flag', r.reply_flag, 'replied_at', r.replied_at, 'review_needed_at', r.review_needed_at, 'review_reason', r.review_reason))
      from core.requests r where r.entry_id = e.id), '{}'::jsonb)
$$;


ALTER FUNCTION core.entry_card(e core.entries) OWNER TO postgres;

-- ── masks, per note, with the real department name always
CREATE FUNCTION core.entry_card(e core.entries, p_hidden uuid[]) RETURNS jsonb
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  select case
    when e.id = any(p_hidden) then pg_catalog.jsonb_build_object(
      'id', e.id, 'type', e.type, 'occurred_at', e.occurred_at, 'recorded_at', e.recorded_at, 'author_name', null,
      'department_name', (select d.name from core.departments d where d.id = e.department_id), 'department_id', e.department_id,
      'display_line', 'Private note', 'flag', null, 'is_final', e.is_final, 'source', e.source, 'reply_to_id', e.reply_to_id, 'replaces_id', e.replaces_id,
      'replaced_by_id', e.replaced_by_id, 'visit_id', e.visit_id, 'service_id', null, 'is_hidden', true)
    else core.entry_card(e)
      || case when exists (select 1 from core.requests r where r.entry_id = e.id)
               and exists (select 1 from core.entries x where x.reply_to_id = e.id and x.replaced_by_id is null and x.type <> 'entered_in_error' and x.id = any(p_hidden))
              then pg_catalog.jsonb_build_object('request', (core.entry_card(e)->'request') || '{"reply_line": "Private reply", "reply_flag": null, "review_reason": null}'::jsonb)
              else '{}'::jsonb end
  end
$$;


ALTER FUNCTION core.entry_card(e core.entries, p_hidden uuid[]) OWNER TO postgres;

CREATE FUNCTION core.entry_data(e core.entries, p_hidden uuid[]) RETURNS jsonb
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  select case when e.id = any(p_hidden) then '{}'::jsonb else e.data end
$$;


ALTER FUNCTION core.entry_data(e core.entries, p_hidden uuid[]) OWNER TO postgres;

-- inserts the extractable values of an entry
CREATE FUNCTION core.extract_values(e core.entries) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare v jsonb; i int := 0; f core.value_flag; v_unit text;
begin
  for v in select * from pg_catalog.jsonb_array_elements(coalesce(e.data->'values', '[]'::jsonb)) loop
    i := i + 1;
    f := core.flag_of(v);
    select unit into v_unit from core.codes where code = v->>'code';
    -- unknown code or a unit that does not match: shown from data, never trended
    if found and (v_unit is null or v_unit = v->>'unit') then
      insert into core.entry_values (entry_id, position, organization_id, patient_id, code, value_number, value_text, unit, flag, source, occurred_at)
      values (e.id, i, e.organization_id, e.patient_id, v->>'code', (v->>'value_number')::numeric, v->>'value_text', v->>'unit', f, e.source,
              coalesce((v->>'occurred_at')::timestamptz, e.occurred_at));
    end if;
  end loop;
end $$;


ALTER FUNCTION core.extract_values(e core.entries) OWNER TO postgres;

-- 0017 · results are self-contained (spec 01): at write time each value gets the service field's name, unit, the range that
-- fits the patient (sex/age row, else the field's own) and a flag computed once. The writer may still send its own ranges/flag.
CREATE FUNCTION core.fill_values(p_service uuid, p_patient uuid, vals jsonb) RETURNS jsonb
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare v jsonb; f core.service_fields; rg core.service_field_ranges; p core.patients; a int; out jsonb := '[]'; i int := 0;
begin
  if p_service is null then return coalesce(vals, '[]'); end if;
  select * into p from core.patients where id = p_patient;
  a := core.age_on(p.born_on, core.today(p.organization_id));
  for v in select x from pg_catalog.jsonb_array_elements(coalesce(vals, '[]')) x loop
    i := i + 1;
    select * into f from core.service_fields sf where sf.service_id = p_service and sf.retired_at is null
      and (sf.code = v->>'code' or (v->>'code' is null and sf.position = i)) limit 1;
    if found then
      select * into rg from core.service_field_ranges r where r.service_id = p_service and r.position = f.position
        and (r.sex is null or r.sex = p.sex) and (r.age_low is null or a >= r.age_low) and (r.age_high is null or a < r.age_high)
        order by (r.sex is not null) desc, (r.age_low is not null or r.age_high is not null) desc limit 1;
      v := pg_catalog.jsonb_strip_nulls(pg_catalog.jsonb_build_object(
             'code', f.code, 'name', f.name, 'unit', f.unit,
             'reference_low', coalesce(rg.reference_low, f.reference_low), 'reference_high', coalesce(rg.reference_high, f.reference_high),
             'critical_low', coalesce(rg.critical_low, f.critical_low), 'critical_high', coalesce(rg.critical_high, f.critical_high))) || v;
    end if;
    if not (v ? 'flag') then v := v || pg_catalog.jsonb_strip_nulls(pg_catalog.jsonb_build_object('flag', core.flag_of(v))); end if;
    out := out || v;
  end loop;
  return out;
end $$;


ALTER FUNCTION core.fill_values(p_service uuid, p_patient uuid, vals jsonb) OWNER TO postgres;

CREATE FUNCTION core.finish_pack_call(p_pack text, p_entry_id uuid, p_error text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
begin
  if p_error is null then delete from core.pack_calls where pack = p_pack and entry_id = p_entry_id;
  else update core.pack_calls set error_text = left(p_error, 2000) where pack = p_pack and entry_id = p_entry_id; end if;
end $$;


ALTER FUNCTION core.finish_pack_call(p_pack text, p_entry_id uuid, p_error text) OWNER TO postgres;

-- ── values: data.values[] → entry_values, flags computed once ──
CREATE FUNCTION core.flag_of(v jsonb) RETURNS core.value_flag
    LANGUAGE sql IMMUTABLE
    AS $$
  select case
    when v ? 'flag' and (v->>'flag') is not null then (v->>'flag')::core.value_flag
    when (v->>'value_number') is null then null
    when (v->>'critical_low')  is not null and (v->>'value_number')::numeric < (v->>'critical_low')::numeric  then 'critical'
    when (v->>'critical_high') is not null and (v->>'value_number')::numeric > (v->>'critical_high')::numeric then 'critical'
    when (v->>'reference_low')  is not null and (v->>'value_number')::numeric < (v->>'reference_low')::numeric  then 'low'
    when (v->>'reference_high') is not null and (v->>'value_number')::numeric > (v->>'reference_high')::numeric then 'high'
    when (v->>'reference_low') is not null or (v->>'reference_high') is not null then 'normal'
    else null end
$$;


ALTER FUNCTION core.flag_of(v jsonb) OWNER TO postgres;

-- the patient is no longer there: every result that came back since the clinician last saw them goes to review
CREATE FUNCTION core.flag_unseen(p_visit_id uuid) RETURNS integer
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare last_consult timestamptz; n int;
begin
  select max(s.recorded_at) into last_consult from core.visit_steps s where s.visit_id = p_visit_id and s.status = 'in_consult';
  perform pg_catalog.set_config('opencare.in_change_request', 'true', true);
  update core.requests r set review_needed_at = pg_catalog.clock_timestamp(), review_reason = 'not seen'
    from core.entries e where e.id = r.entry_id and e.visit_id = p_visit_id and r.replied_at is not null and r.review_needed_at is null
      and r.replied_at > coalesce(last_consult, '-infinity')
      and not exists (select 1 from core.request_steps st where st.request_id = r.entry_id and st.changes ? 'reviewed' and st.recorded_at > r.replied_at);
  get diagnostics n = row_count;
  perform pg_catalog.set_config('opencare.in_change_request', 'false', true);
  return n;
end $$;


ALTER FUNCTION core.flag_unseen(p_visit_id uuid) OWNER TO postgres;

-- unaccent is STABLE; an index needs IMMUTABLE. Wrapping it with a fixed dictionary is the standard idiom.
CREATE FUNCTION core.fold(t text) RETURNS text
    LANGUAGE sql IMMUTABLE STRICT PARALLEL SAFE
    AS $$
  select lower(extensions.unaccent('extensions.unaccent'::regdictionary, t))
$$;


ALTER FUNCTION core.fold(t text) OWNER TO postgres;

-- the ids of every hidden note of these patients (all versions), in one query; every mask tests e.id = any(hidden)
CREATE FUNCTION core.hidden_entries(p_reader uuid, p_patient_ids uuid[]) RETURNS uuid[]
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  with priv as (select distinct on (np.entry_id) np.entry_id as root, np.is_private from core.note_privacy np
                where np.patient_id = any(p_patient_ids) order by np.entry_id, np.changed_at desc, np.id desc)
  select coalesce(pg_catalog.array_agg(e.id), '{}') from priv cross join lateral core.chain_of(priv.root) e
  where priv.is_private and core.note_hidden(e, p_reader)
$$;


ALTER FUNCTION core.hidden_entries(p_reader uuid, p_patient_ids uuid[]) OWNER TO postgres;

-- the same for one patient and every record merged into it
CREATE FUNCTION core.hidden_for(p_user uuid, p_patient uuid) RETURNS uuid[]
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  select core.hidden_entries(p_user, (select pg_catalog.array_agg(x.id) from core.patients x where x.id = core.survivor(p_patient) or x.merged_into_id = core.survivor(p_patient)))
$$;


ALTER FUNCTION core.hidden_for(p_user uuid, p_patient uuid) OWNER TO postgres;

-- ── holds: what keeps a visit pending (spec 03) ──
CREATE FUNCTION core.holds(p_visit_id uuid) RETURNS integer
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  select count(*)::int
  from core.requests r join core.entries e on e.id = r.entry_id
  join core.departments d on d.id = r.to_department_id
  where e.visit_id = p_visit_id and r.status = 'open' and e.type <> 'prescription'
    and not d.is_outside and r.due_at <= pg_catalog.now() + interval '14 days'
$$;


ALTER FUNCTION core.holds(p_visit_id uuid) OWNER TO postgres;

CREATE FUNCTION core.is_note(p_type text) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$ select coalesce((select t.is_note from core.entry_types t where t.key = p_type), false) $$;


ALTER FUNCTION core.is_note(p_type text) OWNER TO postgres;

-- codes: an organization's own codes are 'local:<org8>.<slug>'; a field typed without a registered code gets one
CREATE FUNCTION core.local_code(p_org uuid, p_code text, p_name text, p_kind text, p_unit text) RETURNS text
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $_$
declare c text := nullif(trim(p_code), ''); slug text;
begin
  if c is not null and exists (select 1 from core.codes k where k.code = c and (k.organization_id is null or k.organization_id = p_org)) then return c; end if;
  if c is not null and c ~ '^[a-z0-9_]+:[^\s]+$' then perform core.refuse('unknown_code', c); end if;   -- a system code nobody registered
  slug := trim(both '_' from regexp_replace(lower(core.fold(coalesce(c, p_name))), '[^a-z0-9]+', '_', 'g'));
  if slug = '' then perform core.refuse('code_missing', p_name); end if;
  c := 'local:' || left(p_org::text, 8) || '.' || slug;
  insert into core.codes (code, name, kind, unit, organization_id) values (c, trim(p_name), coalesce(p_kind, 'number'), nullif(trim(p_unit), ''), p_org)
  on conflict (code) do nothing;
  return c;
end $_$;


ALTER FUNCTION core.local_code(p_org uuid, p_code text, p_name text, p_kind text, p_unit text) OWNER TO postgres;

CREATE FUNCTION core.local_date(p_org uuid, p_at timestamp with time zone) RETURNS date
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  select (p_at at time zone coalesce((select o.time_zone from core.organizations o where o.id = p_org), 'UTC'))::date
$$;


ALTER FUNCTION core.local_date(p_org uuid, p_at timestamp with time zone) OWNER TO postgres;

CREATE FUNCTION core.lock_record(p_patient_id uuid) RETURNS void
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO ''
    AS $$
  select pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext('record:' || core.survivor(p_patient_id)::text))
$$;


ALTER FUNCTION core.lock_record(p_patient_id uuid) OWNER TO postgres;

-- a step or a routing change returns the request row: department names are real, but a hidden reply's line, flag and review reason are
-- masked here as everywhere a request is returned
CREATE FUNCTION core.masked_request(r core.requests, p_reader uuid) RETURNS core.requests
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
begin
  if exists (select 1 from core.entries x where x.reply_to_id = r.entry_id and x.replaced_by_id is null and x.type <> 'entered_in_error' and core.note_hidden(x, p_reader)) then
    r.reply_line := 'Private reply'; r.reply_flag := null; r.review_reason := null;
  end if;
  return r;
end $$;


ALTER FUNCTION core.masked_request(r core.requests, p_reader uuid) OWNER TO postgres;

-- ── the live channels: the check reads core tables, which `authenticated` cannot, so a definer function answers it. A record channel
-- also needs an opened record (a record_reads row by this user for this patient within 12 hours).
CREATE FUNCTION core.may_listen(p_topic text) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  select exists (select 1 from core.users u where u.login_id = core.auth_uid() and (u.retired_at is null or u.retired_at > pg_catalog.now())
    and ((p_topic like 'queue:%' and exists (select 1 from core.departments d where d.id::text = pg_catalog.substr(p_topic, 7) and d.organization_id = u.organization_id
                                              and core.can(u.id, u.organization_id, 'read:queue', d.id)))
      or (p_topic like 'record:%' and exists (select 1 from core.patients p where p.id::text = pg_catalog.substr(p_topic, 8) and p.organization_id = u.organization_id
                                              and core.can(u.id, u.organization_id, 'read:record', null)
                                              and exists (select 1 from core.record_reads rr where rr.user_id = u.id and rr.patient_id = p.id
                                                          and rr.read_at > pg_catalog.now() - interval '12 hours')))))
$$;


ALTER FUNCTION core.may_listen(p_topic text) OWNER TO postgres;

-- one due call, locked, tries counted; NULL when nothing is due
CREATE FUNCTION core.next_pack_call() RETURNS TABLE(pack text, entry_id uuid, organization_id uuid, entry core.entries)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare c core.pack_calls;
begin
  select * into c from core.pack_calls pc
    where pc.tries < 5 and (pc.tried_at is null or pc.tried_at + (interval '1 minute' * least(60, 2 ^ pc.tries)) < pg_catalog.now())
      and exists (select 1 from core.organization_packs op where op.organization_id = pc.organization_id and op.pack = pc.pack and op.retired_at is null)
    order by pc.recorded_at limit 1 for update skip locked;
  if not found then return; end if;
  update core.pack_calls set tries = tries + 1, tried_at = pg_catalog.now() where pack_calls.pack = c.pack and pack_calls.entry_id = c.entry_id;
  return query select c.pack, c.entry_id, c.organization_id, e from core.entries e where e.id = c.entry_id;
  if not found then delete from core.pack_calls where pack_calls.pack = c.pack and pack_calls.entry_id = c.entry_id; end if;
end $$;


ALTER FUNCTION core.next_pack_call() OWNER TO postgres;

-- ── requests: the fold from replies, and the step path ──
CREATE FUNCTION core.next_step_position(p_request_id uuid) RETURNS smallint
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  select coalesce(max(position), 0) + 1 from core.request_steps where request_id = p_request_id
$$;


ALTER FUNCTION core.next_step_position(p_request_id uuid) OWNER TO postgres;

-- hidden from this reader: private, and the reader does not work there, did not open that department's notes of this patient anyway
-- within 12 hours, is not its author or responsible clinician, and is not the one who asked (a consult reply)
CREATE FUNCTION core.note_hidden(e core.entries, p_reader uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  select core.note_private(e)
     and not core.works_in(p_reader, e.department_id)
     and p_reader is distinct from e.author_id and p_reader is distinct from e.responsible_id
     and not exists (select 1 from core.record_reads rr where rr.user_id = p_reader and rr.basis = 'anyway' and rr.opened_department_id = e.department_id
                      and rr.patient_id = core.survivor(e.patient_id) and rr.read_at > pg_catalog.now() - interval '12 hours')
     and not core.reply_for(e, p_reader)
$$;


ALTER FUNCTION core.note_hidden(e core.entries, p_reader uuid) OWNER TO postgres;

-- ── backfill, while visits still carry their privacy: every note in a private visit, and every note written in a department while
-- its rule was on (unless it sits in one of that department's own visits made not private by hand), becomes private in its own
-- department. A function, so the rule can be tested with fixtures after visits.is_private is gone.
CREATE FUNCTION core.note_privacy_backfill(p_private_visits uuid[]) RETURNS TABLE(organization_id uuid, entry_id uuid, patient_id uuid, department_id uuid, changed_by uuid, changed_at timestamp with time zone)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  select distinct on (r.root) e.organization_id, r.root, e.patient_id, e.department_id, e.author_id, e.recorded_at
  from core.entries e
  cross join lateral (select core.root_of(e.id) as root) r
  join core.entry_types t on t.key = e.type and t.is_note
  where e.visit_id = any(p_private_visits)
     or (coalesce((select (sc.changes->>'private_visits')::boolean from core.settings_changes sc
                   where sc.table_name = 'departments' and sc.row_id = e.department_id and sc.changes ? 'private_visits' and sc.recorded_at <= e.recorded_at
                   order by sc.recorded_at desc limit 1), false)
         and not exists (select 1 from core.visit_steps s join core.visits v on v.id = s.visit_id
                         where s.visit_id = e.visit_id and v.department_id = e.department_id and s.changes->>'is_private' = 'false'))
  order by r.root, e.recorded_at
$$;


ALTER FUNCTION core.note_privacy_backfill(p_private_visits uuid[]) OWNER TO postgres;

-- ── the one test: a note is private when the latest row of its chain says so
CREATE FUNCTION core.note_private(e core.entries) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  select core.is_note(e.type) and coalesce((select np.is_private from core.note_privacy np where np.entry_id = core.root_of(e.id)
                                            order by np.changed_at desc, np.id desc limit 1), false)
$$;


ALTER FUNCTION core.note_private(e core.entries) OWNER TO postgres;

-- humans open the record; machines, packs and importers read without a row
CREATE FUNCTION core.open_record(p_org uuid, p_user uuid, p_patient uuid, p_department uuid, p_open_department uuid, p_reason text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare k core.user_kind; v_basis text; ids uuid[];
begin
  if p_open_department is null and exists (select 1 from core.record_reads rr where rr.user_id = p_user and rr.patient_id = p_patient and rr.read_at > pg_catalog.now() - interval '10 minutes') then
    return;
  end if;
  select kind into k from core.users where id = p_user;
  select pg_catalog.array_agg(id) into ids from core.patients where id = p_patient or merged_into_id = p_patient;
  v_basis := case
    when p_open_department is not null then 'anyway'
    when k in ('pack','machine','importer') then 'pack'
    when p_department is not null and exists (select 1 from core.visits v where v.patient_id = any(ids) and v.department_id = p_department and v.ended_at is null) then 'visit'
    when p_department is not null and exists (select 1 from core.requests r where r.patient_id = any(ids) and r.status = 'open'
                                              and (r.to_department_id = p_department or r.from_department_id = p_department)) then 'request'
    else 'none' end;
  insert into core.record_reads (organization_id, user_id, patient_id, department_id, basis, reason_text, opened_department_id)
  values (p_org, p_user, p_patient, p_department, v_basis, nullif(trim(coalesce(p_reason, '')), ''), p_open_department);
end $$;


ALTER FUNCTION core.open_record(p_org uuid, p_user uuid, p_patient uuid, p_department uuid, p_open_department uuid, p_reason text) OWNER TO postgres;

-- 0011 · patients and visits: the public functions (spec 03)
CREATE FUNCTION core.org_of_department(d uuid) RETURNS uuid
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$ select organization_id from core.departments where id = d $$;


ALTER FUNCTION core.org_of_department(d uuid) OWNER TO postgres;

-- 0009 · the public write functions (spec 04): one per core type, write_set, entered_in_error, the marks
CREATE FUNCTION core.org_of_patient(p uuid) RETURNS uuid
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$ select organization_id from core.patients where id = p $$;


ALTER FUNCTION core.org_of_patient(p uuid) OWNER TO postgres;

-- ── a search hit and the banner: the real department and assignee; no consult questions
CREATE FUNCTION core.patient_hit(p core.patients, u uuid) RETURNS jsonb
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  select pg_catalog.jsonb_build_object('id', p.id, 'record_number', p.record_number, 'given_name', p.given_name, 'middle_name', p.middle_name, 'family_name', p.family_name,
    'sex', p.sex, 'born_on', p.born_on, 'age', core.age_on(p.born_on, core.today(p.organization_id)), 'died_on', p.died_on, 'phone_text', p.phone_text, 'merged_into_id', p.merged_into_id,
    'identifiers', coalesce((select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('system', i.system, 'value', i.value)) from core.patient_identifiers i where i.patient_id = p.id), '[]'),
    'latest_change_id', (select c.id from core.patient_changes c where c.patient_id = p.id order by c.recorded_at desc limit 1),
    'open_visits', coalesce((select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('id', v.id, 'department_id', v.department_id, 'department_name', d.name,
        'status', v.status, 'present', v.present_at is not null, 'arrived_at', v.arrived_at, 'assignee_id', v.assignee_id) order by v.arrived_at desc)
      from core.visits v join core.departments d on d.id = v.department_id where v.patient_id = p.id and v.ended_at is null), '[]'),
    'open_consults', coalesce((select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('request_id', r.entry_id, 'to_department_id', r.to_department_id))
      from core.requests r join core.entries e on e.id = r.entry_id join core.services s on s.id = e.service_id join core.department_types t on t.key = (select type from core.departments where id = r.to_department_id)
      where r.patient_id = p.id and r.status = 'open' and s.reply_type = 'note' and t.is_visited), '[]'))
$$;


ALTER FUNCTION core.patient_hit(p core.patients, u uuid) OWNER TO postgres;

-- replay everything for one patient (and everyone merged into them); returns rows per table
CREATE FUNCTION core.rebuild_record(p_patient_id uuid) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare ids uuid[]; e core.entries; r record; n_med int; n_prob int; n_all int; n_val int := 0; n_req int := 0;
begin
  perform core.lock_record(p_patient_id);
  select pg_catalog.array_agg(id) into ids from core.patients where id = core.survivor(p_patient_id) or merged_into_id = core.survivor(p_patient_id);
  delete from core.entry_values where patient_id = any(ids);
  for e in select * from core.entries where patient_id = any(ids) and replaced_by_id is null and type <> 'entered_in_error' loop
    perform core.extract_values(e); n_val := n_val + 1;
  end loop;
  n_med  := core.replay_list(p_patient_id, 'medications');
  n_prob := core.replay_list(p_patient_id, 'problems');
  n_all  := core.replay_list(p_patient_id, 'allergies');
  delete from core.patient_list_reviews where patient_id = any(ids);
  for e in select * from core.entries where patient_id = any(ids) and replaced_by_id is null and type = 'list_review' order by recorded_at loop
    perform core.update_list_reviews(e);
  end loop;
  for r in select entry_id from core.requests where patient_id = any(ids) loop
    perform core.refold_request(r.entry_id, false); n_req := n_req + 1;
  end loop;
  return pg_catalog.jsonb_build_object('values', n_val, 'medications', n_med, 'problems', n_prob, 'allergies', n_all, 'requests', n_req);
end $$;


ALTER FUNCTION core.rebuild_record(p_patient_id uuid) OWNER TO postgres;

-- 0012 · organization functions (spec 02): save_/retire_, read_organization, create_organization, invitations
CREATE FUNCTION core.record_settings_change(p_org uuid, p_user uuid, p_table text, p_row uuid, p_changes jsonb, p_change_id uuid DEFAULT NULL::uuid) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare v uuid := coalesce(p_change_id, pg_catalog.gen_random_uuid());
begin
  insert into core.settings_changes (id, organization_id, user_id, table_name, row_id, changes) values (v, p_org, p_user, p_table, p_row, p_changes);
  return v;
end $$;


ALTER FUNCTION core.record_settings_change(p_org uuid, p_user uuid, p_table text, p_row uuid, p_changes jsonb, p_change_id uuid) OWNER TO postgres;

-- recompute a request from its live replies (called after a reply is written, replaced or struck)
CREATE FUNCTION core.refold_request(p_request_id uuid, p_needs_review boolean DEFAULT true) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare r core.requests; last core.entries; new_step core.request_step; worst core.value_flag; v_line text; v_at timestamptz; v_reason text;
        had_reply boolean; v_visit_dept uuid; v_review text;
begin
  select * into r from core.requests where entry_id = p_request_id for update;
  if not found then return; end if;
  select * into last from core.entries where reply_to_id = p_request_id and replaced_by_id is null and type <> 'entered_in_error'
    order by occurred_at desc, recorded_at desc limit 1;
  select max(flag) into worst from core.entries where reply_to_id = p_request_id and replaced_by_id is null and type <> 'entered_in_error';
  had_reply := last.id is not null;
  v_review := case when p_needs_review and had_reply then core.review_reason(r, last, worst) end;
  if not had_reply then
    new_step := case when r.step in ('done','replied') then 'reopened' else r.step end;
    v_line := null; v_at := null;
  else
    v_line := last.display_line; v_at := last.occurred_at;
    if exists (select 1 from core.entries where reply_to_id = p_request_id and replaced_by_id is null and type <> 'entered_in_error' and is_final) then
      select case when (data->>'not_done')::boolean then 'cancelled' else 'done' end, data->>'not_done_reason_text' into new_step, v_reason
        from core.entries where reply_to_id = p_request_id and replaced_by_id is null and type <> 'entered_in_error' and is_final
        order by occurred_at desc, recorded_at desc limit 1;
    else
      new_step := case when r.status = 'open' then 'replied' else r.step end;   -- prelims never reopen a closed request
    end if;
  end if;
  perform pg_catalog.set_config('opencare.in_change_request', 'true', true);
  update core.requests set
    step = new_step,
    status_reason = coalesce(v_reason, status_reason),
    reply_line = v_line, reply_flag = worst, replied_at = v_at,
    review_needed_at = case when v_review is not null then pg_catalog.clock_timestamp() else review_needed_at end,
    review_reason = case when v_review is not null then v_review else review_reason end
  where entry_id = p_request_id;
  perform pg_catalog.set_config('opencare.in_change_request', 'false', true);
  if new_step is distinct from r.step then
    insert into core.request_steps (organization_id, request_id, position, step, actor_id, reason, changes, occurred_at)
    values (r.organization_id, p_request_id, core.next_step_position(p_request_id), new_step, last.author_id, v_reason, pg_catalog.jsonb_build_object('reply_id', last.id), coalesce(v_at, pg_catalog.clock_timestamp()));
  end if;
  perform core.signal('queue:' || r.to_department_id::text, pg_catalog.jsonb_build_object('entry_id', p_request_id));
  perform core.signal('queue:' || r.from_department_id::text, pg_catalog.jsonb_build_object('entry_id', p_request_id));
  select v.department_id into v_visit_dept from core.entries e join core.visits v on v.id = e.visit_id where e.id = p_request_id;
  if v_visit_dept is not null then perform core.signal('queue:' || v_visit_dept::text, pg_catalog.jsonb_build_object('entry_id', p_request_id)); end if;
end $$;


ALTER FUNCTION core.refold_request(p_request_id uuid, p_needs_review boolean) OWNER TO postgres;

-- one error shape for every refusal: raise core.refuse('patient_merged', 'survivor=…')
CREATE FUNCTION core.refuse(code text, detail text DEFAULT NULL::text) RETURNS void
    LANGUAGE plpgsql
    AS $$
begin
  raise exception using message = code, detail = coalesce(detail, ''), errcode = 'P0001';
end $$;


ALTER FUNCTION core.refuse(code text, detail text) OWNER TO postgres;

-- insert-only guard for the audit tables
CREATE FUNCTION core.refuse_change() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
begin
  if current_setting('opencare.erasing', true) = 'true' and tg_op = 'DELETE' then return old; end if;
  raise exception 'table % is insert-only', tg_table_name using errcode = '55000';
end $$;


ALTER FUNCTION core.refuse_change() OWNER TO postgres;

-- replay one list for one patient from the live entries, replacements at the original's position
CREATE FUNCTION core.replay_list(p_patient_id uuid, p_list core.list_kind, p_pack text DEFAULT NULL::text, p_pack_list text DEFAULT NULL::text) RETURNS integer
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $_$
declare e core.entries; n int := 0; ids uuid[];
begin
  select pg_catalog.array_agg(id) into ids from core.patients where id = core.survivor(p_patient_id) or merged_into_id = core.survivor(p_patient_id);
  if p_list is not null then
    execute pg_catalog.format('delete from core.patient_%I where patient_id = any($1)', p_list::text) using ids;
    if p_list <> 'allergies' then null; end if;
  else
    execute pg_catalog.format('delete from %I.%I where patient_id = any($1)', p_pack, p_pack_list) using ids;
  end if;
  for e in
    with recursive root as (
      select x.id, x.id as root_id, x.recorded_at as root_at from core.entries x where x.patient_id = any(ids) and x.replaces_id is null
      union all
      select x.id, r.root_id, r.root_at from core.entries x join root r on x.replaces_id = r.id
    )
    select x.* from core.entries x
    join root r on r.id = x.id
    join core.entry_types t on t.key = x.type
    where x.replaced_by_id is null and x.type <> 'entered_in_error'
      and ((p_list is not null and t.list = p_list) or (p_pack_list is not null and t.pack = p_pack and t.pack_list = p_pack_list))
    order by r.root_at, x.recorded_at
  loop
    perform core.apply_updater(e); n := n + 1;
  end loop;
  return n;
end $_$;


ALTER FUNCTION core.replay_list(p_patient_id uuid, p_list core.list_kind, p_pack text, p_pack_list text) OWNER TO postgres;

-- a consult reply is for whoever asked: the requester, and people who work in the asking department
CREATE FUNCTION core.reply_for(e core.entries, p_reader uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  select e.reply_to_id is not null and exists (select 1 from core.requests r where r.entry_id = e.reply_to_id
    and (r.requester_id = p_reader or core.works_in(p_reader, r.from_department_id)))
$$;


ALTER FUNCTION core.reply_for(e core.entries, p_reader uuid) OWNER TO postgres;

CREATE FUNCTION core.requests_guard() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
begin
  if tg_op = 'DELETE' then
    if current_setting('opencare.erasing', true) = 'true' then return old; end if;
    raise exception 'requests rows are never deleted' using errcode = '55000';
  end if;
  if current_setting('opencare.in_change_request', true) <> 'true' then
    raise exception 'requests are changed only by change_request' using errcode = '55000';
  end if;
  return new;
end $$;


ALTER FUNCTION core.requests_guard() OWNER TO postgres;

-- returns the caller's users.id; raises on any failure
CREATE FUNCTION core.require_access(p_organization_id uuid, p_action text, p_patient_id uuid DEFAULT NULL::uuid, p_department_id uuid DEFAULT NULL::uuid) RETURNS uuid
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
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


ALTER FUNCTION core.require_access(p_organization_id uuid, p_action text, p_patient_id uuid, p_department_id uuid) OWNER TO postgres;

CREATE FUNCTION core.require_fresh(p_table text, p_row uuid, p_seen uuid) RETURNS void
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
begin
  if p_seen is null then return; end if;
  if exists (select 1 from core.settings_changes c where c.table_name = p_table and c.row_id = p_row
             and c.recorded_at > (select recorded_at from core.settings_changes where id = p_seen)) then
    perform core.refuse('changed_since_read');
  end if;
end $$;


ALTER FUNCTION core.require_fresh(p_table text, p_row uuid, p_seen uuid) OWNER TO postgres;

CREATE FUNCTION core.require_last_administrator(p_org uuid) RETURNS void
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
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


ALTER FUNCTION core.require_last_administrator(p_org uuid) OWNER TO postgres;

-- every reader opens first, people and packs alike
CREATE FUNCTION core.require_open(p_user uuid, p_patient uuid) RETURNS void
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
begin
  if not exists (select 1 from core.record_reads where user_id = p_user and patient_id = p_patient and read_at > pg_catalog.now() - interval '12 hours') then
    perform core.refuse('record_not_open');
  end if;
end $$;


ALTER FUNCTION core.require_open(p_user uuid, p_patient uuid) OWNER TO postgres;

CREATE FUNCTION core.require_pack(p_organization_id uuid, p_pack text) RETURNS void
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
begin
  if not exists (select 1 from core.organization_packs where organization_id = p_organization_id and pack = p_pack and retired_at is null) then
    perform core.refuse('pack_off', p_pack);
  end if;
end $$;


ALTER FUNCTION core.require_pack(p_organization_id uuid, p_pack text) OWNER TO postgres;

-- why a result needs a look, or null: critical always · a correction always · the clinic's rule · a final result nobody is there to see
CREATE FUNCTION core.review_reason(r core.requests, last core.entries, worst core.value_flag) RETURNS text
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare setting text; v core.visits;
begin
  if last.id is null then return null; end if;
  if worst = 'critical' then return 'critical'; end if;
  if last.replaces_id is not null then return 'corrected'; end if;
  select d.review_results into setting from core.departments d where d.id = r.from_department_id;
  setting := coalesce(setting, 'critical');
  if setting in ('abnormal','all') and worst in ('low','high','abnormal') then return 'abnormal'; end if;
  if setting = 'all' and last.is_final then return 'result'; end if;
  if not last.is_final then return null; end if;
  select vv.* into v from core.entries e join core.visits vv on vv.id = e.visit_id where e.id = r.entry_id;
  if v.id is null or v.ended_at is not null or v.present_at is null then return 'not seen'; end if;
  return null;                                   -- the patient is here waiting: the clinician sees it when they come back
end $$;


ALTER FUNCTION core.review_reason(r core.requests, last core.entries, worst core.value_flag) OWNER TO postgres;

-- 0008 · the patient-list updaters (spec 04): pure functions of the entry and the existing rows
-- the root of a replacement chain: a list row keeps the id of the first entry that stated it
CREATE FUNCTION core.root_of(p_entry_id uuid) RETURNS uuid
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  with recursive up as (
    select id, replaces_id from core.entries where id = p_entry_id
    union all
    select e.id, e.replaces_id from core.entries e join up on e.id = up.replaces_id
  )
  select id from up where replaces_id is null limit 1
$$;


ALTER FUNCTION core.root_of(p_entry_id uuid) OWNER TO postgres;

-- routing: who, where, how urgent, when — one step per change
CREATE FUNCTION core.route_request(p_request_id uuid, p_actor uuid, p_assignee uuid, p_to_department uuid, p_priority core.request_priority, p_due_at timestamp with time zone, p_reason text) RETURNS core.requests
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare r core.requests; ch jsonb := '{}';
begin
  select * into r from core.requests where entry_id = p_request_id for update;
  if not found then perform core.refuse('request_not_found'); end if;
  if r.status <> 'open' then perform core.refuse('request_closed'); end if;
  if p_assignee is distinct from r.assignee_id and p_assignee is not null then ch := ch || pg_catalog.jsonb_build_object('assignee_id', p_assignee); end if;
  if p_to_department is not null and p_to_department <> r.to_department_id then ch := ch || pg_catalog.jsonb_build_object('to_department_id', p_to_department); end if;
  if p_priority is not null and p_priority <> r.priority then ch := ch || pg_catalog.jsonb_build_object('priority', p_priority); end if;
  if p_due_at is not null and p_due_at <> r.due_at then ch := ch || pg_catalog.jsonb_build_object('due_at', p_due_at); end if;
  if ch = '{}' then return r; end if;
  perform pg_catalog.set_config('opencare.in_change_request', 'true', true);
  update core.requests set
    assignee_id = coalesce(p_assignee, assignee_id), to_department_id = coalesce(p_to_department, to_department_id),
    priority = coalesce(p_priority, priority), due_at = coalesce(p_due_at, due_at)
    where entry_id = p_request_id returning * into r;
  perform pg_catalog.set_config('opencare.in_change_request', 'false', true);
  insert into core.request_steps (organization_id, request_id, position, step, actor_id, reason, changes, occurred_at)
  values (r.organization_id, p_request_id, core.next_step_position(p_request_id), r.step, p_actor, p_reason, ch, pg_catalog.clock_timestamp());
  perform core.signal('queue:' || r.to_department_id::text, pg_catalog.jsonb_build_object('entry_id', p_request_id));
  if ch ? 'to_department_id' then perform core.signal('queue:' || (ch->>'to_department_id'), pg_catalog.jsonb_build_object('entry_id', p_request_id)); end if;
  return r;
end $$;


ALTER FUNCTION core.route_request(p_request_id uuid, p_actor uuid, p_assignee uuid, p_to_department uuid, p_priority core.request_priority, p_due_at timestamp with time zone, p_reason text) OWNER TO postgres;

-- one call: the pack's reaction under a timeout, as the pack's own user; returns NULL or the error text.
-- The exception block is a savepoint, so a failing pack leaves nothing behind.
CREATE FUNCTION core.run_one_pack_call(p_pack text, p_organization_id uuid, p_entry core.entries) RETURNS text
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $_$
declare pu uuid;
begin
  select id into pu from core.users where users.organization_id = p_organization_id and kind = 'pack' and name = p_pack;
  perform pg_catalog.set_config('opencare.acting_user_id', coalesce(pu::text, ''), true);
  perform pg_catalog.set_config('lock_timeout', '2s', true);   -- applies to every lock wait from here on
  -- statement_timeout cannot be armed from inside a running statement: it is set on the cron job below,
  -- so a pack that hangs holds one runner invocation for at most that long; tries are counted before
  -- the call, so a hanging pack is parked after five invocations without ever touching a write.
  execute pg_catalog.format('select %I.after_write($1)', p_pack) using p_entry;
  return null;
exception when others then
  return sqlerrm;
end $_$;


ALTER FUNCTION core.run_one_pack_call(p_pack text, p_organization_id uuid, p_entry core.entries) OWNER TO postgres;

-- the runner: every 5 s; each call in its own transaction
CREATE PROCEDURE core.run_pack_calls()
    LANGUAGE plpgsql
    AS $$   -- no SET clause: a procedure that commits may not carry one
declare c record; err text; n int := 0;
begin
  loop
    select * into c from core.next_pack_call();
    if c.pack is null then exit; end if;
    commit;
    err := core.run_one_pack_call(c.pack, c.organization_id, c.entry);
    perform core.finish_pack_call(c.pack, c.entry_id, err);
    commit;
    n := n + 1; if n >= 200 then exit; end if;
  end loop;
end $$;


ALTER PROCEDURE core.run_pack_calls() OWNER TO postgres;

CREATE FUNCTION core.short(t text, n integer DEFAULT 80) RETURNS text
    LANGUAGE sql IMMUTABLE
    AS $$ select case when t is null then null when length(t) <= n then t else left(t, n - 1) || '…' end $$;


ALTER FUNCTION core.short(t text, n integer) OWNER TO postgres;

-- ── signals: broadcast on a private channel; never let a missing realtime fail a write ──
CREATE FUNCTION core.signal(p_topic text, p_payload jsonb) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
begin
  begin
    perform realtime.send('{}'::jsonb, 'change', p_topic, true);   -- a hint only: an id on a queue channel would link a private visit to its department
  exception when others then null;
  end;
end $$;


ALTER FUNCTION core.signal(p_topic text, p_payload jsonb) OWNER TO postgres;

-- ── the surviving patient, and the record lock ──
CREATE FUNCTION core.survivor(p_patient_id uuid) RETURNS uuid
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  select coalesce(merged_into_id, id) from core.patients where id = p_patient_id
$$;


ALTER FUNCTION core.survivor(p_patient_id uuid) OWNER TO postgres;

-- ── the sweep: hourly, idleness, no timezone, wards skipped ──
CREATE FUNCTION core.sweep_visits() RETURNS integer
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare v core.visits; n int := 0; idle interval;
begin
  for v in select vv.* from core.visits vv join core.departments d on d.id = vv.department_id where vv.ended_at is null and d.type <> 'ward' loop
    select pg_catalog.now() - greatest(
      (select max(recorded_at) from core.visit_steps s where s.visit_id = v.id),
      coalesce((select max(st.recorded_at) from core.request_steps st join core.entries e on e.id = st.request_id where e.visit_id = v.id), '-infinity')) into idle;
    if v.status = 'waiting' and v.seen_at is null and idle > interval '12 hours' then
      update core.visits set status = 'left', ended_at = pg_catalog.now(), present_at = null where id = v.id returning * into v;
      perform core.change_visit(v, 'left', null, 'sweep', null); perform core.flag_unseen(v.id); n := n + 1;
    elsif v.seen_at is not null and v.status <> 'pending' and idle > interval '12 hours' then
      update core.visits set status = 'pending', present_at = null where id = v.id returning * into v;
      perform core.change_visit(v, 'pending', null, 'sweep', pg_catalog.jsonb_build_object('present_at', null)); perform core.flag_unseen(v.id); n := n + 1;
    elsif v.status = 'pending' and v.present_at is not null and idle > interval '12 hours' then
      update core.visits set present_at = null where id = v.id returning * into v;
      perform core.change_visit(v, 'pending', null, 'sweep', pg_catalog.jsonb_build_object('present_at', null)); perform core.flag_unseen(v.id); n := n + 1;
    elsif v.status = 'pending' and v.present_at is null and idle > interval '14 days' then
      update core.visits set status = 'lapsed', ended_at = pg_catalog.now() where id = v.id returning * into v;
      perform core.change_visit(v, 'lapsed', null, 'sweep', null); perform core.flag_unseen(v.id); n := n + 1;
    end if;
  end loop;
  return n;
end $$;


ALTER FUNCTION core.sweep_visits() OWNER TO postgres;

-- the clinic's date today, and the moment its day began
CREATE FUNCTION core.today(p_org uuid) RETURNS date
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  select (pg_catalog.now() at time zone coalesce((select o.time_zone from core.organizations o where o.id = p_org), 'UTC'))::date
$$;


ALTER FUNCTION core.today(p_org uuid) OWNER TO postgres;

CREATE FUNCTION core.update_allergies(e core.entries) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare d jsonb := e.data; act text := d->>'action'; target uuid := (d->>'allergy_id')::uuid;
begin
  if act = 'add' then
    insert into core.patient_allergies (id, organization_id, patient_id, substance_code, substance_name, class_code, kind, reactions_text, severity, certainty, status, latest_entry_id)
    values (core.root_of(e.id), e.organization_id, e.patient_id, d->'substance'->>'code', d->'substance'->>'name', d->'substance'->>'class_code',
      coalesce(d->>'kind', 'allergy'), d->>'reactions_text', d->>'severity', d->>'certainty', 'active', e.id)
    on conflict (id) do update set substance_code = excluded.substance_code, substance_name = excluded.substance_name, class_code = excluded.class_code,
      kind = excluded.kind, reactions_text = excluded.reactions_text, severity = excluded.severity, certainty = excluded.certainty, latest_entry_id = excluded.latest_entry_id;
  elsif act = 'update' then
    update core.patient_allergies set reactions_text = coalesce(d->>'reactions_text', reactions_text), severity = coalesce(d->>'severity', severity),
      certainty = coalesce(d->>'certainty', certainty), class_code = coalesce(d->'substance'->>'class_code', class_code), latest_entry_id = e.id where id = target;
  elsif act = 'refute' then
    update core.patient_allergies set status = 'refuted', latest_entry_id = e.id where id = target;
  end if;
end $$;


ALTER FUNCTION core.update_allergies(e core.entries) OWNER TO postgres;

CREATE FUNCTION core.update_list_reviews(e core.entries) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
begin
  insert into core.patient_list_reviews (patient_id, list, reviewed_at, reviewed_by_id, entry_id)
  values (e.patient_id, (e.data->>'list')::core.list_kind, e.occurred_at, coalesce(e.responsible_id, e.author_id), e.id)
  on conflict (patient_id, list) do update set reviewed_at = excluded.reviewed_at, reviewed_by_id = excluded.reviewed_by_id, entry_id = excluded.entry_id
  where excluded.reviewed_at >= core.patient_list_reviews.reviewed_at;
end $$;


ALTER FUNCTION core.update_list_reviews(e core.entries) OWNER TO postgres;

CREATE FUNCTION core.update_medications(e core.entries) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare d jsonb := e.data; act text := d->>'action'; row_id uuid; target uuid := (d->>'medication_id')::uuid;
begin
  if act = 'start' then
    row_id := core.root_of(e.id);
    insert into core.patient_medications (id, organization_id, patient_id, drug_code, drug_name, form, strength, dose_number, dose_unit, route, frequency,
      prn, prn_reason_text, instructions_text, problem_id, started_on, status, latest_entry_id, prescriber_id)
    values (row_id, e.organization_id, e.patient_id, d->'drug'->>'code', d->'drug'->>'name', d->'drug'->>'form', d->'drug'->>'strength',
      (d->>'dose_number')::numeric, d->>'dose_unit', d->>'route', d->>'frequency',
      coalesce((d->>'prn')::boolean, false), d->>'prn_reason_text', d->>'instructions_text', (d->'problems'->0->>'id')::uuid,
      coalesce(core.local_date(e.organization_id, e.occurred_at), core.today(e.organization_id)), 'active', e.id, coalesce(e.responsible_id, e.author_id))
    on conflict (id) do update set latest_entry_id = excluded.latest_entry_id, dose_number = excluded.dose_number, dose_unit = excluded.dose_unit,
      route = excluded.route, frequency = excluded.frequency, prn = excluded.prn, prn_reason_text = excluded.prn_reason_text, instructions_text = excluded.instructions_text;
  elsif act = 'repeat' then
    update core.patient_medications set latest_entry_id = e.id where id = target;
  elsif act = 'change' then
    update core.patient_medications set dose_number = coalesce((d->>'dose_number')::numeric, dose_number), dose_unit = coalesce(d->>'dose_unit', dose_unit),
      route = coalesce(d->>'route', route), frequency = coalesce(d->>'frequency', frequency), prn = coalesce((d->>'prn')::boolean, prn),
      prn_reason_text = case when (d->>'prn')::boolean is false then null else coalesce(nullif(d->>'prn_reason_text', ''), prn_reason_text) end,
      instructions_text = case when d ? 'instructions_text' then nullif(d->>'instructions_text', '') else instructions_text end,
      latest_entry_id = e.id where id = target;
  elsif act = 'stop' then
    update core.patient_medications set status = 'stopped', stopped_on = (e.occurred_at at time zone 'UTC')::date, stop_reason_text = d->>'stop_reason_text', latest_entry_id = e.id where id = target;
  end if;
end $$;


ALTER FUNCTION core.update_medications(e core.entries) OWNER TO postgres;

CREATE FUNCTION core.update_problems(e core.entries) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare d jsonb := e.data; act text := d->>'action'; target uuid := (d->>'problem_id')::uuid;
begin
  if act = 'add' then
    insert into core.patient_problems (id, organization_id, patient_id, code, name, status, onset_on, note_text, certainty, latest_entry_id)
    values (core.root_of(e.id), e.organization_id, e.patient_id, d->>'code', d->>'name', coalesce(d->>'status', 'active'), nullif(d->>'onset_on', ''), nullif(d->>'text', ''), coalesce(d->>'certainty', 'confirmed'), e.id)
    on conflict (id) do update set code = excluded.code, name = excluded.name, status = excluded.status, onset_on = excluded.onset_on,
      note_text = excluded.note_text, certainty = excluded.certainty, latest_entry_id = excluded.latest_entry_id;
  elsif act = 'update' then
    update core.patient_problems set code = coalesce(d->>'code', code), name = coalesce(d->>'name', name), status = coalesce(d->>'status', status),
      onset_on = case when d ? 'onset_on' then nullif(d->>'onset_on', '') else onset_on end,
      note_text = case when d ? 'text' then nullif(d->>'text', '') else note_text end, certainty = coalesce(d->>'certainty', certainty), latest_entry_id = e.id where id = target;
  elsif act = 'resolve' then
    update core.patient_problems set status = 'resolved', resolved_on = coalesce(d->>'resolved_on', to_char(e.occurred_at at time zone 'UTC', 'YYYY-MM-DD')), latest_entry_id = e.id where id = target;
  end if;
end $$;


ALTER FUNCTION core.update_problems(e core.entries) OWNER TO postgres;

-- ── result ──
CREATE FUNCTION core.values_line(vals jsonb) RETURNS text
    LANGUAGE sql IMMUTABLE
    AS $$
  select pg_catalog.string_agg(v->>'name' || ' ' || coalesce(v->>'value_number', v->>'value_text', '') ||
           case core.flag_of(v) when 'low' then ' ↓' when 'high' then ' ↑' when 'critical' then ' ‼' when 'abnormal' then ' *' else '' end, ' · ' order by
           (core.flag_of(v) is null or core.flag_of(v) = 'normal'), ord)
  from (select v, ord from pg_catalog.jsonb_array_elements(coalesce(vals,'[]')) with ordinality as x(v, ord) limit 3) t
$$;


ALTER FUNCTION core.values_line(vals jsonb) OWNER TO postgres;

-- ── vitals ──
CREATE FUNCTION core.vital(vals jsonb, c text, n text, v numeric, u text) RETURNS jsonb
    LANGUAGE sql IMMUTABLE
    AS $$ select case when v is null then vals else vals || pg_catalog.jsonb_build_object('code', c, 'name', n, 'value_number', v, 'unit', u) end $$;


ALTER FUNCTION core.vital(vals jsonb, c text, n text, v numeric, u text) OWNER TO postgres;

-- ── who works in a department: a live staff user holding a live role scoped to it that reads the record (never a role held everywhere)
CREATE FUNCTION core.works_in(p_user uuid, p_department uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  select exists (select 1 from core.users x
                   join core.user_roles ur on ur.user_id = x.id and ur.department_id = p_department
                   join core.roles ro on ro.id = ur.role_id and ro.retired_at is null
                   join core.role_actions ra on ra.role_id = ro.id and ra.action = 'read:record'
                 where x.id = p_user and x.kind = 'staff' and (x.retired_at is null or x.retired_at > pg_catalog.now()))
$$;


ALTER FUNCTION core.works_in(p_user uuid, p_department uuid) OWNER TO postgres;

-- the entry's worst flag, from data alone (computed before the insert; flag is immutable content)
CREATE FUNCTION core.worst_flag(d jsonb) RETURNS core.value_flag
    LANGUAGE sql IMMUTABLE
    AS $$
  select max(core.flag_of(v)) from pg_catalog.jsonb_array_elements(coalesce(d->'values', '[]'::jsonb)) v
$$;


ALTER FUNCTION core.worst_flag(d jsonb) OWNER TO postgres;

-- ── the funnel writes a note's first privacy row
CREATE FUNCTION core.write_entry(p_id uuid, p_organization_id uuid, p_patient_id uuid, p_visit_id uuid, p_department_id uuid, p_author_id uuid, p_responsible_id uuid, p_source core.entry_source, p_source_key text, p_occurred_at timestamp with time zone, p_type text, p_service_id uuid, p_data jsonb, p_display_line text, p_reply_to_id uuid, p_is_final boolean, p_replaces_id uuid, p_written_with_id uuid, p_destination jsonb DEFAULT NULL::jsonb, p_needs_review boolean DEFAULT true) RETURNS core.entries
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare e core.entries; old core.entries; t record; v_survivor uuid; v_recorded timestamptz; v_last timestamptz;
        v_caller uuid; v_caller_kind core.user_kind; v_caller_pack text; v_req_patient uuid; v_due timestamptz;
begin
  -- who is really writing: the JWT's user, or the runner's acting pack user. A trusted server
  -- context (migration, seed, test: no JWT, no acting user, not the API) may name any author.
  v_caller := core.current_user_id(p_organization_id);
  if v_caller is null and core.auth_uid() is null and session_user <> 'authenticator'
     and coalesce(current_setting('opencare.acting_user_id', true), '') = '' then
    null;                                                        -- trusted
  elsif v_caller is distinct from p_author_id then
    perform core.refuse('author_mismatch');
  else
    select kind, name into v_caller_kind, v_caller_pack from core.users where id = v_caller;
    if v_caller_kind = 'pack' then                                -- a pack is gated here even if its wrapper forgot
      perform core.require_pack(p_organization_id, v_caller_pack);
      perform core.require_access(p_organization_id, 'write:' || p_type, p_patient_id, p_department_id);
    else v_caller_pack := null; end if;
  end if;

  v_survivor := core.survivor(p_patient_id);
  if v_survivor is null then perform core.refuse('wrong_organization', 'patient'); end if;
  perform core.lock_record(p_patient_id);

  -- idempotency: same id → the stored row; same source_key → the stored row
  -- a retry returns the stored row only to the one who wrote it (or a trusted server context): never a row the caller may not read
  select * into e from core.entries where id = p_id;
  if found then
    if e.patient_id <> p_patient_id or e.type <> p_type or (v_caller is not null and e.author_id is distinct from v_caller) then perform core.refuse('id_in_use'); end if;
    return e;
  end if;
  if p_source_key is not null then
    select * into e from core.entries where organization_id = p_organization_id and source = p_source and source_key = p_source_key;
    if found then
      if e.patient_id <> p_patient_id or e.type <> p_type or (v_caller is not null and e.author_id is distinct from v_caller) then perform core.refuse('id_in_use'); end if;
      return e;
    end if;
  end if;

  -- the type
  select key, pack, retired_at into t from core.entry_types where key = p_type;
  if not found then perform core.refuse('unknown_type', p_type); end if;
  if p_replaces_id is null then
    if t.retired_at is not null then perform core.refuse('type_retired', p_type); end if;
    if t.pack is not null then perform core.require_pack(p_organization_id, t.pack); end if;
    if v_survivor <> p_patient_id and p_reply_to_id is null then perform core.refuse('patient_merged', v_survivor::text); end if;
  end if;

  -- links stay inside the patient
  if p_reply_to_id is not null then
    select patient_id into v_req_patient from core.requests where entry_id = p_reply_to_id;
    if v_req_patient is null then perform core.refuse('request_not_found'); end if;
    if core.survivor(v_req_patient) <> v_survivor then perform core.refuse('wrong_patient', 'reply'); end if;
    -- a reply is the kind its service asks for (amendments 2026-09-23 · 5), for core and packs alike; a strike is always allowed
    if p_type <> 'entered_in_error' and exists (select 1 from core.entries q join core.services sv on sv.id = q.service_id
        where q.id = p_reply_to_id and sv.reply_type not in ('none', p_type)) then
      perform core.refuse('wrong_reply_type', 'this request is answered by ' || (select sv.reply_type from core.entries q join core.services sv on sv.id = q.service_id where q.id = p_reply_to_id));
    end if;
  end if;
  if p_replaces_id is not null then
    select * into old from core.entries where id = p_replaces_id;
    if not found then perform core.refuse('not_found', 'replaces'); end if;
    if old.replaced_by_id is not null then perform core.refuse('already_replaced'); end if;
    if core.survivor(old.patient_id) <> v_survivor then perform core.refuse('wrong_patient', 'replaces'); end if;
    if p_type <> 'entered_in_error' and old.type <> p_type then perform core.refuse('type_mismatch'); end if;
    if exists (select 1 from core.requests where entry_id = old.id) and p_type = 'entered_in_error'
       and exists (select 1 from core.entries where reply_to_id = old.id and replaced_by_id is null and type <> 'entered_in_error') then
      perform core.refuse('request_has_replies');
    end if;
    p_reply_to_id := coalesce(p_reply_to_id, old.reply_to_id);
    -- a correction stays where it was written (spec 07): its visit and department; the corrector must be allowed to write there
    if old.department_id is not null and p_department_id is distinct from old.department_id then
      if v_caller is not null then perform core.require_access(p_organization_id, 'write:' || p_type, p_patient_id, old.department_id); end if;
      p_department_id := old.department_id;
    end if;
    p_visit_id := old.visit_id;
  end if;
  if p_written_with_id is not null and p_written_with_id <> p_id then
    if not exists (select 1 from core.entries where id = p_written_with_id and core.survivor(patient_id) = v_survivor) then perform core.refuse('wrong_patient', 'written_with'); end if;
  end if;
  if p_department_id is null and p_source not in ('patient','import') then perform core.refuse('department_missing'); end if;

  -- self-contained: copy what this entry used from settings (spec 01)
  p_data := coalesce(p_data, '{}'::jsonb)
    || pg_catalog.jsonb_build_object('author_name', (select name from core.users where id = p_author_id))
    || case when p_department_id is null then '{}'::jsonb else pg_catalog.jsonb_build_object('department_name', (select name from core.departments where id = p_department_id)) end
    || case when p_responsible_id is null then '{}'::jsonb else pg_catalog.jsonb_build_object('responsible_name', (select name from core.users where id = p_responsible_id)) end
    || case when p_service_id is null then '{}'::jsonb else pg_catalog.jsonb_build_object('service',
         (select pg_catalog.jsonb_build_object('id', s.id, 'code', s.code, 'name', s.name, 'reply_type', s.reply_type, 'department_name', d.name)
          from core.services s left join core.departments d on d.id = s.department_id where s.id = p_service_id)) end
    || case when p_destination is null then '{}'::jsonb else pg_catalog.jsonb_build_object('to_department_name', (select name from core.departments where id = (p_destination->>'to_department_id')::uuid)) end;
  if p_replaces_id is not null and old.is_final and p_type <> 'entered_in_error' and p_display_line not like 'Corrected: %' then
    p_display_line := 'Corrected: ' || p_display_line;
  end if;

  -- monotonic clock per record
  select max(recorded_at) into v_last from core.entries where patient_id = any(array(select id from core.patients where id = v_survivor or merged_into_id = v_survivor));
  v_recorded := greatest(pg_catalog.clock_timestamp(), coalesce(v_last, '-infinity'::timestamptz) + interval '1 microsecond');

  insert into core.entries (id, organization_id, patient_id, visit_id, author_id, responsible_id, department_id, source, source_key,
                            occurred_at, recorded_at, type, service_id, data, display_line, flag, reply_to_id, is_final, replaces_id, written_with_id)
  values (p_id, p_organization_id, p_patient_id, p_visit_id, p_author_id, p_responsible_id, p_department_id, p_source, p_source_key,
          coalesce(p_occurred_at, v_recorded), v_recorded, p_type, p_service_id, coalesce(p_data, '{}'), p_display_line, core.worst_flag(p_data), p_reply_to_id, p_is_final, p_replaces_id,
          p_written_with_id)
  returning * into e;
  perform core.extract_values(e);

  -- a note signed in a private department is private from its first read (spec 07); a correction stays in its chain and keeps the
  -- chain's privacy, so only a first version writes a row
  if p_replaces_id is null and core.is_note(p_type) and exists (select 1 from core.departments d where d.id = p_department_id and d.is_private) then
    insert into core.note_privacy (organization_id, entry_id, patient_id, department_id, is_private, changed_by, changed_at)
    values (e.organization_id, e.id, e.patient_id, e.department_id, true, e.author_id, e.recorded_at);
  end if;

  if p_replaces_id is not null then
    update core.entries set replaced_by_id = e.id where id = p_replaces_id;
    delete from core.entry_values where entry_id = p_replaces_id;
    select list, pack, pack_list into t from core.entry_types where key = old.type;
    if t.list is not null or t.pack_list is not null then perform core.replay_list(p_patient_id, t.list, t.pack, t.pack_list); end if;
    if exists (select 1 from core.requests where entry_id = old.id) then
      perform core.change_request(old.id, (select step from core.requests where entry_id = old.id), 'cancelled', p_author_id, 'replaced');
    end if;
    if old.reply_to_id is not null then perform core.refold_request(old.reply_to_id, p_needs_review); end if;
  else
    perform core.apply_updater(e);
  end if;

  -- a destination makes it a request: the row and its sent step, written here, never via the gated path
  if p_destination is not null and p_type <> 'entered_in_error' then
    v_due := coalesce((p_destination->>'due_at')::timestamptz, e.occurred_at);
    perform pg_catalog.set_config('opencare.in_change_request', 'true', true);
    insert into core.requests (entry_id, organization_id, patient_id, from_department_id, requester_id, to_department_id, assignee_id, priority, due_at, step)
    values (e.id, e.organization_id, e.patient_id, e.department_id, coalesce(e.responsible_id, e.author_id), (p_destination->>'to_department_id')::uuid,
            (p_destination->>'assignee_id')::uuid, coalesce((p_destination->>'priority')::core.request_priority, 'routine'), v_due, 'sent');
    perform pg_catalog.set_config('opencare.in_change_request', 'false', true);
    insert into core.request_steps (organization_id, request_id, position, step, actor_id, changes, occurred_at)
    values (e.organization_id, e.id, 1, 'sent', e.author_id, p_destination, e.occurred_at);
    perform core.signal('queue:' || (p_destination->>'to_department_id'), pg_catalog.jsonb_build_object('entry_id', e.id));
  end if;

  if e.reply_to_id is not null and p_replaces_id is null then perform core.refold_request(e.reply_to_id, p_needs_review); end if;

  -- packs hear after the commit
  insert into core.pack_calls (pack, entry_id, organization_id)
  select op.pack, e.id, e.organization_id from core.organization_packs op join core.packs p on p.key = op.pack
  where op.organization_id = e.organization_id and op.retired_at is null and p.is_called_after_write and op.pack is distinct from v_caller_pack;

  perform core.signal('record:' || v_survivor::text, pg_catalog.jsonb_build_object('entry_id', e.id));
  return e;
end $$;


ALTER FUNCTION core.write_entry(p_id uuid, p_organization_id uuid, p_patient_id uuid, p_visit_id uuid, p_department_id uuid, p_author_id uuid, p_responsible_id uuid, p_source core.entry_source, p_source_key text, p_occurred_at timestamp with time zone, p_type text, p_service_id uuid, p_data jsonb, p_display_line text, p_reply_to_id uuid, p_is_final boolean, p_replaces_id uuid, p_written_with_id uuid, p_destination jsonb, p_needs_review boolean) OWNER TO postgres;
