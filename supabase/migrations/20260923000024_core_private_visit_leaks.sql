-- 0024 · closing the private-visit leaks found by the adversarial review of spec 07 (2026-09-24)
--   the retry-by-id of a write returns the stored row only to its author · a note that answers a request is readable by the department that
--   asked; to everyone else a hidden reply shows as "Private reply" (request cards, queues, review lists) · hidden notes' files and values are
--   refused · open_visit replays only its own visit · only a role in the visit's department changes its privacy · search names a private
--   visit's department only to its staff and the reception desks serving it · mark_step/mark_routing and read_sent_outside mask like the
--   reads · the live channels need the same access as the reads they hint at

create or replace function core.is_note(p_type text) returns boolean
language sql stable security definer set search_path = '' as $$ select coalesce((select t.is_note from core.entry_types t where t.key = p_type), false) $$;

-- who may see a department's name on a private visit: its own staff, and the reception desks that serve it
create or replace function core.sees_department(p_user uuid, p_org uuid, p_department uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from core.user_roles ur join core.roles r on r.id = ur.role_id and r.retired_at is null
                 where ur.user_id = p_user and ur.organization_id = p_org and ur.department_id = p_department)
      or exists (select 1 from core.user_roles ur join core.departments rd on rd.id = ur.department_id and rd.type = 'reception'
                 join core.served_departments sd on sd.department_id = rd.id
                 where ur.user_id = p_user and ur.organization_id = p_org and (sd.served_department_id = p_department or sd.served_department_id is null))
$$;

-- a note that answers a request is written for whoever asked: the requester, and staff of the requesting department
create or replace function core.reply_for_me(e core.entries) returns boolean
language sql stable security definer set search_path = '' as $$
  select e.reply_to_id is not null and exists (
    select 1 from core.requests r where r.entry_id = e.reply_to_id
      and (r.requester_id = core.current_user_id(e.organization_id)
           or exists (select 1 from core.user_roles ur join core.role_actions ra on ra.role_id = ur.role_id and ra.action = 'read:record'
                      join core.roles ro on ro.id = ur.role_id and ro.retired_at is null
                      where ur.user_id = core.current_user_id(e.organization_id) and ur.department_id = r.from_department_id)))
$$;

-- the one test every read applies to an entry
create or replace function core.note_hidden(e core.entries, p_hidden uuid[]) returns boolean
language sql stable security definer set search_path = '' as $$
  select e.visit_id is not null and e.visit_id = any(p_hidden) and core.is_note(e.type) and not core.reply_for_me(e)
$$;

create or replace function core.entry_card(e core.entries, p_hidden uuid[]) returns jsonb
language sql stable security definer set search_path = '' as $$
  select case
    when core.note_hidden(e, p_hidden) then pg_catalog.jsonb_build_object(
      'id', e.id, 'type', e.type, 'occurred_at', e.occurred_at, 'recorded_at', e.recorded_at, 'author_name', null, 'department_name', 'Private visit',
      'display_line', 'Private note', 'flag', null, 'is_final', e.is_final, 'source', e.source, 'reply_to_id', e.reply_to_id, 'replaces_id', e.replaces_id,
      'replaced_by_id', e.replaced_by_id, 'visit_id', e.visit_id, 'service_id', null, 'is_hidden', true)
    else core.entry_card(e)
      || case when e.visit_id is not null and e.visit_id = any(p_hidden) then '{"department_name": "Private visit"}'::jsonb else '{}'::jsonb end
      || case when exists (select 1 from core.requests r where r.entry_id = e.id)
               and exists (select 1 from core.entries x where x.reply_to_id = e.id and x.replaced_by_id is null and x.type <> 'entered_in_error' and core.note_hidden(x, p_hidden))
              then pg_catalog.jsonb_build_object('request', (core.entry_card(e)->'request') || '{"reply_line": "Private reply", "reply_flag": null}'::jsonb)
              else '{}'::jsonb end
  end
$$;
create or replace function core.entry_data(e core.entries, p_hidden uuid[]) returns jsonb
language sql stable security definer set search_path = '' as $$
  select case when core.note_hidden(e, p_hidden) then '{}'::jsonb
              when e.visit_id is not null and e.visit_id = any(p_hidden) then e.data - 'department_name'
              else e.data end
