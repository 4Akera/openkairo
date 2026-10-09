-- the vaccines pack (spec §5.7, Q25, Q26): a dose is the base's given extended by the pack's words, written by whoever works where the
-- department ticks the pack (everyday: the base's Nurse), kept in its table (a card's copy at the card's date; not given with why); its
-- line; FHIR an Immunization beside the base's MedicationAdministration; the Vaccination room from its setup (its own list in place of
-- the queue); the vaccinator built on Nurse, who checks a walk-in in; the national rows written only by the import's action; off, it
-- takes no new dose
\set im   '00000000-0000-0000-0000-0000000000d1'
\set ward '00000000-0000-0000-0000-0000000000d6'
\set room '00000000-0000-0000-0000-0000000000e9'
\set pt   '00000000-0000-0000-0000-0000000000f1'
\set nurse '11111111-0000-0000-0000-0000000000b3'
\set vax  '11111111-0000-0000-0000-0000000000be'
\set ow   '11111111-0000-0000-0000-0000000000b9'
select t.fixture();
select t.as(:'ow');
select public.write_setting(jsonb_build_object('key', 'organization.packs_used', 'data', jsonb_build_object('packs',
  (select coalesce(s.data -> 'packs', '[]') from core.settings s where s.key = 'organization.packs_used' order by s.recorded_at desc limit 1) || '["vaccines"]'::jsonb))) ->> 'key' as on;
select public.write_setting(jsonb_build_object('key', 'department.packs', 'owner_id', :'im', 'data', '{"packs":["vaccines"]}'::jsonb)) ->> 'key' as ticked;
select public.setup(jsonb_build_object('setup', 'vaccines.room', 'department_id', :'room', 'name', 'Vaccination room', 'apply', true)) is not null as made;
select public.save('user', jsonb_build_object('id', '00000000-0000-0000-0000-0000000000be', 'name', 'Vaccinator', 'login_id', :'vax', 'holdings', jsonb_build_array(
  jsonb_build_object('role_id', '00000000-0000-0000-0000-00000000e0a1', 'department_id', :'room')))) ->> 'id' as vaccinator;
create function pg_temp.dose(p_dept uuid, p_data jsonb, p_id uuid default null) returns jsonb language sql as $$
  select t.e('vaccines.dose', '00000000-0000-0000-0000-0000000000f1', p_dept, jsonb_build_object('status', 'completed',
    'drug', '{"text":"MMR","codings":[{"system":"vaccines.cvx","code":"03","display":"MMR"}]}'::jsonb, 'route', 'sc') || p_data, p_id)
$$;

\echo '── the room from its setup: its own list in place of the queue; ticks the pack; its optional rows'
select t.ok((select x.screens -> 'screens' from core.setups x where x.key = 'vaccines.room') = '["vaccines.room"]',
  'the Vaccination room opens on its own list');
select t.ok(core.department_uses('00000000-0000-0000-0000-0000000000a1', :'room', 'vaccines'), 'it ticks vaccines');
select t.ok(jsonb_array_length((select k.shape -> 'properties' -> 'rows' -> 'default' from core.setting_keys k where k.key = 'vaccines.optional')) >= 8, 'the optional rows a clinic offers, the setting''s default');
select t.ok((select s.replaces from core.screens s where s.key = 'vaccines.room') = '{}', 'a tab beside the queue elsewhere: it stands in for no base screen');

