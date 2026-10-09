-- ObGyn's labour ward (spec §5.6), piece L1: the pack as the clinics' build declared it (its block, the Obstetrician and the Midwife);
-- the labour examination, its line and its FHIR; the baby's heart as the base's observation (LOINC 55283-6); the partograph's setting;
-- the Midwife's actions; the labour ward's starter setup; the board's read of each stay's exams, the baby's heart and the pregnancy
-- through the pack's own op; refused where the department or the clinic does not use the pack, while the base's observation still lands.
\set org   '00000000-0000-0000-0000-0000000000a1'
\set im    '00000000-0000-0000-0000-0000000000d1'
\set ward  '00000000-0000-0000-0000-0000000000d6'
\set desk  '00000000-0000-0000-0000-0000000000d4'
\set new   '00000000-0000-0000-0000-0000000000e9'
\set pt    '00000000-0000-0000-0000-0000000000f2'
\set stay  '00000000-0000-0000-0000-00000000e801'
\set ex1   '00000000-0000-0000-0000-00000000e802'
\set ex2   '00000000-0000-0000-0000-00000000e803'
\set fhr   '00000000-0000-0000-0000-00000000e804'
\set v1    '00000000-0000-0000-0000-00000000e805'
\set preg  '00000000-0000-0000-0000-00000000e806'
\set ex3   '00000000-0000-0000-0000-00000000e807'
\set ex4   '00000000-0000-0000-0000-00000000e808'
\set ow    '11111111-0000-0000-0000-0000000000b9'
\set dr    '11111111-0000-0000-0000-0000000000b1'
\set nurse '11111111-0000-0000-0000-0000000000b3'
\set rec   '11111111-0000-0000-0000-0000000000b4'
\set d301  '00000000-0000-0000-0000-00000000d301'
\set d302  '00000000-0000-0000-0000-00000000d302'
select t.fixture();
select t.as(:'ow');
select public.write_setting(jsonb_build_object('key', 'organization.packs_used', 'data', jsonb_build_object('packs',
  (select coalesce(s.data -> 'packs', '[]') from core.settings s where s.key = 'organization.packs_used' order by s.recorded_at desc limit 1) || '["obgyn"]'::jsonb))) ->> 'key' as on;
select public.write_setting(jsonb_build_object('key', 'department.packs', 'owner_id', :'ward', 'data', '{"packs":["obgyn"]}'::jsonb)) ->> 'key' as ticked;
select t.as(:'rec');
select (public.save_patient(jsonb_build_object('department_id', :'desk', 'patient', jsonb_build_object('id', :'pt', 'given', jsonb_build_array('Mona', 'Ali'), 'family', 'Fathy',
  'gender', 'female', 'birth_date', (current_date - interval '28 years')::date))) -> 'patient' ->> 'id') = :'pt' as registered;

\echo '── the pack, as the clinics'' build declared it: ObGyn in block d3, the Obstetrician and the Midwife'
select t.ok(l.role_block = 'd3' and l.is_pack and l.labels ->> 'en' = 'ObGyn', 'obgyn reads "ObGyn", its role ids in its block, d3') from core.layers l where l.key = 'obgyn';
select t.ok(not has_schema_privilege('authenticated', 'obgyn', 'USAGE'), 'the API cannot reach its schema');
select t.ok(count(*) = 2 and bool_and(case r.id when :'d301' then r.key = 'obgyn.obstetrician' and r.built_on = '00000000-0000-0000-0000-00000000c002'
                                              else r.key = 'obgyn.midwife' and r.built_on = '00000000-0000-0000-0000-00000000c003' end),
  'd301 the Obstetrician on the Doctor, d302 the Midwife on the Nurse') from core.roles r where r.id in (:'d301', :'d302') and r.organization_id is null;
select t.ok(core.gives(:'org', :'d302', 'write:obgyn.anc', :'ward') and core.gives(:'org', :'d301', 'write:obgyn.periods', :'ward'), 'each still with the clinic''s actions');

\echo '── the labour examination: the pack''s own type, everyday; the partograph''s setting; the Labour tab; the board''s op'
select t.ok(y.resources = array['Observation'] and y.base_type is null and y.to_fhir is not null and y.checks = '{}' and not y.may_be_private,
  'obgyn.labour_exam v1: an Observation of its own, its FHIR mapping, no check, not private') from core.types y where y.key = 'obgyn.labour_exam' and y.version = 1;
