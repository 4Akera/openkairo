-- 0006 · the funnels (spec 01): write_entry, change_request, values, updaters, the fold, holds, rebuild
-- All private (schema core). Public write_/mark_ functions end here.

-- ── signals: broadcast on a private channel; never let a missing realtime fail a write ──
create or replace function core.signal(p_topic text, p_payload jsonb) returns void
language plpgsql security definer set search_path = '' as $$
begin
  begin
    perform realtime.send(p_payload, 'change', p_topic, true);
  exception when others then null;
  end;
end $$;

-- ── the surviving patient, and the record lock ──
create or replace function core.survivor(p_patient_id uuid) returns uuid
language sql stable security definer set search_path = '' as $$
  select coalesce(merged_into_id, id) from core.patients where id = p_patient_id
$$;

create or replace function core.lock_record(p_patient_id uuid) returns void
language sql security definer set search_path = '' as $$
  select pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext('record:' || core.survivor(p_patient_id)::text))
$$;

-- ── values: data.values[] → entry_values, flags computed once ──
create or replace function core.flag_of(v jsonb) returns core.value_flag
language sql immutable as $$
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

-- the entry's worst flag, from data alone (computed before the insert; flag is immutable content)
create or replace function core.worst_flag(d jsonb) returns core.value_flag
language sql immutable as $$
  select max(core.flag_of(v)) from pg_catalog.jsonb_array_elements(coalesce(d->'values', '[]'::jsonb)) v
$$;

-- inserts the extractable values of an entry
create or replace function core.extract_values(e core.entries) returns void
language plpgsql security definer set search_path = '' as $$
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

-- ── updater dispatch: only a security definer function owned by the right role is ever called ──
create or replace function core.apply_updater(e core.entries) returns void
language plpgsql security definer set search_path = '' as $$
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
end $$;

-- replay one list for one patient from the live entries, replacements at the original's position
create or replace function core.replay_list(p_patient_id uuid, p_list core.list_kind, p_pack text default null, p_pack_list text default null) returns int
language plpgsql security definer set search_path = '' as $$
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
end $$;

-- ── requests: the fold from replies, and the step path ──
create or replace function core.next_step_position(p_request_id uuid) returns smallint
language sql stable security definer set search_path = '' as $$
  select coalesce(max(position), 0) + 1 from core.request_steps where request_id = p_request_id
$$;

-- recompute a request from its live replies (called after a reply is written, replaced or struck)
create or replace function core.refold_request(p_request_id uuid, p_needs_review boolean default true) returns void
language plpgsql security definer set search_path = '' as $$
declare r core.requests; last core.entries; new_step core.request_step; worst core.value_flag; v_line text; v_at timestamptz; v_reason text;
        had_reply boolean; v_visit_dept uuid;
begin
  select * into r from core.requests where entry_id = p_request_id for update;
  if not found then return; end if;
  select * into last from core.entries where reply_to_id = p_request_id and replaced_by_id is null and type <> 'entered_in_error'
    order by occurred_at desc, recorded_at desc limit 1;
  select max(flag) into worst from core.entries where reply_to_id = p_request_id and replaced_by_id is null and type <> 'entered_in_error';
  had_reply := last.id is not null;
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
    review_needed_at = case when p_needs_review and had_reply and (last.is_final or worst > 'normal') then pg_catalog.clock_timestamp() else review_needed_at end
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

-- the step path: compare-and-set; legal moves only; pack steps never close
create or replace function core.change_request(p_request_id uuid, p_from core.request_step, p_to core.request_step, p_actor uuid, p_reason text default null, p_changes jsonb default null, p_occurred_at timestamptz default null)
returns core.requests language plpgsql security definer set search_path = '' as $$
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

-- routing: who, where, how urgent, when — one step per change
create or replace function core.route_request(p_request_id uuid, p_actor uuid, p_assignee uuid, p_to_department uuid, p_priority core.request_priority, p_due_at timestamptz, p_reason text)
returns core.requests language plpgsql security definer set search_path = '' as $$
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

-- ── holds: what keeps a visit pending (spec 03) ──
create or replace function core.holds(p_visit_id uuid) returns int
language sql stable security definer set search_path = '' as $$
  select count(*)::int
  from core.requests r join core.entries e on e.id = r.entry_id
  join core.departments d on d.id = r.to_department_id
  where e.visit_id = p_visit_id and r.status = 'open' and e.type <> 'prescription'
    and not d.is_outside and r.due_at <= pg_catalog.now() + interval '14 days'
$$;

-- ── write_entry: the one door into the record ──
create or replace function core.write_entry(
  p_id uuid, p_organization_id uuid, p_patient_id uuid, p_visit_id uuid, p_department_id uuid,
  p_author_id uuid, p_responsible_id uuid, p_source core.entry_source, p_source_key text,
  p_occurred_at timestamptz, p_type text, p_service_id uuid, p_data jsonb, p_display_line text,
  p_reply_to_id uuid, p_is_final boolean, p_replaces_id uuid, p_written_with_id uuid,
  p_destination jsonb default null, p_needs_review boolean default true
) returns core.entries language plpgsql security definer set search_path = '' as $$
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
  select * into e from core.entries where id = p_id;
  if found then
    if e.patient_id <> p_patient_id or e.type <> p_type then perform core.refuse('id_in_use'); end if;
    return e;
  end if;
  if p_source_key is not null then
    select * into e from core.entries where organization_id = p_organization_id and source = p_source and source_key = p_source_key;
    if found then return e; end if;
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