$$;
-- the hidden visits of the patient an entry belongs to, for reads that go row by row (queues, lists)
create or replace function core.hidden_for(p_user uuid, p_patient uuid) returns uuid[]
language sql stable security definer set search_path = '' as $$
  select core.hidden_visits(p_user, (select pg_catalog.array_agg(x.id) from core.patients x where x.id = core.survivor(p_patient) or x.merged_into_id = core.survivor(p_patient)))
$$;

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

create or replace function public.read_entry(entry_id uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare e core.entries; u uuid; hidden uuid[];
begin
  select * into e from core.entries where id = entry_id; if not found then perform core.refuse('not_found'); end if;
  u := core.require_access(e.organization_id, 'read:record', e.patient_id, null);
  perform core.require_open(u, core.survivor(e.patient_id));
  hidden := core.hidden_visits(u, (select pg_catalog.array_agg(id) from core.patients where id = core.survivor(e.patient_id) or merged_into_id = core.survivor(e.patient_id)));
  if core.note_hidden(e, hidden) then
    return core.entry_card(e, hidden) || pg_catalog.jsonb_build_object('data', '{}'::jsonb, 'patient_id', e.patient_id, 'replies', '[]'::jsonb, 'files', '[]'::jsonb, 'steps', '[]'::jsonb, 'versions', '[]'::jsonb);
  end if;
  return core.entry_card(e, hidden) || pg_catalog.jsonb_build_object('data', core.entry_data(e, hidden), 'patient_id', e.patient_id,
    'patient', (select pg_catalog.jsonb_build_object('id', p.id, 'record_number', p.record_number, 'given_name', p.given_name, 'family_name', p.family_name, 'sex', p.sex, 'age', core.age_on(p.born_on, current_date))
                from core.patients p where p.id = e.patient_id),
    'replies', coalesce((select pg_catalog.jsonb_agg(core.entry_card(x, hidden) || pg_catalog.jsonb_build_object('data', core.entry_data(x, hidden)) order by x.occurred_at) from core.entries x where x.reply_to_id = e.id and x.replaced_by_id is null and x.type <> 'entered_in_error'), '[]'),
    'files', coalesce((select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('position', f.position, 'name', f.name, 'mime', f.mime) order by f.position) from core.entry_files f where f.entry_id = e.id), '[]'),
    'steps', coalesce((select pg_catalog.jsonb_agg(pg_catalog.to_jsonb(s) - 'actor_id' - 'changes' order by s.position) from core.request_steps s where s.request_id = e.id), '[]'),
    'versions', coalesce((select pg_catalog.jsonb_agg(core.entry_card(x, hidden) || pg_catalog.jsonb_build_object('data', core.entry_data(x, hidden)) order by x.recorded_at) from core.chain_of(e.id) x where x.id <> e.id), '[]'));
end $$;

create or replace function public.read_entry_file(entry_id uuid, file_position smallint) returns text
language plpgsql stable security definer set search_path = '' as $$
declare e core.entries; f core.entry_files; u uuid;
begin
  select * into e from core.entries where id = entry_id; if not found then perform core.refuse('not_found'); end if;
  u := core.require_access(e.organization_id, 'read:record', e.patient_id, null); perform core.require_open(u, core.survivor(e.patient_id));
  if core.note_hidden(e, core.hidden_for(u, e.patient_id)) then perform core.refuse('private_visit'); end if;
  select * into f from core.entry_files where entry_files.entry_id = read_entry_file.entry_id and entry_files.position = file_position;
  if not found then perform core.refuse('not_found', 'file'); end if;
  return coalesce(f.url, f.path);   -- the client exchanges a path for a 60 s signed URL through storage
end $$;

create or replace function public.read_values(patient_id uuid, codes text[], "limit" int default 12) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare org uuid; u uuid; sv uuid; ids uuid[];
begin
  org := core.org_of_patient(patient_id); if org is null then perform core.refuse('wrong_organization', 'patient'); end if;
  u := core.require_access(org, 'read:record', patient_id, null);
  sv := core.survivor(patient_id); perform core.require_open(u, sv);
  select pg_catalog.array_agg(id) into ids from core.patients where id = sv or merged_into_id = sv;
  return coalesce((select pg_catalog.jsonb_object_agg(c, pts) from (
    select c, (select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('at', v.occurred_at, 'value_number', v.value_number, 'value_text', v.value_text, 'unit', v.unit, 'flag', v.flag, 'entry_id', v.entry_id) order by v.occurred_at desc)
               from (select y.* from core.entry_values y join core.entries ye on ye.id = y.entry_id where y.patient_id = any(ids) and (y.code = c or y.code in (select code from core.codes where replaced_by_code = c)) and not core.note_hidden(ye, core.hidden_visits(u, ids)) order by y.occurred_at desc limit "limit") v) as pts
    from pg_catalog.unnest(codes) c) t), '{}');