select t.ok(a.everyday and a.scope = 'department', 'write:obgyn.labour_exam: everyday, by department') from core.actions a where a.key = 'write:obgyn.labour_exam';
select t.ok(k.owner_kind = 'department' and k.form = 'department', 'obgyn.partograph: the department''s, on its form') from core.setting_keys k where k.key = 'obgyn.partograph';
select t.ok(s.work = 'stays' and s.action = 'read:record' and s.labels ->> 'en' = 'Labour', 'obgyn.labour: the Labour tab of a stays department, read:record')
  from core.screens s where s.key = 'obgyn.labour';
select t.ok(o.action = 'read:record' and o.patients, 'obgyn.board: read:record, it names patients') from core.ops o where o.key = 'obgyn.board';
select t.ok(s.work = 'stays' and s.packs = array['obgyn'] and jsonb_array_length(s.places) = 14
  and (select array_agg(p ->> 'key' order by n) from jsonb_array_elements(s.places) with ordinality x(p, n))
    = array['delivery_1', 'delivery_2', 'delivery_3', 'delivery_4', 'post_1', 'post_2', 'post_3', 'post_4', 'cot_1', 'cot_2', 'cot_3', 'cot_4', 'cot_5', 'cot_6']
  and (select array_agg(p ->> 'name' order by n) from jsonb_array_elements(s.places) with ordinality x(p, n))
    = array['Delivery 1', 'Delivery 2', 'Delivery 3', 'Delivery 4', 'Post 1', 'Post 2', 'Post 3', 'Post 4', 'Cot 1', 'Cot 2', 'Cot 3', 'Cot 4', 'Cot 5', 'Cot 6']
  and s.settings -> 'department.encounter_class' ->> 'class' = 'IMP' and s.screens = '{"screens":["base.beds","obgyn.labour"],"opens":"base.beds"}'::jsonb
  and s.settings -> 'obgyn.partograph' = '{"active_from":4}'::jsonb,
  'obgyn.labour_ward: stays, ticks obgyn, Delivery 1–4, Post 1–4, Cot 1–6, inpatient, the board and the Labour tab, active labour from 4 cm')
  from core.setups s where s.key = 'obgyn.labour_ward';

\echo '── who holds what: the Midwife admits and discharges; the exam is everyday where ObGyn is used'
select t.ok(core.gives(:'org', :'d302', 'write:admitted', :'ward') and core.gives(:'org', :'d302', 'write:discharged', :'ward'), 'the Midwife admits a woman in labour and discharges her');
select t.ok(core.gives(:'org', :'d302', 'write:obgyn.labour_exam', :'ward') and not core.gives(:'org', :'d302', 'write:obgyn.labour_exam', :'im'),
  'the Midwife writes a labour examination on the ward (ObGyn used there), not in Internal Medicine');
select t.ok(core.gives(:'org', :'d301', 'write:obgyn.labour_exam', :'ward'), 'so does the Obstetrician');
select t.ok(core.gives(:'org', '00000000-0000-0000-0000-00000000c003', 'write:obgyn.labour_exam', :'ward'), 'and the base''s Nurse (everyday)');

\echo '── the starter setup on a new department'
select t.as(:'ow');
select public.setup(jsonb_build_object('setup', 'obgyn.labour_ward', 'department_id', :'new', 'name', 'Second labour ward', 'apply', true)) is not null as made;
select t.ok(core.department_uses(:'org', :'new', 'obgyn') and (select count(*) from core.places p where p.department_id = :'new' and p.retired_at is null) = 14
  and (select count(*) from core.places p where p.department_id = :'new' and p.retired_at is null and p.name like 'Cot %') = 6
  and core.setting_at(:'org', 'department.encounter_class', :'new') ->> 'class' = 'IMP' and core.setting_at(:'org', 'department.setup', :'new') ->> 'setup' = 'obgyn.labour_ward'
  and (core.setting_at(:'org', 'obgyn.partograph', :'new') ->> 'active_from')::int = 4,
  'a labour ward made from it uses ObGyn, has 14 places (six cots), is inpatient, keeps its setup, active labour from 4 cm');
select t.refuses(format($q$select public.write_setting(jsonb_build_object('key', 'obgyn.partograph', 'owner_id', %L, 'data', '{"active_from":6}'::jsonb))$q$, :'new'), 'bad_shape');

