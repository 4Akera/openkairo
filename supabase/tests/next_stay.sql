-- one Done passes a stay to the next department (spec §4.2, §4.4; the owner's Q3, 2026-10-08): the presence check reads the whole set.
-- A stay the set discharges no longer blocks the next department's admission, which is about it and in another department; a second
-- stay the set opens does count; all or nothing. The base alone: an Emergency made here as a department of beds, with no pack.
\set im   '00000000-0000-0000-0000-0000000000d1'
\set desk '00000000-0000-0000-0000-0000000000d4'
\set ward '00000000-0000-0000-0000-0000000000d6'
\set er   '00000000-0000-0000-0000-0000000000d7'
\set bay1 '00000000-0000-0000-0000-000000000011'
\set bay2 '00000000-0000-0000-0000-000000000012'
\set bed1 '00000000-0000-0000-0000-000000000001'
\set pt   '00000000-0000-0000-0000-0000000000f1'
\set p2   '00000000-0000-0000-0000-0000000000f2'
\set p3   '00000000-0000-0000-0000-0000000000f3'
\set s1   '00000000-0000-0000-0000-00000000e101'
\set s2   '00000000-0000-0000-0000-00000000e102'
\set s3   '00000000-0000-0000-0000-00000000e103'
\set s4   '00000000-0000-0000-0000-00000000e104'
\set s5   '00000000-0000-0000-0000-00000000e105'
\set v9   '00000000-0000-0000-0000-00000000e109'
\set n1   '00000000-0000-0000-0000-00000000e120'
\set n2   '00000000-0000-0000-0000-00000000e121'
\set n3   '00000000-0000-0000-0000-00000000e122'
\set n4   '00000000-0000-0000-0000-00000000e123'
\set n5   '00000000-0000-0000-0000-00000000e124'
\set n6   '00000000-0000-0000-0000-00000000e125'
\set n7   '00000000-0000-0000-0000-00000000e126'
\set n8   '00000000-0000-0000-0000-00000000e127'
\set n9   '00000000-0000-0000-0000-00000000e128'
\set n10  '00000000-0000-0000-0000-00000000e129'
\set s6   '00000000-0000-0000-0000-00000000e106'
\set g6   '00000000-0000-0000-0000-00000000e130'
\set ow   '11111111-0000-0000-0000-0000000000b9'
\set dr   '11111111-0000-0000-0000-0000000000b1'
\set rc   '11111111-0000-0000-0000-0000000000b4'
-- s1 pt in the ER; s2 pt on the ward, from s1; s3 p2 in the ER; s4 p2 on the ward, from s3 (the set written the other way round);
-- s5 p3 in the ER, the refused sets; v9 p3's clinic visit in IM (an item that is not his ER stay); n1–n10 the refused admissions' ids;
-- s6 p3 on the ward, from s5, about the discharge g6 written in the same set
select t.fixture();
select t.as(:'ow');
select public.save('department', jsonb_build_object('id', :'er', 'name', 'Emergency', 'work', 'stays')) ->> 'id' as er;
select public.save('place', jsonb_build_object('id', :'bay1', 'department_id', :'er', 'name', 'Resus 1', 'position', 1)) ->> 'id' as bay1;
select public.save('place', jsonb_build_object('id', :'bay2', 'department_id', :'er', 'name', 'Resus 2', 'position', 2)) ->> 'id' as bay2;
select public.write_setting(jsonb_build_object('key', 'department.encounter_class', 'owner_id', :'er', 'data', '{"class":"EMER"}'::jsonb)) ->> 'key' as emer;
select public.save('user', jsonb_build_object('id', '00000000-0000-0000-0000-0000000000b1', 'holdings', jsonb_build_array(
  jsonb_build_object('role_id', '00000000-0000-0000-0000-00000000c002', 'department_id', :'im'),
  jsonb_build_object('role_id', '00000000-0000-0000-0000-00000000c002', 'department_id', :'ward'),
  jsonb_build_object('role_id', '00000000-0000-0000-0000-00000000c002', 'department_id', :'er')))) ->> 'id' as dr_in_the_er;
set role authenticated;
select t.as(:'rc');
select t.ok(public.save_patient(jsonb_build_object('department_id', :'desk', 'patient', jsonb_build_object('id', :'p2',
  'given', jsonb_build_array('Mona'), 'family', 'Saeed', 'gender', 'female', 'birth_date', '1980-05-02'))) -> 'patient' ->> 'id' = :'p2', 'Mona Saeed registered');
select t.ok(public.save_patient(jsonb_build_object('department_id', :'desk', 'patient', jsonb_build_object('id', :'p3',
  'given', jsonb_build_array('Tarek'), 'family', 'Wahba', 'gender', 'male', 'birth_date', '1975-11-20'))) -> 'patient' ->> 'id' = :'p3', 'Tarek Wahba registered');
select t.landed(t.check_in(:'v9', :'p3', :'desk', :'im'), 'p3 checked in to Internal Medicine');
select t.as(:'dr');

\echo '── in the ER: three emergency stays, as any department of beds takes them'
select t.landed(t.w(t.e('admitted', :'pt', :'er', jsonb_build_object('admit_source', 'other', 'place_id', :'bay1', 'reason', 'breathless'), :'s1', :'s1')),
  'Ahmed in Resus 1');
select t.landed(t.w(t.e('admitted', :'p2', :'er', jsonb_build_object('admit_source', 'other', 'place_id', :'bay2', 'reason', 'chest pain'), :'s3', :'s3')),
  'Mona in Resus 2');
select t.refused(t.w(jsonb_build_array(
  t.e('admitted', :'p3', :'er', '{"admit_source":"other","reason":"fall"}', :'n9', :'n9'),
  t.e('admitted', :'p3', :'er', '{"admit_source":"other","reason":"fall"}', :'n10', :'n10'))), 'already_admitted',
  'two stays opened in one set, with no discharge: each sees the other');
select t.landed(t.w(t.e('admitted', :'p3', :'er', '{"admit_source":"other","reason":"fall"}', :'s5', :'s5')), 'Tarek in the ER, no bay');
select t.refused(t.w(t.e('admitted', :'pt', :'er', jsonb_build_object('department_id', :'ward', 'admit_source', 'emd'), :'n1', :'n1')), 'already_admitted',
  'the base as it was: the ward''s admission alone, while the ER stay is open');

\echo '── one Done: the ER''s discharge and the ward''s admission about it'
select t.landed(t.w(jsonb_build_array(
  t.e('discharged', :'pt', :'er', '{"disposition":"oth","note":"to Ward"}', gen_random_uuid(), :'s1', t.latest(:'s1'), 'changes'),
  t.e('admitted', :'pt', :'er', jsonb_build_object('department_id', :'ward', 'place_id', :'bed1', 'admit_source', 'emd', 'reason', 'pneumonia'),
      :'s2', :'s2', :'s1', 'about'))), 'one Done passes the stay to the ward');
select t.ok(count(*) = 2
  and bool_and(coalesce(case r ->> 'item'
    when :'s1' then r ->> 'state' = 'discharged' and r ->> 'ended_at' is not null
    when :'s2' then r ->> 'state' = 'admitted' and r ->> 'department_id' = :'ward' and r ->> 'place_id' = :'bed1' and r ->> 'came_from' = :'s1'
                    and r ->> 'from_department_id' = :'er' end, false)),
  'the ER stay discharged and ended; the ward stay admitted in bed 1, came from the ER stay, from the ER')
  from t.rows('base.presence', :'er', jsonb_build_object('item', jsonb_build_array(:'s1', :'s2'))) r;
select t.refused(t.w(t.e('admitted', :'pt', :'er', jsonb_build_object('department_id', :'ward', 'admit_source', 'emd'), :'n2', :'n2')), 'already_admitted',
  'still one stay at a time: now the ward stay is the open one');

\echo '── the order inside the set does not matter: the admission first, the discharge after'
select t.landed(t.w(jsonb_build_array(
  t.e('admitted', :'p2', :'er', jsonb_build_object('department_id', :'ward', 'admit_source', 'emd', 'reason', 'chest pain'), :'s4', :'s4', :'s3', 'about'),
  t.e('discharged', :'p2', :'er', '{"disposition":"oth","note":"to Ward"}', gen_random_uuid(), :'s3', t.latest(:'s3'), 'changes'))),
  'the admission written before the discharge lands too');
select t.ok(count(*) = 2
  and bool_and(coalesce(case r ->> 'item'
    when :'s3' then r ->> 'state' = 'discharged'
    when :'s4' then r ->> 'state' = 'admitted' and r ->> 'came_from' = :'s3' and r ->> 'place_id' is null end, false)),
  'Mona''s ER stay discharged; her ward stay admitted, from it, with no bed yet (the ward chooses)')
  from t.rows('base.presence', :'er', jsonb_build_object('item', jsonb_build_array(:'s3', :'s4'))) r;

\echo '── refused, and nothing of it lands (all or nothing)'
select t.refused(t.w(jsonb_build_array(
  t.e('discharged', :'p3', :'er', '{"disposition":"oth","note":"to Ward"}', gen_random_uuid(), :'s5', t.latest(:'s5'), 'changes'),
  t.e('admitted', :'p3', :'er', jsonb_build_object('department_id', :'ward', 'admit_source', 'emd'), :'n3', :'n3'))), 'not_linked',
  'the next stay names no stay');
select t.refused(t.w(jsonb_build_array(
  t.e('discharged', :'p3', :'er', '{"disposition":"oth","note":"to Ward"}', gen_random_uuid(), :'s5', t.latest(:'s5'), 'changes'),
  t.e('admitted', :'p3', :'er', jsonb_build_object('department_id', :'ward', 'admit_source', 'emd'), :'n4', :'n4', :'v9', 'about'))), 'not_linked',
  'the next stay is about his clinic visit, not the stay the set ends');
select t.refused(t.w(jsonb_build_array(
  t.e('discharged', :'p3', :'er', '{"disposition":"oth","note":"to Ward"}', gen_random_uuid(), :'s5', t.latest(:'s5'), 'changes'),
  t.e('admitted', :'p3', :'er', jsonb_build_object('department_id', :'er', 'admit_source', 'emd'), :'n5', :'n5', :'s5', 'about'))), 'same_department',
  'the next stay in the same department: a bed change is a Move');
select t.refused(t.w(jsonb_build_array(
  t.e('discharged', :'p3', :'er', '{"disposition":"oth","note":"to Ward"}', gen_random_uuid(), :'s5', t.latest(:'s5'), 'changes'),
  t.e('admitted', :'p3', :'er', jsonb_build_object('department_id', :'ward', 'place_id', :'bed1', 'admit_source', 'emd'), :'n6', :'n6', :'s5', 'about'))), 'bed_taken',
  'bed 1 is Ahmed''s');
select t.refused(t.w(jsonb_build_array(
  t.e('discharged', :'p3', :'er', '{"disposition":"oth","note":"to Ward"}', gen_random_uuid(), :'s5', t.latest(:'s5'), 'changes'),
  t.e('admitted', :'p3', :'er', jsonb_build_object('department_id', :'ward', 'admit_source', 'emd'), :'n7', :'n7', :'s5', 'about'),
  t.e('admitted', :'p3', :'er', jsonb_build_object('department_id', :'ward', 'admit_source', 'emd'), :'n8', :'n8', :'s5', 'about'))), 'already_admitted',
  'two stays opened in one set: each sees the other');
select t.ok(count(*) = 1 and bool_and(r ->> 'item' = :'s5' and r ->> 'department_id' = :'er'), 'nothing landed: Tarek has one stay, admitted in the ER')
  from t.rows('base.presence', :'er', jsonb_build_object('patient_id', :'p3', 'kind', 'stay', 'state', 'admitted')) r;
select t.ok(count(*) = 1 and bool_and(r ->> 'state' not in ('done', 'left', 'discharged')), 'and his clinic visit in IM is still open')
  from t.rows('base.presence', :'im', jsonb_build_object('item', :'v9')) r;

\echo '── the next stay may name the discharge written before it in the set'
select t.landed(t.w(jsonb_build_array(
  t.e('discharged', :'p3', :'er', '{"disposition":"oth","note":"to Ward"}', :'g6', :'s5', t.latest(:'s5'), 'changes'),
  t.e('admitted', :'p3', :'er', jsonb_build_object('department_id', :'ward', 'admit_source', 'emd', 'reason', 'fall'), :'s6', :'s6', :'g6', 'about'))),
  'the ward''s admission about the ER''s discharge in the same set lands');
select t.ok(count(*) = 2
  and bool_and(coalesce(case r ->> 'item'
    when :'s5' then r ->> 'state' = 'discharged'
    when :'s6' then r ->> 'state' = 'admitted' and r ->> 'department_id' = :'ward' and r ->> 'came_from' = :'s5' and r ->> 'from_department_id' = :'er' end, false)),
  'Tarek''s ER stay discharged; his ward stay came from it, from the ER')
  from t.rows('base.presence', :'er', jsonb_build_object('item', jsonb_build_array(:'s5', :'s6'))) r;

\echo '── the export links the stays: the ward''s Encounter is part of the ER''s'
create temp table res as select e -> 'resource' r from jsonb_array_elements(public.read(jsonb_build_object('shape', 'fhir',
  'patient_id', :'pt', 'department_id', :'im')) -> 'entry') e;
reset role;
select t.ok(count(*) = 1 and bool_and(r -> 'class' ->> 'code' = 'IMP' and r -> 'hospitalization' -> 'admitSource' -> 'coding' -> 0 ->> 'code' = 'emd'
  and r -> 'partOf' ->> 'reference' = 'Encounter/' || :'s1'), 'the ward stay: IMP, from the emergency department, part of the ER''s Encounter')
  from res where r ->> 'resourceType' = 'Encounter' and r ->> 'id' = :'s2';
select t.ok(count(*) = 1 and bool_and(r -> 'class' ->> 'code' = 'EMER' and r ->> 'status' = 'finished'
  and r -> 'hospitalization' -> 'dischargeDisposition' -> 'coding' -> 0 ->> 'code' = 'oth' and not (r ? 'partOf')),
  'the ER stay: EMER, finished, discharged to other, part of nothing') from res where r ->> 'resourceType' = 'Encounter' and r ->> 'id' = :'s1';
select t.report('next_stay', (r ->> 'resourceType') || '/' || coalesce(r ->> 'id', 'null') || ': ' || q) from res, unnest(core.fhir_problems(r)) q;
select t.ok(true, 'the export is valid R4');

\echo '── rebuild = live'
select t.ok(r = '[]'::jsonb, 'rebuild = live after the passes: ' || left(r::text, 300)) from core.rebuild_check() r;
