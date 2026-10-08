-- the respiratory pack (spec §5.7): its starter setup (the Chest clinic); the predicted values worked out by the server from the GLI-2012
-- list loaded (a demo sample, marked so; a cell not loaded said, never guessed), through its operation where the pack is ticked; CAT,
-- mMRC, ACT and the GOLD group added up by the server; spirometry as the base's result with no order, its codes and units known
\set cc   '00000000-0000-0000-0000-0000000000e6'
\set im   '00000000-0000-0000-0000-0000000000d1'
\set pt   '00000000-0000-0000-0000-0000000000f1'
\set dd   '11111111-0000-0000-0000-0000000000e6'
\set dr   '11111111-0000-0000-0000-0000000000b1'
\set ow   '11111111-0000-0000-0000-0000000000b9'
select t.fixture();
select t.as(:'ow');
select public.write_setting(jsonb_build_object('key', 'organization.packs_used', 'data', jsonb_build_object('packs',
  (select coalesce(s.data -> 'packs', '[]') from core.settings s where s.key = 'organization.packs_used' order by s.recorded_at desc limit 1) || '["respiratory"]'::jsonb))) ->> 'key' as on;
select public.setup(jsonb_build_object('setup', 'respiratory.clinic', 'department_id', :'cc', 'name', 'Chest clinic', 'apply', true)) is not null as made;
select public.save('user', jsonb_build_object('id', '00000000-0000-0000-0000-0000000000e6', 'name', 'Dr Dalia', 'login_id', :'dd', 'holdings', jsonb_build_array(
  jsonb_build_object('role_id', '00000000-0000-0000-0000-00000000e601', 'department_id', :'cc')))) ->> 'id' as physician;

\echo '── GLI-2012: a demo sample, marked so; the predicted values from the server where the pack is ticked'
reset role;
select t.ok((select sample from core.code_imports where system = 'respiratory.gli2012' order by id desc limit 1), 'the list loaded is a demo sample');
set role authenticated;
select t.as(:'dd');
select t.ok((public.pack_op(jsonb_build_object('op', 'respiratory.predicted', 'department_id', :'cc', 'args', '{"sex":"male","age":61,"height":170}')) -> 'fev1' ->> 'm')::numeric = 3.05,
  'a man of 61, 170 cm: FEV1 predicted 3.05');
select t.ok((public.pack_op(jsonb_build_object('op', 'respiratory.predicted', 'department_id', :'cc', 'args', '{"sex":"male","age":62,"height":172}')) ->> 'cell') = 'male:61:170',
  'the nearest cell within 2 years and 3 cm');
select t.ok((public.pack_op(jsonb_build_object('op', 'respiratory.predicted', 'department_id', :'cc', 'args', '{"sex":"male","age":30,"height":190}')) ->> 'missing') is not null,
  'a cell not loaded: said, never guessed');
select t.as(:'dr');
select t.ok(t.try($$select public.pack_op(jsonb_build_object('op', 'respiratory.predicted', 'department_id', '00000000-0000-0000-0000-0000000000d1', 'args', '{"sex":"male","age":61,"height":170}'))$$) <> 'ok',
  'not where the pack is not ticked');

\echo '── the scores: CAT, mMRC, ACT, the GOLD group'
reset role;
select t.ok((core.score('respiratory.cat', null, '{"cough":"3","phlegm":"3","tight":"2","breath":"4","home":"2","confidence":"1","sleep":"1","energy":"2"}') ->> 'total')::int = 18, 'CAT 18');
select t.ok(core.score('respiratory.act', null, '{"work":"4","breath":"3","night":"3","reliever":"3","control":"4"}') -> 'band' ->> 'key' = 'not_well', 'ACT 17: not well controlled');
select t.ok(core.score('respiratory.gold', null, '{"symptoms":"more","flares":"many"}') -> 'band' ->> 'key' = 'e', 'GOLD: symptoms and flares, E');
select t.ok(core.score('respiratory.gold', null, '{"symptoms":"more","flares":"few"}') -> 'band' ->> 'key' = 'b', 'GOLD: symptoms, few flares, B');
select t.ok(core.score('respiratory.mmrc', null, '{"grade":"2"}') -> 'band' ->> 'key' = 'more', 'mMRC 2: more breathless');
set role authenticated;

\echo '── spirometry and the observations: the base''s, landing clean'
select t.as(:'dd');
select t.ok(not exists (select 1 from jsonb_array_elements(t.w(jsonb_build_array(t.e('result', :'pt', :'cc', jsonb_build_object('status', 'final',
  'code', jsonb_build_object('text', 'Spirometry', 'codings', jsonb_build_array(jsonb_build_object('system', 'respiratory.terms', 'code', 'spirometry'))), 'analytes', jsonb_build_array(
  jsonb_build_object('key', 'fev1', 'name', 'FEV1 before', 'code', jsonb_build_object('system', 'loinc', 'code', '20150-9'), 'value', jsonb_build_object('value', '1.62', 'unit', 'L', 'ucum', 'L')),
  jsonb_build_object('key', 'ratio', 'name', 'FEV1/FVC before', 'code', jsonb_build_object('system', 'loinc', 'code', '19926-5'), 'value', jsonb_build_object('value', '0.57', 'unit', '', 'ucum', '{ratio}')),
  jsonb_build_object('key', 'fev1_z', 'name', 'FEV1 z', 'value', jsonb_build_object('value', '-2.9', 'unit', '', 'ucum', '{score}'))))),
  t.e('observation', :'pt', :'cc', jsonb_build_object('code', jsonb_build_object('text', 'Inhaler technique', 'codings', jsonb_build_array(jsonb_build_object('system', 'respiratory.terms', 'code', 'inhaler_technique'))),
    'value', jsonb_build_object('text', 'correct · Breezhaler')))))) -> 'findings') f where f ->> 'level' = 'flag'), 'spirometry and the technique, clean');