set role authenticated;
\echo '── admitted in labour, the pregnancy in the same set; an exam, the baby''s heart and her signs signed together'
select t.as(:'dr');
select t.landed(t.w(jsonb_build_array(
  t.e('admitted', :'pt', :'ward', '{"place_id":"00000000-0000-0000-0000-000000000001","admit_source":"emd","reason":"labour"}', :'stay', :'stay'),
  t.e('pregnancy', :'pt', :'ward', jsonb_build_object('status', 'current', 'pregnant', true, 'lmp', jsonb_build_object('value', (current_date - 275)::text, 'precision', 'day')),
    :'preg', :'stay'))), 'admitted to the ward in labour, pregnant by the LMP');
select t.as(:'nurse');
create temp table signed as select t.w(jsonb_build_array(
  t.e('obgyn.labour_exam', :'pt', :'ward', '{"cervix":4,"descent":5,"position":"oa","liquor":"intact","moulding":"0","caput":"none","contractions":{"per_10":3,"seconds":30},"gravida":2,"para":1}',
    :'ex1', :'stay', p_extra => jsonb_build_object('occurred_at', now() - interval '4 hours')),
  t.e('observation', :'pt', :'ward', '{"code":{"text":"Fetal heart rate","codings":[{"system":"loinc","code":"55283-6","display":"Fetal heart rate"}]},"value":{"quantity":{"value":"140","unit":"bpm","ucum":"/min"}}}',
    :'fhr', :'stay', p_extra => jsonb_build_object('occurred_at', now() - interval '4 hours')),
  t.e('vitals', :'pt', :'ward', '{"bp":{"sys":{"value":"118","unit":"mmHg","ucum":"mm[Hg]"},"dia":{"value":"76","unit":"mmHg","ucum":"mm[Hg]"}},"hr":{"value":"88","unit":"bpm","ucum":"/min"},"temp":{"value":"37.1","unit":"°C","ucum":"Cel"}}',
    :'v1', :'stay', p_extra => jsonb_build_object('occurred_at', now() - interval '4 hours')))) r;
select t.landed(r, 'the exam, the baby''s heart and her signs in one set') from signed;
select t.ok(r -> 'findings' = '[]'::jsonb, 'nothing found: ' || coalesce(r ->> 'findings', 'null')) from signed;
select t.landed(t.w(t.e('obgyn.labour_exam', :'pt', :'ward', '{"contractions":{"per_10":3}}', :'ex2', :'stay')), 'contractions alone (/ctx)');
select t.landed(t.w(t.e('obgyn.labour_exam', :'pt', :'ward', '{"cervix":10,"position":"op","liquor":"meconium","caput":"++"}', :'ex3', :'stay')), 'fully dilated');
select t.landed(t.w(t.e('obgyn.labour_exam', :'pt', :'ward', '{"para":1}', :'ex4', :'stay')), 'para alone');

\echo '── the lines'
select t.ok(t.entry(t.record(:'pt', :'ward'), :'ex1') ->> 'line' = 'Cervix 4 cm · head 5/5 · OA · membranes intact · moulding 0 · no caput · contractions 3 in 10 min, 30 s · G2 P1',
  'the exam: Cervix 4 cm · head 5/5 · OA · membranes intact · moulding 0 · no caput · contractions 3 in 10 min, 30 s · G2 P1');
select t.ok(t.entry(t.record(:'pt', :'ward'), :'fhr') ->> 'line' = 'Fetal heart rate: 140 bpm', 'the baby''s heart: Fetal heart rate: 140 bpm');
select t.ok(t.entry(t.record(:'pt', :'ward'), :'ex2') ->> 'line' = 'Contractions 3 in 10 min', 'contractions alone: Contractions 3 in 10 min');
select t.ok(t.entry(t.record(:'pt', :'ward'), :'ex3') ->> 'line' = 'Cervix 10 cm · OP · liquor meconium-stained · caput ++', 'Cervix 10 cm · OP · liquor meconium-stained · caput ++');
select t.ok(t.entry(t.record(:'pt', :'ward'), :'ex4') ->> 'line' = 'P1', 'para alone keeps its words: P1');
select t.ok(count(*) = 1 and bool_and((r ->> 'value')::numeric = 140 and r ->> 'ucum' = '/min'), 'the baby''s heart is in the values: 140 /min, LOINC 55283-6')
  from t.rows('base.values', :'ward', jsonb_build_object('patient_id', :'pt')) r where r ->> 'key' = 'value' and r ->> 'code' = 'loinc:55283-6';

