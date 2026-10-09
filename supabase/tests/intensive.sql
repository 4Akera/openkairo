-- Critical care (spec §5.6), piece I1: the pack and its ICU setup, the ventilator's settings and an infusion's rate as its two types;
-- one hour of the ICU chart in one set (the base's vitals, its observations for MAP, CVP, fluid in and urine, its procedure for the time
-- on a ventilator, and the pack's two types), their lines, values and FHIR; the server's arithmetic of a dose from a pump rate and its
-- refusals; the board's words through the pack's own op; refused where the department or the clinic does not use the pack.
\set org   '00000000-0000-0000-0000-0000000000a1'
\set im    '00000000-0000-0000-0000-0000000000d1'
\set ward  '00000000-0000-0000-0000-0000000000d6'
\set pt    '00000000-0000-0000-0000-0000000000f1'
\set new   '00000000-0000-0000-0000-0000000000e9'
\set stay  '00000000-0000-0000-0000-00000000e701'
\set v1    '00000000-0000-0000-0000-00000000e702'
\set map   '00000000-0000-0000-0000-00000000e703'
\set cvp   '00000000-0000-0000-0000-00000000e704'
\set inn   '00000000-0000-0000-0000-00000000e705'
\set uri   '00000000-0000-0000-0000-00000000e706'
\set proc  '00000000-0000-0000-0000-00000000e707'
\set vent  '00000000-0000-0000-0000-00000000e708'
\set nor   '00000000-0000-0000-0000-00000000e709'
\set nor2  '00000000-0000-0000-0000-00000000e710'
\set ins   '00000000-0000-0000-0000-00000000e711'
\set giv   '00000000-0000-0000-0000-00000000e712'
\set ow    '11111111-0000-0000-0000-0000000000b9'
\set dr    '11111111-0000-0000-0000-0000000000b1'
\set nurse '11111111-0000-0000-0000-0000000000b3'
\set rec   '11111111-0000-0000-0000-0000000000b4'
\set pt2   '00000000-0000-0000-0000-0000000000f2'
\set stay2 '00000000-0000-0000-0000-00000000e721'
\set niv   '00000000-0000-0000-0000-00000000e722'
select t.fixture();
select t.as(:'ow');
select public.write_setting(jsonb_build_object('key', 'organization.packs_used', 'data', jsonb_build_object('packs',
  (select coalesce(s.data -> 'packs', '[]') from core.settings s where s.key = 'organization.packs_used' order by s.recorded_at desc limit 1) || '["intensive"]'::jsonb))) ->> 'key' as on;
select public.write_setting(jsonb_build_object('key', 'department.packs', 'owner_id', :'ward', 'data', '{"packs":["intensive"]}'::jsonb)) ->> 'key' as ticked;

\echo '── the pack: Critical care, its role ids in block d2, nothing of its own callable'
select t.ok(l.role_block = 'd2' and l.is_pack and l.labels ->> 'en' = 'Critical care', 'intensive reads "Critical care", its role ids in its block, d2')
  from core.layers l where l.key = 'intensive';
select t.ok(not has_schema_privilege('authenticated', 'intensive', 'USAGE'), 'the API cannot reach its schema');

\echo '── its two types, its actions'
select t.ok(y.resources = array['Observation'] and y.base_type is null and not y.may_be_private and y.to_fhir is not null and cardinality(y.checks) = 1,
  'intensive.vent: an Observation of its own, never private, its FHIR and one check') from core.types y where y.key = 'intensive.vent';
select t.ok(y.resources = array['MedicationAdministration'] and y.base_type is null and y.to_fhir is not null and cardinality(y.checks) = 1,
  'intensive.infusion: a MedicationAdministration of its own, its FHIR and one check') from core.types y where y.key = 'intensive.infusion';
select t.ok(count(*) = 2 and bool_and(a.everyday), 'write:intensive.vent and write:intensive.infusion are everyday') from core.actions a
 where a.key in ('write:intensive.vent', 'write:intensive.infusion');

\echo '── its setting, op and starter setup'
select t.ok(k.owner_kind = 'department' and k.form = 'department', 'intensive.unit: a department''s, on its own form') from core.setting_keys k where k.key = 'intensive.unit';
select t.ok(c.work = 'stays' and c.action = 'read:record' and c.replaces = '{}', 'intensive.chart: a stays screen for whoever reads the record') from core.screens c where c.key = 'intensive.chart';
select t.ok(o.action = 'read:record' and o.patients, 'intensive.board: read:record, naming its patients') from core.ops o where o.key = 'intensive.board';
select t.ok(s.work = 'stays' and s.packs = array['intensive'] and s.settings -> 'department.encounter_class' ->> 'class' = 'IMP'
  and (select array_agg(p ->> 'key' order by n) from jsonb_array_elements(s.places) with ordinality x(p, n)) = array['icu_1', 'icu_2', 'icu_3', 'icu_4', 'icu_5', 'icu_6']
  and (select array_agg(p ->> 'name' order by n) from jsonb_array_elements(s.places) with ordinality x(p, n)) = array['ICU 1', 'ICU 2', 'ICU 3', 'ICU 4', 'ICU 5', 'ICU 6']
  and s.screens = '{"screens":["base.beds","intensive.chart"],"opens":"base.beds"}'::jsonb and jsonb_array_length(s.settings -> 'intensive.unit' -> 'infusions') = 9,
  'intensive.icu: stays, six ICU beds, inpatient, the bed board and the ICU chart, the unit''s nine infusions') from core.setups s where s.key = 'intensive.icu';

\echo '── the server''s arithmetic: the dose a pump rate gives'
select t.ok(round(intensive.dose_exact(5.9, 4, 'mg', 50, 78, 'ug/kg/min'), 4) = 0.1009, 'noradrenaline 4 mg/50 mL at 5.9 mL/h for 78 kg: 0.1009 µg/kg/min');
select t.ok(round(intensive.dose_exact(12, 500, 'mg', 50, null, 'mg/h'), 4) = 120, 'propofol 500 mg/50 mL at 12 mL/h: 120 mg/h');
select t.ok(round(intensive.dose_exact(1.5, 2500, 'ug', 50, null, 'ug/h'), 4) = 75, 'fentanyl 2500 µg/50 mL at 1.5 mL/h: 75 µg/h');
select t.ok(round(intensive.dose_exact(4, 50, '[iU]', 50, null, 'units/h'), 4) = 4, 'insulin 50 units/50 mL at 4 mL/h: 4 units/h');
select t.ok(round(intensive.dose_exact(10, 10, 'g', 100, null, 'g/h'), 4) = 1, 'magnesium 10 g/100 mL at 10 mL/h: 1 g/h');
select t.ok(round(intensive.dose_exact(1.2, 50, 'mg', 50, null, 'ug/min'), 4) = 20, 'GTN 50 mg/50 mL at 1.2 mL/h: 20 µg/min');
select t.ok(intensive.dose_exact(4, 50, 'mg', 50, null, 'units/h') is null and intensive.dose_exact(5.9, 4, 'mg', 50, null, 'ug/kg/min') is null,
  'none for units/h from a bag in mg, nor for a dose per kg with no weight');

\echo '── its setup on a new department'
select public.setup(jsonb_build_object('setup', 'intensive.icu', 'department_id', :'new', 'name', 'Surgical ICU', 'apply', true)) is not null as made;
select t.ok(core.department_uses(:'org', :'new', 'intensive') and (select count(*) from core.places p where p.department_id = :'new' and p.retired_at is null) = 6
  and core.setting_at(:'org', 'department.encounter_class', :'new') ->> 'class' = 'IMP' and core.setting_at(:'org', 'department.setup', :'new') ->> 'setup' = 'intensive.icu'
  and (core.setting_at(:'org', 'intensive.unit', :'new') ->> 'day_starts')::int = 8,
  'a Surgical ICU made from it uses Critical care, has six beds, is inpatient, keeps its setup, its day from 08:00');

\echo '── the unit''s setting: each infusion once, a bag that fits its dose'
select t.refuses(format($q$select public.write_setting(jsonb_build_object('key', 'intensive.unit', 'owner_id', %L, 'data',
  '{"day_starts":8,"infusions":[{"key":"x","name":"X","dose_unit":"mg/h"},{"key":"x","name":"Y","dose_unit":"mg/h"}]}'::jsonb))$q$, :'ward'), 'duplicate');
select t.refuses(format($q$select public.write_setting(jsonb_build_object('key', 'intensive.unit', 'owner_id', %L, 'data',
  '{"day_starts":8,"infusions":[{"key":"insulin","name":"Insulin","dose_unit":"units/h","amount":50,"amount_unit":"mg","volume":50}]}'::jsonb))$q$, :'ward'), 'bag_unit');

-- an infusion's data: the drug, its rate and dose, its bag and weight
create function pg_temp.drip(p_drug text, p_key text, p_rate numeric, p_dose jsonb, p_unit text, p_amount jsonb, p_kg numeric default 78, p_rate_ucum text default 'mL/h')
returns jsonb language sql immutable as $$
  select jsonb_strip_nulls(jsonb_build_object('drug', jsonb_build_object('text', p_drug), 'key', p_key, 'status', 'running',
    'rate', case when p_rate is not null then jsonb_build_object('value', p_rate::text, 'unit', p_rate_ucum, 'ucum', p_rate_ucum) end, 'dose', p_dose, 'dose_unit', p_unit,
    'amount', p_amount, 'volume', '{"value":"50","unit":"mL","ucum":"mL"}'::jsonb,
    'weight', case when p_kg is not null then jsonb_build_object('value', p_kg::text, 'unit', 'kg', 'ucum', 'kg') end))
$$;
create function pg_temp.ug(v text) returns jsonb language sql immutable as $$ select jsonb_build_object('value', v, 'unit', 'µg/kg/min', 'ucum', 'ug/kg/min') $$;
create function pg_temp.obs(p_code text, p_label text, v text, unit text, ucum text) returns jsonb language sql immutable as $$
  select jsonb_build_object('code', jsonb_build_object('text', p_label, 'codings', jsonb_build_array(jsonb_build_object('system', 'loinc', 'code', p_code, 'display', p_label))),
    'value', jsonb_build_object('quantity', jsonb_build_object('value', v, 'unit', unit, 'ucum', ucum)))
$$;
create function pg_temp.at() returns jsonb language sql stable as $$ select jsonb_build_object('occurred_at', date_trunc('hour', now())) $$;
-- an entry of the ward's stay at the hour
create function pg_temp.e(p_type text, p_data jsonb, p_id uuid default null, p_refers uuid default null, p_relation text default null, p_dept uuid default '00000000-0000-0000-0000-0000000000d6')
returns jsonb language sql as $$
  select t.e(p_type, '00000000-0000-0000-0000-0000000000f1', p_dept, p_data, p_id, case when p_dept = '00000000-0000-0000-0000-0000000000d6' then '00000000-0000-0000-0000-00000000e701'::uuid end,
    p_refers, p_relation, null, pg_temp.at())
$$;
create function pg_temp.board(p_dept uuid) returns jsonb language sql as $$
  select public.pack_op(jsonb_build_object('op', 'intensive.board', 'department_id', p_dept, 'args', '{}'::jsonb, 'purpose', 'TREAT'))
$$;

set role authenticated;
select t.as(:'dr');
select t.landed(t.w(t.e('admitted', :'pt', :'ward', '{"admit_source":"emd","reason":"septic shock"}', :'stay', :'stay')), 'admitted to the ward');

\echo '── one hour of the ICU chart, one set: the base''s vitals, observations and procedure, and the pack''s two types'
select t.as(:'nurse');
create temp table hour1 as select t.w(jsonb_build_array(
  pg_temp.e('vitals', '{"hr":{"value":"112","unit":"bpm","ucum":"/min"},"bp":{"sys":{"value":"96","unit":"mmHg","ucum":"mm[Hg]"},"dia":{"value":"42","unit":"mmHg","ucum":"mm[Hg]"}},"spo2":{"value":"93","unit":"%","ucum":"%"},"temp":{"value":"38.6","unit":"°C","ucum":"Cel"},"glucose":{"value":"212","unit":"mg/dL","ucum":"mg/dL"},"weight":{"value":"78","unit":"kg","ucum":"kg"}}', :'v1'),
  pg_temp.e('observation', pg_temp.obs('8478-0', 'Mean blood pressure', '58', 'mmHg', 'mm[Hg]'), :'map'),
  pg_temp.e('observation', pg_temp.obs('60985-9', 'Central venous pressure (CVP)', '8', 'cmH₂O', 'cm[H2O]'), :'cvp'),
  pg_temp.e('observation', pg_temp.obs('9103-3', 'Fluid intake total Measured', '145', 'mL', 'mL'), :'inn'),
  pg_temp.e('observation', pg_temp.obs('9188-4', 'Urine output 1 hour', '20', 'mL/h', 'mL/h'), :'uri'),
  pg_temp.e('procedure', jsonb_build_object('concept', '{"text":"Invasive ventilation","codings":[{"system":"local.procedure","code":"invasive_ventilation","display":"Invasive ventilation"}]}'::jsonb,
    'status', 'in-progress', 'performed', jsonb_build_object('value', date_trunc('hour', now()), 'precision', 'minute')), :'proc'),
  pg_temp.e('intensive.vent', '{"mode":"vc","fio2":{"value":"80","unit":"%","ucum":"%"},"peep":{"value":"10","unit":"cmH₂O","ucum":"cm[H2O]"},"vt":{"value":"420","unit":"mL","ucum":"mL"},"rate":{"value":"18","unit":"/min","ucum":"/min"}}', :'vent'),
  pg_temp.e('intensive.infusion', pg_temp.drip('Noradrenaline', 'noradrenaline', 17.6, pg_temp.ug('0.3'), 'ug/kg/min', '{"value":"4","unit":"mg","ucum":"mg"}'), :'nor'))) r;
select t.landed(r, 'the hour lands in one set') from hour1;
select t.ok(r -> 'findings' = '[]'::jsonb, 'with no finding: its codes and units are known') from hour1;

\echo '── their lines and values'
create temp table rec1 as select t.record(:'pt', :'ward') r;
select t.ok(t.entry(r, :'vent') ->> 'line' = 'Ventilator VC · FiO2 80% · PEEP 10 · Vt 420 · rate 18', 'the ventilator''s line: ' || coalesce(t.entry(r, :'vent') ->> 'line', '–')) from rec1;
select t.ok(t.entry(r, :'nor') ->> 'line' = 'Started: Noradrenaline 0.3 µg/kg/min · 17.6 mL/h · 4 mg in 50 mL', 'the infusion''s line: ' || coalesce(t.entry(r, :'nor') ->> 'line', '–')) from rec1;
select t.ok(t.entry(r, :'map') ->> 'line' = 'Mean blood pressure: 58 mmHg', 'the MAP''s line: ' || coalesce(t.entry(r, :'map') ->> 'line', '–')) from rec1;
select t.ok(t.entry(r, :'uri') ->> 'line' = 'Urine output 1 hour: 20 mL/h', 'the urine''s line: ' || coalesce(t.entry(r, :'uri') ->> 'line', '–')) from rec1;
create temp table vals as select r from t.rows('base.values', :'ward', jsonb_build_object('patient_id', :'pt')) r where r ->> 'key' = 'value';
select t.ok((select (r ->> 'value')::numeric = 58 and r ->> 'ucum' = 'mm[Hg]' from vals where r ->> 'code' = 'loinc:8478-0')
  and (select (r ->> 'value')::numeric = 8 and r ->> 'ucum' = 'cm[H2O]' from vals where r ->> 'code' = 'loinc:60985-9')
  and (select (r ->> 'value')::numeric = 20 and r ->> 'ucum' = 'mL/h' from vals where r ->> 'code' = 'loinc:9188-4')
  and (select (r ->> 'value')::numeric = 145 from vals where r ->> 'code' = 'loinc:9103-3'), 'the values: MAP 58 mm[Hg], CVP 8 cm[H2O], urine 20 mL/h, in 145');

\echo '── a rate change is a version of its infusion'
select t.landed(t.w(pg_temp.e('intensive.infusion', pg_temp.drip('Noradrenaline', 'noradrenaline', 14.6, pg_temp.ug('0.25'), 'ug/kg/min', '{"value":"4","unit":"mg","ucum":"mg"}'),
  :'nor2', :'nor', 'changes'), null, '{}', jsonb_build_object(:'nor', 1)), 'noradrenaline up to 14.6 mL/h, 0.25');
select t.ok(t.entry(t.record(:'pt', :'ward'), :'nor2') ->> 'line' = 'Noradrenaline 0.25 µg/kg/min · 14.6 mL/h', 'its line: Noradrenaline 0.25 µg/kg/min · 14.6 mL/h');

\echo '── refused: the dose is the rate''s, the rate in mL/h, the bag and the weight it needs, a change of its own kind'
select t.refused(t.w(pg_temp.e('intensive.infusion', pg_temp.drip('Noradrenaline', 'noradrenaline', 12, pg_temp.ug('0.3'), 'ug/kg/min', '{"value":"4","unit":"mg","ucum":"mg"}'))),
  'rate_mismatch', 'dose 0.3 at 12 mL/h');
select t.refused(t.w(pg_temp.e('intensive.infusion', pg_temp.drip('Noradrenaline', 'noradrenaline', null, pg_temp.ug('0.3'), 'ug/kg/min', '{"value":"4","unit":"mg","ucum":"mg"}'))),
  'rate_missing', 'running with no rate');
select t.refused(t.w(pg_temp.e('intensive.infusion', pg_temp.drip('Noradrenaline', 'noradrenaline', 0.0176, pg_temp.ug('0.3'), 'ug/kg/min', '{"value":"4","unit":"mg","ucum":"mg"}', 78, 'L/h'))),
  'rate_unit', 'a rate in L/h');
select t.refused(t.w(pg_temp.e('intensive.infusion', pg_temp.drip('Noradrenaline', 'noradrenaline', 17.6, pg_temp.ug('0.3'), 'ug/kg/min', null))), 'bag_missing', 'a dose with no amount');
select t.refused(t.w(pg_temp.e('intensive.infusion', pg_temp.drip('Noradrenaline', 'noradrenaline', 17.6, pg_temp.ug('0.3'), 'ug/kg/min', '{"value":"4","unit":"mg","ucum":"mg"}', null))),
  'weight_missing', 'a dose per kg with no weight');
select t.refused(t.w(pg_temp.e('intensive.infusion', pg_temp.drip('Insulin', 'insulin', 4, '{"value":"4","unit":"units/h"}', 'units/h', '{"value":"50","unit":"mg","ucum":"mg"}', null))),
  'bag_unit', 'units/h from a bag in mg');
select t.refused(t.w(pg_temp.e('intensive.infusion', pg_temp.drip('Noradrenaline', 'noradrenaline', 17.6, '{"value":"0.3","unit":"mg/h","ucum":"mg/h"}', 'ug/kg/min', '{"value":"4","unit":"mg","ucum":"mg"}'))),
  'dose_unit_mismatch', 'a dose in mg/h for a dose unit of µg/kg/min');
select t.refused(t.w(pg_temp.e('intensive.infusion', pg_temp.drip('Fentanyl', 'fentanyl', 1.5, '{"value":"75","unit":"µg/h","ucum":"ug/h"}', 'ug/h', '{"value":"2500","unit":"µg","ucum":"ug"}', null))),
  'dose_unit_mismatch', 'µg/h written with a UCUM code it has no exact row for');
select t.landed(t.w(pg_temp.e('given', '{"drug":{"text":"Paracetamol"},"status":"completed"}', :'giv')), 'a base given');
select t.refused(t.w(pg_temp.e('intensive.infusion', pg_temp.drip('Noradrenaline', 'noradrenaline', 17.6, pg_temp.ug('0.3'), 'ug/kg/min', '{"value":"4","unit":"mg","ucum":"mg"}'),
  null, :'giv', 'changes')), 'wrong_target', 'an infusion that changes a base given');
select t.refused(t.w(pg_temp.e('intensive.vent', '{"mode":"vc","fio2":{"value":"60","unit":"%","ucum":"%"}}', null, :'v1', 'changes')), 'wrong_target', 'ventilator settings that change the vitals');
select t.refused(t.w(pg_temp.e('intensive.vent', '{"mode":"vc","fio2":{"value":"0.6","unit":"%","ucum":"%"}}')), 'fio2_percent', 'FiO2 0.6');
select t.refused(t.w(pg_temp.e('intensive.vent', '{"mode":"other"}')), 'mode_text_missing', 'an other mode with no words');
select t.refused(t.w(pg_temp.e('intensive.infusion', jsonb_set(pg_temp.drip('Noradrenaline', 'noradrenaline', 17.6, pg_temp.ug('100.85'), 'ug/kg/min', '{"value":"4","unit":"mg","ucum":"mg"}'),
  '{volume}', '{"value":"0.05","unit":"L","ucum":"L"}'))), 'bag_unit', 'a bag''s volume in L: the arithmetic reads mL');
select t.refused(t.w(pg_temp.e('intensive.infusion', jsonb_set(pg_temp.drip('Noradrenaline', 'noradrenaline', 17.6, pg_temp.ug('0.0003'), 'ug/kg/min', '{"value":"4","unit":"mg","ucum":"mg"}'),
  '{weight}', '{"value":"78000","unit":"g","ucum":"g"}'))), 'weight_unit', 'a weight in g: the arithmetic reads kg');
select t.landed(t.w(pg_temp.e('intensive.infusion', '{"drug":{"text":"Noradrenaline"},"key":"noradrenaline","status":"stopped","dose_unit":"ug/kg/min"}', null, :'nor2', 'changes'),
  null, '{}', jsonb_build_object(:'nor', 2)), 'the noradrenaline stopped: a version of its latest');
select t.refused(t.w(pg_temp.e('intensive.infusion', pg_temp.drip('Noradrenaline', 'noradrenaline', 14.6, pg_temp.ug('0.25'), 'ug/kg/min', '{"value":"4","unit":"mg","ucum":"mg"}'),
  null, t.latest(:'nor'), 'changes')), 'infusion_stopped', 'a rate after the stop: a new infusion starts its own item');
select t.refused(t.w(pg_temp.e('intensive.vent', '{"mode":"vc"}', null, null, null, :'im')), 'not_allowed', 'in Internal Medicine, which does not use the pack');

\echo '── insulin: units/h in words, with no UCUM code'
create temp table ins1 as select t.w(pg_temp.e('intensive.infusion', pg_temp.drip('Soluble insulin', 'insulin', 4, '{"value":"4","unit":"units/h"}', 'units/h',
  '{"value":"50","unit":"units","ucum":"[iU]"}', null), :'ins')) r;
select t.landed(r, 'insulin at 4 mL/h, 4 units/h') from ins1;
select t.ok(r -> 'findings' = '[]'::jsonb, 'with no finding') from ins1;

\echo '── FHIR: the settings an Observation with a component each, an infusion a MedicationAdministration with its rate'
select t.as(:'dr');
create temp table bundle as select public.read(jsonb_build_object('shape', 'fhir', 'patient_id', :'pt', 'department_id', :'ward')) b;
create temp table res as select e -> 'resource' r from bundle, jsonb_array_elements(b -> 'entry') e;
select t.ok(r -> 'code' ->> 'text' = 'Ventilator settings' and r -> 'component' @> '[{"code":{"text":"Mode"},"valueString":"VC"}]'
  and (select (c -> 'valueQuantity' ->> 'value')::numeric = 80 and c -> 'valueQuantity' ->> 'code' = '%' and c -> 'valueQuantity' ->> 'system' like '%unitsofmeasure%'
       from jsonb_array_elements(r -> 'component') c where c -> 'code' ->> 'text' = 'FiO2'), 'the ventilator''s Observation: its mode and its FiO2 in %')
  from res where r ->> 'resourceType' = 'Observation' and r ->> 'id' = :'vent';
select t.ok(r ->> 'status' = 'stopped' and r -> 'effectivePeriod' ? 'start' and r -> 'effectivePeriod' ? 'end', 'the noradrenaline: stopped, its start and its end')
  from res where r ->> 'resourceType' = 'MedicationAdministration' and r ->> 'id' = :'nor';
select t.ok(r ->> 'status' = 'in-progress' and (r -> 'dosage' -> 'rateQuantity' ->> 'value')::numeric = 4 and r -> 'dosage' -> 'rateQuantity' ->> 'code' = 'mL/h',
  'the insulin: in progress, at 4 mL/h') from res where r ->> 'resourceType' = 'MedicationAdministration' and r ->> 'id' = :'ins';
reset role;
select t.report('intensive', (r ->> 'resourceType') || '/' || (r ->> 'id') || ': ' || q) from res, unnest(core.fhir_problems(r)) q where r ->> 'resourceType' <> 'Bundle';
select t.ok(true, 'no resource has a FHIR problem');
with refs as (select distinct v #>> '{}' ref from res, lateral jsonb_path_query(r, 'strict $.**.reference') v)
select t.report('intensive', 'unresolved reference ' || ref) from refs where not exists (select 1 from res where (r ->> 'resourceType') || '/' || (r ->> 'id') = ref);
select t.ok(true, 'every reference resolves inside the bundle');
set role authenticated;

\echo '── the board''s words through the pack''s door'
select t.as(:'nurse');
select t.ok(w -> 'airway' ->> 'code' = 'invasive_ventilation' and w -> 'airway' ->> 'status' = 'in-progress'
  and (select array_agg(i ->> 'key') from jsonb_array_elements(w -> 'infusions') i) = array['insulin']
  and (w -> 'map' ->> 'value')::numeric = 58 and (w -> 'map' ->> 'measured')::boolean
  and (w -> 'urine' ->> 'ml')::numeric = 20 and (w -> 'urine' ->> 'hours')::int = 1 and (w -> 'urine' ->> 'kg')::numeric = 78 and b -> 'patient_ids' ? :'pt',
  'the stay: ventilated, insulin running (not the stopped noradrenaline), MAP 58 typed, urine 20 in 1 h at 78 kg; the patient named: ' || w::text)
  from (select b, b -> 'stays' -> :'stay' w from (select pg_temp.board(:'ward') b) y) x;

\echo '── a second stay: a BP newer than the typed MAP wins (worked out), the oxygen and its flow, NIV ended this hour'
create function pg_temp.e2(p_type text, p_data jsonb, p_at timestamptz, p_id uuid default null, p_refers uuid default null, p_relation text default null)
returns jsonb language sql as $$
  select t.e(p_type, '00000000-0000-0000-0000-0000000000f2', '00000000-0000-0000-0000-0000000000d6', p_data, p_id, '00000000-0000-0000-0000-00000000e721'::uuid,
    p_refers, p_relation, null, jsonb_build_object('occurred_at', p_at))
$$;
select t.as(:'rec');
select public.save_patient(jsonb_build_object('department_id', '00000000-0000-0000-0000-0000000000d4', 'patient', jsonb_build_object('id', :'pt2',
  'given', jsonb_build_array('Omar'), 'family', 'Fathy', 'gender', 'male', 'birth_date', '1975-06-02'))) is not null as saved;
select t.as(:'dr');
select t.landed(t.w(t.e('admitted', :'pt2', :'ward', '{"admit_source":"emd","reason":"pneumonia"}', :'stay2', :'stay2', null, null, null,
  jsonb_build_object('occurred_at', date_trunc('hour', now()) - interval '2 hours'))), 'the second patient admitted to the ward');
select t.as(:'nurse');
select t.landed(t.w(jsonb_build_array(
  pg_temp.e2('observation', pg_temp.obs('8478-0', 'Mean blood pressure', '70', 'mmHg', 'mm[Hg]'), date_trunc('hour', now()) - interval '1 hour'),
  pg_temp.e2('procedure', jsonb_build_object('concept', '{"text":"Non-invasive ventilation","codings":[{"system":"local.procedure","code":"non_invasive_ventilation","display":"Non-invasive ventilation"}]}'::jsonb,
    'status', 'in-progress', 'performed', jsonb_build_object('value', date_trunc('hour', now()) - interval '1 hour', 'precision', 'minute')), date_trunc('hour', now()) - interval '1 hour', :'niv'))),
  'an hour ago: MAP 70 typed, NIV begun');
select t.landed(t.w(jsonb_build_array(
  pg_temp.e2('vitals', '{"bp":{"sys":{"value":"70","unit":"mmHg","ucum":"mm[Hg]"},"dia":{"value":"35","unit":"mmHg","ucum":"mm[Hg]"}},"oxygen":{"on":"oxygen","flow":{"value":"2","unit":"L/min","ucum":"L/min"}}}',
    date_trunc('hour', now())),
  pg_temp.e2('procedure', jsonb_build_object('concept', '{"text":"Non-invasive ventilation","codings":[{"system":"local.procedure","code":"non_invasive_ventilation","display":"Non-invasive ventilation"}]}'::jsonb,
    'status', 'completed', 'outcome', 'off NIV', 'performed', jsonb_build_object('value', date_trunc('hour', now()) - interval '1 hour', 'precision', 'minute')),
    date_trunc('hour', now()), null, :'niv', 'changes')), null, '{}', jsonb_build_object(:'niv', 1)), 'this hour: BP 70/35 on 2 L/min of oxygen, NIV off');
select t.ok((w -> 'map' ->> 'value')::numeric = 47 and not (w -> 'map' ->> 'measured')::boolean
  and w -> 'oxygen' ->> 'on' = 'oxygen' and w -> 'oxygen' ->> 'flow' = '2'
  and w -> 'airway' ->> 'code' = 'non_invasive_ventilation' and w -> 'airway' ->> 'status' = 'completed' and w -> 'airway' ->> 'at' is not null,
  'the second stay: MAP 47 worked out from the newer BP (not the typed 70), oxygen at 2 L/min, NIV ended with its time: ' || w::text)
  from (select pg_temp.board(:'ward') -> 'stays' -> :'stay2' w) x;
reset role;
select t.ok(exists (select 1 from core.read_log l where l.patient_id = :'pt' and l.purpose = 'TREAT' and l.what -> 'ops' ? 'intensive.board'),
  'the read is logged for the patient, for treatment, naming the op');
set role authenticated;
select t.refuses(format($q$select public.pack_op(jsonb_build_object('op','intensive.board','department_id',%L))$q$, :'im'), 'not_used_here');
select t.as(:'rec');
select t.refuses(format($q$select public.pack_op(jsonb_build_object('op','intensive.board','department_id',%L))$q$, :'ward'), 'not_allowed');

\echo '── the clinic turns the pack off: its types are refused, plain vitals still land'
select t.as(:'ow');
select public.write_setting('{"key":"organization.packs_used","data":{"packs":["pharmacy"]}}') ->> 'key' as off;
select t.as(:'nurse');
select t.refused(t.w(pg_temp.e('intensive.vent', '{"mode":"vc"}')), 'pack_off', 'the clinic no longer uses Critical care');
select t.landed(t.w(pg_temp.e('vitals', '{"hr":{"value":"90","unit":"bpm","ucum":"/min"}}')), 'a plain vitals entry still lands');
select t.as(null);