end $$;

create or replace function public.read_results_table(patient_id uuid, "limit" int default 12) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare org uuid; u uuid; sv uuid; ids uuid[]; hidden uuid[];
begin
  org := core.org_of_patient(patient_id); if org is null then perform core.refuse('wrong_organization', 'patient'); end if;
  u := core.require_access(org, 'read:record', patient_id, null);
  sv := core.survivor(patient_id); perform core.require_open(u, sv);
  select pg_catalog.array_agg(id) into ids from core.patients where id = sv or merged_into_id = sv;
  hidden := core.hidden_visits(u, ids);
  return coalesce((select pg_catalog.jsonb_agg(t.row order by t.last_at desc) from (
    select max(v.occurred_at) as last_at, pg_catalog.jsonb_build_object('code', v.code, 'name', coalesce(max(c.name), v.code), 'unit', max(v.unit),
      'points', (select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('at', p.occurred_at, 'value_number', p.value_number, 'value_text', p.value_text, 'flag', p.flag,
                   'entry_id', p.entry_id, 'corrected', p.corrected) order by p.occurred_at desc)
                 from (select w.*, e2.replaces_id is not null as corrected from core.entry_values w join core.entries e2 on e2.id = w.entry_id
                       where w.patient_id = any(ids) and w.code = v.code and e2.replaced_by_id is null and not core.note_hidden(e2, hidden) order by w.occurred_at desc limit greatest(1, least("limit", 50))) p)) as row
    from core.entry_values v join core.entries e on e.id = v.entry_id left join core.codes c on c.code = v.code
    where v.patient_id = any(ids) and e.replaced_by_id is null and not core.note_hidden(e, hidden) group by v.code) t), '[]');
end $$;

