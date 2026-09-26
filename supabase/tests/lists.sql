-- the lists follow the latest version (ported from composer): a change of dose is the next version and carries what it says; a problem
-- update can clear its note and onset; stopping a medicine keeps it on the list as stopped; crossing out takes it off; rebuild agrees
\set im   '00000000-0000-0000-0000-0000000000d1'
\set pt   '00000000-0000-0000-0000-0000000000f1'
\set dr   '11111111-0000-0000-0000-0000000000b1'
select t.fixture();
set role authenticated;
select t.as(:'dr');

create or replace function pg_temp.list_entry(p_item uuid) returns jsonb language sql as $$
  select t.record('00000000-0000-0000-0000-0000000000f1', '00000000-0000-0000-0000-0000000000d1', '{"types":["medication","problem","allergy"],"limit":200}') -> 'tables' -> 'base.lists' -> 'entries'
    -> (select r ->> 'entry_id' from jsonb_array_elements(t.record('00000000-0000-0000-0000-0000000000f1', '00000000-0000-0000-0000-0000000000d1') -> 'tables' -> 'base.lists' -> 'rows') r
         where (r ->> 'item')::uuid = p_item)
$$;

\echo '── a PRN medicine, then a change that turns PRN off and clears the instructions'
select t.landed(t.w(t.e('medication', :'pt', :'im', '{"basis":"prescribed","drug":{"text":"Paracetamol","codings":[{"system":"atc","code":"N02BE01"}]},"dosage":{"dose":{"value":"1","unit":"g","ucum":"g"},"timing":{"code":"PRN"},"as_needed":true,"as_needed_for":"pain","route":"oral"},"instructions":"after food","status":"active"}',
  '00000000-0000-0000-0000-0000000000e1')), 'paracetamol PRN');
select t.landed(t.w(t.e('medication', :'pt', :'im', '{"basis":"prescribed","drug":{"text":"Paracetamol","codings":[{"system":"atc","code":"N02BE01"}]},"dosage":{"dose":{"value":"1","unit":"g","ucum":"g"},"timing":{"code":"QDS","frequency":4,"period":1,"period_unit":"d"},"route":"oral"},"status":"active"}',
  '00000000-0000-0000-0000-0000000000e2', null, '00000000-0000-0000-0000-0000000000e1', 'changes')), 'a change: QDS, no PRN, no instructions');
select t.ok(e ->> 'id' = '00000000-0000-0000-0000-0000000000e2' and not (e -> 'data' -> 'dosage' ? 'as_needed') and not (e -> 'data' ? 'instructions') and e -> 'data' -> 'dosage' -> 'timing' ->> 'code' = 'QDS',
  'the list holds the change: PRN and instructions cleared') from pg_temp.list_entry('00000000-0000-0000-0000-0000000000e1') e;
select t.ok((e ->> 'item_version')::int = 2 and e ->> 'line' = 'Paracetamol 1 g QDS', 'version 2: ' || (e ->> 'line')) from pg_temp.list_entry('00000000-0000-0000-0000-0000000000e1') e;

\echo '── a change naming instructions carries them; a later change without them has none (a change is the whole medicine again)'
select t.landed(t.w(t.e('medication', :'pt', :'im', '{"basis":"prescribed","drug":{"text":"Paracetamol"},"dosage":{"dose":{"value":"500","unit":"mg","ucum":"mg"},"timing":{"code":"QDS"}},"instructions":"with water","status":"active"}',
  '00000000-0000-0000-0000-0000000000e3', null, '00000000-0000-0000-0000-0000000000e2', 'changes')), 'with water');
select t.ok(e -> 'data' ->> 'instructions' = 'with water', 'instructions carried') from pg_temp.list_entry('00000000-0000-0000-0000-0000000000e1') e;
select t.refused(t.w(t.e('medication', :'pt', :'im', '{"basis":"prescribed","drug":{"text":"Paracetamol"},"status":"active"}', null, null, '00000000-0000-0000-0000-0000000000e2', 'changes')),
  'changed_since_opened', 'a change of an older version');

\echo '── stopping keeps it on the list as stopped; crossing out takes it off'
select t.landed(t.w(t.e('medication', :'pt', :'im', '{"basis":"prescribed","drug":{"text":"Paracetamol"},"status":"stopped","status_reason":"no longer needed"}',
  '00000000-0000-0000-0000-0000000000e4', null, '00000000-0000-0000-0000-0000000000e3', 'changes')), 'stopped');
