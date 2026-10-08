-- the cardiology pack (spec §5.7): its starter setups (the Cardiology clinic; the Echo room, a bench answering /echo with the base's
-- result, each measure with its range); the ECG read in the clinic as the base's result with no order, its measures in base.values; NYHA
-- and the dry weight as the base's observations in the pack's terms; CHA₂DS₂-VASc added up by the server; the target doses a setting
\set im   '00000000-0000-0000-0000-0000000000d1'
\set cc   '00000000-0000-0000-0000-0000000000e1'
\set er   '00000000-0000-0000-0000-0000000000e2'
\set pt   '00000000-0000-0000-0000-0000000000f1'
\set dr   '11111111-0000-0000-0000-0000000000b1'
\set wg   '11111111-0000-0000-0000-0000000000e1'
\set rn   '11111111-0000-0000-0000-0000000000e2'
\set ow   '11111111-0000-0000-0000-0000000000b9'
select t.fixture();
select t.as(:'ow');
select public.write_setting(jsonb_build_object('key', 'organization.packs_used', 'data', jsonb_build_object('packs',
  (select coalesce(s.data -> 'packs', '[]') from core.settings s where s.key = 'organization.packs_used' order by s.recorded_at desc limit 1) || '["cardiology"]'::jsonb))) ->> 'key' as on;
select public.setup(jsonb_build_object('setup', 'cardiology.clinic', 'department_id', :'cc', 'name', 'Cardiology clinic', 'apply', true)) is not null as made;
select public.setup(jsonb_build_object('setup', 'cardiology.echo_room', 'department_id', :'er', 'name', 'Echo room', 'apply', true)) is not null as made;
select public.save('user', jsonb_build_object('id', '00000000-0000-0000-0000-0000000000e1', 'name', 'Dr Wael', 'login_id', :'wg', 'holdings', jsonb_build_array(
  jsonb_build_object('role_id', '00000000-0000-0000-0000-00000000e401', 'department_id', :'cc')))) ->> 'id' as cardiologist;
select public.save('user', jsonb_build_object('id', '00000000-0000-0000-0000-0000000000e2', 'name', 'Dr Rasha', 'login_id', :'rn', 'holdings', jsonb_build_array(
  jsonb_build_object('role_id', '00000000-0000-0000-0000-00000000e402', 'department_id', :'er')))) ->> 'id' as echo_doctor;

\echo '── the setups: the clinic ticks the pack; the Echo room answers for every department with its echo; run again, nothing added'
reset role;
select core.setup_id(:'er', 'service', 'echo') as echo_svc \gset
select t.ok(exists (select 1 from core.settings_at('00000000-0000-0000-0000-0000000000a1', 'service') s where s.owner_id = :'er'::uuid and s.data ->> 'code' = 'echo'
  and jsonb_array_length(s.data -> 'fields') = 15), 'the echo: fifteen fields (nine measures with ranges, five choices, the rhythm)');
select t.ok(core.may('00000000-0000-0000-0000-0000000000e1', 'write:result', :'cc') and core.may('00000000-0000-0000-0000-0000000000e1', 'write:observation', :'cc'),
  'the cardiologist is built on Doctor: a result, an observation');
select t.ok(core.may('00000000-0000-0000-0000-0000000000e2', 'write:step', :'er') and core.may('00000000-0000-0000-0000-0000000000e2', 'write:result', :'er'),
  'the echo doctor starts the echo on the bench and writes its report');
set role authenticated;