\echo '── refused: an empty exam, a value out of its range, an unknown word; outside ObGyn'
select t.refused(t.w(t.e('obgyn.labour_exam', :'pt', :'ward', '{}', null, :'stay')), 'bad_shape', 'an exam that says nothing');
select t.refused(t.w(t.e('obgyn.labour_exam', :'pt', :'ward', '{"note":""}', null, :'stay')), 'bad_shape', 'an empty note alone');
select t.refused(t.w(t.e('obgyn.labour_exam', :'pt', :'ward', '{"cervix":11}', null, :'stay')), 'bad_shape', 'cervix 11');
select t.refused(t.w(t.e('obgyn.labour_exam', :'pt', :'ward', '{"descent":6}', null, :'stay')), 'bad_shape', 'the head 6/5');
select t.refused(t.w(t.e('obgyn.labour_exam', :'pt', :'ward', '{"position":"lsa"}', null, :'stay')), 'bad_shape', 'position lsa');
select t.refused(t.w(t.e('obgyn.labour_exam', :'pt', :'ward', '{"contractions":{"seconds":40}}', null, :'stay')), 'bad_shape', 'contractions with no count');
select t.refused(t.w(t.e('obgyn.labour_exam', :'pt', :'ward', '{"moulding":"4"}', null, :'stay')), 'bad_shape', 'moulding 4');
select t.refused(t.w(t.e('obgyn.labour_exam', :'pt', :'im', '{"cervix":4}')), 'not_allowed', 'Internal Medicine does not use ObGyn');

\echo '── FHIR: the exam an Observation with a component each; the baby''s heart the base''s, LOINC 55283-6'
select t.as(:'dr');
create temp table res as select e -> 'resource' r from jsonb_array_elements(public.read(jsonb_build_object('shape', 'fhir', 'patient_id', :'pt', 'department_id', :'ward')) -> 'entry') e;
reset role;
create function pg_temp.comp(r jsonb, p_text text) returns jsonb language sql immutable as $$
  select c from jsonb_array_elements(r -> 'component') c where c -> 'code' ->> 'text' = p_text
$$;
select t.ok(r -> 'code' ->> 'text' = 'Labour examination'
  and pg_temp.comp(r, 'Cervix') -> 'valueQuantity' @> '{"value":4,"code":"cm","system":"http://unitsofmeasure.org"}'
  and pg_temp.comp(r, 'Head, fifths above the brim') ->> 'valueString' = '5/5' and (pg_temp.comp(r, 'Gravida') ->> 'valueInteger')::int = 2
  and pg_temp.comp(r, 'Contraction length') -> 'valueQuantity' @> '{"value":30,"code":"s"}',
  'the exam: Labour examination; the cervix 4 cm and the contraction''s 30 s as quantities, the head 5/5, G2') from res where r ->> 'id' = :'ex1';
select t.ok(r -> 'code' -> 'coding' @> '[{"code":"55283-6"}]' and r -> 'valueQuantity' @> '{"value":140,"code":"/min"}',
  'the baby''s heart: LOINC 55283-6, 140 /min') from res where r ->> 'id' = :'fhr';
select t.report('labour', 'FHIR problem in ' || (r ->> 'resourceType') || '/' || (r ->> 'id') || ': ' || q) from res, unnest(core.fhir_problems(r)) q
 where r ->> 'resourceType' <> 'Bundle';
select t.ok(true, 'no resource has a FHIR problem');
select t.ok(not exists (select 1 from res, lateral jsonb_path_query(r, 'strict $.**.coding[*]') c
  where c ->> 'system' = 'http://loinc.org' and not exists (select 1 from core.codes x where x.system = 'loinc' and x.code = c ->> 'code')), 'every LOINC coding is a known code');