select t.ok(r ->> 'status' = 'stopped', 'on the list as stopped') from jsonb_array_elements(t.record(:'pt', :'im') -> 'tables' -> 'base.lists' -> 'rows') r where r ->> 'item' = '00000000-0000-0000-0000-0000000000e1';
select t.landed(t.w(t.e('medication', :'pt', :'im', '{"basis":"reported","drug":{"text":"Omeprazole"},"status":"active"}', '00000000-0000-0000-0000-0000000000e5')), 'a medicine the patient reports');
select t.landed(t.w(t.e('crossed_out', :'pt', :'im', '{"reason":"wrong_patient"}', null, null, null, null, '00000000-0000-0000-0000-0000000000e5')), 'crossed out');
select t.ok(not exists (select 1 from jsonb_array_elements(t.record(:'pt', :'im') -> 'tables' -> 'base.lists' -> 'rows') r where r ->> 'item' = '00000000-0000-0000-0000-0000000000e5'), 'off the list');
select t.refused(t.w(t.e('crossed_out', :'pt', :'im', '{"reason":"typo"}', null, null, null, null, '00000000-0000-0000-0000-0000000000e5')), 'changed_since_opened', 'crossing out twice');

\echo '── a problem with an onset and a note; an update keeps what it sends and clears what it leaves out'
select t.landed(t.w(t.e('problem', :'pt', :'im', '{"concept":{"text":"Hypertension","codings":[{"system":"icd10","code":"I10"}]},"clinical_status":"active","verification":"confirmed","onset":{"value":"2019","precision":"year"},"note":"poorly controlled"}',
  '00000000-0000-0000-0000-0000000000e6')), 'hypertension');
select t.warned(t.w(t.e('problem', :'pt', :'im', '{"concept":{"text":"Hypertension","codings":[{"system":"icd10","code":"I10"}]},"clinical_status":"active","verification":"confirmed"}')), 'already_on_list');
select t.landed(t.w(t.e('problem', :'pt', :'im', '{"concept":{"text":"Hypertension","codings":[{"system":"icd10","code":"I10"}]},"clinical_status":"active","verification":"provisional","onset":{"value":"2019","precision":"year"},"note":"poorly controlled"}',
  '00000000-0000-0000-0000-0000000000e7', null, '00000000-0000-0000-0000-0000000000e6', 'changes')), 'made provisional');
select t.ok(e -> 'data' ->> 'note' = 'poorly controlled' and e -> 'data' -> 'onset' ->> 'value' = '2019' and e ->> 'line' = 'Hypertension (?) (I10) · since 2019', 'an update keeps what it sends: ' || (e ->> 'line'))
  from pg_temp.list_entry('00000000-0000-0000-0000-0000000000e6') e;
select t.landed(t.w(t.e('problem', :'pt', :'im', '{"concept":{"text":"Hypertension","codings":[{"system":"icd10","code":"I10"}]},"clinical_status":"active","verification":"provisional"}',
  '00000000-0000-0000-0000-0000000000e8', null, '00000000-0000-0000-0000-0000000000e7', 'changes')), 'onset and note cleared');
select t.ok(not (e -> 'data' ? 'note') and not (e -> 'data' ? 'onset'), 'cleared') from pg_temp.list_entry('00000000-0000-0000-0000-0000000000e6') e;
select t.landed(t.w(t.e('problem', :'pt', :'im', '{"concept":{"text":"Hypertension"},"clinical_status":"resolved","verification":"confirmed"}',
  null, null, '00000000-0000-0000-0000-0000000000e8', 'changes')), 'resolved');
select t.ok(r ->> 'status' = 'resolved', 'resolved on the list') from jsonb_array_elements(t.record(:'pt', :'im') -> 'tables' -> 'base.lists' -> 'rows') r where r ->> 'item' = '00000000-0000-0000-0000-0000000000e6';
select t.refused(t.w(t.e('problem', :'pt', :'im', '{"concept":{"text":"x"},"clinical_status":"active","verification":"confirmed"}', null, null, '00000000-0000-0000-0000-0000000000e1', 'changes')),
  'wrong_resource', 'a problem cannot continue a medicine');

\echo '── the lists rebuild to the same rows'
reset role;
select t.ok(core.rebuild_check('00000000-0000-0000-0000-0000000000a1') = '[]'::jsonb, 'rebuild = live');
