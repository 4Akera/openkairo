-- 19 · Critical care (spec/openCare.md §5.6), piece I1: the ICU. Its key is intensive; a person always reads "Critical care". One pack for
-- ICU and CCU, two starter setups (the CCU's comes later). The ICU's hourly chart: one column an hour, signed once by the nurse as one
-- set: the base's vitals (with ACVPU and air or oxygen, the owner's Q5), the base's observations for MAP, CVP, fluid in and urine (their
-- LOINC codes, the owner's B1), the base's procedure for the time on a ventilator (in progress until it ends), and the pack's own two
-- types for what the base lacks: the ventilator's settings (intensive.vent) and an infusion's rate (intensive.infusion, each rate change a
-- new version of its infusion). A setting carried on from the hour before is never written again. The board's words come from the op
-- intensive.board (the owner's C1). No role and no table of its own. Chosen by Claude in the build, awaiting the owner.

set client_min_messages = warning;

select core.declare_pack('intensive', 1, '{}', '{"en":"Critical care","ar":"الرعاية الحرجة"}', role_block => 'd2');
select core.create_pack('intensive');

-- ── functions, under the pack's role ──
set role pack_intensive;

-- ── helpers ──
-- a quantity in words: "17.6 mL/h"
create function intensive.q(p jsonb) returns text language sql immutable as $$
  select case when p ->> 'value' is null then null else (p ->> 'value') || coalesce(' ' || nullif(coalesce(p ->> 'unit', p ->> 'ucum'), ''), '') end
$$;
-- the decimals a dose rate is written with (the client's rates.ts holds the same table)
create function intensive.dose_decimals(p_unit text) returns int language sql immutable as $$
  select case p_unit when 'ug/kg/min' then 2 when 'mg/kg/h' then 2 when 'g/h' then 2 when 'ug/min' then 1 when 'mg/h' then 1 when 'units/h' then 1 else 0 end
$$;
-- the dose a pump rate gives, unrounded: mL/h × the bag's amount ÷ its volume, in the dose's unit; null when the bag and the unit do not
-- go together (a mass in µg, mg or g for a mass rate; units for units/h) or a per-kg dose has no weight
create function intensive.dose_exact(p_rate numeric, p_amount numeric, p_amount_ucum text, p_volume numeric, p_kg numeric, p_unit text) returns numeric
language sql immutable as $$
  select case
    when p_rate is null or p_amount is null or coalesce(p_volume, 0) <= 0 then null
    when p_unit = 'units/h' then case when p_amount_ucum = '[iU]' then p_rate * p_amount / p_volume end
    else case p_unit when 'ug/kg/min' then x.ug / nullif(p_kg, 0) / 60 when 'ug/min' then x.ug / 60 when 'ug/h' then x.ug
      when 'mg/h' then x.ug / 1000 when 'mg/kg/h' then x.ug / 1000 / nullif(p_kg, 0) when 'g/h' then x.ug / 1000000 end
  end
  from (select p_rate * p_amount / nullif(p_volume, 0) * case p_amount_ucum when 'ug' then 1 when 'mg' then 1000 when 'g' then 1000000 end as ug) x
$$;

-- a dose unit's words and its exact UCUM code, if any (the client's rates.ts DOSE_UNITS holds the same table)
create function intensive.dose_words(p_unit text) returns text language sql immutable as $$
  select case p_unit when 'ug/kg/min' then 'µg/kg/min' when 'ug/min' then 'µg/min' when 'ug/h' then 'µg/h' else p_unit end
$$;
create function intensive.dose_ucum(p_unit text) returns text language sql immutable as $$
  select case when p_unit in ('ug/kg/min', 'mg/h') then p_unit end
$$;

-- ── checks: a change continues its own kind; the vent's FiO2 a percentage; the infusion's rate in mL/h and its dose the rate's ──
-- the item a correction or a change continues (the writer has put it on the entry) began as this type
create function intensive.same_item(p_entry jsonb, p_type text) returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_item uuid := (p_entry ->> 'item')::uuid; v_first text;
begin
  if p_entry ->> 'replaces' is null and coalesce(p_entry ->> 'relation', '') <> 'changes' then return '[]'; end if;
  select x.type into v_first from core.pack_entries((p_entry ->> 'organization_id')::uuid, array[v_item]) x where x.item = v_item and x.item_version = 1;
  if v_first is distinct from p_type then return jsonb_build_array(jsonb_build_object('code', 'wrong_target', 'level', 'refuse')); end if;
  return '[]';
end $$;
create function intensive.vent_check(p_entry jsonb, p_set jsonb) returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare d jsonb := p_entry -> 'data'; f jsonb := intensive.same_item(p_entry, 'intensive.vent');
begin
  if jsonb_array_length(f) > 0 then return f; end if;
  if d -> 'fio2' ->> 'value' is not null and (d -> 'fio2' ->> 'ucum' is distinct from '%' or (d -> 'fio2' ->> 'value')::numeric not between 21 and 100) then
    return jsonb_build_array(jsonb_build_object('code', 'fio2_percent', 'level', 'refuse', 'detail', 'FiO2 is a percentage, 21 to 100'));
  end if;
  if d ->> 'mode' = 'other' and coalesce(trim(d ->> 'mode_text'), '') = '' then
    return jsonb_build_array(jsonb_build_object('code', 'mode_text_missing', 'level', 'refuse'));
  end if;
  return '[]';
end $$;
create function intensive.infusion_check(p_entry jsonb, p_set jsonb) returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare d jsonb := p_entry -> 'data'; v_item uuid := (p_entry ->> 'item')::uuid; f jsonb := intensive.same_item(p_entry, 'intensive.infusion');
        v_last text; v_unit text := d ->> 'dose_unit'; v_exact numeric; v_n int;
begin
  if jsonb_array_length(f) > 0 then return f; end if;
  -- a rate change after the infusion was stopped: a new infusion starts its own item
  if p_entry ->> 'relation' = 'changes' then
    select x.data ->> 'status' into v_last from core.pack_entries((p_entry ->> 'organization_id')::uuid, array[v_item]) x
     where x.item = v_item and x.type = 'intensive.infusion' order by x.item_version desc limit 1;
    if v_last = 'stopped' then return jsonb_build_array(jsonb_build_object('code', 'infusion_stopped', 'level', 'refuse')); end if;
  end if;
  if d ->> 'status' = 'stopped' then return '[]'; end if;
  if d -> 'rate' ->> 'value' is null then return jsonb_build_array(jsonb_build_object('code', 'rate_missing', 'level', 'refuse')); end if;
  if d -> 'rate' ->> 'ucum' is distinct from 'mL/h' or (d -> 'rate' ->> 'value')::numeric <= 0 then
    return jsonb_build_array(jsonb_build_object('code', 'rate_unit', 'level', 'refuse', 'detail', 'the pump''s rate in mL/h, above 0'));
  end if;
  if d -> 'dose' is null then return '[]'; end if;
  if v_unit is null then return jsonb_build_array(jsonb_build_object('code', 'dose_unit_missing', 'level', 'refuse')); end if;
  -- the dose is written in the words of its dose_unit, and with a ucum only when that unit has an exact one
  if d -> 'dose' ->> 'unit' is distinct from intensive.dose_words(v_unit)
     or (d -> 'dose' ? 'ucum' and d -> 'dose' ->> 'ucum' is distinct from intensive.dose_ucum(v_unit)) then
    return jsonb_build_array(jsonb_build_object('code', 'dose_unit_mismatch', 'level', 'refuse',
      'detail', format('a dose in %s is written %s%s', v_unit, intensive.dose_words(v_unit), coalesce(', ucum ' || intensive.dose_ucum(v_unit), ', with no ucum'))));
  end if;
  if d -> 'amount' ->> 'value' is null or d -> 'volume' ->> 'value' is null then
    return jsonb_build_array(jsonb_build_object('code', 'bag_missing', 'level', 'refuse'));
  end if;
  -- the arithmetic reads the bag's volume in mL and the weight in kg: any other unit, or nothing in the bag, is refused
  if d -> 'volume' ->> 'ucum' is distinct from 'mL' or (d -> 'volume' ->> 'value')::numeric <= 0 or (d -> 'amount' ->> 'value')::numeric <= 0 then
    return jsonb_build_array(jsonb_build_object('code', 'bag_unit', 'level', 'refuse', 'detail', 'the bag''s volume in mL, its amount above 0'));
  end if;
  if v_unit in ('ug/kg/min', 'mg/kg/h') and d -> 'weight' ->> 'value' is null then
    return jsonb_build_array(jsonb_build_object('code', 'weight_missing', 'level', 'refuse'));
  end if;
  if d ? 'weight' and (d -> 'weight' ->> 'ucum' is distinct from 'kg' or (d -> 'weight' ->> 'value')::numeric <= 0) then
    return jsonb_build_array(jsonb_build_object('code', 'weight_unit', 'level', 'refuse', 'detail', 'the weight in kg, above 0'));
  end if;
  v_exact := intensive.dose_exact((d -> 'rate' ->> 'value')::numeric, (d -> 'amount' ->> 'value')::numeric, d -> 'amount' ->> 'ucum',
    (d -> 'volume' ->> 'value')::numeric, (d -> 'weight' ->> 'value')::numeric, v_unit);
  if v_exact is null then
    return jsonb_build_array(jsonb_build_object('code', 'bag_unit', 'level', 'refuse', 'detail', 'the bag''s amount and the dose''s unit do not go together'));
  end if;
  v_n := intensive.dose_decimals(v_unit);
  if abs((d -> 'dose' ->> 'value')::numeric - v_exact) > 0.5 * power(10::numeric, -v_n) + 0.000001 then
    return jsonb_build_array(jsonb_build_object('code', 'rate_mismatch', 'level', 'refuse',
      'detail', format('%s mL/h gives %s %s', d -> 'rate' ->> 'value', round(v_exact, v_n), v_unit)));
  end if;
  return '[]';
end $$;

-- ── lines ──
create function intensive.vent_line(e jsonb) returns text language sql stable security definer set search_path = '' as $$
  select concat_ws(' · ', 'Ventilator ' || case e -> 'data' ->> 'mode' when 'other' then coalesce(nullif(e -> 'data' ->> 'mode_text', ''), 'other mode') else upper(e -> 'data' ->> 'mode') end,
    'FiO2 ' || (e -> 'data' -> 'fio2' ->> 'value') || '%', 'PEEP ' || (e -> 'data' -> 'peep' ->> 'value'), 'Vt ' || (e -> 'data' -> 'vt' ->> 'value'),
    'rate ' || (e -> 'data' -> 'rate' ->> 'value'), 'Pinsp ' || (e -> 'data' -> 'pinsp' ->> 'value'), 'PS ' || (e -> 'data' -> 'ps' ->> 'value'))
$$;
create function intensive.infusion_line(e jsonb) returns text language sql stable security definer set search_path = '' as $$
  select case when e -> 'data' ->> 'status' = 'stopped' then 'Stopped: ' || (e -> 'data' -> 'drug' ->> 'text')
    else case when (e ->> 'item_version')::int = 1 then 'Started: ' else '' end
      || concat_ws(' · ', (e -> 'data' -> 'drug' ->> 'text') || coalesce(' ' || intensive.q(e -> 'data' -> 'dose'), ''), intensive.q(e -> 'data' -> 'rate'),
           case when (e ->> 'item_version')::int = 1 then intensive.q(e -> 'data' -> 'amount') || ' in ' || intensive.q(e -> 'data' -> 'volume') end) end
$$;

-- ── FHIR (§6.4): the settings as an Observation with a component each; an infusion as a MedicationAdministration with its rate ──
create function intensive.vent_fhir(p jsonb) returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_org uuid := (p ->> 'org')::uuid; l jsonb := p -> 'entries' -> (jsonb_array_length(p -> 'entries') - 1); o jsonb; c jsonb; k record;
begin
  select e into o from jsonb_array_elements(p -> 'entries') with ordinality x(e, n) where e ->> 'type' <> 'crossed_out' order by n desc limit 1;
  if o is null then return '[]'; end if;
  c := jsonb_build_array(jsonb_build_object('code', jsonb_build_object('text', 'Mode'), 'valueString',
    case o -> 'data' ->> 'mode' when 'other' then coalesce(nullif(o -> 'data' ->> 'mode_text', ''), 'other') else upper(o -> 'data' ->> 'mode') end));
  for k in select * from (values ('fio2', 'FiO2'), ('peep', 'PEEP'), ('vt', 'Tidal volume'), ('rate', 'Set rate'), ('pinsp', 'Inspiratory pressure'),
                                 ('ps', 'Pressure support')) v(key, words) loop
    continue when o -> 'data' -> k.key is null;
    c := c || jsonb_build_array(jsonb_build_object('code', jsonb_build_object('text', k.words), 'valueQuantity', core.fhir_quantity(o -> 'data' -> k.key)));
  end loop;
  return jsonb_build_array(jsonb_strip_nulls(jsonb_build_object('resourceType', 'Observation', 'id', o ->> 'item',
    'meta', core.fhir_meta(l, coalesce((p ->> 'private')::boolean, false)),
    'status', case when l ->> 'type' = 'crossed_out' or coalesce((l ->> 'redacted')::boolean, false) then 'entered-in-error' else 'final' end,
    'code', jsonb_build_object('text', 'Ventilator settings'), 'subject', jsonb_build_object('reference', 'Patient/' || (p ->> 'patient')),
    'encounter', case when o ->> 'visit_id' is not null then jsonb_build_object('reference', 'Encounter/' || (o ->> 'visit_id')) end,
    'effectiveDateTime', core.fhir_date((o ->> 'occurred_at')::timestamptz, o ->> 'precision', v_org),
    'performer', jsonb_build_array(jsonb_build_object('reference', 'PractitionerRole/' || (o ->> 'author_id'))), 'component', c,
    'note', case when coalesce(o -> 'data' ->> 'note', '') <> '' then jsonb_build_array(jsonb_build_object('text', o -> 'data' ->> 'note')) end)));
end $$;
create function intensive.infusion_fhir(p jsonb) returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_org uuid := (p ->> 'org')::uuid; f jsonb := p -> 'entries' -> 0; l jsonb := p -> 'entries' -> (jsonb_array_length(p -> 'entries') - 1); o jsonb;
begin
  select e into o from jsonb_array_elements(p -> 'entries') with ordinality x(e, n) where e ->> 'type' <> 'crossed_out' order by n desc limit 1;
  if o is null then return '[]'; end if;
  return jsonb_build_array(jsonb_strip_nulls(jsonb_build_object('resourceType', 'MedicationAdministration', 'id', o ->> 'item',
    'meta', core.fhir_meta(l, coalesce((p ->> 'private')::boolean, false)),
    'status', case when l ->> 'type' = 'crossed_out' or coalesce((l ->> 'redacted')::boolean, false) then 'entered-in-error'
                   when o -> 'data' ->> 'status' = 'stopped' then 'stopped' else 'in-progress' end,
    'medicationCodeableConcept', core.fhir_concept(o -> 'data' -> 'drug', v_org), 'subject', jsonb_build_object('reference', 'Patient/' || (p ->> 'patient')),
    'context', case when o ->> 'visit_id' is not null then jsonb_build_object('reference', 'Encounter/' || (o ->> 'visit_id')) end,
    'effectivePeriod', jsonb_build_object('start', core.fhir_date((f ->> 'occurred_at')::timestamptz, f ->> 'precision', v_org),
      'end', case when o -> 'data' ->> 'status' = 'stopped' then core.fhir_date((o ->> 'occurred_at')::timestamptz, o ->> 'precision', v_org) end),
    'performer', jsonb_build_array(jsonb_build_object('actor', jsonb_build_object('reference', 'PractitionerRole/' || (o ->> 'author_id')))),
    'supportingInformation', case when o -> 'data' ? 'medication' then jsonb_build_array(jsonb_build_object('reference', 'MedicationStatement/' || (o -> 'data' ->> 'medication'))) end,
    'dosage', jsonb_build_object('text', intensive.infusion_line(o), 'route', jsonb_build_object('text', 'iv'), 'rateQuantity', core.fhir_quantity(o -> 'data' -> 'rate')))));
end $$;

-- ── the unit's setting: each infusion's key once; a units/h dose takes a bag in units, a mass rate a bag by mass; a bag has all three ──
create function intensive.unit_check(p_where jsonb, p_data jsonb) returns jsonb language sql stable security definer set search_path = '' as $$
  select coalesce((select jsonb_agg(f) from (
    select jsonb_build_object('code', 'duplicate', 'level', 'refuse', 'field', 'infusions.' || (n - 1) || '.key') f
      from jsonb_array_elements(coalesce(p_data -> 'infusions', '[]')) with ordinality x(i, n)
     where exists (select 1 from jsonb_array_elements(p_data -> 'infusions') with ordinality y(j, m) where m < n and j ->> 'key' = i ->> 'key')
    union all
    select jsonb_build_object('code', 'bag_unit', 'level', 'refuse', 'field', 'infusions.' || (n - 1) || '.amount_unit')
      from jsonb_array_elements(coalesce(p_data -> 'infusions', '[]')) with ordinality x(i, n)
     where i ? 'amount_unit' and (i ->> 'dose_unit' = 'units/h') <> (i ->> 'amount_unit' = 'units')
    union all
    select jsonb_build_object('code', 'bag_missing', 'level', 'refuse', 'field', 'infusions.' || (n - 1) || '.amount')
      from jsonb_array_elements(coalesce(p_data -> 'infusions', '[]')) with ordinality x(i, n)
     where (i ? 'amount') <> (i ? 'volume') or (i ? 'amount') <> (i ? 'amount_unit')) q), '[]'::jsonb)
$$;

-- ── the board's words (the owner's C1, 2026-10-08): for each stay admitted here, what its tile says, as the reader may see it (the doors
-- mask). This department's stays only, read here, never ids from the client; each patient it names is read-logged by the door ──
create function intensive.board(p_org uuid, p_department uuid, p_user uuid, p_args jsonb) returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare s jsonb; v_pt uuid; v_stay uuid; v_ids uuid[] := '{}'; v_out jsonb := '{}'; v jsonb; n record; b record; v_kg numeric; v_typed boolean;
begin
  for s in select r from core.pack_rows(p_org, 'base.presence', jsonb_build_object('where', jsonb_build_object('department_id', p_department, 'state', 'admitted'))) r loop
    v_pt := (s ->> 'patient_id')::uuid; v_stay := (s ->> 'item')::uuid; v_ids := v_ids || v_pt; v := '{}';
    -- on a ventilator now (an open ventilation procedure, wherever it began), or off it (completed or stopped) in the last day; planned
    -- or on hold says nothing
    select x.data, x.occurred_at into n from core.pack_kind(p_org, v_pt, 'procedure', jsonb_build_object('current', true,
        'codes', jsonb_build_array('local.procedure:invasive_ventilation', 'local.procedure:non_invasive_ventilation'))) x
     where x.data ->> 'status' = 'in-progress' or (x.data ->> 'status' in ('completed', 'stopped') and x.occurred_at > now() - interval '1 day')
     order by (x.data ->> 'status' = 'in-progress') desc, x.occurred_at desc limit 1;
    if found then
      v := v || jsonb_build_object('airway', jsonb_build_object('code', (select c ->> 'code' from jsonb_array_elements(n.data -> 'concept' -> 'codings') c
          where c ->> 'system' = 'local.procedure' and c ->> 'code' in ('invasive_ventilation', 'non_invasive_ventilation') limit 1),
        'status', n.data ->> 'status', 'since', n.data -> 'performed' ->> 'value', 'at', n.occurred_at));
    end if;
    -- the stay's latest air or oxygen
    select x.data, x.occurred_at into n from core.pack_kind(p_org, v_pt, 'vitals', jsonb_build_object('current', true, 'limit', 50)) x
     where x.visit_id = v_stay and x.data ? 'oxygen' order by x.occurred_at desc limit 1;
    if found then v := v || jsonb_build_object('oxygen', jsonb_strip_nulls(jsonb_build_object('on', n.data -> 'oxygen' ->> 'on', 'flow', n.data -> 'oxygen' -> 'flow' ->> 'value'))); end if;
    -- the infusions running in this stay, by drug name
    v := v || jsonb_build_object('infusions', coalesce((select jsonb_agg(jsonb_strip_nulls(jsonb_build_object('key', x.data ->> 'key', 'drug', x.data -> 'drug' ->> 'text',
        'dose', x.data -> 'dose' ->> 'value', 'unit', x.data ->> 'dose_unit', 'rate', x.data -> 'rate' ->> 'value', 'at', x.occurred_at)) order by x.data -> 'drug' ->> 'text')
      from core.pack_kind(p_org, v_pt, 'intensive.infusion', jsonb_build_object('current', true, 'limit', 100)) x
      where x.visit_id = v_stay and x.data ->> 'status' = 'running'), '[]'));
    -- the MAP of the last two hours: the newer of the latest typed one and the one worked out from the latest blood pressure (a tie: the
    -- typed one), so a falling pressure is never hidden behind an older typed MAP
    select (x.data -> 'value' -> 'quantity' ->> 'value')::numeric as value, x.occurred_at as at into n from core.pack_kind(p_org, v_pt, 'observation',
        jsonb_build_object('current', true, 'codes', jsonb_build_array('loinc:8478-0'), 'from', now() - interval '2 hours', 'limit', 20)) x
     order by x.occurred_at desc limit 1;
    v_typed := found;
    select round(((x.data -> 'bp' -> 'sys' ->> 'value')::numeric + 2 * (x.data -> 'bp' -> 'dia' ->> 'value')::numeric) / 3) as value, x.occurred_at as at into b
      from core.pack_kind(p_org, v_pt, 'vitals', jsonb_build_object('current', true, 'from', now() - interval '2 hours', 'limit', 20)) x
     where x.data ? 'bp' order by x.occurred_at desc limit 1;
    if v_typed and (not found or n.at >= b.at) then v := v || jsonb_build_object('map', jsonb_build_object('value', round(n.value), 'at', n.at, 'measured', true));
    elsif found then v := v || jsonb_build_object('map', jsonb_build_object('value', b.value, 'at', b.at, 'measured', false));
    end if;
    -- the stay's urine of the last six hours, hour by hour, and the weight it reads against
    select coalesce(sum((x.data -> 'value' -> 'quantity' ->> 'value')::numeric), 0) as ml, count(*) as hours into n from core.pack_kind(p_org, v_pt, 'observation',
        jsonb_build_object('current', true, 'codes', jsonb_build_array('loinc:9188-4'), 'from', now() - interval '6 hours', 'limit', 50)) x where x.visit_id = v_stay;
    if n.hours > 0 then
      select (r ->> 'value')::numeric into v_kg from core.pack_rows(p_org, 'base.values', jsonb_build_object('patient', v_pt, 'where', jsonb_build_object('key', 'weight'),
        'latest', jsonb_build_object('by', 'key', 'at', 'at'))) r limit 1;
      v := v || jsonb_build_object('urine', jsonb_build_object('ml', n.ml, 'hours', n.hours, 'kg', v_kg));
    end if;
    v_out := v_out || jsonb_build_object(v_stay::text, v);
  end loop;
  return jsonb_build_object('patient_ids', to_jsonb(v_ids), 'stays', v_out);
