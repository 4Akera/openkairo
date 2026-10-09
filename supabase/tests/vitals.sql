-- the base's vitals with consciousness and oxygen (spec §4.1, §6.2; the owner's Q5 and B1, 2026-10-08): the codes and units the bed
-- departments need are in the base's lists; ACVPU and air or oxygen (with the oxygen's device, flow and FiO₂) land as vitals at type
-- version 1 with no flag, read in the record's line, put the flow and FiO₂ in the values (never the words), and export as FHIR
-- Observations of their own, every LOINC coding a known code; a bad value is refused and a flow in a unit outside UCUM is flagged.
\set im    '00000000-0000-0000-0000-0000000000d1'
\set pt    '00000000-0000-0000-0000-0000000000f1'
\set a1    '00000000-0000-0000-0000-00000000f501'
\set a2    '00000000-0000-0000-0000-00000000f502'
\set a3    '00000000-0000-0000-0000-00000000f503'
\set nurse '11111111-0000-0000-0000-0000000000b3'
\set dr    '11111111-0000-0000-0000-0000000000b1'
select t.fixture();

\echo '── the codes: ACVPU and its answers, air or oxygen, the flow and FiO₂, the bed departments'' measures; their units'
select t.ok(count(*) = 15, count(*) || ' of the 15 LOINC rows') from core.codes c where c.system = 'loinc' and c.code in ('67775-7', 'LA9340-6', 'LA17108-4', 'LA17107-6',
  'LA9343-0', '107117-4', '3151-8', '3150-0', '9103-3', '9257-7', '9187-6', '9188-4', '8478-0', '60985-9', '55283-6');
select t.ok(count(*) = 7, count(*) || ' of the 7 UCUM rows') from core.codes c where c.system = 'ucum' and c.code in ('L/min', 'mL/h', 'mg/h', 'U/h', 'ug/kg/min', 'mL/kg/h', 'cm[H2O]');
select t.ok((select props ->> 'ucum' from core.codes where system = 'loinc' and code = '3151-8') = 'L/min'
  and (select props ->> 'ucum' from core.codes where system = 'loinc' and code = '3150-0') = '%', 'the flow is in L/min, FiO₂ in %');
select t.ok((select labels ->> 'en' from core.codes where system = 'loinc' and code = '67775-7') = 'Level of responsiveness'
  and (select labels ->> 'en' from core.codes where system = 'loinc' and code = 'LA17108-4') = 'Verbal', 'LOINC''s own names: Level of responsiveness, Verbal');

\echo '── the vitals keys and the shape: the flow and FiO₂ by their path; vitals still at version 1'
select t.ok(array_agg(v.key || ' ' || v.code order by v.key) @> array['oxygen.fio2 loinc:3150-0', 'oxygen.flow loinc:3151-8'], 'base.vital_keys has oxygen.flow (3151-8) and oxygen.fio2 (3150-0)')
  from base.vital_keys() v;
select t.ok(count(*) = 1 and max(version) = 1, 'vitals is still one type version, 1') from core.types where key = 'vitals';

set role authenticated;
select t.as(:'nurse');
\echo '── ACVPU and oxygen land as vitals, with no finding'
select t.ok(r ->> 'outcome' = 'landed' and jsonb_array_length(coalesce(r -> 'findings', '[]')) = 0, 'a set with ACVPU V on a Venturi mask at 4 L/min, FiO₂ 28 %, lands with no finding: ' || r::text)
  from (select t.w(t.e('vitals', :'pt', :'im', '{"rr":{"value":"22","unit":"/min","ucum":"/min"},"spo2":{"value":"93","unit":"%","ucum":"%"},"consciousness":"v","oxygen":{"on":"oxygen","device":"venturi_mask","flow":{"value":"4","unit":"L/min","ucum":"L/min"},"fio2":{"value":"28","unit":"%","ucum":"%"}}}',
    :'a1')) r) x;
select t.ok(t.entry(t.record(:'pt', :'im'), :'a1') ->> 'line' = 'RR 22 · SpO2 93% · O2 4 L/min Venturi mask FiO2 28% · ACVPU V',
  'its line: ' || coalesce(t.entry(t.record(:'pt', :'im'), :'a1') ->> 'line', 'none'));
select t.ok(string_agg(r ->> 'key' || ' ' || (r ->> 'value')::numeric, ', ' order by r ->> 'key') = 'oxygen.fio2 28, oxygen.flow 4, rr 22, spo2 93'
  and bool_or(r ->> 'key' = 'oxygen.flow' and r ->> 'ucum' = 'L/min' and r ->> 'code' = 'loinc:3151-8')
  and bool_or(r ->> 'key' = 'oxygen.fio2' and r ->> 'ucum' = '%' and r ->> 'code' = 'loinc:3150-0'),
  'its values: rr, spo2, the flow (L/min, 3151-8) and FiO₂ (3150-0); no word: ' || string_agg(r ->> 'key' || ' ' || (r ->> 'value'), ', ' order by r ->> 'key'))
  from t.rows('base.values', :'im', jsonb_build_object('patient_id', :'pt')) r where r ->> 'entry_id' = :'a1';
select t.landed(t.w(t.e('vitals', :'pt', :'im', '{"consciousness":"a","oxygen":{"on":"air"}}', :'a2')), 'ACVPU and air alone are vitals');
select t.ok(t.entry(t.record(:'pt', :'im'), :'a2') ->> 'line' = 'Air · ACVPU A', 'its line: ' || coalesce(t.entry(t.record(:'pt', :'im'), :'a2') ->> 'line', 'none'));
select t.ok(not exists (select 1 from t.rows('base.values', :'im', jsonb_build_object('patient_id', :'pt')) r where r ->> 'entry_id' = :'a2'), 'words alone put nothing in the values');
select t.landed(t.w(t.e('vitals', :'pt', :'im', '{"consciousness":"c","hr":{"value":"96","unit":"bpm","ucum":"/min"}}', :'a3')), 'new confusion with a pulse');