\echo '── /ecg: the base''s result with no order, its measures with their LOINC codes (none flagged unknown), in base.values'
select t.as(:'wg');
select t.landed(t.w(t.e('result', :'pt', :'cc', jsonb_build_object('status', 'final', 'code', jsonb_build_object('text', 'ECG · 12 leads', 'codings',
  jsonb_build_array(jsonb_build_object('system', 'loinc', 'code', '11524-6', 'display', 'ECG study'))), 'conclusion', 'Atrial fibrillation, ventricular rate 108. No acute ST change.',
  'analytes', jsonb_build_array(jsonb_build_object('key', 'rhythm', 'name', 'Rhythm', 'text', 'AF'),
    jsonb_build_object('key', 'rate', 'name', 'Rate', 'code', jsonb_build_object('system', 'loinc', 'code', '8867-4'), 'value', jsonb_build_object('value', '108', 'unit', '/min', 'ucum', '/min'), 'interpretation', 'H'),
    jsonb_build_object('key', 'qtc', 'name', 'QTc', 'code', jsonb_build_object('system', 'loinc', 'code', '8636-3'), 'value', jsonb_build_object('value', '452', 'unit', 'ms', 'ucum', 'ms'), 'interpretation', 'H'),
    jsonb_build_object('key', 'axis', 'name', 'Axis', 'code', jsonb_build_object('system', 'loinc', 'code', '8632-2'), 'value', jsonb_build_object('value', '20', 'unit', '°', 'ucum', 'deg')))),
  '00000000-0000-0000-0000-00000000e0e1')), 'an ECG, no order');
select t.ok(not exists (select 1 from jsonb_array_elements(t.w(t.e('result', :'pt', :'cc', jsonb_build_object('status', 'final', 'analytes', jsonb_build_array(
  jsonb_build_object('key', 'pr', 'name', 'PR', 'code', jsonb_build_object('system', 'loinc', 'code', '8625-6'), 'value', jsonb_build_object('value', '164', 'unit', 'ms', 'ucum', 'ms')),
  jsonb_build_object('key', 'qrs', 'name', 'QRS', 'code', jsonb_build_object('system', 'loinc', 'code', '8633-0'), 'value', jsonb_build_object('value', '92', 'unit', 'ms', 'ucum', 'ms')))))) -> 'findings') f
  where f ->> 'level' = 'flag'), 'PR, QRS: known codes and units, nothing flagged');
reset role;
select t.ok((select v.value from base.values v where v.patient_id = :'pt'::uuid and v.code = 'loinc:8636-3' order by v.at desc limit 1) = 452, 'the QTc in base.values, by its LOINC code');
set role authenticated;
select t.as(:'wg');

\echo '── /hf: NYHA and the dry weight, the base''s observations in the pack''s terms; the dry weight a value'
select t.landed(t.w(jsonb_build_array(
  t.e('observation', :'pt', :'cc', jsonb_build_object('code', jsonb_build_object('text', 'NYHA class', 'codings', jsonb_build_array(jsonb_build_object('system', 'cardiology.terms', 'code', 'nyha'))),
    'value', jsonb_build_object('text', 'II'), 'note', 'oedema: ankles · lying flat: flat')),
  t.e('observation', :'pt', :'cc', jsonb_build_object('code', jsonb_build_object('text', 'Dry weight', 'codings', jsonb_build_array(jsonb_build_object('system', 'cardiology.terms', 'code', 'dry_weight'))),
    'value', jsonb_build_object('quantity', jsonb_build_object('value', '70', 'unit', 'kg', 'ucum', 'kg')))),
  t.e('vitals', :'pt', :'cc', jsonb_build_object('weight', jsonb_build_object('value', '71.4', 'unit', 'kg', 'ucum', 'kg'))))), 'a heart failure visit');
reset role;
select t.ok((select v.value from base.values v where v.patient_id = :'pt'::uuid and v.code = 'cardiology.terms:dry_weight' order by v.at desc limit 1) = 70, 'the dry weight in base.values, by the pack''s term');

\echo '── CHA₂DS₂-VASc: the server adds it up (2010)'
select t.ok((core.score('cardiology.chadsvasc', null, '{"chf":true,"htn":true,"age":"65to74","dm":true,"stroke":false,"vascular":false,"female":true}') ->> 'total')::int = 5
  and core.score('cardiology.chadsvasc', null, '{"chf":true,"htn":true,"age":"65to74","dm":true,"stroke":false,"vascular":false,"female":true}') -> 'band' ->> 'key' = 'high', '5: high');