end $$;

reset role;

-- ── its actions, types, setting, op and starter setup ──
select core.declare_action('write:intensive.vent', 'intensive', 'department', '{"en":"Write the ventilator''s settings"}', everyday => true);
select core.declare_action('write:intensive.infusion', 'intensive', 'department', '{"en":"Start, change and stop an infusion"}', everyday => true);

select core.declare_type('intensive.vent', 1, 'intensive', $j${"type":"object","additionalProperties":false,"required":["mode"],
  "properties":{"mode":{"enum":["vc","pc","prvc","simv","ps","cpap","other"]},"mode_text":{"type":"string"},
    "fio2":{"$ref":"#/$defs/quantity"},"peep":{"$ref":"#/$defs/quantity"},"vt":{"$ref":"#/$defs/quantity"},"rate":{"$ref":"#/$defs/quantity"},
    "pinsp":{"$ref":"#/$defs/quantity"},"ps":{"$ref":"#/$defs/quantity"},"note":{"type":"string"}}}$j$::jsonb,
  'intensive.vent_line(jsonb)', array['Observation'], to_fhir => 'intensive.vent_fhir(jsonb)', checks => array['intensive.vent_check(jsonb,jsonb)']::regprocedure[],
  labels => '{"en":"Ventilator settings","ar":"إعدادات جهاز التنفس الصناعي"}');