create or replace function public.read_queue(department_id uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare org uuid; u uuid;
begin
  select organization_id into org from core.departments where id = department_id; if org is null then perform core.refuse('not_found', 'department'); end if;
  u := core.require_access(org, 'read:queue', null, department_id);
  return pg_catalog.jsonb_build_object(
    'requests', coalesce((select pg_catalog.jsonb_agg(core.entry_card(e, core.hidden_for(u, e.patient_id)) || case when core.visit_hidden(u, e.visit_id) then '{"department_name": "Private visit"}'::jsonb else '{}'::jsonb end || pg_catalog.jsonb_build_object(
          'patient', pg_catalog.jsonb_build_object('id', p.id, 'record_number', p.record_number, 'given_name', p.given_name, 'family_name', p.family_name, 'sex', p.sex, 'born_on', p.born_on),
          'from_department_name', case when core.visit_hidden(u, e.visit_id) then 'Private visit' else e.data->>'department_name' end, 'requester_name', e.data->>'author_name', 'question_text', e.data->>'question_text',
          'section_name', s.section_name, 'service_name', s.name, 'reply_type', s.reply_type, 'assignee_id', r.assignee_id,
          'details', case when e.type = 'prescription' then pg_catalog.jsonb_strip_nulls(pg_catalog.jsonb_build_object('drug', e.data->'drug', 'dose_number', e.data->'dose_number',
             'dose_unit', e.data->'dose_unit', 'route', e.data->'route', 'frequency', e.data->'frequency', 'prn', e.data->'prn', 'duration_days', e.data->'duration_days',
             'quantity', e.data->'quantity', 'repeats', e.data->'repeats', 'instructions_text', e.data->'instructions_text')) end)
        order by r.priority, r.due_at)
      from core.requests r join core.entries e on e.id = r.entry_id join core.patients p on p.id = e.patient_id left join core.services s on s.id = e.service_id
      where r.to_department_id = read_queue.department_id and r.status = 'open'), '[]'),
    'recent', coalesce((select pg_catalog.jsonb_agg(core.entry_card(e, core.hidden_for(u, e.patient_id)) || case when core.visit_hidden(u, e.visit_id) then '{"department_name": "Private visit"}'::jsonb else '{}'::jsonb end || pg_catalog.jsonb_build_object(
          'patient', pg_catalog.jsonb_build_object('id', p.id, 'record_number', p.record_number, 'given_name', p.given_name, 'family_name', p.family_name, 'sex', p.sex, 'born_on', p.born_on),
          'from_department_name', case when core.visit_hidden(u, e.visit_id) then 'Private visit' else e.data->>'department_name' end, 'requester_name', e.data->>'author_name', 'section_name', s.section_name, 'service_name', s.name,
          'reply', (select case when core.note_hidden(x, core.hidden_for(u, x.patient_id)) then pg_catalog.jsonb_build_object('id', x.id, 'data', '{}'::jsonb, 'author_name', null, 'recorded_at', x.recorded_at, 'is_final', x.is_final, 'is_hidden', true)
                    else pg_catalog.jsonb_build_object('id', x.id, 'data', core.entry_data(x, core.hidden_for(u, x.patient_id)), 'author_name', x.data->>'author_name', 'recorded_at', x.recorded_at, 'is_final', x.is_final) end
                    from core.entries x where x.reply_to_id = e.id and x.replaced_by_id is null and x.type <> 'entered_in_error' order by x.occurred_at desc limit 1))
        order by r.replied_at desc)
      from (select * from core.requests rq where rq.to_department_id = read_queue.department_id and rq.status in ('done','cancelled')
              and rq.replied_at > pg_catalog.now() - interval '24 hours' order by rq.replied_at desc limit 300) r
      join core.entries e on e.id = r.entry_id join core.patients p on p.id = e.patient_id left join core.services s on s.id = e.service_id), '[]'),
    'done_today', (select count(*) from core.requests r where r.to_department_id = read_queue.department_id and r.status = 'done'
                   and exists (select 1 from core.request_steps st where st.request_id = r.entry_id and st.step = 'done' and st.recorded_at > date_trunc('day', pg_catalog.now()))));
end $$;

create or replace function public.read_to_review(department_id uuid default null) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare u uuid; org uuid;
begin
  if department_id is not null then
    select organization_id into org from core.departments where id = department_id;
    u := core.require_access(org, 'read:queue', null, department_id);
  else
    -- mine: any organization I belong to; find it from the login
    select organization_id, id into org, u from core.users where login_id = core.auth_uid() and retired_at is null limit 1;
    if u is null then perform core.refuse('not_a_member'); end if;
    perform core.require_access(org, 'mark:reviewed', null, null);
  end if;
  return coalesce((select pg_catalog.jsonb_agg(core.entry_card(e, core.hidden_for(u, e.patient_id)) || pg_catalog.jsonb_build_object(
        'patient', pg_catalog.jsonb_build_object('id', p.id, 'record_number', p.record_number, 'given_name', p.given_name, 'family_name', p.family_name),
        'service_name', e.data->'service'->>'name') order by (r.reply_flag = 'critical') desc, r.review_needed_at)
    from core.requests r join core.entries e on e.id = r.entry_id join core.patients p on p.id = e.patient_id
    where r.review_needed_at is not null and ((read_to_review.department_id is null and r.requester_id = u) or (read_to_review.department_id is not null and r.from_department_id = read_to_review.department_id))), '[]');
end $$;

create or replace function public.read_sent_outside(organization_id uuid, department_id uuid default null) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare u uuid;
begin
  u := core.require_access(organization_id, 'read:queue', null, department_id);
  return coalesce((select pg_catalog.jsonb_agg(core.entry_card(e, core.hidden_for(u, e.patient_id)) || pg_catalog.jsonb_build_object('patient_id', e.patient_id) order by r.due_at)
    from core.requests r join core.entries e on e.id = r.entry_id join core.departments d on d.id = r.to_department_id
    where r.organization_id = read_sent_outside.organization_id and r.status = 'open' and d.is_outside
      and (read_sent_outside.department_id is null or r.from_department_id = read_sent_outside.department_id)), '[]');
end $$;

create or replace function public.open_visit(id uuid, patient_id uuid, department_id uuid, priority core.request_priority default 'routine', assignee_id uuid default null, request_id uuid default null)
returns core.visits language plpgsql security definer set search_path = '' as $$
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
    insert into core.visits (id, organization_id, patient_id, department_id, request_id, assignee_id, status, priority, is_first, present_at, is_private)
    values (id, org, patient_id, department_id, request_id, assignee_id, 'waiting', priority, first, pg_catalog.clock_timestamp(),
      (select dp.private_visits from core.departments dp where dp.id = open_visit.department_id)) returning * into v;
  exception when unique_violation then
    select * into v from core.visits where visits.patient_id = open_visit.patient_id and visits.department_id = open_visit.department_id and ended_at is null;
    return v;
  end;
  perform core.change_visit(v, 'waiting', u, null, pg_catalog.jsonb_build_object('request_id', request_id, 'assignee_id', assignee_id, 'priority', priority, 'is_first', first));
  return v;
end $$;

create or replace function public.mark_visit_private(visit_id uuid, is_private boolean, reason text default null) returns core.visits
language plpgsql security definer set search_path = '' as $$
declare v core.visits; u uuid;
begin
  select * into v from core.visits where id = visit_id for update; if not found then perform core.refuse('not_found'); end if;
  u := core.require_access(v.organization_id, 'mark:in_consult', v.patient_id, v.department_id);
  if not exists (select 1 from core.user_roles ur join core.role_actions ra on ra.role_id = ur.role_id and ra.action = 'mark:in_consult'
                 join core.roles r on r.id = ur.role_id and r.retired_at is null where ur.user_id = u and ur.department_id = v.department_id) then
    perform core.refuse('not_allowed', 'a role in this visit''s department');
  end if;
  if v.is_private = mark_visit_private.is_private then return v; end if;
  update core.visits set is_private = mark_visit_private.is_private where id = v.id returning * into v;
  perform core.change_visit(v, v.status, u, reason, pg_catalog.jsonb_build_object('is_private', v.is_private));
  return v;
end $$;

create or replace function core.patient_hit(p core.patients, u uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select pg_catalog.jsonb_build_object('id', p.id, 'record_number', p.record_number, 'given_name', p.given_name, 'middle_name', p.middle_name, 'family_name', p.family_name,
    'sex', p.sex, 'born_on', p.born_on, 'age', core.age_on(p.born_on, current_date), 'died_on', p.died_on, 'phone_text', p.phone_text, 'merged_into_id', p.merged_into_id,
    'identifiers', coalesce((select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('system', i.system, 'value', i.value)) from core.patient_identifiers i where i.patient_id = p.id), '[]'),
    'latest_change_id', (select c.id from core.patient_changes c where c.patient_id = p.id order by c.recorded_at desc limit 1),
    'open_visits', coalesce((select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('id', v.id,
        'department_id', case when v.is_private and not core.sees_department(u, p.organization_id, v.department_id) and core.visit_hidden(u, v.id) then null else v.department_id end,
        'department_name', case when v.is_private and not core.sees_department(u, p.organization_id, v.department_id) and core.visit_hidden(u, v.id) then 'Private visit' else d.name end, 'is_private', v.is_private, 'status', v.status,
        'present', v.present_at is not null, 'arrived_at', v.arrived_at,
        'assignee_id', case when v.is_private and not core.sees_department(u, p.organization_id, v.department_id) and core.visit_hidden(u, v.id) then null else v.assignee_id end) order by v.arrived_at desc)
      from core.visits v join core.departments d on d.id = v.department_id where v.patient_id = p.id and v.ended_at is null), '[]'),
    'open_consults', coalesce((select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('request_id', r.entry_id, 'to_department_id', r.to_department_id, 'question_text', e.data->>'question_text'))
      from core.requests r join core.entries e on e.id = r.entry_id join core.services s on s.id = e.service_id join core.department_types t on t.key = (select type from core.departments where id = r.to_department_id)
      where r.patient_id = p.id and r.status = 'open' and s.reply_type = 'note' and t.is_visited), '[]'))