select t.ok((core.score('cardiology.chadsvasc', null, '{"chf":false,"htn":false,"age":"lt65","dm":false,"stroke":false,"vascular":false,"female":false}') -> 'band' ->> 'key') = 'low', '0: low');
select t.ok((core.score('cardiology.chadsvasc', null, '{"chf":false,"htn":false,"age":"ge75","dm":false,"stroke":true,"vascular":false,"female":false}') ->> 'total')::int = 4, 'age 75 and a stroke: 2 each');
set role authenticated;

\echo '── /echo: an order to the Echo room from Internal Medicine (the pack not ticked there); started; the report answers it and reaches the doctor'
select t.as(:'dr');
select t.landed(t.w(t.e('order', :'pt', :'im', jsonb_build_object('service', jsonb_build_object('id', :'echo_svc', 'code', 'echo', 'name', 'Echo · transthoracic'),
  'department_id', :'er', 'priority', 'routine', 'status', 'active', 'question', 'LV function, new AF'), '00000000-0000-0000-0000-00000000e0e2')), 'an echo asked');
select t.as(:'rn');
select t.landed(t.w(t.e('step', :'pt', :'er', '{"status":"in-progress"}', null, null, '00000000-0000-0000-0000-00000000e0e2', 'answers')), 'started at the Echo room');
select t.landed(t.w(t.e('result', :'pt', :'er', jsonb_build_object('status', 'final', 'conclusion', 'Dilated left ventricle, EF 38 %.', 'analytes', jsonb_build_array(
  jsonb_build_object('key', 'ef', 'name', 'Ejection fraction (biplane)', 'code', jsonb_build_object('system', 'loinc', 'code', '10230-1'),
    'value', jsonb_build_object('value', '38', 'unit', '%', 'ucum', '%'), 'interpretation', 'L', 'range', jsonb_build_object('low', jsonb_build_object('value', '52', 'unit', '%', 'ucum', '%'))),
  jsonb_build_object('key', 'lavi', 'name', 'LA volume index', 'value', jsonb_build_object('value', '44', 'unit', 'mL/m²', 'ucum', 'mL/m2'), 'interpretation', 'H'),
  jsonb_build_object('key', 'mitral', 'name', 'Mitral', 'text', 'moderate MR'))), '00000000-0000-0000-0000-00000000e0e3', null,
  (select t.latest('00000000-0000-0000-0000-00000000e0e2')), 'answers')), 'the report, signed');
select t.as(:'dr');
select t.ok((select r ->> 'status' from t.rows('base.orders', :'im', jsonb_build_object('item', '00000000-0000-0000-0000-00000000e0e2')) r) = 'completed', 'the echo answered');
select t.ok(exists (select 1 from t.rows('base.review', :'im', jsonb_build_object('for_user', '00000000-0000-0000-0000-0000000000b1')) r
  where r ->> 'entry_id' = '00000000-0000-0000-0000-00000000e0e3'), 'on the doctor''s To review');
reset role;
select t.ok((select v.value from base.values v where v.patient_id = :'pt'::uuid and v.code = 'loinc:10230-1' order by v.at desc limit 1) = 38, 'the EF a value');

\echo '── the target doses: the clinic''s table, from ESC 2021; a medicine by its ATC code'
select t.ok(jsonb_array_length((select k.shape -> 'properties' -> 'targets' -> 'default' from core.setting_keys k where k.key = 'cardiology.hf_targets')) = 16, 'sixteen medicines to start');
set role authenticated;
select t.as(:'ow');
select t.refuses($$select public.write_setting('{"key":"cardiology.hf_targets","data":{"targets":[{"group":"bb","name":"Bisoprolol","atc":"bisoprolol","mg_a_day":10}]}}')$$, 'bad_shape');
select t.ok(public.write_setting('{"key":"cardiology.hf_targets","data":{"targets":[{"group":"bb","name":"Bisoprolol 10 mg once","atc":"C07AB07","mg_a_day":10}]}}') ->> 'key' = 'cardiology.hf_targets',
  'the clinic edits its table');