select core.declare_type('intensive.infusion', 1, 'intensive', $j${"type":"object","additionalProperties":false,"required":["drug","status"],
  "properties":{"drug":{"$ref":"#/$defs/concept"},"medication":{"type":"string","format":"uuid"},"key":{"type":"string"},
    "status":{"enum":["running","stopped"]},"rate":{"$ref":"#/$defs/quantity"},"dose":{"$ref":"#/$defs/quantity"},
    "dose_unit":{"enum":["ug/kg/min","ug/min","ug/h","mg/h","mg/kg/h","g/h","units/h"]},
    "amount":{"$ref":"#/$defs/quantity"},"volume":{"$ref":"#/$defs/quantity"},"weight":{"$ref":"#/$defs/quantity"},
    "reason":{"type":"string"},"note":{"type":"string"}}}$j$::jsonb,
  'intensive.infusion_line(jsonb)', array['MedicationAdministration'], to_fhir => 'intensive.infusion_fhir(jsonb)',
  checks => array['intensive.infusion_check(jsonb,jsonb)']::regprocedure[], labels => '{"en":"Infusion","ar":"محلول وريدي مستمر"}');

select core.declare_setting('intensive.unit', 'intensive', 'department', $j${"type":"object","additionalProperties":false,"required":["day_starts","infusions"],
  "properties":{"day_starts":{"type":"integer","minimum":0,"maximum":23,"default":8},
    "infusions":{"type":"array","default":[],"items":{"type":"object","additionalProperties":false,"required":["key","name","dose_unit"],
      "properties":{"key":{"type":"string","pattern":"^[a-z][a-z0-9_]*$"},"name":{"type":"string","minLength":1},"short":{"type":"string"},
        "atc":{"type":"string","pattern":"^[A-Z][0-9]{2}[A-Z]{2}[0-9]{2}$"},
        "kind":{"enum":["vasopressor","inotrope","sedative","opioid","insulin","anticoagulant","antiarrhythmic","vasodilator","electrolyte","other"]},
        "dose_unit":{"enum":["ug/kg/min","ug/min","ug/h","mg/h","mg/kg/h","g/h","units/h"]},
        "amount":{"type":"number","exclusiveMinimum":0},"amount_unit":{"enum":["ug","mg","g","units"]},"volume":{"type":"number","exclusiveMinimum":0}}}}}}$j$::jsonb,
  'intensive.unit_check(jsonb,jsonb)', labels => '{"en":"ICU chart","ar":"جدول العناية المركزة"}', form => 'department',
  fields => $j$[{"key":"day_starts","labels":{"en":"The ICU day starts at"},"help":{"en":"The hour (0–23) the chart's day and its fluid balance begin: 8 is 08:00."}},
    {"key":"infusions","labels":{"en":"The unit's infusions"},"help":{"en":"Each drug the unit runs by pump, with its usual bag; the chart works out mL/h from the dose."}},
    {"key":"infusions.key","labels":{"en":"Key"},"help":{"en":"A short name for the record, in lower case: noradrenaline."}},
    {"key":"infusions.name","labels":{"en":"Name"}},
    {"key":"infusions.short","labels":{"en":"On the board"},"help":{"en":"The word on the bed's tile: noradrenaline, MgSO₄. Blank: the name."}},
    {"key":"infusions.atc","labels":{"en":"ATC code"},"help":{"en":"Its code in the clinic's ATC list, once that list is loaded."}},
    {"key":"infusions.kind","labels":{"en":"Kind"},"choices":{"vasopressor":{"en":"Vasopressor"},"inotrope":{"en":"Inotrope"},"sedative":{"en":"Sedative"},
      "opioid":{"en":"Opioid"},"insulin":{"en":"Insulin"},"anticoagulant":{"en":"Anticoagulant"},"antiarrhythmic":{"en":"Antiarrhythmic"},
      "vasodilator":{"en":"Vasodilator"},"electrolyte":{"en":"Electrolyte"},"other":{"en":"Other"}}},
    {"key":"infusions.dose_unit","labels":{"en":"Dose in"},"choices":{"ug/kg/min":{"en":"µg/kg/min"},"ug/min":{"en":"µg/min"},"ug/h":{"en":"µg/h"},
      "mg/h":{"en":"mg/h"},"mg/kg/h":{"en":"mg/kg/h"},"g/h":{"en":"g/h"},"units/h":{"en":"units/h"}}},
    {"key":"infusions.amount","labels":{"en":"Bag: amount"}},
    {"key":"infusions.amount_unit","labels":{"en":"Bag: amount in"},"choices":{"ug":{"en":"µg"},"mg":{"en":"mg"},"g":{"en":"g"},"units":{"en":"units"}}},
    {"key":"infusions.volume","labels":{"en":"Bag: volume"},"unit":"mL"}]$j$::jsonb);