with refs as (select distinct v #>> '{}' ref from res, lateral jsonb_path_query(r, 'strict $.**.reference') v)
select t.report('labour', 'unresolved reference ' || ref) from refs where not exists (select 1 from res where (r ->> 'resourceType') || '/' || (r ->> 'id') = ref);
select t.ok(true, 'every reference resolves inside the bundle');
set role authenticated;

\echo '── the board: each stay''s exams with a cervix or G and P, the baby''s latest heart rate, the pregnancy; read-logged'
select t.as(:'nurse');
create function pg_temp.board(p_dept uuid) returns jsonb language sql as $$
  select public.pack_op(jsonb_build_object('op', 'obgyn.board', 'department_id', p_dept, 'args', '{}'::jsonb, 'purpose', 'TREAT'))
$$;
-- two more heart rates: 100 an hour ago, then 150 back-charted (signed last, but five hours ago): the board takes the latest in time
select t.landed(t.w(t.e('observation', :'pt', :'ward', '{"code":{"text":"Fetal heart rate","codings":[{"system":"loinc","code":"55283-6","display":"Fetal heart rate"}]},"value":{"quantity":{"value":"100","unit":"bpm","ucum":"/min"}}}',
  null, :'stay', p_extra => jsonb_build_object('occurred_at', now() - interval '1 hour'))), 'the baby''s heart 100 an hour ago');
select t.landed(t.w(t.e('observation', :'pt', :'ward', '{"code":{"text":"Fetal heart rate","codings":[{"system":"loinc","code":"55283-6","display":"Fetal heart rate"}]},"value":{"quantity":{"value":"150","unit":"bpm","ucum":"/min"}}}',
  null, :'stay', p_extra => jsonb_build_object('occurred_at', now() - interval '5 hours'))), 'the baby''s heart 150, back-charted to five hours ago');
select t.ok(jsonb_array_length(s -> 'exams') = 2 and (s -> 'exams' -> 0 ->> 'cervix')::numeric = 4 and (s -> 'exams' -> 0 ->> 'gravida')::int = 2
  and (s -> 'exams' -> 0 ->> 'descent')::int = 5 and (s -> 'exams' -> 0 ->> 'para')::int = 1
  and (s -> 'exams' -> 1 ->> 'cervix')::numeric = 10 and (s -> 'exams' -> 0 ->> 'at')::timestamptz < (s -> 'exams' -> 1 ->> 'at')::timestamptz,
  'two exams in time order, 4 cm with the head 5/5 and G2 P1, then 10 cm (contractions alone, or para alone, are left out)') from (select pg_temp.board(:'ward') -> 'stays' -> :'stay' s) x;
select t.ok((s -> 'fhr' ->> 'value')::numeric = 100 and s -> 'pregnancy' ->> 'lmp' = (current_date - 275)::text,
  'the baby''s latest heart rate in time, 100 (not the 150 signed after it for five hours ago); the pregnancy''s LMP')
  from (select pg_temp.board(:'ward') -> 'stays' -> :'stay' s) x;
select t.ok(pg_temp.board(:'ward') -> 'patient_ids' ? :'pt', 'the patient is named for the read log');
reset role;
select t.ok(exists (select 1 from core.read_log l where l.patient_id = :'pt' and l.purpose = 'TREAT' and l.what -> 'ops' ? 'obgyn.board'),
  'the read is logged for the patient, for treatment, naming the op');
set role authenticated;
select t.landed(t.w(t.e('crossed_out', :'pt', :'ward', '{"reason":"wrong_value"}', null, :'stay', null, null, :'ex3')), 'the 10 cm exam crossed out');
select t.ok(jsonb_array_length(s -> 'exams') = 1 and (s -> 'exams' -> 0 ->> 'cervix')::numeric = 4, 'crossed out, it leaves the board: the 4 cm exam alone')
  from (select pg_temp.board(:'ward') -> 'stays' -> :'stay' s) x;
select t.refuses(format($q$select public.pack_op(jsonb_build_object('op','obgyn.board','department_id',%L))$q$, :'im'), 'not_used_here');
select t.as(:'rec');
select t.refuses(format($q$select public.pack_op(jsonb_build_object('op','obgyn.board','department_id',%L))$q$, :'ward'), 'not_allowed');

\echo '── the clinic turns the pack off: an exam is refused, the base''s observation still lands'
select t.as(:'ow');
select public.write_setting('{"key":"organization.packs_used","data":{"packs":["pharmacy"]}}') ->> 'key' as off;
select t.as(:'nurse');
select t.refused(t.w(t.e('obgyn.labour_exam', :'pt', :'ward', '{"cervix":5}', null, :'stay')), 'pack_off', 'the clinic no longer uses ObGyn');
select t.landed(t.w(t.e('observation', :'pt', :'ward', '{"code":{"text":"Fetal heart rate","codings":[{"system":"loinc","code":"55283-6","display":"Fetal heart rate"}]},"value":{"quantity":{"value":"138","unit":"bpm","ucum":"/min"}}}',
  null, :'stay')), 'the baby''s heart, the base''s observation, still lands');
select t.as(null);
