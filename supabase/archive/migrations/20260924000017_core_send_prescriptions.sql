-- 0039 · a prescription goes to the pharmacy only when the prescriber sends it (send, default off), and core no longer
--   names a pack's type to find where: a reply type says what it answers (entry_types.answers), and write_prescription looks
--   for a service whose reply type answers prescriptions. The pharmacy pack's dispense declares it in its own migration.
alter table core.entry_types add column if not exists answers text;

drop function if exists public.write_prescription(uuid, uuid, uuid, uuid, uuid, timestamptz, uuid, core.entry_source, text, text, timestamptz, uuid, text, uuid, jsonb, numeric, text, text, text, boolean, text, int, numeric, int, text, jsonb, text);
create function public.write_prescription(
  id uuid, patient_id uuid, visit_id uuid default null, department_id uuid default null,
  replaces_id uuid default null, occurred_at timestamptz default null, responsible_id uuid default null,
  source core.entry_source default 'staff', source_key text default null, stated_author_name text default null, stated_recorded_at timestamptz default null,
  written_with_id uuid default null,
  action text default 'start', medication_id uuid default null, drug jsonb default null,
  dose_number numeric default null, dose_unit text default null, route text default null, frequency text default null,
  prn boolean default false, prn_reason_text text default null, duration_days int default null, quantity numeric default null, repeats int default null,
  instructions_text text default null, problems jsonb default '[]', stop_reason_text text default null,
  send boolean default false
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
grant execute on function public.write_prescription(uuid, uuid, uuid, uuid, uuid, timestamptz, uuid, core.entry_source, text, text, timestamptz, uuid, text, uuid, jsonb, numeric, text, text, text, boolean, text, int, numeric, int, text, jsonb, text, boolean) to authenticated;
