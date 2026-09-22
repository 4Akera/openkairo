-- 0009 · the public write functions (spec 04): one per core type, write_set, entered_in_error, the marks
create or replace function core.org_of_patient(p uuid) returns uuid
language sql stable security definer set search_path = '' as $$ select organization_id from core.patients where id = p $$;

-- the header every write shares: returns [org, author, data-with-stated-fields]
create or replace function core.begin_write(p_patient_id uuid, p_department_id uuid, p_action text, p_source core.entry_source,
  p_stated_author_name text, p_stated_recorded_at timestamptz, p_data jsonb, out o_org uuid, out o_author uuid, out o_data jsonb)
language plpgsql stable security definer set search_path = '' as $$
begin
  o_org := core.org_of_patient(p_patient_id);
  if o_org is null then perform core.refuse('wrong_organization', 'patient'); end if;
  o_author := core.require_access(o_org, p_action, p_patient_id, p_department_id);
  o_data := coalesce(p_data, '{}'::jsonb);
  if p_source = 'outside' then
    o_data := o_data || pg_catalog.jsonb_strip_nulls(pg_catalog.jsonb_build_object('stated_author_name', p_stated_author_name, 'stated_recorded_at', p_stated_recorded_at));
  end if;
end $$;

create or replace function core.short(t text, n int default 80) returns text
language sql immutable as $$ select case when t is null then null when length(t) <= n then t else left(t, n - 1) || '…' end $$;

-- ── request ──
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
  select * into s from core.services where services.id = service_id and services.organization_id = h.o_org;
  if not found then perform core.refuse('service_not_found'); end if;
  if s.retired_at is not null then perform core.refuse('service_retired'); end if;
  dest := coalesce(s.department_id, to_department_id);
  if dest is null then perform core.refuse('destination_missing'); end if;
  if s.department_id is not null and not exists (
      select 1 from core.served_departments sd where sd.department_id = s.department_id and (sd.served_department_id is null or sd.served_department_id = write_request.department_id))
     and exists (select 1 from core.served_departments sd where sd.department_id = s.department_id) then
    perform core.refuse('not_served', s.name);
  end if;
  if exists (select 1 from core.patients where patients.id = write_request.patient_id and died_on is not null) then perform core.refuse('patient_died'); end if;
  line := s.name || case when question_text is null then '' else ' — ' || core.short(question_text, 60) end;
  return core.write_entry(id, h.o_org, patient_id, visit_id, department_id, h.o_author, responsible_id, source, source_key, occurred_at,
    'request', service_id, h.o_data, line, null, true, replaces_id, written_with_id,
    pg_catalog.jsonb_build_object('to_department_id', dest, 'priority', priority, 'due_at', due_at));
end $$;

-- ── result ──
create or replace function core.values_line(vals jsonb) returns text
language sql immutable as $$
  select pg_catalog.string_agg(v->>'name' || ' ' || coalesce(v->>'value_number', v->>'value_text', '') ||
           case core.flag_of(v) when 'low' then ' ↓' when 'high' then ' ↑' when 'critical' then ' ‼' when 'abnormal' then ' *' else '' end, ' · ' order by
           (core.flag_of(v) is null or core.flag_of(v) = 'normal'), ord)
  from (select v, ord from pg_catalog.jsonb_array_elements(coalesce(vals,'[]')) with ordinality as x(v, ord) limit 3) t
$$;

create or replace function public.write_result(
  id uuid, patient_id uuid, visit_id uuid default null, department_id uuid default null,
  replaces_id uuid default null, occurred_at timestamptz default null, responsible_id uuid default null,
  source core.entry_source default 'staff', source_key text default null, stated_author_name text default null, stated_recorded_at timestamptz default null,
  written_with_id uuid default null,
  request_id uuid default null, "values" jsonb default '[]', text text default null, is_final boolean default true,
  not_done boolean default false, not_done_reason_text text default null, needs_review boolean default true, files jsonb default '[]'
) returns core.entries language plpgsql security definer set search_path = '' as $$
declare h record; r core.requests; req core.entries; svc uuid; line text; d jsonb; e core.entries; f jsonb; i int := 0;
begin
  if request_id is not null then
    select * into r from core.requests where entry_id = request_id;
    if not found then perform core.refuse('request_not_found'); end if;
    select * into req from core.entries where entries.id = request_id;
    svc := req.service_id;
    -- the gate is the request's destination, not the entry's department
    select * into h from core.begin_write(patient_id, r.to_department_id, 'write:result', source, stated_author_name, stated_recorded_at, '{}');
  else
    if source <> 'outside' then perform core.refuse('request_missing', 'a result without a request is an outside result'); end if;
    select * into h from core.begin_write(patient_id, department_id, 'write:result', source, stated_author_name, stated_recorded_at, '{}');
  end if;
  d := h.o_data || pg_catalog.jsonb_strip_nulls(pg_catalog.jsonb_build_object('values', "values", 'text', text, 'not_done', case when not_done then true end, 'not_done_reason_text', not_done_reason_text));
  if not_done then line := 'Not done' || coalesce(' — ' || core.short(not_done_reason_text, 60), '');
  elsif pg_catalog.jsonb_array_length(coalesce("values",'[]')) > 0 then line := coalesce((req.data->'service'->>'name') || ' · ', '') || core.values_line("values");
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

