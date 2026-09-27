-- the spine and the writer (spec §2, §3.9): insert-only, one set all or nothing, retries, items and versions, corrections, findings, live and late
-- expects: entries are permanent, entries are permanent, sets are permanent
\set im   '00000000-0000-0000-0000-0000000000d1'
\set labd '00000000-0000-0000-0000-0000000000d2'
\set pt   '00000000-0000-0000-0000-0000000000f1'
\set cbc  '00000000-0000-0000-0000-0000000000c1'
\set dr   '11111111-0000-0000-0000-0000000000b1'
\set lt   '11111111-0000-0000-0000-0000000000b2'
select t.fixture();
set role authenticated;
select t.as(:'dr');

\echo '── 1. an order to the lab'
select t.landed(t.w(t.e('order', :'pt', :'im', jsonb_build_object('service', jsonb_build_object('id', :'cbc', 'code', 'cbc', 'name', 'Complete blood count'),
  'department_id', :'labd', 'priority', 'routine', 'status', 'active'), '00000000-0000-0000-0000-0000000000e1'), '00000000-0000-0000-0000-00000000aa01'), 'an order lands');
select t.ok(r ->> 'status' = 'active' and r ->> 'to_department_id' = :'labd' and r ->> 'requester_id' = '00000000-0000-0000-0000-0000000000b1', 'the order is open, to the lab, by its requester')
  from t.rows('base.orders', :'im', jsonb_build_object('item', '00000000-0000-0000-0000-0000000000e1')) r;

\echo '── 2. a retried Done: the same outcome, nothing new; the same set id with other content is refused'
select t.ok((r ->> 'repeat')::boolean and r ->> 'outcome' = 'landed', 'the retry returns the stored outcome') from t.w(t.e('order', :'pt', :'im', jsonb_build_object('service', jsonb_build_object('id', :'cbc', 'code', 'cbc', 'name', 'Complete blood count'),
  'department_id', :'labd', 'priority', 'routine', 'status', 'active'), '00000000-0000-0000-0000-0000000000e1'), '00000000-0000-0000-0000-00000000aa01') r;
select t.refused(t.w(t.e('note', :'pt', :'im', '{"text":"other"}', '00000000-0000-0000-0000-0000000000e9'), '00000000-0000-0000-0000-00000000aa01'), 'set_changed', 'the same set id with other entries');
reset role;
select t.ok(count(*) = 1, 'one entry stored') from core.entries where organization_id = '00000000-0000-0000-0000-0000000000a1';
set role authenticated;

\echo '── 3. the lab accepts it, then an analyser result with a low haemoglobin'
select t.as(:'lt');
select t.landed(t.w(t.e('step', :'pt', :'labd', '{"status":"accepted"}', '00000000-0000-0000-0000-0000000000e2', null, '00000000-0000-0000-0000-0000000000e1', 'answers')), 'the lab accepts');
select t.landed(t.w(t.e('result', :'pt', :'labd', jsonb_build_object('status', 'final', 'service', jsonb_build_object('id', :'cbc', 'name', 'CBC'), 'analytes', jsonb_build_array(
    jsonb_build_object('key', 'hb', 'name', 'Hb', 'code', jsonb_build_object('system', 'loinc', 'code', '718-7'), 'value', jsonb_build_object('value', '9.2', 'unit', 'g/dL', 'ucum', 'g/dL'),
      'interpretation', 'L', 'range', jsonb_build_object('low', jsonb_build_object('value', '12', 'ucum', 'g/dL'), 'high', jsonb_build_object('value', '16', 'ucum', 'g/dL'))))),
  '00000000-0000-0000-0000-0000000000e3', null, '00000000-0000-0000-0000-0000000000e1', 'answers', null,
  '{"source_system":"analyser","source_id":"msg-1"}'), '00000000-0000-0000-0000-00000000aa03'), 'the result lands');
select t.as(:'dr');
select t.ok(r ->> 'status' = 'completed' and (r ->> 'final')::boolean and jsonb_array_length(r -> 'answers') = 1, 'the order is completed by its final answer')
  from t.rows('base.orders', :'im', jsonb_build_object('item', '00000000-0000-0000-0000-0000000000e1')) r;
select t.ok(r ->> 'value' = '9.2' and r ->> 'interpretation' = 'L' and r ->> 'code' = 'loinc:718-7', 'base.values holds the Hb, low')
  from jsonb_array_elements(t.record(:'pt', :'im') -> 'tables' -> 'base.values' -> 'rows') r;
select t.ok(e ->> 'line' = 'CBC · Hb 9.2 ↓', 'the result''s line: ' || (e ->> 'line')) from jsonb_array_elements(t.record(:'pt', :'im') -> 'entries') e where e ->> 'id' = '00000000-0000-0000-0000-0000000000e3';