\echo '── a dose: written by a nurse where the department ticks the pack (everyday), refused where it does not'
select t.as(:'nurse');
select t.landed(t.w(jsonb_build_array(pg_temp.dose(:'im', '{"site":"right arm","lot":"4K21M07","expiry":"03/2027","vaccines":{"vaccine":"mmr","dose":1,"source":"here"}}', '00000000-0000-0000-0000-00000000ee01'))), 'MMR 1 given in IM');
select t.refused(t.w(jsonb_build_array(pg_temp.dose(:'ward', '{"vaccines":{"vaccine":"mmr","dose":1}}'))), 'not_allowed', 'the ward does not tick vaccines');
select t.landed(t.w(jsonb_build_array(pg_temp.dose(:'im', '{"vaccines":{"vaccine":"opv","dose":1,"source":"card","given_on":"2025-11-09"}}', '00000000-0000-0000-0000-00000000ee02'))), 'OPV 1 from the card');
select t.landed(t.w(jsonb_build_array(pg_temp.dose(:'im', '{"status":"not-done","reason":"fever 39.2 °C","vaccines":{"vaccine":"opv","dose":5}}', '00000000-0000-0000-0000-00000000ee03'))), 'OPV 5 not given');
select t.refused(t.w(jsonb_build_array(pg_temp.dose(:'im', '{"vaccines":{"dose":1}}'))), 'bad_shape', 'a dose names its vaccine');
select t.ok((select r ->> 'given_at' from t.rows('vaccines.doses', :'im', jsonb_build_object('item', '00000000-0000-0000-0000-00000000ee02')) r)::date = '2025-11-09', 'a card''s copy at the card''s date');
select t.ok((select r ->> 'status' || ' · ' || (r ->> 'reason') from t.rows('vaccines.doses', :'im', jsonb_build_object('item', '00000000-0000-0000-0000-00000000ee03')) r) = 'not-done · fever 39.2 °C', 'not given, and why');
select t.ok((select r ->> 'vaccine' || (r ->> 'dose') || (r ->> 'source') from t.rows('vaccines.doses', :'im', jsonb_build_object('item', '00000000-0000-0000-0000-00000000ee01')) r) = 'mmr1here', 'its table');
reset role;
select t.ok((select vaccines.dose_line(to_jsonb(e)) from core.entries e where e.id = '00000000-0000-0000-0000-00000000ee01') = 'Vaccine · MMR dose 1 · lot 4K21M07 · exp 03/2027 · right arm, under the skin', 'its line');
select t.ok((select vaccines.dose_line(to_jsonb(e)) from core.entries e where e.id = '00000000-0000-0000-0000-00000000ee03') = 'Not given · MMR dose 5 · fever 39.2 °C', 'a dose not given');
set role authenticated;

\echo '── FHIR: an Immunization beside the base''s MedicationAdministration'
select t.as(:'ow');
create temp table bundle as select public.read(jsonb_build_object('shape', 'fhir', 'patient_id', :'pt', 'department_id', :'im')) b;
select t.ok((select e -> 'resource' -> 'protocolApplied' -> 0 ->> 'doseNumberPositiveInt' from bundle, jsonb_array_elements(b -> 'entry') e
  where e -> 'resource' ->> 'resourceType' = 'Immunization' and e -> 'resource' ->> 'lotNumber' = '4K21M07') = '1', 'MMR 1 as an Immunization with its dose number');
select t.ok(exists (select 1 from bundle, jsonb_array_elements(b -> 'entry') e where e -> 'resource' ->> 'resourceType' = 'MedicationAdministration'), 'the base''s mapping stays');
select t.ok((select e -> 'resource' ->> 'occurrenceDateTime' || ' ' || (e -> 'resource' ->> 'primarySource') from bundle, jsonb_array_elements(b -> 'entry') e
  where e -> 'resource' ->> 'resourceType' = 'Immunization' and e -> 'resource' -> 'vaccineCode' ->> 'text' = 'MMR' and e -> 'resource' ->> 'occurrenceDateTime' like '2025%') = '2025-11-09 false', 'a card''s copy: its date, not a primary source');
select t.ok((select e -> 'resource' ->> 'status' from bundle, jsonb_array_elements(b -> 'entry') e
  where e -> 'resource' ->> 'resourceType' = 'Immunization' and e -> 'resource' -> 'statusReason' ->> 'text' = 'fever 39.2 °C') = 'not-done', 'not given: not-done with its reason');

\echo '── the vaccinator: built on Nurse; checks a walk-in in, registers, gives, finishes'
reset role;
select t.ok(core.may('00000000-0000-0000-0000-0000000000be', 'write:vaccines.dose', :'room') and core.may('00000000-0000-0000-0000-0000000000be', 'write:checked_in', :'room')
  and core.may('00000000-0000-0000-0000-0000000000be', 'manage:patients', :'room') and core.may('00000000-0000-0000-0000-0000000000be', 'write:done', :'room'), 'the vaccinator''s own');
select t.ok(core.may('00000000-0000-0000-0000-0000000000be', 'write:vitals', :'room'), 'built on Nurse');
select t.ok(not core.may('00000000-0000-0000-0000-0000000000be', 'import:vaccines.national', null), 'the national rows are the import''s, never typed');
set role authenticated;
select t.as(:'vax');
select t.landed(t.w(jsonb_build_array(t.e('checked_in', :'pt', :'room', '{"reason":"vaccines"}', '00000000-0000-0000-0000-00000000ee10', '00000000-0000-0000-0000-00000000ee10'))), 'a walk-in checked in at the room');

\echo '── off: no new dose'
select t.as(:'ow');
select public.write_setting('{"key":"organization.packs_used","data":{"packs":["pharmacy"]}}') ->> 'key' as off;
select t.as(:'nurse');
select t.refused(t.w(jsonb_build_array(pg_temp.dose(:'im', '{"vaccines":{"vaccine":"mmr","dose":2}}'))), 'pack_off', 'vaccines off');