-- ── prescription ──
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
      where s.organization_id = h.o_org and s.reply_type = 'dispense' and s.retired_at is null and s.department_id is not null
        and (not exists (select 1 from core.served_departments sd where sd.department_id = s.department_id)
             or exists (select 1 from core.served_departments sd where sd.department_id = s.department_id and (sd.served_department_id is null or sd.served_department_id = write_prescription.department_id)))
      limit 1;
    if disp is not null then dest := pg_catalog.jsonb_build_object('to_department_id', disp, 'priority', 'routine'); end if;
  end if;
  return core.write_entry(id, h.o_org, patient_id, visit_id, department_id, h.o_author, responsible_id, source, source_key, occurred_at,
    'prescription', null, d, line, null, true, replaces_id, written_with_id, dest);
end $$;

-- ── note ──
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

-- ── vitals ──
create or replace function core.vital(vals jsonb, c text, n text, v numeric, u text) returns jsonb
language sql immutable as $$ select case when v is null then vals else vals || pg_catalog.jsonb_build_object('code', c, 'name', n, 'value_number', v, 'unit', u) end $$;
create or replace function public.write_vitals(
  id uuid, patient_id uuid, visit_id uuid default null, department_id uuid default null,
  replaces_id uuid default null, occurred_at timestamptz default null, responsible_id uuid default null,
  source core.entry_source default 'staff', source_key text default null, stated_author_name text default null, stated_recorded_at timestamptz default null,
  written_with_id uuid default null,
  systolic numeric default null, diastolic numeric default null, pulse numeric default null, respiratory_rate numeric default null,
  temperature numeric default null, spo2 numeric default null, weight numeric default null, height numeric default null
) returns core.entries language plpgsql security definer set search_path = '' as $$
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

-- ── problem ──
create or replace function public.write_problem(
  id uuid, patient_id uuid, visit_id uuid default null, department_id uuid default null,
  replaces_id uuid default null, occurred_at timestamptz default null, responsible_id uuid default null,
  source core.entry_source default 'staff', source_key text default null, stated_author_name text default null, stated_recorded_at timestamptz default null,
  written_with_id uuid default null,
  action text default 'add', problem_id uuid default null, code text default null, name text default null, status text default 'active',
  onset_on text default null, resolved_on text default null, text text default null
) returns core.entries language plpgsql security definer set search_path = '' as $$
declare h record; p core.patient_problems; d jsonb; line text;
begin
  select * into h from core.begin_write(patient_id, department_id, 'write:problem', source, stated_author_name, stated_recorded_at, '{}');
  if action not in ('add','update','resolve') then perform core.refuse('bad_action', action); end if;
  if action = 'add' and name is null then perform core.refuse('name_missing'); end if;
  if action <> 'add' then
    select * into p from core.patient_problems where patient_problems.id = problem_id and patient_problems.patient_id = write_problem.patient_id;
    if not found then perform core.refuse('problem_not_found'); end if;
    name := coalesce(name, p.name); code := coalesce(code, p.code);
  end if;
  d := h.o_data || pg_catalog.jsonb_strip_nulls(pg_catalog.jsonb_build_object('action', action, 'problem_id', problem_id, 'code', code, 'name', name, 'status', status,
         'onset_on', onset_on, 'resolved_on', resolved_on, 'text', text));
  line := name || ' — ' || case action when 'add' then 'added' when 'update' then 'updated' else 'resolved' end;
  return core.write_entry(id, h.o_org, patient_id, visit_id, department_id, h.o_author, responsible_id, source, source_key, occurred_at,
    'problem', null, d, line, null, true, replaces_id, written_with_id, null);
end $$;

