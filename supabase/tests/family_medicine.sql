-- the family medicine pack (spec §5.7, Q49): Family medicine from its setup (its queue and Families; the checks by age and sex; New
-- patient asks for a file); the household as the pack's own table, written through its door — started with the next number by the unit,
-- joined (one file a patient), read by whoever finds patients, changed only by whoever registers them (manage:patients), and only where
-- the department ticks the pack; Erase reaches a member's row
\set im   '00000000-0000-0000-0000-0000000000d1'
\set desk '00000000-0000-0000-0000-0000000000d4'
\set fm   '00000000-0000-0000-0000-0000000000eb'
\set pt   '00000000-0000-0000-0000-0000000000f1'
\set dr   '11111111-0000-0000-0000-0000000000b1'
\set rec  '11111111-0000-0000-0000-0000000000b4'
\set ow   '11111111-0000-0000-0000-0000000000b9'
select t.fixture();
select t.as(:'ow');
select public.write_setting(jsonb_build_object('key', 'organization.packs_used', 'data', jsonb_build_object('packs',
  (select coalesce(s.data -> 'packs', '[]') from core.settings s where s.key = 'organization.packs_used' order by s.recorded_at desc limit 1) || '["family_medicine"]'::jsonb))) ->> 'key' as on;
select public.setup(jsonb_build_object('setup', 'family_medicine.medicine', 'department_id', :'fm', 'name', 'Family medicine', 'apply', true)) is not null as made;
select public.write_setting(jsonb_build_object('key', 'department.packs', 'owner_id', :'desk', 'data', '{"packs":["family_medicine"]}'::jsonb)) ->> 'key' as desk_ticks;
select public.save_patient(jsonb_build_object('department_id', :'desk', 'patient', jsonb_build_object('id', '00000000-0000-0000-0000-0000000000f7', 'given', jsonb_build_array('Basma'),
  'family', 'Hegazy', 'gender', 'female', 'birth_date', '1992-06-01'))) is not null as basma;

\echo '── Family medicine from its setup'
select t.ok((select x.screens -> 'screens' from core.setups x where x.key = 'family_medicine.medicine') = '["base.queue","family_medicine.files"]',
  'its queue and Families');
select t.ok(jsonb_array_length((select k.shape -> 'properties' -> 'checks' -> 'default' from core.setting_keys k where k.key = 'family_medicine.checks')) = 8, 'the checks by age and sex, the setting''s default');
select t.ok((select (k.shape -> 'properties' -> 'ask_at_new_patient' ->> 'default')::boolean from core.setting_keys k where k.key = 'family_medicine.files'), 'New patient asks for a file, by default');

\echo '── the desk starts a file and joins a wife to it; numbers by the unit'
select t.as(:'rec');
create temp table f1 as select public.pack_op(jsonb_build_object('op', 'family_medicine.start', 'department_id', :'desk', 'args', jsonb_build_object('patient_id', :'pt',
  'address', 'Al-Gomhoria St, Mit Ghamr', 'phone', '010 2214 7781'))) r;
select t.ok((select r -> 'file' ->> 'number' from f1) = '1', 'the first file is number 1');
select t.ok((select r -> 'file' -> 'members' -> 0 ->> 'relation' from f1) = 'head', 'its head');
select t.ok((public.pack_op(jsonb_build_object('op', 'family_medicine.join', 'department_id', :'desk', 'args', jsonb_build_object('household_id', (select r -> 'file' ->> 'id' from f1),
  'patient_id', '00000000-0000-0000-0000-0000000000f7', 'relation', 'wife'))) -> 'file' -> 'members' -> 1 ->> 'relation') = 'wife', 'the wife joins');
select t.refuses($$select public.pack_op(jsonb_build_object('op', 'family_medicine.start', 'department_id', '00000000-0000-0000-0000-0000000000d4', 'args', jsonb_build_object('patient_id', '00000000-0000-0000-0000-0000000000f1')))$$, 'already_in_a_file');
select t.ok((select count(*) from jsonb_array_elements((public.pack_op(jsonb_build_object('op', 'family_medicine.find', 'department_id', :'desk', 'args', '{"q":"2214 7781"}')) -> 'files'))) = 1, 'found by the phone');
select t.ok((public.pack_op(jsonb_build_object('op', 'family_medicine.of_patient', 'department_id', :'desk', 'args', jsonb_build_object('patient_id', '00000000-0000-0000-0000-0000000000f7'))) -> 'file' ->> 'number') = '1', 'her file');

\echo '── who may: a doctor reads a file in Family medicine, changes none; nowhere the pack is not ticked'
select t.as(:'ow');
select public.save('user', jsonb_build_object('id', '00000000-0000-0000-0000-0000000000b1', 'holdings', jsonb_build_array(
  jsonb_build_object('role_id', '00000000-0000-0000-0000-00000000c002', 'department_id', :'im'), jsonb_build_object('role_id', '00000000-0000-0000-0000-00000000c002', 'department_id', :'fm')))) ->> 'id' as dr_in_fm;
select t.as(:'dr');
select t.ok((public.pack_op(jsonb_build_object('op', 'family_medicine.of_patient', 'department_id', :'fm', 'args', jsonb_build_object('patient_id', :'pt'))) -> 'file' ->> 'number') = '1', 'the doctor reads it');
select t.refuses(format($q$select public.pack_op(jsonb_build_object('op', 'family_medicine.leave', 'department_id', %L, 'args', jsonb_build_object('patient_id', %L)))$q$, :'fm', :'pt'), 'not_allowed');
select t.refuses(format($q$select public.pack_op(jsonb_build_object('op', 'family_medicine.of_patient', 'department_id', %L, 'args', jsonb_build_object('patient_id', %L)))$q$, :'im', :'pt'), 'not_used_here');
