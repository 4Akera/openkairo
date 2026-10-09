-- ObGyn's labour ward (spec §5.6), piece L1: the pack as the clinics' build declared it (its block, the Obstetrician and the Midwife);
-- the labour examination, its line and its FHIR; the baby's heart as the base's observation (LOINC 55283-6); the partograph's setting;
-- the Midwife's actions; the labour ward's starter setup; the board's read of each stay's exams, the baby's heart and the pregnancy
-- through the pack's own op; refused where the department or the clinic does not use the pack, while the base's observation still lands.
-- Piece L2b: the birth (obgyn.birth: its line, check and FHIR), Apgar as a declared score, write:obgyn.birth and manage:patients for the
-- Midwife and the Obstetrician; one Done with the mother's birth, oxytocin and pregnancy's end and each baby's record, stay, weight,
-- Apgar and doses (the owner's Q10), twins; all or nothing when refused; the board's birth and baby words.
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
\set baby  '00000000-0000-0000-0000-00000000e811'
\set bstay '00000000-0000-0000-0000-00000000e812'
\set bir   '00000000-0000-0000-0000-00000000e813'
\set oxy   '00000000-0000-0000-0000-00000000e814'
\set apg1  '00000000-0000-0000-0000-00000000e815'
\set apg5  '00000000-0000-0000-0000-00000000e816'
\set vk    '00000000-0000-0000-0000-00000000e817'
\set baby2 '00000000-0000-0000-0000-00000000e821'
\set bstay2 '00000000-0000-0000-0000-00000000e822'
\set bir2  '00000000-0000-0000-0000-00000000e823'
\set baby3 '00000000-0000-0000-0000-00000000e831'
\set bstay3 '00000000-0000-0000-0000-00000000e832'
\set bad1  '00000000-0000-0000-0000-00000000e841'
\set bad2  '00000000-0000-0000-0000-00000000e842'
\set bad3  '00000000-0000-0000-0000-00000000e843'
\set bad4  '00000000-0000-0000-0000-00000000e844'
\set bad5  '00000000-0000-0000-0000-00000000e845'
\set bad6  '00000000-0000-0000-0000-00000000e846'
\set bad7  '00000000-0000-0000-0000-00000000e847'
\set bad8  '00000000-0000-0000-0000-00000000e848'
\set bad9  '00000000-0000-0000-0000-00000000e849'
\set bad10 '00000000-0000-0000-0000-00000000e84a'
\set bad11 '00000000-0000-0000-0000-00000000e84b'
\set mw    '11111111-0000-0000-0000-0000000000bc'
\set mwu   '00000000-0000-0000-0000-0000000000bc'
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

\echo '── (n) the birth: the pack''s own type, a Procedure with its check and FHIR; write:obgyn.birth the Midwife''s and the Obstetrician''s, with manage:patients'
reset role;
select t.ok(y.resources = array['Procedure'] and cardinality(y.checks) = 1 and y.to_fhir is not null and not y.may_be_private and not y.other_patient,
  'obgyn.birth v1: a Procedure, one check, its FHIR mapping, not private, no other patient') from core.types y where y.key = 'obgyn.birth' and y.version = 1;
select t.ok(not a.everyday and a.scope = 'department', 'write:obgyn.birth: by department, not everyday') from core.actions a where a.key = 'write:obgyn.birth';
select t.ok(core.gives(:'org', :'d302', 'write:obgyn.birth', :'ward') and core.gives(:'org', :'d301', 'write:obgyn.birth', :'ward')
  and not core.gives(:'org', '00000000-0000-0000-0000-00000000c003', 'write:obgyn.birth', :'ward'), 'the Midwife and the Obstetrician sign a birth; the base''s Nurse does not');
select t.ok(core.gives(:'org', :'d302', 'manage:patients', :'ward') and core.gives(:'org', :'d301', 'manage:patients', :'ward'), 'both register patients on the ward (awaiting the owner)');
select t.ok(core.gives(:'org', :'d302', 'manage:patients', :'im') and not core.gives(:'org', :'d302', 'write:obgyn.birth', :'im'),
  'manage:patients is a core action: the Midwife holds it wherever her role is, where ObGyn is not used too (awaiting the owner)');

\echo '── (o) Apgar (1953) as a declared score: five signs 0–2, bands low, moderate, reassuring'
select t.ok(s.version = '1953' and s.alias = 'apgar' and s.short = 'Apgar'
  and (select array_agg(i ->> 'key' order by n) from jsonb_array_elements(s.items) with ordinality x(i, n)) = array['colour', 'heart', 'grimace', 'activity', 'breathing']
  and (select array_agg(concat_ws(' ', b ->> 'key', b ->> 'min', b ->> 'max', coalesce(b ->> 'tone', 'none')) order by n) from jsonb_array_elements(s.bands) with ordinality x(b, n))
    = array['low 0 3 danger', 'moderate 4 6 warn', 'reassuring 7 10 none'], 'obgyn.apgar 1953, alias apgar: colour, heart, grimace, activity, breathing; 0–3 low, 4–6 moderate, 7–10 reassuring')
  from core.scores s where s.key = 'obgyn.apgar';
create function pg_temp.apgar(c text, h text, g text, a text, b text) returns jsonb language sql stable as $$
  select core.score('obgyn.apgar', '1953', jsonb_build_object('colour', c, 'heart', h, 'grimace', g, 'activity', a, 'breathing', b))
$$;
select t.ok((pg_temp.apgar('2', '2', '2', '2', '2') ->> 'total')::int = 10 and pg_temp.apgar('2', '2', '2', '2', '2') -> 'band' ->> 'key' = 'reassuring'
  and (pg_temp.apgar('1', '2', '2', '1', '2') ->> 'total')::int = 8
  and (pg_temp.apgar('1', '1', '1', '1', '1') ->> 'total')::int = 5 and pg_temp.apgar('1', '1', '1', '1', '1') -> 'band' ->> 'key' = 'moderate'
  and (pg_temp.apgar('0', '1', '0', '1', '1') ->> 'total')::int = 3 and pg_temp.apgar('0', '1', '0', '1', '1') -> 'band' ->> 'key' = 'low',
  'Apgar 10 reassuring, 8, 5 moderate, 3 low');

\echo '── (p) a midwife signs a birth: one Done with the mother''s birth, oxytocin and pregnancy''s end, and the baby''s record, stay, weight, Apgar and dose'
select t.as(:'ow');
select public.save('user', jsonb_build_object('id', :'mwu', 'name', 'Midwife Nagla', 'login_id', :'mw',
  'holdings', jsonb_build_array(jsonb_build_object('role_id', :'d302', 'department_id', :'ward')))) is not null as midwife;
set role authenticated;
-- one set through the one door, with the newborns it makes
create function pg_temp.born(p_entries jsonb, p_patients jsonb, p_seen jsonb default '{}') returns jsonb language sql as $$
  select public.write(jsonb_build_object('set_id', gen_random_uuid(), 'made_at', clock_timestamp(), 'entries', p_entries, 'confirmed', '[]'::jsonb, 'seen', p_seen,
    'patients', p_patients))
$$;
-- a newborn as the card names it: Mona's, born today in the clinic's day, on the ward
create function pg_temp.np(p_id uuid, p_name text, p_gender text) returns jsonb language sql stable as $$
  select jsonb_build_object('id', p_id, 'mother', '00000000-0000-0000-0000-0000000000f2', 'full_name', p_name, 'gender', p_gender,
    'birth_date', ((now() at time zone 'Africa/Cairo')::date)::text, 'department_id', '00000000-0000-0000-0000-0000000000d6')
$$;
-- the birth of Mona in her stay, and a baby's stay opened in the same set (a bed, or none)
create function pg_temp.birth(p_data jsonb, p_id uuid default null, p_at timestamptz default now() - interval '10 minutes') returns jsonb language sql stable as $$
  select t.e('obgyn.birth', '00000000-0000-0000-0000-0000000000f2', '00000000-0000-0000-0000-0000000000d6', p_data, p_id, '00000000-0000-0000-0000-00000000e801',
    p_extra => jsonb_build_object('occurred_at', p_at))
$$;
create function pg_temp.baby(p_id uuid, p_sex text, p_grams int, p_at timestamptz default now() - interval '10 minutes') returns jsonb language sql stable as $$
  select jsonb_build_object('patient', jsonb_build_object('to', 'patient', 'id', p_id), 'born_at', p_at, 'sex', p_sex, 'grams', p_grams, 'breathing', 'cried')
$$;
create function pg_temp.admit(p_baby uuid, p_stay uuid, p_bed uuid default null) returns jsonb language sql as $$
  select t.e('admitted', p_baby, '00000000-0000-0000-0000-0000000000d6', jsonb_strip_nulls(jsonb_build_object('department_id', '00000000-0000-0000-0000-0000000000d6',
    'place_id', p_bed, 'admit_source', 'born', 'reason', 'born here')), p_stay, p_stay)
$$;
create function pg_temp.score(p_baby uuid, p_stay uuid, p_inputs jsonb, p_total int, p_note text, p_id uuid default null) returns jsonb language sql as $$
  select t.e('score', p_baby, '00000000-0000-0000-0000-0000000000d6', jsonb_build_object('score', 'obgyn.apgar', 'version', '1953', 'inputs', p_inputs,
    'total', p_total, 'band', 'reassuring', 'note', p_note), p_id, p_stay,
    p_extra => jsonb_build_object('occurred_at', now() - interval '10 minutes' + case p_note when '1 min' then interval '1 minute' else interval '5 minutes' end))
$$;
select t.as(:'mw');
create temp table p_out as select pg_temp.born(jsonb_build_array(
  pg_temp.birth(jsonb_build_object('mode', 'normal', 'perineum', 'second', 'repaired', true, 'placenta', 'complete',
    'blood_loss', '{"value":"350","unit":"mL","ucum":"mL"}'::jsonb, 'delivered_by', jsonb_build_object('to', 'user', 'id', :'mwu'),
    'babies', jsonb_build_array(pg_temp.baby(:'baby', 'female', 3100))), :'bir'),
  t.e('given', :'pt', :'ward', '{"drug":{"text":"Oxytocin","codings":[]},"dose":{"value":"10","unit":"units","ucum":"[iU]"},"route":"im","status":"completed"}', :'oxy', :'stay'),
  t.e('pregnancy', :'pt', :'ward', jsonb_build_object('status', 'ended', 'pregnant', true, 'lmp', jsonb_build_object('value', (current_date - 275)::text, 'precision', 'day'),
    'reason', 'delivered'), null, :'stay', :'preg', 'changes'),
  pg_temp.admit(:'baby', :'bstay', '00000000-0000-0000-0000-000000000004'),
  t.e('vitals', :'baby', :'ward', '{"weight":{"value":"3.1","unit":"kg","ucum":"kg"}}', null, :'bstay'),
  pg_temp.score(:'baby', :'bstay', '{"colour":"1","heart":"2","grimace":"2","activity":"1","breathing":"2"}', 8, '1 min', :'apg1'),
  pg_temp.score(:'baby', :'bstay', '{"colour":"2","heart":"2","grimace":"2","activity":"1","breathing":"2"}', 9, '5 min', :'apg5'),
  t.e('given', :'baby', :'ward', '{"drug":{"text":"Vitamin K (phytomenadione)"},"dose":{"value":"1","unit":"mg","ucum":"mg"},"route":"im","status":"completed"}', :'vk', :'bstay')),
  jsonb_build_array(pg_temp.np(:'baby', 'Baby of Mona Ali Fathy', 'female')), jsonb_build_object(:'preg', 1)) r;
select t.landed(r, 'the birth''s Done lands, the baby''s record made in it') from p_out;
select t.ok(r -> 'findings' = '[]'::jsonb and r -> 'patients' @> jsonb_build_array(jsonb_build_object('id', :'baby')), 'nothing found; the outcome names the baby: ' || coalesce(r ->> 'findings', 'null')) from p_out;
select t.ok(t.entry(t.record(:'pt', :'ward'), :'bir') ->> 'line' = 'Birth · normal · girl 3100 g · perineum: 2nd degree, repaired · placenta complete · blood loss 350 mL',
  'the birth: Birth · normal · girl 3100 g · perineum: 2nd degree, repaired · placenta complete · blood loss 350 mL');
select t.ok(t.entry(t.record(:'baby', :'ward'), :'apg1') ->> 'line' = 'Apgar 8, 1953 · Reassuring', 'the Apgar: Apgar 8, 1953 · Reassuring');
reset role;
select t.ok(exists (select 1 from core.patient_relations r where r.patient_id = :'pt' and r.relation = 'mother_of' and r.other_id = :'baby'), 'Mona is "mother of" the baby');
select t.ok(state = 'admitted' and place_id = '00000000-0000-0000-0000-000000000004', 'the baby''s own stay, in bed 4') from base.presence where patient_id = :'baby';
select t.ok(e.data ->> 'status' = 'ended' and e.data ->> 'reason' = 'delivered', 'her pregnancy''s latest version: ended, delivered') from core.entries e
 where e.item = :'preg' order by e.item_version desc limit 1;
set role authenticated;

\echo '── (q) twins: one birth, two babies, each its own record and stay (one in bed 2, one with no bed)'
create temp table q_out as select pg_temp.born(jsonb_build_array(
  pg_temp.birth(jsonb_build_object('mode', 'normal', 'babies', jsonb_build_array(pg_temp.baby(:'baby2', 'female', 2400, now() - interval '3 hours'),
    pg_temp.baby(:'baby3', 'male', 2550, now() - interval '3 hours'))), :'bir2', now() - interval '3 hours'),
  pg_temp.admit(:'baby2', :'bstay2', '00000000-0000-0000-0000-000000000002'), pg_temp.admit(:'baby3', :'bstay3')),
  jsonb_build_array(pg_temp.np(:'baby2', 'Baby 1 of Mona Ali Fathy', 'female'), pg_temp.np(:'baby3', 'Baby 2 of Mona Ali Fathy', 'male'))) r;
select t.landed(r, 'the twins'' Done lands') from q_out;
select t.ok((select array_agg(x ->> 'id' order by n) from jsonb_array_elements(r -> 'patients') with ordinality y(x, n)) = array[:'baby2', :'baby3'], 'the outcome names both babies')
  from q_out;
select t.ok(t.entry(t.record(:'pt', :'ward'), :'bir2') ->> 'line' = 'Birth · normal · twins: girl 2400 g, boy 2550 g', 'the line: Birth · normal · twins: girl 2400 g, boy 2550 g');
reset role;
select t.ok(count(*) = 3, 'three "mother of" relations now') from core.patient_relations r where r.patient_id = :'pt' and r.relation = 'mother_of';
select t.ok(bool_and(case patient_id when :'baby3' then place_id is null else place_id = '00000000-0000-0000-0000-000000000002' end) and count(*) = 2,
  'the twins'' stays: bed 2, and one with no bed') from base.presence where patient_id in (:'baby2', :'baby3') and state = 'admitted';
set role authenticated;

\echo '── (q2) a caesarean''s oxytocin as the card writes it: 5 units slow IV'
select t.ok(r ->> 'outcome' = 'landed' and r -> 'findings' = '[]'::jsonb, 'oxytocin 5 units IV, slow IV, lands with nothing found: ' || coalesce(r ->> 'findings', r::text))
  from (select t.w(t.e('given', :'pt', :'ward', '{"drug":{"text":"Oxytocin","codings":[]},"dose":{"value":"5","unit":"units","ucum":"[iU]"},"route":"iv","note":"slow IV","status":"completed"}',
    null, :'stay')) r) x;

\echo '── (r) refused, all or nothing: no baby''s record is left behind'
select t.refused(pg_temp.born(jsonb_build_array(pg_temp.birth(jsonb_build_object('mode', 'caesarean', 'perineum', 'first', 'babies', jsonb_build_array(pg_temp.baby(:'bad1', 'female', 3000)))),
  pg_temp.admit(:'bad1', gen_random_uuid())), jsonb_build_array(pg_temp.np(:'bad1', 'Baby of Mona Ali Fathy', 'female'))), 'perineum_after_caesarean', 'a perineum after a caesarean');
select t.refused(pg_temp.born(jsonb_build_array(pg_temp.birth(jsonb_build_object('mode', 'normal', 'delivered_by', jsonb_build_object('to', 'patient', 'id', :'pt'),
  'babies', jsonb_build_array(pg_temp.baby(:'bad2', 'female', 3000)))), pg_temp.admit(:'bad2', gen_random_uuid())),
  jsonb_build_array(pg_temp.np(:'bad2', 'Baby of Mona Ali Fathy', 'female'))), 'wrong_reference', 'delivered by a patient');
select t.refused(pg_temp.born(jsonb_build_array(pg_temp.birth(jsonb_build_object('mode', 'normal', 'babies', jsonb_build_array(jsonb_build_object('patient', jsonb_build_object('to', 'user', 'id', :'mwu'),
  'born_at', now() - interval '10 minutes', 'sex', 'female')))), pg_temp.admit(:'bad3', gen_random_uuid())),
  jsonb_build_array(pg_temp.np(:'bad3', 'Baby of Mona Ali Fathy', 'female'))), 'wrong_reference', 'a baby that is a user');
select t.refused(pg_temp.born(jsonb_build_array(pg_temp.birth(jsonb_build_object('mode', 'normal', 'blood_loss', '{"value":"0.4","unit":"L","ucum":"L"}'::jsonb,
  'babies', jsonb_build_array(pg_temp.baby(:'bad4', 'female', 3000)))), pg_temp.admit(:'bad4', gen_random_uuid())),
  jsonb_build_array(pg_temp.np(:'bad4', 'Baby of Mona Ali Fathy', 'female'))), 'blood_loss_unit', 'the blood loss in litres');
select t.refused(pg_temp.born(jsonb_build_array(pg_temp.birth(jsonb_build_object('mode', 'normal', 'blood_loss', '{"value":"-50","unit":"mL","ucum":"mL"}'::jsonb,
  'babies', jsonb_build_array(pg_temp.baby(:'bad7', 'female', 3000)))), pg_temp.admit(:'bad7', gen_random_uuid())),
  jsonb_build_array(pg_temp.np(:'bad7', 'Baby of Mona Ali Fathy', 'female'))), 'blood_loss_unit', 'a blood loss of -50 mL');
select t.refused(pg_temp.born(jsonb_build_array(pg_temp.birth(jsonb_build_object('mode', 'caesarean', 'episiotomy', true, 'babies', jsonb_build_array(pg_temp.baby(:'bad8', 'female', 3000)))),
  pg_temp.admit(:'bad8', gen_random_uuid())), jsonb_build_array(pg_temp.np(:'bad8', 'Baby of Mona Ali Fathy', 'female'))), 'perineum_after_caesarean', 'an episiotomy at a caesarean');
select t.refused(pg_temp.born(jsonb_build_array(pg_temp.birth(jsonb_build_object('mode', 'caesarean', 'repaired', true, 'babies', jsonb_build_array(pg_temp.baby(:'bad9', 'female', 3000)))),
  pg_temp.admit(:'bad9', gen_random_uuid())), jsonb_build_array(pg_temp.np(:'bad9', 'Baby of Mona Ali Fathy', 'female'))), 'perineum_after_caesarean', 'a repair at a caesarean');
select t.refused(pg_temp.born(jsonb_build_array(pg_temp.birth(jsonb_build_object('mode', 'normal', 'perineum', 'intact', 'episiotomy', true,
  'babies', jsonb_build_array(pg_temp.baby(:'bad10', 'female', 3000)))), pg_temp.admit(:'bad10', gen_random_uuid())),
  jsonb_build_array(pg_temp.np(:'bad10', 'Baby of Mona Ali Fathy', 'female'))), 'perineum_intact', 'an episiotomy on an intact perineum');
select t.refused(pg_temp.born(jsonb_build_array(pg_temp.birth(jsonb_build_object('mode', 'normal', 'babies', jsonb_build_array(pg_temp.baby(:'bad11', 'female', 3000), pg_temp.baby(:'pt', 'male', 3000)))),
  pg_temp.admit(:'bad11', gen_random_uuid())), jsonb_build_array(pg_temp.np(:'bad11', 'Baby of Mona Ali Fathy', 'female'))), 'wrong_reference', 'a baby that is the mother');
select t.refused(pg_temp.born(jsonb_build_array(pg_temp.birth(jsonb_build_object('mode', 'normal', 'babies', jsonb_build_array(pg_temp.baby(:'bad11', 'female', 3000), pg_temp.baby(:'bad11', 'female', 3000)))),
  pg_temp.admit(:'bad11', gen_random_uuid())), jsonb_build_array(pg_temp.np(:'bad11', 'Baby of Mona Ali Fathy', 'female'))), 'wrong_reference', 'the same baby listed twice');
select t.refused(pg_temp.born(jsonb_build_array(pg_temp.birth(jsonb_build_object('mode', 'normal', 'babies', jsonb_build_array(pg_temp.baby(:'bad5', 'female', 3000)))),
  pg_temp.admit(:'bad5', :'bad5'),
  pg_temp.score(:'bad5', :'bad5', '{"colour":"1","heart":"2","grimace":"2","activity":"1","breathing":"2"}', 9, '1 min')),
  jsonb_build_array(pg_temp.np(:'bad5', 'Baby of Mona Ali Fathy', 'female'))), 'score_mismatch', 'an Apgar of 9 for signs worth 8');
select t.as(:'nurse');
select t.refused(pg_temp.born(jsonb_build_array(pg_temp.birth(jsonb_build_object('mode', 'normal', 'babies', jsonb_build_array(pg_temp.baby(:'bad6', 'female', 3000)))),
  pg_temp.admit(:'bad6', gen_random_uuid())), jsonb_build_array(pg_temp.np(:'bad6', 'Baby of Mona Ali Fathy', 'female'))), 'not_allowed', 'the base''s Nurse');
reset role;
select t.ok(count(*) = 0, 'none of the refused sets left a record') from core.patients
 where id in (:'bad1', :'bad2', :'bad3', :'bad4', :'bad5', :'bad6', :'bad7', :'bad8', :'bad9', :'bad10', :'bad11');
set role authenticated;

\echo '── (s) FHIR: the delivery a Procedure recorded and performed by the midwife (she delivered and signed it); the baby''s own export valid too'
select t.as(:'dr');
create temp table res2 as select e -> 'resource' r from jsonb_array_elements(public.read(jsonb_build_object('shape', 'fhir', 'patient_id', :'pt', 'department_id', :'ward')) -> 'entry') e;
create temp table bres as select e -> 'resource' r from jsonb_array_elements(public.read(jsonb_build_object('shape', 'fhir', 'patient_id', :'baby', 'department_id', :'ward')) -> 'entry') e;
reset role;
select t.ok(r ->> 'resourceType' = 'Procedure' and r -> 'code' ->> 'text' = 'Delivery, normal' and r ->> 'status' = 'completed'
  and r -> 'outcome' ->> 'text' = 'Birth · normal · girl 3100 g · perineum: 2nd degree, repaired · placenta complete · blood loss 350 mL'
  and r -> 'recorder' ->> 'reference' = 'PractitionerRole/' || :'mwu' and r -> 'performer' -> 0 -> 'actor' ->> 'reference' = 'PractitionerRole/' || :'mwu',
  'the birth: a Procedure, Delivery, normal, completed, its line as the outcome, the midwife recording and performing') from res2 where r ->> 'id' = :'bir';
select t.ok(not (r ? 'performer') and r -> 'recorder' ->> 'reference' = 'PractitionerRole/' || :'mwu',
  'the twins'' birth (no one named as delivering): recorded by the midwife, no performer') from res2 where r ->> 'id' = :'bir2';
select t.report('labour', 'FHIR problem in ' || (r ->> 'resourceType') || '/' || (r ->> 'id') || ': ' || q) from (select r from res2 union all select r from bres) x, unnest(core.fhir_problems(r)) q
 where r ->> 'resourceType' <> 'Bundle';
select t.ok(true, 'no resource of the mother''s or the baby''s has a FHIR problem');
with refs as (select distinct v #>> '{}' ref from res2, lateral jsonb_path_query(r, 'strict $.**.reference') v)
select t.report('labour', 'unresolved reference ' || ref) from refs where not exists (select 1 from res2 where (r ->> 'resourceType') || '/' || (r ->> 'id') = ref);
with refs as (select distinct v #>> '{}' ref from bres, lateral jsonb_path_query(r, 'strict $.**.reference') v)
select t.report('labour', 'unresolved reference in the baby''s ' || ref) from refs where not exists (select 1 from bres where (r ->> 'resourceType') || '/' || (r ->> 'id') = ref);
select t.ok(true, 'every reference resolves inside each bundle');
set role authenticated;

\echo '── (t) the board: the mother''s stay has her birth; the baby''s stay its Apgar, weight and doses'
select t.as(:'nurse');
select t.ok(s -> 'birth' ->> 'mode' = 'normal' and (s -> 'birth' ->> 'blood_loss')::numeric = 350 and jsonb_array_length(s -> 'birth' -> 'babies') = 1
    and s -> 'birth' -> 'babies' -> 0 @> '{"sex":"female","grams":3100}',
  'Mona''s stay: her birth, normal, 350 mL, a girl 3100 g') from (select pg_temp.board(:'ward') -> 'stays' -> :'stay' s) x;
select t.ok(s -> 'baby' -> 'apgar' = '[{"note":"1 min","total":8},{"note":"5 min","total":9}]'::jsonb and (s -> 'baby' ->> 'kg')::numeric = 3.1
  and s -> 'baby' -> 'given' @> '[{"drug":"Vitamin K (phytomenadione)"}]' and jsonb_array_length(s -> 'baby' -> 'given') = 1,
  'the baby''s stay: Apgar 8 at 1 min and 9 at 5, 3.1 kg, vitamin K given') from (select pg_temp.board(:'ward') -> 'stays' -> :'bstay' s) x;
select t.ok(s -> 'baby' -> 'apgar' = '[]'::jsonb and not (s ? 'birth'), 'a twin with no Apgar is still a baby''s stay on the board')
  from (select pg_temp.board(:'ward') -> 'stays' -> :'bstay3' s) x;
select t.ok(pg_temp.board(:'ward') -> 'patient_ids' @> jsonb_build_array(:'pt', :'baby'), 'the board names the mother and the baby for the read log');

\echo '── the clinic turns the pack off: an exam is refused, the base''s observation still lands'
select t.as(:'ow');
select public.write_setting('{"key":"organization.packs_used","data":{"packs":["pharmacy"]}}') ->> 'key' as off;
select t.as(:'nurse');
select t.refused(t.w(t.e('obgyn.labour_exam', :'pt', :'ward', '{"cervix":5}', null, :'stay')), 'pack_off', 'the clinic no longer uses ObGyn');
select t.landed(t.w(t.e('observation', :'pt', :'ward', '{"code":{"text":"Fetal heart rate","codings":[{"system":"loinc","code":"55283-6","display":"Fetal heart rate"}]},"value":{"quantity":{"value":"138","unit":"bpm","ucum":"/min"}}}',
  null, :'stay')), 'the baby''s heart, the base''s observation, still lands');
select t.as(null);