$$;

create or replace function public.read_patient(patient_id uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare org uuid; u uuid; p core.patients;
begin
  org := core.org_of_patient(patient_id); if org is null then perform core.refuse('not_found'); end if;
  u := core.require_access(org, 'read:patient', patient_id, null);
  select * into p from core.patients where id = coalesce((select merged_into_id from core.patients where id = patient_id), patient_id);
  return core.patient_hit(p, u) || pg_catalog.jsonb_build_object(
    'visits', coalesce((select pg_catalog.jsonb_agg(case when v.is_private and not core.sees_department(u, org, v.department_id) and core.visit_hidden(u, v.id)
        then pg_catalog.to_jsonb(v) || pg_catalog.jsonb_build_object('department_id', null, 'assignee_id', null, 'request_id', null, 'department_name', 'Private visit')
        else pg_catalog.to_jsonb(v) || pg_catalog.jsonb_build_object('department_name', d.name) end order by v.arrived_at desc)
      from core.visits v join core.departments d on d.id = v.department_id where v.patient_id = p.id), '[]'),
    'changes', coalesce((select pg_catalog.jsonb_agg(pg_catalog.to_jsonb(c) order by c.recorded_at desc) from core.patient_changes c where c.patient_id = p.id), '[]'));
end $$;

create or replace function public.mark_step(request_id uuid, from_step core.request_step, step core.request_step, reason text default null, occurred_at timestamptz default null)
returns core.requests language plpgsql security definer set search_path = '' as $$
declare r core.requests; u uuid; act text; x core.requests;
begin
  select * into r from core.requests where entry_id = request_id;
  if not found then perform core.refuse('request_not_found'); end if;
  act := 'mark:' || step::text;
  -- cancel belongs to the requester (or anyone holding mark:cancelled at the destination); every other step is the destination's
  if step = 'cancelled' and core.current_user_id(r.organization_id) = r.requester_id then u := core.require_access(r.organization_id, 'write:request', r.patient_id, r.from_department_id);
  else u := core.require_access(r.organization_id, act, r.patient_id, r.to_department_id); end if;
  x := core.change_request(request_id, from_step, step, u, reason, null, occurred_at);
  if core.visit_hidden(u, (select e.visit_id from core.entries e where e.id = x.entry_id)) then x.from_department_id := null; x.requester_id := null; end if;
  return x;
end $$;

create or replace function public.mark_routing(request_id uuid, assignee_id uuid default null, to_department_id uuid default null, priority core.request_priority default null, due_at timestamptz default null, reason text default null)
returns core.requests language plpgsql security definer set search_path = '' as $$
declare r core.requests; u uuid; x core.requests;
begin
  select * into r from core.requests where entry_id = request_id;
  if not found then perform core.refuse('request_not_found'); end if;
  u := core.require_access(r.organization_id, 'mark:routing', r.patient_id, r.to_department_id);
  x := core.route_request(request_id, u, assignee_id, to_department_id, priority, due_at, reason);
  if core.visit_hidden(u, (select e.visit_id from core.entries e where e.id = x.entry_id)) then x.from_department_id := null; x.requester_id := null; end if;
  return x;
end $$;

do $$ begin
  if exists (select 1 from pg_catalog.pg_tables where schemaname = 'realtime' and tablename = 'messages') then
    execute 'drop policy if exists opencare_channels on realtime.messages';
    execute $p$
      create policy opencare_channels on realtime.messages for select to authenticated using (
        exists (select 1 from core.users u where u.login_id = core.auth_uid() and (u.retired_at is null or u.retired_at > now())
          and ((realtime.topic() like 'queue:%' and exists (select 1 from core.departments d where d.id::text = substr(realtime.topic(), 7) and d.organization_id = u.organization_id
                                                              and core.can(u.id, u.organization_id, 'read:queue', d.id)))
            or (realtime.topic() like 'record:%' and exists (select 1 from core.patients p where p.id::text = substr(realtime.topic(), 8) and p.organization_id = u.organization_id
                                                              and core.can(u.id, u.organization_id, 'read:record', null)))))
      )$p$;
  end if;
end $$;
grant execute on function core.can(uuid, uuid, text, uuid) to authenticated;

create or replace function public.write_request(
  id uuid, patient_id uuid, visit_id uuid default null, department_id uuid default null,
  replaces_id uuid default null, occurred_at timestamptz default null, responsible_id uuid default null,
  source core.entry_source default 'staff', source_key text default null, stated_author_name text default null, stated_recorded_at timestamptz default null,
  written_with_id uuid default null,
  service_id uuid default null, priority core.request_priority default 'routine', due_at timestamptz default null,
  question_text text default null, problems jsonb default '[]', to_department_id uuid default null
) returns core.entries language plpgsql security definer set search_path = '' as $$
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