select core.declare_screen('intensive.chart', 'intensive', 'stays', '{"en":"ICU chart","ar":"جدول العناية المركزة"}', 'read:record');
select core.declare_op('intensive.board', 'intensive', 'intensive.board(uuid,uuid,uuid,jsonb)', 'read:record', patients => true);

-- its starter setup (§5.2): six ICU beds, inpatient stays, the board and the ICU chart, the unit's day and its infusions
select core.declare_setup('intensive.icu', 'intensive', 'stays', '{"en":"ICU","ar":"العناية المركزة"}', packs => array['intensive'],
  screens => '{"screens":["base.beds","intensive.chart"],"opens":"base.beds"}',
  settings => $j${"department.encounter_class":{"class":"IMP"},"department.review_results":{"level":"critical"},"intensive.unit":{"day_starts":8,"infusions":[
    {"key":"noradrenaline","name":"Noradrenaline","short":"noradrenaline","kind":"vasopressor","dose_unit":"ug/kg/min","amount":4,"amount_unit":"mg","volume":50},
    {"key":"adrenaline","name":"Adrenaline","short":"adrenaline","kind":"vasopressor","dose_unit":"ug/kg/min","amount":4,"amount_unit":"mg","volume":50},
    {"key":"dopamine","name":"Dopamine","short":"dopamine","kind":"vasopressor","dose_unit":"ug/kg/min","amount":200,"amount_unit":"mg","volume":50},
    {"key":"dobutamine","name":"Dobutamine","short":"dobutamine","kind":"inotrope","dose_unit":"ug/kg/min","amount":250,"amount_unit":"mg","volume":50},
    {"key":"propofol","name":"Propofol 1%","short":"propofol","kind":"sedative","dose_unit":"mg/h","amount":500,"amount_unit":"mg","volume":50},
    {"key":"midazolam","name":"Midazolam","short":"midazolam","kind":"sedative","dose_unit":"mg/h","amount":50,"amount_unit":"mg","volume":50},
    {"key":"fentanyl","name":"Fentanyl","short":"fentanyl","kind":"opioid","dose_unit":"ug/h","amount":2500,"amount_unit":"ug","volume":50},
    {"key":"insulin","name":"Soluble insulin","short":"insulin","kind":"insulin","dose_unit":"units/h","amount":50,"amount_unit":"units","volume":50},
    {"key":"magnesium","name":"Magnesium sulfate","short":"MgSO₄","kind":"electrolyte","dose_unit":"g/h","amount":10,"amount_unit":"g","volume":100}]}}$j$::jsonb,
  places => (select jsonb_agg(jsonb_build_object('key', 'icu_' || n, 'name', 'ICU ' || n, 'label', 'bed') order by n) from generate_series(1, 6) n),
  help => '{"en":"Six ICU beds on the board, inpatient stays, and Critical care''s ICU chart: vitals, the ventilator, infusions, in and out, signed once an hour."}');

select core.lock_pack('intensive');