\echo '── 4. the same analyser message again lands once'
select t.as(:'lt');
select t.ok(r ->> 'outcome' = 'landed' and (r ->> 'repeat')::boolean and r -> 'entries' -> 0 ->> 'id' = '00000000-0000-0000-0000-0000000000e3', 'a resent message returns the stored entry')
  from t.w(t.e('result', :'pt', :'labd', '{"status":"final","conclusion":"dup"}', null, null, null, null, null, '{"source_system":"analyser","source_id":"msg-1"}')) r;

\echo '── 5. permanence (three refusals expected)'
reset role;
update core.entries set data = '{}' where id = '00000000-0000-0000-0000-0000000000e3';
delete from core.entries where id = '00000000-0000-0000-0000-0000000000e3';
update core.sets set hash = 'x';
set role authenticated;

\echo '── 6. a correction is the next version of the item; values follow the latest'
select t.as(:'lt');
select t.ok(r ->> 'outcome' = 'landed' and r -> 'entries' -> 0 ->> 'item' = '00000000-0000-0000-0000-0000000000e3' and (r -> 'entries' -> 0 ->> 'item_version')::int = 2, 'the correction continues the item as version 2')
  from t.w(t.e('result', :'pt', :'labd', jsonb_build_object('status', 'corrected', 'analytes', jsonb_build_array(jsonb_build_object('key', 'hb', 'name', 'Hb',
    'code', jsonb_build_object('system', 'loinc', 'code', '718-7'), 'value', jsonb_build_object('value', '9.4', 'unit', 'g/dL', 'ucum', 'g/dL'), 'interpretation', 'L'))),
    '00000000-0000-0000-0000-0000000000e4', null, null, null, '00000000-0000-0000-0000-0000000000e3')) r;
select t.as(:'dr');
select t.ok(count(*) = 1 and min(r ->> 'value') = '9.4', 'one value, the corrected one') from jsonb_array_elements(t.record(:'pt', :'im') -> 'tables' -> 'base.values' -> 'rows') r;

\echo '── 7. a second correction of the first version is stale; the doctor cannot cross out an answered order'
select t.as(:'lt');
select t.refused(t.w(t.e('result', :'pt', :'labd', '{"status":"corrected","conclusion":"again"}', null, null, null, null, '00000000-0000-0000-0000-0000000000e3')), 'changed_since_opened', 'a stale correction');
select t.as(:'dr');
select t.refused(t.w(t.e('crossed_out', :'pt', :'im', '{"reason":"typo"}', null, null, null, null, '00000000-0000-0000-0000-0000000000e1')), 'has_answers', 'an answered order stays');

\echo '── 8. the clock: the order of writes; clinical time never after recording'
reset role;
select t.ok(bool_and(occurred_at <= recorded_at), 'occurred_at ≤ recorded_at') from core.entries where organization_id = '00000000-0000-0000-0000-0000000000a1';
select t.ok((select array_agg(id order by recorded_at, id) from core.entries where organization_id = '00000000-0000-0000-0000-0000000000a1' and patient_id = :'pt')
  = array['00000000-0000-0000-0000-0000000000e1', '00000000-0000-0000-0000-0000000000e2', '00000000-0000-0000-0000-0000000000e3', '00000000-0000-0000-0000-0000000000e4']::uuid[],
  '(recorded_at, id) is the order the sets landed');
set role authenticated;

\echo '── 9. generic refusals: empty set, unknown type, bad shape, two patients, unknown system, a future time, nested'
select t.as(:'dr');
select t.ok(public.write('{"set_id":"00000000-0000-0000-0000-00000000aa09","entries":[]}') ->> 'outcome' = 'refused', 'an empty set');
select t.refused(t.w(t.e('nothing', :'pt', :'im', '{}')), 'unknown_type');
select t.refused(t.w(t.e('note', :'pt', :'im', '{"words":"x"}')), 'bad_shape');
select t.refused(t.w(t.e('note', :'pt', :'im', '{"text":"x","kind":"progress"}', null, null, null, null, null, '{"occurred_at":"2099-01-01T00:00:00Z"}')), 'in_the_future');
reset role;
select t.as('11111111-0000-0000-0000-0000000000b4');
select (public.save_patient(jsonb_build_object('department_id', '00000000-0000-0000-0000-0000000000d4', 'patient', jsonb_build_object('id', '00000000-0000-0000-0000-0000000000f2',
  'given', jsonb_build_array('Omar'), 'family', 'Zaki', 'gender', 'male'))) -> 'patient' ->> 'full_name') as second_patient;