\echo '── a value the shape does not take is refused; a flow outside UCUM is flagged'
select t.refused(t.w(t.e('vitals', :'pt', :'im', '{"consciousness":"x"}')), 'bad_shape', 'ACVPU x');
select t.refused(t.w(t.e('vitals', :'pt', :'im', '{"oxygen":{"device":"nasal_cannula"}}')), 'bad_shape', 'a device without air or oxygen');
select t.refused(t.w(t.e('vitals', :'pt', :'im', '{"oxygen":{"on":"oxygen","device":"helmet"}}')), 'bad_shape', 'a device not on the list');
select t.flagged(t.w(t.e('vitals', :'pt', :'im', '{"oxygen":{"on":"oxygen","flow":{"value":"120","unit":"L/h","ucum":"L/h"}}}')), 'unit_not_ucum', 'a flow in L/h');

\echo '── FHIR: ACVPU, air or oxygen, the flow and FiO₂ each an Observation of the vitals panel'
select t.as(:'dr');
create temp table res as select e -> 'resource' r from jsonb_array_elements(public.read(jsonb_build_object('shape', 'fhir', 'patient_id', :'pt', 'department_id', :'im')) -> 'entry') e;
reset role;
-- each check counts its resource: one that is missing fails, never passes unseen
select t.ok(count(*) = 1 and coalesce(bool_and(r -> 'code' -> 'coding' -> 0 ->> 'code' = '67775-7' and r -> 'valueCodeableConcept' -> 'coding' -> 0 ->> 'code' = 'LA17108-4'
  and r -> 'valueCodeableConcept' -> 'coding' -> 0 ->> 'display' = 'Verbal' and r -> 'valueCodeableConcept' -> 'coding' -> 0 ->> 'system' = 'http://loinc.org'), false),
  'ACVPU V: 67775-7, Verbal (LA17108-4)') from res where r ->> 'id' = :'a1' || '-consciousness';
select t.ok(count(*) = 1 and coalesce(bool_and(r -> 'valueCodeableConcept' -> 'coding' -> 0 ->> 'code' = 'LA9340-6' and r -> 'valueCodeableConcept' -> 'coding' -> 0 ->> 'display' = 'Alert'), false), 'ACVPU A: Alert (LA9340-6)')
  from res where r ->> 'id' = :'a2' || '-consciousness';
select t.ok(count(*) = 1 and coalesce(bool_and(r -> 'valueCodeableConcept' = '{"text":"New confusion"}'::jsonb), false), 'ACVPU C: the words New confusion, no coding') from res where r ->> 'id' = :'a3' || '-consciousness';
select t.ok(count(*) = 1 and coalesce(bool_and(r -> 'code' -> 'coding' -> 0 ->> 'code' = '107117-4' and r -> 'valueCodeableConcept' = '{"text":"Venturi mask"}'::jsonb), false), 'oxygen: 107117-4, Venturi mask')
  from res where r ->> 'id' = :'a1' || '-oxygen';
select t.ok(count(*) = 1 and coalesce(bool_and(r -> 'code' -> 'coding' -> 0 ->> 'code' = '107117-4' and r -> 'valueCodeableConcept' = '{"text":"Room air"}'::jsonb), false), 'air: 107117-4, Room air')
  from res where r ->> 'id' = :'a2' || '-oxygen';
select t.ok(count(*) = 1 and coalesce(bool_and(r -> 'code' -> 'coding' -> 0 ->> 'code' = '3151-8' and (r -> 'valueQuantity' ->> 'value')::numeric = 4 and r -> 'valueQuantity' ->> 'code' = 'L/min'
  and r -> 'valueQuantity' ->> 'system' = 'http://unitsofmeasure.org'), false), 'the flow: 3151-8, 4 L/min (UCUM)') from res where r ->> 'id' = :'a1' || '-oxygen.flow';
select t.ok(count(*) = 1 and coalesce(bool_and(r -> 'code' -> 'coding' -> 0 ->> 'code' = '3150-0' and (r -> 'valueQuantity' ->> 'value')::numeric = 28 and r -> 'valueQuantity' ->> 'code' = '%'), false), 'FiO₂: 3150-0, 28 %')
  from res where r ->> 'id' = :'a1' || '-oxygen.fio2';
select t.ok(count(*) = 1 and coalesce(bool_and((select array_agg(m ->> 'reference' order by m ->> 'reference') from jsonb_array_elements(r -> 'hasMember') m)
  @> (select array_agg('Observation/' || :'a1' || '-' || k) from unnest(array['rr', 'spo2', 'oxygen.flow', 'oxygen.fio2', 'consciousness', 'oxygen']) k)), false),
  'the panel holds all six: rr, spo2, the flow, FiO₂, ACVPU and oxygen') from res where r ->> 'id' = :'a1';
select t.ok(not exists (select 1 from res, lateral jsonb_path_query(r, 'strict $.**.coding[*]') c
  where c ->> 'system' = 'http://loinc.org' and not exists (select 1 from core.codes x where x.system = 'loinc' and x.code = c ->> 'code')), 'every LOINC coding is a known code');
select t.report('vitals', (r ->> 'resourceType') || '/' || (r ->> 'id') || ': ' || array_to_string(core.fhir_problems(r), '; ')) from res
 where r ->> 'resourceType' <> 'Bundle' and cardinality(core.fhir_problems(r)) > 0;
select t.ok(true, 'no resource has a FHIR problem');