-- ── allergy ──
create or replace function public.write_allergy(
  id uuid, patient_id uuid, visit_id uuid default null, department_id uuid default null,
  replaces_id uuid default null, occurred_at timestamptz default null, responsible_id uuid default null,
  source core.entry_source default 'staff', source_key text default null, stated_author_name text default null, stated_recorded_at timestamptz default null,
  written_with_id uuid default null,
  action text default 'add', allergy_id uuid default null, substance jsonb default null, kind text default 'allergy',
  reactions_text text default null, severity text default null, certainty text default 'confirmed', onset_on text default null
) returns core.entries language plpgsql security definer set search_path = '' as $$
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

-- ── list_review ──
create or replace function public.write_list_review(
  id uuid, patient_id uuid, visit_id uuid default null, department_id uuid default null,
  replaces_id uuid default null, occurred_at timestamptz default null, responsible_id uuid default null,
  source core.entry_source default 'staff', source_key text default null, stated_author_name text default null, stated_recorded_at timestamptz default null,
  written_with_id uuid default null,
  list core.list_kind default 'medications', outcome text default 'reviewed', items uuid[] default '{}'
) returns core.entries language plpgsql security definer set search_path = '' as $$
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
end $$;

-- ── entered_in_error ──
create or replace function public.write_entered_in_error(id uuid, replaces_id uuid, department_id uuid, reason_text text)
returns core.entries language plpgsql security definer set search_path = '' as $$
declare old core.entries; h record;
begin
  select * into old from core.entries where entries.id = replaces_id;
  if not found then perform core.refuse('not_found', 'replaces'); end if;
  if coalesce(reason_text, '') = '' then perform core.refuse('reason_missing'); end if;
  select * into h from core.begin_write(old.patient_id, department_id, 'write:entered_in_error', 'staff', null, null, '{}');
  return core.write_entry(id, h.o_org, old.patient_id, old.visit_id, department_id, h.o_author, null, 'staff', null, null,
    'entered_in_error', null, pg_catalog.jsonb_build_object('reason_text', reason_text, 'struck_type', old.type), 'Struck: ' || core.short(reason_text, 60), null, true, replaces_id, null, null);
end $$;

-- ── write_set: everything one Done sends, all-or-nothing ──
-- item: {"function": "write_note", "params": {…}}; the first item's id is written_with_id on every member
create or replace function core.call_write(fn text, params jsonb) returns core.entries
language plpgsql security definer set search_path = '' as $$
declare args text; e core.entries;
begin
  if fn not like 'write\_%' or fn = 'write_set' then perform core.refuse('bad_function', fn); end if;
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

create or replace function public.write_set(department_id uuid, items jsonb) returns setof core.entries
language plpgsql security definer set search_path = '' as $$
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

-- ── the marks ──
create or replace function public.mark_step(request_id uuid, from_step core.request_step, step core.request_step, reason text default null, occurred_at timestamptz default null)
returns core.requests language plpgsql security definer set search_path = '' as $$
declare r core.requests; u uuid; act text;
begin
  select * into r from core.requests where entry_id = request_id;
  if not found then perform core.refuse('request_not_found'); end if;
  act := 'mark:' || step::text;
  -- cancel belongs to the requester (or anyone holding mark:cancelled at the destination); every other step is the destination's
  if step = 'cancelled' and core.current_user_id(r.organization_id) = r.requester_id then u := core.require_access(r.organization_id, 'write:request', r.patient_id, r.from_department_id);
  else u := core.require_access(r.organization_id, act, r.patient_id, r.to_department_id); end if;
  return core.change_request(request_id, from_step, step, u, reason, null, occurred_at);
end $$;

create or replace function public.mark_routing(request_id uuid, assignee_id uuid default null, to_department_id uuid default null, priority core.request_priority default null, due_at timestamptz default null, reason text default null)
returns core.requests language plpgsql security definer set search_path = '' as $$
declare r core.requests; u uuid;
begin
  select * into r from core.requests where entry_id = request_id;
  if not found then perform core.refuse('request_not_found'); end if;
  u := core.require_access(r.organization_id, 'mark:routing', r.patient_id, r.to_department_id);
  return core.route_request(request_id, u, assignee_id, to_department_id, priority, due_at, reason);
end $$;

create or replace function public.mark_reviewed(request_ids uuid[]) returns int
language plpgsql security definer set search_path = '' as $$
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

do $$ declare f record; begin
  for f in select p.oid::regprocedure as sig from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'public' and (p.proname like 'write\_%' or p.proname like 'mark\_%') loop
    execute pg_catalog.format('grant execute on function %s to authenticated', f.sig);
  end loop;
end $$;
