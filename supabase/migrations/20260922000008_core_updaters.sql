-- 0008 · the patient-list updaters (spec 04): pure functions of the entry and the existing rows
-- the root of a replacement chain: a list row keeps the id of the first entry that stated it
create or replace function core.root_of(p_entry_id uuid) returns uuid
language sql stable security definer set search_path = '' as $$
  with recursive up as (
    select id, replaces_id from core.entries where id = p_entry_id
    union all
    select e.id, e.replaces_id from core.entries e join up on e.id = up.replaces_id
  )
  select id from up where replaces_id is null limit 1
$$;

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
      coalesce((e.occurred_at at time zone 'UTC')::date, current_date), 'active', e.id, coalesce(e.responsible_id, e.author_id))
    on conflict (id) do update set latest_entry_id = excluded.latest_entry_id, dose_number = excluded.dose_number, dose_unit = excluded.dose_unit,
      route = excluded.route, frequency = excluded.frequency, prn = excluded.prn, prn_reason_text = excluded.prn_reason_text, instructions_text = excluded.instructions_text;
  elsif act = 'repeat' then
    update core.patient_medications set latest_entry_id = e.id where id = target;
  elsif act = 'change' then
    update core.patient_medications set dose_number = coalesce((d->>'dose_number')::numeric, dose_number), dose_unit = coalesce(d->>'dose_unit', dose_unit),
      route = coalesce(d->>'route', route), frequency = coalesce(d->>'frequency', frequency), prn = coalesce((d->>'prn')::boolean, prn),
      prn_reason_text = coalesce(d->>'prn_reason_text', prn_reason_text), instructions_text = coalesce(d->>'instructions_text', instructions_text),
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
    insert into core.patient_problems (id, organization_id, patient_id, code, name, status, onset_on, latest_entry_id)
    values (core.root_of(e.id), e.organization_id, e.patient_id, d->>'code', d->>'name', coalesce(d->>'status', 'active'), d->>'onset_on', e.id)
    on conflict (id) do update set code = excluded.code, name = excluded.name, status = excluded.status, onset_on = excluded.onset_on, latest_entry_id = excluded.latest_entry_id;
  elsif act = 'update' then
    update core.patient_problems set code = coalesce(d->>'code', code), name = coalesce(d->>'name', name), status = coalesce(d->>'status', status),
      onset_on = coalesce(d->>'onset_on', onset_on), latest_entry_id = e.id where id = target;
  elsif act = 'resolve' then
    update core.patient_problems set status = 'resolved', resolved_on = coalesce(d->>'resolved_on', to_char(e.occurred_at at time zone 'UTC', 'YYYY-MM-DD')), latest_entry_id = e.id where id = target;
  end if;
end $$;

create or replace function core.update_allergies(e core.entries) returns void
language plpgsql security definer set search_path = '' as $$
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

create or replace function core.update_list_reviews(e core.entries) returns void
language plpgsql security definer set search_path = '' as $$
begin
  insert into core.patient_list_reviews (patient_id, list, reviewed_at, reviewed_by_id, entry_id)
  values (e.patient_id, (e.data->>'list')::core.list_kind, e.occurred_at, coalesce(e.responsible_id, e.author_id), e.id)
  on conflict (patient_id, list) do update set reviewed_at = excluded.reviewed_at, reviewed_by_id = excluded.reviewed_by_id, entry_id = excluded.entry_id
  where excluded.reviewed_at >= core.patient_list_reviews.reviewed_at;
end $$;

-- replay everything for one patient (and everyone merged into them); returns rows per table
create or replace function core.rebuild_record(p_patient_id uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
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
