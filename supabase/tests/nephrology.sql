-- the nephrology pack (spec §5.7): no record type of its own; its starter setup (the Nephrology clinic); the renal list, the clinic's
-- setting (starter rows; an ATC class or an ingredient, an eGFR, its words); the CKD panel's codes known, so its results land clean
\set nc   '00000000-0000-0000-0000-0000000000e5'
\set pt   '00000000-0000-0000-0000-0000000000f1'
\set md   '11111111-0000-0000-0000-0000000000e5'
\set ow   '11111111-0000-0000-0000-0000000000b9'
select t.fixture();
select t.as(:'ow');
select public.write_setting(jsonb_build_object('key', 'organization.packs_used', 'data', jsonb_build_object('packs',
  (select coalesce(s.data -> 'packs', '[]') from core.settings s where s.key = 'organization.packs_used' order by s.recorded_at desc limit 1) || '["nephrology"]'::jsonb))) ->> 'key' as on;
select public.setup(jsonb_build_object('setup', 'nephrology.clinic', 'department_id', :'nc', 'name', 'Nephrology clinic', 'apply', true)) is not null as made;
select public.save('user', jsonb_build_object('id', '00000000-0000-0000-0000-0000000000e5', 'name', 'Dr Medhat', 'login_id', :'md', 'holdings', jsonb_build_array(
  jsonb_build_object('role_id', '00000000-0000-0000-0000-00000000e501', 'department_id', :'nc')))) ->> 'id' as nephrologist;

\echo '── the setup: the clinic ticks the pack; again, nothing to add'
select t.ok(not exists (select 1 from jsonb_array_elements(public.setup(jsonb_build_object('setup', 'nephrology.clinic', 'department_id', :'nc')) -> 'parts') x
  where x ->> 'state' = 'add'), 'run again: nothing to add');
reset role;
select t.ok('nephrology' = any (select jsonb_array_elements_text(core.pack_department('00000000-0000-0000-0000-0000000000a1', :'nc') -> 'packs')), 'the pack ticked');
select t.ok(core.may('00000000-0000-0000-0000-0000000000e5', 'write:medication', :'nc'), 'the nephrologist is built on Doctor');
set role authenticated;

\echo '── a kidney result: creatinine, eGFR 2021, ACR and the CKD panel''s codes, none flagged unknown'
select t.as(:'md');
select t.ok(not exists (select 1 from jsonb_array_elements(t.w(t.e('result', :'pt', :'nc', jsonb_build_object('status', 'final', 'analytes', jsonb_build_array(
  jsonb_build_object('key', 'egfr', 'name', 'eGFR', 'code', jsonb_build_object('system', 'loinc', 'code', '98979-8'), 'value', jsonb_build_object('value', '28', 'unit', 'mL/min/1.73m²', 'ucum', 'mL/min/{1.73_m2}')),
  jsonb_build_object('key', 'acr', 'name', 'ACR', 'code', jsonb_build_object('system', 'loinc', 'code', '14959-1'), 'value', jsonb_build_object('value', '420', 'unit', 'mg/g', 'ucum', 'mg/g')),
  jsonb_build_object('key', 'tsat', 'name', 'TSAT', 'code', jsonb_build_object('system', 'loinc', 'code', '2502-3'), 'value', jsonb_build_object('value', '16', 'unit', '%', 'ucum', '%')),
  jsonb_build_object('key', 'phos', 'name', 'Phosphate', 'code', jsonb_build_object('system', 'loinc', 'code', '2777-1'), 'value', jsonb_build_object('value', '5.1', 'unit', 'mg/dL', 'ucum', 'mg/dL')),
  jsonb_build_object('key', 'pth', 'name', 'PTH', 'code', jsonb_build_object('system', 'loinc', 'code', '2731-8'), 'value', jsonb_build_object('value', '188', 'unit', 'pg/mL', 'ucum', 'pg/mL')))))) -> 'findings') f
  where f ->> 'level' = 'flag'), 'the panel lands clean');
reset role;
select t.ok((select count(*) from base.values v where v.patient_id = :'pt'::uuid and v.code in ('loinc:98979-8', 'loinc:14959-1', 'loinc:2777-1')) = 3,
  'eGFR, ACR, phosphate in base.values (the KDIGO square reads them)');
set role authenticated;

\echo '── the renal list: the clinic''s, starting rows as declared; an ATC that is not one refused; the clinic edits it'
reset role;
select t.ok((select count(*) from jsonb_array_elements((select k.shape -> 'properties' -> 'rules' -> 'default' from core.setting_keys k where k.key = 'nephrology.renal_list')) r
  where r ->> 'medicine' = 'metformin') = 2, 'metformin: halve under 45, stop under 30');
set role authenticated;
select t.as(:'ow');
select t.refuses($$select public.write_setting('{"key":"nephrology.renal_list","data":{"rules":[{"medicine":"metformin","atc":"metformin","under":30,"says":"stop"}]}}')$$, 'bad_shape');
select t.refuses($$select public.write_setting('{"key":"nephrology.renal_list","data":{"rules":[{"medicine":"metformin","atc":"A10BA02","under":200,"says":"stop"}]}}')$$, 'bad_shape');
select t.ok(public.write_setting('{"key":"nephrology.renal_list","data":{"rules":[{"medicine":"metformin","atc":"A10BA","under":30,"says":"stop"}]}}') ->> 'key' = 'nephrology.renal_list', 'an ATC class');