set role authenticated;
select t.as(:'dr');
select t.refused(t.w(jsonb_build_array(t.e('note', :'pt', :'im', '{"text":"a"}'), t.e('note', '00000000-0000-0000-0000-0000000000f2', :'im', '{"text":"b"}'))), 'two_patients');
select t.refused(t.w(t.e('problem', :'pt', :'im', '{"concept":{"text":"x","codings":[{"system":"madeup","code":"1"}]},"clinical_status":"active","verification":"confirmed"}')), 'unknown_system');
select t.ok(t.try($$select set_config('core.in_writer', 'on', false); select public.write('{"set_id":"00000000-0000-0000-0000-00000000aa0a","entries":[]}')$$) like '%nested_write%', 'a nested write is refused');
select set_config('core.in_writer', '', false);

\echo '── 10. findings: an unknown code and a non-UCUM unit land flagged; a refusal in a late set lands flagged'
select t.flagged(t.w(t.e('problem', :'pt', :'im', '{"concept":{"text":"Madeup","codings":[{"system":"icd10","code":"ZZZ.9"}]},"clinical_status":"active","verification":"confirmed"}')), 'code_unknown');
select t.flagged(t.w(t.e('vitals', :'pt', :'im', '{"weight":{"value":"80","unit":"stone","ucum":"[stone_av]"}}')), 'unit_not_ucum');
select t.ok(r ->> 'outcome' = 'landed' and exists (select 1 from jsonb_array_elements(r -> 'findings') f where f ->> 'code' = 'changed_since_opened' and (f ->> 'late')::boolean),
  'a late stale correction lands flagged') from t.w(t.e('result', :'pt', :'im', '{"status":"corrected","conclusion":"offline copy"}', null, null, null, null, '00000000-0000-0000-0000-0000000000e3'),
  null, '{}', '{}', clock_timestamp() - interval '1 hour') r;
select t.ok(count(*) >= 1, 'a flag raises a review row for the entry''s department') from t.rows('base.review', :'im', '{"why":"flag"}') r;

\echo '── 11. warnings come back to the composer; confirmed, they land and are kept'
select t.landed(t.w(t.e('allergy', :'pt', :'im', '{"concept":{"text":"Penicillins","codings":[{"system":"local.allergen","code":"penicillins"}]},"clinical_status":"active","verification":"confirmed"}')), 'a penicillin allergy');
select t.warned(t.w(t.e('medication', :'pt', :'im', '{"basis":"prescribed","drug":{"text":"Amoxicillin","codings":[{"system":"atc","code":"J01CA04"}]},"status":"active"}', '00000000-0000-0000-0000-0000000000ea'), '00000000-0000-0000-0000-00000000aa0b'), 'allergy_clash', 'amoxicillin after a penicillin allergy');
select t.ok(r ->> 'outcome' = 'landed' and exists (select 1 from jsonb_array_elements(r -> 'findings') f where f ->> 'code' = 'allergy_clash' and (f ->> 'confirmed')::boolean), 'confirmed, it lands with the warning kept')
  from t.w(t.e('medication', :'pt', :'im', '{"basis":"prescribed","drug":{"text":"Amoxicillin","codings":[{"system":"atc","code":"J01CA04"}]},"status":"active"}', '00000000-0000-0000-0000-0000000000ea'),
    '00000000-0000-0000-0000-00000000aa0c', array['allergy_clash']) r;

\echo '── 12. the clock steps back: a set still records after the family''s set before it'
-- a set of the second patient dated a second ahead of the clock, as one that landed just before the clock stepped back (§2)
reset role;
insert into core.entries (organization_id, id, patient_id, type, type_version, item, item_version, data, author_id, source, department_id, occurred_at, recorded_at, set_id)
  values ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000ee', '00000000-0000-0000-0000-0000000000f2', 'note', core.type_latest('note'),
    '00000000-0000-0000-0000-0000000000ee', 1, '{"text":"before the step"}', '00000000-0000-0000-0000-0000000000b1', 'staff', :'im', clock_timestamp(), clock_timestamp() + interval '1 second', gen_random_uuid());
set role authenticated;
select t.as(:'dr');
select t.landed(t.w(t.e('note', '00000000-0000-0000-0000-0000000000f2', :'im', '{"text":"after the step"}', '00000000-0000-0000-0000-0000000000ef')), 'a note after the step');
reset role;
select t.ok((select array_agg(id order by recorded_at, id) from core.entries where organization_id = '00000000-0000-0000-0000-0000000000a1' and patient_id = '00000000-0000-0000-0000-0000000000f2')
  = array['00000000-0000-0000-0000-0000000000ee', '00000000-0000-0000-0000-0000000000ef']::uuid[], '(recorded_at, id) is still the order the sets landed');
set role authenticated;
