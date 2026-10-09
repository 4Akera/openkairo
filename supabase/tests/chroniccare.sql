-- the chronic care pack (spec §5.7, Q28–Q30): the Diabetes clinic from its setup (its queue and the Chronic care list; the clinic's
-- conditions); a patient's own target — the pack's one type, written by a doctor where the department ticks the pack (everyday), kept in
-- its table, its line; the yearly review's coded observations kept from the base's (a listener) for the list, a check done by its code;
-- its tables read only where the list is; off, no new target
\set im   '00000000-0000-0000-0000-0000000000d1'
\set ward '00000000-0000-0000-0000-0000000000d6'
\set dmc  '00000000-0000-0000-0000-0000000000ea'
\set pt   '00000000-0000-0000-0000-0000000000f1'
\set dr   '11111111-0000-0000-0000-0000000000b1'
\set nurse '11111111-0000-0000-0000-0000000000b3'
\set ow   '11111111-0000-0000-0000-0000000000b9'
select t.fixture();
select t.as(:'ow');
select public.write_setting(jsonb_build_object('key', 'organization.packs_used', 'data', jsonb_build_object('packs',
  (select coalesce(s.data -> 'packs', '[]') from core.settings s where s.key = 'organization.packs_used' order by s.recorded_at desc limit 1) || '["chroniccare"]'::jsonb))) ->> 'key' as on;
select public.write_setting(jsonb_build_object('key', 'department.packs', 'owner_id', :'im', 'data', '{"packs":["chroniccare"]}'::jsonb)) ->> 'key' as ticked;
select public.setup(jsonb_build_object('setup', 'chroniccare.clinic', 'department_id', :'dmc', 'name', 'Diabetes clinic', 'apply', true)) is not null as made;

\echo '── the Diabetes clinic from its setup; the clinic''s conditions, their targets and checks'
select t.ok((select x.screens -> 'screens' from core.setups x where x.key = 'chroniccare.clinic') = '["base.queue","chroniccare.list"]',
  'its queue and the Chronic care list');
select t.ok((select jsonb_agg(c ->> 'key') from core.setting_keys k, jsonb_array_elements(k.shape -> 'properties' -> 'conditions' -> 'default') c where k.key = 'chroniccare.conditions')
  = '["dm","htn","ckd","hf","asthma","copd"]', 'six conditions, once for the clinic: the setting''s default');

\echo '── a patient''s own target: the doctor writes it where the department ticks the pack'
select t.as(:'dr');
select t.landed(t.w(jsonb_build_array(t.e('chroniccare.target', :'pt', :'im', '{"condition":"htn","measure":"bp","op":"<","value":150,"value2":90,"reason":"81, falls","status":"active"}',
  '00000000-0000-0000-0000-00000000ec01'))), 'an own target');
reset role;
select t.ok((select chroniccare.target_line(to_jsonb(e)) from core.entries e where e.id = '00000000-0000-0000-0000-00000000ec01') = 'Own target · BP < 150/90 · htn · 81, falls', 'its line');
set role authenticated;
select t.ok((select r ->> 'value' || '/' || (r ->> 'value2') || ' ' || (r ->> 'reason') from t.rows('chroniccare.targets', :'im', jsonb_build_object('patient_id', :'pt')) r) = '150/90 81, falls', 'its table');
select t.refused(t.w(jsonb_build_array(t.e('chroniccare.target', :'pt', :'im', '{"condition":"htn","measure":"bp","op":"=","value":150}'))), 'bad_shape', 'a sign it does not know');
select t.as(:'nurse');
select t.refused(t.w(jsonb_build_array(t.e('chroniccare.target', :'pt', :'ward', '{"condition":"htn","measure":"bp","op":"<","value":140}'))), 'not_allowed', 'the ward does not tick the pack');

\echo '── the yearly review: the feet as the base''s observation, coded by the pack, kept for the list'
select t.as(:'dr');
select t.landed(t.w(jsonb_build_array(t.e('observation', :'pt', :'im', '{"code":{"text":"Feet","codings":[{"system":"chroniccare.check","code":"feet","display":"Feet"}]},"value":{"text":"moderate risk"},"note":"monofilament: not felt somewhere, left big toe"}',
  '00000000-0000-0000-0000-00000000ec02'))), 'the feet reviewed');
reset role;
select core.drain() as drained;
set role authenticated;
select t.as(:'dr');
select t.ok((select r ->> 'text' from t.rows('chroniccare.checks', :'im', jsonb_build_object('patient_id', :'pt')) r where r -> 'codes' ? 'chroniccare.check:feet') = 'moderate risk', 'kept by its code, with what it found');

\echo '── off: no new target'
select t.as(:'ow');
select public.write_setting('{"key":"organization.packs_used","data":{"packs":["pharmacy"]}}') ->> 'key' as off;
select t.as(:'dr');
select t.refused(t.w(jsonb_build_array(t.e('chroniccare.target', :'pt', :'im', '{"condition":"dm","measure":"hba1c","op":"<","value":8}'))), 'pack_off', 'chronic care off');
