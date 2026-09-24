-- 0031 · a change or an update can clear what it names: turning PRN off, clearing instructions, a problem's note or onset.
--   write_prescription keeps prn = false on a change; the updaters take a key that is present (an empty string clears)
--   instead of coalescing it away. Other actions and every earlier entry replay as before.

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
    'dose_number', dose_number, 'dose_unit', dose_unit, 'route', route, 'frequency', frequency, 'prn', case when prn then true when action = 'change' then false end, 'prn_reason_text', prn_reason_text,
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

create or replace function core.update_medications(e core.entries) returns void
language plpgsql security definer set search_path = '' as $$
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

create or replace function core.update_problems(e core.entries) returns void
language plpgsql security definer set search_path = '' as $$
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

create or replace function public.write_problem(
  id uuid, patient_id uuid, visit_id uuid default null, department_id uuid default null,
  replaces_id uuid default null, occurred_at timestamptz default null, responsible_id uuid default null,
  source core.entry_source default 'staff', source_key text default null, stated_author_name text default null, stated_recorded_at timestamptz default null,
  written_with_id uuid default null,
  action text default 'add', problem_id uuid default null, code text default null, name text default null, status text default 'active',
  onset_on text default null, resolved_on text default null, text text default null, certainty text default null
) returns core.entries language plpgsql security definer set search_path = '' as $$
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
