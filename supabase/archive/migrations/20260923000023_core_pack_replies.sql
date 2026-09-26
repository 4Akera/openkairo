-- 0023 · what a pack needs from core to answer a request (spec 06, pharmacy the first):
--   Done's write set runs a pack's own writer (<key>_write_<type>) for an enabled pack · a prescription request carries its dispensing
--   service · the funnel checks every reply against its service's reply type (one rule for core and packs) · the request queue carries a
--   prescription's details (drug, dose, frequency, days, quantity) so the dispenser sees what to give

create or replace function core.call_write(fn text, params jsonb) returns core.entries
language plpgsql security definer set search_path = '' as $$
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
end $$;

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

create or replace function public.write_prescription(
  id uuid, patient_id uuid, visit_id uuid default null, department_id uuid default null,
  replaces_id uuid default null, occurred_at timestamptz default null, responsible_id uuid default null,
  source core.entry_source default 'staff', source_key text default null, stated_author_name text default null, stated_recorded_at timestamptz default null,
  written_with_id uuid default null,
  action text default 'start', medication_id uuid default null, drug jsonb default null,
  dose_number numeric default null, dose_unit text default null, route text default null, frequency text default null,
  prn boolean default false, prn_reason_text text default null, duration_days int default null, quantity numeric default null, repeats int default null,
  instructions_text text default null, problems jsonb default '[]', stop_reason_text text default null
) returns core.entries language plpgsql security definer set search_path = '' as $$
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
    'dose_number', dose_number, 'dose_unit', dose_unit, 'route', route, 'frequency', frequency, 'prn', case when prn then true end, 'prn_reason_text', prn_reason_text,
    'duration_days', duration_days, 'quantity', quantity, 'repeats', repeats, 'instructions_text', instructions_text, 'problems', problems, 'stop_reason_text', stop_reason_text,
    'from', case when action = 'change' then pg_catalog.jsonb_build_object('dose_number', m.dose_number, 'dose_unit', m.dose_unit, 'route', m.route, 'frequency', m.frequency) end));
  line := case action
    when 'start'  then (drug->>'name') || ' ' || dose_text
    when 'repeat' then 'Repeat: ' || (drug->>'name') || ' ' || pg_catalog.concat_ws(' ', m.dose_number::text, m.dose_unit, m.frequency)
    when 'change' then (drug->>'name') || ' ' || pg_catalog.concat_ws(' ', m.dose_number::text, m.dose_unit, m.frequency) || ' → ' || dose_text
    else 'Stopped ' || (drug->>'name') || coalesce(' — ' || core.short(stop_reason_text, 50), '') end;
  -- a request exactly when the organization has a live dispense service this department is served by
  if action in ('start','repeat','change') then
    select s.department_id, s.id into disp, disp_service from core.services s
      where s.organization_id = h.o_org and s.reply_type = 'pharmacy_dispense' and s.retired_at is null and s.department_id is not null
        and (not exists (select 1 from core.served_departments sd where sd.department_id = s.department_id)
             or exists (select 1 from core.served_departments sd where sd.department_id = s.department_id and (sd.served_department_id is null or sd.served_department_id = write_prescription.department_id)))
      limit 1;
    if disp is not null then dest := pg_catalog.jsonb_build_object('to_department_id', disp, 'priority', 'routine'); end if;
  end if;
  return core.write_entry(id, h.o_org, patient_id, visit_id, department_id, h.o_author, responsible_id, source, source_key, occurred_at,
    'prescription', case when dest is not null then disp_service end, d, line, null, true, replaces_id, written_with_id, dest);
end $$;

create or replace function public.read_queue(department_id uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare org uuid; u uuid;
begin
  select organization_id into org from core.departments where id = department_id; if org is null then perform core.refuse('not_found', 'department'); end if;
  u := core.require_access(org, 'read:queue', null, department_id);
  return pg_catalog.jsonb_build_object(
    'requests', coalesce((select pg_catalog.jsonb_agg(core.entry_card(e) || case when core.visit_hidden(u, e.visit_id) then '{"department_name": "Private visit"}'::jsonb else '{}'::jsonb end || pg_catalog.jsonb_build_object(
          'patient', pg_catalog.jsonb_build_object('id', p.id, 'record_number', p.record_number, 'given_name', p.given_name, 'family_name', p.family_name, 'sex', p.sex, 'born_on', p.born_on),
          'from_department_name', case when core.visit_hidden(u, e.visit_id) then 'Private visit' else e.data->>'department_name' end, 'requester_name', e.data->>'author_name', 'question_text', e.data->>'question_text',
          'section_name', s.section_name, 'service_name', s.name, 'reply_type', s.reply_type, 'assignee_id', r.assignee_id,
          'details', case when e.type = 'prescription' then pg_catalog.jsonb_strip_nulls(pg_catalog.jsonb_build_object('drug', e.data->'drug', 'dose_number', e.data->'dose_number',
             'dose_unit', e.data->'dose_unit', 'route', e.data->'route', 'frequency', e.data->'frequency', 'prn', e.data->'prn', 'duration_days', e.data->'duration_days',
             'quantity', e.data->'quantity', 'repeats', e.data->'repeats', 'instructions_text', e.data->'instructions_text')) end)
        order by r.priority, r.due_at)
      from core.requests r join core.entries e on e.id = r.entry_id join core.patients p on p.id = e.patient_id left join core.services s on s.id = e.service_id
      where r.to_department_id = read_queue.department_id and r.status = 'open'), '[]'),
    'recent', coalesce((select pg_catalog.jsonb_agg(core.entry_card(e) || case when core.visit_hidden(u, e.visit_id) then '{"department_name": "Private visit"}'::jsonb else '{}'::jsonb end || pg_catalog.jsonb_build_object(
          'patient', pg_catalog.jsonb_build_object('id', p.id, 'record_number', p.record_number, 'given_name', p.given_name, 'family_name', p.family_name, 'sex', p.sex, 'born_on', p.born_on),
          'from_department_name', case when core.visit_hidden(u, e.visit_id) then 'Private visit' else e.data->>'department_name' end, 'requester_name', e.data->>'author_name', 'section_name', s.section_name, 'service_name', s.name,
          'reply', (select pg_catalog.jsonb_build_object('id', x.id, 'data', x.data, 'author_name', x.data->>'author_name', 'recorded_at', x.recorded_at, 'is_final', x.is_final)
                    from core.entries x where x.reply_to_id = e.id and x.replaced_by_id is null and x.type <> 'entered_in_error' order by x.occurred_at desc limit 1))
        order by r.replied_at desc)
      from (select * from core.requests rq where rq.to_department_id = read_queue.department_id and rq.status in ('done','cancelled')
              and rq.replied_at > pg_catalog.now() - interval '24 hours' order by rq.replied_at desc limit 300) r
      join core.entries e on e.id = r.entry_id join core.patients p on p.id = e.patient_id left join core.services s on s.id = e.service_id), '[]'),
    'done_today', (select count(*) from core.requests r where r.to_department_id = read_queue.department_id and r.status = 'done'
                   and exists (select 1 from core.request_steps st where st.request_id = r.entry_id and st.step = 'done' and st.recorded_at > date_trunc('day', pg_catalog.now()))));
end $$;

-- enabling a pack: its parameters were ambiguous with the table's columns, and its user's role key used ':' which role keys forbid
create or replace function public.save_organization_pack(organization_id uuid, pack text) returns void
language plpgsql security definer set search_path = '' as $$
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
