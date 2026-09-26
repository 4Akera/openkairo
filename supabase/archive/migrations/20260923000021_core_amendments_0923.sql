-- 0021 · amendments of 2026-09-23 (spec/amendments-2026-09-23.md):
--   1 the patient waits for results by default; Done can say "not waiting"; results that come back to a patient who is no
--     longer there go to review as "not seen" (reception marks gone, the sweep, or a closed visit)
--   2 which results need review is a clinic setting (critical · abnormal · all; default critical); the clinician's Done clears
--     what was seen in that consult (not criticals); a corrected result always goes back to review; the reason is kept
--   3 ranges by sex and age saved with the service; read_ranges
--   5 a service's reply type is a registered entry type (core result/note, or an enabled pack's) or none; replies are checked;
--     dispensing is the Pharmacy pack's type
--   6 the request queue carries the day's released results, so a department can correct one

alter table core.organizations add column if not exists review_results text not null default 'critical' check (review_results in ('critical','abnormal','all'));
alter table core.requests add column if not exists review_reason text;

create or replace function public.read_organization_settings(organization_id uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare u uuid;
begin
  u := core.require_access(organization_id, 'read:organization', null, null);
  return (select pg_catalog.jsonb_build_object('review_results', o.review_results) from core.organizations o where o.id = read_organization_settings.organization_id);
end $$;
create or replace function public.save_organization_settings(organization_id uuid, review_results text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare u uuid;
begin
  u := core.require_access(organization_id, 'manage:organization', null, null);
  if review_results not in ('critical','abnormal','all') then perform core.refuse('bad_setting', review_results); end if;
  update core.organizations o set review_results = save_organization_settings.review_results where o.id = save_organization_settings.organization_id;
  perform core.record_settings_change(organization_id, u, 'organizations', organization_id, pg_catalog.jsonb_build_object('review_results', review_results));
  return public.read_organization_settings(organization_id);
end $$;

-- why a result needs a look, or null: critical always · a correction always · the clinic's rule · a final result nobody is there to see
create or replace function core.review_reason(r core.requests, last core.entries, worst core.value_flag) returns text
language plpgsql stable security definer set search_path = '' as $$
declare setting text; v core.visits;
begin
  if last.id is null then return null; end if;
  if worst = 'critical' then return 'critical'; end if;
  if last.replaces_id is not null then return 'corrected'; end if;
  select o.review_results into setting from core.organizations o where o.id = r.organization_id;
  if setting in ('abnormal','all') and worst in ('low','high','abnormal') then return 'abnormal'; end if;
  if setting = 'all' and last.is_final then return 'result'; end if;
  if not last.is_final then return null; end if;
  select vv.* into v from core.entries e join core.visits vv on vv.id = e.visit_id where e.id = r.entry_id;
  if v.id is null or v.ended_at is not null or v.present_at is null then return 'not seen'; end if;
  return null;                                   -- the patient is here waiting: the clinician sees it when they come back
end $$;

-- the patient is no longer there: every result that came back since the clinician last saw them goes to review
create or replace function core.flag_unseen(p_visit_id uuid) returns int
language plpgsql security definer set search_path = '' as $$
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

-- the clinician's Done: what came back before now was on their screen; criticals still need an explicit review
create or replace function core.clear_seen(p_visit_id uuid, p_actor uuid) returns int
language plpgsql security definer set search_path = '' as $$
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


create or replace function core.refold_request(p_request_id uuid, p_needs_review boolean default true) returns void
language plpgsql security definer set search_path = '' as $$
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

drop function if exists public.mark_visit(uuid, core.visit_status, core.visit_status, text);
create function public.mark_visit(visit_id uuid, from_status core.visit_status, status core.visit_status, reason text default null, wait boolean default true) returns core.visits
language plpgsql security definer set search_path = '' as $$
declare v core.visits; u uuid; act text; legal boolean; target core.visit_status := status;
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
  if from_status = 'in_consult' and status = 'done' and wait and core.holds(v.id) > 0 then target := 'pending'; end if;
  update core.visits set status = target,
    seen_at = case when target = 'in_consult' and seen_at is null then pg_catalog.clock_timestamp() else seen_at end,
    assignee_id = case when target = 'in_consult' then u else assignee_id end,
    ended_at = case when target in ('done','left','cancelled') then pg_catalog.clock_timestamp() else ended_at end,
    present_at = case when target in ('done','left','cancelled') then null else present_at end
    where id = visit_id returning * into v;
  perform core.change_visit(v, target, u, reason, case when target = 'in_consult' then pg_catalog.jsonb_build_object('assignee_id', u) when not wait then '{"wait": false}'::jsonb end);
  if from_status = 'in_consult' and target in ('done','pending') then perform core.clear_seen(v.id, u); end if;
  if target in ('done','left','cancelled') and from_status <> 'in_consult' then perform core.flag_unseen(v.id); end if;
  return v;
end $$;
grant execute on function public.mark_visit(uuid, core.visit_status, core.visit_status, text, boolean) to authenticated;

create or replace function public.mark_present(visit_id uuid, is_present boolean) returns core.visits
language plpgsql security definer set search_path = '' as $$
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

create or replace function core.sweep_visits() returns int
language plpgsql security definer set search_path = '' as $$
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

create or replace function core.entry_card(e core.entries) returns jsonb
language sql stable security definer set search_path = '' as $$
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

create or replace function public.read_queue(department_id uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare org uuid; u uuid;
begin
  select organization_id into org from core.departments where id = department_id; if org is null then perform core.refuse('not_found', 'department'); end if;
  u := core.require_access(org, 'read:queue', null, department_id);
  return pg_catalog.jsonb_build_object(
    'requests', coalesce((select pg_catalog.jsonb_agg(core.entry_card(e) || pg_catalog.jsonb_build_object(
          'patient', pg_catalog.jsonb_build_object('id', p.id, 'record_number', p.record_number, 'given_name', p.given_name, 'family_name', p.family_name, 'sex', p.sex, 'born_on', p.born_on),
          'from_department_name', e.data->>'department_name', 'requester_name', e.data->>'author_name', 'question_text', e.data->>'question_text',
          'section_name', s.section_name, 'service_name', s.name, 'reply_type', s.reply_type, 'assignee_id', r.assignee_id)
        order by r.priority, r.due_at)
      from core.requests r join core.entries e on e.id = r.entry_id join core.patients p on p.id = e.patient_id left join core.services s on s.id = e.service_id
      where r.to_department_id = read_queue.department_id and r.status = 'open'), '[]'),
    'recent', coalesce((select pg_catalog.jsonb_agg(core.entry_card(e) || pg_catalog.jsonb_build_object(
          'patient', pg_catalog.jsonb_build_object('id', p.id, 'record_number', p.record_number, 'given_name', p.given_name, 'family_name', p.family_name, 'sex', p.sex, 'born_on', p.born_on),
          'from_department_name', e.data->>'department_name', 'requester_name', e.data->>'author_name', 'section_name', s.section_name, 'service_name', s.name,
          'reply', (select pg_catalog.jsonb_build_object('id', x.id, 'data', x.data, 'author_name', x.data->>'author_name', 'recorded_at', x.recorded_at, 'is_final', x.is_final)
                    from core.entries x where x.reply_to_id = e.id and x.replaced_by_id is null and x.type <> 'entered_in_error' order by x.occurred_at desc limit 1))
        order by r.replied_at desc)
      from (select * from core.requests rq where rq.to_department_id = read_queue.department_id and rq.status in ('done','cancelled')
              and rq.replied_at > pg_catalog.now() - interval '24 hours' order by rq.replied_at desc limit 300) r
      join core.entries e on e.id = r.entry_id join core.patients p on p.id = e.patient_id left join core.services s on s.id = e.service_id), '[]'),
    'done_today', (select count(*) from core.requests r where r.to_department_id = read_queue.department_id and r.status = 'done'
                   and exists (select 1 from core.request_steps st where st.request_id = r.entry_id and st.step = 'done' and st.recorded_at > date_trunc('day', pg_catalog.now()))));
end $$;

create or replace function public.write_result(
  id uuid, patient_id uuid, visit_id uuid default null, department_id uuid default null,
  replaces_id uuid default null, occurred_at timestamptz default null, responsible_id uuid default null,
  source core.entry_source default 'staff', source_key text default null, stated_author_name text default null, stated_recorded_at timestamptz default null,
  written_with_id uuid default null,
  request_id uuid default null, "values" jsonb default '[]', text text default null, is_final boolean default true,
  not_done boolean default false, not_done_reason_text text default null, needs_review boolean default true, files jsonb default '[]'
) returns core.entries language plpgsql security definer set search_path = '' as $$
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

create or replace function public.write_note(
  id uuid, patient_id uuid, visit_id uuid default null, department_id uuid default null,
  replaces_id uuid default null, occurred_at timestamptz default null, responsible_id uuid default null,
  source core.entry_source default 'staff', source_key text default null, stated_author_name text default null, stated_recorded_at timestamptz default null,
  written_with_id uuid default null,
  kind text default 'progress', text text default null, fields jsonb default null, problems jsonb default '[]',
  reply_to_id uuid default null, is_final boolean default true, files jsonb default '[]'
) returns core.entries language plpgsql security definer set search_path = '' as $$
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
declare h record; m core.patient_medications; d jsonb; line text; dest jsonb; disp uuid; dose_text text;
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
    select s.department_id into disp from core.services s
      where s.organization_id = h.o_org and s.reply_type = 'pharmacy_dispense' and s.retired_at is null and s.department_id is not null
        and (not exists (select 1 from core.served_departments sd where sd.department_id = s.department_id)
             or exists (select 1 from core.served_departments sd where sd.department_id = s.department_id and (sd.served_department_id is null or sd.served_department_id = write_prescription.department_id)))
      limit 1;
    if disp is not null then dest := pg_catalog.jsonb_build_object('to_department_id', disp, 'priority', 'routine'); end if;
  end if;
  return core.write_entry(id, h.o_org, patient_id, visit_id, department_id, h.o_author, responsible_id, source, source_key, occurred_at,
    'prescription', null, d, line, null, true, replaces_id, written_with_id, dest);
end $$;

-- the reply types a service may name here: core's result and note, every entry type of an enabled pack, or none
create or replace function public.read_reply_types(organization_id uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare u uuid;
begin
  u := core.require_access(organization_id, 'read:organization', null, null);
  return pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object('key', 'none', 'name', 'Just done', 'pack', null))
    || coalesce((select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('key', t.key, 'name', t.name, 'pack', t.pack) order by t.pack nulls first, t.key)
       from core.entry_types t where t.retired_at is null and ((t.pack is null and t.key in ('result','note'))
         or t.pack in (select op.pack from core.organization_packs op where op.organization_id = read_reply_types.organization_id and op.retired_at is null))), '[]');
end $$;
-- every range by sex and age, for the settings editor and the bench's live flags (the server flags on write)
create or replace function public.read_ranges(organization_id uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare u uuid;
begin
  u := core.require_access(organization_id, 'read:organization', null, null);
  return coalesce((select pg_catalog.jsonb_agg(pg_catalog.to_jsonb(r) order by r.service_id, r.position, r.sex nulls last, r.age_low nulls first)
    from core.service_field_ranges r join core.services s on s.id = r.service_id where s.organization_id = read_ranges.organization_id and s.retired_at is null), '[]');
end $$;


drop function if exists public.save_service(uuid, uuid, uuid, text, text, text, text, jsonb, uuid);
create function public.save_service(id uuid, organization_id uuid, department_id uuid, code text, name text, reply_type text default 'result',
  section_name text default null, fields jsonb default '[]', seen_change_id uuid default null, ranges jsonb default '[]')
returns core.services language plpgsql security definer set search_path = '' as $$
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
grant execute on function public.save_service(uuid, uuid, uuid, text, text, text, text, jsonb, uuid, jsonb) to authenticated;

grant execute on function public.read_organization_settings(uuid), public.save_organization_settings(uuid, text), public.read_reply_types(uuid), public.read_ranges(uuid) to authenticated;
